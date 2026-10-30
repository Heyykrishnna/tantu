# Development guide

## Checkout and packages

A single clone contains the Next.js frontend, TypeScript/Fastify backend and isolated discovery/qualification package. Each npm package has its own lockfile. Use Node.js 24/npm 11 and run `npm run setup` from the root; root commands delegate with `npm --prefix`.

The [PRD](product-requirements.md) and [roadmap](roadmap.md) preserve the product baseline. The [L1A installation guide](l1a/setup.md) describes the implemented local application and actual environment requirements. Domain ownership remains in the [module guide](../backend/src/modules/README.md).

## Development lifecycle

Configure separate PostgreSQL migration/runtime roles, apply migrations, generate a private file-signing key and bootstrap the initial account. Run the HTTP backend, durable worker and frontend in separate terminals using `dev:backend`, `dev:worker` and `dev:frontend`. Open localhost:3000 so the browser Origin matches the backend setting. The same-origin rewrite avoids cross-origin cookie settings.

The HTTP factory is separate from listening and accepts explicit database/settings dependencies for isolated tests. Test fixtures create private disposable PostgreSQL clusters with no network listeners; they never select a database from application environment variables. The browser suite starts the production frontend and actual Fastify HTTP service on ports 3100/4000 and fails if those ports are occupied. Stop a development backend before running it.

## Validation and synchronization

Run `npm run check:l1b` for source lint/types, unit tests, both builds, database/backup/restore/crash tests, browser journeys, generated-contract checks, three dependency audits and documentation checks. PostgreSQL 16+ tools and local Chrome or Playwright Chromium are required. Set `PG_BIN` if necessary. Test logs, reports and screenshots stay in ignored artifacts.

`npm run check:l0` retains the earlier isolated engineering experiments and requires Python/Go in addition. CI runs that baseline and the connected-work aggregate checks. Report commands actually executed; do not infer remote CI success from local output or a workflow file.

When canonical interfaces or route schemas change, run `npm --prefix backend run contracts:types` and `npm --prefix backend run contracts:openapi`. Check generated diffs and run `contracts:check`. Do not hand-edit generated contract artifacts or suppress compiler/library errors. No formatter is configured; lint and type checks remain mandatory.

## Git and private material

Dependency directories, builds, logs, coverage, local environments, phase plans and local technology guides are ignored. Track `.env.example` with variable names and safe empty secret fields. Never force-add private planning/evidence or include production credentials in diagnostics. Preserve unrelated work and stage only relevant files.

The [connected-work setup](l1b/setup.md) covers optional providers and uncertainty recovery. The [operations runbook](l1a/operations.md) covers migration recovery, worker failures, file reconciliation, key/session rotation and local restoration. Production identity, malware-engine qualification, retention, deployment and manual accessibility remain explicit readiness conditions.
