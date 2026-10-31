# Docker Deployment and Container Architecture

This document describes the containerized architecture for tantu, including service synchronization, security boundaries, and local orchestration using Docker Compose.

For hosted PostgreSQL, set `DATABASE_URL` and `MIGRATION_DATABASE_URL` in the ignored root `.env`. The API and worker share the runtime URL; the migrator uses the separate owner URL. See the [Neon connection and migration guide](neon.md). The local PostgreSQL volume remains available as a fallback, and file storage stays in the existing shared volume.

## Architecture

The containerized stack consists of six coordinated services:

```
                  +--------------------------------+
                  |         Host Browser           |
                  |     http://localhost:3000      |
                  +---------------+----------------+
                                  |
                                  v
+-----------------------------------------------------------------------+
|  tantu_network                                                        |
|                                                                       |
|  +--------------------+                    +-----------------------+  |
|  |   tantu-frontend   |  /api/v1 rewrite   |     tantu-backend     |  |
|  |     (Next.js)      +------------------->+       (Fastify)       |  |
|  |     Port 3000      |                    |       Port 4000       |  |
|  +--------------------+                    +-----------+-----------+  |
|                                                        |              |
|                                                        v              |
|  +--------------------+                    +-----------+-----------+  |
|  |    tantu-worker    |                    |    tantu-postgres     |  |
|  |      (pg-boss)     +------------------->+    (PostgreSQL 16)    |  |
|  +---------+----------+                    |       Port 5432       |  |
|            |                               +-----------+-----------+  |
|            |                                           ^              |
|            |       +-------------------+               |              |
|            +------>|   tantu-scanner   |               |              |
|                    |     (ClamAV)      |               |              |
|                    |     Port 3310     |               |              |
|                    +-------------------+               |              |
|                                                        |              |
|  +-----------------------------------------------------+-----------+  |
|  |                    tantu-migrator                               |  |
|  |  (Runs migrations, pg-boss setup, grants, and bootstrap; exits) |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
```

### 1. Database (`tantu-postgres`)

- Image: `postgres:16-alpine`
- Initialized via `/docker-entrypoint-initdb.d/01-init.sh`
- Creates separate non-superuser, non-bypassrls roles:
  - `tantu_migrator`: Owns the `tantu` database and schema.
  - `tantu_runtime`: Used by application backend and background workers.
- Persistent volume: `postgres_data`
- Healthcheck: `pg_isready -U postgres`

### 2. Scanner (`tantu-scanner`)

- Lightweight ClamAV-compatible scanning daemon listening on port 3310.
- Implements ClamAV `zINSTREAM` protocol for quarantined file evaluation.
- Flags known test malware and EICAR signatures while releasing clean files.
- Healthcheck: Socket ping test on port 3310.

### 3. Migrator (`tantu-migrator`)

- Ephemeral container executing `backend/scripts/docker-migrate.mjs`.
- Waits for PostgreSQL readiness with connection retries.
- Applies all schema migrations sequentially in transactions.
- Initializes `pg-boss` queues (`canonical-events`, `file-scans`, `provider-sync`, `provider-effects`).
- Applies least-privilege permissions via `runtime-grants.sql`.
- Bootstraps initial administrator credentials if none exist.
- Exits cleanly with status 0 upon completion.

### 4. Backend (`tantu-backend`)

- Fastify server listening on loopback and container network interfaces.
- Runs as unprivileged `tantu` user (UID 1001).
- Connects using `tantu_runtime` role. Verifies non-superuser and non-table-owner status.
- Shared private storage volume `file_storage` mounted at `/data/files` with mode `0700`.
- Healthcheck: Querying `http://127.0.0.1:4000/health/live`.

### 5. Worker (`tantu-worker`)

- Background worker executing `backend/dist/workers/server.js`.
- Processes asynchronous outbox events, file scan jobs, and provider synchronizations.
- Mounts shared `file_storage` volume.
- Synchronized startup dependent on `tantu-backend` health.

### 6. Frontend (`tantu-frontend`)

- Next.js production build listening on port 3000.
- Rewrites `/api/v1/*` requests to `http://backend:4000/api/v1/*`.
- Healthcheck: HTTP root query at `http://127.0.0.1:3000`.

## Quick Start

### 1. Start all services

```bash
npm run docker:up
```

Alternatively:

```bash
docker compose up -d
```

### 2. Verify container statuses

```bash
docker compose ps
```

All services will report `healthy` or `running`.

### 3. View logs

```bash
npm run docker:logs
```

Or for a specific service:

```bash
docker compose logs -f backend
```

### 4. Sign in

Open `http://localhost:3000` in your browser. Default administrator credentials:

- **Email:** `admin@tantu.local`
- **Password:** `AdminPassword123!`

### 5. Stop all services

```bash
npm run docker:down
```

To remove all persistent data volumes as well:

```bash
docker compose down -v
```

## Configuration

Environment variables can be overridden in a `.env` file at the repository root. See `.env.docker.example` for available options and default values.
