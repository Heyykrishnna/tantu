# tantu: Your work, finally connected.

Product Requirements Document and Implementation Specifications

Version 1.0 | 29 October 2026 | Status: Baseline for product and engineering review

Audience: Product, design, engineering, QA, security, operations, and delivery partners.

## 1 Executive decision

Build a hosted, browser-based workspace for individuals and small teams that connects tasks, projects, time, email, and knowledge through shared record identities, explicit relationships, and reliable synchronization. A user should be able to receive an email, capture a commitment, create a task, schedule focused work, attach the relevant knowledge, and track the outcome without repeatedly copying information between tools.

The launch must offer usable tasks and projects, nested pages and structured collections, a configurable day/week/month/agenda calendar, Gmail and Microsoft 365 email, permission-aware search, and operationally reliable sync. Capture-to-Action and a manual Promise Tracker provide the initial distinctive experience. Context Graph, Plan My Day, Workload Weather, Workspace Kits, and Decision Memory follow in staged releases.

AI is optional. Core workflows must remain usable without it. Personal email stays private unless its owner explicitly shares selected content. AI-generated email, attendee invitations, and proposed schedules require user review before execution. Compression and archive searching are explicit engineering requirements, with MinLZ integrated for appropriate historical data rather than treated as the universal workspace search engine.

This document specifies the product and its implementation requirements. It does not represent an implemented application, connected provider account, validated benchmark, or delivery estimate. Technology choices, numerical service targets, and retention defaults below are proposals for engineering review; the product direction and release structure were confirmed through the requirements interview.

## 2 Problem statement

People manage commitments across disconnected project tools, calendars, email clients, and documents. A project can look healthy while a crucial email remains unanswered. A task may have a deadline without reserved time to complete it. Meeting decisions disappear into notes, and linked information is copied until different versions disagree.

A collection of separate screens does not solve this problem. Users need a connected system in which relationships are visible, scheduling reflects actual capacity, private information remains private, and integration failures are understandable and recoverable.

The reference app provides a useful starting interaction model for task-oriented collaboration. The intended product extends that model into a complete workspace with real mail, structured knowledge, deeper scheduling, and explicit commitment tracking.

## 3 Technology stack and implementation use cases

The frontend will be written in TypeScript. The primary backend may be TypeScript or Rust, selected during L0 using team capability, integration needs, measured workload, operational cost and maintainability. The technologies below are the proposed implementation baseline, not a claim that dependencies have been installed or the application has been built. They implement the existing product requirements without changing release scope.

### Languages and runtime responsibilities


| Layer                            | Language or runtime                                                   | Responsibility and use case                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend application             | TypeScript in strict mode, including TSX                              | All authored browser application logic: tasks, calendar interactions, mail, knowledge editing, views and settings. TypeScript is compiled for browser execution; runtime validation remains necessary for external data. |
| Primary backend option A         | TypeScript on a supported Node.js LTS release                         | Domain operations, authorization, provider integrations, background processing and real-time endpoints where the TypeScript implementation is selected.                                                                  |
| Primary backend option B         | Rust on a supported stable toolchain                                  | The same domain responsibilities where Rust is selected; use explicit error handling, bounded concurrency and typed request/response structures. Selection does not change frontend language or product behavior.        |
| Canonical persistence            | SQL with PostgreSQL                                                   | Relational constraints, transactions, migrations, tenant scoping, outbox records, provider mappings, audit and full-text projections.                                                                                    |
| Existing MinLZ integration       | Go for the isolated upstream archive adapter                          | Preserve the previously specified Go MinLZ integration behind an internal interface. This is an auxiliary archive worker, not the primary product backend or frontend.                                                   |
| Build and delivery configuration | JSON, YAML, container build definitions and environment configuration | Reproducible dependency manifests, validation pipelines and deployment configuration. Secrets are injected by the hosting environment, never stored in these files.                                                      |


Use the [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html), [Node.js release policy](https://nodejs.org/en/about/previous-releases) and [Cargo guide](https://doc.rust-lang.org/cargo/guide/) when selecting supported toolchains. Exact compatible versions must be pinned in the implementation repository; this PRD does not assume that an untested latest release is suitable.

### Frontend technologies and product use cases


| Area                             | Proposed technology                               | Use case and implementation constraints                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application framework            | React with Next.js, authored in TypeScript        | Workspace navigation, layouts, record routes, detail panels and authenticated application pages. Interactive calendars and editors run in appropriate browser modules. Keep authorization in the backend even when rendering on the server.                 |
| Styling and interface primitives | Tailwind CSS and Radix Primitives                 | Shared design tokens, themes, dialogs, menus, tabs, popovers and keyboard/focus behavior. Build the product's custom interface on these primitives; using a library does not itself prove accessibility conformance.                                        |
| Server data state                | TanStack Query                                    | Loading, refetching, mutation feedback and invalidation for task, mail, calendar and collection views. Optimistic updates need rollback or conflict states; a cached result never replaces current server authorization.                                    |
| Structured collection views      | TanStack Table                                    | Customizable columns, sorting, grouping and table presentation for tasks and collections. Large datasets use backend pagination/filtering; the browser must not fetch an entire workspace to render a table.                                                |
| Knowledge editor                 | Tiptap built on ProseMirror                       | Rich blocks, formatting, mentions, custom record nodes and extensible page schemas. Implement product-specific block behavior and persist structured content; editor extensions do not automatically provide all Notion-style features.                     |
| Collaborative documents          | Yjs with an authenticated collaboration transport | Concurrent page-body editing, presence and reconnect recovery. Persist updates and snapshots under document authorization; membership changes must close unauthorized subscriptions. Keep structured properties and permissions in transactional storage.   |
| Calendar presentation            | FullCalendar with its React integration           | Day/week/month and list-style agenda presentation, event interaction and scheduling feedback. Add the product's overlays, conflict explanation, task links and non-drag editing paths. The backend remains responsible for canonical scheduling validation. |
| Context Graph presentation       | React Flow in L2                                  | Interactive navigation between authorized work, documents, events, promises and decisions. Graph relationships are supplied by the backend; a graph-rendering library neither discovers relationships nor grants access.                                    |


Framework and library capabilities are documented by [React](https://react.dev/learn), [Next.js](https://nextjs.org/docs/app/getting-started/installation), [Tailwind CSS](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Radix](https://www.radix-ui.com/primitives/docs/overview/introduction), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview), [TanStack Table](https://tanstack.com/table/latest/docs/overview), [Tiptap](https://tiptap.dev/docs/editor/getting-started/overview), [Yjs](https://docs.yjs.dev/), [FullCalendar React](https://fullcalendar.io/docs/react) and [React Flow](https://reactflow.dev/learn). Their selection for this product is an engineering proposal.

Check licensing for each chosen editor extension and hosted collaboration feature. Some capabilities may require commercial subscriptions or product-owned implementation. FullCalendar resource/timeline functionality is part of its separately licensed Premium offering; do not assume a standard calendar installation includes it. Evaluate an appropriate licensed extension or a separate implementation for the already required project timeline. [FullCalendar Premium documentation](https://fullcalendar.io/docs/premium)

### Backend selection and implementation approach

**TypeScript option:** Use Fastify on Node.js for the primary backend, with schema-based request/response validation and explicit domain modules. Kysely with a PostgreSQL driver is the proposed SQL access layer. Use pg-boss for durable PostgreSQL-backed jobs if its selected version satisfies the retry, lease, scheduling and concurrency requirements. Keep business logic in the backend modules rather than duplicating it across Next.js handlers and worker entry points. [Fastify TypeScript documentation](https://fastify.dev/docs/latest/Reference/TypeScript/), [Kysely](https://www.kysely.dev/), [pg-boss](https://github.com/timgit/pg-boss)

**Rust option:** Use Axum with Tokio for the primary backend and asynchronous execution, and SQLx for PostgreSQL access and migrations where appropriate. Provider adapters, authorization and domain rules remain behind the same module interfaces. Rust owns the authoritative backend implementation when this option is selected; the TypeScript frontend communicates through documented network contracts rather than importing Rust internals. [Axum documentation](https://docs.rs/axum/latest/axum/), [SQLx documentation](https://docs.rs/sqlx/latest/sqlx/)

For a TypeScript-oriented delivery team building an integration-heavy L1, TypeScript is the proposed initial backend choice because it consolidates implementation languages and tooling. Choose Rust instead when the delivery team can maintain production Rust and measured concurrency, resource or deployment requirements justify that choice. Language choice alone is not evidence of better application performance or security. Prototype a representative provider-sync flow, permissioned query and sustained worker load before finalizing the decision.

Select one primary backend implementation. Do not implement every domain twice or introduce a Rust rewrite solely in anticipation of growth. A measured bottleneck may later justify an isolated worker while preserving its documented interface. The existing Go MinLZ adapter remains separate because the verified upstream implementation is Go; a native Rust or TypeScript replacement is not assumed. Any replacement would require format compatibility, integrity and exact-search parity with the existing acceptance suite.

For Rust-backed delivery, choose and validate the durable job implementation during L0; pg-boss is a Node.js library and is not assumed to run natively in Rust. Use durable job records, claims/leases, retries and checkpoints that meet the existing synchronization specification. Likewise, verify Yjs transport/persistence compatibility with the chosen collaboration host rather than assuming identical browser and backend libraries exist.

### Data integrations and platform technologies


| Area                               | Technology or standard                                                          | Use case and implementation constraints                                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary data store                 | PostgreSQL                                                                      | Canonical tasks, projects, properties, grants, provider state, send intents, outbox and audit metadata. Use indexes, constraints and transactions; maintain one authoritative migration history regardless of backend language.                                                                    |
| Live search                        | PostgreSQL full-text search initially                                           | Search authorized normalized text for tasks, pages and mail with filters and ranking. Evaluate language configurations and relevance fixtures. Typo tolerance, prefixes and semantic matching require explicit additional implementation; they are not automatically supplied by full-text search. |
| Attachments and archives           | Private S3-compatible object storage                                            | Store attachments, exports, immutable MinLZ streams and sidecars. Verify the chosen provider's range reads, encryption, lifecycle and signed-access behavior; compatibility does not guarantee identical features.                                                                                 |
| Identity and sessions              | OpenID Connect-compatible identity provider plus secure application sessions    | User sign-in, verified identity, session revocation and supported MFA. Select the provider in L0. Workspace and record authorization remain application responsibilities.                                                                                                                          |
| Mail and calendar access           | Google Gmail API, Google Calendar API and Microsoft Graph using delegated OAuth | Account consent, reading/sending mail, labels/folders, event changes and delta/history sync. User sign-in and permission to access a mailbox are distinct grants. Use the existing provider-specific synchronization contracts.                                                                    |
| Network contracts                  | HTTPS, JSON and a versioned OpenAPI contract                                    | Document requests, responses, errors, pagination, operation IDs and authorization expectations. Generate or validate TypeScript clients so either backend language can serve the same frontend. Validate at runtime as well as compile time.                                                       |
| Real-time updates                  | Authenticated WebSocket connections where continuous subscriptions are needed   | Collaborative documents, presence and selected record-change notifications. Reconnect from durable state; WebSocket delivery is not a substitute for persisted writes, replay or permission checks.                                                                                                |
| Timezone and recurrence processing | IANA timezone data and backend-compatible RFC 5545 handling                     | Preserve local recurrence intent, all-day dates and DST behavior. Choose the library after selecting the backend, test shared fixtures and pin timezone-data updates; calendar display libraries do not resolve provider recurrence semantics automatically.                                       |
| File safety                        | Isolated malware scanner, with ClamAV as an evaluation candidate                | Quarantine attachments and uploads until scan results are available. Apply size/time limits and update signatures. Review licensing and deployment requirements; a clean scan is not proof that a file is harmless.                                                                                |
| Archive compression and search     | Pinned upstream MinLZ Go library and mz-compatible exact-search behavior        | Implement the existing immutable archive, manifest, sidecar, boundary matching and resource-limit specifications. Keep ordinary live search and archive literal-byte search as distinct retrieval paths.                                                                                           |
| Optional AI                        | Provider adapter behind the existing opt-in and action-review policies          | Capture suggestions, plan explanations, meeting briefs and source-grounded summaries in their assigned releases. No AI vendor, model, retention promise or new autonomous action is selected by this stack section.                                                                                |


Supporting documentation: [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html), [Amazon S3 object-storage overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html), [OpenID Connect](https://openid.net/developers/how-connect-works/), [OpenAPI specification](https://spec.openapis.org/oas/v3.1.1.html), [IANA timezone database](https://www.iana.org/time-zones) and [ClamAV](https://docs.clamav.net/). Existing numbered sources cover the provider integrations, recurrence specification and MinLZ behavior. Cloud provider, region, identity vendor and scanner choice remain implementation decisions.

### Development testing deployment and operations

Use Git for version control, pnpm for TypeScript dependency management, Cargo for Rust when selected, and Go modules for the archive adapter. Commit the appropriate lockfiles, pin supported toolchains and avoid floating production image tags. Keep application code, contracts, SQL migrations and deployment configuration organized by ownership. TypeScript frontend code can be shared with a TypeScript backend only where the logic is actually appropriate for both environments; shared types do not replace runtime validation.

Use Vitest and React Testing Library for TypeScript behavior and interface tests, Playwright for browser journeys, and axe-core for automated accessibility checks alongside the existing manual qualification. Rust uses its native test tooling plus database/provider integration tests. The Go archive adapter uses Go tests, race checks and bounded fuzzing for its existing correctness suite. These tools implement the acceptance program; they do not add new product scope. [Vitest](https://vitest.dev/guide/), [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), [Playwright](https://playwright.dev/docs/intro), [axe-core](https://github.com/dequelabs/axe-core)

Use Docker-compatible container images for backend and worker deployment, with a Next.js-compatible frontend host and static-asset delivery. The hosting environment must support the chosen connection lifetimes, background processing, regional storage and recovery targets. Request-limited frontend functions must not be assumed to run persistent sync jobs or collaboration connections. Choose the cloud provider and infrastructure configuration during L0. [Docker documentation](https://docs.docker.com/get-started/docker-overview/)

Use OpenTelemetry instrumentation for traces, metrics and correlation across requests, sync jobs and archive operations, with an appropriate monitoring backend selected during deployment planning. Apply the existing content-free logging policy. Use managed secret storage and key management for provider tokens and encryption; keep production, staging and local-development access separate. Configure PostgreSQL backups and rehearse restoration rather than assuming a managed database automatically meets the stated recovery targets. [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/), [PostgreSQL backup and restore](https://www.postgresql.org/docs/current/backup.html)

Run the existing required validation stages in the selected repository's continuous-integration system; GitHub Actions is the proposed option if the source repository is hosted on GitHub. Gate deployment on the relevant frontend, backend, database, provider-contract and archive checks. Build immutable artifacts, apply reviewed migrations, verify health and retain a rollback path. Package-manager/runtime compatibility and dependency licensing must be verified before locking versions. [GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions), [pnpm installation and compatibility](https://pnpm.io/installation)

### Technology use cases across the existing workflows

1. **Convert an email into scheduled work:** The TypeScript mail interface reads an authorized thread through the selected backend. A backend transaction creates the reviewed task, source reference and outbox record in PostgreSQL. The calendar interface previews a block; the scheduling module validates it before a provider job applies approved external changes. TanStack Query refreshes the canonical views.
2. **Collaborate on a project page:** React and Tiptap render the page; Yjs exchanges authorized document updates through the collaboration transport. The backend persists document state and validates structured properties separately. PostgreSQL relations connect the page to the existing project and tasks without duplicating their identities.
3. **Search active and historical information:** Live requests use the permission-aware PostgreSQL search projection. An explicit archive request reaches the isolated Go MinLZ adapter after authorization, maps exact-byte matches back to records, and returns only permitted results with accurate coverage. The primary backend remains Rust or TypeScript in either path.
4. **Recover provider synchronization:** The chosen backend's durable workers resume from persisted PostgreSQL checkpoints, honor throttling and update provider projections. The TypeScript interface displays freshness and failures; operational telemetry reports queue delay without exposing message content.
5. **Deliver Context Graph and Plan My Day:** In their existing release phases, React Flow displays backend-authorized relationships and the scheduling module proposes constrained task blocks. The TypeScript frontend presents explanations and review controls; neither visualization libraries nor AI may bypass the existing access and action policies.



## 4 Users and jobs to be done

**Individual operator:** Manages personal work, appointments, correspondence, ideas, and follow-ups. Needs a clear daily plan with minimal setup and private data by default.

**Small-team contributor:** Executes assigned work and collaborates on shared projects while retaining personal calendar and mail privacy. Needs an accurate view of obligations and supporting material.

**Team lead or project owner:** Coordinates milestones, dependencies, workload and decisions. Needs project health supported by visible evidence rather than unexplained scores.

**Workspace administrator:** Manages members, access, integrations, retention, usage and security. Needs permission clarity and operational diagnostics without automatic access to private mailbox content.

**Invited guest:** Reviews or contributes to explicitly shared project/page content. Must never gain workspace-wide access through a shared link, relation, or search result.

Primary job: “When information arrives, help me understand what matters, decide what to do, reserve the time, find the context, and know whether the commitment was fulfilled.”

## 5 Goals and measures

The following are proposed pilot targets, not validated market or performance claims. Establish a baseline during discovery and revise them with measured usage.


| Goal                  | Definition                                                                                                             | Proposed pilot target                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Activation            | Invited users who create a task, schedule a block, and link one context item within seven days                         | At least 60% of activated pilot accounts                               |
| Capture efficiency    | Median time from opening a received message to creating a linked task, excluding user writing time                     | Under 30 seconds in a scripted usability test                          |
| Connected adoption    | Weekly active workspaces using at least three of tasks, calendar, mail, knowledge                                      | At least 50% of retained pilot workspaces                              |
| Commitment completion | Confirmed commitments completed by their agreed due date                                                               | Improve versus each pilot team's baseline; no invented absolute target |
| Search usefulness     | First five results contain the expected authorized record for a curated query set                                      | At least 90% on the agreed relevance set                               |
| Trust                 | Silent lost accepted writes, unauthorized disclosure, or confirmed duplicate sends attributable to application retries | Zero in release qualification; incidents block rollout                 |
| Integration health    | Active connections with successful reconciliation within their stated service window                                   | At least 99% during healthy-provider pilot periods                     |


Collect content-free events for activation, conversion, scheduling and recovery. Do not place email bodies, page text, query strings, recipients, or attachments in product analytics. Distinguish product failures from provider delays and user revocation. Use opt-out controls and documented analytics retention.

## 6 Scope and release priorities

L0 is discovery and technical validation. L1 is the coherent launch. L2 adds intelligence and richer collaboration. L3 adds extensibility and advanced governance. “Later” means deliberately excluded from L1, not silently promised by a fixed date.


| Capability           | L1 coherent launch                                                                                       | L2 expansion                                                                  | L3 advanced                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Work                 | Tasks, subtasks, dependencies, recurrence, projects, milestones, list/board/table/timeline               | Goals, richer portfolio and workload planning                                 | Advanced resource planning                                         |
| Calendar             | Day/week/month/agenda, time blocks, overlays, Google/Microsoft connections, conflicts                    | Assisted replanning, availability and booking workflows                       | Additional providers and resource calendars                        |
| Email                | Gmail/Microsoft 365, threads, compose/reply, attachments, labels/folders, drafts, rules, task conversion | Shared inboxes, delegation, advanced automation                               | Generic IMAP/SMTP after capability/security review                 |
| Knowledge            | Nested pages, block editor, typed properties, collections, relations, backlinks, views, history          | More formulas, synced blocks, advanced import                                 | Expanded publishing and integration ecosystem                      |
| Distinctive features | Capture-to-Action, manual Promise Tracker, record relationship panel                                     | Context Graph, Plan My Day, Workload Weather, Workspace Kits, Decision Memory | Cross-workspace and advanced optimization only after access design |
| Search               | Unified full-text, filters, ranked results; MinLZ archive integration behind a controlled rollout        | Optional semantic retrieval and better relevance                              | Additional scale tiers                                             |
| Platform             | Accounts, spaces, roles, audit, export, sync health, basic rule engine                                   | Public integration interface and signed webhooks                              | SSO/SCIM, self-hosting evaluation, advanced policy                 |


All L1 Must requirements are necessary for launch. A pilot can use explicit feature flags and narrower cohorts, but cannot label partial email, broken sync, or cosmetic calendar controls as a complete L1 release. MinLZ search is a required engineering deliverable; production archive search remains disabled until correctness and security gates pass.

## 7 Experience principles and information architecture

Use a persistent workspace switcher and navigation for Home, Capture, My Work, Projects, Calendar, Mail, Knowledge, Search, and Activity. Keep mail, workspace notifications, and captured items distinguishable, even if a configurable Home shows a summary of all three. Each has different ownership, retention and action semantics.

A consistent detail panel shows the record's properties, relationships, source, comments, history and permissions. Users can open a full page without losing the originating view. A command palette supports navigation, search and creation. Destructive or externally visible actions require clear action-specific UI, and pending provider writes are labeled until acknowledged.

Customization must work at personal, space and workspace levels. A user's density, timezone and default calendar view must not unexpectedly change teammates' settings. Shared schemas and shared views require appropriate edit access. Accessible defaults remain available after customization.

### Canonical user journeys

1. **Email to scheduled work:** Open a message; select Convert to task; review title, project, due date and shared fields; create one linked task; place a time block; complete work; optionally draft a reply; review and send. The private source remains private.
2. **Meeting to decision and execution:** Open an event; create linked notes; record a decision with owner and rationale; create follow-up tasks; attach commitments; show completion in the project and meeting context.
3. **Daily planning:** Review overdue commitments, available calendar time and unscheduled tasks; choose tasks; preview a conflict-free plan; adjust and apply; show pending external writes and any rejected changes.
4. **Research to knowledge:** Capture a link or note; triage it into a page or collection; add properties and relations; reuse the same record in multiple views; discover authorized backlinks later.
5. **Project recovery:** An upstream dependency slips; show affected tasks and milestones; preview suggested schedule changes; preserve locked events; publish chosen changes with an activity record.
6. **Connection recovery:** An email watch expires or a calendar token invalidates; continue local work; show sync status; reconcile safely; deduplicate replayed changes; resolve conflicts without losing accepted local edits.



## 8 User stories

1. As an individual, I want a private personal space so that I can organize work without sharing it with my team.
2. As a member, I want shared spaces so that project information has an understandable audience.
3. As a contributor, I want tasks with clear owners and deadlines so that responsibility is explicit.
4. As a contributor, I want subtasks so that large work can be completed incrementally.
5. As a project owner, I want dependencies so that blocked work and downstream risk are visible.
6. As an individual, I want recurring tasks so that routine work does not require repeated entry.
7. As a team lead, I want project milestones and progress so that status reflects actual work.
8. As a contributor, I want board, list, table and timeline views so that I can choose how to work.
9. As a member, I want saved filters and layouts so that I can return to a useful view.
10. As a collaborator, I want comments, mentions and history so that decisions and changes are traceable.
11. As a scheduler, I want day, week, month and agenda views so that I can navigate different planning horizons.
12. As a contributor, I want to drag or keyboard-schedule a task so that it has protected working time.
13. As an individual, I want configurable hours and timezones so that the calendar reflects my actual day.
14. As a traveler, I want timezone-safe recurrence so that meetings retain their intended local time.
15. As a member, I want calendar overlays so that I can compare work and personal availability safely.
16. As a scheduler, I want conflicts and buffers shown so that I avoid impossible plans.
17. As an account owner, I want Google and Microsoft calendar synchronization so that external changes remain visible.
18. As a mail user, I want multiple connected accounts so that I can work from one client.
19. As a mail user, I want provider-faithful labels and folders so that organizing mail has predictable results.
20. As a mail user, I want threaded conversations so that context is retained.
21. As a mail user, I want drafts, replies and attachments so that the inbox supports real correspondence.
22. As a mail user, I want visible sending and failure states so that I know whether a message was sent.
23. As a mail user, I want rules and snoozing so that I can control attention.
24. As a contributor, I want email-to-task conversion so that requests become trackable work.
25. As an account owner, I want selected content sharing so that creating a team task does not expose my mailbox.
26. As a writer, I want nested pages and a rich block editor so that knowledge is structured and readable.
27. As a project owner, I want typed collection properties so that different records can be compared consistently.
28. As a member, I want linked views so that I can reuse records without duplicating them.
29. As a reader, I want relations and backlinks so that I can discover relevant authorized context.
30. As a writer, I want templates and history so that repeated work is consistent and mistakes are recoverable.
31. As a member, I want global search so that I can find tasks, mail, pages, events and commitments together.
32. As a member, I want filters and explained search matches so that results are useful and trustworthy.
33. As a user, I want to search archived text so that older context stays retrievable at controlled storage cost.
34. As an individual, I want one capture action so that I can record information without choosing its final structure immediately.
35. As a contributor, I want an explicit promise record so that requests and commitments are distinguished.
36. As a team lead, I want a context graph so that dependencies and supporting evidence can be explored.
37. As an individual, I want a reviewable daily plan so that scheduling assistance respects my choices.
38. As a contributor, I want understandable workload forecasts so that I can address overload early.
39. As an administrator, I want reusable workspace kits so that setup is repeatable and safe.
40. As a project owner, I want decision memory so that later changes retain the reasons behind earlier choices.
41. As a guest, I want access limited to invited content so that collaboration does not expose unrelated records.
42. As an administrator, I want audit and sync health so that failures can be investigated without reading private content.
43. As a user, I want export and account disconnection so that I control my data.
44. As a keyboard or screen-reader user, I want equivalent scheduling and editing actions so that all essential work is accessible.
45. As a mobile-browser user, I want usable capture, mail and agenda flows so that I can act away from my desk.
46. As a user with an interrupted connection, I want safe recovery of local drafts so that accepted work is not silently lost.
47. As an account owner, I want AI controls and source citations so that assisted actions remain reviewable.
48. As a team, I want reliable automations so that repeated events do not create duplicate work or feedback loops.
49. As a project owner, I want meeting preparation and review summaries so that relevant actions are visible before and after a meeting.
50. As a workspace owner, I want usage controls so that storage, provider sync and optional AI costs remain understandable.



## 9 Requirement conventions

Each functional requirement has a stable ID, release, behavior, and observable acceptance condition. L1 items are Must unless marked otherwise. L2/L3 items are planned scope and do not block L1. Detailed interaction designs and delivery tickets must retain these IDs.

Acceptance statements define required behavior, not a claim that testing has occurred. Where behavior depends on provider support, the UI must expose the supported capability and explain unavailable actions rather than pretending every provider behaves identically.

## 10 Shared data model and invariants

Use canonical records with stable identifiers and explicit typed relationships. “Synced” means an observable consistency contract, not instantaneous agreement among independent systems. The database is authoritative for application-owned state; providers are authoritative for provider-owned mail/event state; the search index and graph are projections.


| Entity group        | Core records                                                                       | Key invariant                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Identity and access | User, Workspace, Membership, Space, Grant, Session                                 | Every record and relationship belongs to an explicit tenant and access scope                |
| Work                | Task, TaskOccurrence, Dependency, Project, Milestone                               | Views never become independent task stores; dependency graph is acyclic                     |
| Time                | CalendarConnection, Calendar, EventSeries, EventOccurrence, TimeBlock              | Task deadline, work block and external event remain separate linked concepts                |
| Mail                | MailConnection, Mailbox, Message, Thread, Label, Draft, SendIntent                 | Provider/account identity is part of external keys; drafts and send intents are distinct    |
| Knowledge           | Page, BlockDocument, Revision, Collection, PropertyDefinition, PropertyValue, View | Schema, values, document and view configuration are independently versioned                 |
| Context             | CaptureItem, Promise, Decision, Relation, SourceReference                          | A link never confers source access; suggestions remain distinguishable from confirmed facts |
| Operations          | SyncCursor, SyncJob, OutboxEvent, AutomationRun, AuditEntry, ArchiveManifest       | Accepted writes have durable status; retries are idempotent or explicitly uncertain         |


Common fields include tenant, owner or owning space, created/updated timestamps, record version, deletion/archive state, provenance and access-policy reference. External mappings include provider, account, external resource ID, resource version/ETag where available, last seen and sync generation.

A task may be represented as a specialized collection record, but it must retain one canonical task ID and shared validation. Avoid maintaining a generic collection copy and a second task copy. A page body can use a collaborative document representation; structured properties still need transactional constraints and version checks.

Relations store both endpoint identities, type, provenance, creator and confirmation state. Relation visibility requires authorization to the relevant endpoints; counts, graph traversal and search cannot reveal hidden records. Where an endpoint is unavailable, render a neutral unavailable reference only if its existence itself is permitted.

A mail-to-task conversion creates a source reference and, only with explicit sharing, an application-owned snapshot of selected text or files. Subsequent source deletion/disconnection does not retroactively erase already shared snapshots without a documented policy; the creation flow must explain that distinction. Snapshots remain governed by their destination retention and access rules.

### Required consistency rules

- Complete an accepted app-owned write and its outbox event in one database transaction.
- Apply a multi-record app-owned operation atomically where possible. Cross-provider operations are staged, status-tracked workflows with compensation where supported; do not promise distributed atomicity.
- Use record versions to reject stale structured edits. Collaborative document merges use a documented conflict-safe strategy and cannot overwrite structured permissions.
- Check source permissions at retrieval and immediately before external execution, not only when a job is queued.
- Apply tombstones before returning archive or search results; deleting a source cannot be undone by an old sync replay.
- Compute rollups and search projections from canonical state. Display freshness when a projection lags.
- Distinguish local pending, provider confirmed, failed and unknown states throughout the interface.



### Exact search processing flow

1. Authenticate the caller and resolve current tenant/resource scope.
2. Select only eligible manifest generations and privacy compartments.
3. Validate object/sidecar association and retrieve authorized encrypted ranges.
4. Decrypt, inspect conservative block filters, decode candidates and handle boundary overlap.
5. Verify exact matches, map byte spans to record IDs, then apply current ACL and tombstones.
6. Return authorized snippets with completeness and coverage; record content-free operational statistics.



## 11 Optional AI and planning policies

AI configuration is off until enabled by an authorized workspace/account owner. A user can exclude particular email accounts, spaces or record types. Explain which content leaves the product, the configured processing provider and its retention terms before activation. Do not claim zero retention or no training without contractual support.

AI retrieval applies the same current access rules as normal search. Treat retrieved email and document text as untrusted content; embedded instructions cannot grant tool permissions. Tool execution accepts validated structured actions, uses the user's delegated authority, and revalidates the target and recipient before execution.

Proposed actions show their sources, assumptions and resulting changes. The user can edit or reject them. Sending email, inviting attendees and applying a proposed schedule always require review under the confirmed product policy. Capturing a suggested commitment does not mean it is confirmed.

Plan My Day begins as a deterministic scheduling module: reserve fixed busy intervals and buffers; order eligible work by due-date pressure, priority and dependency readiness; place bounded blocks within permitted hours; return unplaced tasks with reasons. Configurable weights and tie-breakers must be disclosed. Do not promise an optimal schedule or infer personal energy from sensitive behavior.

Workload Weather uses a disclosed planning ratio: remaining eligible estimated effort divided by available working capacity over the same horizon. Zero capacity and unknown estimates are explicit states. Proposed initial thresholds are Clear at or below 80%, Tight above 80% through 100%, and Overloaded above 100%; these are tunable product heuristics awaiting pilot calibration.

AI qualification uses synthetic or consented fixtures for factual support, permission adherence, date/owner extraction, harmful instructions embedded in sources, incorrect recipients, unsupported claims and user rejection. Measure suggestion acceptance separately from correctness. The product must remain operational during an AI outage, quota exhaustion or account opt-out.

## 12 Architecture and module design

This is a greenfield proposal: no application repository was supplied or modified. Prefer a modular monolith for the primary application, durable asynchronous workers for provider and projection work, and a narrow Go archive worker/module for MinLZ. Do not begin with distributed ownership of every feature.

Proposed implementation stack: TypeScript web application, a mature collaborative block editor, PostgreSQL for canonical records and access, object storage for attachments/archives, a durable job system, and permission-aware full-text search. Evaluate PostgreSQL full-text first for pilot scale; select a dedicated search engine only when measured relevance/scale requirements justify it. Validate framework/editor licensing and current versions before committing. The Go archive worker is justified by the verified upstream MinLZ implementation.

### Module interfaces and ownership


| Module                    | Small external interface                                    | Complexity it owns                                             | Proof at the interface                                      |
| ------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Workspace and access      | Resolve scope; authorize action; grant/revoke access        | Tenant isolation, roles, inheritance, private sources          | Cross-tenant, guest, revocation and inheritance tests       |
| Work management           | Change task; change project; resolve dependencies           | Lifecycle, recurrence, progress, bulk validation               | Observable work-state transitions and cycle rejection       |
| Knowledge                 | Edit document; change collection; render view               | Block revisions, schemas, linked views, collaboration          | Concurrent editing, schema migration and canonical identity |
| Scheduling                | Preview change; apply change; list availability             | Recurrence, timezones, conflicts, locked time, task blocks     | DST, conflict and stale-preview tests                       |
| Mail                      | Read conversation; save draft; submit send intent           | Provider semantics, recipients, safe rendering, ambiguous send | Provider-contract and duplicate-submission tests            |
| Capture and relationships | Triage capture; link records; confirm promise/decision      | Provenance, conversion, deduplication, context                 | Conversion privacy and atomic app-owned outcomes            |
| Search and archive        | Find authorized records; search authorized history          | Ranking, projection freshness, MinLZ manifests and offsets     | Relevance, ACL and byte-oracle tests                        |
| Sync                      | Reconcile resource; submit provider mutation; report health | Cursors, retries, deduplication, renewal, recovery             | Crash/replay, stale cursor and outage tests                 |
| Automation                | Preview rule; execute approved run; inspect result          | Trigger identity, limits, permission checks, action policy     | Replay, loop prevention and revoked-owner tests             |


Use deep modules: callers submit a domain operation rather than orchestrating cursor storage, permission checks and provider retries themselves. Apply the deletion test: removing a justified module would force the same complexity back into multiple callers. Do not create pass-through wrappers merely to increase layer count.

The interface is the test surface. Pure scheduling and workload computations need no remote adapter. Database tests use an isolated real or compatible local database. External providers vary through injected adapters, justified by Google, Microsoft and deterministic test adapters. Avoid exposing internal retry or storage mechanics to every feature caller.

### Alternatives considered

A frontend-only prototype cannot satisfy durable sync, OAuth token protection and shared permissions. A feature-by-feature microservice architecture adds cross-module consistency and operational cost before scale evidence exists. A universal generic-record abstraction alone obscures mail and calendar semantics. A single compressed archive search engine cannot provide all live relevance and filtering behavior. The proposed architecture retains canonical links while allowing specialized behavior where it is required.

## 13 Interface and workflow contracts

All mutating application interfaces validate structured inputs, tenant/resource authorization, record versions and operation IDs. Use cursor pagination and bounded batch sizes; expose stable errors such as Forbidden, Validation Failed, Conflict, Reauthorization Required, Rate Limited, Provider Unavailable and Outcome Unknown. Never return credentials or raw provider traces to users.

**Task mutation contract:** Actor, workspace, task identity, expected version, field changes and operation key produce the canonical updated record plus version and related pending effects. Reusing the same operation key with a different payload is rejected.

**Scheduling contract:** A preview includes selected resources, source versions, timezone, proposed intervals, conflicts and external effects. Apply accepts that preview identity and rechecks versions; an outdated preview returns Conflict with a new explanation rather than applying stale changes.

**Mail sending contract:** A send intent references the account, durable draft version, reviewed recipients and attachment versions. The result exposes provider-confirmed acceptance or a truthful intermediate/error state. An application operation key does not imply provider-wide exactly-once delivery.

**Conversion contract:** Capture source, destination space, selected shared fields and operation key produce linked output IDs and a permission summary. Cross-provider steps may complete separately and must remain traceable.

**Search contract:** Query, authorized filters, bounded page size and cursor produce authorized results, matched context and coverage/freshness. Archive requests add explicit literal-pattern semantics and completeness state.

**Event envelope:** Durable internal events include event ID, schema version, tenant, actor reference, source record/version, correlation ID and occurrence time. Consumers deduplicate event IDs and reject incompatible schema versions; event payloads contain the minimum content necessary.

## 14 Permissions privacy and security


| Role or audience          | Default scope                                                         | Explicitly restricted                                                      |
| ------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Personal owner            | Own private space, own connected accounts, chosen shared spaces       | Other users' private content                                               |
| Workspace owner/admin     | Membership, workspace settings, integration policy and audit metadata | Private mail bodies and personal records without an explicit content grant |
| Member                    | Shared spaces and records granted by policy                           | Administrative controls and unrelated private spaces                       |
| Guest                     | Specifically invited records and allowed descendants                  | Workspace browse/search, unrelated relation endpoints, mailbox connections |
| Automation or integration | Scoped delegated actions and records                                  | Rights beyond the initiating identity or token scope                       |


Recommended L1 sharing granularity is space/record level; field-level collaborative permissions are excluded. Private source excerpts require a separate reviewed snapshot because a shared task's description is visible to task viewers. Public links are disabled by default; broad public publishing is later scope.

Enforce tenant scoping in storage queries and application authorization, with defense-in-depth database policies where appropriate. Use secure cookies/session handling, CSRF protection for applicable operations, OAuth state and PKCE where supported, encrypted token storage, managed secrets and key rotation. Validate webhooks and sanitize mail/editor HTML. Harden uploads, embeds and server-side URL fetching against malicious content and request forgery.

Revocation must block new reads immediately through canonical authorization. Proposed projection cleanup target is within 60 seconds under healthy conditions; source checks still prevent disclosure while cleanup lags. A derived artifact such as an explicitly shared snapshot has its own access and retention policy, disclosed during creation.

Proposed defaults: recoverable trash for 30 days; normal database backups expiring within 35 days; temporary export links available for 24 hours; content-free operational logs retained for 30 days. These are policy proposals requiring cost, contractual and jurisdiction review, not legal compliance claims. User deletion makes content inaccessible promptly and schedules removal from active storage, indexes and archive compaction. Restore procedures reapply deletion ledgers before serving data.

Do not claim end-to-end encryption while server-side mail parsing, full-text indexing or AI processing requires plaintext access. Define deployment region, subprocessors, incident response, access logging, deletion policy and provider data-use obligations before production launch.

## 15 Nonfunctional requirements

All numeric values below are proposed qualification targets and must be measured in a documented test environment. They do not represent existing performance.


| ID     | Area                 | Proposed target and measurement                                                                                                                                                                          |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Availability         | 99.9% monthly availability for core app-owned read/write functions; define exclusions and provider-dependent indicators separately                                                                       |
| NFR-02 | Interaction          | p95 ordinary app-owned read/write response under 500 ms server-side at the agreed pilot load, excluding upload/provider round trips                                                                      |
| NFR-03 | Search               | p95 first-page live search under 1 second for 100,000 authorized text records in a representative benchmark; archive searches use a separately measured envelope                                         |
| NFR-04 | Visible freshness    | p95 app-owned projection freshness within 5 seconds when queues are healthy; display lag when exceeded                                                                                                   |
| NFR-05 | Provider freshness   | Target changed items visible within 60 seconds after the app receives a usable provider hint under healthy conditions; reconcile active connections at least every 15 minutes subject to provider limits |
| NFR-06 | Durability           | No loss of acknowledged transactional writes under expected process failures; recovery-point target at most 15 minutes for disaster recovery                                                             |
| NFR-07 | Recovery             | Proposed recovery-time target 4 hours for a full production restoration; prove through a restore rehearsal                                                                                               |
| NFR-08 | Scale qualification  | Pilot fixture includes 100 members, 100,000 work/knowledge records and 1 million normalized mail messages in a workspace; test realistic mixed access and paging, not one unbounded query                |
| NFR-09 | Accessibility        | Core workflows target WCAG 2.2 AA with automated and manual keyboard/screen-reader qualification                                                                                                         |
| NFR-10 | Resource limits      | Set documented upload, page, batch, archive-query and automation limits before pilot; reject over-limit operations without partial silent loss                                                           |
| NFR-11 | Compatibility        | Current stable Chrome, Safari, Firefox and Edge plus representative mobile Safari/Chrome at qualification time; document tested versions                                                                 |
| NFR-12 | Observability        | Structured content-free metrics for sync delay/errors, queue age, send uncertainty, projection lag, authorization failures and archive resource use                                                      |
| NFR-13 | Internationalization | Unicode text, locale-aware dates/numbers, IANA timezones, configurable week start and translation-ready UI; no inferred locale from user identity                                                        |
| NFR-14 | Cost control         | Account/tenant quotas and usage reporting for sync, storage, archive jobs and AI; prevent one account from exhausting shared capacity                                                                    |


Archive latency is deliberately not assigned a fictitious guarantee. Establish tier-specific limits after ARCHIVE-06. Load testing must measure permission-filtered results, large threads, recurring series, dense calendars and concurrent editing, not only empty accounts.

## 16 Failure and edge case behavior


| Scenario                             | Required user-visible result                             | Required integrity behavior                                              |
| ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Provider access revoked              | Reconnect required; local work remains accessible        | Stop provider mutations; protect cached data according to policy         |
| Mail send times out                  | Delivery Unknown with reconciliation status              | Do not blindly replay a send that may have succeeded                     |
| Cursor invalidated                   | Resynchronizing with coverage/freshness visible          | Rebuild provider projection without losing app-owned records             |
| Notification lost or duplicated      | No false completion state                                | Reconciliation recovers changes; deduplication suppresses repeat effects |
| Two users edit one property          | Updated value or conflict with recovery                  | Version check prevents silent stale overwrite                            |
| All-day event viewed abroad          | Same intended calendar dates                             | Preserve date-only semantics and exclusive end date                      |
| Recurring event hits DST/month end   | Explained instance behavior                              | Preserve local recurrence intent and tested exceptions                   |
| Mail moved between folders           | One correctly located message                            | Account-scoped stable mappings and deletion/move reconciliation          |
| Attachment scan fails                | Quarantined or unavailable                               | Do not render active content before safe processing                      |
| Unauthorized backlink or result      | No private title/snippet/count leakage                   | Check canonical access for projections and caches                        |
| Archive sidecar mismatches stream    | Search failure or validated fallback shown               | Reject stale pairing; never return an authoritative false empty result   |
| Archive query exceeds deadline       | Partial/timeout explicitly shown                         | Cancel bounded work and preserve continuation only if valid              |
| Schema property deleted              | View repair state and impact preview                     | No silent loss of values or unchecked formula execution                  |
| Workspace kit update conflicts       | Preview and choices                                      | Preserve local customizations and unrelated records                      |
| Offline queued edit loses access     | Access changed with recoverable permitted draft handling | Revalidate before replay; do not restore revoked server content          |
| Task deleted with future blocks      | Preview of affected linked blocks                        | Do not cancel external meetings implicitly                               |
| Daily plan has insufficient capacity | Unscheduled work and reasons                             | Preserve locked commitments and hard constraints                         |




## 17 Delivery roadmap and dependencies

No deadline, budget, staffing plan or fixed price was supplied. The sequence below is dependency-driven; estimates must follow discovery spikes and team capacity planning.


| Phase                               | Deliverables                                                                                                                                                      | Exit criteria                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| L0 Product and technical validation | Interaction prototypes, glossary, permission model, provider consent plan, editor comparison, MinLZ capability spike, sync/send-risk experiments                  | Critical unknowns resolved; numerical targets and policy defaults reviewed; estimate range supported by evidence |
| L1a Foundation                      | Identity/spaces, access, canonical records, task/page core, activity/outbox, secure files, operational health                                                     | Cross-tenant tests, transactional recovery and canonical-view tests pass                                         |
| L1b Connected work                  | Projects, all launch views, calendar recurrence/timezones, Google/Microsoft calendar/mail adapters, compose/send and sync recovery                                | End-to-end work/mail/calendar flows and provider contract qualification pass                                     |
| L1c Launch integration              | Capture, manual Promise Tracker, reusable knowledge views, unified search, controlled MinLZ archive integration, imports/exports, customization and accessibility | All L1 acceptance gates pass; no unsupported public provider claims                                              |
| L2 Connected intelligence           | Remaining distinctive features, optional AI, advanced formulas, shared mailboxes, meeting workflows, workspace kits                                               | Quality/privacy evaluations pass; each feature provides measurable user value                                    |
| L3 Extensibility and governance     | Integration ecosystem, IMAP/SMTP, enterprise controls, native-app/self-hosting evaluations                                                                        | Separate business case, threat model and product specifications approved                                         |


Begin OAuth verification and security-assessment preparation during L0. Do not make public email availability depend on an application review started immediately before launch. Start with small pilot cohorts, per-account connection limits, reversible feature flags and monitored rollout gates.

Each delivery slice must include a user journey, data/access changes, failure handling, behavior tests, operational signals and documentation. Prefer vertical slices such as “convert one real provider email into a private task and schedule it” over completing unrelated screen shells.

## 18 Risks and mitigations


| Risk                                    | Impact                                        | Mitigation and decision owner                                                                  |
| --------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Product breadth                         | Long delivery and inconsistent quality        | Product owner enforces L1/L2/L3 gates and coherent core journeys                               |
| Provider verification                   | Public Gmail launch delay                     | Integration/security owners begin scope review and verification in L0                          |
| Ambiguous external effects              | Duplicate sends or unwanted invitations       | Mail/scheduling owners implement durable intents, reconciliation and reviewed actions          |
| Permission leakage through derived data | Exposure in search, graph, AI or exports      | Access owner defines shared authorization contract and adversarial tests                       |
| Rich editor complexity                  | Lost edits or unusable collaboration          | Knowledge owner qualifies established editor/merge behavior with realistic concurrency         |
| Calendar semantics                      | Shifted meetings and broken recurrence        | Scheduling owner validates RFC/provider fixtures and round trips                               |
| Archive performance assumptions         | Added complexity without benefit              | Archive owner benchmarks actual corpora and preserves safe fallback                            |
| Archive retention mismatch              | Deleted data reappears after search/restore   | Security/operations owners enforce tombstones, compaction and restore ledgers                  |
| AI errors and source instructions       | Wrong commitments or unauthorized actions     | AI owner enforces opt-in, provenance, constrained execution and review                         |
| Customization sprawl                    | Broken views and hard-to-support workflows    | Design/work owners use typed schemas, migration previews and resettable presets                |
| Operating cost                          | Unbounded mail ingestion, storage or AI spend | Operations owner applies quotas, backpressure, coverage controls and usage reporting           |
| Premature enterprise scope              | Delayed core product                          | Product owner defers SSO/SCIM, self-hosting and advanced governance to separate specifications |




## 19 Out of scope and explicit boundaries

L1 excludes generic IMAP/SMTP, native iOS/Android/desktop clients, self-hosting, public website publishing, full CRM/accounting/HR suites, arbitrary executable plugins, enterprise SSO/SCIM, arbitrary field-level collaborative permissions, unrestricted automatic outbound email, and full parity with every feature in Notion or Outlook.

The product is not an email hosting provider. Sending occurs through connected authorized accounts; owning an inbox interface does not imply control over delivery, spam classification or recipient acceptance. Calendar conflict assistance does not guarantee meeting attendance or globally optimal schedules.

The current deliverable is this PRD and implementation specifications. No full application, prototype, production deployment, provider integration, MinLZ package installation or algorithm benchmark is included in this phase, as confirmed in the interview.

## 20 Decision register and remaining review items



### Confirmed product decisions

- Target individuals and small teams with private personal and shared team spaces.
- Deliver a detailed PRD, architecture, acceptance criteria, roadmap and MinLZ/mz-search implementation requirements in this phase.
- Launch hosted web with Gmail and Microsoft 365; defer generic IMAP/SMTP, native apps and self-hosting.
- Launch the four core domains with reliable sync, permissions and search together.
- Introduce the seven distinctive features progressively, beginning with Capture-to-Action and manual Promise Tracker.
- Preserve private email by default; optional AI cites sources and requires review for sending, invitations and proposed schedules.
- Use the nine named modules and behavioral validation across all, with focused permission, recurrence/timezone, sync-recovery, duplicate-send and archive-search testing.



### Proposed items requiring implementation-stage decisions


| Item                            | Current proposal                                                                                                              | When it must be resolved                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Branding and visual system      | Working title Connected Work Workspace; accessible system with configurable appearance                                        | Before production UI specification           |
| Technology versions             | TypeScript frontend; TypeScript or Rust primary backend; proposed stack and use cases in section 3; isolated Go MinLZ adapter | L0 before implementation commitments         |
| Live search engine              | Start with evaluated PostgreSQL full-text; dedicated engine only with evidence                                                | L0 relevance/load experiment                 |
| Retention and deployment region | Proposed defaults in section 22; no region inferred                                                                           | Before production data ingestion             |
| Business model and limits       | Paid tiers/quotas to be validated; no fictional price                                                                         | Before paid launch or contractual SLA        |
| AI processing provider          | Optional and configurable; no provider commitment                                                                             | Before enabling external AI processing       |
| Staffing budget and schedule    | Unspecified                                                                                                                   | After L0 spikes and prioritized estimates    |
| Archive corpus and thresholds   | Historical activity/revisions/approved mail snapshots; benchmark-driven                                                       | Before ARCHIVE-06 enablement                 |
| Detailed provider permissions   | Least privilege for confirmed capabilities; delegated accounts first                                                          | Before OAuth submission and consent design   |
| Numerical quality targets       | Proposed targets in sections 5 and 23                                                                                         | Before pilot qualification plan is baselined |


These do not prevent requirements delivery, but production decisions must not be silently inferred from them. Maintain a change register recording decision, owner, rationale, affected requirement IDs and acceptance changes. Changes that weaken private-by-default or reviewed-action policy require explicit product approval.

## 21 Primary sources and research notes

Sources were reviewed on 29 October 2026. Verified external behavior is distinguished from this document's proposed product design. Revalidate current documentation and the pinned dependency versions during implementation.

[S1] [Notion guide to databases data sources pages and properties](https://developers.notion.com/guides/data-apis/working-with-databases). Supports the distinction between canonical record data, schema, page content and linked views; this PRD does not require cloning Notion's internal architecture.

[S2] [Notion connection capabilities](https://developers.notion.com/reference/capabilities). Supports the distinction between connection capability and actual access to content.

[S3] [Gmail OAuth scopes and verification](https://developers.google.com/workspace/gmail/api/auth/scopes). Broad inbox reading/modification scopes are restricted; server storage/transmission can require security assessment. Scope and data-use obligations are launch dependencies.

[S4] [Gmail synchronization guide](https://developers.google.com/workspace/gmail/api/guides/sync). Supports full/partial sync and out-of-range history recovery.

[S5] [Gmail push notification guide](https://developers.google.com/workspace/gmail/api/guides/push). Supports Pub/Sub hints, watch expiration and renewal behavior.

[S6] [Google Calendar incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync). Supports pagination, tokens, deleted events and invalid-token recovery.

[S7] [Google Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push). Supports channel lifecycle and notification headers without resource-change bodies.

[S8] [Microsoft Graph message delta queries](https://learn.microsoft.com/en-us/graph/delta-query-messages). Supports per-folder tracking and opaque continuation/delta links.

[S9] [Microsoft Graph calendar-view delta queries](https://learn.microsoft.com/en-us/graph/delta-query-events). Supports calendar/time-window-scoped tracking and recurrence-instance handling.

[S10] [Microsoft Graph change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-overview). Supports resource-specific subscription lifetimes and renewal.

[S11] [Microsoft Graph throttling guidance](https://learn.microsoft.com/en-us/graph/throttling). Supports Retry-After and bounded retry behavior.

[S12] [RFC 5545 Internet Calendaring and Scheduling Core Object Specification](https://www.rfc-editor.org/rfc/rfc5545). Supports date/time, timezone, recurrence, exception and exclusive-end semantics.

[S13] [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/). Supports keyboard, focus, dragging alternatives, contrast and reflow qualification.

[S14] [MinLZ v1.2.0 release](https://github.com/minio/minlz/releases/tag/v1.2.0). Confirms released compressed-search features and notes literal-byte search limitations.

[S15] [MinLZ source and README](https://github.com/minio/minlz/blob/main/README.md). Describes the LZ77 compressor, Go implementation and block/stream integrity considerations.

[S16] [MinLZ Apache 2.0 license](https://github.com/minio/minlz/blob/main/LICENSE). License obligations must be checked against the chosen pinned release.

[S17] [MinLZ stream search usage and tuning](https://github.com/minio/minlz/blob/main/SEARCH.md). Supports search tables, sidecars, fallback and configuration; check examples against the chosen release.

[S18] [MinLZ search format and boundary specification](https://github.com/minio/minlz/blob/main/SPEC_SEARCH.md). Supports conservative skipping, cross-block matching and sidecar format requirements.

[S19] [MinLZ stream and block format specification](https://github.com/minio/minlz/blob/main/SPEC.md). Reference for stream validation and implementation review.

## 22 Future development and feature opportunities

The following ideas are candidates for future discovery and development after the existing core workflows are dependable. They extend the connected workspace without changing the launch scope, existing release commitments, technology decisions or acceptance requirements. Their value is a hypothesis to test with users, not a claim of proven demand or exclusive market novelty.

For each idea, recommendation strength answers “How strongly should we consider building this?” High means prioritize discovery once its prerequisites are available; Medium means prototype only after the specific problem is observed; Conditional means defer until stronger evidence and operational readiness exist. These labels are product judgments, not measured probabilities of commercial success. Relative effort is provisional and must be estimated by engineering after discovery.

### 22.1 Workspace scenario planning

**Feature idea:** A private planning sandbox that compares alternative project plans before any live tasks, commitments or calendars change. Users can adjust a proposed deadline, owner, estimate or dependency and inspect the resulting differences against the current plan. Each scenario records its assumptions and becomes stale when its source records change.

**Why consider it:** Plan My Day helps place work into a schedule. Scenario planning addresses an earlier decision: which combination of scope, dates and capacity should the team choose? It makes trade-offs reviewable before people receive changes.

**Use case:** A project owner compares keeping a launch date with reduced scope against moving the launch by one week. The workspace shows affected milestones, unscheduled effort and commitments without changing the published project.

**Small first version:** Compare a baseline with one manually edited scenario for a single project. Display a field-level change list and impacted records. Applying selected changes requires version checks, permission checks and a reviewed preview of any external effects.

**Recommendation:** High for teams coordinating dependent work; relative effort High. Begin after project dependencies, estimates and scheduling are trustworthy. Proceed if pilot users can explain and choose a feasible alternative more accurately than with their existing planning method. Defer if missing estimates make the comparison misleading. Never describe a scenario as a guaranteed forecast.

### 22.2 Project scope and change agreements

**Feature idea:** A project agreement that records the intended outcome, deliverables, explicit exclusions, acceptance conditions and decision owner. New requests can be linked as proposed scope changes with an impact statement and an approval state. This complements Decision Memory by tracking whether agreed work has actually changed.

**Why consider it:** Task completion can look healthy while extra requests expand the project beyond its original agreement. Connecting the agreement to requests and delivery makes that change visible without preventing normal collaboration.

**Use case:** A consulting client requests additional reporting by email. The owner links the reviewed excerpt to a proposed change, identifies affected milestones, and records whether it is accepted, deferred or declined.

**Small first version:** A structured agreement page, linked deliverables, a manual change-request record and an approval history. Automated scope-drift suggestions can follow only if manual usage demonstrates value.

**Recommendation:** Medium, rising to High for service teams that report repeated scope disputes; relative effort Medium. Proceed when pilot teams consistently link requests and use the recorded decision during delivery. Defer automatic detection until its false-positive rate is acceptable. A recorded product approval must not be represented as a legal signature or a contractual agreement.

### 22.3 Secure handover packs

**Feature idea:** A reviewable handover package containing selected open tasks, upcoming commitments, relevant decisions, approved documents and the next action for each item. It has a named recipient, an access preview, an expiry and a clear acceptance state. It references current records instead of silently creating stale copies.

**Why consider it:** Existing meeting briefs prepare people for a conversation. A handover has a different job: transfer operational responsibility while making missing context and unavailable access explicit.

**Use case:** A project owner prepares a colleague to cover a week away. The colleague sees what needs attention and confirms the handover. Private mailbox content is included only through deliberately selected, shared excerpts.

**Small first version:** Manual record selection, ownership suggestions, a recipient-view preview and a checklist of accepted responsibilities. Role or record-access changes remain separately reviewed actions.

**Recommendation:** High for collaborative workspaces; relative effort Medium. Begin after sharing controls and source references are reliable. Proceed if a recipient can identify the next action and required context without asking the original owner to reconstruct the project. Stop rollout if packages expose private source material, grant access implicitly or leave expired access active.

### 22.4 Knowledge freshness checks

**Feature idea:** A freshness status for important pages and reusable instructions, with a responsible owner, review date and links to supporting decisions or records. Changes to a tracked source mark the page “Review suggested” and explain which relationship changed. The system distinguishes verified review from an automated suggestion.

**Why consider it:** Backlinks reveal related information, but they do not establish whether a page is still current. Explicit review ownership can help teams avoid relying on documentation that was once correct but is no longer maintained.

**Use case:** A launch decision changes a supported feature. Linked onboarding instructions are flagged for their owner to review before the next customer handover.

**Small first version:** Manual review dates, a verified-by record and rule-based alerts when explicitly linked records change. Begin with a user-selected set of important pages rather than scanning every document.

**Recommendation:** High where teams actively reuse operational knowledge; relative effort Medium. Proceed if owners resolve useful review requests and users report fewer outdated instructions. Tune or pause alerts when most flagged changes are irrelevant. The system must never label content true, compliant or safe merely because its review date is recent.

### 22.5 Sharing preview and exposure map

**Feature idea:** A “View as recipient” preview before sharing a page, project, collection view or handover. Show the intended audience, which linked content will be visible, which references remain unavailable, and what snapshots or files would be copied. Provide a narrowly authorized explanation of existing access paths.

**Why consider it:** The existing permission system prevents unauthorized access. This feature helps users understand the effect of a proposed share before they make it, particularly when private email, collection records and attachments are linked together.

**Use case:** A founder shares a project page with an external collaborator. The preview identifies that an internal budget page remains inaccessible and that a selected email excerpt would become visible if copied into the shared page.

**Small first version:** Preview one recipient and one share operation at a time. Recheck permissions when applying the share and display any changes since the preview.

**Recommendation:** High as a future trust and usability improvement; relative effort Medium. Basic permission enforcement remains mandatory independently of this idea. Proceed if users correctly predict the recipient's access and recover from common sharing mistakes. Do not allow previews or administrative exposure maps to reveal private records the inspecting user cannot otherwise discover.

### 22.6 Attention budgets and interruption controls

**Feature idea:** A personal attention budget that groups nonurgent updates into chosen review windows, preserves selected urgent channels and explains why an interruption is being shown. Users can coordinate focus periods with their calendar while keeping the underlying work and notifications accessible.

**Why consider it:** Quiet hours and notification preferences control channels. An attention budget adds a reviewable policy for how many nonurgent interruptions a person wants during a working period and when deferred information should return.

**Use case:** A contributor reserves two morning focus blocks. Routine project updates are grouped for a midday review, while an explicitly configured critical incident is still surfaced.

**Small first version:** User-defined review windows, batching rules, urgent exceptions and a visible deferred-update list. Use explicit settings before considering inferred preferences.

**Recommendation:** Medium; relative effort Medium. Proceed when pilot users report interruption overload despite existing preferences and can retrieve deferred information without missing critical work. Compare interruption volume and user-reported usefulness, not employee activity. Keep urgent classifications explainable and reversible; never let a manager silently impose another person's personal attention policy.

### 22.7 Evidence of completion

**Feature idea:** An optional evidence checklist for selected task types, milestones or promises. A completion can reference a specific artifact, approved revision, sent-message confirmation or review outcome. Preserve the evidence version and make reopened or revoked evidence visible.

**Why consider it:** A Done status records a state change. Evidence helps a team understand what was delivered and which agreed acceptance condition was satisfied, without requiring every simple task to undergo a formal approval process.

**Use case:** A release-readiness milestone requires a reviewed test report and an approved launch checklist. Its owner can inspect the exact revisions used when the milestone was accepted.

**Small first version:** Configurable required evidence fields for one milestone template and an authorized reviewer action. Keep links and snapshots subject to the existing sharing and retention rules.

**Recommendation:** Medium, rising to High for teams with recurring review or handover requirements; relative effort Medium. Proceed if evidence reduces reopening and clarification without making routine completion cumbersome. Do not add mandatory proof to all tasks or imply that the system independently verifies the quality of a linked artifact.

### 22.8 Automation recipe suggestions

**Feature idea:** Suggest a reusable automation recipe when a user repeatedly performs the same permitted sequence, such as labeling a message, creating a task and linking a project. Show the observed pattern, proposed trigger, conditions and actions. Suggestions remain drafts until reviewed and enabled.

**Why consider it:** Workspace Kits provide reusable setups, and the rule engine executes configured rules. This feature helps a user discover an appropriate rule from their own repeated work rather than requiring them to design it from a blank form.

**Use case:** An operations owner repeatedly converts selected supplier confirmations into delivery-check tasks. The workspace suggests a narrowly scoped recipe with a preview of matching messages and duplicate-prevention behavior.

**Small first version:** Explicitly opt-in observation of a limited set of in-app actions, simple frequency-based pattern detection and a dry-run editor. AI is optional; background monitoring of unrelated applications is excluded.

**Recommendation:** Medium after the existing rule engine is stable; relative effort High. Proceed when users accept useful suggestions and dry runs show low false-trigger rates. Keep observation visible and revocable. Retain existing loop limits, execution-time permission checks and reviewed external-action policies; repeated user behavior is not blanket consent for automatic sending or scheduling.

### 22.9 Estimate calibration and project learning

**Feature idea:** An opt-in project retrospective that compares original estimates, completed outcomes and manually confirmed time or effort. Show ranges, unknowns and reasons for variance, then propose more realistic estimate defaults for similar future work. Preserve the original estimate when creating a revised forecast.

**Why consider it:** Workload Weather can only be as useful as its input estimates. Calibration helps improve future planning assumptions without pretending that every task duration is predictable or that calendar occupancy measures productive effort.

**Use case:** A small team discovers that review tasks regularly need more time than expected. It adjusts the next project's review estimates and buffers using an agreed retrospective rather than automatically scoring individual contributors.

**Small first version:** One project-level review using explicit estimate history and optional user-confirmed actuals. Provide a preview before applying any suggested template changes.

**Recommendation:** Medium; relative effort Medium. Proceed only when data is sufficiently complete and participants find the recommendations useful. Keep insufficient samples visible instead of producing precise-looking forecasts. Exclude background activity surveillance, individual rankings and inferred health or performance assessments.

### 22.10 Return to work planning

**Feature idea:** A user-initiated return-to-work workspace for reviewing changes after a selected period away. Separate resolved items from work still requiring action, identify changed commitments and propose a paced catch-up plan. Every recommendation links to its authorized source and remains editable.

**Why consider it:** A weekly review summarizes ongoing work. Returning after an absence requires a different experience: understand what changed, avoid processing already resolved requests and decide what can realistically fit into the first days back.

**Use case:** A contributor returns after a week away and sees which tasks were reassigned, which decisions changed and which promises still need attention. They review a suggested catch-up sequence without the system sending replies or moving meetings automatically.

**Small first version:** A manually selected date range, deterministic change summary, unresolved-item filters and a catch-up checklist. Assisted summaries can be evaluated later under the existing AI policy.

**Recommendation:** Medium for users with recurring handovers or interruptions; relative effort Medium to High. Proceed if the workflow reduces time to identify the first useful action compared with the existing activity and review views. Do not infer why someone was absent, expose private updates or quietly convert the catch-up plan into external commitments.

### Future development selection and validation

The first discovery shortlist is Sharing preview and exposure map, Secure handover packs, and Knowledge freshness checks. They connect existing records and permissions to practical problems without requiring a new primary product domain. Workspace scenario planning is a strong subsequent candidate once estimates and scheduling inputs are dependable. This order is a recommendation to validate, not a new delivery commitment.

Before promoting an idea into the roadmap, identify its target user, confirm a repeated problem with interviews or workflow observation, prototype the smallest useful interaction and define an observable success measure. Measure against the existing workflow rather than claiming improvement from usage alone. Check permissions, provider capabilities, data quality, accessibility, operating cost and support burden before approving implementation.

Promote an idea only when the evidence supports its value and the team can maintain it. Narrow or defer ideas that duplicate existing views, depend on unavailable information, generate excessive false alerts or require intrusive data collection. Record the decision and reasoning through the existing change process. Any future feature that would alter private-by-default sharing or reviewed external actions needs a separate explicit product decision.
