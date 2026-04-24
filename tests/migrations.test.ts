import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('migration artifacts', () => {
  it('defines core domain tables and constraints', () => {
    const coreMigration = readFileSync(new URL('../migrations/001_core_domain.sql', import.meta.url), 'utf8');

    expect(coreMigration).toMatch(/CREATE TABLE clients/i);
    expect(coreMigration).toMatch(/CREATE TABLE campaigns/i);
    expect(coreMigration).toMatch(/CREATE TABLE channels/i);
    expect(coreMigration).toMatch(/CREATE TABLE assets/i);
    expect(coreMigration).toMatch(/CREATE TABLE metrics/i);
    expect(coreMigration).toMatch(/CHECK \(value >= 0\)/i);
  });

  it('defines idempotency ingestion event table', () => {
    const ingestionMigration = readFileSync(
      new URL('../migrations/002_ingestion_events.sql', import.meta.url),
      'utf8'
    );

    expect(ingestionMigration).toMatch(/CREATE TABLE ingestion_events/i);
    expect(ingestionMigration).toMatch(/idempotency_key TEXT PRIMARY KEY/i);
    expect(ingestionMigration).toMatch(/UNIQUE \(source, event_id, payload_type\)/i);
  });
});
