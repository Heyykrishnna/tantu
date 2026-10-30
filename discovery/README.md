# L0 discovery and qualification harness

This package contains synthetic design experiments and test fixtures, isolated from the running frontend/backend. No discovery module is imported by the production server. The journey prototype cannot send mail, connect accounts, or create product records.

Use Node.js 24 and npm 11. `npm run setup` at the project root installs this package from its lockfile. Ordinary root checks include its lint, strict types, and unit experiments. Run `npm run check:l0` for browser, ephemeral PostgreSQL, and archive qualification as well.

Additional local prerequisites are PostgreSQL 16+ command-line tools, Python 3 for the isolated static prototype server, a supported Go toolchain for the archive spike, and Chrome or Playwright Chromium. No existing database is used. Detailed experiment reports are generated under `.artifacts/`, which is ignored.

| Check | Command from this package | Evidence scope |
| --- | --- | --- |
| Contracts, traceability, collaboration, recurrence, policy fixtures | `npm test` | Synthetic interface/algorithm behavior; not live providers or product authorization. |
| Prototype browser review | `npm run test:browser` | Six audience/recovery journeys, keyboard entry, narrow layout, and screenshot. |
| PostgreSQL qualification | `npm run test:postgres` | A newly initialized private cluster, real SQL constraints, isolation, outbox/jobs, recovery, and search. |
| Full package checks | `npm run check` | Lint, strict TypeScript, and unit checks. |

Browser checks use installed Chrome locally and Playwright Chromium in CI. Run `npx playwright install chromium` in CI-compatible environments before its browser job. The test web server binds only loopback and serves only the synthetic prototype folder.

PostgreSQL and Go tests are local engineering evidence. They do not qualify a production region, identity tenant, OAuth consent, real-provider contract, production service level, or security certification.
