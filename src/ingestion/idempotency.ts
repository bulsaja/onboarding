import { createHash } from 'node:crypto';

export type IngestionKind = 'campaign' | 'performance';

export interface IdempotencyRecord {
  key: string;
  kind: IngestionKind;
  source: string;
  eventId: string;
  processedAt: string;
}

export interface IdempotencyStore {
  get(key: string): IdempotencyRecord | undefined;
  put(record: IdempotencyRecord): void;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  get(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }

  put(record: IdempotencyRecord): void {
    this.records.set(record.key, record);
  }
}

export function buildIdempotencyKey(source: string, eventId: string): string {
  return createHash('sha256').update(`${source}:${eventId}`).digest('hex');
}
