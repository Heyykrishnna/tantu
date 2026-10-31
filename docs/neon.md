# Neon PostgreSQL

The API and background worker use the same PostgreSQL database through `DATABASE_URL`. Neon replaces the local database connection without changing the application schema, transaction boundaries, authorization policies, queue implementation, or file storage adapter. No additional database driver is required.

## Credentials and connection routes

Store deployment credentials in the ignored root `.env`, using `.env.example` as the key reference. Docker Compose reads this file automatically. Never commit credentials or place them in frontend environment variables.

| Variable | Role and endpoint | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Restricted `tantu_runtime` role; pooled Neon endpoint | API requests and worker transactions, including durable jobs |
| `MIGRATION_DATABASE_URL` | Migration owner; direct Neon endpoint | Ordered migrations, queue initialization, and runtime grants |

Use the same Neon project, branch, and database for both URLs. The pooled hostname contains `-pooler`; the direct hostname does not. Migrations hold a session advisory lock and must use a direct connection. The migration entry points reject a pooled Neon endpoint. Neon also requires direct connections for database dump and restore operations: [Neon backup guidance](https://neon.com/docs/manage/backup-pg-dump).

For native operator commands, put the direct owner URL in ignored `backend/.env.operator` as `MIGRATION_DATABASE_URL` and `MAINTENANCE_DATABASE_URL`. Put the restricted URL in its `DATABASE_URL` key when running bootstrap. Native API and worker commands read ignored `backend/.env`; configure its `DATABASE_URL` to the same restricted Neon connection and supply the existing required storage and signing settings described in the [setup guide](l1a/setup.md). Docker volumes and native filesystem paths are separate storage locations.

Neon connections use certificate and hostname verification through `sslmode=verify-full`, explicitly enabled SCRAM channel binding in `pg`, and a 20-second connection deadline for compute wake-up. Local PostgreSQL and Unix socket settings retain their existing behavior. Do not disable TLS verification to resolve a connection problem.

## Database access

Create `tantu_runtime` using SQL as a login role with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE`, `NOCREATEDB`, and `NOREPLICATION`, with a generated secret. Grant database connection permission. Keep this role outside the migration owner's role memberships and table ownership. Apply `backend/migrations/runtime-grants.sql` after creating or restoring the schemas. Application startup verifies the runtime role before serving requests or processing jobs.

The Neon owner connection is restricted to operator configuration and the ephemeral migrator container. Never use it as the API or worker `DATABASE_URL`.

## Move an existing installation

1. Verify the destination database and permissions. Stop if the destination already contains application tables; plan reconciliation instead of overwriting them.
2. Stop the API and worker to prevent writes during cutover. Leave the source PostgreSQL volume and private file volume intact.
3. Create a custom-format `pg_dump` archive from the source. Retain ACLs so revoked public function permissions and runtime grants survive restoration. Keep the archive in ignored, access-restricted storage.
4. Restore through the direct Neon owner connection using `pg_restore --no-owner --single-transaction --exit-on-error`. The destination must have the runtime role needed by the archive's grants. Do not use `--clean` against an existing database.
5. Compare all table row counts and content fingerprints before starting destination writers. Preserve the migration ledger, queue tables, row-level security, triggers, and function permissions.
6. Set the ignored deployment URLs, then rebuild and start the migrator, API, and worker:

   ```sh
   docker compose build migrator backend worker
   docker compose up -d migrator backend worker
   ```

7. Confirm migration completion, runtime-role validation, authenticated API reads, scoped writes with rollback, and worker queue processing against Neon. The liveness endpoint alone does not verify database access.

Without URL overrides, Compose still supports local PostgreSQL. The local service can remain running as a retained fallback after cutover, but new application writes go to Neon only. Switching back after new writes requires a reverse migration; the old database is a snapshot, not a synchronized replica. Do not delete its volume until recovery requirements have been reviewed.

## Stored data and operations

Neon holds application identities, workspaces, records, metadata, migrations, and durable queues. Uploaded file bytes remain in the existing private `file_storage` volume shared by API and worker; their metadata remains in PostgreSQL. Preserve the existing `FILE_SIGNING_SECRET`, provider vault key, and file storage during a database move.

Configure Neon backup retention and monitoring for the chosen account plan. Keep database dumps encrypted or in access-restricted storage, and test restores. Connection credentials, local backup archives, verification reports, and operator notes belong in ignored files. The Neon SQL Editor or pgAdmin can browse `neondb` → `Schemas` → `tantu` → `Tables`; `tantu_jobs` contains queue tables and `public.tantu_migrations` records applied migrations.
