# Development guide

## Scope of the scaffold

The project has a Next.js frontend starter, a TypeScript/Fastify backend foundation, and documented boundaries for future domain and infrastructure work. This is application boilerplate; no task, calendar, mail, knowledge, authentication, database, worker, or AI workflow is implemented.

The [backend foundation decision](decisions/0001-backend-foundation.md) records the concrete technology choice. The [PRD](product-requirements.md) and [roadmap](roadmap.md) remain the dated product baseline.

## Source checkout

Frontend and backend source files are tracked directly in the root repository. A single clone contains both packages; no submodule initialization or separate frontend repository is required.

Root setup commands install each package from its own lockfile. Keep a single Git history for application source while preserving the independent package boundaries.

## Runtime and package management

Use Node.js 24 with npm 11; `.nvmrc` records the local development version. Root and backend package engines describe the supported major versions. The frontend’s existing framework and dependency versions are preserved.

Frontend and backend are independent npm packages with separate lockfiles. Root scripts delegate with `npm --prefix`; there is no npm workspace migration, shared dependency installation, or duplicate root lockfile. Run `npm run setup` from the root to install both locked packages.

Use package-specific `npm install` when deliberately changing dependencies, then review the relevant manifest and lockfile. Use `npm ci` for reproducible installation. Never copy dependencies or hand-edit lockfile resolutions to manufacture a passing install.

## Local process lifecycle

Run `npm run dev:frontend` and `npm run dev:backend` in separate terminals. The frontend listens on port 3000; the backend defaults to loopback port 4000. No frontend network calls are wired to product APIs yet.

The backend loads an optional package-local `.env`; process-level variables take precedence. Only `NODE_ENV`, `HOST`, `PORT`, and `LOG_LEVEL` are configured. Database/provider settings will be introduced with their implementations rather than as unused secret placeholders.

The backend application factory does not bind a port. Tests use Fastify injection; the server entry point owns listening and bounded signal shutdown. `/health/live` checks the process only. Readiness must be added when real dependencies and their failure semantics exist.

## Validation

From the root:

```bash
npm run check
```

This runs frontend/backend lint and type checks, backend foundation tests, and both production builds. Frontend type generation happens inside its `typecheck` command. Tests cover configuration boundaries, security headers, sanitized errors, strict schemas, payload limits, and honest unimplemented routes.

The frontend has no automated application test suite. Database/provider/archive integration, browser/accessibility qualification, CI, container deployment, and performance targets remain future work. Do not report those checks as passing based on the scaffold tests.

## Git hygiene and local plans

The root `.gitignore` excludes dependency directories, builds, coverage, logs, TypeScript caches, local environment files, and the entire `phases/` folder. `.env.example` files remain eligible for tracking. Ignore rules do not remove files already committed.

Detailed phase plans are local development material and must not be force-added or linked from tracked documentation. Current implementation status belongs in package READMEs and adopted decisions. Preserve unrelated local work and review the complete root diff before staging.

## Domain implementation

Start with a coherent authorized vertical slice. Add runtime schemas, domain behavior, persistence, failure states, and behavior tests together. Use the [module ownership guide](../backend/src/modules/README.md), [platform boundaries](../backend/src/platform/README.md), and [network contract policy](../contracts/README.md).

Avoid speculative controllers, service wrappers, DTOs, migrations, queues, provider clients, and fake endpoints. Accepted app-owned writes and their outbox events must commit together. Provider mutations need durable reviewed intent, current authorization, and truthful pending/confirmed/failed/unknown state.
