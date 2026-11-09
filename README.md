# Work Tracker

A personal tool for tracking one person's working hours. Clock in and out each day, enter a Lunch break, and see how far ahead of or behind the Expected hours you are, this week and overall (the Balance). Incomplete Workdays raise a warning until they are fixed, and a chart shows the Balance over time.

Only Workdays are stored, one per date. A date without a Workday has no effect on any Balance (see [ADR 0001](docs/adr/0001-only-workdays-are-stored.md)). Terms such as Workday, Clock-in, Lunch break and Balance are defined in [GLOSSARY.md](GLOSSARY.md).

The backend is a thin Express and Postgres CRUD API. The frontend (React, Vite) does all the calculation.

## Prerequisites

- Node.js 24 or newer (`.nvmrc` pins 24)
- npm 11 (the repo pins 11.19.0 in `packageManager`)
- Docker with Compose, for the development database and the local stack

## Install

```bash
npm ci
```

Install scripts are restricted by `allowScripts` in the root `package.json`. Only `esbuild` and the embedded Postgres binary may run one.

## Development

```bash
npm run db:up        # Postgres on 127.0.0.1:5433 (waits until healthy)
npm run db:migrate   # apply the Drizzle migrations in backend/drizzle
npm run dev          # API on :3000 and Vite on the next free port from 5173
```

Open the URL Vite prints. It proxies `/api` to `localhost:3000`. The backend defaults to `DB_HOST=127.0.0.1` and `DB_PORT=5433`, with `DB_NAME`, `DB_USER` and `DB_PASSWORD` all `work_tracker`, matching `deploy/compose.dev.yml`. Override any of them with environment variables of the same name. `npm run db:down` stops the database; its data is kept in a Docker volume.

After changing `backend/src/database/schema.ts`, generate a migration from `backend/` with `npx drizzle-kit generate --name <name>` and commit the SQL in `backend/drizzle`. Do not edit generated SQL by hand.

## Checks and tests

```bash
npm run check          # format check, lint, typecheck, tests and build
npm test               # tests only, both workspaces
npm run test:coverage  # tests with coverage; each workspace needs 80%
```

Backend tests start an embedded Postgres per test file, so they need no running database but must run as a non-root user. Frontend tests render `<App />` in jsdom against a fake `fetch`. A Husky pre-commit hook runs `npm run check`.

## Local stack

Build and run the production images with a throwaway database, behind an nginx proxy:

```bash
docker compose -f deploy/compose.local.yml up --build -d
```

Open http://127.0.0.1:8081. The `migrate` service runs once and exits before the backend starts. `curl http://127.0.0.1:8081/api/health` returns `{"status":"ok"}`. Remove the stack and its data with:

```bash
docker compose -f deploy/compose.local.yml down -v
```

## Releasing

Releases are cut from `main` with the Release workflow in the GitHub Actions tab ("Run workflow", branch `main`). It takes no inputs: the version is the one in the root `package.json`. It builds and pushes `linux/amd64` images `ghcr.io/<owner>/work-tracker-frontend` and `ghcr.io/<owner>/work-tracker-backend` tagged `X.Y.Z`, `X.Y`, `sha-<sha>` and `latest`, then commits a patch-version bump to `main` for the next release.

The images are deployed from a separate deployment repository, which pins the released version.

## Repository settings

- Secret `RELEASE_TOKEN`: a token that can push the version bump to `main` by bypassing the branch ruleset.
- A branch ruleset on `main` (changes through pull requests, with the PR workflow's checks required).
- GHCR packages `work-tracker-frontend` and `work-tracker-backend` kept private.
- The Release workflow runs only through `workflow_dispatch`; nothing triggers it automatically.
