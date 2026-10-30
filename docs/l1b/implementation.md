# L1B connected-work implementation

This increment extends the locally qualified L1A foundation. It delivers usable connected-work core workflows; it does **not** close every original L1B task or the G2 release gate. The [readiness register](readiness.md) distinguishes implemented behavior, unimplemented requirements, and external qualification.

## Projects and recurring work

Projects have private/workspace visibility, ownership, status, deadline, optimistic versions and durable operation receipts. Linking an existing task preserves its canonical ID and source authorization. Progress counts only currently accessible canonical tasks and labels that coverage; missing estimates remain unknown. List, board, table and deadline timeline views open the original task details.

Dependencies require current edit access to both endpoints. Workspace advisory locks and a database cycle trigger serialize graph changes, including concurrent requests. Recurrences support one civil DTSTART and one daily/weekly/monthly/yearly rule with COUNT 1–1000 and optional INTERVAL 1–366. Advanced selectors and additional rules are explicitly rejected. The qualified recurrence adapter is shared with discovery. Each materialized occurrence becomes a private canonical task; a unique recurrence/instant key prevents duplicates across different operation keys. Skipped occurrences remain recorded. This does not implement full RFC recurrence editing or provider event-series editing.

## Reviewed local scheduling

Personal work blocks are separate from task deadlines and provider events. Multiple blocks may reference a task. The interface supplies day, week, month and agenda views, explicit IANA timezone selection, configurable week start and keyboard-accessible scheduling forms. A ten-minute review shows personal overlaps, visible incomplete prerequisites and the local-only coverage boundary.

Apply checks current task access/version, calendar revision, block version, expiry and lock state. Changing the calendar invalidates earlier reviews. Locked blocks require a separate unlock action. Completed tasks cannot receive new work blocks, and completing a task does not cancel existing local blocks or external meetings. Calendar changes preserve task deadlines.

## Private delegated providers

Google and Microsoft registrations are disabled unless an operator supplies credentials and a separate token-encryption key. OAuth authorization code, S256 PKCE, one-use state bound to the user/session/workspace, nonce, issuer/audience, ID-token signature and UserInfo subject checks protect connection identity. The workspace identifier in state is routing information; the entire unpredictable state is hashed, session-bound, expiring and single-use. One fixed callback per provider supports multiple workspaces.

Tokens are sealed with AES-256-GCM and connection-specific authenticated data. Provider rows and projections are private to their connecting user, including against workspace administrators. HTTP clients use exact API host/path boundaries, request timeouts, response-size limits, immutable Microsoft identifiers, plain-text bodies and explicit coverage. Active HTML, remote images and unreviewed attachments are not rendered.

Google mail supports paged baseline/history reconciliation; Google primary-calendar projections preserve series/exception IDs and exclusive all-day ranges. Microsoft mail currently covers **Inbox only** with per-folder delta semantics; its calendar projection covers the initial -30/+90-day calendar-view window. These are deliberate disclosed coverage limits, not full-mailbox or full-calendar claims. Each page and its checkpoint commit together. Invalid cursors start a new projection generation without deleting app-owned tasks; throttling stores the retry window, and invalid credentials require renewed consent. The separate worker processes queued pages and continuations. Synchronization is manually requested; scheduled periodic reconciliation and webhook hints remain open.

## Reviewed mail effects

Plain-text drafts list exact recipients and content before a ten-minute review can create a durable intent. One intent per draft version prevents double submission across review/operation keys. Execution rechecks live membership, connection/review/draft versions and expiry. It persists `unknown` **before** any remote mutation. A lost response or process crash therefore cannot return the intent to a blindly retriable state.

A confirmed state means the provider accepted the request, not recipient delivery. Gmail reconciliation searches the stable RFC Message-ID in Sent mail. Microsoft reconciliation uses a known immutable draft ID when available; without sufficient evidence, uncertainty remains visible. Reconciliation never sends. An operator must investigate unresolved uncertainty in the provider before a user creates any replacement draft. Attachments, reply/reply-all/forward workflows and mailbox mutation/rule/snooze interfaces are not part of this implemented subset.

## Collections and collaborative knowledge

A page can own a collection schema while linked rows reference original tasks/pages. Thirty typed properties support text, finite numbers, booleans, valid date-only values, selects and bounded arithmetic formulas. Formulas resolve numeric references, reject cycles and never evaluate code. Schema review reports visible impact; removed/incompatible values remain stored and produce repair warnings. Applying rejects changed schema or visible row versions. Row writes check both source and collection edit permissions and independent schema/row versions. Personal filtering/sorting does not change shared schema.

Relations and backlinks require both endpoints to be readable. Comments are inert text; mention requests require the mentioned user to have current source access. A private page can be created from a readable page body without copying sharing. Body restoration creates a new revision while preserving current metadata and permissions.

Yjs page-body states persist in PostgreSQL alongside canonical body revisions and events. The authenticated HTTP transport polls while visible, merges updates, expires presence leases and rechecks access on each request. Browser-session drafts survive unacknowledged updates/reloads. Structured edits retain optimistic version checks. Plain text and heading prefixes are supported; arbitrary embedded objects, rich marks, uncontrolled roots and oversized updates/snapshots are rejected. [The implementation decision](../decisions/0004-l1b-local-connected-work.md) records the native editor/HTTP transport deviation from the richer L0 direction.

## Validation

Run `npm run check:l1b`. It exercises source checks, builds, unit tests, isolated real PostgreSQL integration and recovery, built-app browser journeys, generated-contract synchronization, dependency audits and baseline/documentation checks. Synthetic reports stay under ignored artifacts. No real messages are sent by the test suite. Evidence and remaining acceptance work are recorded in [readiness](readiness.md).
