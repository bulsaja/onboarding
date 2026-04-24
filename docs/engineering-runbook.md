# Engineering Runbook

## Setup

1. Ensure Node.js 20 is installed.
2. Run `npm ci`.
3. Run `./scripts/bootstrap-env.sh dev` for local setup or `./scripts/bootstrap-env.sh staging` for staging simulation.
4. Validate with `npm run check`.

## Environment Strategy

- `.env.dev.example`: local development defaults.
- `.env.staging.example`: staging-compatible defaults.
- `.env`: active local runtime file (created by bootstrap script if missing).

## CI/CD Controls

CI workflow: `.github/workflows/ci.yml`

Required gates:
- `lint`
- `test`
- `build`

All pull requests to `main` must pass required checks before merge.

## Branch Protection Policy

Target branch: `main`

Policy baseline:
- Require pull request before merge
- Require 1 approving review
- Require code owner review
- Dismiss stale approvals on new commits
- Require status checks: `lint`, `test`, `build`
- Disable force pushes and branch deletion

Enforcement command (after remote repository exists):

```bash
REPO=<owner/repo> GITHUB_TOKEN=<token> ./scripts/enforce-branch-protection.sh
```

## Release Checklist

1. Pull latest `main` and confirm CI is green.
2. Run `npm run check` locally.
3. Confirm release notes entries are complete.
4. Verify environment values for target release are present.
5. Tag release and publish artifact.
6. Validate post-release health checks.

## Incident Triage

1. Capture failing CI job and timestamp.
2. Reproduce with `npm run check`.
3. Roll back to last stable release if production impact exists.
4. Open follow-up issue with root-cause analysis and corrective actions.
