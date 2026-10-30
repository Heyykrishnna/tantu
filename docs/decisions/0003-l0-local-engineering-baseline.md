# L0 local engineering baseline

Date: 30 October 2026. Status: Adopted for the project owner’s local-only qualification scope. Full G0 and production availability are conditional on the open items in the readiness record.

## Backend, persistence, and jobs

Retain one TypeScript/Fastify backend and the TypeScript/Next.js frontend. Actual PostgreSQL permissioned-query, transactional recovery, and queue experiments support this integration-heavy baseline. A Rust implementation was not benchmarked and no language-performance superiority is claimed. Avoid implementing the same domains twice.

Use PostgreSQL, SQL migrations, `pg`, a transactional outbox, and pg-boss 12.30.0 behind focused adapters. The qualification harness proves monotonic application-side attempt fencing, atomic app/job rollback, concurrent claims, revocation filtering, and restart recovery. Later pg-boss releases tested here had broken strict declarations; an upgrade must pass the same acceptance cases without suppressing types.

## Contracts and module ownership

The nine ownership boundaries in the backend module guide remain authoritative. The repository maintainer is the accountable engineering owner for this local baseline; product/security/platform role names are responsibilities, not invented hires or a staffed delivery estimate.

OpenAPI 3.1 and strict JSON Schema 2020-12 supply the versioned interface draft. Required operation/version identity, explicit external review, current scope, bounded search, coverage, and stable failures are contract inputs. Only process liveness is registered in the application; validation of a draft schema is not implementation of an endpoint.

## Editing, collaboration, and calendar

Select Tiptap’s open-source core/ProseMirror model as the editor direction, Yjs for document merge/snapshot semantics, and Hocuspocus as the reference authenticated WebSocket host. Yjs concurrent replay, state-vector reconnect, and PostgreSQL snapshot persistence have local evidence. Permissions and structured fields remain transactional and cannot be granted by document content. The actual editor extensions, network host, revocation subscriptions, and production persistence adapter still require integration qualification in their implementation slice.

Tiptap core and the Hocuspocus open-source host have MIT licensing; paid platform capabilities/extensions must not be assumed included. Review selected extension/version licenses before installation. See [Tiptap’s licensing boundary](https://tiptap.dev/open-source-to-platform) and [Hocuspocus license](https://github.com/ueberdosis/hocuspocus/blob/main/LICENSE.md).

Use FullCalendar Standard for calendar presentation and a separate accessible project timeline implementation unless Premium is explicitly licensed. FullCalendar resource/timeline Premium capabilities are not silently included in Standard. See the [vendor license distinction](https://fullcalendar.io/license).

Use bounded civil recurrence generation plus explicit Temporal timezone conversion. Raw rrule TZID expansion drifted under the local host zone. The adapter therefore generates UTC-shaped civil fields and converts them with an explicit zone; multi-host-zone, DST, month-end, exception, and ambiguous/nonexistent-time cases are tested. It deliberately rejects ambiguous times pending a user/provider policy. Complete RFC/provider series editing, all-day behavior, and exception round trips remain L1 qualification.

## Search and archive

Start live search with PostgreSQL full-text search, GIN indexing, canonical access/tombstone checks, and bounded pages. The 100,000-record fixture is synthetic; multilingual relevance, typo tolerance, semantic search, and production ranking are not implied.

Keep MinLZ v1.2.0 in an isolated Go boundary. Inline/sidecar byte-oracle parity, integrity, record visibility, cancellation, limits, race checks, bounded fuzzing, and synthetic measurements support the local archive design. Production enablement remains disabled until corpus suitability, trusted object identity, authenticated encryption/key management, quotas, deletion/compaction, and current-access enforcement pass their separate gate.

## Identity, hosting, and observability

Use OIDC authorization-code/PKCE semantics with Keycloak as the reference identity provider, separate from delegated Google/Microsoft mail/calendar grants. No identity tenant is provisioned in local L0. A provider substitution must preserve issuer/audience validation, sessions, revocation, tenant binding, and consent boundaries.

The deployment topology is a supported Linux container host, separate HTTP/worker processes, PostgreSQL, private S3-compatible storage, and a WebSocket collaboration host. Managed secret/key services, backups, a production region, and actual accounts require owner/platform/security approval before real-data ingestion. Local-only authorization does not justify inventing a residency or contractual decision.

Use content-free correlated logs/metrics with OpenTelemetry as the instrumentation direction. Alert on queue age, provider uncertainty, reconciliation lag, authorization failures, quota exhaustion, and archive resource use. Numerical targets remain measured qualification objectives; no production SLO is certified by local tests.

## Tooling and known exception

Node.js 24, npm 11, strict TypeScript, Node tests, Playwright, PostgreSQL tools, and Go supply the reproducible baseline. Root setup includes the separate discovery lockfile. CI uses immutable official action revisions and the same commands, with no provider credentials or production access.

Backend/discovery use ESLint 10. Frontend React and JSX accessibility plugins currently declare compatibility only through ESLint 9, which npm reports out of support. Retain those configured checks and record the compatibility exception; do not force incompatible peers, drop accessibility rules, or disable checks. A supported frontend lint path or explicitly approved maintenance exception is required before full G0 closure/release approval.
