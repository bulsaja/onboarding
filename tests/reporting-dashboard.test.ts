import { describe, expect, it } from 'vitest';

import {
  InMemoryPerformanceStore,
  reportingApiContract,
  ReportingService,
  ScheduledReportRefresher
} from '../src/reporting';

function seedEvent(overrides: Partial<Parameters<InMemoryPerformanceStore['ingestEvent']>[0]> = {}) {
  return {
    eventId: 'evt_001',
    clientId: 'client_acme',
    campaignId: 'campaign_summer',
    channel: 'meta_ads' as const,
    occurredAt: '2026-05-01T00:00:00.000Z',
    impressions: 1000,
    clicks: 100,
    conversions: 12,
    spend: 300,
    revenue: 900,
    attribution: 'last_touch' as const,
    ...overrides
  };
}

describe('reporting dashboard baseline', () => {
  it('computes consistent campaign metrics and channel rollups', () => {
    const store = new InMemoryPerformanceStore();
    store.ingestEvent(seedEvent());
    store.ingestEvent(
      seedEvent({
        eventId: 'evt_002',
        channel: 'google_ads',
        impressions: 800,
        clicks: 80,
        conversions: 8,
        spend: 240,
        revenue: 560,
        attribution: 'first_touch'
      })
    );

    const service = new ReportingService(store, {
      cacheTtlMs: 60_000,
      now: () => '2026-05-01T01:00:00.000Z'
    });

    const response = service.getCampaignReport({
      campaignId: 'campaign_summer',
      range: {
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-02T00:00:00.000Z'
      }
    });

    expect(response.cache.hit).toBe(false);
    expect(response.report.totals.impressions).toBe(1800);
    expect(response.report.totals.clicks).toBe(180);
    expect(response.report.totals.conversions).toBe(20);
    expect(response.report.totals.spend).toBe(540);
    expect(response.report.totals.revenue).toBe(1460);
    expect(response.report.channels).toHaveLength(2);
    expect(response.report.attribution.firstTouchRevenue).toBe(560);
    expect(response.report.attribution.lastTouchRevenue).toBe(900);
  });

  it('supports cache contract and refresh updates on schedule', () => {
    const store = new InMemoryPerformanceStore();
    store.ingestEvent(seedEvent());

    let now = '2026-05-01T01:00:00.000Z';
    const service = new ReportingService(store, {
      cacheTtlMs: 10 * 60_000,
      now: () => now
    });

    const first = service.getCampaignReport({
      campaignId: 'campaign_summer',
      range: {
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-02T00:00:00.000Z'
      }
    });

    expect(first.cache.hit).toBe(false);
    expect(first.report.totals.revenue).toBe(900);

    store.ingestEvent(
      seedEvent({
        eventId: 'evt_002',
        channel: 'google_ads',
        revenue: 500,
        spend: 150,
        clicks: 50,
        impressions: 600,
        conversions: 6,
        attribution: 'assisted'
      })
    );

    const cached = service.getCampaignReport({
      campaignId: 'campaign_summer',
      range: {
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-02T00:00:00.000Z'
      }
    });
    expect(cached.cache.hit).toBe(true);
    expect(cached.report.totals.revenue).toBe(900);

    now = '2026-05-01T01:06:00.000Z';
    const refresher = new ScheduledReportRefresher(service, {
      refreshIntervalMs: 5 * 60_000,
      now: () => now
    });

    const ran = refresher.runIfDue({
      accountRequests: [
        {
          clientId: 'client_acme',
          range: {
            from: '2026-05-01T00:00:00.000Z',
            to: '2026-05-02T00:00:00.000Z'
          }
        }
      ],
      campaignRequests: [
        {
          campaignId: 'campaign_summer',
          range: {
            from: '2026-05-01T00:00:00.000Z',
            to: '2026-05-02T00:00:00.000Z'
          }
        }
      ]
    });

    expect(ran.status).toBe('ran');
    expect(ran.refreshedKeys).toBe(2);

    const refreshed = service.getCampaignReport({
      campaignId: 'campaign_summer',
      range: {
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-02T00:00:00.000Z'
      }
    });

    expect(refreshed.report.totals.revenue).toBe(1400);
  });

  it('enforces defined refresh cadence with monitoring history', () => {
    const store = new InMemoryPerformanceStore();
    store.ingestEvent(seedEvent());

    let now = '2026-05-01T01:00:00.000Z';
    const service = new ReportingService(store, { now: () => now });
    const refresher = new ScheduledReportRefresher(service, {
      refreshIntervalMs: 5 * 60_000,
      now: () => now
    });

    const first = refresher.runIfDue({
      accountRequests: [],
      campaignRequests: []
    });
    expect(first.status).toBe('ran');

    now = '2026-05-01T01:03:00.000Z';
    const second = refresher.runIfDue({
      accountRequests: [],
      campaignRequests: []
    });
    expect(second.status).toBe('skipped_not_due');

    now = '2026-05-01T01:06:00.000Z';
    const third = refresher.runIfDue({
      accountRequests: [],
      campaignRequests: []
    });
    expect(third.status).toBe('ran');

    const history = refresher.history();
    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.status)).toEqual(['ran', 'skipped_not_due', 'ran']);
  });

  it('publishes a stable dashboard contract for frontend integration', () => {
    expect(reportingApiContract.version).toBe('2026-04-24.v1');
    expect(reportingApiContract.endpoints.accountView.path).toBe('/api/reports/accounts/:clientId');
    expect(reportingApiContract.endpoints.campaignView.path).toBe('/api/reports/campaigns/:campaignId');
    expect(reportingApiContract.dashboardQuery.cacheTtlSeconds).toBe(300);
    expect(reportingApiContract.dashboardQuery.metrics).toContain('roas');
  });
});
