export interface OrchestrationJob<TPayload = unknown> {
  jobId: string;
  workflowRunId: string;
  stepName: string;
  payload: TPayload;
  traceId: string;
  idempotencyKey: string;
  attempt: number;
  maxAttempts: number;
  availableAt: number;
  enqueuedAt: number;
}

export interface StepExecutionContext<TPayload = unknown> {
  workflowRunId: string;
  stepName: string;
  jobId: string;
  traceId: string;
  attempt: number;
  payload: TPayload;
}

export type StepHandler<TPayload = unknown, TResult = unknown> = (
  context: StepExecutionContext<TPayload>
) => Promise<TResult> | TResult;

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 500,
  multiplier: 2,
  maxDelayMs: 30_000
};

export type ProcessResult<TResult = unknown, TPayload = unknown> =
  | {
      status: 'idle';
    }
  | {
      status: 'completed';
      job: OrchestrationJob<TPayload>;
      result: TResult;
    }
  | {
      status: 'duplicate';
      job: OrchestrationJob<TPayload>;
      duplicateOfJobId: string;
    }
  | {
      status: 'retry_scheduled';
      job: OrchestrationJob<TPayload>;
      delayMs: number;
      error: Error;
    }
  | {
      status: 'failed';
      job: OrchestrationJob<TPayload>;
      error: Error;
    };
