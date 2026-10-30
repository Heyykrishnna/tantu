# L1B local qualification and acceptance

Status: **local implementation and all automated qualification gates passed; G2 release acceptance remains open**. The approved delivery uses local validation and documented defaults. Real provider consent, controlled account journeys, security/product/platform acceptance and production deployment are separate gates.

## Delivered implementation

| Area | Implemented behavior |
| --- | --- |
| Work | Project members/milestones/assignment/subtasks/source references; cycle-safe dependencies; recurrence edits and occurrence identity; canonical rollups; shared/personal work views; reviewed bulk archive/delete/restore; activity and future-block/dependency impact. |
| Scheduling | Day/week/month/agenda; working hours, density, week start, timezone, buffers and selected overlays; equivalent drag/form reviews; source-version revalidation; separate reviewed attendee/occurrence/series provider writes with durable outcomes. |
| Mail | Editable versioned compose/reply/reply-all/forward drafts, clean reviewed attachments, exact recipient review, send deduplication/unknown reconciliation, provider-specific read/label/folder changes, personal snoozes and local tagging rules. |
| Sync | Periodic missed-hint reconciliation; bounded folder hierarchy and per-folder delta; immutable moved-message identity; rolling expanded calendar windows; authenticated/deduplicated hints and renewable subscriptions; retry/reauthorization/coverage health. |
| Knowledge | Typed schemas, safe formulas, row/view repair, canonical linked views, private/shared preferences, authorized relations/comments/mention picker, unavailable source previews, private reviewed collection templates, rich Yjs body formatting and revision/reconnect recovery. |

See [implementation](implementation.md) and [setup/recovery](setup.md) for exact contracts and limits. The original PRD and roadmap remain unchanged. Private plans and the requested technology explanations stay gitignored.

## Explicit supported bounds

- Project timelines visualize deadlines; they do not infer duration or automatically shift dependents. Only currently visible endpoints contribute to progress/impact.
- Recurrence supports bounded daily/weekly/monthly/yearly definitions. Unsupported selectors, unbounded expansion and invalid civil/DST input are rejected.
- Provider calendars cover the primary/default rolling -30/+90-day window. Microsoft mailbox discovery supports up to 1,000 folders; paging and incomplete coverage remain explicit.
- Google attachment delivery supports ten MiB total; Microsoft uses the small-file API with two MiB total. Every stored file remains capped at five MiB and requires clean scanning/current source access.
- Rules apply private local tags, not automatic sends or a general automation engine. Provider acceptance is not recipient delivery. Inconclusive external effects remain unknown without a blind retry.
- Rich editing supports paragraphs/headings and bold/italic/strike/code. Arbitrary HTML, active external embeds and unsupported marks are rejected. The implemented collaboration transport is authenticated HTTP polling; a WebSocket cluster is not required for this local topology.
- Row templates copy at most ten currently visible source records into new private canonical records. They do not copy permissions, files or relationships.

## External acceptance still required

| Gate | Evidence still required |
| --- | --- |
| Controlled Google/Microsoft journeys | Approved delegated test accounts and real consent; read/reply/attachments/send, moves, event/attendee/series/DST round trips, token expiry and actual subscription renewal. Fixtures cannot certify a live provider. |
| Provider/public ingress approval | Approved OAuth registrations/scopes, tenant-admin consent where needed, Google verification, provisioned Pub/Sub/HTTPS callbacks and trusted ingress controls. No public resources were provisioned in this delivery. |
| Production operations/security | Qualified scanner/storage/identity, vault backup/rotation/key management, retention/deletion procedures, load and security testing, quota/worker/dead-letter alerts and recovery acceptance. |
| Human acceptance | Named product/security/platform owners, manual screen-reader/keyboard review, participant workflows and the remaining conditional G1 prerequisites. Automated browser coverage supports this review but does not replace it. |

These gates keep G2 open. This delivery does not claim production readiness, deployed provider infrastructure, real account success or remote CI success.

## Validation record

Run `npm run check:l1b`. It executes application lint/types/unit tests/builds, isolated PostgreSQL integration/recovery, built-application browser journeys, generated-contract synchronization, all three dependency audits and baseline/private-path checks. Reports record the actual revision, dirty state, commands and outcomes under ignored `discovery/.artifacts/l1b/`; browser traces/screenshots remain under ignored browser artifacts.

The first full completion run passed source checks and both builds, then found an overly strict saved-view title-column validator. The validator was corrected. Browser review additionally found ambiguous column labels and success announcements with an error role; those were corrected before repeat qualification. No required test was removed or suppressed. Final verified results are recorded below after the complete run.

## Verified completion qualification

On 31 October 2026 (local time; report timestamp `2026-10-30T19:31:46.320Z`), `npm run check:l1b` passed all eight configured stages. The report records revision `10085e940e80c26af97720e61c171bc264a0eca8` plus the then-uncommitted final qualification changes, with a dirty working tree; it is evidence for that actual source state, not a clean tagged production release.

| Check | Observed outcome |
| --- | --- |
| Lint and strict types | Passed across frontend/backend/discovery. |
| Unit tests | Passed: 32 backend and 20 discovery tests. |
| Production builds | Passed: Next webpack and backend TypeScript builds. |
| Isolated PostgreSQL integration | Passed: 24 tests, including recovery, current-access boundaries, reviewed effects, folder/hint recovery, templates and rich bodies. |
| Built application browser journeys | Passed: nine, including rich formatting/reload, reviewed archive recovery and saved views alongside prior foundation/convergence/mobile journeys. |
| Generated contracts | Passed. |
| Dependency audits | Passed: frontend/backend/discovery each reported zero vulnerabilities. |
| Baseline and private paths | Passed. |
| Private phase validator | Passed: six stages, 22 parts, 168 unique tasks and preserved original baseline hashes. |

An initial sandbox-only audit could not resolve the npm registry; the authorized full run subsequently executed all three audits successfully. Earlier integration/browser failures were investigated and corrected, including independent test identities so new journeys did not collide with the real login-rate limiter. No security rule or test expectation was weakened to bypass that limiter. No remote CI/deployment or real-provider/manual gate was executed.
