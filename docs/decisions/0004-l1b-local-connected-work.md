# L1B local connected-work decisions

Status: adopted for the local core; production and full phase acceptance remain conditional. This refines the [L0 engineering direction](0003-l0-local-engineering-baseline.md) without changing the original PRD/roadmap.

Keep one PostgreSQL-backed modular application and a separate durable worker. New project, scheduling, provider and knowledge modules reuse live scope, canonical IDs, optimistic versions and durable operation receipts. Provider projections never become authoritative task/page stores. Shared unknown-value guards live in the platform boundary.

Use the pinned Temporal polyfill and rrule versions already qualified in discovery. Promote one civil recurrence adapter into the backend and import it from discovery. Expose only the bounded supported rule subset and reject advanced selectors/additional rules instead of performing unbounded expansion.

Use oauth4webapi for delegated authorization-code/PKCE and OIDC protocol validation. The attempted higher-level openid-client release had incompatible published declarations under the project’s exact optional-property checks. The protocol client preserves strict checking without patched dependency files or compiler suppression. ID-token signatures are explicitly validated against provider keys, in addition to issuer/audience/nonce and UserInfo subject checks.

Use a separate AES-256-GCM token key with resource-bound authenticated data. Begin external send uncertainty in a committed transaction before any remote mutation. Ordinary pg-boss retry is suitable for read reconciliation; it must not blindly repeat uncertain external sends. Current synchronous reviewed-send execution is durable/status-tracked but does not claim a fully autonomous external-effect worker.

Keep the safe native page editor and add actual Yjs text convergence over authenticated HTTP polling. This is a deliberately narrower initial editor/transport than the Tiptap/Hocuspocus direction. It reuses the already qualified CRDT, keeps paragraph/heading serialization compatible, and supplies explicit access checks and offline recovery. Rich extensions and a production WebSocket host remain unimplemented acceptance work. Similarly, native calendar/form views avoid adding FullCalendar before the complete drag/overlay requirements are delivered; no Premium capability is implied.

Use Next’s supported webpack production builder with Tailwind’s matching PostCSS adapter after this environment denied Turbopack CSS-worker port binding. Both compile the same component classNames and self-hosted fonts. Keep global CSS restricted to Tailwind import/config directives. Browser validation must inspect rendered styling; successful JavaScript compilation alone is insufficient.

The [readiness register](../l1b/readiness.md) is authoritative for remaining work. Local implementation and synthetic recovery evidence do not close G1/G2, public provider approval, security review or human accessibility acceptance.
