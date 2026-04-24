# Incident Response and On-Call Runbook

## Severity Levels

- `SEV-1`: production outage or major data integrity risk.
- `SEV-2`: degraded performance or partial feature outage.
- `SEV-3`: non-critical defect with workaround.

## Detection Sources

- SLO breach evaluations from `src/reliability/monitoring.ts`
- Publish dead-letter growth from `src/publishing/scheduler.ts`
- Reporting refresh monitor anomalies from `src/reporting/dashboard.ts`
- Security denials and overdue rotations from `src/security`

## First 15 Minutes

1. Declare incident in team channel with severity and summary.
2. Assign incident commander and comms owner.
3. Freeze risky deploys for `SEV-1` and `SEV-2`.
4. Capture timeline start and affected flows.

## Operational Playbook

1. Identify breached critical flow and current blast radius.
2. Pull latest audit trail and retry/dead-letter diagnostics.
3. Execute rollback or mitigation if risk is expanding.
4. Validate against SLO thresholds after mitigation.

## On-Call Handoff

- Include:
  - incident id
  - current severity
  - mitigations applied
  - outstanding risks
  - next checkpoint time
- Do not hand off without an explicit owner and next action.

## Post-Incident Review

- Publish RCA within 24 hours for `SEV-1`/`SEV-2`.
- Include failed assumptions, customer impact, and prevention actions.
- Link remediation tasks into roadmap before closing incident.
