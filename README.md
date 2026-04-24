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
