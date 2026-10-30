# Local L1A setup

This installs the standalone local foundation with synthetic or deliberately entered local work. Production deployment is gated by the [readiness record](readiness.md). Use Node.js 24/npm 11, PostgreSQL 16+ and a supported local browser. A ClamAV daemon is required for successful attachment scans; without it uploads remain quarantined/unavailable.

## Install packages

From the repository root:

```bash
npm run setup
cp backend/.env.example backend/.env
cp backend/.env.operator.example backend/.env.operator
chmod 600 backend/.env backend/.env.operator
```

The application and operator environments are separate. Do not put migration/maintenance credentials into the HTTP or worker environment, and do not commit either local file.

## Create a local database

Using an authorized PostgreSQL administrator, create separate roles and a fresh database. These commands affect only the new installation; choose different names if they already exist.

```sql
CREATE ROLE tantu_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE tantu_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE tantu OWNER tantu_migrator;
```

Use interactive `psql` `\password tantu_migrator` and `\password tantu_runtime`, or the approved secret manager, to assign credentials without saving literal passwords in command history. Local database connectivity and TLS/host authentication are the installation operator's responsibility.

Set `DATABASE_URL` in `backend/.env` to the runtime connection. Set `MIGRATION_DATABASE_URL` in `.env.operator` to the migration-owner connection and its `DATABASE_URL` to the runtime connection used by bootstrap. A connection string has the form `postgresql://ROLE:ENCODED_PASSWORD@HOST:PORT/tantu`; obtain its actual value privately and percent-encode credentials where necessary.

Run migrations and queue initialization:

```bash
npm --prefix backend run migrate
```

Then connect `psql` to the new `tantu` database as the migration owner and apply the runtime grants from the root:

```text
\i backend/migrations/runtime-grants.sql
```

This grants only the required canonical table/function operations and the initialized queue schema. Reapply reviewed grants after migrations introduce new tables. The runtime must not own canonical tables or inherit migration-owner authority. Startup rejects superuser and `BYPASSRLS` roles.

## Configure storage and browser origin

Choose a private, persistent absolute directory owned by the application operator, outside static hosting and public assets. For local development, a `local-data/files` directory is ignored by Git; record its absolute path as `FILE_STORAGE_PATH` in both environment files. Do not use an operating-system temporary directory for files you need to retain. The adapter enforces directory/file permissions and never uses an uploaded filename as a path.

Generate the signing key directly into the ignored runtime file without displaying it:

```bash
node --input-type=module -e 'import { appendFileSync } from "node:fs"; import { randomBytes } from "node:crypto"; appendFileSync("backend/.env", "\nFILE_SIGNING_SECRET=" + randomBytes(32).toString("hex") + "\n");'
```

Keep one effective value for this key in the file. The same key and storage path must be available to HTTP and workers. `APP_ORIGIN` defaults to `http://localhost:3000`; open that exact origin. HTTPS is mandatory when `NODE_ENV=production`. `SCANNER_HOST`/`SCANNER_PORT` select a trusted, isolated ClamAV daemon with current signatures and a stream limit of at least 5 MiB. Scanner traffic must stay on an approved private channel.

## Bootstrap and start

Set `BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME` and a password of at least 12 characters in the operator file. Passwords are limited to 256 UTF-8 bytes. Run:

```bash
npm --prefix backend run bootstrap
```

The command only works while the installation contains no account. Remove bootstrap credential values afterward. There is no public self-registration or development-token bypass. The local delivery does not implement password recovery, MFA or OIDC federation; qualify the production identity lifecycle before exposing the service publicly.

Start each process in a separate terminal:

```bash
npm run dev:backend
```

```bash
npm run dev:worker
```

```bash
npm run dev:frontend
```

Sign in at localhost:3000 and create a workspace. Managers create invitations in Workspace settings and share the token privately with the intended person. New users can accept an invitation on the sign-in screen; existing users sign in first and accept it under Workspace settings. No invitation email is sent automatically.

## Verify or build

```bash
npm run check:l1a
```

The suite requires disposable-cluster PostgreSQL tools (`initdb`, `pg_ctl`, `pg_dump`, `pg_restore`) and Chrome locally or installed Playwright Chromium in CI. Set `PG_BIN` if the tools are outside PATH. It ignores application database settings and creates its own private cluster. Stop a development backend before browser checks because they reserve local ports 4000/3100.

For compiled local operation run `npm run build`, then `start:backend`, `start:worker` and `start:frontend` in separate terminals. Configure `BACKEND_ORIGIN` before building when the backend is not at loopback port 4000. Keep all operator credentials out of those processes.
