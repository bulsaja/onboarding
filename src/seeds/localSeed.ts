import { assertValidDomainSnapshot, DomainSnapshot } from '../domain/entities';

export function buildLocalSeedData(): DomainSnapshot {
  const snapshot: DomainSnapshot = {
    clients: [
      {
        id: 'client_acme',
        name: 'Acme Foods',
        timezone: 'Asia/Seoul',
        createdAt: '2026-04-01T00:00:00.000Z'
      }
    ],
    campaigns: [
      {
        id: 'campaign_acme_spring',
        clientId: 'client_acme',
        name: 'Acme Spring Launch',
        objective: 'lead_generation',
        startDate: '2026-04-01T00:00:00.000Z',
        endDate: '2026-06-30T23:59:59.000Z'
      }
    ],
    channels: [
      {
        id: 'channel_meta_acme',
        campaignId: 'campaign_acme_spring',
        type: 'meta_ads',
        name: 'Meta Prospecting'
      },
      {
        id: 'channel_google_acme',
        campaignId: 'campaign_acme_spring',
        type: 'google_ads',
        name: 'Google Search'
      }
    ],
    assets: [
      {
        id: 'asset_meta_video_01',
        channelId: 'channel_meta_acme',
        kind: 'video',
        uri: 's3://marketing-assets/acme/meta/video-01.mp4',
        checksum: 'sha256:meta-video-01'
      },
      {
        id: 'asset_google_copy_01',
        channelId: 'channel_google_acme',
        kind: 'copy',
        uri: 's3://marketing-assets/acme/google/copy-01.txt',
        checksum: 'sha256:google-copy-01'
      }
    ],
    metrics: [
      {
        id: 'metric_day1_impressions',
        campaignId: 'campaign_acme_spring',
        channelId: 'channel_meta_acme',
        assetId: 'asset_meta_video_01',
        metricType: 'impressions',
        windowStart: '2026-04-01T00:00:00.000Z',
        windowEnd: '2026-04-01T23:59:59.000Z',
        value: 9500
      },
      {
        id: 'metric_day1_spend',
        campaignId: 'campaign_acme_spring',
        channelId: 'channel_google_acme',
        assetId: 'asset_google_copy_01',
        metricType: 'spend',
        windowStart: '2026-04-01T00:00:00.000Z',
        windowEnd: '2026-04-01T23:59:59.000Z',
        value: 420,
        currency: 'USD'
      }
    ]
  };

  assertValidDomainSnapshot(snapshot);
  return snapshot;
}

export function buildSeedSummary(): string {
  const seedData = buildLocalSeedData();
  return [
    `clients=${seedData.clients.length}`,
    `campaigns=${seedData.campaigns.length}`,
    `channels=${seedData.channels.length}`,
    `assets=${seedData.assets.length}`,
    `metrics=${seedData.metrics.length}`
  ].join(' ');
}
