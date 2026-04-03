# Extreme Upgrade Report (No UI Regressions)

Date: 2026-03-22
Workspace: `/Users/nataleletteriotornatora/Documents/bndo-webapp`

## What was upgraded

- Multi-source ingestion orchestrator with source registry and SLA metadata.
- Daily full refresh + second incremental refresh route.
- Scanner response enriched with `datasetVersion`, `datasetFreshnessHours`, `coverageStatus`.
- New ops endpoint: `GET /api/ops/ingestion/health` (secret-protected).
- Security hardening:
  - production fail-closed on missing `CRON_SECRET` for ingestion jobs,
  - scanner API disabled unless full credentials are configured,
  - outbound URL policy for web search/scraping (blocks local/private targets).
- Dataset merge now includes scraped regional grants in hybrid dataset.
- Added canary checks for national/regional/CCIAA/GAL/startup coverage.
- Added ingestion run persistence migration (`scanner_ingestion_runs`).

## Validation executed

- `npm run -s typecheck`
- `npm run -s build`
- `npm run -s test:phase-a`
- `npm run -s test:phase-b`
- `npm run -s test:phase-c`
- `npm run -s test:ingestion-contract`
- `npm run -s chat:model-routing`
- `npm run -s chat:web-grounding`

## Deployment

- Preview deploy: `69bfda29d3ec2e996aa4a4c9`
- URL: `https://69bfda29d3ec2e996aa4a4c9--cheerful-cobbler-f23efc.netlify.app`

## Production checklist before go-live

1. Apply Supabase migrations, including `20260322_scanner_ingestion_runs.sql`.
2. Verify valid `SUPABASE_SERVICE_ROLE_KEY` in deployment environment.
3. Keep `CRON_SECRET` configured for job routes.
4. Keep `SERPER_API_KEY` configured for real web grounding.
5. Monitor `/api/ops/ingestion/health` for SLA breaches and coverage degradation.
