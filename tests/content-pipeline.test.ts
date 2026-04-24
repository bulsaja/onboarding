import { describe, expect, it } from 'vitest';

import { ContentApprovalPipeline, InMemoryTemplateRegistry } from '../src/content';

function registerAdTemplate(registry: InMemoryTemplateRegistry) {
  registry.registerTemplate({
    templateId: 'tmpl_ad_copy',
    version: 1,
    contentType: 'ad_copy',
    name: 'Ad Copy v1',
    body: 'Launch {{campaign_name}} for {{audience}} with CTA {{cta}}.',
    requiredVariables: ['campaign_name', 'audience', 'cta'],
    createdBy: 'cto',
    createdAt: '2026-04-24T00:00:00.000Z'
  });
}

describe('content generation pipeline with approval gates', () => {
  it('flows draft -> review -> approved and records approval audit', () => {
    const templates = new InMemoryTemplateRegistry();
    registerAdTemplate(templates);

    const pipeline = new ContentApprovalPipeline(templates);

    const draft = pipeline.generateDraft({
      artifactId: 'artifact_001',
      campaignId: 'campaign_acme_summer',
      templateId: 'tmpl_ad_copy',
      input: {
        campaign_name: 'Acme Summer Launch',
        audience: 'B2B marketers',
        cta: 'Book a demo'
      },
      requestedBy: 'writer_01',
      requestedAt: '2026-04-24T09:00:00.000Z'
    });

    expect(draft.state).toBe('draft');
    expect(draft.renderedContent).toContain('Acme Summer Launch');

    const review = pipeline.submitForReview(
      'artifact_001',
      1,
      'writer_01',
      '2026-04-24T09:10:00.000Z'
    );
    expect(review.state).toBe('review');

    const approved = pipeline.approve(
      'artifact_001',
      1,
      'reviewer_01',
      '2026-04-24T09:20:00.000Z',
      'Looks good for launch'
    );

    expect(approved.state).toBe('approved');
    expect(approved.reviewerId).toBe('reviewer_01');
    expect(approved.reviewedAt).toBe('2026-04-24T09:20:00.000Z');

    const audit = pipeline.listAuditTrail('artifact_001');
    expect(audit.map((entry) => entry.action)).toEqual([
      'draft_generated',
      'submitted_for_review',
      'approved'
    ]);
    expect(audit[2].actorId).toBe('reviewer_01');
  });

  it('supports rejection feedback and revision re-submission', () => {
    const templates = new InMemoryTemplateRegistry();
    registerAdTemplate(templates);
    const pipeline = new ContentApprovalPipeline(templates);

    pipeline.generateDraft({
      artifactId: 'artifact_002',
      campaignId: 'campaign_acme_summer',
      templateId: 'tmpl_ad_copy',
      input: {
        campaign_name: 'Acme Summer Launch',
        audience: 'B2B marketers',
        cta: 'Click now'
      },
      requestedBy: 'writer_01',
      requestedAt: '2026-04-24T09:00:00.000Z'
    });

    pipeline.submitForReview('artifact_002', 1, 'writer_01', '2026-04-24T09:10:00.000Z');

    const rejected = pipeline.reject(
      'artifact_002',
      1,
      'reviewer_01',
      '2026-04-24T09:15:00.000Z',
      'CTA is too aggressive for this campaign'
    );

    expect(rejected.state).toBe('rejected');
    expect(rejected.reviewerComment).toBe('CTA is too aggressive for this campaign');

    const revised = pipeline.reviseRejected('artifact_002', 1, {
      requestedBy: 'writer_01',
      requestedAt: '2026-04-24T09:30:00.000Z',
      inputOverrides: {
        cta: 'Learn more'
      }
    });

    expect(revised.revision).toBe(2);
    expect(revised.state).toBe('draft');
    expect(revised.revisedFromRevision).toBe(1);
    expect(revised.renderedContent).toContain('Learn more');

    const resubmitted = pipeline.submitForReview(
      'artifact_002',
      2,
      'writer_01',
      '2026-04-24T09:32:00.000Z'
    );
    expect(resubmitted.state).toBe('review');

    const approved = pipeline.approve(
      'artifact_002',
      2,
      'reviewer_02',
      '2026-04-24T09:45:00.000Z'
    );
    expect(approved.state).toBe('approved');

    const revisions = pipeline.listRevisions('artifact_002');
    expect(revisions).toHaveLength(2);
    expect(revisions.map((entry) => entry.state)).toEqual(['rejected', 'approved']);
  });

  it('keeps generation deterministic for the same template and inputs', () => {
    const templates = new InMemoryTemplateRegistry();
    registerAdTemplate(templates);
    const pipeline = new ContentApprovalPipeline(templates);

    const first = pipeline.generateDraft({
      artifactId: 'artifact_003',
      campaignId: 'campaign_acme_summer',
      templateId: 'tmpl_ad_copy',
      input: {
        campaign_name: 'Acme Summer Launch',
        audience: 'B2B marketers',
        cta: 'Book a demo'
      },
      requestedBy: 'writer_01',
      requestedAt: '2026-04-24T10:00:00.000Z'
    });

    const second = pipeline.generateDraft({
      artifactId: 'artifact_003',
      campaignId: 'campaign_acme_summer',
      templateId: 'tmpl_ad_copy',
      input: {
        campaign_name: 'Acme Summer Launch',
        audience: 'B2B marketers',
        cta: 'Book a demo'
      },
      requestedBy: 'writer_01',
      requestedAt: '2026-04-24T10:01:00.000Z'
    });

    expect(first.renderedContent).toBe(second.renderedContent);
    expect(first.deterministicHash).toBe(second.deterministicHash);
  });

  it('returns actionable errors for invalid transitions and missing variables', () => {
    const templates = new InMemoryTemplateRegistry();
    registerAdTemplate(templates);
    const pipeline = new ContentApprovalPipeline(templates);

    expect(() =>
      pipeline.generateDraft({
        artifactId: 'artifact_004',
        campaignId: 'campaign_acme_summer',
        templateId: 'tmpl_ad_copy',
        input: {
          campaign_name: 'Acme Summer Launch',
          audience: 'B2B marketers'
        },
        requestedBy: 'writer_01',
        requestedAt: '2026-04-24T10:00:00.000Z'
      })
    ).toThrow('Missing required variable for template rendering: cta');

    const draft = pipeline.generateDraft({
      artifactId: 'artifact_004',
      campaignId: 'campaign_acme_summer',
      templateId: 'tmpl_ad_copy',
      input: {
        campaign_name: 'Acme Summer Launch',
        audience: 'B2B marketers',
        cta: 'Book a demo'
      },
      requestedBy: 'writer_01',
      requestedAt: '2026-04-24T10:00:00.000Z'
    });

    expect(draft.state).toBe('draft');

    expect(() =>
      pipeline.approve('artifact_004', 1, 'reviewer_01', '2026-04-24T10:05:00.000Z')
    ).toThrow('Cannot approve revision 1 from state draft; expected review');
  });
});
