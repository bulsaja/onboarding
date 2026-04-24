import { ChannelType } from '../domain/entities';

export type AttributionModel = 'first_touch' | 'last_touch' | 'assisted';

export interface PerformanceMetricEvent {
  eventId: string;
  clientId: string;
  campaignId: string;
  channel: ChannelType;
  occurredAt: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  attribution: AttributionModel;
}

export interface ReportTimeRange {
  from: string;
  to: string;
}

export interface ReportingRollup {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

export interface AttributionRollup {
  firstTouchRevenue: number;
  lastTouchRevenue: number;
  assistedRevenue: number;
}

export interface ChannelRollup {
  channel: ChannelType;
  totals: ReportingRollup;
}

export interface CampaignReport {
  clientId: string;
  campaignId: string;
  range: ReportTimeRange;
  totals: ReportingRollup;
  channels: ChannelRollup[];
  attribution: AttributionRollup;
}

export interface AccountReport {
  clientId: string;
  range: ReportTimeRange;
  totals: ReportingRollup;
  campaigns: Array<{
    campaignId: string;
    totals: ReportingRollup;
  }>;
  attribution: AttributionRollup;
}

export interface ReportEnvelope<T> {
  report: T;
  cache: {
    key: string;
    hit: boolean;
    cachedAt: string;
    expiresAt: string;
  };
}

export interface RefreshRunMetrics {
  ranAt: string;
  durationMs: number;
  refreshedKeys: number;
  status: 'ran' | 'skipped_not_due';
}

interface CacheEntry {
  value: unknown;
  cachedAt: string;
  expiresAt: string;
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
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid ISO-8601 datetime`);
  }

  return new Date(timestamp).toISOString();
}

function assertNonNegativeNumber(value: number, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }

  return value;
}

function assertRange(range: ReportTimeRange): ReportTimeRange {
  const from = assertIsoDatetime(range.from, 'range.from');
  const to = assertIsoDatetime(range.to, 'range.to');
  if (Date.parse(from) > Date.parse(to)) {
    throw new Error('range.from must be before or equal to range.to');
  }

  return { from, to };
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function buildRollup(events: PerformanceMetricEvent[]): ReportingRollup {
  const totals = events.reduce(
    (accumulator, event) => {
      accumulator.impressions += event.impressions;
      accumulator.clicks += event.clicks;
      accumulator.conversions += event.conversions;
      accumulator.spend += event.spend;
      accumulator.revenue += event.revenue;
      return accumulator;
    },
    {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      spend: 0,
      revenue: 0
    }
  );

  const ctr = totals.impressions === 0 ? 0 : totals.clicks / totals.impressions;
  const cpc = totals.clicks === 0 ? 0 : totals.spend / totals.clicks;
  const cpa = totals.conversions === 0 ? 0 : totals.spend / totals.conversions;
  const roas = totals.spend === 0 ? 0 : totals.revenue / totals.spend;

  return {
    impressions: totals.impressions,
    clicks: totals.clicks,
    conversions: totals.conversions,
    spend: roundMetric(totals.spend),
    revenue: roundMetric(totals.revenue),
    ctr: roundMetric(ctr),
    cpc: roundMetric(cpc),
    cpa: roundMetric(cpa),
    roas: roundMetric(roas)
  };
}

function buildAttributionRollup(events: PerformanceMetricEvent[]): AttributionRollup {
  const firstTouchRevenue = events
    .filter((event) => event.attribution === 'first_touch')
    .reduce((sum, event) => sum + event.revenue, 0);
  const lastTouchRevenue = events
    .filter((event) => event.attribution === 'last_touch')
    .reduce((sum, event) => sum + event.revenue, 0);
  const assistedRevenue = events
    .filter((event) => event.attribution === 'assisted')
    .reduce((sum, event) => sum + event.revenue, 0);

  return {
    firstTouchRevenue: roundMetric(firstTouchRevenue),
    lastTouchRevenue: roundMetric(lastTouchRevenue),
    assistedRevenue: roundMetric(assistedRevenue)
  };
}

export const reportingApiContract = {
  version: '2026-04-24.v1',
  endpoints: {
    accountView: {
      path: '/api/reports/accounts/:clientId',
      query: ['from', 'to', 'timezone', 'currency']
    },
    campaignView: {
      path: '/api/reports/campaigns/:campaignId',
      query: ['from', 'to', 'timezone', 'currency']
    }
  },
  dashboardQuery: {
    keyDimensions: ['campaignId', 'channel', 'date'],
    metrics: ['impressions', 'clicks', 'conversions', 'spend', 'revenue', 'ctr', 'cpc', 'cpa', 'roas'],
    cacheTtlSeconds: 300,
    refreshIntervalSeconds: 300
  }
} as const;

export class InMemoryPerformanceStore {
  private readonly eventsById = new Map<string, PerformanceMetricEvent>();

  ingestEvent(event: PerformanceMetricEvent): PerformanceMetricEvent {
    const normalized: PerformanceMetricEvent = {
      eventId: assertNonEmptyString(event.eventId, 'event.eventId'),
      clientId: assertNonEmptyString(event.clientId, 'event.clientId'),
      campaignId: assertNonEmptyString(event.campaignId, 'event.campaignId'),
      channel: event.channel,
      occurredAt: assertIsoDatetime(event.occurredAt, 'event.occurredAt'),
      impressions: assertNonNegativeNumber(event.impressions, 'event.impressions'),
      clicks: assertNonNegativeNumber(event.clicks, 'event.clicks'),
      conversions: assertNonNegativeNumber(event.conversions, 'event.conversions'),
      spend: assertNonNegativeNumber(event.spend, 'event.spend'),
      revenue: assertNonNegativeNumber(event.revenue, 'event.revenue'),
      attribution: event.attribution
    };

    if (this.eventsById.has(normalized.eventId)) {
      throw new Error(`Duplicate eventId: ${normalized.eventId}`);
    }

    this.eventsById.set(normalized.eventId, normalized);
    return normalized;
  }

  listByCampaign(campaignId: string, range: ReportTimeRange): PerformanceMetricEvent[] {
    const normalizedCampaignId = assertNonEmptyString(campaignId, 'campaignId');
    const normalizedRange = assertRange(range);

    return Array.from(this.eventsById.values()).filter((event) => {
      if (event.campaignId !== normalizedCampaignId) {
        return false;
      }

      const occurredAt = Date.parse(event.occurredAt);
      return occurredAt >= Date.parse(normalizedRange.from) && occurredAt <= Date.parse(normalizedRange.to);
    });
  }

  listByClient(clientId: string, range: ReportTimeRange): PerformanceMetricEvent[] {
    const normalizedClientId = assertNonEmptyString(clientId, 'clientId');
    const normalizedRange = assertRange(range);

    return Array.from(this.eventsById.values()).filter((event) => {
      if (event.clientId !== normalizedClientId) {
        return false;
      }

      const occurredAt = Date.parse(event.occurredAt);
      return occurredAt >= Date.parse(normalizedRange.from) && occurredAt <= Date.parse(normalizedRange.to);
    });
  }
}

export class ReportingService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly store: InMemoryPerformanceStore,
    private readonly options: {
      cacheTtlMs?: number;
      now?: () => string;
    } = {}
  ) {}

  getCampaignReport(input: {
    campaignId: string;
    range: ReportTimeRange;
  }): ReportEnvelope<CampaignReport> {
    const range = assertRange(input.range);
    const campaignId = assertNonEmptyString(input.campaignId, 'campaignId');
    const cacheKey = `campaign:${campaignId}:${range.from}:${range.to}`;

    const cached = this.getCached<CampaignReport>(cacheKey);
    if (cached) {
      return cached;
    }

    const report = this.computeCampaignReport(campaignId, range);

    return this.cacheAndWrap(cacheKey, report, false);
  }

  getAccountReport(input: {
    clientId: string;
    range: ReportTimeRange;
  }): ReportEnvelope<AccountReport> {
    const range = assertRange(input.range);
    const clientId = assertNonEmptyString(input.clientId, 'clientId');
    const cacheKey = `account:${clientId}:${range.from}:${range.to}`;

    const cached = this.getCached<AccountReport>(cacheKey);
    if (cached) {
      return cached;
    }

    const report = this.computeAccountReport(clientId, range);

    return this.cacheAndWrap(cacheKey, report, false);
  }

  refreshReports(input: {
    accountRequests: Array<{ clientId: string; range: ReportTimeRange }>;
    campaignRequests: Array<{ campaignId: string; range: ReportTimeRange }>;
  }): number {
    let refreshed = 0;

    for (const request of input.accountRequests) {
      const range = assertRange(request.range);
      const clientId = assertNonEmptyString(request.clientId, 'clientId');
      const cacheKey = `account:${clientId}:${range.from}:${range.to}`;
      const report = this.computeAccountReport(clientId, range);
      this.cacheAndWrap(cacheKey, report, false);
      refreshed += 1;
    }

    for (const request of input.campaignRequests) {
      const range = assertRange(request.range);
      const campaignId = assertNonEmptyString(request.campaignId, 'campaignId');
      const cacheKey = `campaign:${campaignId}:${range.from}:${range.to}`;
      const report = this.computeCampaignReport(campaignId, range);
      this.cacheAndWrap(cacheKey, report, false);
      refreshed += 1;
    }

    return refreshed;
  }

  private computeCampaignReport(campaignId: string, range: ReportTimeRange): CampaignReport {
    const events = this.store.listByCampaign(campaignId, range);
    const clientId = events[0]?.clientId ?? 'unknown_client';

    const channels: ChannelRollup[] = Array.from(new Set(events.map((event) => event.channel))).map(
      (channel) => ({
        channel,
        totals: buildRollup(events.filter((event) => event.channel === channel))
      })
    );

    return {
      clientId,
      campaignId,
      range,
      totals: buildRollup(events),
      channels,
      attribution: buildAttributionRollup(events)
    };
  }

  private computeAccountReport(clientId: string, range: ReportTimeRange): AccountReport {
    const events = this.store.listByClient(clientId, range);

    const campaignIds = Array.from(new Set(events.map((event) => event.campaignId))).sort();
    const campaigns = campaignIds.map((campaignId) => ({
      campaignId,
      totals: buildRollup(events.filter((event) => event.campaignId === campaignId))
    }));

    return {
      clientId,
      range,
      totals: buildRollup(events),
      campaigns,
      attribution: buildAttributionRollup(events)
    };
  }

  private nowIso(): string {
    const now = this.options.now ? this.options.now() : new Date().toISOString();
    return assertIsoDatetime(now, 'now');
  }

  private getCached<T>(key: string): ReportEnvelope<T> | undefined {
    const now = this.nowIso();
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.parse(entry.expiresAt) <= Date.parse(now)) {
      this.cache.delete(key);
      return undefined;
    }

    return {
      report: entry.value as T,
      cache: {
        key,
        hit: true,
        cachedAt: entry.cachedAt,
        expiresAt: entry.expiresAt
      }
    };
  }

  private cacheAndWrap<T>(key: string, report: T, hit: boolean): ReportEnvelope<T> {
    const now = this.nowIso();
    const ttlMs = this.options.cacheTtlMs ?? 5 * 60_000;
    const expiresAt = new Date(Date.parse(now) + ttlMs).toISOString();

    this.cache.set(key, {
      value: report,
      cachedAt: now,
      expiresAt
    });

    return {
      report,
      cache: {
        key,
        hit,
        cachedAt: now,
        expiresAt
      }
    };
  }
}

export class ScheduledReportRefresher {
  private lastRunAt?: string;
  private readonly historyEntries: RefreshRunMetrics[] = [];

  constructor(
    private readonly service: ReportingService,
    private readonly options: {
      refreshIntervalMs: number;
      now?: () => string;
    }
  ) {}

  runIfDue(input: {
    accountRequests: Array<{ clientId: string; range: ReportTimeRange }>;
    campaignRequests: Array<{ campaignId: string; range: ReportTimeRange }>;
  }): RefreshRunMetrics {
    const now = assertIsoDatetime(this.options.now ? this.options.now() : new Date().toISOString(), 'now');

    if (
      this.lastRunAt &&
      Date.parse(now) - Date.parse(this.lastRunAt) < this.options.refreshIntervalMs
    ) {
      const skipped: RefreshRunMetrics = {
        ranAt: now,
        durationMs: 0,
        refreshedKeys: 0,
        status: 'skipped_not_due'
      };
      this.historyEntries.push(skipped);
      return skipped;
    }

    const start = Date.parse(now);
    const refreshedKeys = this.service.refreshReports(input);
    const finishedAt = this.options.now ? this.options.now() : new Date().toISOString();
    const durationMs = Math.max(0, Date.parse(finishedAt) - start);

    const metrics: RefreshRunMetrics = {
      ranAt: now,
      durationMs,
      refreshedKeys,
      status: 'ran'
    };

    this.lastRunAt = now;
    this.historyEntries.push(metrics);
    return metrics;
  }

  history(): RefreshRunMetrics[] {
    return [...this.historyEntries];
  }
}
