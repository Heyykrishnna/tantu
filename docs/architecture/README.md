# Tantu architecture atlas

Reviewed on 2 November 2026 against repository revision `4739adf6a360658bf57fb3e792b685dea42f9d2c`. This atlas documents the implemented system; it does not certify a deployed environment. The interactive diagrams include searchable nodes, source links, live/still motion, light/dark themes and export controls. Each HTML file is standalone and can be opened locally without installing a frontend application.

- [Runtime architecture](diagrams/runtime/tantu-architecture.html): user entry, frontend proxy, backend, database/queue, worker, private files, scanner and external systems.
- [Canonical save workflow](diagrams/workflow/canonical-save.html): authorization, operation replay, version conflicts, atomic persistence, asynchronous processing and bounded recovery.
- [Runtime source](diagrams/runtime/candidate.json) and [workflow source](diagrams/workflow/candidate.json) are the editable diagram definitions.
- [Locked technology inventory](technology.md) records exact dependency versions and their manifest requirements.
- [Validation results](validation.md) separate completed checks, visual inspection and checks not run.

The existing root [ARCHITECTURE.md](../../ARCHITECTURE.md) and phase documents contain broader design intent. Where they describe future capabilities, this atlas follows executable source and deployment configuration. The repository contained uncommitted UI, invitation and relationship work during inspection. Diagram citations deliberately use committed source at the pinned revision; the drift baseline additionally fingerprints the local working tree, including that existing work, without claiming those changes are committed or separately qualified.

## Runtime and responsibility

Tantu is a TypeScript modular monolith with a separate worker process. Next.js serves the browser workspace on port 3000 and rewrites `/api/v1` requests to `BACKEND_ORIGIN`, defaulting to `http://127.0.0.1:4000`. Fastify owns application authorization, validation, business operations and database writes. The frontend has no direct PostgreSQL connection. [Proxy configuration](../../frontend/next.config.ts), [backend registration](../../backend/src/app.ts).

PostgreSQL 16+ owns identity, membership, canonical tasks/pages, revisions, operations, provider projections, feature records and queue metadata. The `tantu_jobs` schema is pg-boss storage inside PostgreSQL, not an independent message broker. The worker consumes `canonical-events`, `file-scans`, `provider-sync` and `provider-effects`; `dead-letters` holds exhausted jobs. API startup initializes queue access but never starts a consumer. [Queue](../../backend/src/workers/queue.ts), [worker entry](../../backend/src/workers/server.ts).

The API and worker share a private filesystem directory. API code writes uploads and reads authorized downloads; worker code reads scan input and removes deleted files. The worker calls a configured TCP endpoint using ClamAV INSTREAM. External provider HTTP traffic is bounded and allowlisted to Google Gmail/Calendar or Microsoft Graph. Signup verification uses a separate SMTP transport. [Files](../../backend/src/modules/files/service.ts), [provider HTTP](../../backend/src/modules/providers/http.ts), [SMTP](../../backend/src/modules/mail/smtp.ts).

## Technology specification

| Concern | Implementation | Responsibility / qualification |
| --- | --- | --- |
| Runtime / package manager | Node.js 24, npm 11; package manager `npm@11.8.0` | Three independent locked npm packages; no new application dependency was added for this atlas |
| Frontend | Next.js 16.4.3, React / React DOM 19.3.0 | App Router, server delivery and browser workspace; `/api/v1` proxy |
| UI | Tailwind CSS 4.3.3, Lucide React, Motion, GSAP | Styling, icons and interaction animation; resolved versions in technology inventory |
| Rich text / collaboration | Tiptap 3.32.2, Yjs 13.6.33 | Collaborative updates and presence over HTTP polling; no WebSocket server is configured |
| Backend | Fastify 5.12.7, TypeScript 5.9.3 | Schema validation, sanitized failures and registered feature modules |
| PostgreSQL client / jobs | pg 8.23.1, pg-boss 12.30.0 | Scoped transactions, durable queues and job fencing |
| Recurrence / time | rrule 2.8.1, Temporal polyfill 0.5.1 | Recurrence and timezone-aware scheduling |
| Provider identity / content | oauth4webapi 3.8.8, jose 6.2.14, postal-mime 4.2.0 | OAuth/OIDC, verified notification hints and mail parsing; live qualification requires provider setup |
| Local storage / scanner | Node filesystem APIs; ClamAV TCP protocol | Private shared directory; Compose scanner is a synthetic protocol stub |
| Tests | Node test runner, tsx, Playwright 1.64.1 | Unit, PostgreSQL integration and browser journeys; not all were run as part of authoring these diagrams |
| Packaging | Multi-stage Node 24 Alpine Dockerfile; Docker Compose | Container build plus local development topology; Compose uses watch commands |
| Architecture tooling | Archify 3.2.0 in `.agents/skills/archify` | Project-only Codex installation; no global installation or copied mirror |
| Isolated archive experiment | Go 1.24 qualification with MinLZ | Not connected to the normal API/worker runtime |

The inventory is generated from lockfiles rather than inferred from version ranges. A dependency being installed does not establish that every capability it offers is enabled.

## Backend module map

All modules below execute in the Fastify backend unless a separate worker execution path is explicitly stated. Registration is authoritative in [app.ts](../../backend/src/app.ts).

| Source directory under `backend/src/modules/` | Implemented responsibility | Execution / important boundary |
| --- | --- | --- |
| `workspace-access` | Registration, signup verification, sessions, memberships, grants, workspace settings and module access | Server session + live workspace authorization; existing invitation changes remain uncommitted |
| `work-management` | Canonical task/page CRUD, operation replay, versions, revisions and events | Atomic record mutation with transactional queue enqueue |
| `projects` | Projects, project membership and milestones | Registered HTTP routes using PostgreSQL |
| `work-coordination` | Assignments, subtasks, dependencies and saved views | Canonical records remain the authority |
| `scheduling` | Work blocks, personal preferences, overlays and recurrence | Scheduling review is distinct from changing task deadlines |
| `knowledge` | Page collaboration, collections, properties, relations, templates and source links | Yjs state in PostgreSQL; HTTP updates and presence |
| `providers` | OAuth, connection health, bounded mail/calendar projections, reviewed writes and reconciliation | API sends plus queued worker sync/effects; operator configuration and user consent required |
| `files` | Upload quarantine, metadata, signed downloads and cleanup | API filesystem I/O; separate worker scanning; scanner outage fails closed |
| `capture-relationships` | Capture intake and task/page relationship workflows | Database-backed routes; not a separate ingest service |
| `automation` | Condition evaluation, rules, run ledger and supported internal actions | Do not infer a general-purpose automation daemon from route registration |
| `search-archive` | Live search projections and archive metadata/query routes | PostgreSQL live search; archive query currently returns a synthetic derived candidate, not decoded archive matches |
| `portability-quotas` | Quotas, user preferences and export job records | Inspect actual export payload/coverage before assuming complete workspace portability |
| `context-decisions` | Decisions, decision revisions and context graph records | Database-backed graph; no graph database service |
| `planning-workload` | Daily plans, application of reviewed plans and workload calculations | Deterministic application logic, not an external planning engine |
| `kits-collaboration` | Workspace kits, installation previews, formula evaluation and synced blocks | Local application/database implementation |
| `ai-meetings` | Workspace AI settings and meeting brief records | Current brief generation is deterministic database assembly; provider-name options do not prove LLM calls |
| `integrations-webhooks` | Developer key metadata, webhook registration, signing and delivery records | Registration/signing helpers do not establish an active outbound delivery worker |
| `enterprise-governance` | Policy settings, DLP preview/logging and audit exports | SSO enforcement, IP allowlists and non-default session durations are rejected as unconfigured; no compliance certification implied |
| `future-discovery` | Exposure previews, handover packs, freshness reviews, scenario plans and attention budgets | Stored previews/settings and deterministic calculations; no invented autonomous executor |
| `connected-work` | Shared change/operation transaction helper | Internal module reused by feature routes |
| `mail` | Verification messages and SMTP transport | Signup path is committed; invitation-mail addition was uncommitted at inspection |

## Persistence and schema ownership

The ordered migration directory currently contains `001` through `026`, plus runtime grants. These are feature families, not independent databases:

| Migration range | Data families |
| --- | --- |
| 001–003 | Identity, tenants, canonical records, access policy, operations/events, revisions, private file operations |
| 004–012 | Projects, scheduling, providers, collections/knowledge, coordination, calendar/mail reviews, reconciliation and knowledge workflows |
| 013–018 | Capture/automation, search/archive metadata, portability/quotas, context/decisions, planning/workload and kits |
| 019–022 | Meeting workflows, integration/webhook metadata, enterprise policy/audit and future discovery |
| 023–026 | Email verification, module access, customization and settings/admin controls |

[Migration runner](../../backend/src/platform/database/migrate.ts) and [migration operations](../../backend/migrations/README.md) define application order and operator privileges. Runtime connections are checked against superuser, RLS bypass and canonical-table ownership. Transactions set local `tantu.actor` and `tantu.tenant` values. Read feature migrations and grants when extending policy; route presence alone is not proof that every table has identical authorization semantics.

## Critical flows and failure handling

1. **Authenticated canonical write.** Validate request schema, session, Origin/CSRF and current membership. Acquire the operation-key advisory lock; reject changed-payload reuse. Existing-record writes lock the record and require its expected version. Record changes, operation result, revision, event and job enqueue commit together. Lost acknowledgements can replay the original operation identity. [Canonical mutation](../../backend/src/modules/work-management/service.ts).
2. **Internal event processing.** The worker fetches one job, records an attempt/token fence, locks the active queue row, rechecks current scope and marks an event published or discarded. Database effects and acknowledgement share a transaction. Internal failures use four retries with backoff, 60-second expiration and dead-letter routing. [Queue fences](../../backend/src/workers/queue.ts), [event processing](../../backend/src/workers/events.ts).
3. **File lifecycle.** Nonempty files up to 5 MiB are written privately and registered pending with a scan job. The worker verifies content digest and scan verdict. Downloads require a current authorized session, clean metadata and a signature bounded to 60 seconds. Unavailable scanning does not approve a file. [Upload/scan](../../backend/src/modules/files/service.ts), [download](../../backend/src/modules/files/routes.ts).
4. **Provider read/recovery.** Optional operator credentials and consent enable adapters. Worker reconciliation checks every 30 seconds and schedules due mail/calendar reads, with bounded pagination/checkpoints and retry windows. Notification hints trigger authoritative reads rather than becoming canonical data. [Reconciliation](../../backend/src/modules/providers/reconciliation.ts).
5. **Reviewed external mutation.** Draft/account versions and attachments are checked against review state. Mail send commits an `unknown` intent fence before remote mutation; ambiguous outcomes stay unknown and require evidence reconciliation. Queued calendar/mailbox effects have their own execution fences. These paths must not inherit blind internal-job retry semantics. [Sending](../../backend/src/modules/providers/sending.ts), [effects](../../backend/src/modules/providers/calendar-effects.ts).
6. **Page collaboration.** HTTP endpoints return encoded Yjs state and presence; authorized updates are decoded, applied and persisted into canonical page state. This is not proof of WebSocket transport or independently hosted collaboration infrastructure. [Collaboration routes](../../backend/src/modules/knowledge/collaboration-routes.ts).

## Contracts, deployment and qualification

`contracts/l1a.openapi.json` is the generated registered API despite its historical filename. Canonical frontend types are generated from backend interfaces. `npm --prefix backend run contracts:check` detects drift; auxiliary responses without strict schemas remain explicitly qualified. `contracts/openapi.json` is a historical draft. [Contracts](../../contracts/README.md).

The Dockerfile builds production backend and Next.js assets into a non-root Node 24 Alpine image. Its default command starts the backend; frontend and worker need separate commands/processes. Compose has six services: PostgreSQL, scanner, migrator, backend, worker and frontend. It provides two named volumes for PostgreSQL data and private files. Compose is a local development configuration, including development defaults and watch commands, and is not a production deployment certificate.

`/health/live` measures process liveness. `/health/ready` executes a database query. CI configuration includes source checks, tests, builds, qualification, dependency/secret/container scans and browser journeys. A configured workflow does not prove a successful remote run. The deployment workflow explicitly fails when a deployment adapter is absent. Production hosting, provider verification, real malware scanning and operational recovery qualification remain separate gates. [Deployment workflow](../../.github/workflows/deploy.yml), [Docker guidance](../docker.md).

Known implementation limits are intentionally visible: the synthetic Compose scanner, deterministic meeting briefs, unconfigured enterprise identity enforcement, synthetic archive query candidates and isolated Go archive experiments. This task documents these facts; it does not change application behavior to resolve them.

## Keeping the atlas synchronized

The installed project skill is the single local Archify copy. `.agents` and `.archify` remain ignored by the repository; shareable candidates, HTML and delivery hashes live under `docs/architecture/diagrams/`. `skills-lock.json` records its upstream source/digest. Preserve its licenses and support files; do not hand-edit bundled renderers or create independently maintained mirrors. The [artifact registry](../../tooling/architecture/artifacts.json) points to the canonical diagram JSON files. HTML and delivery metadata are generated from those definitions.

```bash
npm run architecture:check
npm run test:architecture
npm run architecture:build
npm run architecture:inventory
npm run architecture:record-reviewed
npm run architecture:check
```

The first command is read-only and rejects changed, added or deleted application/configuration sources, changed skill-lock identity, changed candidates and changed delivered HTML. It also verifies delivery-bound candidate/HTML hashes, revalidates diagram specifications when the local skill is installed, and requires every diagram citation's current source file to match its pinned Git revision. The baseline deliberately includes a broad source surface so new modules cannot silently escape review. It does not watch secrets, runtime data or ignored application artifacts.

After a source change, inspect the affected behavior, update the diagram text/topology/citations and the technology/module documentation, and repin to a committed revision that contains the cited source. Run `architecture:build` to execute validation, delivery, provenance and real Chrome browser checks. Browser execution may need desktop/sandbox permission. It creates uniquely named verification folders, so previous evidence is preserved. Run `architecture:inventory` when manifests/lockfiles change. Only after review, run `architecture:record-reviewed` to accept the new source and artifact fingerprints; this command cannot determine semantic accuracy on its own. Finish with `architecture:check` and `test:architecture`.

Archify delivery receipts bind absolute host paths. On the authoring host, the check additionally verifies strict Archify provenance. A checkout without the locally installed skill verifies the recorded candidate/HTML hashes, source evidence and review baseline using Node alone; it explicitly reports that Archify runtime revalidation was not run and does not claim a fresh browser run. Rebuild on that host to create new host-bound browser evidence.

The baseline is deterministic and records no timestamp or secrets. `architecture:build` does not silently accept source drift. CI runs the read-only check and regression tests, so a stale diagram fails clearly. Interactive motion follows Archify's viewer; use Still or reduced-motion preferences when desired. Capture evidence is separate from automated browser checks; visual quality claims require inspection of the captured images.
