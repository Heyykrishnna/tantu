# Performance and security review

## Architecture and measured bottlenecks

The Next.js 16 App Router serves a static shell. The browser authenticates through same-origin Fastify APIs; PostgreSQL remains authoritative and its restricted runtime role enforces row security. Session cookies are HttpOnly. Private API responses and browser fetches use `no-store`.

The initial production sign-in journey at revision `10d3ed9` downloaded 1,790,917 decoded JavaScript bytes across 14 scripts in a clean Chromium session. The workspace shell eagerly imported every feature panel, including the rich editor, before authentication. The search dialog also retained its request effect while closed. These are the first targets; no Redis, service worker, or persistent API cache is justified by this evidence.

## Implementation policy

Defer feature code until its view or dialog is opened. Keep loading states accessible and reserve space while modules load. Reuse content-hashed JavaScript through Next.js and browser asset caching; do not cache private API responses. Closed search dialogs must unmount, abort requests, and discard their query/results. Every new search continues to authenticate and authorize at the server. Successful mutations retain the existing authoritative refresh paths.

Validate with the same production sign-in journey, browser regressions, isolated PostgreSQL tests, dependency audits, lint, types, and production compilation. Record final measurements and operational guidance after validation.

## Results and freshness contracts

| Resource or journey | Before | After | Policy |
| --- | --- | --- | --- |
| Initial sign-in JavaScript | 1,790,917 bytes / 14 scripts | 839,314 bytes / 11 scripts | Decoded resource bytes in clean local Chromium, production Webpack builds; 53.1% less JavaScript |
| Workspace and file refresh while hidden | One timer every 15 seconds, potentially overlapping | No scheduled requests; active polling aborted | Refresh on visibility return; schedule next poll after completion |
| Closed unified search | Component and its effect remained mounted | Unmounted, request aborted, private query/results discarded | Reopening starts empty; workspace changes remount it |
| Private API responses | `no-store` | `no-store` | Authentication, current permissions and PostgreSQL RLS remain authoritative |
| Feature modules | Eager imports in the workspace shell | Load when the feature is rendered | Content-hashed assets use framework caching; no application data cache |

These are local payload measurements, not claims about production LCP, INP, p95 latency, or Neon query latency. No Redis, IndexedDB cache, service worker, new dependency, schema change, or API TTL was introduced. Existing mutation handlers refresh authoritative records after successful writes. Hidden-tab views can be stale until the visibility refresh completes; every protected API operation still rechecks access. Existing account-scoped recovery drafts remain in session storage and are cleared by the existing logout/revocation paths; they are not API response caches.

Enterprise access reviews previously showed seeded names and reported approvals without a server write. The panel now explicitly reports that reviews are unavailable and directs administrators to actual workspace membership settings. It cannot report a successful privilege change.

Theme controls now share one DOM update helper and the existing `tantu-theme` preference key. Header toggles, saved settings and initial restoration synchronize `data-theme`, the Tailwind dark class and native control colors. The toggle exposes its current action to assistive technology and waits for an active transition to finish before accepting another change. Browser regressions retain light/dark color, font, alignment and reload-persistence assertions and use the current task-card accessible names.

## Reproduction and operations

Run `npm run check`, `npm --prefix backend run contracts:check`, and low-severity npm audits for frontend, backend, and discovery. Run `npm --prefix backend run test:integration` against disposable PostgreSQL binaries and `npm --prefix discovery run test:l1a:browser` after a production frontend build. The integration suite checks the entire sorted migration ledger, including idempotent reapplication, rather than a stale hardcoded migration count.

Browser scenarios receive separate synthetic accounts and workspaces. The expanded suite previously exhausted the real sign-in limit by repeatedly authenticating one shared account. Scenario isolation preserves rate limiting and tenant boundaries; no limiter is reset, bypassed or relaxed for qualification.

Normal PostgreSQL fixture teardown uses a bounded smart shutdown so closing pooled sockets can finish. If connections leak, it force-cleans the fixture and still fails the test. The explicit abrupt-recovery scenario continues to use immediate shutdown. A separate integration regression checks socket draining without accepting administrative-termination errors.

For a production payload measurement, build the frontend, start it on a spare local port, then run `PERFORMANCE_ORIGIN=http://127.0.0.1:3200 node discovery/scripts/measure-frontend.mjs`. It uses a fresh Chromium context, does not sign in, and writes evidence under ignored `discovery/.artifacts/performance/`. Local execution uses Chrome; CI uses installed Playwright Chromium. Keep the same build mode, browser, origin configuration and cache state when comparing revisions.

The isolated Linux PostgreSQL run passed all 26 integration tests; the two database lifecycle regressions also passed ten consecutive isolated runs. Native macOS execution encountered an exhausted shared-memory-ID limit during `initdb`; use the isolated Linux run or CI rather than changing database security or host kernel settings. For browser tests on a busy workstation, `L1A_BACKEND_PORT` can select another unprivileged port; build with the matching `BACKEND_ORIGIN`. Default CI ports remain unchanged.

Monitor actual browser resource bytes, navigation errors, visible refresh request counts, backend latency and PostgreSQL query duration before adding another caching layer. Reverting the lazy imports restores eager loading without data migrations. Reverting the visibility helper restores polling frequency without changing API authorization or stored data. Keep the corrected migration verification and security fixes when rolling back performance behavior.
