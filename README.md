# tantu

**Your work, finally connected.**

tantu is a connected workspace for individuals and small teams, designed to bring tasks, projects, calendars, email, and knowledge into a single workflow. Incoming information becomes reviewed work, linked context, scheduled time, and trackable commitments.

**Status:** Initial application boilerplate. The project includes a Next.js frontend starter and a runnable TypeScript/Fastify backend foundation. Product workflows, authentication, persistence, provider integrations, and historical search remain planned.

The [Product Requirements Document](docs/product-requirements.md) and [delivery roadmap](docs/roadmap.md) capture the product baseline. The [backend foundation decision](docs/decisions/0001-backend-foundation.md) records the concrete scaffold choices.

## Product direction

Work often arrives in email, gets tracked in a task manager, occupies time in a calendar, and depends on separate documents. tantu connects those records so people can understand what matters, act on it, and follow the outcome without repeatedly copying information.

The intended workflow is:

1. Capture a message, note, link, or request.
2. Review its owner, deadline, project, and sharing audience.
3. Create one canonical task linked to its source.
4. Reserve time with a calendar work block.
5. Connect relevant pages, decisions, and commitments.
6. Complete the work and optionally review a reply.

A private source stays private. Linking an email to a shared task does not grant mailbox access; sharing selected excerpts or files requires an explicit review.

## Planned capabilities

| Area | Coherent launch scope |
| --- | --- |
| Work management | Tasks, subtasks, dependencies, recurrence, projects, milestones, and list, board, table, and timeline views. |
| Calendar | Day, week, month, and agenda views; task blocks; overlays; conflict handling; timezones and recurrence; Google and Microsoft connections. |
| Mail | Gmail and Microsoft 365 conversations, drafts, compose/reply, attachments, provider-specific organization, rules, and task conversion. |
| Knowledge | Nested pages, a block editor, typed collections, linked views, relations, backlinks, comments, and history. |
| Capture and commitments | A capture queue, reviewed conversion into work, explicit source references, and manually confirmed promises. |
| Search and platform | Authorized full-text search, controlled historical archives, personal/shared spaces, roles, activity, export, customization, and sync health. |

These are planned capabilities, not implemented product endpoints. Core workflows must remain usable without AI, with responsive interfaces and accessible alternatives to drag interactions.

## Distinctive features

| Feature | Purpose | Release |
| --- | --- | --- |
| **Capture-to-Action** | Turn incoming information into reviewed work while preserving its source and audience. | L1 |
| **Promise Tracker** | Track confirmed commitments, responsible people, agreed dates, and outcomes. | L1, manual workflow |
| **Context Graph** | Explore authorized relationships across work, knowledge, events, promises, and decisions. | L2 |
| **Plan My Day** | Propose an editable schedule based on availability, priorities, dependencies, and estimates. | L2 |
| **Workload Weather** | Explain estimated effort relative to available capacity, including unknown inputs. | L2 |
| **Workspace Kits** | Reuse workspace setups, templates, views, and supported workflows. | L2 |
| **Decision Memory** | Preserve decisions, ownership, rationale, and affected work. | L2 |

## Implemented foundation

| Component | Current state |
| --- | --- |
| Frontend | Next.js 16.4.3, React 19.3.0, strict TypeScript, Tailwind CSS 4, and the generated starter page. |
| Backend | Fastify 5 with strict TypeScript, validated environment settings, a separate application factory and listener, liveness, security headers, safe errors, and graceful shutdown. |
| Module boundaries | Reserved locations and ownership documentation for all nine PRD domains, platform adapters, migrations, and durable workers. |
| Engineering workflow | Root commands for package setup, development, lint, type checking, tests, and builds; independent npm lockfiles. |
| Foundation tests | Backend configuration boundaries, HTTP liveness, error sanitization, schema validation, and payload limits. |

The backend exposes `GET /health/live`, returning `{"status":"ok"}`. This reports process liveness only. Database, worker, provider, and product readiness are not claimed. Unimplemented routes return 404.

No database driver, authentication service, OAuth client, queue, AI client, or MinLZ package is installed. Reserved domain folders contain no business implementations or fake responses.

## Getting started

Use Node.js 24 and npm 11. The development version is recorded in `.nvmrc`. After cloning the repository, run from the project root:

```bash
npm run setup
```

Start the frontend and backend in separate terminals:

```bash
npm run dev:frontend
```

```bash
npm run dev:backend
```

- Frontend: [localhost:3000](http://localhost:3000).
- Backend liveness: [localhost:4000/health/live](http://localhost:4000/health/live).

The default scaffold requires no external services or credentials. Optional backend overrides are documented in [backend/.env.example](backend/.env.example) and the [backend guide](backend/README.md). Local `.env` files are ignored; example configuration is tracked.

The frontend uses `next/font/google` for Geist fonts, so its build may require network access.

## Development commands

Run these commands from the project root. The root package orchestrates the two independent npm packages; it does not require a separate dependency installation.

| Command | Behavior |
| --- | --- |
| `npm run setup` | Install frontend and backend dependencies using their lockfiles. |
| `npm run dev:frontend` | Start the Next.js development server. |
| `npm run dev:backend` | Start the TypeScript backend in watch mode. |
| `npm run lint` | Run both packages’ ESLint checks. |
| `npm run typecheck` | Generate frontend route types, then check frontend and backend TypeScript. |
| `npm test` | Run the backend foundation tests. |
| `npm run build` | Build the frontend and compile the backend. |
| `npm run check` | Run lint, type checking, backend tests, and both builds. |
| `npm run start:frontend` | Serve a previously built frontend. |
| `npm run start:backend` | Run the compiled backend. |

The frontend does not yet have an automated test suite. Provider, database, archive, browser, and accessibility qualification will be added alongside the corresponding functionality. No CI pipeline is configured yet.

## Architecture

The scaffold adopts TypeScript/Fastify for the primary backend and preserves the TypeScript/Next.js frontend. Domain behavior will live in a modular monolith with focused interfaces for Workspace and Access, Work Management, Knowledge, Scheduling, Mail, Capture and Relationships, Search and Archive, Sync, and Automation.

The planned persistence layer uses PostgreSQL for canonical app-owned records and a transactional outbox. Durable workers will reconcile provider changes and update derived views. Private object storage will hold approved files and immutable archives. Google and Microsoft adapters will preserve provider-specific mail and calendar behavior.

Providers remain authoritative for provider-owned messages and events. App storage owns tasks, pages, and reviewed snapshots. Search and graph views are derived and must apply current permissions. Frontend clients will use versioned, runtime-validated [network contracts](contracts/README.md).

MinLZ remains an isolated [Go archive boundary](archive/README.md) for eligible historical data and exact-byte search. Production enablement requires format integrity, independent oracle parity, cross-block matching, current access/deletion checks, and bounded-resource evidence. No compression or search benchmark is claimed.

## Privacy and reliability

The product requirements preserve these guarantees as implementation targets:

- Private email and personal records require explicit content grants; workspace administration does not imply mailbox access.
- Current permissions apply to records, snippets, counts, relationships, exports, optional AI retrieval, and queued actions.
- Sending email, inviting attendees, and applying proposed schedules require user review.
- AI remains optional and disabled until an authorized owner enables it.
- Accepted app-owned writes commit with their outbox events; external operations expose pending, confirmed, failed, or unknown outcomes.
- Ambiguous sends are reconciled before retrying. Task deadlines, work blocks, and external events retain distinct identities.
- Logs and analytics exclude private message bodies, document content, recipients, attachments, and query text.

These are acceptance requirements, not completed production certifications. The current backend establishes transport-level defaults only.

## Delivery roadmap

| Stage | Focus |
| --- | --- |
| **L0 — Validation** | Journeys, permissions, provider prerequisites, architecture qualification, policy decisions, and search/archive experiments. |
| **L1a — Foundation** | Identity, spaces, canonical records, task/page core, durable jobs, secure files, and operational health. |
| **L1b — Connected work** | Projects, launch views, calendar, Google/Microsoft mail, collaborative knowledge, and recovery. |
| **L1c — Launch integration** | Capture, manual promises, search, controlled archives, portability, customization, accessibility, and launch evidence. |
| **L2 — Connected intelligence** | Context Graph, planning, workload, kits, Decision Memory, optional AI, and richer collaboration. |
| **L3 — Expansion and governance** | Additional providers, integrations, enterprise controls, and native/self-hosting evaluations under separate decisions. |

Dates and completion claims require implementation evidence. Future discovery ideas remain separate from committed launch scope. See the [roadmap](docs/roadmap.md) for dependencies and qualification criteria.

## Contributing

Follow applicable agent instructions, preserve unrelated work, and keep implementation aligned with the PRD and recorded decisions. Frontend changes must also follow [frontend/AGENTS.md](frontend/AGENTS.md) and the documentation bundled with the installed Next.js version.

Use focused branches such as `feat/task-capture`, `fix/calendar-timezone`, or `builds/backend-boilerplate`; do not use the `codex/` prefix. Run `npm run check`, add behavior-focused coverage for new functionality, and report exact outcomes and environmental limitations.

Keep secrets, dependency directories, builds, logs, and local planning material out of commits. Detailed implementation and checkout guidance is in the [development guide](docs/development.md).

## Documentation

- [Product requirements](docs/product-requirements.md)
- [Delivery roadmap and project design](docs/roadmap.md)
- [Development and checkout guide](docs/development.md)
- [Backend foundation decision](docs/decisions/0001-backend-foundation.md)
- [Frontend guide](frontend/README.md)
- [Backend guide](backend/README.md)

The PRD and roadmap preserve the 29 October 2026 planning baseline. Current package READMEs and adopted decisions describe what the scaffold actually implements.

## License

A project license has not been specified. Add an explicit license before distributing the project under open-source terms. Third-party dependencies retain their respective licenses.
