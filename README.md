# DISC_FOUNDATION

Monorepo foundation for a reusable, versionable **assessment engine** where specific frameworks are modeled as data, not hardcoded engine behavior.

> Scope of this iteration: backend foundation only. No UI, no auth, no admin panel.

## Tech Stack

- **Monorepo:** pnpm workspace
- **Language:** TypeScript
- **Runtime:** Node.js
- **API:** Fastify (`apps/api`)
- **Database:** PostgreSQL with Prisma (`packages/infrastructure/prisma`)
- **Architecture:** Domain / Application / Infrastructure separation

## Repository Structure

```text
apps/
  api/                    # Fastify API (transport layer)
packages/
  domain/                 # Core entities + pure domain scoring rules/functions
  application/            # Use-cases and repository ports
  infrastructure/         # Prisma schema + repository implementations
  shared/                 # Shared primitives and cross-cutting types
```

## Version lifecycle

Assessment versions follow a strict lifecycle:

1. **Create draft** (`POST /assessments/:id/versions`)
2. **Edit draft** (future admin flow; currently through repository/use-case layer)
3. **Publish** (`POST /versions/:id/publish`)

Publish validation rules are evaluated before publish. The validator returns both blocking **errors** and non-blocking **warnings**:

- publish is blocked when any error exists
- publish is allowed when only warnings exist
- checks include dimensions/questions/options/scoring-reference integrity and ordering consistency

On publish:

- `status` becomes `published`
- `immutableAt` is set
- version becomes read-only

> TODO: future admin/auth layer should gate all mutating version endpoints and actions.

## Active version resolution

`GET /assessments/:id/active-version` resolves the latest published version by descending `versionNumber` (and `publishedAt` as tie-breaker).


## Draft content editing

Draft versions can be edited through dedicated endpoints for dimensions, questions, options, and scoring rules.

Rules:

- only `draft` versions are editable
- published versions are immutable
- ordering fields (`order`) are editable for dimensions/questions/options
- scoring rules must reference valid question/option/dimension data
- content can be iteratively edited, but publish still validates completeness and references


## Publish validation / completeness

`GET /versions/:id/validation` runs a deterministic domain-level completeness check for a version without publishing it.

Validation behavior:

- **Errors** block publish (for example: missing dimensions/questions, broken scoring references, uncovered options, duplicate order values).
- **Warnings** do not block publish (for example: unused dimensions, low question count, or orphaned/dead scoring rules).
- `POST /versions/:id/publish` returns validation details on both success and rejection.

Validation logic lives in the domain layer and remains separate from scoring and persistence concerns.

## Runtime session lifecycle (DB-backed)

Runtime flow now persists in PostgreSQL using Prisma repositories:

1. `POST /sessions` creates an `in_progress` session
2. `POST /responses` upserts responses per `(sessionId, questionId)` while session is `in_progress`
3. `POST /sessions/:sessionId/complete` is the canonical finalize trigger; it computes/finalizes the result, marks session `completed`, and returns `{ resultAvailable: true, result }`
4. Completed sessions are locked for further response submission

`POST /sessions/:sessionId/complete` is idempotent for clients:
- if result already exists, it returns the existing result contract;
- if result does not exist and session is still `in_progress`, it calculates and persists it;
- if session is already completed but result is missing, it returns `409` so integrations can detect an inconsistent state.

`POST /sessions/:sessionId/calculate-result` remains available for backward compatibility, but new clients should use `/complete`.

`GET /sessions/:sessionId` returns basic session metadata, response count, status, and result presence.
It now also includes a derived `lifecycleStatus`:
- `created` (session exists, no responses yet)
- `awaiting_result` (responses submitted, result not yet persisted)
- `completed` (result available / completed)

Internal scoring debug (opt-in):
- `GET /internal/sessions/:sessionId/scoring-debug`
- endpoint is disabled by default and only available when `INTERNAL_SCORING_DEBUG_ENABLED=true`
- returns per-question contribution traces, raw vs normalized D/I/S/C totals, primary/secondary dimensions, and sanity flags for flat/extreme response patterns


## Read-model / reporting layer

Write flow and read flow are intentionally separated:

- **Write flow** handles session creation, response upsert, result calculation, and state transitions.
- **Read flow** exposes stable DTO/query endpoints for reporting and integrations without coupling to write-side DB entities.

Read endpoints provide:

- result by result id or session id
- session detail with responses and optional result summary
- list results by assessment definition/version with lightweight filters (`from`, `to`, `sessionStatus`) and paging (`limit`, `offset`)
- reporting-ready metadata (`total`, `dimensionKeys`, `scoringVersion`, timestamps)

This prepares future exports/comparisons/integrations without overbuilding analytics.



## Report template lifecycle

Report templates now follow a draft → published lifecycle similar to assessment versions.

- `POST /report-templates` creates a report template definition.
- `POST /report-templates/:id/versions` creates a draft template version.
- Draft versions are editable (`sections`, `interpretation rules`) and publish-time validation runs before locking.
- `POST /report-templates/versions/:id/publish` sets `status = published` and `immutableAt`.
- Published versions are immutable and can still be used for report generation.
- Active template version resolves to the latest published version for a template definition.

Rule behavior:
- multiple rules may match the same section;
- outputs are concatenated by `priority` (highest first), then stable id tie-break.

## Report generation model (versioned)

Reports are generated by a dedicated domain report engine and remain separate from scoring.

- `generateReport({ profileResult, reportTemplate })` evaluates rule-based interpretation conditions and produces structured section output.
- templates are versioned (`name` + `version`) and can optionally be linked to a specific assessment version.
- templates become immutable after first use (`immutableAt`) so generated report history remains auditable.
- generated reports persist a full `resultSnapshot` plus resolved section text so downstream exports/integrations remain stable over time.

This keeps reporting backend/domain-driven without UI-coupled hardcoded text and without introducing NLP/AI complexity.

## Scoring model (generic)

Scoring is implemented as a pure domain function:

- `calculateProfileResult({ responses, assessmentVersion })`

How it works (v1):

1. Read dimensions and rules from the loaded assessment version
2. Apply option-level rule impacts per response
3. Aggregate raw scores per dimension
4. Normalize to 0–100 using a scoring-version strategy (default: max-raw; `disc-v1-likert-16`: total-share)
5. Return auditable payload (`scoreBreakdown`, `totalScores`, `rawResponsesSnapshot`, `auditTrail`, `scoringVersion`)

`GET /sessions/:sessionId/result` also returns:
- derived `lifecycleStatus` for consistent client flow handling
- a minimal structured `profileSummary` for client reuse (`profileCode`, ordered dimensions, compact shape flags)
- lightweight `qualityIndicators` (`flatResponse`, `extremeResponse`, `missingDimensionContribution`, plus compact metrics/score)

Canonical completed-session payload example (captured from a completed runtime session in the DISC v1 flow):

```json
{
  "sessionId": "7d22f5f8-9e3f-4e7b-b063-4d2f66f0e99f",
  "assessmentVersionId": "33333333-3333-4333-8333-333333333333",
  "scoringVersion": "disc-v1-likert-16",
  "completedAt": "2026-04-14T12:03:51.642Z",
  "lifecycleStatus": "completed",
  "scores": {
    "raw": {
      "D": 13,
      "I": 10,
      "S": 11,
      "C": 5
    },
    "normalized": {
      "D": 33.33,
      "I": 25.64,
      "S": 28.21,
      "C": 12.82
    }
  },
  "primaryDimension": "D",
  "secondaryDimension": "S",
  "profileSummary": {
    "version": "disc-v1-likert-16",
    "profileCode": "DS",
    "dimensionOrder": ["D", "S", "I", "C"],
    "flags": {
      "balanced": false,
      "dominant": false,
      "topTie": false
    }
  },
  "qualityIndicators": {
    "version": "disc-v1-likert-16",
    "score": 100,
    "flags": {
      "flatResponse": false,
      "extremeResponse": false,
      "missingDimensionContribution": false
    },
    "metrics": {
      "flatResponseRate": 0.44,
      "highExtremeRate": 0.06,
      "lowExtremeRate": 0,
      "missingDimensions": []
    }
  }
}
```

Shape notes for frontend mapping:
- what many clients call `dimensions` is represented as `scores.raw`
- what many clients call `normalizedDimensions` is represented as `scores.normalized`
- `primaryDimension`, `secondaryDimension`, `profileSummary`, `qualityIndicators`, and `lifecycleStatus` are top-level fields on the result DTO

For `disc-v1-likert-16`, these are computed from normalized score spread/ties and response-pattern checks.


## Seeded DISC assessment v1 (engine data)

The bootstrap seed now includes a first production-safe DISC dataset wired to a fixed `assessmentVersionId` and `scoringVersion = disc-v1-likert-16`.

Format choice:
- **Single-select, 5-point Likert** (`Strongly disagree` → `Strongly agree`) for each item.
- Chosen over forced-choice for this first engine version because it fits the current single-response flow, is deterministic to score, and avoids ipsative ranking constraints while remaining easy to evolve.

Structure:
- 16 items total (4 per DISC dimension: D, I, S, C).
- Items are behavior-focused, single-idea statements.
- Each dimension includes reverse-scored items to reduce straight-line/acquiescence risk.

Scoring model:
- Every option maps to exactly one rule impact (`dimensionKey`, `weight`).
- Non-reverse items score `0..4` from disagree→agree.
- Reverse items score `4..0` from disagree→agree.
- Result calculation and retrieval remain in the existing domain/application flow.
- For `disc-v1-likert-16`, normalized scores use total-share normalization (`dimensionRaw / totalRaw * 100`) to improve profile stability in flat/extreme patterns.

## Setup

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp packages/infrastructure/.env.example packages/infrastructure/.env
```

Update `DATABASE_URL` in `packages/infrastructure/.env` for your local PostgreSQL instance.

### 3) Generate Prisma client

```bash
pnpm --filter @disc-foundation/infrastructure prisma:generate
```

### 4) Run API

```bash
pnpm dev
```

API defaults to `http://localhost:3000`.


## API access layer (v1)

This API is now protected by tenant-scoped API keys.

- Send `x-api-key: <raw_key>` on every request (except `/health`).
- Keys are stored hashed in DB; raw values are returned once at creation.
- Every request resolves to a `tenantId` and repositories enforce tenant scoping.
- Basic in-memory rate limiting is enabled per API key (`RATE_LIMIT_PER_MINUTE`, default `120`).

Tenant model:
- all core records are tenant-owned (assessments, versions, report templates, sessions, results, generated reports).
- cross-tenant access is blocked by tenant-scoped repository queries.

Limitations (v1):
- no user-level auth, OAuth, roles, or distributed rate limiting yet.

## API endpoints

### Access

- `POST /api-keys`
- `GET /api-keys`

### Management

- `POST /assessments`
- `POST /assessments/:id/versions`
- `POST /versions/:id/clone`
- `GET /versions/:id/validation`
- `POST /versions/:id/publish`
- `GET /versions/:id`
- `GET /assessments/:id/active-version`

### Report templates

- `POST /report-templates`
- `POST /report-templates/:id/versions`
- `POST /report-templates/versions/:id/clone`
- `GET /report-templates/versions/:id/validation`
- `POST /report-templates/versions/:id/publish`
- `GET /report-templates/versions/:id`
- `GET /report-templates/:id/active-version`
- `POST /report-templates/versions/:id/sections`
- `PATCH /report-sections/:id`
- `DELETE /report-sections/:id`
- `POST /report-templates/versions/:id/rules`
- `PATCH /interpretation-rules/:id`
- `DELETE /interpretation-rules/:id`

### Runtime

- `POST /sessions`
- `GET /sessions/:sessionId`
- `GET /sessions/:sessionId/questions`
- `POST /responses`
- `POST /sessions/:sessionId/complete`
- `POST /sessions/:sessionId/calculate-result`
- `POST /sessions/:id/generate-report`
- `GET /reports/:id`

`GET /sessions/:sessionId/questions` returns the frontend-ready question payload:

```json
{
  "sessionId": "uuid",
  "assessmentVersionId": "uuid",
  "questions": [
    {
      "id": "uuid",
      "prompt": "Question text",
      "text": "Question text",
      "order": 1,
      "index": 1,
      "responseType": "single_choice",
      "options": [
        {
          "id": "uuid",
          "label": "Option label",
          "order": 1,
          "index": 1
        }
      ]
    }
  ]
}
```


## Railway first deploy (no migrations yet)

If this is the first deploy and `packages/infrastructure/prisma/migrations` is empty, run Prisma schema sync in a non-interactive step so PostgreSQL tables are created:

```bash
pnpm prisma:db:push
```

The repository `start` script already does this before booting the API:

```bash
pnpm start
```

This is intended as an initial bootstrap path until formal Prisma migrations are introduced.

## Workspace scripts

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm dev
```
