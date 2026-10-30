# L1A implementation and qualification

Scope: the next foundation stage, L1A, selected by the project owner. L1B provider work and L1C launch integration remain later stages. Production identity, hosting, region, retention and provider approvals retain their L0 conditions.

## Persistence

PostgreSQL 16+ stores canonical records, workspace membership, sessions, invitations, operation results, minimal outbox events, job fences and file metadata. Ordered SQL migrations run under a separate migration owner with advisory locking, transactions and immutable SHA-256 checksums. The HTTP service uses a non-superuser role without `BYPASSRLS`; startup rejects privileged credentials. Record and file tables force row security; the access helper uses private access metadata maintained by a trigger, never document content.

Run migrations explicitly, not during an HTTP request. Apply `backend/migrations/runtime-grants.sql` after creating the `tantu_runtime` role with an externally provisioned password. The deployment owns credentials and transport security. Do not grant runtime ownership of canonical tables or membership in the migration role.

Migration recovery uses forward repair. Take a database backup before migration; never edit an applied migration or run a destructive down migration against accepted work. Local isolated tests prove transactional rollback and repeatable migration application; production backup encryption, expiry and off-site recovery require deployment qualification.

## Evidence

Implementation and acceptance evidence are added as each vertical slice is completed. A passing source check alone does not certify G1 or public launch.
