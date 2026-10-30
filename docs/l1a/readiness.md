# L1A readiness and evidence

Scope: the project owner selected **L1A foundation first**, retaining local validation and documented defaults. L1B connected providers/projects and L1C launch integration are outside this delivery. This record distinguishes implemented local behavior from the full G1/release decision.

## Delivered local foundation

| Part | Implemented behavior | Evidence |
| --- | --- | --- |
| Identity/access | Real password sign-in, bounded scrypt work, durable login limits, server-side expiry/revocation/CSRF, workspaces, one-use invitations, guest grants, current membership and ancestor policies. | Credential/unit tests, real PostgreSQL identity/RLS cases, guest/read-only/revocation/expiry browser journey. |
| Canonical persistence/jobs | Three ordered immutable migrations, least-privilege role verification, task/page IDs and fields, expected versions, replay fingerprints/results, revision metadata, atomic outbox/queue insertion, attempts/fences, cancellation/retry and checkpoints. | Concurrent replay/conflict tests, rollback injection, queue retry/current-access cases and runtime-role checks. |
| Application shell | Real API-backed task/page lists and details, nested-page parent identity, local paragraph/heading documents, draft/retry recovery, title search, history, workspace settings, light/dark tokens, responsive layout and native command palette. | Built-app browser checks through real HTTP/PostgreSQL; screenshots; inert script text; mobile overflow and keyboard checks. |
| Files/operations | Private filesystem storage, limits and workspace allocation, quarantine states, ClamAV protocol adapter, user/version-bound downloads with current ACL, audit/activity/jobs and operator deletion/orphan reconciliation. | Protocol fixture and outage checks, signed-access/deletion tests, private-ancestor/revoked cleanup and dry-run/idempotency tests. |
| Recovery/contracts | Actual PostgreSQL dump/restore, accepted-write/outbox/queue restart recovery, generated request/canonical-response OpenAPI and frontend type drift checks, CI updates and reproducible aggregate command. | Recovery integration test, `contracts:check`, package checks/builds and synthetic local reports. |

Run from the root:

```bash
npm run check:l1a
```

The aggregate stores exact revision, dirty-tree state, commands, exit results and logs under ignored artifacts. It runs source checks, unit tests, builds, real database integration, three browser journeys, contract sync, all npm audits and tracked-document/ignore validation. `npm run check:l0` preserves the earlier archive/search/collaboration/recurrence experiments; CI runs the L0 suite plus L1A integration/browser/contracts. No remote CI result is implied until observed on GitHub.

The database test performs actual `pg_dump` and `pg_restore` into a separate database and checks accepted records, revisions, events and pending queue work. Abrupt restart tests intentionally log a content-free connection-loss event before verifying persisted data with a new pool. This is expected fault injection, not a hidden production error.

## Full G1 remains conditional

The local application implementation is reviewable and usable, but it does not unconditionally pass the original foundation/release gate. Keep these conditions visible:

- A real isolated ClamAV engine with current signatures must pass malware/outage qualification. Only the actual wire protocol and fail-closed state behavior were tested here; ClamAV binaries and a running Docker engine are absent.
- The local private filesystem must be replaced or qualified for the selected durable production storage, encryption, managed keys, backup expiry and cross-process topology. Operator reconciliation is implemented and tested; scheduling/monitoring and contractual retention approval require the deployment owner.
- Production identity federation/recovery/MFA, host, region and operating responsibility need review. The standalone local password path is implemented; it does not pretend that Keycloak/OIDC has been provisioned.
- The inherited frontend ESLint 9 support issue remains recorded from L0. Current lint/accessibility checks are retained; a supported compatible stack or explicit maintenance exception is still required for release.
- Automated keyboard/mobile checks and visual inspection do not replace participant acceptance, manual screen-reader testing, security review or production load testing.

The editor deliberately exposes a safe paragraph/heading subset. Real-time collaborative transport, rich extensions and comments are not enabled; no unavailable control is presented as functional. Page parents are immutable; moving/reparenting subtrees and owner transfer require separate reviewed operations. Accepted file/record quotas are local safety bounds, not measured commercial plan limits.

These conditions are not waived by the owner's choice to use local defaults. Real provider accounts/public consent remain later provider-stage gates. The source PRD/roadmap are preserved; local phase plans record implementation evidence and unchecked approval conditions honestly.
