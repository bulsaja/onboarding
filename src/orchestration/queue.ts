import { OrchestrationJob } from './types';

export interface JobQueue<TPayload = unknown> {
  enqueue(job: OrchestrationJob<TPayload>): void;
  dequeue(nowMs?: number): OrchestrationJob<TPayload> | undefined;
  size(): number;
  peek(): OrchestrationJob<TPayload> | undefined;
}

function sortBySchedule<TPayload>(left: OrchestrationJob<TPayload>, right: OrchestrationJob<TPayload>): number {
  if (left.availableAt !== right.availableAt) {
    return left.availableAt - right.availableAt;
  }

  return left.enqueuedAt - right.enqueuedAt;
}

export class InMemoryJobQueue<TPayload = unknown> implements JobQueue<TPayload> {
  private readonly jobs: Array<OrchestrationJob<TPayload>> = [];

  enqueue(job: OrchestrationJob<TPayload>): void {
    this.jobs.push(job);
    this.jobs.sort(sortBySchedule);
  }

  dequeue(nowMs: number = Date.now()): OrchestrationJob<TPayload> | undefined {
    const index = this.jobs.findIndex((job) => job.availableAt <= nowMs);
    if (index < 0) {
      return undefined;
    }

    const [job] = this.jobs.splice(index, 1);
    return job;
  }

  size(): number {
    return this.jobs.length;
  }

  peek(): OrchestrationJob<TPayload> | undefined {
    return this.jobs[0];
  }
}
