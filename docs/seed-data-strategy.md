# Seed Data Strategy

This document defines the local development seed strategy for the core domain model in [HOWA-6](/HOWA/issues/HOWA-6).

## Goals

- Keep seed data deterministic across machines and CI.
- Ensure foreign-key relationships are always valid.
- Provide enough data for API and ingestion contract tests.

## Source of Truth

- Canonical local seed fixture lives in `src/seeds/localSeed.ts`.
- The seed fixture is type-checked and validated by `assertValidDomainSnapshot` before use.
- Migration files in `migrations/` remain the authoritative schema contract.

## Loading Approach

1. Apply SQL migrations in lexical order (`001_*`, `002_*`, ...).
2. Load seed entities in dependency order:
   - `clients`
   - `campaigns`
   - `channels`
   - `assets`
   - `metrics`
3. Record processed ingestion events in `ingestion_events` for idempotency checks.

## Update Rules

- Any new required domain field must be added to both migrations and local seed fixture in the same change.
- Seed IDs must be stable strings (no generated random IDs) to keep tests reproducible.
- Any new relationship requires a validation rule in `validateDomainSnapshot`.

## Verification

- `npm run test` validates ingestion contracts and seed relationship integrity.
- `npm run build` ensures seed/types compile as part of the application build.
