# L1B connected-work implementation

The local L1B implementation extends the L1A canonical model. Tasks and pages retain one identity, source permission system, version history and durable write path. Provider projections, personal blocks and linked collection rows do not become competing task stores. The original PRD and roadmap remain unchanged. [Readiness](readiness.md) distinguishes verified local behavior from external acceptance gates.

## Coordinated work

Projects support private/workspace visibility, explicit member read/edit grants, metadata, milestones and authorized page/decision references. Linking a task never grants access to it. Assignment requires the assignee's current source access; subtasks and dependencies reject cycles under a workspace graph lock. Canonical project/milestone rollups exclude archived tasks, count only currently accessible records and report missing estimates. No asynchronous projection is used for these rollups.

List, board, table and deadline timeline views share canonical detail records, bounded loading, status filters, grouping, sorting and custom columns. Personal saved views require read access; shared views require source edit access. Timeline points represent deadlines, without inventing task duration or automatically rescheduling dependents.

Bulk complete/reopen/archive/unarchive/delete/restore actions use expiring version-bound reviews and durable operation receipts. Reviews show visible dependencies, deadline risks and the actor's future local blocks. Apply rechecks source/coordination versions, current access, locks and the reviewed fingerprint. Explicit cancellation can affect only the actor's reviewed local blocks; external meetings and dependent deadlines remain unchanged. Archive/recovery creates authorized activity, and restoration preserves existing sharing. Recurrence definition edits preserve the materialized/skipped occurrence ledger; bounded daily/weekly/monthly/yearly rules reject unsupported selectors.

## Scheduling and external calendars

Day/week/month/agenda views separate task deadlines, local work blocks and account-scoped provider occurrences. Preferences persist timezone, week start, working days/hours, density, selected overlays and buffers. An unlocked block can be dragged to a date or rescheduled through the equivalent form; both paths open a review. Multiple blocks may reference one task.

Scheduling reviews show personal overlaps, working-hours warnings, buffer conflicts, visible prerequisites and selected provider busy intervals. Apply checks task/block/calendar versions, current permissions, lock state, dependency versions, preferences and provider-projection fingerprints. Insufficient or stale coverage is explicit. Temporal rejects ambiguous/nonexistent civil times; date-only all-day events preserve exclusive end dates.

Provider event create/update/delete operations review the account, attendees, occurrence/series scope, recurrence and notification effects. Conditional writes use provider ETags. Durable jobs persist uncertainty before remote mutation; pending/confirmed/failed/unknown outcomes remain inspectable. Unknown reconciliation only reads provider evidence. Unsupported or inconclusive evidence stays unknown and is never a blind resend. Google primary-calendar windows request expanded occurrences/exceptions. Microsoft calendar-view delta windows renew on a daily boundary; both cover a rolling -30/+90-day window rather than all historical events.

## Private correspondence

Delegated OAuth uses authorization code, S256 PKCE, one-use session-bound state, nonce, issuer/audience, signed ID tokens and UserInfo subject validation. Connection tokens use a separate AES-256-GCM vault key and resource-bound authenticated data. Connections and projections remain private to the connecting user, including against workspace administrators. HTTP requests have exact provider boundaries, timeouts, response limits and immutable Microsoft IDs. Active mail HTML and remote images are not rendered.

Versioned drafts support compose/reply/reply-all/forward, exact recipient review and explicitly selected clean authorized files. Address parsing handles quoted names and groups. Gmail preserves thread/RFC reply headers; Microsoft uses provider reply/forward drafts, removes inherited attachments and clears inherited CC/BCC before adding reviewed content. Reviewed file metadata versions and bytes/digests are rechecked at execution. Google attachments are capped at ten MiB total, Microsoft at two MiB total through the small-file API; stored files remain capped at five MiB each.

One durable send intent per draft version prevents duplicate submissions. Execution rechecks live membership, account/draft/review/attachment versions and expiry, then commits unknown before the first remote mutation. Confirmed means provider acceptance, not recipient delivery. Gmail reconciliation searches a stable RFC Message-ID in Sent; Microsoft uses a known immutable draft ID when available. Missing evidence remains Delivery Unknown.

Mailbox actions review read/unread changes, additive Gmail labels or Microsoft folder moves. These preserve provider-specific semantics. Personal snoozes hide messages until expiry and can be cleared; simple enabled rules apply local tags on synchronized message pages without sending or silently modifying provider mailboxes.

## Synchronization and hints

A separate worker checks due accounts every 30 seconds and queues reconciliation at five-minute intervals, respecting provider retry windows and existing pending jobs. Discovery metadata contains routing identifiers, not tokens or mailbox bodies. Every queued job rechecks live membership and private connection access.

Gmail uses paged baseline/history. Microsoft enumerates root, nested and hidden folders with per-folder delta checkpoints, stable immutable message IDs and an explicit 1,000-folder bound. A removed item is checked at its immutable mailbox identity before deletion, preserving moves. Each bounded page and checkpoint use a database transaction/savepoint; invalid cursors rebuild projections while preserving app-owned records. Retry-After, reauthorization, current coverage and subscription expiration are exposed as connection health.

Optional notifications accelerate authoritative reads. Google Pub/Sub checks a trusted JWKS signature, issuer/audience/expiry/age, verified service-account email, configured subscription and mailbox address. Calendar channels check random channel tokens, channel/resource identity and expiration. Microsoft validates subscription identity and random clientState, supports validation/lifecycle requests and renews subscriptions. Notifications are bounded, deduplicated hints; their payload cannot directly create mailbox projections. Missed/reordered hints are covered by periodic reads. See [setup](setup.md) for the required public callback and provider configuration.

## Collaborative knowledge

Collections define typed text/number/boolean/date/select properties and bounded arithmetic formulas over canonical records. Formula cycles, unsupported types and unchecked evaluation are rejected. Schema reviews report visible row/view impact; removed/incompatible values remain available for repair. Saved collection views persist private/shared filters, grouping, sorting, mode and property columns under separate source permissions. Removed property references are repaired locally and require an explicit save.

Page-body duplication/restoration preserves current permissions and structured metadata. Private collection templates bind source versions and visible row values to a fingerprint and expiring review. Instantiation creates new private canonical records/schema/values, without copying grants, files or relations. Changed or unavailable sources invalidate the review. Schema-only templates avoid copying rows; row templates support at most ten currently visible records.

Comments have an authorized mention picker. Relations/backlinks require readable endpoints. Live source previews display current source metadata; unavailable/deleted targets show a generic placeholder without exposing hidden IDs/titles.

Tiptap/ProseMirror provides headings and bold/italic/strike/inline-code marks over the existing Yjs body. The native text alternative and rich editor share one CRDT, authenticated HTTP polling, presence leases, local undo and browser-session recovery. The server validates the body root, allowed marks, lines/runs and snapshot limits; arbitrary HTML, executable embeds and unsupported attributes are rejected. Structured properties remain independently versioned. A production WebSocket cluster is a deployment choice, not a dependency of this implemented local transport.

## Qualification

`npm run check:l1b` runs configured lint/types/unit tests, production builds, isolated PostgreSQL integration/recovery, built-application browser journeys, generated-contract checks, three dependency audits and baseline/ignore checks. Synthetic fixtures never send real mail. The [readiness record](readiness.md) reports actual outcomes and external gates; a local pass does not certify remote CI, public provider approval or production readiness.
