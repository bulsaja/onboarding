import { Permission, Role, RbacAuthorizer } from './rbac';

export interface AuditEvent {
  eventId: string;
  actorId: string;
  role: Role;
  permission: Permission;
  resource: string;
  outcome: 'allowed' | 'denied';
  reason: string;
  observedAt: string;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function assertNonEmptyString(value: string, label: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return normalized;
}

function assertIsoDatetime(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} must be a valid ISO-8601 datetime`);
  }

  return new Date(parsed).toISOString();
}

export class InMemoryAuditLog {
  private readonly events: AuditEvent[] = [];

  record(event: AuditEvent): AuditEvent {
    const normalized: AuditEvent = {
      eventId: assertNonEmptyString(event.eventId, 'event.eventId'),
      actorId: assertNonEmptyString(event.actorId, 'event.actorId'),
      role: event.role,
      permission: event.permission,
      resource: assertNonEmptyString(event.resource, 'event.resource'),
      outcome: event.outcome,
      reason: assertNonEmptyString(event.reason, 'event.reason'),
      observedAt: assertIsoDatetime(event.observedAt, 'event.observedAt')
    };

    this.events.push(normalized);
    return normalized;
  }

  list(input: {
    actorId?: string;
    outcome?: 'allowed' | 'denied';
  } = {}): AuditEvent[] {
    return this.events.filter((event) => {
      if (input.actorId && event.actorId !== input.actorId) {
        return false;
      }

      if (input.outcome && event.outcome !== input.outcome) {
        return false;
      }

      return true;
    });
  }
}

export function authorizeWithAudit(input: {
  eventId: string;
  actorId: string;
  role: Role;
  permission: Permission;
  resource: string;
  observedAt: string;
  authorizer: RbacAuthorizer;
  auditLog: InMemoryAuditLog;
}): {
  allowed: boolean;
  reason: string;
} {
  const decision = input.authorizer.authorize(input.role, input.permission);

  input.auditLog.record({
    eventId: input.eventId,
    actorId: input.actorId,
    role: input.role,
    permission: input.permission,
    resource: input.resource,
    outcome: decision.allowed ? 'allowed' : 'denied',
    reason: decision.reason,
    observedAt: input.observedAt
  });

  return decision;
}
