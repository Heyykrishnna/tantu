# L2 connected intelligence implementation

The local L2 implementation extends Tantu's connected workspace foundations with discoverable relationship context, explicit decision rationale, deterministic daily planning, workload weather forecasting, reusable workspace kits, rich formula evaluation, and source-grounded meeting briefs. [Readiness](readiness.md) distinguishes verified local engineering from separate production release gates.

## Context Graph and Decision Memory

The Context Graph establishes multi-entity relationships across projects, tasks, pages, events, promises, and decisions in `tantu.context_nodes` and `tantu.context_edges`. Edges maintain explicit provenance and typed semantic relationships (`informs`, `decides`, `blocks`, `references`, `derives`). Graph traversal queries enforce depth limits (1 to 5) and row-level security so users only discover records they have read permission for.

Decision Memory (`tantu.decisions`) records architectural and operational decisions with author identity, rationale, effective date, supporting evidence, and affected work items. When an earlier choice is superseded, `tantu.decision_revisions` retains the full historical audit trail while linking the new decision via `superseded_by_id`. Rationale updates create version bumps without overwriting historical records.

## Deterministic planning and Workload Weather

The Plan My Day engine generates explainable schedules without external heuristics or uncontrolled optimization algorithms. Candidate tasks are selected from open, unblocked tasks, ordered deterministically by priority (`urgent` > `high` > `normal` > `low`) and upcoming deadlines. Tasks with incomplete prerequisite dependencies are blocked from scheduling.

Tasks are packed into available slots within working hours up to a target daily duration (1 to 16 hours). Each placed block records an explicit placement reason explaining why that slot was assigned. Tasks that exceed available capacity or are blocked record an explanatory unplaced reason. A generated plan remains in draft/reviewed status until explicitly applied, at which point blocks commit to `tantu.work_blocks`.

Workload Weather calculates the ratio between estimated effort and nominal capacity over daily or weekly horizons. Ratios are classified into:
- Clear: Ratio <= 0.75 (workload is well within nominal capacity).
- Tight: 0.75 < Ratio <= 1.0 (workload nearly saturates capacity with low buffer for interruptions).
- Overloaded: Ratio > 1.0 (estimated effort exceeds capacity, requiring scope reduction or rescheduling).

Tasks lacking duration estimates are tracked as uncertain items and allocated a standard 30-minute fallback allowance.

## Workspace Kits and richer knowledge

Workspace Kits (`tantu.workspace_kits`) package collection schemas, page templates, default saved views, and automation rules into reusable versioned bundles.

Installation previews evaluate conflict mappings against existing collection schemas. When schema or property collisions occur, users can select between preserving local customizations or adopting the kit definition. Installation idempotently applies new schemas and records the applied version in `tantu.workspace_kit_installations`.

The formula evaluation engine parses and evaluates typed expressions safely without dynamic code evaluation:
- Mathematical operations: addition, subtraction, multiplication, division (with division-by-zero protection), and modulo.
- Function expressions: `ROUND`, `CONCAT`, `LOWER`, `UPPER`, `TRIM`, `IF`, and `DAYS_BETWEEN`.
- Type checking: validates arguments, detects errors, and returns typed results with fallback handling.

Synced blocks (`tantu.synced_blocks`) maintain canonical identities across tasks and pages, propagating content updates through versioned revisions.

## Optional AI controls and meeting briefs

AI capabilities remain strictly opt-in (`tantu.ai_workspace_settings`). By default, AI assistance is disabled (`isEnabled: false`), and all workspace workflows operate entirely through local deterministic services. Operators can configure provider endpoints, allowed scopes, and monthly token quotas.

Meeting briefs (`tantu.meeting_briefs`) prepare source-grounded agendas from event metadata, recent confirmed decisions, open tasks, and pending commitments. Key discussion topics, source citations, and action items are compiled deterministically. All source text is treated as untrusted data to protect against prompt injection and unauthorized privilege escalation.

## Qualification

Validation is confirmed through automated unit tests in `backend/test/` covering decision revisions, context graph traversal, planning candidate sorting, workload weather calibration, formula evaluation, and AI opt-in defaults. The [readiness record](readiness.md) outlines test results and release gates.
