# HowZero Marketing Agency Platform Foundation

This repository contains the week-1 platform baseline for the roadmap in [HOWA-5](/HOWA/issues/HOWA-5):

- Repository structure and ownership conventions
- Environment bootstrap templates for dev and staging
- CI gates for lint, test, and build
- Engineering runbook and release checklist

It now also includes [HOWA-6](/HOWA/issues/HOWA-6) baseline artifacts:

- Core domain model (`client -> campaign -> channel -> asset -> metric`) in `src/domain`
- Ingestion contracts, validation, and idempotency-aware stubs in `src/ingestion`
- Seed fixture + strategy in `src/seeds` and `docs/seed-data-strategy.md`
- SQL migration artifacts in `migrations/`

And [HOWA-7](/HOWA/issues/HOWA-7) orchestration baseline artifacts:

- Queue abstraction + in-memory implementation in `src/orchestration/queue.ts`
- Workflow orchestration API with step registration/execution in `src/orchestration/orchestrator.ts`
- Retry/backoff and idempotency guards in `src/orchestration`
- Structured trace-aware orchestration logs and worker lifecycle controls

And [HOWA-8](/HOWA/issues/HOWA-8) campaign brief intake and planning artifacts:

- Brief intake endpoint/form schema contract in `src/planning/briefs.ts`
- Validation + normalization for brief submission payloads
- Campaign planning artifact generation from brief inputs
- Versioned plan persistence and audit history via `InMemoryCampaignPlanningStore`

And [HOWA-9](/HOWA/issues/HOWA-9) content generation and review-gate artifacts:

- Prompt/template registry for content types in `src/content/pipeline.ts`
- Deterministic rendering pipeline using stable template + input hashing
- Review state machine (`draft -> review -> approved/rejected`)
- Rejection feedback loop with revision/resubmission support
- Per-artifact audit trail for generation/review decisions

And [HOWA-10](/HOWA/issues/HOWA-10) publish execution artifacts:

- Channel connector abstraction with first concrete connector `InMemoryMetaAdsConnector`
- Timezone-safe publish scheduler with execution-window validation
- Retry with exponential backoff and dead-letter diagnostics
- Delivery status callback/webhook ingestion with state visibility

And [HOWA-11](/HOWA/issues/HOWA-11) reporting and dashboard artifacts:

- Post-publication metrics ingestion/store with validation
- Campaign + account rollups (including attribution view) in reporting service
- Reporting API contract (`account` and `campaign` report endpoints)
- Dashboard query contract with caching and refresh cadence metadata
- Scheduled refresh monitor with run history (`ran` / `skipped_not_due`)

## Repository Layout

- `src/`: application and domain source code
- `tests/`: unit tests
- `scripts/`: bootstrap and operational scripts
- `docs/`: runbooks and engineering process docs
- `.github/workflows/`: CI workflows

## Orchestration Quick Example

```ts
import { WorkflowOrchestrator } from './src/orchestration';

const orchestrator = new WorkflowOrchestrator();

orchestrator.registerStep('campaign-fanout', async ({ payload, traceId }) => {
  return {
    traceId,
    campaignId: payload.campaignId,
    status: 'scheduled'
  };
});

orchestrator.enqueueStep({
  workflowRunId: 'run_001',
  stepName: 'campaign-fanout',
  idempotencyKey: 'campaign_123',
  payload: { campaignId: 'campaign_123' }
});

await orchestrator.processNext();
```

## Brief Intake Quick Example

```ts
import { InMemoryCampaignPlanningStore, submitCampaignBrief } from './src/planning';

const store = new InMemoryCampaignPlanningStore();
const submission = submitCampaignBrief(
  {
    briefId: 'brief_launch_01',
    clientId: 'client_acme',
    requestedBy: 'ops@acme.test',
    submittedAt: '2026-04-24T00:00:00.000Z',
    campaignName: 'Acme Summer Launch',
    objective: 'lead_generation',
    timezone: 'Asia/Seoul',
    budget: { amount: 12000, currency: 'USD' },
    schedule: {
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-30T23:59:59.000Z'
    },
    targetAudience: { persona: 'B2B marketing manager', primaryRegion: 'South Korea' },
    channels: ['meta_ads', 'google_ads'],
    successMetrics: ['qualified_leads', 'cost_per_lead']
  },
  { store }
);

if (submission.status === 'accepted') {
  console.log(submission.plan.planId); // brief_launch_01:v1
}
```

## Quickstart

1. Use Node.js 20 (`nvm use`).
2. Install dependencies:

   ```bash
   npm ci
   ```

3. Bootstrap local environment files:

   ```bash
   ./scripts/bootstrap-env.sh dev
   ```

4. Run the CI-equivalent checks locally:

   ```bash
   npm run check
   ```

## Branch Protection Baseline

Apply branch protection to `main` after creating the GitHub repository:

```bash
REPO=<owner/repo> GITHUB_TOKEN=<token> ./scripts/enforce-branch-protection.sh
```

Required checks configured: `lint`, `test`, `build`.
