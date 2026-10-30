# Durable workers

The separate worker process runs pg-boss canonical-event checkpoints and quarantined file scans, plus provider-read reconciliation pages. It checks current scope at execution, uses bounded retries/backoff, monotonic attempt/token fences and queue-row locks, and commits database effects with job acknowledgement. Internal jobs have a 60-second expiration and a dead-letter path; uncertain external sends are handled separately and are never blindly replayed by these retries.

Start development workers with `npm run worker` from the backend package, or compiled workers with `npm run start:worker`. Migration operators initialize queues; runtime instances disable schema migration. HTTP never silently starts a consumer.

The local worker handles one job at a time per process. Signal shutdown stops new claims, lets bounded current work finish, then closes queue/database resources. File processing uses the private shared directory and a trusted ClamAV endpoint. An outage keeps data quarantined/unavailable. Scope revocation discards unauthorized queued processing rather than using stale authority.

Authorized workspace operations expose bounded metadata and permit cancellation of pending jobs or retry of failed internal work. A separate operator-only cleanup command reconciles deleted-ancestor files, revoked deletion jobs and aged crash orphans. See the [runbook](../../../docs/l1a/operations.md). Provider reads use the `provider-sync` queue with atomic projection checkpoints and bounded retry windows. The current send path commits uncertainty before external mutation and supplies evidence-only reconciliation; see the [connected-work runbook](../../../docs/l1b/setup.md).
