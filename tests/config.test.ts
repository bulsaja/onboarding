import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config';

describe('readConfig', () => {
  it('returns a typed config when required keys exist', () => {
    const config = readConfig({
      APP_ENV: 'dev',
      API_BASE_URL: 'https://api.dev.howzero.local',
      QUEUE_NAME: 'marketing-dev',
      LOG_LEVEL: 'debug'
    });

    expect(config.appEnv).toBe('dev');
    expect(config.queueName).toBe('marketing-dev');
  });

  it('throws when a required key is missing', () => {
    expect(() =>
      readConfig({
        APP_ENV: 'dev',
        API_BASE_URL: 'https://api.dev.howzero.local',
        LOG_LEVEL: 'debug'
      })
    ).toThrow(/QUEUE_NAME/);
  });

  it('throws when APP_ENV is invalid', () => {
    expect(() =>
      readConfig({
        APP_ENV: 'prod',
        API_BASE_URL: 'https://api.dev.howzero.local',
        QUEUE_NAME: 'marketing-dev',
        LOG_LEVEL: 'debug'
      })
    ).toThrow(/APP_ENV/);
  });
});
