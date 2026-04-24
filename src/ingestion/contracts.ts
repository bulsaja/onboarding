import { AssetKind, ChannelType, MetricType } from '../domain/entities';

export interface CampaignIngestionPayload {
  eventId: string;
  source: string;
  receivedAt: string;
  client: {
    id: string;
    name: string;
    timezone: string;
  };
  campaign: {
    id: string;
    clientId: string;
    name: string;
    objective: string;
    startDate: string;
    endDate?: string;
  };
  channels: Array<{
    id: string;
    campaignId: string;
    type: ChannelType;
    name: string;
  }>;
  assets: Array<{
    id: string;
    channelId: string;
    kind: AssetKind;
    uri: string;
    checksum: string;
  }>;
}

export interface PerformanceIngestionPayload {
  eventId: string;
  source: string;
  receivedAt: string;
  campaignId: string;
  datapoints: Array<{
    id: string;
    channelId?: string;
    assetId?: string;
    metricType: MetricType;
    windowStart: string;
    windowEnd: string;
    value: number;
    currency?: string;
  }>;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const channelTypes = new Set<ChannelType>([
  'meta_ads',
  'google_ads',
  'tiktok_ads',
  'linkedin_ads',
  'email'
]);

const assetKinds = new Set<AssetKind>(['image', 'video', 'copy', 'landing_page']);

const metricTypes = new Set<MetricType>([
  'impressions',
  'clicks',
  'conversions',
  'spend',
  'revenue'
]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function readString(
  source: Record<string, unknown>,
  key: string,
  errors: string[],
  path: string
): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path}.${key} must be a non-empty string`);
    return '';
  }

  return value;
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string,
  errors: string[],
  path: string
): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path}.${key} must be a non-empty string when provided`);
    return undefined;
  }

  return value;
}

function readDate(
  source: Record<string, unknown>,
  key: string,
  errors: string[],
  path: string
): string {
  const value = readString(source, key, errors, path);
  if (value && Number.isNaN(Date.parse(value))) {
    errors.push(`${path}.${key} must be a valid ISO-8601 datetime`);
  }

  return value;
}

function validateEnvelope(
  source: Record<string, unknown>,
  errors: string[],
  path: string
): Pick<CampaignIngestionPayload, 'eventId' | 'source' | 'receivedAt'> {
  return {
    eventId: readString(source, 'eventId', errors, path),
    source: readString(source, 'source', errors, path),
    receivedAt: readDate(source, 'receivedAt', errors, path)
  };
}

export function validateCampaignIngestionPayload(
  input: unknown
): ValidationResult<CampaignIngestionPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const envelope = validateEnvelope(input, errors, 'payload');

  const clientInput = input.client;
  const campaignInput = input.campaign;
  const channelsInput = input.channels;
  const assetsInput = input.assets;

  if (!isRecord(clientInput)) {
    errors.push('payload.client must be an object');
  }

  if (!isRecord(campaignInput)) {
    errors.push('payload.campaign must be an object');
  }

  if (!Array.isArray(channelsInput) || channelsInput.length === 0) {
    errors.push('payload.channels must be a non-empty array');
  }

  if (!Array.isArray(assetsInput)) {
    errors.push('payload.assets must be an array');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const clientRecord = clientInput as Record<string, unknown>;
  const campaignRecord = campaignInput as Record<string, unknown>;
  const channelArray = channelsInput as unknown[];
  const assetArray = assetsInput as unknown[];

  const client = {
    id: readString(clientRecord, 'id', errors, 'payload.client'),
    name: readString(clientRecord, 'name', errors, 'payload.client'),
    timezone: readString(clientRecord, 'timezone', errors, 'payload.client')
  };

  const campaign = {
    id: readString(campaignRecord, 'id', errors, 'payload.campaign'),
    clientId: readString(campaignRecord, 'clientId', errors, 'payload.campaign'),
    name: readString(campaignRecord, 'name', errors, 'payload.campaign'),
    objective: readString(campaignRecord, 'objective', errors, 'payload.campaign'),
    startDate: readDate(campaignRecord, 'startDate', errors, 'payload.campaign'),
    endDate: readOptionalString(campaignRecord, 'endDate', errors, 'payload.campaign')
  };

  if (campaign.endDate !== undefined && Number.isNaN(Date.parse(campaign.endDate))) {
    errors.push('payload.campaign.endDate must be a valid ISO-8601 datetime when provided');
  }

  const channels = channelArray.map((entry, index) => {
    const path = `payload.channels[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object`);
      return {
        id: '',
        campaignId: '',
        type: 'meta_ads' as ChannelType,
        name: ''
      };
    }

    const typeValue = readString(entry, 'type', errors, path);
    const type = typeValue as ChannelType;
    if (!channelTypes.has(type)) {
      errors.push(`${path}.type must be one of: ${Array.from(channelTypes).join(', ')}`);
    }

    return {
      id: readString(entry, 'id', errors, path),
      campaignId: readString(entry, 'campaignId', errors, path),
      type,
      name: readString(entry, 'name', errors, path)
    };
  });

  const assets = assetArray.map((entry, index) => {
    const path = `payload.assets[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object`);
      return {
        id: '',
        channelId: '',
        kind: 'image' as AssetKind,
        uri: '',
        checksum: ''
      };
    }

    const kindValue = readString(entry, 'kind', errors, path);
    const kind = kindValue as AssetKind;
    if (!assetKinds.has(kind)) {
      errors.push(`${path}.kind must be one of: ${Array.from(assetKinds).join(', ')}`);
    }

    return {
      id: readString(entry, 'id', errors, path),
      channelId: readString(entry, 'channelId', errors, path),
      kind,
      uri: readString(entry, 'uri', errors, path),
      checksum: readString(entry, 'checksum', errors, path)
    };
  });

  if (campaign.clientId && client.id && campaign.clientId !== client.id) {
    errors.push('payload.campaign.clientId must match payload.client.id');
  }

  for (const [index, channel] of channels.entries()) {
    if (channel.campaignId && campaign.id && channel.campaignId !== campaign.id) {
      errors.push(`payload.channels[${index}].campaignId must match payload.campaign.id`);
    }
  }

  const channelIds = new Set(channels.map((entry) => entry.id));
  for (const [index, asset] of assets.entries()) {
    if (asset.channelId && !channelIds.has(asset.channelId)) {
      errors.push(`payload.assets[${index}].channelId must reference payload.channels.id`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ...envelope,
      client,
      campaign,
      channels,
      assets
    }
  };
}

export function validatePerformanceIngestionPayload(
  input: unknown
): ValidationResult<PerformanceIngestionPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const envelope = validateEnvelope(input, errors, 'payload');
  const campaignId = readString(input, 'campaignId', errors, 'payload');
  const datapointsInput = input.datapoints;

  if (!Array.isArray(datapointsInput) || datapointsInput.length === 0) {
    errors.push('payload.datapoints must be a non-empty array');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const datapointArray = datapointsInput as unknown[];

  const datapoints = datapointArray.map((entry, index) => {
    const path = `payload.datapoints[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object`);
      return {
        id: '',
        metricType: 'impressions' as MetricType,
        windowStart: '',
        windowEnd: '',
        value: 0,
        channelId: undefined,
        assetId: undefined,
        currency: undefined
      };
    }

    const metricTypeValue = readString(entry, 'metricType', errors, path);
    const metricType = metricTypeValue as MetricType;
    if (!metricTypes.has(metricType)) {
      errors.push(`${path}.metricType must be one of: ${Array.from(metricTypes).join(', ')}`);
    }

    const value = entry.value;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(`${path}.value must be a valid number`);
    }

    const windowStart = readDate(entry, 'windowStart', errors, path);
    const windowEnd = readDate(entry, 'windowEnd', errors, path);
    if (
      windowStart &&
      windowEnd &&
      !Number.isNaN(Date.parse(windowStart)) &&
      !Number.isNaN(Date.parse(windowEnd)) &&
      Date.parse(windowStart) > Date.parse(windowEnd)
    ) {
      errors.push(`${path}.windowStart must be before or equal to windowEnd`);
    }

    return {
      id: readString(entry, 'id', errors, path),
      channelId: readOptionalString(entry, 'channelId', errors, path),
      assetId: readOptionalString(entry, 'assetId', errors, path),
      metricType,
      windowStart,
      windowEnd,
      value: typeof value === 'number' ? value : 0,
      currency: readOptionalString(entry, 'currency', errors, path)
    };
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ...envelope,
      campaignId,
      datapoints
    }
  };
}
