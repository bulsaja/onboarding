BEGIN;

CREATE TABLE ingestion_events (
  idempotency_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  UNIQUE (source, event_id, payload_type)
);

CREATE INDEX idx_ingestion_events_processed_at ON ingestion_events(processed_at);

COMMIT;
