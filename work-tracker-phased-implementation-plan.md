# Work Tracker: implementation plan

This plan is for an orchestrating agent and the worker agents it dispatches. Every design decision below is settled, so workers implement it and do not reopen it. If a worker finds that a decision cannot be implemented as written, it stops and reports to the orchestrator.

## 1. Product summary

A single-user tracker of working hours. One Postgres table holds one row per date. The backend is a thin CRUD API. The frontend does all calculation and shows the current-week and overall Balance, warnings for Incomplete Workdays, a today card for clocking in and out, a Balance chart and an editable history.

Read these before doing anything:

- `GLOSSARY.md`: the required vocabulary for code, tests and UI text. Say Workday, Clock-in, Clock-out, Lunch break, Half day, Worked hours, Expected hours, Balance and Incomplete Workday. Never say shift, record or entry.
- `docs/adr/0001-only-workdays-are-stored.md`: why days off are not stored.

Reference implementation: `/home/bkovacs/Personal/car-tracker`. Deployment repo: `/home/bkovacs/Personal/docker-services`. Treat car-tracker as the model for anything this plan does not specify.

### Business rules

| Rule | Detail |
| --- | --- |
| One Workday per date | The date is the primary key. A second Clock-in on the same date is a 409. |
| Missing dates | No effect on any Balance and no warning (ADR 0001). |
| Expected hours | 480 minutes, or 240 on a Half day. There is no calendar logic: a logged Sunday also expects 480. |
| Worked hours | Clock-out minus Clock-in minus Lunch break, in minutes. |
| Complete | Has a Clock-out and a Lunch break. A Lunch break of 0 is a value; `null` means not entered. |
| Incomplete Workday | Counts toward no Balance. Warned about only when its date is before today. |
| Time format | Local `HH:MM`, 24-hour, minute precision. No timezone handling. "Now" and "today" come from the browser. |
| Time validity | Clock-out is strictly later than Clock-in, with no overnight spans. When both are set, Lunch break is strictly shorter than Clock-out minus Clock-in. |
| Current week | Monday to Sunday, containing today. The Balance sums complete Workdays dated from Monday through today. |
| Overall | All complete Workdays dated up to and including today. Starts at 0, with no opening balance. |
| Future dates | Not offered in the UI and ignored by calculation. The backend does not reject them, because it does not know the browser's date. |
| Lunch default | Pre-fill only: 60 minutes, or 0 on a Half day. It is never saved until the user confirms it. |

### Out of scope

Days off, compensation days, accounts or auth in the app (Basic Auth lives at the gateway), backups, CSV export, PWA, i18n, Playwright, dark mode, date-range entry.

## 2. Deliverables and ordering

| ID | Deliverable | Depends on | Size |
| --- | --- | --- | --- |
| D0 | Repo scaffold and tooling | none | M |
| D1 | Shared contracts | D0 | S |
| B1 | Backend platform and schema | D1 | M |
| B2 | Workdays CRUD API | B1 | M |
| F1 | Balance logic and formatting | D1 | S |
| F2 | App shell, API client, component stubs | F1 | M |
| F3 | Today card | F2 | M |
| F4 | Warnings, Workday form, history list | F2 | L |
| F5 | Balance chart | F2 | S |
| O1 | Dockerfiles and local stack | D1 | S |
| O2 | CI and release workflows | D0 | S |
| I1 | Integration, README, PR | B2, F3, F4, F5, O1, O2 | M |
| H1 | Human gate: secrets, merge, first release | I1 | user |
| S1 | docker-services branch | H1 | M |
| H2 | Human gate: server rollout | S1 | user |

```
D0 ──► D1 ─┬─► B1 ──► B2 ───────────────────┐
   │       ├─► F1 ──► F2 ─┬─► F3 ───────────┤
   │       │              ├─► F4 ───────────┼─► I1 ─► H1 ─► S1 ─► H2
   │       │              └─► F5 ───────────┤
   │       └─► O1 ──────────────────────────┤
   └─► O2 ──────────────────────────────────┘
```

### Execution waves

| Wave | Run together | Notes |
| --- | --- | --- |
| 1 | D0 | Blocks everything. Installs every dependency so later lanes never touch `package.json` or the lockfile. |
| 2 | D1, O2 | D1 is small. O2 only needs the scaffold. |
| 3 | B1, F1, O1 | Three independent lanes. |
| 4 | B2, F2 | |
| 5 | F3, F4, F5 | Parallel because F2 creates their stubs and fixes their props. |
| 6 | I1 | Sequential. |
| 7 | H1, S1, H2 | Sequential and gated on the user. |

A faster or slower split is fine as long as the dependency table holds.

### Branching and merging

- Create the integration branch `initial-app` from `main`. Each deliverable gets its own git worktree and branch, for example `initial-app-b1`, cut from the current `initial-app`.
- The orchestrator merges each finished deliverable into `initial-app`. The final result is one PR from `initial-app` to `main`, which the user merges.
- Do not push to `main`. S1 is a separate branch in docker-services, and nothing there is merged by an agent.
- Files in `GLOSSARY.md`, `docs/adr/` and this plan are currently untracked on `main`. D0 commits them first.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the PR body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

### File ownership

A worker edits only the paths its deliverable owns. If it needs a change elsewhere, it reports that to the orchestrator. The ownership in section 4 is what makes waves 3 and 5 conflict-free.

### Rules for every worker

1. Run all shell scripts with `bash`. The user's shell is zsh, which does not split unquoted variables.
2. Work test-first using the `tdd` skill, at the seams in section 3 only. See a test fail before writing the code that passes it. Take expected values from this plan's worked examples, never by recomputing them the way the code does.
3. Comments explain why, not what. Do not narrate changes or mention deliverable IDs in code.
4. Run `npm run check` before each commit. The Husky hook enforces it. Never use `--no-verify`.
5. Each worktree needs its own `npm ci`. Tests start one embedded Postgres per test file on free ports, so parallel worktrees do not collide. Tests must run as non-root.
6. Report: what was done, the `npm run check` result, and any deviation from this plan.

## 3. Shared interfaces (frozen)

These are fixed in advance so that lanes can work in parallel.

### 3.1 Test seams

| Seam | Tool | Catches | Misses |
| --- | --- | --- | --- |
| HTTP API against real Postgres | Vitest, supertest, `embedded-postgres` | Routes, validation, SQL, constraints, migrations | UI behaviour |
| Pure Balance module | Vitest | All calculation rules | Rendering |
| Rendered `<App />` with a faked `fetch` | Vitest, jsdom, Testing Library | User flows and the requests they send | Real network and CSS |

Car-tracker's small unit tests for config, errors, shutdown and the API client are copied along with the code they cover.

### 3.2 `contracts/src/index.ts`

The package is raw TypeScript loaded through Node type stripping in production, so use only erasable syntax (no enums).

```ts
import { z } from 'zod';

// ISO 8601 allows year 0000, but a calendar date starts at year 1.
export const dateSchema = z.iso
  .date({ error: 'Enter a valid date.' })
  .refine((date) => !date.startsWith('0000'), { error: 'Enter a valid date.' });

export const timeSchema = z
  .string({ error: 'Enter a time as HH:MM.' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Enter a time as HH:MM.' });

const LUNCH_MESSAGE = 'Enter the Lunch break as whole minutes from 0 to 1439.';
export const lunchMinutesSchema = z
  .number({ error: LUNCH_MESSAGE })
  .int({ error: LUNCH_MESSAGE })
  .min(0, { error: LUNCH_MESSAGE })
  .max(1439, { error: LUNCH_MESSAGE });

export const minutesOfDay = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Adds the Clock-out and Lunch break rules to any schema producing these fields.
// Reports on `clockOut` ('Clock-out must be after Clock-in.') or on `lunchMinutes`
// ('Lunch break must be shorter than the time between Clock-in and Clock-out.').
export const workdayRules: (fields: WorkdayTimes, context: z.RefinementCtx) => void;

export const createWorkdaySchema; // strictObject: date, clockIn required; clockOut and lunchMinutes nullable, default null; halfDay boolean, default false; with workdayRules
export const patchWorkdaySchema;  // strictObject: clockIn, clockOut (nullable), lunchMinutes (nullable), halfDay, all optional; no cross-field rules
export const workdayFieldsSchema; // strictObject: clockIn, clockOut, lunchMinutes, halfDay, all present; with workdayRules; used to validate a merged PATCH

export type CreateWorkdayRequest = z.input<typeof createWorkdaySchema>;
export type PatchWorkdayRequest = z.infer<typeof patchWorkdaySchema>;

export interface Workday {
  date: string;                // YYYY-MM-DD
  clockIn: string;             // HH:MM
  clockOut: string | null;     // HH:MM
  lunchMinutes: number | null;
  halfDay: boolean;
}

export type ErrorCode =
  'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'UNSUPPORTED_MEDIA_TYPE' | 'INTERNAL_ERROR' | 'DATABASE_UNAVAILABLE';

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; field?: string };
}
```

The `WorkdayTimes` type, the exact use of `superRefine`, and how each schema applies the rules are for D1 to finish. Exported names and behaviour are frozen.

### 3.3 HTTP API

JSON only, 16 KB body limit. Errors use `ErrorEnvelope`.

| Request | Success | Failures |
| --- | --- | --- |
| `GET /api/health` | 200 `{status:"ok"}` | 503 `{status:"unavailable", error}` |
| `GET /api/days` | 200 `Workday[]`, newest date first | 503 |
| `POST /api/days` body `CreateWorkdayRequest` | 201 `Workday` | 400 validation, 409 `CONFLICT` with `field:"date"`, 415, 503 |
| `PATCH /api/days/:date` body `PatchWorkdayRequest` | 200 `Workday` | 400 bad date or rules, 404 `NOT_FOUND` with `field:"date"`, 415, 503 |
| `DELETE /api/days/:date` | 204 | 400 bad date, 404, 503 |
| Any other `/api` path | | 404 JSON `NOT_FOUND` |

PATCH reads the row, merges the patch, validates the merged result with `workdayFieldsSchema`, then writes. The database constraints are a backstop for the rare race. Sending `null` clears a field.

### 3.4 Database

Table `workdays`:

| Column | Type | Notes |
| --- | --- | --- |
| `date` | `date` primary key | Drizzle `mode: 'string'` |
| `clock_in` | `time(0) NOT NULL` | |
| `clock_out` | `time(0)` | |
| `lunch_minutes` | `integer` | |
| `half_day` | `boolean NOT NULL DEFAULT false` | |

Check constraints:

- `workdays_clock_out_after_clock_in`: `clock_out IS NULL OR clock_out > clock_in`
- `workdays_lunch_minutes_range`: `lunch_minutes IS NULL OR lunch_minutes BETWEEN 0 AND 1439`
- `workdays_lunch_shorter_than_span`: `clock_out IS NULL OR lunch_minutes IS NULL OR lunch_minutes * interval '1 minute' < clock_out - clock_in`

Postgres returns `time` as `HH:MM:SS`. The row mapper slices it to `HH:MM`.

### 3.5 `frontend/src/balance.ts`

```ts
export interface ChartPoint { date: string; balanceMinutes: number } // cumulative, after this date's Workday
export interface BalanceSummary {
  weekMinutes: number;
  overallMinutes: number;
  incompleteBeforeToday: Workday[]; // oldest first
  chart: ChartPoint[];              // oldest first
}

export function isComplete(workday: Workday): boolean;
export function expectedMinutes(workday: Workday): number;
export function workedMinutes(workday: Workday): number | null;   // null when incomplete
export function runningMinutes(workday: Workday, now: string): number; // (Clock-out or now) - Clock-in - (Lunch break or 0), floored at 0
export function defaultLunchMinutes(halfDay: boolean): number;
export function weekStart(date: string): string;                  // that week's Monday
export function summarize(workdays: readonly Workday[], today: string): BalanceSummary; // input order must not matter
```

Worked example with `today = '2026-11-11'`, a Wednesday. Use these literals in tests.

| Date | Day | In | Out | Lunch | Half | Worked | Expected | Effect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-04 | Wed | 08:00 | 17:00 | null | no | | | Incomplete, warned |
| 2026-11-05 | Thu | 08:00 | null | 60 | no | | | Incomplete, warned |
| 2026-11-06 | Fri | 08:00 | 17:30 | 60 | no | 510 | 480 | +30, previous week |
| 2026-11-08 | Sun | 10:00 | 12:00 | 0 | no | 120 | 480 | -360, previous week |
| 2026-11-09 | Mon | 08:00 | 17:00 | 60 | no | 480 | 480 | 0, this week |
| 2026-11-10 | Tue | 08:00 | 13:00 | 0 | yes | 300 | 240 | +60, this week |
| 2026-11-11 | Wed | 08:00 | null | null | no | | | Today and incomplete: excluded, not warned |
| 2026-11-12 | Thu | 08:00 | 17:00 | 60 | no | | | Future: excluded, not warned |

Expected result:

- `weekMinutes` is `60` and `overallMinutes` is `-270`.
- `incompleteBeforeToday` dates are `2026-11-04`, `2026-11-05`.
- `chart` is `11-06: 30`, `11-08: -330`, `11-09: -330`, `11-10: -270`.

Further literal cases:

- If 2026-11-11 becomes 08:00 to 17:00 with lunch 60, it counts: week `60`, overall `-270`, and the chart gains `11-11: -270`.
- `weekStart('2026-11-08')` is `'2026-11-02'`, `weekStart('2026-11-09')` is `'2026-11-09'`, and a year boundary works: `weekStart('2027-01-01')` is `'2026-12-28'`.
- `runningMinutes` with Clock-in 08:00: now 10:30 and lunch null gives `150`; lunch 60 gives `90`; Clock-out 17:00, lunch 60, now 18:00 gives `480`; now 08:30 and lunch 60 gives `0`.
- `defaultLunchMinutes(false)` is `60`, `defaultLunchMinutes(true)` is `0`.

### 3.6 `frontend/src/format.ts`

```ts
export const today: () => string;                 // new Date().toLocaleDateString('en-CA')
export const currentTime: () => string;           // local HH:MM, 24-hour, zero-padded
export const formatDate: (date: string) => string; // hu-HU, dateStyle medium, parsed as local midnight
export const formatDuration: (minutes: number) => string; // 465 -> '7:45', 60 -> '1:00', 0 -> '0:00'
export const formatBalance: (minutes: number) => string;  // 90 -> '+1:30', -270 -> '-4:30', -45 -> '-0:45', 0 -> '0:00'
```

### 3.7 Component props (fixed by F2)

```ts
// frontend/src/components/
interface BalanceSummaryProps { weekMinutes: number; overallMinutes: number }                            // BalanceSummary.tsx (F2)
interface TodayCardProps      { workday: Workday | undefined; today: string; now: string; onChanged: () => Promise<void> } // TodayCard.tsx (F3)
interface WarningsProps       { incomplete: readonly Workday[]; today: string; onChanged: () => Promise<void> }            // Warnings.tsx (F4)
interface WorkdayListProps    { workdays: readonly Workday[]; today: string; onChanged: () => Promise<void> }              // WorkdayList.tsx (F4)
interface BalanceChartProps   { points: readonly ChartPoint[] }                                           // BalanceChart.tsx (F5)
```

Each component has its own CSS file, imported by the component, so parallel lanes never edit one shared stylesheet. `onChanged` refetches the list and resolves when state has updated.

Regions have accessible names so tests can scope to them: `Warnings`, `Balance`, `Today`, `Balance over time`, `Workdays`.

### 3.8 Test helper (fixed by F2)

`frontend/test/helpers/fakeServer.ts` exports `installFakeServer(initial: Workday[])`. It stubs global `fetch` with an in-memory implementation of section 3.3, including 409 and 404 and validation through the shared schemas, and returns `{ workdays(): Workday[]; failNext(status, code): void; requests: { method, path, body }[] }`.

Control the clock with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(new Date('2026-11-11T10:30:00'))`, so promises and user-event keep working.

## 4. Deliverables

### D0: Repo scaffold and tooling

**Owns:** everything at the root, workspace `package.json` and tsconfig files, placeholders. Depends on nothing.

1. Create `initial-app` from `main`. Commit `GLOSSARY.md`, `docs/adr/` and this plan.
2. Copy these from car-tracker, then replace `car-tracker` with `work-tracker`, `car_tracker` with `work_tracker` and `Car Tracker` with `Work Tracker`, using `bash`:
   `.dockerignore .editorconfig .npmrc .nvmrc .prettierrc.json .prettierignore .husky/install.mjs .husky/pre-commit tsconfig.base.json eslint.config.js package.json AGENTS.md docs/agents/domain.md docs/agents/issue-tracker.md contracts/package.json contracts/tsconfig.json backend/package.json backend/tsconfig.json backend/tsconfig.build.json backend/vitest.config.ts backend/drizzle.config.ts frontend/package.json frontend/tsconfig.json frontend/vite.config.ts frontend/vitest.config.ts frontend/index.html`
3. Set all four `package.json` versions to `0.1.0`. Set the description meta in `index.html` to "Track working hours and overtime."
4. The `.prettierignore` line naming the phased plan must remain, since this file is that plan. The `.gitignore` already exists and matches.
5. Add `recharts` (current 3.x) to frontend dependencies. If its peers require `react-is`, add it at the React major.
6. Generate the lockfile with `npx -y npm@11.19.0 install`, because this machine has npm 12.2.0 and the repo pins 11.19.0. Then confirm `npm ci` works. `strict-allow-scripts` is on: update the `allowScripts` version keys only for `esbuild` and `@embedded-postgres/linux-x64`. If any other package wants an install script, report it rather than allowing it.
7. Add placeholders so `npm run check` passes: `contracts/src/index.ts`, `backend/src/index.ts` (each `export {}`), `frontend/src/main.tsx` copied from car-tracker, an empty `frontend/src/styles.css` (which `main.tsx` imports), `frontend/src/App.tsx` rendering `<main>Work Tracker</main>`, and `passWithNoTests: true` in both Vitest configs.

**Done when:** `npm ci` and `npm run check` pass, the pre-commit hook runs on commit, and `git grep -il 'car.tracker'` finds only this plan.

### D1: Shared contracts

**Owns:** `contracts/src/index.ts`. Depends on D0.

Implement section 3.2. Behaviour is tested at the API and UI seams, so `contracts` has no test suite, matching car-tracker.

**Done when:** `npm run check` passes and every exported name in section 3.2 exists.

### B1: Backend platform and schema

**Owns:** `backend/src/**` except `index.ts`, `routes/days.ts`, `database/workdayDatabase.ts` and `database/postgresWorkdayDatabase.ts`; `backend/drizzle/**`; `backend/test/**` except `helpers/testDb.ts`, `integration/days.test.ts` and `integration/health.test.ts`. Depends on D1.

1. Copy and rename from car-tracker `backend/src/`: `config.ts errors.ts migrate.ts shutdown.ts database/migrations.ts database/postgres.ts routes/health.ts`.
2. Copy and rename tests: `test/helpers/testPostgres.ts test/integration/migrations.test.ts test/unit/config.test.ts test/unit/errors.test.ts test/unit/shutdown.test.ts`. Adapt `migrations.test.ts` to expect the table `workdays`.
3. In `config.ts`, set the dev default `DB_PORT` to `5433` and update `config.test.ts`. This lets the dev database run beside car-tracker's.
4. Write `database/schema.ts` per section 3.4. Generate the baseline with `npx drizzle-kit generate --name baseline` from `backend/`. Do not hand-edit the SQL.
5. Write `app.ts` as `createApp(checkHealth, logger)`, following car-tracker's. Apply `requireJsonForBody` and the 16 KB JSON limit to `/api/days`, checking **POST and PATCH** (car-tracker's checks POST and PUT). Mount the health router. Add the `/api` 404 fallback and the error handler. B2 adds the database parameter and the days router.
6. Tests: database constraints through raw SQL in `test/integration/schema.test.ts`, using `createPostgresConnection` and `applyMigrations` directly. Cover each of the three check constraints and acceptance of a valid row.

**Done when:** `npm run check` passes and migrations apply cleanly to an empty embedded Postgres, then re-apply as a no-op. Coverage is measured from B2 onward.

### B2: Workdays CRUD API

**Owns:** `backend/src/index.ts`, `backend/src/app.ts` (from here on), `backend/src/routes/days.ts`, `backend/src/database/workdayDatabase.ts`, `backend/src/database/postgresWorkdayDatabase.ts`, `backend/test/helpers/testDb.ts`, `backend/test/integration/days.test.ts`, `backend/test/integration/health.test.ts`. Depends on B1.

Setup:

- `database/workdayDatabase.ts` defines the interface: `list(): Promise<Workday[]>`, `get(date): Promise<Workday | undefined>`, `add(input): Promise<Workday | undefined>` (undefined when the date exists, using `onConflictDoNothing`), `update(date, fields): Promise<Workday | undefined>`, `delete(date): Promise<boolean>`.
- `app.ts` becomes `createApp(database, checkHealth, logger)` and mounts the days router. `index.ts` wires it up the same way as car-tracker's.
- `test/helpers/testDb.ts` follows car-tracker's, with `reset()` running `TRUNCATE workdays`. `health.test.ts` follows car-tracker's, using `/api/days` as the route that returns 503 once the database stops.

Implement section 3.3 test-first through supertest against embedded Postgres. Required cases:

- GET: empty list, newest first, times as `HH:MM`, `null` fields preserved.
- POST: Clock-in only, defaults applied; full body; duplicate date is 409 and leaves the row unchanged; unknown field, bad date, year 0000, bad time, non-integer lunch and lunch out of range are 400 with the right `field`; Clock-out not after Clock-in; lunch not shorter than the span; lunch with no Clock-out is accepted; missing JSON content type is 415.
- PATCH: set lunch only; set Clock-out with lunch; toggle Half day; `null` clears a field; a patch that breaks the rules against existing values is 400 and changes nothing; missing date is 404; empty body is a no-op 200.
- DELETE: 204 then gone; missing date 404.

**Done when:** `npm run check` passes and `npm run test:coverage --workspace backend` meets the 80% thresholds.

### F1: Balance logic and formatting

**Owns:** `frontend/src/balance.ts`, `frontend/src/format.ts`, `frontend/test/unit/balance.test.ts`, `frontend/test/unit/format.test.ts`. Depends on D1.

Implement sections 3.5 and 3.6 test-first using the worked examples. This is the module where wrong numbers would be most damaging, so cover every row and literal case.

**Done when:** `npm run check` passes and both files have 100% line coverage.

### F2: App shell, API client, component stubs

**Owns:** `frontend/src/App.tsx`, `api.ts`, `form.ts`, `main.tsx`, `styles.css`, `components/BalanceSummary.tsx` and its CSS, initial stubs of the other components, `frontend/test/setup.ts`, `frontend/test/helpers/fakeServer.ts`, `frontend/test/unit/api.test.ts`, `frontend/test/unit/main.test.tsx`, `frontend/test/integration/app.test.tsx`. Depends on F1.

1. `api.ts`: copy car-tracker's `ApiError` and `request`, then add `getWorkdays`, `addWorkday`, `patchWorkday`, `deleteWorkday`. Add a `patch` helper.
2. `form.ts`: copy `parseRequest` and `numberOf` from car-tracker.
3. `App.tsx`: one page with no router. State: `workdays`, load error, loading. A `today`/`now` clock refreshes every 30 seconds so "today so far" advances and the date rolls over at midnight. Compute `summarize` with `useMemo`. Render, in order: Warnings, BalanceSummary, TodayCard, BalanceChart, WorkdayList.
4. A load failure shows a message and a Retry button. Show the database-unavailable message when that is the error kind.
5. `BalanceSummary`: "This week" and "Overall" using `formatBalance`.
6. Create the four stub components with the exact props from section 3.7, rendering just their named regions.
7. `styles.css`: page-level styles only, adapted from car-tracker. It must work at phone width.
8. `test/setup.ts`: copy from car-tracker and add a `ResizeObserver` stub, which Recharts needs under jsdom.
9. Build `fakeServer.ts` per section 3.8.

**Tests** at the `<App />` seam: shows both Balance figures from the worked example; load error then Retry succeeds; the clock advancing past midnight changes which Workday is today.

**Done when:** `npm run check` passes, and the stubs' props match section 3.7 exactly.

### F3: Today card

**Owns:** `frontend/src/components/TodayCard.tsx` and its CSS, `frontend/test/integration/today.test.tsx`. Depends on F2.

| State | Shows | Actions |
| --- | --- | --- |
| No Workday today | Today's date | **Clock in**: POST `{date: today, clockIn: now}` |
| Clocked in, no Clock-out | Clock-in, "today so far" from `runningMinutes`, Lunch break input, Half day checkbox | **Save lunch**: PATCH `lunchMinutes`. Half day: PATCH `halfDay` immediately. **Clock out**: one PATCH with `clockOut: now` and the Lunch break input's value. |
| Clocked out | Clock-in, Clock-out, Lunch break, Worked hours, that day's Balance | Corrections happen in the history list |

Lunch input behaviour:

- Shows the saved value, or else `defaultLunchMinutes(halfDay)`. While nothing is saved, show the hint "Not saved yet".
- Keep a draft only once the user types. Without a draft, toggling Half day changes the pre-fill between 60 and 0.
- Clearing the input and clocking out sends `lunchMinutes: null`, leaving the day Incomplete.
- Validate with `parseRequest` before sending. Show validation and server errors in the card with `role="alert"`, for example when lunch would not be shorter than the elapsed time.

**Tests:** each state; Clock in sends the browser's date and time; the pre-fill is not sent until confirmed; Save lunch; one-click Clock out saves Clock-out and the pre-filled lunch; a typed lunch overrides the pre-fill; Half day switches the pre-fill to 0; a 409 shows an error; "today so far" updates as the clock advances.

**Done when:** `npm run check` passes.

### F4: Warnings, Workday form, history list

**Owns:** `frontend/src/components/Warnings.tsx`, `WorkdayList.tsx`, `WorkdayForm.tsx` and their CSS, `frontend/test/integration/workdays.test.tsx`. Depends on F2.

`WorkdayForm` is used by both other components.

- Fields: date (new Workdays only, `max={today}`; read-only when editing), Clock-in, Clock-out (blank allowed), Lunch break in minutes, Half day.
- When Lunch break is unsaved, it pre-fills as in F3 and is saved only when the form is submitted.
- Validate with the shared schemas through `parseRequest`. Reject a future date in the form. Blank Clock-out and blank Lunch break become `null`.
- New Workday uses POST; edit uses PATCH. Show errors with `role="alert"`, including 409.

`Warnings`:

- Renders nothing when there are no Incomplete Workdays before today.
- Otherwise lists each date, naming what is missing: Clock-out, Lunch break or both.
- Each has a **Fix** button opening `WorkdayForm` inline. After a save the warning disappears through `onChanged`.

`WorkdayList`:

- Newest first. Shows date, Clock-in, Clock-out, Lunch break, Worked hours, Half day marker and an Incomplete marker.
- **Add past Workday** opens a blank form. **Edit** opens the form inline. **Delete** asks `window.confirm` first.

**Tests:** warning names the missing field; no warning for today or for a missing date; Fix completes a Workday and moves the Balance; add a past Workday; a future date is refused without a request; duplicate date shows the conflict message; edit; cancel leaves data unchanged; delete confirmed and delete cancelled.

**Done when:** `npm run check` passes.

### F5: Balance chart

**Owns:** `frontend/src/components/BalanceChart.tsx` and its CSS, `frontend/test/integration/chart.test.tsx`. Depends on F2.

Load the `dataviz` skill first. The specification:

- Recharts `LineChart` in a `ResponsiveContainer`, one series, no legend. The region heading names it: "Balance over time".
- 2 px line, no per-point dots, a hover crosshair and tooltip showing `formatDate` and `formatBalance`.
- A `ReferenceLine` at 0, recessive grid and axes. Y ticks in hours (`+8h`, `-4h`, `0h`). X ticks with short dates and automatic thinning.
- `isAnimationActive={false}`.
- The wrapper has `role="img"` and an `aria-label` stating the latest Balance. The history list serves as the table view.
- Empty state: "No complete Workdays yet."

Run the dataviz palette validator on the line colour against the page surface.

**Tests:** empty state; `aria-label` reports the latest Balance from the worked example (`-4:30`). jsdom has no layout, so visual correctness is checked in I1.

**Done when:** `npm run check` passes.

### O1: Dockerfiles and local stack

**Owns:** `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `deploy/**`. Depends on D1.

1. Copy and rename from car-tracker: both Dockerfiles, `frontend/nginx.conf`, `deploy/compose.dev.yml`, `deploy/compose.local.yml`, `deploy/reverse-proxy.local.conf`. Do **not** copy `deploy/compose.example.yml`, `reverse-proxy.example.conf` or `deploy/.env.example`: they are stale in car-tracker and the real deployment is in docker-services.
2. Dev database publishes `127.0.0.1:5433:5432`. Local stack publishes `127.0.0.1:8081:80`.

**Done when:** `docker compose -f deploy/compose.dev.yml config` and the same for `compose.local.yml` are valid. Building both images and running the stack is verified in I1, when the code exists.

### O2: CI and release workflows

**Owns:** `.github/workflows/**`. Depends on D0.

Copy and rename `pr.yml` and `release.yml` from car-tracker, keeping the full-SHA action pins. Release stays `workflow_dispatch` only, including the patch-version bump pushed to `main` using the `RELEASE_TOKEN` secret. Images are `ghcr.io/<owner>/work-tracker-frontend` and `work-tracker-backend`, `linux/amd64`, with tags `X.Y.Z`, `X.Y`, `sha-<sha>` and `latest`.

**Done when:** both files parse as YAML (`actionlint` if available) and no `car-tracker` string remains.

### I1: Integration, README, PR

**Owns:** `README.md`, removal of `passWithNoTests`, small integration fixes. Depends on all of B2, F3, F4, F5, O1, O2.

1. Merge everything into `initial-app`. Remove `passWithNoTests` from both Vitest configs.
2. Run `npm run check` and `npm run test:coverage`. Both workspaces must meet the 80% thresholds.
3. Run `docker compose -f deploy/compose.local.yml up --build -d`. Confirm: migration completes, `/api/health` is OK through port 8081, and creating, patching, listing and deleting a Workday all work over HTTP.
4. Open the page in a browser or take a screenshot, using the `run` skill. Check the desktop and phone-width layouts, and walk through clock in, lunch, clock out, a warning fix, and chart rendering with several points. Check for chart label collisions.
5. Write `README.md`: what it is, prerequisites, install, dev (`db:up`, `db:migrate`, `dev`), tests, local stack, releasing, and required repo settings. Check that commands are accurate; car-tracker's README has known stale parts (its schema path and a `-f version` release flag).
6. Run the `code-review` skill against the spec. Fix what it finds.
7. Open one PR from `initial-app` to `main` using the `pr` skill. Include the attribution line.

**Done when:** the PR is open with CI green, and the report states exactly what was verified by hand.

### H1: Human gate (the user)

1. Add the `RELEASE_TOKEN` secret to `bercee/work-tracker`, from an owner of the token who can bypass the ruleset.
2. Add a `main` branch ruleset matching car-tracker's.
3. Review and merge the PR.
4. Run the Release workflow from GitHub's Actions tab. Confirm that `0.1.0` images exist in GHCR, that the packages are private, and that `main` was bumped to `0.1.1`.

### S1: docker-services branch

**Works in** `/home/bkovacs/Personal/docker-services`, on a new branch `add-work-tracker`. Depends on H1, because the compose file pins a published image. Not merged by an agent.

Use `car-tracker/` in that repo as the template. Read the repo's `AGENTS.md` and `GLOSSARY.md` first.

1. New `work-tracker/` directory with `compose.yaml`, `nginx.conf`, `.env.example` and `README.md`. Project name `work-tracker`. Pinned images `ghcr.io/bercee/work-tracker-frontend:0.1.0` and `-backend:0.1.0`. Same four services, hardening and networks as car-tracker: `proxy` on `default` and `tunnel` (`name: work-tracker-tunnel`, alias `work-tracker-proxy`), `backend` on `default` and external `database`, `migrate` on `database` only. No host ports.
2. `.env.example` lists `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, with no values for secrets.
3. `cloudflare-tunnel/nginx.conf`: a `server` block for `work.kovacs-garai.com` proxying to `work-tracker-proxy`, with the same Basic Auth configuration and `Authorization` header stripping as the car-tracker block.
4. `cloudflare-tunnel/compose.yaml`: external network `work-tracker-tunnel` attached to the gateway nginx.
5. Root `README.md` inventory, `.github/dependabot.yml` directories, and `SERVICES=(...)` in `scripts/update-all.sh`, plus an HTTP check if the car-tracker entry has one.
6. Validate with `docker compose config` for the new service, using a temporary `.env` in the scratchpad or copied from the example and removed afterwards.

**Done when:** the branch is pushed only if the user asks, and the report lists the H2 steps.

### H2: Human gate (the user, on the server)

1. Merge the docker-services branch and pull it on the server.
2. `bash scripts/provision-db.sh work_tracker`, and paste the printed block into `work-tracker/.env`. The name requires an underscore.
3. Confirm the server's `docker login ghcr.io` token can read the new private packages.
4. Start `work-tracker` first, because it creates the `work-tracker-tunnel` network that the gateway declares external. Then recreate the gateway.
5. Add `work.kovacs-garai.com` in the Cloudflare dashboard under Public Hostnames, with service `http://nginx:80`.
6. Open the site, pass Basic Auth, and clock in.

## 5. Orchestrator checklist

- Give each worker: the path of this plan, its deliverable ID, its worktree and branch, and the ownership rule.
- Before merging a deliverable: its `Done when` is met, it touched only owned paths, and `npm run check` passes after the merge.
- Never dispatch S1 before H1 is complete. Stop and hand over to the user at H1 and H2.
- Update `GLOSSARY.md` or add an ADR only through the `domain-modeling` skill, and only if a worker surfaces a genuinely new term or decision.
