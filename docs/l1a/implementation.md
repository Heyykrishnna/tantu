# L1A implementation and qualification

Scope: the next foundation stage, L1A, selected by the project owner. L1B provider work and L1C launch integration remain later stages. Production identity, hosting, region, retention and provider approvals retain their L0 conditions.

## Persistence

PostgreSQL 16+ stores canonical records, workspace membership, sessions, invitations, operation results, minimal outbox events, job fences and file metadata. Ordered SQL migrations run under a separate migration owner with advisory locking, transactions and immutable SHA-256 checksums. The HTTP service uses a non-superuser role without `BYPASSRLS`; startup rejects privileged credentials. Record and file tables force row security; the access helper uses private access metadata maintained by a trigger, never document content.

Run migrations explicitly, not during an HTTP request. Apply `backend/migrations/runtime-grants.sql` after creating the `tantu_runtime` role with an externally provisioned password. The deployment owns credentials and transport security. Do not grant runtime ownership of canonical tables or membership in the migration role.

Migration recovery uses forward repair. Take a database backup before migration; never edit an applied migration or run a destructive down migration against accepted work. Local isolated tests prove transactional rollback and repeatable migration application; production backup encryption, expiry and off-site recovery require deployment qualification.

## Evidence

Implementation and acceptance evidence are added as each vertical slice is completed. A passing source check alone does not certify G1 or public launch.

## Local identity

The standalone local installation uses explicit password sign-in, salted scrypt (`N=32768`, `r=8`, `p=1`), eight-hour random server-side sessions, hashed session/CSRF secrets, durable sign-in limits, same-origin mutation checks and session rotation. HTTPS enables Secure cookies; production refuses an HTTP application origin. Initial account creation is an operator-only, empty-installation bootstrap. Invitations are bounded, hashed, single-use, expire in 72 hours and require an existing invited account to authenticate before acceptance. Invitations are copied by the workspace manager; no email is sent automatically.

This local authentication implementation is an explicit extension of the L0 architecture, allowing the selected local delivery to run without a provisioned identity provider. Keycloak/OIDC remains the production federation direction and has not been connected or falsely represented by a development token bypass. Configure a reviewed identity deployment, recovery, MFA and credential lifecycle before production use. Owner removal is deliberately refused; ownership transfer requires a separate reviewed workflow.

Each protected request resolves the current session and workspace membership. Database record policies resolve live grants and parent visibility, so removed members and deleted ancestors cannot keep reading through old IDs. Workspace administrators receive no automatic access to private records. There is no real-time subscription transport in this slice; request polling always rechecks access.

## Canonical work, pages and jobs

Task/page creation, bounded keyset listing, reading, versioned editing, soft deletion and authorized version metadata are implemented under workspace routes. Task fields include priority, deadline, estimate and completion; pages use a bounded ProseMirror-compatible text/paragraph/heading document subset. Rich extensions and network collaboration are later integration work. Page parents are immutable after creation, preventing subtree cycles and implicit permission changes. A deleted ancestor hides its entire subtree.

Mutations take a UUID operation key and updates take the expected record version. A transaction-scoped operation lock serializes replay; a stable payload fingerprint rejects changed reuse. The canonical record, durable result, revision, minimal outbox event and pg-boss job commit together. Replays recheck membership and current record access. Events contain IDs, type, versions and correlation only, never body/title content.

The migration operator initializes pg-boss queues; the runtime starts with queue migrations disabled. Jobs have bounded retries/backoff, 60-second expiration, one-at-a-time processing, durable attempt/token fences, queue-row locking and atomic database effect/acknowledgement. A failed effect rolls back before retry. Current membership and access are checked at execution; unavailable records are discarded safely. This local event consumer advances a durable publication checkpoint; no external message broker, provider write or send is implied.

## Files and operations

The local storage adapter writes random UUID objects into a private 0700 directory, uses exclusive 0600 files, fsyncs accepted bytes and rejects symlink reads. PostgreSQL metadata and a scan job commit together; failed transactions remove their own newly written object. Uploads allow 5 MiB, explicit base64, bounded names and an allowlist; PDF uploads require the PDF signature. Workspace allocation counters enforce 100 MiB/1,000 files across private and shared records. Canonical records are capped at 10,000 per workspace including tombstones.

Every file begins quarantined. The worker uses the ClamAV INSTREAM protocol with a bounded reply and 15-second deadline. Scanner errors produce `unavailable`, never `clean`; managers with edit access can request a rescan. Clean downloads require a current session, live record access and a user/file/version-bound 60-second HMAC token. Content is always served as a download with `nosniff`, a sandbox policy and no-store. No URL fetch, HTML preview or active embed capability is exposed.

Deletion immediately revokes access and appends a deletion ledger; an idempotent job removes bytes and releases allocation only once. Jobs that lose their actor's access stop safely. Operations must reconcile deletion-ledger entries that remain after membership/ancestor revocation, and remove unreferenced crash-orphan objects before retaining real data. Backups may contain removed bytes until the deployment's approved expiry; there is no claim of immediate removal from backups.

Audit triggers record session, membership and file-state metadata without bodies, credentials, filenames or recipient lists. Authorized activity, audit and bounded job-inspection routes expose current-access-scoped metadata; managers can cancel pending jobs or retry failed internal work. Separate HTTP/worker processes use the same validated configuration. Real ClamAV signature freshness/isolation and private S3/managed-key deployment are not qualified by the protocol fixture: neither ClamAV binaries nor a running Docker engine are available in this workspace. Keep production ingestion disabled until that evidence exists.
