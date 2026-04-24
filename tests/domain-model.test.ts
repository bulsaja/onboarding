import { describe, expect, it } from 'vitest';
import { validateDomainSnapshot } from '../src/domain/entities';
import { buildLocalSeedData } from '../src/seeds/localSeed';

describe('domain model relationships', () => {
  it('keeps all seeded references valid', () => {
    const seed = buildLocalSeedData();
    const errors = validateDomainSnapshot(seed);
    expect(errors).toEqual([]);
  });

  it('flags broken campaign relationships', () => {
    const seed = buildLocalSeedData();
    seed.channels[0].campaignId = 'campaign_missing';
    const errors = validateDomainSnapshot(seed);

    expect(errors.some((error) => error.includes('missing campaign'))).toBe(true);
  });
});
