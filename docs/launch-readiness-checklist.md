# Launch Readiness Checklist

## Reliability

- [x] Critical-flow SLO definitions are documented and codified (`src/reliability/monitoring.ts`).
- [x] Monitoring captures latency, error rate, and queue depth snapshots.
- [x] Load test baseline and failure injection scenarios are executable (`src/reliability/loadtest.ts`).

## Security

- [x] RBAC baseline is implemented (`src/security/rbac.ts`).
- [x] Authorization decisions are auditable (`src/security/audit.ts`).
- [x] Secret rotation planning process is implemented (`src/security/secrets.ts`).

## Operations

- [x] Incident response and on-call runbook is published (`docs/incident-response-oncall-runbook.md`).
- [x] Security hardening runbook is published (`docs/security-hardening-runbook.md`).
- [x] Publish retry/dead-letter diagnostics are available (`src/publishing/scheduler.ts`).

## Evidence

- `npm run check` passes locally (lint, unit tests, build).
- Reliability/security hardening tests exist in `tests/reliability-hardening.test.ts`.
