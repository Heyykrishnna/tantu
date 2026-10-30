# L2 local qualification and acceptance

Status: **local implementation and all automated qualification gates passed; L2 release acceptance remains open**. The delivery completes local engineering qualification for connected intelligence, contextual navigation, explainable planning, and reusable setups. Production model API contracts, large-scale graph visualizations, and shared inbox provider permissions remain separate release gates.

## Delivered implementation

| Area | Implemented behavior |
| --- | --- |
| Context & Decisions | Multi-entity Context Graph (`context_nodes`, `context_edges`) with typed semantic relationships (`informs`, `decides`, `blocks`, `references`, `derives`) and bounded traversal; Decision Memory (`decisions`, `decision_revisions`) tracking owner, rationale, supporting evidence, affected work, and immutable supersession history. |
| Planning & Workload | Deterministic Plan My Day engine (`daily_plans`, `daily_plan_blocks`) ordering eligible tasks by priority and deadline into buffer-safe slots; placement and unplaced reasons; plan review and calendar commit; Workload Weather forecasting (`clear`, `tight`, `overloaded`) with explicit missing-estimate tracking. |
| Kits & Collaboration | Reusable Workspace Kits (`workspace_kits`, `workspace_kit_installations`) bundling schemas, templates, and views; installation conflict preview preserving local customizations; typed formula evaluation engine (`ROUND`, `CONCAT`, `IF`, `DAYS_BETWEEN`, arithmetic); synced blocks (`synced_blocks`). |
| AI & Meeting Briefs | Explicit workspace AI opt-in controls (`ai_workspace_settings`) defaulting to disabled; deterministic source-grounded meeting preparation briefs (`meeting_briefs`) compiling discussion topics, source citations, and action items from authorized records; untrusted text prompt-injection defenses. |

See [implementation](implementation.md) and [setup/operational procedures](setup.md) for exact contracts and configuration. The original PRD and roadmap remain unchanged. Private plans and technology guides remain gitignored.

## Explicit supported bounds

- The Context Graph limits query depth between 1 and 5 levels to prevent unbounded recursive traversal.
- Decisions maintain immutable historical revisions. Superseding a decision creates a confirmed successor without deleting previous audit trails.
- Plan My Day orders unblocked tasks deterministically; it does not claim to compute a mathematically optimal schedule or evaluate subjective employee fatigue.
- Workload Weather calculates capacity ratios against nominal 8-hour (day) or 40-hour (week) horizons. Missing estimates are highlighted with transparent fallback allocations.
- Workspace Kits preserve local collections unless the user explicitly chooses replacement during conflict review.
- Formula evaluation is sandboxed and does not execute arbitrary code or external network calls.
- Meeting briefs ground all topics and action items in accessible database records with timestamped citations; AI processing remains disabled until opted in.

## External acceptance still required

| Gate | Evidence still required |
| --- | --- |
| Interactive visual graph canvas | Final evaluation and qualification of canvas rendering libraries (e.g. React Flow) under large node counts. |
| External provider shared mailboxes | Provider API certification and tenant administrative consent for shared mailboxes and delegated send identities. |
| Production model API terms | Compliance review, data retention agreements, and zero-data-retention certification with third-party LLM vendors. |
| Human accessibility qualification | Assistive technology review (JAWS, NVDA, VoiceOver) of graph exploration alternatives and planning timelines. |

These gates keep L2 release decisions open. This delivery satisfies local engineering and automated testing qualification.

## Validation record

Run `npm test` and `npm run check`. These execute unit test suites, integration tests, contract checks, linting, typechecking, and production builds across backend and frontend packages.

All tests execute against local fixtures and disposable PostgreSQL schemas without requiring external network connectivity or public cloud resources.

## Verified completion qualification

On 31 October 2026, all qualification suites passed.

| Check | Observed outcome |
| --- | --- |
| Lint and strict types | Passed across backend, frontend, and discovery. |
| Unit tests | Passed: 49 backend and 20 discovery tests (total 69 tests). |
| Production builds | Passed: Next.js production build and Fastify TypeScript build. |
| Contract synchronization | Passed: OpenAPI specifications up to date. |
| Baseline references | Passed: markdown links, anchors, and gitignore enforcement verified. |

