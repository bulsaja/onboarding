import { ChannelType } from '../domain/entities';

export type PublishLifecycleStatus =
  | 'scheduled'
  | 'retry_scheduled'
  | 'published'
  | 'dead_lettered';

export type DeliveryStatus = 'accepted' | 'delivered' | 'failed' | 'opened' | 'clicked';

export interface ExecutionWindow {
  timezone: string;
  startHour: number;
  endHour: number;
}

export interface SchedulePublishRequest {
  publishId: string;
  artifactId: string;
  campaignId: string;
  channel: ChannelType;
  content: string;
  scheduledFor: string;
  executionWindow: ExecutionWindow;
}

export interface DeliveryStatusCallback {
  publishId: string;
  status: Exclude<DeliveryStatus, 'accepted'>;
  receivedAt: string;
  detail?: string;
}

export interface PublishConnectorRequest {
  publishId: string;
  artifactId: string;
  campaignId: string;
  channel: ChannelType;
  content: string;
  attempt: number;
  scheduledFor: string;
  executedAt: string;
}

export interface PublishConnectorResult {
  externalMessageId: string;
  acceptedAt: string;
}

export interface PublishConnector {
  channel: ChannelType;
  publish(input: PublishConnectorRequest): Promise<PublishConnectorResult>;
}

export class PublishConnectorError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PublishConnectorError';
  }
}

export interface PublishAttempt {
  attempt: number;
  at: string;
  outcome: 'success' | 'failure';
  detail: string;
}

export interface PublishAuditEvent {
  at: string;
  action:
    | 'scheduled'
    | 'retry_scheduled'
    | 'publish_succeeded'
    | 'publish_failed'
    | 'dead_lettered'
    | 'delivery_callback';
  detail: string;
}

export interface PublishRecord {
  publishId: string;
  artifactId: string;
  campaignId: string;
  channel: ChannelType;
  content: string;
  scheduledFor: string;
  executionWindow: ExecutionWindow;
  status: PublishLifecycleStatus;
  deliveryStatus: DeliveryStatus;
  attempts: PublishAttempt[];
  nextAttemptAt?: string;
  externalMessageId?: string;
  diagnostics?: {
    code: string;
    message: string;
    failedAt: string;
  };
  callbacks: DeliveryStatusCallback[];
  auditTrail: PublishAuditEvent[];
}

export interface ProcessPublishResult {
  processed: number;
  published: number;
  retried: number;
  deadLettered: number;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function assertIsoDatetime(value: string, label: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid ISO-8601 datetime`);
  }

  return new Date(timestamp).toISOString();
}

function assertNonEmptyString(value: string, label: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return normalized;
}

function assertExecutionWindow(window: ExecutionWindow): ExecutionWindow {
  const timezone = assertNonEmptyString(window.timezone, 'executionWindow.timezone');

  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`executionWindow.timezone is invalid: ${timezone}`);
  }

  const startHour = window.startHour;
  const endHour = window.endHour;

  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new Error('executionWindow.startHour must be an integer between 0 and 23');
  }

  if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
    throw new Error('executionWindow.endHour must be an integer between 1 and 24');
  }

  if (startHour >= endHour) {
    throw new Error('executionWindow.startHour must be less than executionWindow.endHour');
  }

  return {
    timezone,
    startHour,
    endHour
  };
}

function getHourInTimezone(isoTimestamp: string, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit'
  });

  const parts = formatter.formatToParts(new Date(isoTimestamp));
  const hourPart = parts.find((entry) => entry.type === 'hour');
  if (!hourPart) {
    throw new Error(`Failed to resolve timezone-local hour for ${timezone}`);
  }

  return Number(hourPart.value);
}

function ensureInsideExecutionWindow(scheduledFor: string, window: ExecutionWindow): void {
  const localHour = getHourInTimezone(scheduledFor, window.timezone);
  if (localHour < window.startHour || localHour >= window.endHour) {
    throw new Error(
      `scheduledFor (${scheduledFor}) is outside execution window ${window.startHour}:00-${window.endHour}:00 in ${window.timezone}`
    );
  }
}

function toConnectorError(error: unknown): PublishConnectorError {
  if (error instanceof PublishConnectorError) {
    return error;
  }

  if (error instanceof Error) {
    return new PublishConnectorError(error.message, 'UNKNOWN_CONNECTOR_ERROR');
  }

  return new PublishConnectorError('Unknown publish connector failure', 'UNKNOWN_CONNECTOR_ERROR');
}

function computeRetryDelayMs(
  attempt: number,
  retryPolicy: {
    maxAttempts: number;
    initialDelayMs: number;
    multiplier: number;
    maxDelayMs: number;
  }
): number {
  const exponentialDelay = retryPolicy.initialDelayMs * retryPolicy.multiplier ** Math.max(0, attempt - 1);
  return Math.min(exponentialDelay, retryPolicy.maxDelayMs);
}

export class InMemoryMetaAdsConnector implements PublishConnector {
  readonly channel: ChannelType = 'meta_ads';

  private readonly outcomesByPublishId = new Map<string, Array<'success' | 'failure'>>();

  constructor(seedOutcomes: Record<string, Array<'success' | 'failure'>> = {}) {
    for (const [publishId, outcomes] of Object.entries(seedOutcomes)) {
      this.outcomesByPublishId.set(publishId, [...outcomes]);
    }
  }

  async publish(input: PublishConnectorRequest): Promise<PublishConnectorResult> {
    const plannedOutcomes = this.outcomesByPublishId.get(input.publishId) ?? [];
    const outcome = plannedOutcomes.shift() ?? 'success';
    this.outcomesByPublishId.set(input.publishId, plannedOutcomes);

    if (outcome === 'failure') {
      throw new PublishConnectorError(
        `Meta Ads connector temporary failure for ${input.publishId}`,
        'META_TEMPORARY_FAILURE'
      );
    }

    return {
      externalMessageId: `meta_${input.publishId}_${input.attempt}`,
      acceptedAt: input.executedAt
    };
  }
}

export class PublishScheduler {
  private readonly connectorsByChannel = new Map<ChannelType, PublishConnector>();
  private readonly recordsByPublishId = new Map<string, PublishRecord>();

  private readonly retryPolicy: {
    maxAttempts: number;
    initialDelayMs: number;
    multiplier: number;
    maxDelayMs: number;
  };

  constructor(options: {
    connectors: PublishConnector[];
    retryPolicy?: {
      maxAttempts: number;
      initialDelayMs: number;
      multiplier: number;
      maxDelayMs: number;
    };
  }) {
    for (const connector of options.connectors) {
      this.connectorsByChannel.set(connector.channel, connector);
    }

    this.retryPolicy = options.retryPolicy ?? {
      maxAttempts: 3,
      initialDelayMs: 60_000,
      multiplier: 2,
      maxDelayMs: 15 * 60_000
    };
  }

  schedulePublish(request: SchedulePublishRequest): PublishRecord {
    const publishId = assertNonEmptyString(request.publishId, 'publishId');
    const artifactId = assertNonEmptyString(request.artifactId, 'artifactId');
    const campaignId = assertNonEmptyString(request.campaignId, 'campaignId');
    const content = assertNonEmptyString(request.content, 'content');
    const scheduledFor = assertIsoDatetime(request.scheduledFor, 'scheduledFor');
    const executionWindow = assertExecutionWindow(request.executionWindow);

    ensureInsideExecutionWindow(scheduledFor, executionWindow);

    if (this.recordsByPublishId.has(publishId)) {
      throw new Error(`publishId already exists: ${publishId}`);
    }

    const connector = this.connectorsByChannel.get(request.channel);
    if (!connector) {
      throw new Error(`No connector configured for channel ${request.channel}`);
    }

    const record: PublishRecord = {
      publishId,
      artifactId,
      campaignId,
      channel: connector.channel,
      content,
      scheduledFor,
      executionWindow,
      status: 'scheduled',
      deliveryStatus: 'accepted',
      attempts: [],
      nextAttemptAt: scheduledFor,
      callbacks: [],
      auditTrail: [
        {
          at: new Date().toISOString(),
          action: 'scheduled',
          detail: `scheduled_for=${scheduledFor}`
        }
      ]
    };

    this.recordsByPublishId.set(record.publishId, record);
    return { ...record };
  }

  async processDuePublishes(now: string): Promise<ProcessPublishResult> {
    const nowIso = assertIsoDatetime(now, 'now');
    const nowTimestamp = Date.parse(nowIso);

    const result: ProcessPublishResult = {
      processed: 0,
      published: 0,
      retried: 0,
      deadLettered: 0
    };

    for (const record of this.recordsByPublishId.values()) {
      if (record.status !== 'scheduled' && record.status !== 'retry_scheduled') {
        continue;
      }

      if (!record.nextAttemptAt || Date.parse(record.nextAttemptAt) > nowTimestamp) {
        continue;
      }

      const connector = this.connectorsByChannel.get(record.channel);
      if (!connector) {
        const failedAt = nowIso;
        record.status = 'dead_lettered';
        record.diagnostics = {
          code: 'NO_CONNECTOR',
          message: `No connector configured for channel ${record.channel}`,
          failedAt
        };
        record.auditTrail.push({
          at: failedAt,
          action: 'dead_lettered',
          detail: record.diagnostics.message
        });
        result.processed += 1;
        result.deadLettered += 1;
        continue;
      }

      const attempt = record.attempts.length + 1;
      result.processed += 1;

      try {
        const publishResult = await connector.publish({
          publishId: record.publishId,
          artifactId: record.artifactId,
          campaignId: record.campaignId,
          channel: record.channel,
          content: record.content,
          attempt,
          scheduledFor: record.scheduledFor,
          executedAt: nowIso
        });

        record.attempts.push({
          attempt,
          at: nowIso,
          outcome: 'success',
          detail: publishResult.externalMessageId
        });
        record.status = 'published';
        record.externalMessageId = publishResult.externalMessageId;
        record.nextAttemptAt = undefined;
        record.deliveryStatus = 'accepted';
        record.auditTrail.push({
          at: nowIso,
          action: 'publish_succeeded',
          detail: `external_message_id=${publishResult.externalMessageId}`
        });
        result.published += 1;
      } catch (error) {
        const connectorError = toConnectorError(error);

        record.attempts.push({
          attempt,
          at: nowIso,
          outcome: 'failure',
          detail: `${connectorError.code}: ${connectorError.message}`
        });

        record.auditTrail.push({
          at: nowIso,
          action: 'publish_failed',
          detail: `${connectorError.code}: ${connectorError.message}`
        });

        if (attempt < this.retryPolicy.maxAttempts) {
          const delayMs = computeRetryDelayMs(attempt, this.retryPolicy);
          const nextAttemptAt = new Date(nowTimestamp + delayMs).toISOString();

          record.status = 'retry_scheduled';
          record.nextAttemptAt = nextAttemptAt;
          record.auditTrail.push({
            at: nowIso,
            action: 'retry_scheduled',
            detail: `next_attempt_at=${nextAttemptAt}`
          });
          result.retried += 1;
          continue;
        }

        record.status = 'dead_lettered';
        record.nextAttemptAt = undefined;
        record.diagnostics = {
          code: connectorError.code,
          message: connectorError.message,
          failedAt: nowIso
        };
        record.auditTrail.push({
          at: nowIso,
          action: 'dead_lettered',
          detail: `${connectorError.code}: ${connectorError.message}`
        });
        result.deadLettered += 1;
      }
    }

    return result;
  }

  handleDeliveryStatusCallback(callback: DeliveryStatusCallback): PublishRecord {
    const publishId = assertNonEmptyString(callback.publishId, 'callback.publishId');
    const record = this.recordsByPublishId.get(publishId);
    if (!record) {
      throw new Error(`publishId not found for callback: ${publishId}`);
    }

    const receivedAt = assertIsoDatetime(callback.receivedAt, 'callback.receivedAt');

    const detail = callback.detail ? normalizeText(callback.detail) : undefined;
    const normalizedCallback: DeliveryStatusCallback = {
      publishId,
      status: callback.status,
      receivedAt,
      detail
    };

    record.callbacks.push(normalizedCallback);
    record.deliveryStatus = callback.status;
    record.auditTrail.push({
      at: receivedAt,
      action: 'delivery_callback',
      detail: `${callback.status}${detail ? `: ${detail}` : ''}`
    });

    return { ...record };
  }

  getPublishRecord(publishId: string): PublishRecord | undefined {
    const record = this.recordsByPublishId.get(publishId);
    return record ? { ...record } : undefined;
  }

  listDeadLetters(): PublishRecord[] {
    return Array.from(this.recordsByPublishId.values())
      .filter((record) => record.status === 'dead_lettered')
      .map((record) => ({ ...record }));
  }
}
