# tantu Backend

The TypeScript/Fastify foundation for tantu’s modular backend. This package provides server infrastructure only. Tasks, projects, authentication, provider connections, persistence, synchronization, and AI are not implemented.

## Run locally

Use the Node.js version in the project’s `.nvmrc` and npm 11. From the project root:

```bash
npm run setup
npm run dev:backend
```

The default address is [localhost:4000](http://localhost:4000). The process liveness endpoint is [localhost:4000/health/live](http://localhost:4000/health/live).

The server starts without a database, provider credentials, or an environment file. To override defaults, copy `.env.example` to `.env` inside this package. Local environment files are ignored by Git.

## Configuration

| Variable | Default | Validation |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `HOST` | `127.0.0.1` | Nonempty hostname/IP without whitespace |
| `PORT` | `4000` | Integer from 1 through 65535 |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |

The process environment takes precedence over `.env`. Bind to `0.0.0.0` explicitly when the hosting environment needs external network access. Proxy trust and cross-origin access are not enabled by default.

## Available commands

Run from this package, or use the root commands described in the [project README](../README.md).

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the locked dependencies. |
| `npm run dev` | Start the TypeScript server in watch mode. |
| `npm run lint` | Check source, tests, and configuration with ESLint. |
| `npm run typecheck` | Check strict TypeScript across source and tests. |
| `npm test` | Run server/configuration tests using Node’s test runner. |
| `npm run build` | Compile application source to `dist/`. |
| `npm start` | Run a previously compiled server. |

## Implemented foundation

- Validated startup configuration and an application factory separate from the network listener.
- Security headers, server-generated request IDs, strict JSON Schema validation settings, and bounded request bodies/timeouts.
- Sanitized not-found, validation, payload, and internal-error responses with a request ID.
- Automatic request logging disabled; operational failures log content-free metadata.
- `SIGINT`/`SIGTERM` shutdown with request draining and a bounded shutdown deadline.
- Injection-based tests for liveness, safe errors, validation, payload limits, and configuration boundaries.

`GET /health/live` reports that the HTTP process is running. It does not claim database, worker, provider, or product readiness. Unimplemented routes return 404.

## Domain and infrastructure boundaries

The [module ownership guide](src/modules/README.md) maps all nine PRD domains. Reserved module directories contain no handlers or services. Add a vertical slice only when its data, permissions, failure handling, and tests can be implemented together.

The [platform guide](src/platform/README.md) separates database, jobs, storage, and provider adapters. [Worker boundaries](src/workers/README.md) and [migration rules](migrations/README.md) reserve the planned asynchronous and persistence work without starting fake jobs or creating speculative schemas.

The isolated Go archive adapter is described in the [archive boundary](../archive/README.md). Runtime-validated network contracts will follow the [contract policy](../contracts/README.md). Those dependencies are not installed in this production backend. The isolated discovery harness uses PostgreSQL/queue clients and a pinned Go archive qualification module without importing them into the HTTP application.

See the [backend foundation decision](../docs/decisions/0001-backend-foundation.md) for implementation scope and remaining decisions.
