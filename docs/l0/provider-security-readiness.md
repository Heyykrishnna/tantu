# L0 provider and security readiness

Baseline: 30 October 2026. Scope: local synthetic validation, as selected by the project owner. This is the capability, consent, threat, and launch-prerequisite record. No cloud project, identity tenant, mailbox, calendar, OAuth grant, provider verification, or third-party security assessment was created or completed.

## Delegated capability and scope baseline

| Provider surface | Proposed minimum launch grant | Capability boundary | Readiness prerequisite |
| --- | --- | --- | --- |
| Gmail mail | `https://www.googleapis.com/auth/gmail.modify` | Mail reading, drafts, sending, label-based organization, and history. No immediate permanent deletion. | Register an OAuth app, verify requested scopes and approved test users, and prepare restricted-scope review/assessment where required. |
| Google Calendar | `calendar.events` and `calendar.calendarlist.readonly` under the Google API scope prefix | Events on calendars the user can access and calendar selection; actual per-calendar rights still constrain writes. | Register redirect URIs and review consent; qualify writable shared calendars, invitations, exceptions, and sync-token recovery. |
| Microsoft mail | Delegated `Mail.ReadWrite`, `Mail.Send`, and `offline_access` | Mail mutation does not itself grant sending; labels and folders are not interchangeable. | Register an application/account audience, review tenant consent policies, and qualify both supported account classes. |
| Microsoft calendar | Delegated `Calendars.ReadWrite` and `offline_access` | Events and allowed calendars, with provider-specific sharing/attendee behavior. | Confirm delegated account capabilities and subscription/delta limitations with approved test accounts. |

Sign-in uses OIDC identity claims and application sessions. Mail/calendar access is a separate delegated grant. Request `openid`/`profile` only where identity is actually used; do not treat a mail token, email address, or requested workspace ID as application authority.

Gmail modification is a restricted scope; production handling can require verification and a security assessment. Do not request the full `mail.google.com` scope or Gmail settings/delegation scopes for the baseline. L1 rules are app-owned; provider filter-management capabilities require a separate scope review. See [Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted-scope requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

Calendar scope URLs use `https://www.googleapis.com/auth/` as prefix. Broader calendar/ACL access is excluded. Validate exact supported operations during implementation using the [Calendar scope reference](https://developers.google.com/workspace/calendar/api/auth). Microsoft permissions remain delegated; application-wide mailbox permissions and domain-wide delegation are excluded. See [Graph permission definitions](https://learn.microsoft.com/en-us/graph/permissions-reference) and [least-privilege guidance](https://learn.microsoft.com/en-us/graph/permissions-overview).

## Provider reconciliation contracts

Gmail labels and Microsoft folders retain provider/account-scoped stable mappings. Cursor updates and projected rows commit together. Invalid Gmail history and Google Calendar sync tokens trigger a scoped rebuild, while Graph delta-link invalidation follows its returned resource error. Preserve app-owned tasks/pages and deletion ledgers during provider rebuilds.

Notifications are hints, not durable business events. Validate source authenticity, route to a stored connection, deduplicate hints, renew watches/subscriptions, and reconcile periodically. Google mail uses an approved Pub/Sub topic; Microsoft notification challenges/client state do not authorize arbitrary workspace operations. Never log tokens, message content, recipients, or provider payloads.

Reviewed drafts bind account, recipient and attachment versions to a durable send intent. Timeout means Unknown until reconciliation establishes an outcome. API acceptance is not recipient delivery. Calendar changes recheck preview versions, conflicts, scope, locked time, and attendee effects immediately before execution.

## Threat and control register

| Threat | Required control | L0 evidence or implementation gate |
| --- | --- | --- |
| Cross-tenant ID substitution | Trusted session-to-tenant binding, scoped queries, constraints, and defense-in-depth RLS. | Synthetic policy fixtures and isolated PostgreSQL tests; full HTTP auth qualification in L1a. |
| Administrator/private-source leakage | Content grants separate from administrative role; source links do not grant mailbox access. | Policy/relationship/snapshot fixtures. |
| Revoked or deleted data through caches | Canonical access/tombstone checks before reads, counts, exports, subscriptions, and queued work. | Revocation fixtures and PostgreSQL search filtering. |
| Guest graph/backlink leakage | Authorize both relationship endpoints and suppress hidden metadata. | Synthetic endpoint/grant fixtures. |
| OAuth/session hijacking | Authorization-code flow, state, PKCE S256, exact redirect allowlist, issuer/audience checks, secure HttpOnly host-only cookies, and CSRF defenses. | Protocol baseline; real OIDC/callback/session tests required before enabling accounts. |
| Token theft or key misuse | Encrypted token envelopes, managed key storage/rotation, scoped service identity, and separate environments. | Design decision only; no real token storage or keys in L0. |
| Malicious mail/editor content | Sanitize structured content and HTML; safe link/embed policies and isolated previews. | Adversarial synthetic fixture inventory; implementation and browser/XSS tests in the relevant slice. |
| SSRF and malicious uploads | Approved URL schemes, DNS/IP policy, redirect revalidation, timeout/size limits, quarantine, scanning, and private downloads. | No outbound fetch/upload capability is enabled by the prototype. |
| Stale previews or send replay | Record versions, operation identity, reviewed intent, current access, and Unknown reconciliation. | Contract/state-machine tests; provider contract tests remain future gates. |
| Job loss or duplicate effects | Transactional outbox, durable job claims, operation deduplication, retry/lease limits, and recovery. | Real PostgreSQL/pg-boss qualification. |
| Corrupt or mismatched archives | Trusted immutable identity, stream/sidecar integrity, exact-byte oracle, current ACL/tombstones, and bounded work. | Pinned Go MinLZ spike; production archives remain disabled. |
| AI source instructions | Treat retrieved content as data, constrain structured actions, apply current grants, and require review. | AI disabled; evaluation required before L2 enablement. |
| Diagnostic/data-retention leakage | Content-free events, approved retention/deletion, quotas, and deletion-ledger replay on restore. | Local fixtures deleted after execution; no customer data collected. |

## Identity, deployment, and policy defaults

The local qualification target is loopback-only processes and a newly initialized private PostgreSQL cluster. No existing database is contacted. For L1 design, choose standard OIDC with Keycloak as the reference identity implementation; it supports authorization-code/PKCE flows but requires its own deployment/patching responsibilities. A managed OIDC provider is a substitution option after terms, cost, region, and account policy review. See [Keycloak OIDC documentation](https://www.keycloak.org/securing-apps/oidc-layers).

The deployment design uses a supported Linux container host, separate HTTP/worker processes, PostgreSQL, private S3-compatible storage, a WebSocket collaboration host, and managed secrets/key services. L0 runs only locally. A production region, subprocessor list, hosting account, backup service, and real identity tenant must be explicitly approved before ingesting real data; no region is inferred from the developer’s location.

Pilot policy defaults retain the PRD proposals: 30-day recoverable trash, backup expiry within 35 days, 24-hour export links, and 30-day content-free logs. These are engineering defaults awaiting contractual/jurisdiction review before production. Deletion blocks discovery promptly and is replayed after restore, then removed through active-store cleanup and archive compaction. No end-to-end encryption, zero-retention AI, or legal compliance claim is made.

## External readiness ledger

| Item | Status | Responsible role | Release impact |
| --- | --- | --- | --- |
| Google project, exact scope review, redirect/consent setup, approved test users | Not started; external account access excluded from local L0. | Project owner / Integration | Blocks real-provider qualification, not synthetic local execution. |
| Google public verification and applicable restricted-data assessment | Not requested or approved. | Project owner / Security | Blocks public availability of the affected provider capability. |
| Microsoft registration, account audience, tenant consent, test users | Not started. | Project owner / Integration | Blocks real Graph contract journeys. |
| Production identity, host, region, keys, backup and retention review | Decision required before real-data ingestion. | Project owner / Platform / Security | Blocks production ingestion and deployment. |
| Participant usability and human accessibility review | Not performed; browser automation is engineering evidence only. | Product / Design | Required for pilot qualification. |

The project owner’s local-only instruction permits technical experiments and documented defaults. It does not substitute for provider, legal, or production approval. The discovery policy model is a test specification and is never used as production authentication.
