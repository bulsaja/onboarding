# Security Hardening Runbook

## Scope

This runbook covers RBAC enforcement, audit logging, and secret rotation for launch readiness.

## RBAC Baseline

- Roles: `admin`, `operator`, `reviewer`, `viewer`
- Permissions:
  - `manage_templates`
  - `approve_content`
  - `schedule_publish`
  - `rotate_secrets`
  - `view_reports`
  - `manage_rbac`
- Enforcement entrypoint: `src/security/rbac.ts` (`RbacAuthorizer`)

## Audit Logging Baseline

- Authorization decisions are recorded via `authorizeWithAudit` in `src/security/audit.ts`
- Required audit fields:
  - `eventId`
  - `actorId`
  - `role`
  - `permission`
  - `resource`
  - `outcome`
  - `reason`
  - `observedAt`
- Logs are queryable by actor and outcome for incident review.

## Secret Rotation Process

- Rotation planning entrypoint: `buildSecretsRotationPlan` in `src/security/secrets.ts`
- Inputs:
  - `secretId`
  - `owner`
  - `lastRotatedAt`
  - `rotationIntervalDays`
- Outputs:
  - `dueAt`
  - `overdue`
  - `daysUntilDue`
- Escalate overdue production secrets immediately to on-call operator.

## Review Cadence

- Daily: check overdue secrets and denied authorization events.
- Weekly: confirm role-permission mappings still align with current org responsibilities.
- Release gate: verify no critical secret is overdue and audit pipeline is healthy.
