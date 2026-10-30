# L1C connected launch integration implementation

The local L1C implementation completes the Phase 1 connected workspace journey by adding capture-to-action triage, promise tracking, scoped automation rules, unified live search across all entities, historical archive integration, workspace portability, tenant quotas, user preferences, operational launch telemetry, and WCAG 2.2 AA accessibility controls. [Readiness](readiness.md) records verified qualification and distinguishes local engineering from external release acceptance gates.

## Capture-to-Action triage, promises, and automation

Unstructured ideas, meeting notes, and incoming requests enter the capture triage queue without prematurely creating canonical tasks. A capture item maintains captured, converted, or discarded status alongside an idempotency key and source metadata.

Conversion to a task uses an explicit review: the user selects the destination project, priority, milestone, and title. The conversion transaction creates the canonical task and persists a link in `capture_relationships` linking the source capture to the task as either source, context, or attachment. Discarded items preserve audit history without cluttering active task views.

The Promise Tracker monitors counterparty commitments (inbound promises made to the user, or outbound promises made by the user to others). Each promise records counterparty name, direction, due date, status (pending, fulfilled, broken, canceled), and an optional canonical task reference. Reopening or fulfilling promises generates an authorized audit event.

Automation rules apply scoped actions based on deterministic events (`task_created`, `capture_created`, `promise_due`). Trigger conditions evaluate property matches (such as tags, priority, or counterparty) and execute bounded actions (tagging, notification creation, or assignment). Every rule run records timestamp, status, and outcome in `automation_runs`. Arbitrary scripts, open-ended webhooks, and unbounded execution chains are rejected.

## Unified live search and historical archives

Unified search projects tasks, pages, projects, mail messages, and promises into a single indexed query space (`unified_search_projections`). Each projection row stores entity type, canonical ID, title, content snippet, and a weighted PostgreSQL `tsvector` generated with the English text search dictionary. Projections update automatically on canonical writes via database triggers.

The search API evaluates prefix and lexical matches, applies row-level security so users only discover records they have read permission for, and returns typed matches sorted by `ts_rank` with snippets. The frontend `SearchModal` (triggered via `⌘K` or search icon) debounces input, supports entity filtering, and enables full keyboard navigation.

Historical archive projections query cold storage manifests (`archive_manifests`) compressed with MinLZ. Search operations distinguish operational live records from cold historical data, preventing high-volume historical archives from degrading interactive PostgreSQL query latency.

## Workspace portability, quotas, and user preferences

Portability provides tenant-scoped data export and import. The export endpoint generates a canonical JSON manifest containing workspace metadata, tasks, pages, projects, capture items, promises, rules, and schemas. Sensitive tokens and encrypted vault payloads are strictly excluded.

Tenant quotas enforce fair resource allocation per workspace (`workspace_quotas`). Tracked dimensions include maximum tasks, storage bytes, provider connections, and monthly exports. Operations check quotas before allocating storage or connections; exceeding a quota returns a 429 response with explanatory metadata rather than a silent failure.

User workspace preferences persist theme (light, dark, system), density (comfortable, compact), timezone (IANA identifier), and week start day (0 for Sunday, 1 for Monday). Settings update optimistically in the frontend and persist to `user_workspace_preferences`.

Account disconnection protections ensure provider disconnection safely clears private credentials, revokes active synchronizations, and marks pending provider-bound intents, while leaving app-owned tasks, pages, and projects intact.

## Launch telemetry, SLO monitoring, and accessibility

Operational health endpoints expose real-time workspace metrics:
- `/api/v1/workspaces/:workspaceId/slos`: Reports availability SLO (target 99.95%), p95 latency (< 20ms), error rates (< 0.01%), background worker queue latency, database connection pool saturation, and row-level security isolation status.
- `/api/v1/workspaces/:workspaceId/launch-readiness`: Evaluates gate readiness across G0, G1, G2, and G3 gates.

The Activity view embeds live SLO cards, giving operators immediate visibility into platform health, queue processing delays, and system compliance.

Accessibility compliance targets WCAG 2.2 AA standards:
- All interactive elements provide visible focus outlines, keyboard traps in modals, and explicit `aria-label` or `aria-labelledby` attributes.
- High-contrast visual cues accompany all color-coded state indicators (e.g. status tags, quota meters, error alerts).
- Screen-reader live regions announce asynchronous save confirmations, search result counts, and background synchronization events.

## Qualification

Local verification is conducted via automated test suites covering capture conversion, promise tracking, rule automation, search projections, archive manifests, portability exports, and quota enforcement. The [readiness record](readiness.md) details exact test commands and gate criteria.
