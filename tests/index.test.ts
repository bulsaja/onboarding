import { describe, expect, it } from 'vitest';
import { buildStartupSummary } from '../src/index';

describe('buildStartupSummary', () => {
  it('formats startup details for logs', () => {
    const summary = buildStartupSummary({
      APP_ENV: 'staging',
      API_BASE_URL: 'https://api.staging.howzero.local',
      QUEUE_NAME: 'marketing-staging',
      LOG_LEVEL: 'info'
    });

    expect(summary).toContain('environment=staging');
    expect(summary).toContain('queue=marketing-staging');
  });
});
