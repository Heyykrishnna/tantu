# Platform boundaries

The database adapter implements bounded PostgreSQL pooling, scoped transactions, startup role checks and ordered migrations. Canonical record/file tables enforce row security. pg-boss queues live behind the worker boundary; file services provide the local private filesystem and bounded scanner adapters.

Google and Microsoft provider directories remain reserved. They contain no enabled client, credential store or live synchronization. Private S3-compatible storage, managed key services, external tracing and production federation retain their separate deployment/security qualification conditions.

Domain modules own policies and operation identity; adapters translate storage/protocol failures. Helpers never expose credentials, raw provider traces or content through HTTP/logs. The current logger records correlated failure/status metadata, while database audit triggers retain only identifiers, types and timestamps. Audit/job queries apply current workspace and record access.

See [module ownership](../modules/README.md), [workers](../workers/README.md), [implementation](../../../docs/l1a/implementation.md) and [operations](../../../docs/l1a/operations.md) for current behavior and operating limits.
