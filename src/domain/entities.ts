export type Id = string;

export type ChannelType = 'meta_ads' | 'google_ads' | 'tiktok_ads' | 'linkedin_ads' | 'email';

export type AssetKind = 'image' | 'video' | 'copy' | 'landing_page';

export type MetricType = 'impressions' | 'clicks' | 'conversions' | 'spend' | 'revenue';

export interface Client {
  id: Id;
  name: string;
  timezone: string;
  createdAt: string;
}

export interface Campaign {
  id: Id;
  clientId: Id;
  name: string;
  objective: string;
  startDate: string;
  endDate?: string;
}

export interface Channel {
  id: Id;
  campaignId: Id;
  type: ChannelType;
  name: string;
}

export interface Asset {
  id: Id;
  channelId: Id;
  kind: AssetKind;
  uri: string;
  checksum: string;
}

export interface Metric {
  id: Id;
  campaignId: Id;
  channelId?: Id;
  assetId?: Id;
  metricType: MetricType;
  windowStart: string;
  windowEnd: string;
  value: number;
  currency?: string;
}

export interface DomainSnapshot {
  clients: Client[];
  campaigns: Campaign[];
  channels: Channel[];
  assets: Asset[];
  metrics: Metric[];
}

function pushDuplicateErrors(entity: string, values: Id[], errors: string[]): void {
  const seen = new Set<Id>();
  for (const value of values) {
    if (seen.has(value)) {
      errors.push(`Duplicate ${entity} id: ${value}`);
      continue;
    }

    seen.add(value);
  }
}

export function validateDomainSnapshot(snapshot: DomainSnapshot): string[] {
  const errors: string[] = [];

  pushDuplicateErrors(
    'client',
    snapshot.clients.map((entity) => entity.id),
    errors
  );
  pushDuplicateErrors(
    'campaign',
    snapshot.campaigns.map((entity) => entity.id),
    errors
  );
  pushDuplicateErrors(
    'channel',
    snapshot.channels.map((entity) => entity.id),
    errors
  );
  pushDuplicateErrors(
    'asset',
    snapshot.assets.map((entity) => entity.id),
    errors
  );
  pushDuplicateErrors(
    'metric',
    snapshot.metrics.map((entity) => entity.id),
    errors
  );

  const clientIds = new Set(snapshot.clients.map((entity) => entity.id));
  const campaignById = new Map(snapshot.campaigns.map((entity) => [entity.id, entity]));
  const channelById = new Map(snapshot.channels.map((entity) => [entity.id, entity]));
  const assetById = new Map(snapshot.assets.map((entity) => [entity.id, entity]));

  for (const campaign of snapshot.campaigns) {
    if (!clientIds.has(campaign.clientId)) {
      errors.push(`Campaign ${campaign.id} references missing client ${campaign.clientId}`);
    }
  }

  for (const channel of snapshot.channels) {
    if (!campaignById.has(channel.campaignId)) {
      errors.push(`Channel ${channel.id} references missing campaign ${channel.campaignId}`);
    }
  }

  for (const asset of snapshot.assets) {
    if (!channelById.has(asset.channelId)) {
      errors.push(`Asset ${asset.id} references missing channel ${asset.channelId}`);
    }
  }

  for (const metric of snapshot.metrics) {
    const campaign = campaignById.get(metric.campaignId);
    if (!campaign) {
      errors.push(`Metric ${metric.id} references missing campaign ${metric.campaignId}`);
    }

    if (metric.channelId) {
      const channel = channelById.get(metric.channelId);
      if (!channel) {
        errors.push(`Metric ${metric.id} references missing channel ${metric.channelId}`);
      } else if (channel.campaignId !== metric.campaignId) {
        errors.push(
          `Metric ${metric.id} channel ${metric.channelId} is not part of campaign ${metric.campaignId}`
        );
      }
    }

    if (metric.assetId) {
      const asset = assetById.get(metric.assetId);
      if (!asset) {
        errors.push(`Metric ${metric.id} references missing asset ${metric.assetId}`);
      } else if (metric.channelId && asset.channelId !== metric.channelId) {
        errors.push(
          `Metric ${metric.id} asset ${metric.assetId} does not belong to channel ${metric.channelId}`
        );
      }
    }

    if (metric.value < 0) {
      errors.push(`Metric ${metric.id} has a negative value`);
    }

    const windowStart = Date.parse(metric.windowStart);
    const windowEnd = Date.parse(metric.windowEnd);
    if (Number.isNaN(windowStart) || Number.isNaN(windowEnd)) {
      errors.push(`Metric ${metric.id} has an invalid time window`);
    } else if (windowStart > windowEnd) {
      errors.push(`Metric ${metric.id} has windowStart after windowEnd`);
    }
  }

  return errors;
}

export function assertValidDomainSnapshot(snapshot: DomainSnapshot): void {
  const errors = validateDomainSnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`Domain snapshot validation failed:\n- ${errors.join('\n- ')}`);
  }
}
