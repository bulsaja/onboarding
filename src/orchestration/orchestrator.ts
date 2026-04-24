import { createHash, randomUUID } from 'node:crypto';

import {
  buildExecutionKey,
  ExecutionStore,
  InMemoryExecutionStore
} from './idempotency';
import {
  ConsoleJsonLogger,
  OrchestrationEvent,
  OrchestrationLogger
} from './logger';
import { InMemoryJobQueue, JobQueue } from './queue';
import {
  defaultRetryPolicy,
  OrchestrationJob,
  ProcessResult,
  RetryPolicy,
  StepExecutionContext,
  StepHandler
} from './types';

export interface EnqueueStepInput<TPayload = unknown> {
  workflowRunId: string;
  stepName: string;
  payload: TPayload;
  traceId?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
  availableAt?: number;
}

export interface WorkflowOrchestratorOptions {
  queue?: JobQueue;
  executionStore?: ExecutionStore;
  logger?: OrchestrationLogger;
  retryPolicy?: Partial<RetryPolicy>;
  now?: () => number;
  createJobId?: () => string;
}

function toError(input: unknown): Error {
  if (input instanceof Error) {
    return input;
  }

  return new Error(typeof input === 'string' ? input : JSON.stringify(input));
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
    .join(',')}}`;
}

function computeRetryDelay(attempt: number, policy: RetryPolicy): number {
  const delay = policy.initialDelayMs * policy.multiplier ** Math.max(attempt - 1, 0);
  return Math.min(Math.round(delay), policy.maxDelayMs);
}

function buildDefaultIdempotencyKey(stepName: string, payload: unknown): string {
  const digest = createHash('sha256')
    .update(`${stepName}:${stableSerialize(payload)}`)
    .digest('hex');

  return digest;
}

export class WorkflowOrchestrator {
  private readonly queue: JobQueue;
  private readonly executionStore: ExecutionStore;
  private readonly logger: OrchestrationLogger;
  private readonly retryPolicy: RetryPolicy;
  private readonly now: () => number;
  private readonly createJobId: () => string;
  private readonly steps = new Map<string, StepHandler>();

  constructor(options: WorkflowOrchestratorOptions = {}) {
    this.queue = options.queue ?? new InMemoryJobQueue();
    this.executionStore = options.executionStore ?? new InMemoryExecutionStore();
    this.logger = options.logger ?? new ConsoleJsonLogger();
    this.retryPolicy = {
      ...defaultRetryPolicy,
      ...(options.retryPolicy ?? {})
    };
    this.now = options.now ?? (() => Date.now());
    this.createJobId = options.createJobId ?? (() => randomUUID());
  }

  registerStep<TPayload = unknown, TResult = unknown>(
    stepName: string,
    handler: StepHandler<TPayload, TResult>
  ): void {
    this.steps.set(stepName, handler as StepHandler);
  }

  enqueueStep<TPayload = unknown>(input: EnqueueStepInput<TPayload>): OrchestrationJob<TPayload> {
    const nowMs = this.now();
    const idempotencyKey =
      input.idempotencyKey ?? buildDefaultIdempotencyKey(input.stepName, input.payload);

    const job: OrchestrationJob<TPayload> = {
      jobId: this.createJobId(),
      workflowRunId: input.workflowRunId,
      stepName: input.stepName,
      payload: input.payload,
      traceId: input.traceId ?? randomUUID(),
      idempotencyKey,
      attempt: 1,
      maxAttempts: input.maxAttempts ?? this.retryPolicy.maxAttempts,
      availableAt: input.availableAt ?? nowMs,
      enqueuedAt: nowMs
    };

    this.queue.enqueue(job);
    this.log('info', 'job_enqueued', job, 'Queued workflow step for execution', {
      queueDepth: this.queue.size()
    });

    return job;
  }

  async processNext<TResult = unknown, TPayload = unknown>(): Promise<ProcessResult<TResult, TPayload>> {
    const job = this.queue.dequeue(this.now()) as OrchestrationJob<TPayload> | undefined;
    if (!job) {
      return { status: 'idle' };
    }

    const step = this.steps.get(job.stepName) as StepHandler<TPayload, TResult> | undefined;
    if (!step) {
      const error = new Error(`No step registered for ${job.stepName}`);
      this.log('error', 'job_failed', job, error.message);
      return {
        status: 'failed',
        job,
        error
      };
    }

    const executionKey = buildExecutionKey(job.workflowRunId, job.stepName, job.idempotencyKey);
    const priorExecution = this.executionStore.get(executionKey);
    if (priorExecution) {
      this.log('info', 'job_duplicate', job, 'Skipped duplicate workflow step execution', {
        duplicateOfJobId: priorExecution.jobId
      });

      return {
        status: 'duplicate',
        job,
        duplicateOfJobId: priorExecution.jobId
      };
    }

    const startedAt = this.now();
    this.log('info', 'job_started', job, 'Started workflow step execution');

    try {
      const result = await step({
        workflowRunId: job.workflowRunId,
        stepName: job.stepName,
        jobId: job.jobId,
        traceId: job.traceId,
        attempt: job.attempt,
        payload: job.payload
      } as StepExecutionContext<TPayload>);

      this.executionStore.put({
        key: executionKey,
        jobId: job.jobId,
        workflowRunId: job.workflowRunId,
        stepName: job.stepName,
        traceId: job.traceId,
        completedAt: new Date(this.now()).toISOString()
      });

      this.log('info', 'job_completed', job, 'Completed workflow step execution', {
        durationMs: this.now() - startedAt
      });

      return {
        status: 'completed',
        job,
        result
      };
    } catch (input) {
      const error = toError(input);
      if (job.attempt < job.maxAttempts) {
        const delayMs = computeRetryDelay(job.attempt, this.retryPolicy);
        const nextAttempt = {
          ...job,
          attempt: job.attempt + 1,
          availableAt: this.now() + delayMs,
          enqueuedAt: this.now()
        };

        this.queue.enqueue(nextAttempt);
        this.log('warn', 'job_retry_scheduled', nextAttempt, 'Workflow step failed; retry scheduled', {
          delayMs,
          previousError: error.message,
          nextAttempt: nextAttempt.attempt
        });

        return {
          status: 'retry_scheduled',
          job: nextAttempt,
          delayMs,
          error
        };
      }

      this.log('error', 'job_failed', job, 'Workflow step failed after max retries', {
        error: error.message
      });

      return {
        status: 'failed',
        job,
        error
      };
    }
  }

  async processUntilIdle(maxIterations: number = 200): Promise<Array<ProcessResult>> {
    const results: Array<ProcessResult> = [];

    for (let index = 0; index < maxIterations; index += 1) {
      const result = await this.processNext();
      results.push(result);

      if (result.status === 'idle') {
        return results;
      }
    }

    throw new Error(`processUntilIdle exceeded maxIterations=${maxIterations}`);
  }

  private log(
    level: 'info' | 'warn' | 'error',
    event: OrchestrationEvent,
    job: OrchestrationJob,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.logger.log({
      timestamp: new Date(this.now()).toISOString(),
      level,
      event,
      workflowRunId: job.workflowRunId,
      traceId: job.traceId,
      stepName: job.stepName,
      jobId: job.jobId,
      attempt: job.attempt,
      message,
      metadata
    });
  }
}
