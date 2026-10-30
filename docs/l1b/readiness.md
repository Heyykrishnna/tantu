# L1B readiness and remaining acceptance

Status: **local connected-work core implemented; full L1B/G2 remains open**. The owner authorized local validation and documented defaults. That authorization does not waive unimplemented requirements, live-provider consent, production security or manual acceptance.

## Implemented and locally tested

- Projects with owner/private/workspace access, canonical task links, visible rollups, list/board/table/deadline views, optimistic edits and concurrent dependency-cycle rejection.
- Bounded civil recurrence, unique materialized/skipped occurrences, local calendar views and reviewed work-block scheduling that preserves deadlines.
- Private OAuth connection and encrypted-token paths, bounded Google/Microsoft read adapters, atomic page/cursor updates, reset/retry handling and worker continuations.
- Reviewed plain-text draft/send intents, durable uncertainty fencing, duplicate-execution protection and evidence-only reconciliation.
- Typed collection schemas/values, safe arithmetic formulas, canonical linked rows, schema impact/repair handling, authorized relations/comments/mentions, private page-body templates and body restoration.
- Persisted Yjs page bodies, authenticated polling/presence, concurrent edits, current-access revocation and browser draft recovery.

The test suite uses synthetic identities and deterministic HTTPS provider fixtures, not real Google/Microsoft accounts. Run `npm run check:l1b`; exact revision, dirty state, commands, outcomes and logs are written under `discovery/.artifacts/l1b/`. Built-app evidence remains under the existing browser artifact directory. Successful local checks do not imply successful remote CI or deployment.

## Requirements still needed for complete L1B

| Area | Remaining implementation/qualification |
| --- | --- |
| Work coordination | Explicit project-member grants, milestones, assignment/subtask models, shared/persisted view definitions, full grouping/column preferences, authorized bulk archive/delete/restore, recurrence-definition editing and dependency-slip/block-impact review. Current project timelines order deadlines; they are not a full Gantt editor. |
| Scheduling | Working-hours/density/overlay preferences, drag interactions, buffers/capacity, attendee/provider-effect review, full recurrence exceptions/series edits, dependency-source revalidation beyond the current task/calendar checks, and reviewed external calendar writes. Provider calendars are currently read-only projections. |
| Mail | Reply/reply-all/forward, attachments, folder/label mutation, unread actions, snooze/rules, editable/versioned draft UX, full Microsoft folder coverage, and qualification of send acceptance/reconciliation with real delegated accounts. |
| Synchronization | Validated webhook subscriptions/hints and renewals, periodic missed-hint reconciliation, account-level quota/concurrency qualification, rolling calendar-window renewal and comprehensive provider recovery/retention monitoring. Synchronization is manually queued today. |
| Knowledge | Rich Tiptap/ProseMirror extensions, production WebSocket transport if required, persisted personal/shared collection views, richer templates/embeds, mention-selection UX and broader assistive-technology qualification. Current native text editing preserves Yjs merge semantics. |
| Release gates | All prior conditional G1 items, named product/security/platform acceptance, real scanner/storage/key/retention/identity qualification, load/security/manual accessibility review, approved Google/Microsoft registrations and controlled real-account journeys. |

These are real remaining tasks, not merely missing credentials. Keep composite original plan tasks unchecked where any component remains open. Continue them before declaring the whole phase complete or beginning work that requires a passed G2 gate.

## Validation interpretation

Source lint, strict types, unit/integration tests, production compilation, browser behavior, generated contracts, audits and baseline checks are the automated local gates. Browser tests cover the previous foundation plus project/schedule flows, typed collection identity/schema edits and two-editor convergence/reload recovery. Provider fixtures exercise state/nonce/UserInfo checks, signed ID tokens, URL boundaries, plain-text/all-day representations, cursor reset, throttling, private access and uncertain-send reconciliation.

Turbopack could not bind its local CSS worker port in this environment. The configured production builder uses Next’s supported webpack path and the matching Tailwind PostCSS adapter; the browser suite checks actual utility styling and fonts. This is a builder choice, not a skipped production build. Development retains the existing Turbopack configuration.

The original PRD and roadmap remain unchanged. Local plans and the requested explanatory technology guide are gitignored. No production or provider release is claimed by this delivery.

## Recorded local qualification

On 30 October 2026, `npm run check:l1b` passed all eight stages against revision `f61c61859772e55e23782204f79108e78e849084` plus the then-uncommitted qualification changes; the report explicitly records a dirty working tree. This is evidence for those actual files, not a claim of a clean tagged release.

| Check | Actual outcome |
| --- | --- |
| Root lint/types/unit/build checks | Passed; 27 backend and 20 discovery unit tests, frontend and backend production builds. |
| Isolated PostgreSQL integration | Passed; 16 tests including prior foundation recovery and new connected-work cases. |
| Built application browser journeys | Passed; seven journeys, including two-editor convergence and reload recovery. |
| Generated contract synchronization | Passed. |
| Frontend/backend/discovery dependency audits | Passed; zero reported vulnerabilities at execution. |
| Baseline, links and private-path checks | Passed. |
| Private phase-plan validation | Passed; six stages, 22 parts, 168 unique tasks; original baseline hashes preserved. |

Earlier build/browser failures were investigated and corrected before this passing run; none were skipped or suppressed. The report and logs remain local. The final commit does not turn the unresolved product requirements above into completed acceptance.
