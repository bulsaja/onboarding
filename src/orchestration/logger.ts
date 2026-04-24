export type LogLevel = 'info' | 'warn' | 'error';

export type OrchestrationEvent =
  | 'job_enqueued'
  | 'job_started'
  | 'job_completed'
  | 'job_duplicate'
  | 'job_retry_scheduled'
  | 'job_failed';

export interface OrchestrationLogEntry {
  timestamp: string;
  level: LogLevel;
  event: OrchestrationEvent;
  workflowRunId: string;
  traceId: string;
  stepName: string;
  jobId: string;
  attempt: number;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface OrchestrationLogger {
  log(entry: OrchestrationLogEntry): void;
}

export class ConsoleJsonLogger implements OrchestrationLogger {
  log(entry: OrchestrationLogEntry): void {
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}

export class InMemoryLogger implements OrchestrationLogger {
  readonly entries: OrchestrationLogEntry[] = [];

  log(entry: OrchestrationLogEntry): void {
    this.entries.push(entry);
  }
}
