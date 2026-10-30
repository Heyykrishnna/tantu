# PostgreSQL, search, and durable-job qualification

Date: 30 October 2026. Scope: a local synthetic L0 experiment. The harness initializes a new private PostgreSQL cluster, enables fsync, disables TCP listening, uses a private Unix socket, and removes its own cluster on completion. It never reads connection settings for an existing database.

## Selected persistence and job baseline

Adopt PostgreSQL as the canonical store, SQL migrations as the authoritative schema history, and transactional outbox publication. Use the TypeScript `pg` driver behind focused domain adapters. Start live search with PostgreSQL full-text search and a GIN index; reconsider a separate engine only after measured relevance or scale demands it.

Pin pg-boss 12.30.0 for the qualified queue API. Releases 12.35.0, 12.37.0, and 12.38.0 passed representative runtime behavior but exposed missing `ResolvedConstructorOptions` declarations under strict TypeScript. No library-type checks were disabled or ambient replacement types invented. The selected release passes strict compilation and the required SQL experiments.

The older queue API settles by ID. Application-side fencing is therefore explicit: persist a monotonic attempt and random claim token, reject stale attempts and duplicate completion, and commit the application completion marker together with queue completion. Queue retry identity is not an authorization grant or a guarantee of exactly-once external effects. Actual L1 adapters must preserve this behavior, current permissions, and versioned domain writes.

## Tested behaviors

| Experiment | Acceptance evidence |
| --- | --- |
| Canonical access | A non-superuser, non-BYPASSRLS reader cannot discover foreign-tenant, private-admin, or ungranted guest records. Explicit guest grants do not become mailbox grants. |
| Current revocation/deletion | Membership revocation and tombstones affect subsequent reads immediately. |
| Duplicate operations | Concurrent identical operation keys return one canonical task and outbox event. A different payload digest conflicts. |
| Session termination | Terminating an uncommitted connection rolls back both task and outbox effects. |
| Provider checkpoint transaction | A failed page rolls back its projection; rebuilding a provider generation preserves app-owned tasks. |
| Queue transaction | Queue insertion through the same transaction rolls back with task/outbox state. |
| Concurrent workers | Two claimers process a 1,000-job synthetic workload without overlapping job IDs. |
| Retry fencing | An older attempt cannot reinstall its token or complete the new attempt; the current attempt completes once. |
| Search | A 100,000-record mixed-tenant/private fixture returns the independently expected authorized matches and bounded pages, while hiding private and foreign terms. |
| Abrupt server restart | Immediate stop and WAL recovery preserve acknowledged app-owned writes and queued work. |

The fixture SQL is disposable qualification code, not an application schema or a deployed authorization layer. Trusted tenant/actor settings are supplied by the test harness; production identity must bind those settings and use a restricted application role. The superuser fixture connection is used only for setup and controlled faults.

## Measurement method and limits

The generated report records PostgreSQL version, OS/architecture, fixture count, job count, queue round-trip time, seed duration, authorized match count, and the p95 of 30 local first-page searches. The independent expected match count is 566 for the fixed corpus. Durations include the scoped database transaction and are observations from this machine, not service-level promises.

The search fixture uses deterministic `simple` tokenization and synthetic terms. It does not prove typo tolerance, semantic retrieval, multilingual relevance, or a production ranking strategy. The corpus and local socket have different costs from provider mail, disk/object range reads, and a production network. All 14 PRD nonfunctional requirements retain their explicit launch qualification gates.

## Reproduction

Install discovery dependencies with the root setup command, ensure PostgreSQL 16+ command-line tools are available, and run:

```bash
npm --prefix discovery run test:postgres
```

Set `PG_BIN` to the PostgreSQL binary directory if those tools are not on PATH. Reports are generated under the ignored discovery artifacts folder. Failure must return a nonzero exit code and preserve diagnostics; do not point the harness at a user or production database.

See [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [full-text search](https://www.postgresql.org/docs/current/textsearch.html), and the [pg-boss job API](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md) for the underlying mechanisms. Verify API details against the pinned version rather than copying newer examples.
