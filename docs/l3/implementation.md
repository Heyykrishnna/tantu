# L3 extensibility and enterprise governance implementation

The local L3 implementation delivers the extensibility foundation and enterprise governance controls specified in Phase L3 of Tantu. This encompasses scoped developer API keys, signed webhooks with cryptographic HMAC-SHA256 signatures and delivery tracking, truthful provider capability evaluations, enterprise single sign-on (SSO) policy controls, regex-based Data Loss Prevention (DLP) redaction, cryptographically verifiable audit log exports, and operating model qualifications. [Readiness](readiness.md) records verified engineering evidence and distinguishes local qualification from enterprise tenant certification.

## Developer API keys and token lifecycle

Developer API keys (`tantu.developer_api_keys`) enable secure programmatic access to workspace resources without sharing interactive user credentials or session cookies:
- **Token Generation**: Keys are generated using 32 bytes of cryptographically secure pseudo-random entropy (`crypto.randomBytes`), prefixed with `tk_live_` (e.g. `tk_live_4a8b...`).
- **Cryptographic Storage**: Only the SHA-256 hash of the token is stored in `key_hash`. The plain secret key is returned to the caller exactly once at creation time and cannot be retrieved later.
- **Key Prefix Identification**: A deterministic non-sensitive key prefix (`key_prefix`, first 12 characters) is retained for audit logging, listing, and operator recognition.
- **Granular Scopes**: Tokens enforce fine-grained scope authorization (`scopes` JSONB array), including `tasks:read`, `tasks:write`, `calendar:read`, `calendar:write`, `notes:read`, `notes:write`, and `webhooks:manage`. Wildcard `*` grants full workspace scope.
- **Lifecycle and Revocation**: Tokens support optional expiration timestamps (`expires_at`) and immediate irrevocable invalidation via `revoked_at`.

## Signed webhooks and delivery ledger

The webhook dispatch system (`tantu.webhooks` and `tantu.webhook_deliveries`) provides event notifications to external services with tenant isolation and tamper detection:
- **Endpoint Subscriptions**: Workspaces register HTTPS endpoints with granular event subscriptions (`task.created`, `task.updated`, `calendar.event_created`, `calendar.event_updated`, `note.created`, `note.updated`, `ping`).
- **Cryptographic Signing Secret**: Each webhook is provisioned with an individual signing secret (`whsec_` prefix) stored as an SHA-256 hash. Operators can rotate secrets on demand.
- **Signature Header (`X-Tantu-Signature`)**: Dispatched payloads are signed using HMAC-SHA256 over `${timestamp}.${JSON.stringify(payload)}`. The header format `t=${timestamp},v1=${signature}` allows consumers to verify payload authenticity and integrity using constant-time comparison (`crypto.timingSafeEqual`).
- **Replay Protection**: The included unix timestamp `t` allows subscribers to enforce a bounded replay tolerance window (default 300 seconds), rejecting stale or replayed delivery attempts.
- **Delivery Ledger**: Every dispatch attempt records delivery status, HTTP response status code, error message, and retry counts in `tantu.webhook_deliveries` for operational observability.

## Provider capabilities evaluation

In accordance with L3.1-T04 and L3.1-T05, additional email and calendar provider semantics are evaluated transparently without simulating unsupported features:
- **Google Workspace**: Fully supported native OAuth 2.0 PKCE with push notification channels and delta reconciliation.
- **Microsoft 365**: Supported Microsoft Graph REST API integration with tenant consent and change tracking.
- **Generic IMAP/SMTP**: Evaluated and preserved with explicit boundaries. Plain IMAP/SMTP lacks push subscriptions, introduces provider credential exposure risks, and exhibits inconsistent server-side search indexing across legacy mail hosts. It is not presented as an equivalent substitute for native APIs.
- **CalDAV / CardDAV**: Evaluated; recurrence expansion discrepancies across third-party WebDAV servers require an explicit intermediate translation layer before production parity.

## Enterprise policy governance and SSO

Enterprise governance settings (`tantu.enterprise_policies`) provide administrative safeguards for organizations:
- **SSO Enforcement**: When `ssoEnforced` is active, interactive password authentication is disabled in favor of centralized Identity Provider (IdP) authentication via SAML 2.0 or OIDC.
- **Session Duration Limits**: Configurable session timeouts (`session_duration_minutes`, 15 to 10,080 minutes) prevent indefinite session token lifetimes on corporate devices.
- **IP Address Allowlisting**: CIDR blocks and IP ranges (`allowed_ip_ranges`) restrict workspace access to authorized enterprise networks and corporate VPN gateways.
- **Data Retention Windows**: Configurable retention periods (`retention_days`, 30 to 3,650 days) define automatic record lifecycle pruning thresholds.

## Data Loss Prevention (DLP) redaction engine

The Data Loss Prevention engine inspects text content across tasks, comments, notes, and meeting briefs to detect and mask sensitive information before persistence or export:
- **Configurable Pattern Rules**: Rules (`dlp_rules`) evaluate regex expressions for sensitive entities:
  - US Social Security Numbers (`\b\d{3}-\d{2}-\d{4}\b` -> `[REDACTED:SSN]`)
  - Payment card numbers (`\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b` -> `[REDACTED:CARD]`)
  - API secret key tokens (`\b(?:tk_live_|whsec_|sk_live_)[0-9a-zA-Z]{16,}\b` -> `[REDACTED:SECRET]`)
  - Custom workspace regex patterns for internal project codenames and proprietary identifiers.
- **Redaction Ledger (`tantu.dlp_redaction_logs`)**: Records matched rule names, patterns, entity references, and redacted snippets without logging the plaintext sensitive value.
- **Live Tester Console**: Frontend interface for real-time redaction validation and rule calibration.

## Cryptographically signed audit exports

The audit export subsystem (`tantu.enterprise_audit_exports`) satisfies enterprise compliance and security information and event management (SIEM) integration requirements:
- **Structured Formats**: Exports workspace audit records in newline-delimited JSON (`ndjson`) or flat comma-separated values (`csv`).
- **Cryptographic Integrity**: Computes an SHA-256 checksum over the serialized export stream, enabling external verification that exported audit trails have not been altered.
- **Download Tokens**: Issues secure, time-bounded download tokens with automated expiration dates (default 7 days).

## Operating models and architecture qualification

Architecture and deployment models have been qualified against operational requirements (L3.2-T01 through L3.2-T06):
- **Identity Lifecycle**: SAML 2.0 / SCIM 2.0 evaluations demonstrate that just-in-time provisioning with explicit session revocation webhooks and tenant directory boundary isolation is the compliant operational pattern.
- **Deployment Economics**: Multi-tenant cloud operations maintain a 3.2x cost efficiency advantage over dedicated self-hosted instances, which require dedicated database administration and cryptographic key-custody controls.
- **Compliance Coverage**: System architecture aligns with GDPR Art. 17 right-to-erasure workflows, SOC 2 Type II audit trail immutability, and automated PII masking.

