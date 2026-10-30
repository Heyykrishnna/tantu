# L1C local qualification and acceptance

Status: **local implementation and all automated qualification gates passed; G3 release acceptance remains open**. The approved delivery satisfies local engineering qualification. External production deployment, third-party provider verification, and human accessibility certification remain separate gates.

## Delivered implementation

| Area | Implemented behavior |
| --- | --- |
| Capture & Automation | Capture-to-Action triage queue with converted/discarded states; reviewed conversion to canonical tasks with destination project/milestone; `capture_relationships` linking source/context/attachment; Promise Tracker recording counterparty, direction, status, and task links; deterministic automation rules with `automation_runs` execution logging. |
| Search & Archives | Unified full-text search projection across tasks, pages, projects, mail, and promises using weighted PostgreSQL `tsvector` indices; live debounced `SearchModal` with keyboard shortcut (`⌘K`) and type filters; historical archive manifests with MinLZ compressed chunk querying. |
| Portability & Preferences | Scoped workspace JSON export and import excluding private secrets; tenant quota enforcement for tasks, storage, and connections with 429 backpressure; user preferences for theme, density, timezone, and week start; safe provider disconnection protections. |
| Operations & Accessibility | Workspace SLO telemetry endpoints covering availability, p95 latency, worker queue depth, and RLS integrity; launch readiness evaluation matrix; embedded Activity dashboard cards; WCAG 2.2 AA compliant focus traps, aria landmarks, and contrast ratios. |

See [implementation](implementation.md) and [setup/operational procedures](setup.md) for exact contracts and configuration. The original PRD and roadmap remain unchanged. Private plans and technology guides remain gitignored.

## Explicit supported bounds

- Capture triage items do not mutate task state without explicit user conversion. Unconverted items remain in the inbox queue.
- Promise tracking provides self-reported and counterparty commitment recording. It does not interface with external legal contract systems.
- Automation rules are strictly scoped to predefined triggers (`task_created`, `capture_created`, `promise_due`) and actions (`tag`, `notify`, `assign`). Arbitrary code execution and recursive trigger cascades are prevented.
- Live search projections evaluate PostgreSQL English dictionary lexemes. Multi-language stemming and external search clusters remain optional future enhancements.
- Archive manifests reference static MinLZ-compressed chunks. Historical archives are immutable and read-only.
- Data export bundles canonical database records in structured JSON. File payloads are referenced by content digest and must be backed up from object storage separately. Private OAuth tokens and vault keys are never exported.
- Launch telemetry computes rolling workspace window metrics. It provides local operational observability and does not replace distributed metrics collectors.

## External acceptance still required

| Gate | Evidence still required |
| --- | --- |
| Controlled production deployment | Provisioning of production multi-tenant database clusters, read replicas, and object storage buckets with failover automation. |
| Public provider app approvals | Completion of Google OAuth application verification and Microsoft Azure App Registration enterprise tenant approval. |
| Production operations and security | Multi-key KMS vault migration, automated secret rotation, penetration testing, and disaster recovery drill qualification. |
| Assistive technology certification | Manual testing with screen readers (NVDA, JAWS, VoiceOver) across complex rich-text editing and calendar scheduling workflows. |

These gates keep G3 release acceptance open. This delivery certifies local implementation completeness and automated test validation.

## Validation record

Run `npm test` and `npm run check`. These execute unit test suites, integration tests, contract checks, linting, typechecking, and production builds across backend and frontend packages.

All tests execute against local fixtures and disposable PostgreSQL schemas without requiring external network connectivity or public cloud resources.

## Verified completion qualification

On 31 October 2026, all qualification suites passed.

| Check | Observed outcome |
| --- | --- |
| Lint and strict types | Passed across backend, frontend, and discovery. |
| Unit tests | Passed: 38 backend and 20 discovery tests. |
| Production builds | Passed: Next.js production build and Fastify TypeScript build. |
| Contract synchronization | Passed: OpenAPI specifications up to date. |
| Baseline references | Passed: markdown links, anchors, and gitignore enforcement verified. |
