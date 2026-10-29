# Durable worker boundary

No worker process or background timer is started by this scaffold. Future worker entry points will run approved provider operations, reconciliation, projections, archive jobs, and automation through the selected durable job system.

Workers must revalidate current authority, use leases/checkpoints and bounded retries, publish truthful outcomes, and close resources on shutdown. Replayed app-owned events deduplicate by operation/event identity. An uncertain mail send requires reconciliation before another attempt.

Keep persistent workers separate from the HTTP lifecycle and frontend hosting. Add a worker command only when its queue, handlers, operational health, failure tests, and deployment lifecycle are implemented.
