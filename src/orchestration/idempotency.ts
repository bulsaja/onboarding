export interface ExecutionRecord {
  key: string;
  jobId: string;
  workflowRunId: string;
  stepName: string;
  traceId: string;
  completedAt: string;
}

export interface ExecutionStore {
  get(key: string): ExecutionRecord | undefined;
  put(record: ExecutionRecord): void;
}

export class InMemoryExecutionStore implements ExecutionStore {
  private readonly records = new Map<string, ExecutionRecord>();

  get(key: string): ExecutionRecord | undefined {
    return this.records.get(key);
  }

  put(record: ExecutionRecord): void {
    this.records.set(record.key, record);
  }
}

export function buildExecutionKey(
  workflowRunId: string,
  stepName: string,
  idempotencyKey: string
): string {
  return `${workflowRunId}:${stepName}:${idempotencyKey}`;
}
