# tantu

**Your work, finally connected.**

tantu is a connected workspace for individuals and small teams, designed to bring tasks, projects, calendars, email, and knowledge into one coherent workflow. Information stays connected through shared record identities and explicit relationships, helping people turn incoming requests into scheduled work and track commitments through completion.

**Project status:** Early development. The current implementation is a Next.js frontend starter. The capabilities below describe the agreed product direction and planned releases; authentication, backend services, provider integrations, and workspace features are not implemented yet.

The product baseline is documented in the [Product Requirements Document](docs/product-requirements.md) and [Roadmap and Project Design](docs/roadmap.md), dated 29 October 2026.

## Contents

- [Product overview](#product-overview)
- [Planned capabilities](#planned-capabilities)
- [Distinctive features](#distinctive-features)
- [Current implementation](#current-implementation)
- [Getting started](#getting-started)
- [Development commands](#development-commands)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Privacy and reliability](#privacy-and-reliability)
- [Delivery roadmap](#delivery-roadmap)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

## Product overview

Work often arrives in email, gets tracked in a task manager, occupies time in a calendar, and depends on context stored in separate documents. Copying information between those tools creates conflicting versions, missed commitments, and extra coordination.

tantu is designed around a connected sequence:

1. Capture an email, note, link, or request.
2. Review its context, owner, deadline, and intended audience.
3. Create a task linked to its source and project.
4. Reserve working time with a calendar block.
5. Connect supporting pages, decisions, and commitments.
6. Track progress and complete the work, with an optional reviewed reply.

A task keeps the same identity across its project, calendar, collection, and search views. Linking a private email to a shared task does not grant access to the mailbox. Sharing selected content requires an explicit review of what will be copied and who can see it.

The intended audience includes individuals organizing personal work, small teams coordinating projects, and project owners who need a clear view of commitments and supporting context.

## Planned capabilities

The following capabilities belong to the coherent L1 launch scope. They remain planned.

| Area | Planned launch capabilities |
| --- | --- |
| Tasks and projects | Tasks, subtasks, dependencies, recurring work, projects, milestones, and list, board, table, and timeline views. |
| Calendar | Day, week, month, and agenda views; task time blocks; overlays; conflict handling; timezone and recurrence support; Google and Microsoft calendar connections. |
| Email | Gmail and Microsoft 365 accounts, threaded conversations, drafts, compose and reply, attachments, provider-specific labels or folders, rules, and conversion into tasks. |
| Knowledge | Nested pages, a block editor, typed collection properties, relations, backlinks, reusable views, comments, and history. |
| Capture and commitments | A capture queue, reviewed conversion into work, linked source references, and manually confirmed promises. |
| Search | Permission-aware full-text search, filters, ranked results, and controlled access to compressed historical archives. |
| Workspace platform | Personal and shared spaces, roles, access controls, activity, audit records, customization, export, sync health, and a basic rule engine. |

Core workflows must work without AI. Responsive layouts and accessible alternatives to drag interactions are part of the product requirements.

## Distinctive features

| Feature | Purpose | Planned release |
| --- | --- | --- |
| **Capture-to-Action** | Turn incoming information into reviewed, trackable work while preserving its source and sharing boundaries. | L1 |
| **Promise Tracker** | Record confirmed commitments, responsible people, due dates, and outcomes. Suggestions remain separate from confirmed promises. | L1, manual workflow |
| **Context Graph** | Explore authorized relationships between tasks, projects, pages, events, promises, and decisions. | L2 |
| **Plan My Day** | Propose a reviewable daily schedule using working hours, availability, priorities, dependencies, and task estimates. | L2 |
| **Workload Weather** | Explain estimated workload relative to available capacity, including unknown estimates and periods with no capacity. | L2 |
| **Workspace Kits** | Reuse workspace setups and workflows to make repeatable work easier to organize. | L2 |
| **Decision Memory** | Preserve decisions, their owners and rationale, and the work they affect. | L2 |

Plan My Day begins with deterministic scheduling rules. AI may provide optional assistance, but it does not replace permission checks or user review of external actions.

## Current implementation

The project currently contains a Next.js App Router application with the generated starter page and root layout, strict TypeScript configuration, Tailwind CSS, ESLint, and npm scripts for development and production builds. Product requirements and a dependency-driven delivery plan are included in `docs/`.

There is no application backend, database schema, authentication flow, connected mailbox, calendar integration, MinLZ adapter, or automated application test suite. Running the project displays the Next.js starter page.

### Installed frontend stack

| Technology | Declared version | Role |
| --- | --- | --- |
| Next.js | `16.4.3` | Application framework and routing |
| React / React DOM | `19.3.0` | Interface rendering |
| TypeScript | `^5` | Static typing, with strict mode enabled |
| Tailwind CSS | `^4` | Styling |
| ESLint | `^9` | Static analysis |

Exact resolved dependency versions are recorded in [frontend/package-lock.json](frontend/package-lock.json).

## Getting started

### Prerequisites

- Node.js meeting the installed Next.js package's minimum requirement of `20.9.0`.
- npm, which is the package manager currently used by this project.

The PRD proposes pnpm for future TypeScript development. The existing implementation uses npm and `package-lock.json`; use npm until an explicit package-manager migration is adopted.

### Run locally

From the project root:

```bash
cd frontend
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Changes to `frontend/app/page.tsx` appear through the development server.

No environment variables or external services are required by the current starter. Provider credentials, database settings, and production secrets have not been configured. The root layout uses `next/font/google` for Geist fonts, so a build may require network access to download them.

### Build and serve

Run these commands from `frontend/`:

```bash
npm run build
npm run start
```

The start command requires a successful production build. These commands serve the current frontend; the complete hosted workspace and its infrastructure remain future implementation work.

## Development commands

Run all commands in this table from `frontend/`.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependencies using the committed lockfile. |
| `npm run dev` | Start the development server. |
| `npm run lint` | Run the configured ESLint checks. |
| `npx next typegen` | Generate Next.js route and layout types. |
| `npx tsc --noEmit` | Check TypeScript without emitting JavaScript. Run type generation first on a fresh checkout. |
| `npm run build` | Produce the production frontend build. |
| `npm run start` | Serve an existing production build. |

Before submitting a change:

```bash
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
```

There is currently no test script, dedicated formatting check, or CI workflow. The PRD specifies future unit, integration, browser, accessibility, provider-contract, and archive validation. Those checks must be added alongside their implementations.

## Project structure

```text
tantu/
├── README.md
├── docs/
│   ├── product-requirements.md
│   └── roadmap.md
└── frontend/
    ├── AGENTS.md
    ├── README.md
    ├── app/
    │   ├── favicon.ico
    │   ├── globals.css
    │   ├── layout.tsx
    │   └── page.tsx
    ├── public/
    ├── eslint.config.mjs
    ├── next.config.ts
    ├── package-lock.json
    ├── package.json
    └── tsconfig.json
```

The structure above reflects existing files. Backend, worker, database, and infrastructure directories will be introduced when those components are implemented.

## Architecture

The planned architecture uses a TypeScript frontend, one primary backend organized as a modular monolith, and durable workers for synchronization and derived data. The backend language remains an L0 decision between TypeScript and Rust.

| Component | Planned responsibility |
| --- | --- |
| React / Next.js frontend | Workspace navigation, record views, editing, calendars, and action review. |
| Primary backend | Workspace and access, work management, knowledge, scheduling, mail, capture and relationships, search and archive, sync, and automation. |
| PostgreSQL | Canonical application records, access rules, provider mappings, transactional outbox, and initial full-text search. |
| Durable workers | Provider reconciliation, approved external operations, retries, checkpoints, and search projections. |
| Google / Microsoft adapters | Delegated access to mail and calendar APIs while retaining each provider's semantics. |
| Private object storage | Attachments, exports, and immutable archive data. |
| Isolated Go archive adapter | Integration with a pinned upstream MinLZ implementation. |

PostgreSQL owns application records such as tasks and pages. Providers remain authoritative for provider-owned messages and events. Search results and graph views are derived from those sources and must apply current permissions.

Candidate frontend libraries include Radix Primitives, TanStack Query and Table, Tiptap, Yjs, FullCalendar, and React Flow. These are PRD proposals and are not installed. Backend libraries, hosting, identity provider, deployment region, and retention policies require explicit decisions before implementation.

### Historical archives and MinLZ

MinLZ is planned for appropriate historical data and exact archive searches. Ordinary live search remains a separate retrieval path.

Archive search must validate stream integrity, handle matches across block boundaries, verify exact bytes, map matches to record identities, and recheck access and deletion state. Results must distinguish complete, partial, and failed searches. Production enablement depends on correctness, security, resource-limit tests, and measured suitability; no performance benchmark is claimed.

## Privacy and reliability

The implementation must preserve these product requirements:

- Personal email remains private unless its owner explicitly shares selected content. A source link does not grant access.
- Current authorization applies to records, relationships, snippets, counts, exports, search, and optional AI retrieval.
- Email sends, attendee invitations, and proposed schedule changes require user review before execution.
- AI is optional and disabled until enabled by an authorized owner. Core workflows remain available without it.
- Accepted application writes and their outbox events are committed transactionally. Provider operations expose pending, confirmed, failed, or unknown outcomes.
- Retries and replay must avoid duplicate work. An ambiguous email send must be reconciled before another attempt.
- Task deadlines, work blocks, and external events remain distinct linked concepts, with explicit timezone and recurrence behavior.
- Operational logs and analytics exclude private message bodies, page content, recipients, attachments, and query text.

These are implementation and acceptance requirements, not completed security certifications or production guarantees.

## Delivery roadmap

Delivery follows dependencies and evidence gates. No release dates or completion claims are assigned.

| Stage | Focus | Completion evidence |
| --- | --- | --- |
| **L0 — Validation** | Confirm journeys, access rules, backend choice, provider consent requirements, editor approach, synchronization risks, and MinLZ suitability. | Critical unknowns resolved through reviewed flows and technical experiments. |
| **L1a — Foundation** | Identity, spaces, canonical records, access, task and page core, secure files, activity, and outbox. | Tenant isolation, durable writes, recovery, and consistent record views. |
| **L1b — Connected work** | Projects, launch views, calendar, Google and Microsoft mail/calendar integration, sending, and sync recovery. | Qualified end-to-end journeys and provider contracts. |
| **L1c — Launch integration** | Capture-to-Action, manual Promise Tracker, linked knowledge views, search, controlled archives, portability, customization, and accessibility. | All L1 acceptance gates and launch readiness requirements satisfied. |
| **L2 — Connected intelligence** | Context Graph, Plan My Day, Workload Weather, Workspace Kits, Decision Memory, optional AI, and richer collaboration. | Feature-specific value, quality, and privacy evaluations. |
| **L3 — Extensibility and governance** | Integration ecosystem, additional mail protocols, enterprise controls, and native-app or self-hosting evaluations. | Separate approved specifications and operating plans. |

Future discovery candidates include sharing previews, secure handover packs, knowledge freshness checks, scenario planning, and attention controls. They are not additions to committed launch scope. See the [detailed roadmap](docs/roadmap.md) for dependencies and promotion criteria.

## Contributing

Read the product baseline and applicable agent instructions before making changes. For work inside `frontend/`, follow [frontend/AGENTS.md](frontend/AGENTS.md) and consult the relevant guides bundled with the installed Next.js version.

Keep changes focused, preserve unrelated work, and update documentation when behavior changes. Use descriptive branches such as `feat/task-capture`, `fix/calendar-timezone`, or `docs/project-readme`. Do not use the `codex/` branch prefix.

Run the available validation commands and report their actual outcomes. New functionality should include behavior-focused coverage, relevant failure states, and the acceptance conditions defined by the PRD. Do not commit secrets, local environment files, dependency directories, or generated build output.

## Documentation

| Document | Purpose |
| --- | --- |
| [Product Requirements Document](docs/product-requirements.md) | Product baseline, requirements, user journeys, data rules, technology proposals, privacy, and acceptance criteria. |
| [Roadmap and Project Design](docs/roadmap.md) | Delivery dependencies, module ownership, project flows, launch evidence, and future discovery candidates. |
| [Frontend README](frontend/README.md) | Frontend setup, commands, and implementation notes. |

The PRD and roadmap are preserved planning baselines from 29 October 2026. Statements about the original planning deliverable describe that phase. The current implementation is described in this README; unresolved choices in the planning documents remain subject to engineering review.

## License

A project license has not been specified. Add an explicit license before distributing the project under open-source terms. Third-party dependencies retain their respective licenses.
