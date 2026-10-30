# tantu

**Your work, finally connected.**

tantu is a private workspace for tasks and pages, designed to grow into connected project, calendar, mail and knowledge workflows for individuals and small teams.

**Current delivery: L1A foundation and the local L1B connected-work implementation.** Coordinated projects, reviewed scheduling and provider calendar writes, versioned correspondence with attachments, background synchronization, saved collection views, templates and rich collaborative page bodies extend the durable foundation. [L1B readiness](docs/l1b/readiness.md) records local qualification and the real-provider, human and production acceptance gates that remain open.

## What you can use

- Sign in, create a workspace, switch workspaces and invite members or record-scoped guests.
- Create, edit, complete and delete canonical tasks with deadlines, priorities and estimates.
- Create nested pages with collaborative paragraphs, headings and safe inline formatting, authorized comments, source relationships and body revision restoration.
- Organize canonical tasks in projects, manage members/milestones/assignments/subtasks, reject dependency cycles, edit recurring definitions and save consistent work views.
- Review personal calendar work blocks and provider event/attendee changes, preserving task deadlines and external-effect uncertainty.
- Connect approved Google/Microsoft accounts, reconcile bounded provider data in the background, edit/reply/forward drafts with reviewed attachments and manage provider-specific labels/folders/read state. Provider consent/registration is optional and disabled by default.
- Link existing tasks/pages into typed collections, save personal/shared views, review schema changes, repair preserved values and instantiate private reviewed templates.
- Recover browser-session drafts and retry a lost save acknowledgement without creating a duplicate task.
- Keep records private or share them with workspace members. Administrators receive no implicit private-record access.
- Upload bounded private files into quarantine. Downloads require a clean scan, a current session, live record access and a short-lived signed token.
- Inspect authorized activity and internal jobs, cancel pending work and retry failed internal processing.

The interface includes a keyboard command palette, title search, light/dark themes and responsive layouts. Native form controls and automated keyboard/mobile tests support the local accessibility baseline; manual assistive-technology qualification remains open.

## Run locally

Use Node.js 24, npm 11 and PostgreSQL 16+. Install the three locked packages:

```bash
npm run setup
```

Follow the [local setup guide](docs/l1a/setup.md) to create separate database roles, run migrations, configure the private file directory and create the first account. Start each process in its own terminal:

```bash
npm run dev:backend
npm run dev:worker
npm run dev:frontend
```

Open [localhost:3000](http://localhost:3000). The frontend proxies `/api/v1` to Fastify on loopback port 4000. Backend configuration is listed in [backend/.env.example](backend/.env.example); local environment files are ignored. Self-hosted Inter and Poppins keep frontend builds independent of external font services.

A working ClamAV daemon is required to release quarantined files. A scanner outage keeps files unavailable; it never silently approves them. The local filesystem adapter is intended for a single private installation. Managed object storage, key management and deployment policy require separate qualification.

## Validate

```bash
npm run check:l1b
```

This runs application/discovery lint and strict type checks, unit tests, both production builds, real PostgreSQL integration and backup/restore tests, actual browser journeys, contract-sync checks, all three npm audits and documentation/ignore checks. Synthetic evidence is written only to ignored artifacts.

`npm run check` runs source checks, unit tests and builds. `npm run check:l0` retains the earlier isolated provider-policy, recurrence, collaboration, search and Go/MinLZ qualification suite. The CI workflow runs that baseline plus the L1A database, browser and contract checks. A workflow file does not by itself prove a remote run succeeded.

## Architecture and contracts

The application uses Next.js/React with one TypeScript/Fastify modular backend. PostgreSQL owns identity, membership, canonical records, operation results, revisions, audit metadata and outbox events. A separate pg-boss worker processes internal events, file scans and provider-read continuation pages and reviewed external calendar/mailbox effects, with periodic recovery and optional authenticated notification hints. External send uncertainty is persisted before remote mutation; unknown sends are reconciled without blindly retrying. Accepted record writes, durable results and queued work commit atomically.

Runtime connections cannot be superusers or bypass row security. Record/file policies enforce current tenant, membership, visibility, grants and ancestor deletion state. Structured edits use expected versions; operation keys reject changed-payload reuse. Operational logs exclude content and credentials.

The [implemented API](contracts/l1a.openapi.json) is generated from registered request schemas and canonical response schemas. Frontend canonical types are generated from backend interfaces and checked for drift. The [L0 contract](contracts/openapi.json) remains a historical draft, including unimplemented future-provider operations.

The isolated [Go archive qualification](archive/qualification/README.md) does not enable production historical ingestion or search. Provider adapters and HTTP-polled Yjs rich page bodies are implemented locally. Calendar coverage is bounded to the primary/default rolling window, Microsoft folder discovery is capped, and inconclusive external writes remain unknown. Automation, launch-wide search/portability and AI belong to later phases.

## Documentation

- [Connected-work implementation](docs/l1b/implementation.md), [provider setup and recovery](docs/l1b/setup.md) and [L1B qualification and acceptance](docs/l1b/readiness.md).
- [Local setup](docs/l1a/setup.md), [implementation](docs/l1a/implementation.md), [operations](docs/l1a/operations.md) and [readiness](docs/l1a/readiness.md).
- [Backend](backend/README.md), [frontend](frontend/README.md), [development](docs/development.md) and [network contracts](contracts/README.md).
- [Product requirements](docs/product-requirements.md) and [delivery roadmap](docs/roadmap.md), preserving the original planning baseline.
- [L0 evidence and unresolved decisions](docs/l0/readiness.md).

Private phase plans and the requested technology explanations stay outside Git. Do not force-add local documentation, environment files, logs or generated evidence. Keep commits focused and run the relevant validation before delivery.

## License

A project license has not been specified. Third-party dependencies retain their respective licenses.
