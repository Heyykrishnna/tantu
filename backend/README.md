# tantu backend

A TypeScript/Fastify modular application with PostgreSQL identity and canonical task/page persistence, current-access authorization, durable internal events, secure files and scoped operations.

## Setup and configuration

Use Node.js 24/npm 11. Follow the [installation guide](../docs/l1a/setup.md) before starting the application. HTTP startup requires a migrated database, a non-superuser runtime role, `DATABASE_URL`, `APP_ORIGIN`, `FILE_STORAGE_PATH` and a cryptographically generated `FILE_SIGNING_SECRET`. See [.env.example](.env.example) for runtime settings and [.env.operator.example](.env.operator.example) for credentials kept out of HTTP/worker environments.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL` | Validated process environment, binding and content-free logger settings. Defaults: development, loopback, 4000, info. |
| `DATABASE_URL` | Least-privilege HTTP/worker connection. Must not have superuser or row-security bypass authority. |
| `MIGRATION_DATABASE_URL` | Separate schema owner used only by the migration command. |
| `MAINTENANCE_DATABASE_URL` | Isolated operator connection for cross-tenant deletion reconciliation; never pass it to HTTP/worker processes. |
| `APP_ORIGIN` | Exact browser origin for mutation checks. Default `http://localhost:3000`; production requires HTTPS. |
| `FILE_STORAGE_PATH` | Absolute private storage directory shared by the local HTTP and worker processes. There is no implicit temporary-storage default. |
| `FILE_SIGNING_SECRET` | At least 32 random bytes; an environment/secret-manager value, never a committed literal. |
| `PROVIDER_VAULT_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | Optional delegated provider configuration; see the connected-work setup. Empty settings keep connections disabled. |
| `SCANNER_HOST`, `SCANNER_PORT` | Trusted ClamAV endpoint; defaults loopback/3310. |
| `BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME`, `BOOTSTRAP_PASSWORD` | One-time empty-installation account creation; remove afterward. |

## Commands

Run from this package:

| Command | Behavior |
| --- | --- |
| `npm run migrate` | Check/apply ordered immutable SQL migrations and initialize durable queues with migration credentials. |
| `npm run bootstrap` | Create the first password account in an empty installation. |
| `npm run dev` / `npm start` | Development HTTP watch / compiled HTTP service. |
| `npm run worker` / `npm run start:worker` | Separate development / compiled internal worker. |
| `npm run cleanup:files` | Preview bounded orphan/deletion reconciliation; `-- --apply` explicitly applies it using maintenance credentials. |
| `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | Source checks, strict source/test/operator-script types, unit tests and compilation. |
| `npm run test:integration` | Disposable PostgreSQL tests, including access/replay/fault injection, files and backup/recovery. |
| `npm run contracts:types`, `npm run contracts:openapi` | Regenerate frontend canonical types / implemented network schemas. |
| `npm run contracts:check` | Reject stale generated contracts. |

`GET /health/live` reports process liveness. `/health/ready` checks HTTP database availability; it does not certify scanner freshness, worker progress or production readiness. Protected `/api/v1` routes require a live session, workspace membership and current record permissions. Unsafe requests also require the configured Origin and session CSRF token.

See [module ownership](src/modules/README.md), [migrations](migrations/README.md), [workers](src/workers/README.md), [operations](../docs/l1a/operations.md) and [readiness](../docs/l1a/readiness.md). The [connected-work guide](../docs/l1b/implementation.md) describes implemented provider reads, reviewed sends, projects, scheduling and knowledge. [Provider setup](../docs/l1b/setup.md) documents optional credentials, the independent encryption key, fixed callbacks and recovery. The implementation now includes reviewed calendar/mailbox effects, periodic reconciliation and optional authenticated subscription hints, plus private reviewed templates and bounded rich page editing. AI and production archive ingestion belong to later phases; real-provider/human/production acceptance remains separate.
