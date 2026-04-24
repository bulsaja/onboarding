import { describe, expect, it } from 'vitest';
import { InMemoryIdempotencyStore } from '../src/ingestion/idempotency';
import { ingestCampaignPayload, ingestPerformancePayload } from '../src/ingestion/stubs';

function validCampaignPayload() {
  return {
    eventId: 'evt_campaign_001',
    source: 'meta_ads',
    receivedAt: '2026-04-20T09:00:00.000Z',
    client: {
      id: 'client_acme',
      name: 'Acme Foods',
      timezone: 'Asia/Seoul'
    },
    campaign: {
      id: 'campaign_acme_spring',
      clientId: 'client_acme',
      name: 'Acme Spring Launch',
      objective: 'lead_generation',
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-06-30T23:59:59.000Z'
    },
    channels: [
      {
        id: 'channel_meta_acme',
        campaignId: 'campaign_acme_spring',
        type: 'meta_ads',
        name: 'Meta Prospecting'
      }
    ],
    assets: [
      {
        id: 'asset_meta_video_01',
        channelId: 'channel_meta_acme',
        kind: 'video',
        uri: 's3://marketing-assets/acme/meta/video-01.mp4',
        checksum: 'sha256:meta-video-01'
      }
    ]
  };
}

function validPerformancePayload() {
  return {
    eventId: 'evt_perf_001',
    source: 'meta_ads',
    receivedAt: '2026-04-20T09:05:00.000Z',
    campaignId: 'campaign_acme_spring',
    datapoints: [
      {
        id: 'metric_day1_clicks',
        channelId: 'channel_meta_acme',
        assetId: 'asset_meta_video_01',
        metricType: 'clicks',
        windowStart: '2026-04-20T00:00:00.000Z',
        windowEnd: '2026-04-20T23:59:59.000Z',
        value: 324
      }
    ]
  };
}

describe('ingestion contracts', () => {
  it('accepts valid campaign payload and marks duplicate retries', () => {
    const store = new InMemoryIdempotencyStore();

    const first = ingestCampaignPayload(validCampaignPayload(), { store });
    expect(first.status).toBe('accepted');

    const second = ingestCampaignPayload(validCampaignPayload(), { store });
    expect(second.status).toBe('duplicate');
  });

  it('rejects malformed campaign payload', () => {
    const malformed = {
      eventId: 'evt_campaign_bad',
      source: 'meta_ads',
      receivedAt: 'not-a-date',
      client: { id: '', name: 'Acme Foods', timezone: 'Asia/Seoul' },
      campaign: {
        id: 'campaign_bad',
        clientId: 'client_acme',
        name: 'Bad',
        objective: 'lead_generation',
        startDate: '2026-04-01T00:00:00.000Z'
      },
      channels: [],
      assets: []
    };

    const result = ingestCampaignPayload(malformed);
    expect(result.status).toBe('rejected');
  });

  it('accepts valid performance payload and normalizes metrics', () => {
    const store = new InMemoryIdempotencyStore();
    const result = ingestPerformancePayload(validPerformancePayload(), { store });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.normalized.metrics).toHaveLength(1);
      expect(result.normalized.metrics[0].campaignId).toBe('campaign_acme_spring');
      expect(result.normalized.metrics[0].metricType).toBe('clicks');
    }
  });

  it('rejects malformed performance payload', () => {
    const malformed = {
      eventId: 'evt_perf_bad',
      source: 'meta_ads',
      receivedAt: '2026-04-20T09:05:00.000Z',
      campaignId: 'campaign_acme_spring',
      datapoints: [
        {
          id: 'metric_bad',
          metricType: 'unknown',
          windowStart: '2026-04-21T00:00:00.000Z',
          windowEnd: '2026-04-20T00:00:00.000Z',
          value: 'bad-number'
        }
      ]
    };

    const result = ingestPerformancePayload(malformed);
    expect(result.status).toBe('rejected');
  });
});
