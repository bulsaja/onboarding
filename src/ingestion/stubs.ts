import { Asset, Campaign, Channel, Client, Metric } from '../domain/entities';
import {
  CampaignIngestionPayload,
  PerformanceIngestionPayload,
  validateCampaignIngestionPayload,
  validatePerformanceIngestionPayload
} from './contracts';
import {
  buildIdempotencyKey,
  IdempotencyRecord,
  IdempotencyStore,
  InMemoryIdempotencyStore
} from './idempotency';

export type IngestionResult<T> =
  | {
      status: 'accepted';
      idempotencyKey: string;
      normalized: T;
    }
  | {
      status: 'duplicate';
      idempotencyKey: string;
      duplicateOf: IdempotencyRecord;
    }
  | {
      status: 'rejected';
      errors: string[];
    };

export interface CampaignIngestionAccepted {
  client: Client;
  campaign: Campaign;
  channels: Channel[];
  assets: Asset[];
}

export interface PerformanceIngestionAccepted {
  metrics: Metric[];
}

function toCampaignDomain(payload: CampaignIngestionPayload): CampaignIngestionAccepted {
  return {
    client: {
      id: payload.client.id,
      name: payload.client.name,
      timezone: payload.client.timezone,
      createdAt: payload.receivedAt
    },
    campaign: {
      id: payload.campaign.id,
      clientId: payload.campaign.clientId,
      name: payload.campaign.name,
      objective: payload.campaign.objective,
      startDate: payload.campaign.startDate,
      endDate: payload.campaign.endDate
    },
    channels: payload.channels.map((channel) => ({
      id: channel.id,
      campaignId: channel.campaignId,
      type: channel.type,
      name: channel.name
    })),
    assets: payload.assets.map((asset) => ({
      id: asset.id,
      channelId: asset.channelId,
      kind: asset.kind,
      uri: asset.uri,
      checksum: asset.checksum
    }))
  };
}

function toPerformanceDomain(payload: PerformanceIngestionPayload): PerformanceIngestionAccepted {
  return {
    metrics: payload.datapoints.map((datapoint) => ({
      id: datapoint.id,
      campaignId: payload.campaignId,
      channelId: datapoint.channelId,
      assetId: datapoint.assetId,
      metricType: datapoint.metricType,
      windowStart: datapoint.windowStart,
      windowEnd: datapoint.windowEnd,
      value: datapoint.value,
      currency: datapoint.currency
    }))
  };
}

function recordIfFirstSeen(
  store: IdempotencyStore,
  key: string,
  kind: IdempotencyRecord['kind'],
  source: string,
  eventId: string,
  processedAt: string
): IdempotencyRecord | undefined {
  const existing = store.get(key);
  if (existing) {
    return existing;
  }

  store.put({
    key,
    kind,
    source,
    eventId,
    processedAt
  });

  return undefined;
}

export function ingestCampaignPayload(
  payload: unknown,
  options: {
    store?: IdempotencyStore;
    processedAt?: string;
  } = {}
): IngestionResult<CampaignIngestionAccepted> {
  const validation = validateCampaignIngestionPayload(payload);
  if (!validation.ok) {
    return {
      status: 'rejected',
      errors: validation.errors
    };
  }

  const store = options.store ?? new InMemoryIdempotencyStore();
  const normalized = validation.value;
  const key = buildIdempotencyKey(normalized.source, normalized.eventId);
  const processedAt = options.processedAt ?? new Date().toISOString();

  const duplicateOf = recordIfFirstSeen(
    store,
    key,
    'campaign',
    normalized.source,
    normalized.eventId,
    processedAt
  );

  if (duplicateOf) {
    return {
      status: 'duplicate',
      idempotencyKey: key,
      duplicateOf
    };
  }

  return {
    status: 'accepted',
    idempotencyKey: key,
    normalized: toCampaignDomain(normalized)
  };
}

export function ingestPerformancePayload(
  payload: unknown,
  options: {
    store?: IdempotencyStore;
    processedAt?: string;
  } = {}
): IngestionResult<PerformanceIngestionAccepted> {
  const validation = validatePerformanceIngestionPayload(payload);
  if (!validation.ok) {
    return {
      status: 'rejected',
      errors: validation.errors
    };
  }

  const store = options.store ?? new InMemoryIdempotencyStore();
  const normalized = validation.value;
  const key = buildIdempotencyKey(normalized.source, normalized.eventId);
  const processedAt = options.processedAt ?? new Date().toISOString();

  const duplicateOf = recordIfFirstSeen(
    store,
    key,
    'performance',
    normalized.source,
    normalized.eventId,
    processedAt
  );

  if (duplicateOf) {
    return {
      status: 'duplicate',
      idempotencyKey: key,
      duplicateOf
    };
  }

  return {
    status: 'accepted',
    idempotencyKey: key,
    normalized: toPerformanceDomain(normalized)
  };
}
