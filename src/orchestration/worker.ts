import { WorkflowOrchestrator } from './orchestrator';

export interface OrchestrationWorkerOptions {
  pollIntervalMs?: number;
  onUnexpectedError?: (error: Error) => void;
}

function toError(input: unknown): Error {
  if (input instanceof Error) {
    return input;
  }

  return new Error(typeof input === 'string' ? input : JSON.stringify(input));
}

export class OrchestrationWorker {
  private readonly pollIntervalMs: number;
  private readonly onUnexpectedError?: (error: Error) => void;
  private pollTimer: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  constructor(
    private readonly orchestrator: WorkflowOrchestrator,
    options: OrchestrationWorkerOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.onUnexpectedError = options.onUnexpectedError;
  }

  get running(): boolean {
    return this.pollTimer !== null;
  }

  start(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (!this.pollTimer) {
      return;
    }

    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async drain(maxIterations: number = 200): Promise<void> {
    await this.orchestrator.processUntilIdle(maxIterations);
  }

  private async tick(): Promise<void> {
    if (this.isTickRunning) {
      return;
    }

    this.isTickRunning = true;
    try {
      await this.orchestrator.processNext();
    } catch (input) {
      this.onUnexpectedError?.(toError(input));
    } finally {
      this.isTickRunning = false;
    }
  }
}
