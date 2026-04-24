import { describe, expect, it, vi } from 'vitest';

import { InMemoryExecutionStore } from '../src/orchestration/idempotency';
import { InMemoryLogger } from '../src/orchestration/logger';
import { WorkflowOrchestrator } from '../src/orchestration/orchestrator';
import { InMemoryJobQueue } from '../src/orchestration/queue';
import { OrchestrationWorker } from '../src/orchestration/worker';

describe('workflow orchestration', () => {
  it('processes a queued step and preserves trace IDs in structured logs', async () => {
    const queue = new InMemoryJobQueue();
    const logger = new InMemoryLogger();
    const orchestrator = new WorkflowOrchestrator({
      queue,
      logger,
      now: () => Date.parse('2026-04-24T00:00:00.000Z')
    });

    orchestrator.registerStep<{ channel: string }, { normalizedChannel: string }>(
      'normalize-channel',
      (context) => ({ normalizedChannel: context.payload.channel.toUpperCase() })
    );

    orchestrator.enqueueStep({
      workflowRunId: 'run_001',
      stepName: 'normalize-channel',
      traceId: 'trace_abc',
      idempotencyKey: 'asset_01',
      payload: { channel: 'meta_ads' }
    });

    const result = await orchestrator.processNext();
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.result).toEqual({ normalizedChannel: 'META_ADS' });
    }

    const events = logger.entries.map((entry) => entry.event);
    expect(events).toEqual(['job_enqueued', 'job_started', 'job_completed']);

    const traces = new Set(logger.entries.map((entry) => entry.traceId));
    expect(traces).toEqual(new Set(['trace_abc']));
  });

  it('suppresses duplicate side effects when idempotency keys match', async () => {
    const orchestrator = new WorkflowOrchestrator({
      queue: new InMemoryJobQueue(),
      executionStore: new InMemoryExecutionStore(),
      logger: new InMemoryLogger()
    });

    let executionCount = 0;
    orchestrator.registerStep('publish-asset', () => {
      executionCount += 1;
      return { published: true };
    });

    orchestrator.enqueueStep({
      workflowRunId: 'run_002',
      stepName: 'publish-asset',
      idempotencyKey: 'asset_publish_key',
      payload: { assetId: 'asset_42' }
    });
    orchestrator.enqueueStep({
      workflowRunId: 'run_002',
      stepName: 'publish-asset',
      idempotencyKey: 'asset_publish_key',
      payload: { assetId: 'asset_42' }
    });

    const first = await orchestrator.processNext();
    const second = await orchestrator.processNext();

    expect(first.status).toBe('completed');
    expect(second.status).toBe('duplicate');
    expect(executionCount).toBe(1);
  });

  it('retries with exponential backoff and succeeds on a later attempt', async () => {
    let nowMs = 1_000;

    const queue = new InMemoryJobQueue();
    const logger = new InMemoryLogger();
    const orchestrator = new WorkflowOrchestrator({
      queue,
      logger,
      now: () => nowMs,
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 100,
        multiplier: 2,
        maxDelayMs: 2_000
      }
    });

    let attempts = 0;
    orchestrator.registerStep('fanout-campaign', () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('temporary queue outage');
      }

      return { ok: true };
    });

    orchestrator.enqueueStep({
      workflowRunId: 'run_003',
      stepName: 'fanout-campaign',
      traceId: 'trace_retry',
      idempotencyKey: 'fanout_run_003',
      payload: { campaignId: 'campaign_77' }
    });

    const firstResult = await orchestrator.processNext();
    expect(firstResult.status).toBe('retry_scheduled');
    if (firstResult.status === 'retry_scheduled') {
      expect(firstResult.delayMs).toBe(100);
      expect(firstResult.job.attempt).toBe(2);
    }

    const idleBeforeRetry = await orchestrator.processNext();
    expect(idleBeforeRetry.status).toBe('idle');

    nowMs = 1_100;
    const secondResult = await orchestrator.processNext();
    expect(secondResult.status).toBe('completed');
    expect(attempts).toBe(2);

    expect(logger.entries.some((entry) => entry.event === 'job_retry_scheduled')).toBe(true);
  });

  it('drains queued jobs and supports worker start/stop lifecycle', async () => {
    const queue = new InMemoryJobQueue();
    const orchestrator = new WorkflowOrchestrator({
      queue,
      logger: new InMemoryLogger()
    });

    let processed = 0;
    orchestrator.registerStep('record-metric', () => {
      processed += 1;
      return { saved: true };
    });

    orchestrator.enqueueStep({
      workflowRunId: 'run_004',
      stepName: 'record-metric',
      idempotencyKey: 'metric_1',
      payload: { metricId: 'metric_1' }
    });

    const worker = new OrchestrationWorker(orchestrator, { pollIntervalMs: 20 });
    expect(worker.running).toBe(false);
    worker.start();
    expect(worker.running).toBe(true);
    worker.stop();
    expect(worker.running).toBe(false);

    await worker.drain();
    expect(processed).toBe(1);

    vi.useFakeTimers();
    try {
      orchestrator.enqueueStep({
        workflowRunId: 'run_004',
        stepName: 'record-metric',
        idempotencyKey: 'metric_2',
        payload: { metricId: 'metric_2' }
      });

      worker.start();
      await vi.advanceTimersByTimeAsync(40);
      worker.stop();

      expect(processed).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
