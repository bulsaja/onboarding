import { describe, expect, it } from 'vitest';

import { ContentApprovalPipeline, InMemoryTemplateRegistry } from '../src/content';
import { InMemoryMetaAdsConnector, PublishScheduler } from '../src/publishing';

function approvedArtifact() {
  const templates = new InMemoryTemplateRegistry();
  templates.registerTemplate({
    templateId: 'tmpl_ad_copy',
    version: 1,
    contentType: 'ad_copy',
    name: 'Ad Copy v1',
    body: 'Launch {{campaign_name}} to {{audience}} with {{cta}}',
    requiredVariables: ['campaign_name', 'audience', 'cta'],
    createdBy: 'cto',
    createdAt: '2026-04-24T00:00:00.000Z'
  });

  const pipeline = new ContentApprovalPipeline(templates);

  pipeline.generateDraft({
    artifactId: 'artifact_publish_01',
    campaignId: 'campaign_acme_summer',
    templateId: 'tmpl_ad_copy',
    input: {
      campaign_name: 'Acme Summer Launch',
      audience: 'B2B marketers',
      cta: 'Book a demo'
    },
    requestedBy: 'writer_01',
    requestedAt: '2026-05-01T00:00:00.000Z'
  });

  pipeline.submitForReview(
    'artifact_publish_01',
    1,
    'writer_01',
    '2026-05-01T00:05:00.000Z'
  );

  const approved = pipeline.approve(
    'artifact_publish_01',
    1,
    'reviewer_01',
    '2026-05-01T00:10:00.000Z'
  );

  return approved;
}

describe('publish scheduler and channel connector flow', () => {
  it('schedules and publishes approved content end-to-end with visible delivery status', async () => {
    const approved = approvedArtifact();

    const scheduler = new PublishScheduler({
      connectors: [new InMemoryMetaAdsConnector()]
    });

    scheduler.schedulePublish({
      publishId: 'publish_001',
      artifactId: approved.artifactId,
      campaignId: approved.campaignId,
      channel: 'meta_ads',
      content: approved.renderedContent,
      scheduledFor: '2026-05-01T03:00:00.000Z',
      executionWindow: {
        timezone: 'Asia/Seoul',
        startHour: 9,
        endHour: 22
      }
    });

    const processResult = await scheduler.processDuePublishes('2026-05-01T03:00:00.000Z');
    expect(processResult.processed).toBe(1);
    expect(processResult.published).toBe(1);

    const published = scheduler.getPublishRecord('publish_001');
    expect(published?.status).toBe('published');
    expect(published?.attempts).toHaveLength(1);
    expect(published?.deliveryStatus).toBe('accepted');

    scheduler.handleDeliveryStatusCallback({
      publishId: 'publish_001',
      status: 'delivered',
      receivedAt: '2026-05-01T03:10:00.000Z',
      detail: 'Meta Ads accepted and delivered'
    });

    const afterCallback = scheduler.getPublishRecord('publish_001');
    expect(afterCallback?.deliveryStatus).toBe('delivered');
    expect(afterCallback?.callbacks).toHaveLength(1);
    expect(afterCallback?.callbacks[0].detail).toBe('Meta Ads accepted and delivered');
  });

  it('retries failures and dead-letters with diagnostics after retry budget exhaustion', async () => {
    const scheduler = new PublishScheduler({
      connectors: [
        new InMemoryMetaAdsConnector({
          publish_fail: ['failure', 'failure', 'failure']
        })
      ],
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 1_000,
        multiplier: 2,
        maxDelayMs: 5_000
      }
    });

    scheduler.schedulePublish({
      publishId: 'publish_fail',
      artifactId: 'artifact_02',
      campaignId: 'campaign_acme_summer',
      channel: 'meta_ads',
      content: 'Example payload',
      scheduledFor: '2026-05-01T03:00:00.000Z',
      executionWindow: {
        timezone: 'Asia/Seoul',
        startHour: 9,
        endHour: 22
      }
    });

    const first = await scheduler.processDuePublishes('2026-05-01T03:00:00.000Z');
    expect(first.retried).toBe(1);

    const afterFirst = scheduler.getPublishRecord('publish_fail');
    expect(afterFirst?.status).toBe('retry_scheduled');
    expect(afterFirst?.nextAttemptAt).toBe('2026-05-01T03:00:01.000Z');

    const second = await scheduler.processDuePublishes('2026-05-01T03:00:01.000Z');
    expect(second.retried).toBe(1);

    const third = await scheduler.processDuePublishes('2026-05-01T03:00:03.000Z');
    expect(third.deadLettered).toBe(1);

    const deadLetter = scheduler.getPublishRecord('publish_fail');
    expect(deadLetter?.status).toBe('dead_lettered');
    expect(deadLetter?.diagnostics?.code).toBe('META_TEMPORARY_FAILURE');
    expect(deadLetter?.attempts).toHaveLength(3);

    expect(scheduler.listDeadLetters()).toHaveLength(1);
  });

  it('enforces timezone-safe execution windows at scheduling time', () => {
    const scheduler = new PublishScheduler({
      connectors: [new InMemoryMetaAdsConnector()]
    });

    expect(() =>
      scheduler.schedulePublish({
        publishId: 'publish_window_violation',
        artifactId: 'artifact_03',
        campaignId: 'campaign_acme_summer',
        channel: 'meta_ads',
        content: 'Example payload',
        scheduledFor: '2026-05-01T16:00:00.000Z',
        executionWindow: {
          timezone: 'Asia/Seoul',
          startHour: 9,
          endHour: 22
        }
      })
    ).toThrow('outside execution window');
  });
});
