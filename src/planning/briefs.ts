import { ChannelType } from '../domain/entities';

export interface CampaignBriefIntakePayload {
  briefId: string;
  clientId: string;
  requestedBy: string;
  submittedAt: string;
  campaignName: string;
  objective: string;
  timezone: string;
  budget: {
    amount: number;
    currency: string;
  };
  schedule: {
    startDate: string;
    endDate: string;
  };
  targetAudience: {
    persona: string;
    primaryRegion: string;
  };
  channels: ChannelType[];
  successMetrics: string[];
  constraints?: string[];
  notes?: string;
}

export interface CampaignBrief {
  briefId: string;
  clientId: string;
  requestedBy: string;
  submittedAt: string;
  campaignName: string;
  campaignSlug: string;
  objective: string;
  timezone: string;
  budget: {
    amount: number;
    currency: string;
  };
  schedule: {
    startDate: string;
    endDate: string;
  };
  targetAudience: {
    persona: string;
    primaryRegion: string;
  };
  channels: ChannelType[];
  successMetrics: string[];
  constraints: string[];
  notes?: string;
}

export interface CampaignChannelPlan {
  channel: ChannelType;
  dailyBudget: number;
  deliverables: string[];
}

export interface CampaignPlanArtifact {
  planId: string;
  briefId: string;
  version: number;
  createdAt: string;
  createdBy: string;
  campaignName: string;
  campaignSlug: string;
  objective: string;
  budget: {
    total: number;
    daily: number;
    currency: string;
  };
  schedule: {
    startDate: string;
    endDate: string;
    durationDays: number;
  };
  targetAudience: {
    persona: string;
    primaryRegion: string;
  };
  channelPlans: CampaignChannelPlan[];
  successMetrics: string[];
  assumptions: string[];
  sourceBriefChecksum: string;
}

export interface CampaignPlanAuditEntry {
  version: number;
  createdAt: string;
  createdBy: string;
  submissionSource: 'brief_intake';
  sourceBriefChecksum: string;
}

export interface CampaignPlanVersionRecord {
  brief: CampaignBrief;
  plan: CampaignPlanArtifact;
  audit: CampaignPlanAuditEntry;
}

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      errors: string[];
    };

export type SubmitCampaignBriefResult =
  | {
      status: 'accepted';
      brief: CampaignBrief;
      plan: CampaignPlanArtifact;
      audit: CampaignPlanAuditEntry;
    }
  | {
      status: 'rejected';
      errors: string[];
    };

export const campaignBriefIntakeFormSchema = {
  endpoint: '/api/campaign-briefs',
  method: 'POST',
  required: [
    'briefId',
    'clientId',
    'requestedBy',
    'submittedAt',
    'campaignName',
    'objective',
    'timezone',
    'budget',
    'schedule',
    'targetAudience',
    'channels',
    'successMetrics'
  ],
  fields: {
    briefId: { type: 'string', minLength: 1 },
    clientId: { type: 'string', minLength: 1 },
    requestedBy: { type: 'string', minLength: 1 },
    submittedAt: { type: 'string', format: 'date-time' },
    campaignName: { type: 'string', minLength: 1 },
    objective: {
      type: 'string',
      enum: ['lead_generation', 'awareness', 'sales', 'retention', 'traffic']
    },
    timezone: { type: 'string', minLength: 1 },
    budget: {
      type: 'object',
      required: ['amount', 'currency'],
      properties: {
        amount: { type: 'number', exclusiveMinimum: 0 },
        currency: { type: 'string', enum: ['USD', 'KRW', 'EUR'] }
      }
    },
    schedule: {
      type: 'object',
      required: ['startDate', 'endDate'],
      properties: {
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' }
      }
    },
    targetAudience: {
      type: 'object',
      required: ['persona', 'primaryRegion'],
      properties: {
        persona: { type: 'string', minLength: 1 },
        primaryRegion: { type: 'string', minLength: 1 }
      }
    },
    channels: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'string',
        enum: ['meta_ads', 'google_ads', 'tiktok_ads', 'linkedin_ads', 'email']
      }
    },
    successMetrics: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 }
    },
    constraints: {
      type: 'array',
      items: { type: 'string', minLength: 1 }
    },
    notes: { type: 'string' }
  }
} as const;

const supportedObjectives = new Set(['lead_generation', 'awareness', 'sales', 'retention', 'traffic']);
const supportedCurrencies = new Set(['USD', 'KRW', 'EUR']);
const supportedChannels = new Set<ChannelType>([
  'meta_ads',
  'google_ads',
  'tiktok_ads',
  'linkedin_ads',
  'email'
]);

const channelDeliverables: Record<ChannelType, string[]> = {
  meta_ads: ['Prospecting audience setup', 'Creative variant set', 'Weekly optimization review'],
  google_ads: ['Search keyword cluster', 'Ad copy set', 'Bid strategy tuning cadence'],
  tiktok_ads: ['Short-form creative batch', 'Audience test matrix', 'Creative fatigue monitoring'],
  linkedin_ads: ['ICP segment mapping', 'Sponsored content set', 'Lead quality review'],
  email: ['Lifecycle segment definition', 'Email sequence draft', 'Delivery and CTR monitoring']
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeToken(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function toSlug(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function dedupeValues<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const unique: T[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    unique.push(value);
  }

  return unique;
}

function readString(
  source: Record<string, unknown>,
  key: string,
  errors: string[],
  path: string
): string {
  const value = source[key];
  if (typeof value !== 'string' || normalizeText(value) === '') {
    errors.push(`${path}.${key} must be a non-empty string`);
    return '';
  }

  return normalizeText(value);
}

function readDate(
  source: Record<string, unknown>,
  key: string,
  errors: string[],
  path: string
): string {
  const value = readString(source, key, errors, path);
  if (!value) {
    return value;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    errors.push(`${path}.${key} must be a valid ISO-8601 datetime`);
    return value;
  }

  return new Date(timestamp).toISOString();
}

function readOptionalStringArray(
  source: Record<string, unknown>,
  key: string,
  errors: string[],
  path: string
): string[] {
  const value = source[key];
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.push(`${path}.${key} must be an array when provided`);
    return [];
  }

  const normalizedValues: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || normalizeText(item) === '') {
      errors.push(`${path}.${key}[${index}] must be a non-empty string`);
      continue;
    }

    normalizedValues.push(normalizeText(item));
  }

  return dedupeValues(normalizedValues);
}

function readStringArray(
  source: Record<string, unknown>,
  key: string,
  errors: string[],
  path: string
): string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path}.${key} must be a non-empty array`);
    return [];
  }

  const normalizedValues: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || normalizeText(item) === '') {
      errors.push(`${path}.${key}[${index}] must be a non-empty string`);
      continue;
    }

    normalizedValues.push(normalizeText(item));
  }

  return dedupeValues(normalizedValues);
}

function checksumBrief(brief: CampaignBrief): string {
  const payload = JSON.stringify([
    brief.briefId,
    brief.clientId,
    brief.campaignName,
    brief.objective,
    brief.budget.amount,
    brief.budget.currency,
    brief.schedule.startDate,
    brief.schedule.endDate,
    brief.channels,
    brief.successMetrics,
    brief.constraints,
    brief.notes ?? ''
  ]);

  let hash = 0;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
  }

  return `brief_${hash.toString(16).padStart(8, '0')}`;
}

export function validateCampaignBriefIntakePayload(input: unknown): ValidationResult<CampaignBrief> {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const briefId = readString(input, 'briefId', errors, 'payload');
  const clientId = readString(input, 'clientId', errors, 'payload');
  const requestedBy = readString(input, 'requestedBy', errors, 'payload');
  const submittedAt = readDate(input, 'submittedAt', errors, 'payload');
  const campaignName = readString(input, 'campaignName', errors, 'payload');
  const objectiveRaw = readString(input, 'objective', errors, 'payload');
  const objective = normalizeToken(objectiveRaw);
  const timezone = readString(input, 'timezone', errors, 'payload');

  const budgetInput = input.budget;
  if (!isRecord(budgetInput)) {
    errors.push('payload.budget must be an object');
  }

  const scheduleInput = input.schedule;
  if (!isRecord(scheduleInput)) {
    errors.push('payload.schedule must be an object');
  }

  const audienceInput = input.targetAudience;
  if (!isRecord(audienceInput)) {
    errors.push('payload.targetAudience must be an object');
  }

  const channelsRaw = readStringArray(input, 'channels', errors, 'payload');
  const successMetricsRaw = readStringArray(input, 'successMetrics', errors, 'payload');
  const constraints = readOptionalStringArray(input, 'constraints', errors, 'payload');

  if (!supportedObjectives.has(objective)) {
    errors.push(`payload.objective must be one of: ${Array.from(supportedObjectives).join(', ')}`);
  }

  const channels = channelsRaw.map((value, index) => {
    const normalized = normalizeToken(value) as ChannelType;
    if (!supportedChannels.has(normalized)) {
      errors.push(
        `payload.channels[${index}] must be one of: ${Array.from(supportedChannels).join(', ')}`
      );
    }

    return normalized;
  });

  const successMetrics = dedupeValues(successMetricsRaw.map((value) => normalizeToken(value)));

  const budgetRecord = isRecord(budgetInput) ? budgetInput : {};
  const budgetCurrency = readString(budgetRecord, 'currency', errors, 'payload.budget').toUpperCase();
  if (budgetCurrency && !supportedCurrencies.has(budgetCurrency)) {
    errors.push(`payload.budget.currency must be one of: ${Array.from(supportedCurrencies).join(', ')}`);
  }

  const budgetAmountRaw = budgetRecord.amount;
  const budgetAmount =
    typeof budgetAmountRaw === 'number' && Number.isFinite(budgetAmountRaw) ? budgetAmountRaw : NaN;

  if (Number.isNaN(budgetAmount)) {
    errors.push('payload.budget.amount must be a valid number');
  } else if (budgetAmount <= 0) {
    errors.push('payload.budget.amount must be greater than 0');
  }

  const scheduleRecord = isRecord(scheduleInput) ? scheduleInput : {};
  const startDate = readDate(scheduleRecord, 'startDate', errors, 'payload.schedule');
  const endDate = readDate(scheduleRecord, 'endDate', errors, 'payload.schedule');

  if (
    startDate &&
    endDate &&
    !Number.isNaN(Date.parse(startDate)) &&
    !Number.isNaN(Date.parse(endDate)) &&
    Date.parse(startDate) > Date.parse(endDate)
  ) {
    errors.push('payload.schedule.startDate must be before or equal to payload.schedule.endDate');
  }

  const audienceRecord = isRecord(audienceInput) ? audienceInput : {};
  const persona = readString(audienceRecord, 'persona', errors, 'payload.targetAudience');
  const primaryRegion = readString(audienceRecord, 'primaryRegion', errors, 'payload.targetAudience');

  const notesValue = input.notes;
  let notes: string | undefined;
  if (notesValue !== undefined) {
    if (typeof notesValue !== 'string') {
      errors.push('payload.notes must be a string when provided');
    } else if (normalizeText(notesValue) !== '') {
      notes = normalizeText(notesValue);
    }
  }

  if (successMetrics.length === 0) {
    errors.push('payload.successMetrics must include at least one metric');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      briefId,
      clientId,
      requestedBy,
      submittedAt,
      campaignName,
      campaignSlug: toSlug(campaignName),
      objective,
      timezone,
      budget: {
        amount: budgetAmount,
        currency: budgetCurrency
      },
      schedule: {
        startDate,
        endDate
      },
      targetAudience: {
        persona,
        primaryRegion
      },
      channels,
      successMetrics,
      constraints,
      notes
    }
  };
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function buildAssumptions(brief: CampaignBrief): string[] {
  const assumptions = [
    `Timezone anchored to ${brief.timezone}`,
    `Primary region focus: ${brief.targetAudience.primaryRegion}`,
    'Weekly optimization loop with cross-channel budget rebalancing'
  ];

  for (const constraint of brief.constraints) {
    assumptions.push(`Constraint: ${constraint}`);
  }

  return assumptions;
}

export function buildCampaignPlanArtifact(
  brief: CampaignBrief,
  version: number,
  createdAt: string
): CampaignPlanArtifact {
  const startTimestamp = Date.parse(brief.schedule.startDate);
  const endTimestamp = Date.parse(brief.schedule.endDate);
  const durationDays = Math.max(1, Math.floor((endTimestamp - startTimestamp) / 86_400_000) + 1);
  const dailyBudget = roundCurrency(brief.budget.amount / durationDays);
  const perChannelDailyBudget = roundCurrency(dailyBudget / brief.channels.length);

  return {
    planId: `${brief.briefId}:v${version}`,
    briefId: brief.briefId,
    version,
    createdAt,
    createdBy: brief.requestedBy,
    campaignName: brief.campaignName,
    campaignSlug: brief.campaignSlug,
    objective: brief.objective,
    budget: {
      total: brief.budget.amount,
      daily: dailyBudget,
      currency: brief.budget.currency
    },
    schedule: {
      startDate: brief.schedule.startDate,
      endDate: brief.schedule.endDate,
      durationDays
    },
    targetAudience: {
      persona: brief.targetAudience.persona,
      primaryRegion: brief.targetAudience.primaryRegion
    },
    channelPlans: brief.channels.map((channel) => ({
      channel,
      dailyBudget: perChannelDailyBudget,
      deliverables: channelDeliverables[channel]
    })),
    successMetrics: brief.successMetrics,
    assumptions: buildAssumptions(brief),
    sourceBriefChecksum: checksumBrief(brief)
  };
}

export class InMemoryCampaignPlanningStore {
  private readonly recordsByBriefId = new Map<string, CampaignPlanVersionRecord[]>();

  saveVersion(brief: CampaignBrief, createdAt = new Date().toISOString()): CampaignPlanVersionRecord {
    const records = this.recordsByBriefId.get(brief.briefId) ?? [];
    const version = records.length + 1;
    const plan = buildCampaignPlanArtifact(brief, version, createdAt);

    const record: CampaignPlanVersionRecord = {
      brief,
      plan,
      audit: {
        version,
        createdAt,
        createdBy: brief.requestedBy,
        submissionSource: 'brief_intake',
        sourceBriefChecksum: plan.sourceBriefChecksum
      }
    };

    this.recordsByBriefId.set(brief.briefId, [...records, record]);
    return record;
  }

  listPlanVersions(briefId: string): CampaignPlanArtifact[] {
    return (this.recordsByBriefId.get(briefId) ?? []).map((record) => record.plan);
  }

  getPlanVersion(briefId: string, version: number): CampaignPlanArtifact | undefined {
    return (this.recordsByBriefId.get(briefId) ?? []).find((record) => record.plan.version === version)
      ?.plan;
  }

  listAuditEntries(briefId: string): CampaignPlanAuditEntry[] {
    return (this.recordsByBriefId.get(briefId) ?? []).map((record) => record.audit);
  }
}

export function submitCampaignBrief(
  payload: unknown,
  options: {
    store?: InMemoryCampaignPlanningStore;
    now?: () => string;
  } = {}
): SubmitCampaignBriefResult {
  const validation = validateCampaignBriefIntakePayload(payload);
  if (!validation.ok) {
    return {
      status: 'rejected',
      errors: validation.errors
    };
  }

  const store = options.store ?? new InMemoryCampaignPlanningStore();
  const createdAt = options.now ? options.now() : new Date().toISOString();
  const record = store.saveVersion(validation.value, createdAt);

  return {
    status: 'accepted',
    brief: record.brief,
    plan: record.plan,
    audit: record.audit
  };
}
