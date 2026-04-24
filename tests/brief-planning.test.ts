import { describe, expect, it } from 'vitest';

import {
  campaignBriefIntakeFormSchema,
  InMemoryCampaignPlanningStore,
  submitCampaignBrief,
  validateCampaignBriefIntakePayload
} from '../src/planning/briefs';

function validBriefPayload() {
  return {
    briefId: 'brief_launch_01',
    clientId: 'client_acme',
    requestedBy: 'ops@acme.test',
    submittedAt: '2026-04-24T00:00:00.000Z',
    campaignName: 'Acme Summer Launch',
    objective: 'Lead Generation',
    timezone: 'Asia/Seoul',
    budget: {
      amount: 12000,
      currency: 'usd'
    },
    schedule: {
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-30T23:59:59.000Z'
    },
    targetAudience: {
      persona: 'B2B marketing manager',
      primaryRegion: 'South Korea'
    },
    channels: ['meta_ads', 'google_ads'],
    successMetrics: ['Qualified Leads', 'Cost per Lead'],
    constraints: ['No influencer placements in week 1'],
    notes: 'Need launch-ready draft within 24h'
  };
}

describe('campaign brief intake and planning workflow', () => {
  it('exposes an endpoint/form schema for brief intake contracts', () => {
    expect(campaignBriefIntakeFormSchema.endpoint).toBe('/api/campaign-briefs');
    expect(campaignBriefIntakeFormSchema.method).toBe('POST');
    expect(campaignBriefIntakeFormSchema.required).toContain('campaignName');
    expect(campaignBriefIntakeFormSchema.fields.channels.items.enum).toContain('meta_ads');
  });

  it('accepts a valid brief and generates a campaign plan artifact', () => {
    const store = new InMemoryCampaignPlanningStore();

    const result = submitCampaignBrief(validBriefPayload(), {
      store,
      now: () => '2026-04-24T12:00:00.000Z'
    });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.plan.planId).toBe('brief_launch_01:v1');
      expect(result.plan.channelPlans).toHaveLength(2);
      expect(result.plan.successMetrics).toEqual(['qualified_leads', 'cost_per_lead']);
      expect(result.plan.sourceBriefChecksum.startsWith('brief_')).toBe(true);
      expect(result.audit.submissionSource).toBe('brief_intake');
      expect(result.brief.campaignSlug).toBe('acme-summer-launch');
      expect(result.brief.objective).toBe('lead_generation');
      expect(result.brief.budget.currency).toBe('USD');
    }

    const versions = store.listPlanVersions('brief_launch_01');
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
  });

  it('persists plan versions for iteration and exposes auditable history', () => {
    const store = new InMemoryCampaignPlanningStore();

    const first = submitCampaignBrief(validBriefPayload(), {
      store,
      now: () => '2026-04-24T12:00:00.000Z'
    });
    expect(first.status).toBe('accepted');

    const revisedPayload = {
      ...validBriefPayload(),
      budget: {
        amount: 18000,
        currency: 'USD'
      },
      channels: ['meta_ads', 'google_ads', 'linkedin_ads'],
      constraints: ['No influencer placements in week 1', 'Legal review before final publish']
    };

    const second = submitCampaignBrief(revisedPayload, {
      store,
      now: () => '2026-04-25T09:30:00.000Z'
    });

    expect(second.status).toBe('accepted');
    if (second.status === 'accepted') {
      expect(second.plan.version).toBe(2);
      expect(second.plan.channelPlans).toHaveLength(3);
    }

    const versions = store.listPlanVersions('brief_launch_01');
    expect(versions.map((version) => version.version)).toEqual([1, 2]);

    const firstVersion = store.getPlanVersion('brief_launch_01', 1);
    const secondVersion = store.getPlanVersion('brief_launch_01', 2);
    expect(firstVersion).toBeDefined();
    expect(secondVersion).toBeDefined();
    expect(firstVersion?.sourceBriefChecksum).not.toBe(secondVersion?.sourceBriefChecksum);

    const auditEntries = store.listAuditEntries('brief_launch_01');
    expect(auditEntries).toHaveLength(2);
    expect(auditEntries[0].version).toBe(1);
    expect(auditEntries[1].version).toBe(2);
    expect(auditEntries[1].createdAt).toBe('2026-04-25T09:30:00.000Z');
  });

  it('returns actionable validation errors for malformed briefs', () => {
    const invalidPayload = {
      briefId: ' ',
      clientId: 'client_acme',
      requestedBy: 'ops@acme.test',
      submittedAt: 'not-a-date',
      campaignName: '',
      objective: 'invalid-objective',
      timezone: 'Asia/Seoul',
      budget: {
        amount: -1,
        currency: 'JPY'
      },
      schedule: {
        startDate: '2026-05-31T00:00:00.000Z',
        endDate: '2026-05-01T00:00:00.000Z'
      },
      targetAudience: {
        persona: '',
        primaryRegion: ''
      },
      channels: ['unknown_channel'],
      successMetrics: []
    };

    const validation = validateCampaignBriefIntakePayload(invalidPayload);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors).toContain('payload.briefId must be a non-empty string');
      expect(validation.errors).toContain('payload.submittedAt must be a valid ISO-8601 datetime');
      expect(validation.errors).toContain(
        'payload.objective must be one of: lead_generation, awareness, sales, retention, traffic'
      );
      expect(validation.errors).toContain('payload.budget.amount must be greater than 0');
      expect(validation.errors).toContain('payload.successMetrics must be a non-empty array');
      expect(validation.errors).toContain(
        'payload.schedule.startDate must be before or equal to payload.schedule.endDate'
      );
    }

    const result = submitCampaignBrief(invalidPayload);
    expect(result.status).toBe('rejected');
  });
});
