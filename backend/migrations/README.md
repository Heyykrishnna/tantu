# Database migrations

Ordered SQL migrations are applied by the checksum-verifying runner under a separate migration owner. The runner takes an advisory lock and commits each migration atomically. Never edit an applied migration; add a forward repair with reviewed constraints and recovery behavior.

`001_foundation.sql` establishes canonical identity, memberships, sessions, records, grants/access metadata, operation results, outbox and file/job metadata. `002_revisions.sql` adds authorized revision history, operation row security and the insertion/tombstone access policy. `003_file_operations.sql` adds upload replay identity, allocation quotas, deletion ledger and content-free audit triggers.

`runtime-grants.sql` is an explicit operator-applied privilege manifest, not an ordered schema migration. It grants the pre-created `tantu_runtime` role only the required schema/table/function operations. The migration command separately initializes the pinned pg-boss schema and queues. Reapply reviewed grants after introducing new objects; never grant canonical table ownership or migration-role membership to runtime.

Run `npm run migrate` using the package-local ignored operator environment. Apply the runtime privilege manifest afterward. The [installation guide](../../docs/l1a/setup.md) and [operations runbook](../../docs/l1a/operations.md) describe roles, backups, forward repair and restoration. Integration tests use disposable real PostgreSQL, repeat migration application, verify least privilege, inject rollback failures and perform actual dump/restore and abrupt restart recovery.
