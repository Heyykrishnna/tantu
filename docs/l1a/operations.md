# L1A local operations

The repository maintainer operates the local installation. Production incident ownership, hosted infrastructure, monitored SLOs, backup expiry and retention policy still need named operating responsibility and approval.

## Health, jobs and safe diagnostics

`/health/live` is process liveness; `/health/ready` probes the HTTP database connection. Neither proves worker progress, scanner freshness or provider availability. Workspace Operations exposes only authorized internal job metadata; Activity and Audit contain IDs, types, versions and timestamps, not bodies or credentials. Inspect queue age using creation/availability times and investigate repeated failures before replay. Queue warnings emit a stable content-free event; raw SQL and parameter diagnostics are not logged. Runtime reindexing is disabled because that role does not own indexes; bloat detection remains active. An authorized database operator must monitor warnings and perform reviewed vacuum/index maintenance without granting DDL ownership to runtime.

HTTP and workers run separately. Workers claim one job at a time, process bounded internal effects, use monotonic attempt/token fencing and acknowledge with the database effect. Retry/backoff is bounded; exhausted work moves toward dead-letter inspection. Managers may cancel pending work or retry failed canonical/file jobs. These controls never resend external mail because no provider-send operation exists in this slice.

Scanner outages retain bytes in private quarantine with an explicit unavailable state. After repairing scanner connectivity/signatures, use Retry scan. Corrupted digests and positive scanner results remain rejected. Do not change database state to clean manually. The automated scanner fixture proves framing/state controls; it does not qualify a real malware engine or its signature freshness.

## Sessions, grants and keys

Remove a workspace member to block subsequent scoped requests immediately. Database policies independently evaluate current membership, explicit grants and ancestor deletion state. Previously displayed content cannot be recalled; the UI polls current access every 15 seconds and protected new reads always check the backend. There is no real-time subscription service yet.

Logout revokes the current database session and clears browser-session drafts. For a compromised account, an authorized database operator can revoke all its sessions by setting `revoked_at` on the affected user's session rows. Qualify a reviewed identity recovery/MFA workflow before production. Owner removal is blocked; do not bypass this protection through the UI.

Rotate `FILE_SIGNING_SECRET` through the approved secret distribution mechanism and restart HTTP/worker processes together. Old download tokens fail immediately; new ones expire after 60 seconds. There is no application-managed cloud KMS or provider-token store in this local installation. Rotate database credentials through PostgreSQL/secret management and restart connection pools without exposing URLs in logs.

## File reconciliation

Individual file deletion blocks access immediately and appends a ledger; normal worker cleanup removes bytes and releases allocation once. Ancestor deletion and revoked actors may leave safe but retained objects. An isolated maintenance operator reconciles these cases without granting the HTTP process cross-tenant authority.

Provision a temporary, separately controlled `MAINTENANCE_DATABASE_URL` with cross-tenant row-security authority in `.env.operator`. Restrict its lifetime and never share it with HTTP/worker processes. The cleanup command reports counts only:

```bash
npm --prefix backend run cleanup:files
```

Review the dry-run result before applying:

```bash
npm --prefix backend run cleanup:files -- --apply
```

The command handles at most 100 deletion candidates per run and bounded object enumeration. It rechecks state under row locks, appends/finishes the deletion ledger and releases allocation once. Crash-orphan UUID objects are eligible only if no metadata exists and the file is older than one hour. Repeat batches until empty. The integration test covers cleanup after actor revocation, hidden ancestors, orphan age and idempotent replay. Schedule and monitor this operator job in a qualified deployment; it is not silently run from HTTP.

## Migration and restoration

Migrations are ordered, transaction-protected, advisory-locked and checksum-verified. Run them with the migration owner during an appropriate maintenance window, reapply runtime grants and check application readiness. Never edit an applied SQL migration. Prefer forward repair over destructive rollback; rehearse repair on an isolated restore first.

Before changes, take a PostgreSQL custom-format backup with `pg_dump` through approved secret handling and back up the matching private file directory. Protect both backups with approved encryption/access controls. The local integration test uses real `pg_dump`/`pg_restore` into a separate database and verifies accepted records, revisions, outbox and queue state; it also verifies abrupt database restart recovery. It does not prove hosted point-in-time recovery, encrypted off-site backups or recovery-time objectives.

Restore into an isolated database, apply the intended runtime grants and reconcile the deletion ledger before exposing restored objects. Use the file backup from the matching snapshot window. Review queued effects before worker restart; no provider effect should be replayed blindly. Retained backups may contain deleted content until the approved backup expiry. Production retention, deletion obligations and residency remain explicit policy decisions.
