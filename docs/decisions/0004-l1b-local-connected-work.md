# L1B local connected-work decisions

Status: adopted for the local core; production and full phase acceptance remain conditional. This refines the [L0 engineering direction](0003-l0-local-engineering-baseline.md) without changing the original PRD/roadmap.

Keep one PostgreSQL-backed modular application and a separate durable worker. New project, scheduling, provider and knowledge modules reuse live scope, canonical IDs, optimistic versions and durable operation receipts. Provider projections never become authoritative task/page stores. Shared unknown-value guards live in the platform boundary.

Use the pinned Temporal polyfill and rrule versions already qualified in discovery. Promote one civil recurrence adapter into the backend and import it from discovery. Expose only the bounded supported rule subset and reject advanced selectors/additional rules instead of performing unbounded expansion.

Use oauth4webapi for delegated authorization-code/PKCE and OIDC protocol validation. The attempted higher-level openid-client release had incompatible published declarations under the project’s exact optional-property checks. The protocol client preserves strict checking without patched dependency files or compiler suppression. ID-token signatures are explicitly validated against provider keys, in addition to issuer/audience/nonce and UserInfo subject checks.

Use a separate AES-256-GCM token key with resource-bound authenticated data. Begin external send uncertainty in a committed transaction before any remote mutation. Ordinary pg-boss retry is suitable for read reconciliation; it must not blindly repeat uncertain external sends. Mail sends retain explicit reviewed execution. Calendar/mailbox effects now have a separate worker path using the same committed uncertainty principle.

Use bounded Tiptap/ProseMirror extensions over the existing Yjs text body: headings and four safe inline marks. The native text alternative, body revisions, merge semantics and authenticated HTTP transport remain compatible. The rich model is a validated projection of the same CRDT, with local Yjs undo; it does not create an independent rich store. HTTP polling/presence/recovery is the implemented transport for this local topology. Production WebSocket hosting is optional and would require separate operational qualification. Native calendar views now support preferences, overlays and drag/form review without introducing a Premium calendar dependency.

Use Next’s supported webpack production builder with Tailwind’s matching PostCSS adapter after this environment denied Turbopack CSS-worker port binding. Both compile the same component classNames and self-hosted fonts. Keep global CSS restricted to Tailwind import/config directives. Browser validation must inspect rendered styling; successful JavaScript compilation alone is insufficient.

The [readiness register](../l1b/readiness.md) is authoritative for remaining work. Local implementation and synthetic recovery evidence do not close G1/G2, public provider approval, security review or human accessibility acceptance.
