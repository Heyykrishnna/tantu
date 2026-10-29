# Platform boundaries

These reserved adapter locations have no runtime implementation or configured external services yet.

| Boundary | Planned role | Conditions before implementation |
| --- | --- | --- |
| `database` | PostgreSQL connections, transactions, canonical constraints, outbox, and migration execution. | Select SQL access/migration tooling, tenant policy, recovery strategy, and isolated database fixtures. |
| `jobs` | Durable leases, retries, checkpoints, cancellation, and bounded concurrency. | Qualify the chosen PostgreSQL-backed job system and crash/replay behavior. |
| `storage` | Private attachments, quarantine, exports, immutable archives, and signed access. | Select object store, encryption, file safety, quotas, and retention/deletion policies. |
| `providers/google` | Delegated Gmail and Google Calendar transport and capability mappings. | Approve scopes, consent, test accounts, renewal/reconciliation, and provider launch prerequisites. |
| `providers/microsoft` | Delegated Microsoft Graph mail/calendar transport and capability mappings. | Qualify folder/event semantics, consent, delta cursors, throttling, and public access prerequisites. |

Domain modules retain policy ownership. Adapters translate protocols and failures without granting access, inventing provider support, or independently implementing business rules. Never expose provider traces or tokens through HTTP errors or operational logs.

The running scaffold uses Fastify’s logger for content-free operational events. Full telemetry, tracing, audit storage, metrics, and infrastructure health depend on the relevant implementation slices.
