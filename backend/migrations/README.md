# Database migrations

No schema or database connection is introduced by the boilerplate. PostgreSQL and a single authoritative migration history remain the planned persistence approach.

Select the migration tool before adding the first migration. Each migration must define ordering, constraints, tenant ownership, data-integrity expectations, and a reviewed recovery strategy. Test changes against an isolated real or compatible database.

Canonical records, provider mappings, outbox events, job state, and deletion ledgers must be designed as implementation slices. Do not add speculative tables or claim durability before transactional/crash-recovery tests pass.
