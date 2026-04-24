import { describe, expect, it } from 'vitest';

import {
  defaultFlowSloDefinitions,
  FlowMonitor,
  injectFailureScenario,
  runLoadSuite
} from '../src/reliability';
import {
  authorizeWithAudit,
  buildSecretsRotationPlan,
  InMemoryAuditLog,
  RbacAuthorizer
} from '../src/security';

describe('reliability and security hardening baseline', () => {
  it('meets SLO thresholds for healthy critical-flow observations', () => {
    const monitor = new FlowMonitor();

    for (let index = 0; index < 100; index += 1) {
      monitor.record({
        flow: 'publish_delivery',
        observedAt: new Date(Date.parse('2026-05-01T00:00:00.000Z') + index * 1000).toISOString(),
        latencyMs: 500 + (index % 40),
        success: true,
        queueDepth: 10 + (index % 4)
      });
    }

    const evaluation = monitor.evaluateSlo('publish_delivery', {
      now: '2026-05-01T00:05:00.000Z',
      windowMs: 10 * 60 * 1000
    });

    expect(evaluation.met).toBe(true);
    expect(evaluation.breaches).toHaveLength(0);
    expect(evaluation.snapshot.sampleCount).toBe(100);
  });

  it('detects SLO breaches under injected failure conditions', () => {
    const baselineScenario = {
      name: 'publish_delivery_baseline',
      flow: 'publish_delivery' as const,
      sampleCount: 200,
      baseLatencyMs: 600,
      jitterMs: 100,
      failureRate: 0.01,
      queueDepthBase: 10,
      queueDepthJitter: 4
    };

    const failureScenario = injectFailureScenario(baselineScenario, {
      failureRate: 0.35,
      latencyMultiplier: 2.4,
      queueDepthMultiplier: 4
    });

    const suite = runLoadSuite([failureScenario], {
      seed: 42,
      startedAt: '2026-05-01T00:00:00.000Z',
      windowMs: 20 * 60 * 1000
    });

    const evaluation = suite.evaluations.find((entry) => entry.flow === 'publish_delivery');
    expect(evaluation).toBeDefined();
    expect(evaluation?.met).toBe(false);
    expect(evaluation?.breaches.length).toBeGreaterThan(0);
  });

  it('enforces RBAC decisions and records audit logs', () => {
    const authorizer = new RbacAuthorizer();
    const auditLog = new InMemoryAuditLog();

    const allowed = authorizeWithAudit({
      eventId: 'auth_001',
      actorId: 'cto',
      role: 'admin',
      permission: 'rotate_secrets',
      resource: 'vault/main',
      observedAt: '2026-05-01T00:00:00.000Z',
      authorizer,
      auditLog
    });
    expect(allowed.allowed).toBe(true);

    const denied = authorizeWithAudit({
      eventId: 'auth_002',
      actorId: 'intern',
      role: 'viewer',
      permission: 'schedule_publish',
      resource: 'campaign/campaign_summer',
      observedAt: '2026-05-01T00:01:00.000Z',
      authorizer,
      auditLog
    });
    expect(denied.allowed).toBe(false);

    const events = auditLog.list();
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.outcome)).toEqual(['allowed', 'denied']);
    expect(events[1].reason).toContain('missing required permission');
  });

  it('builds a secrets rotation plan and flags overdue secrets', () => {
    const plan = buildSecretsRotationPlan({
      now: '2026-05-01T00:00:00.000Z',
      secrets: [
        {
          secretId: 'prod/db/password',
          owner: 'platform',
          lastRotatedAt: '2026-03-01T00:00:00.000Z',
          rotationIntervalDays: 30
        },
        {
          secretId: 'prod/api/token',
          owner: 'platform',
          lastRotatedAt: '2026-04-25T00:00:00.000Z',
          rotationIntervalDays: 30
        }
      ]
    });

    expect(plan).toHaveLength(2);
    expect(plan[0].secretId).toBe('prod/db/password');
    expect(plan[0].overdue).toBe(true);
    expect(plan[1].overdue).toBe(false);
  });

  it('keeps default SLO definitions aligned to all critical flows', () => {
    const flowNames = defaultFlowSloDefinitions.map((entry) => entry.flow).sort();
    expect(flowNames).toEqual([
      'brief_to_plan',
      'content_generation_approval',
      'publish_delivery',
      'report_refresh'
    ]);
  });
});
