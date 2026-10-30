# L3 local qualification and acceptance

Status: **local implementation and automated qualification gates passed; enterprise production certification remains open**. The delivery completes local engineering qualification for developer APIs, signed webhooks, provider capability evaluations, enterprise policy controls, DLP redaction, and cryptographically verified audit exports. Enterprise identity provider certifications (e.g. Okta OIN, Microsoft Entra Gallery) and on-premises air-gapped distribution packaging remain separate operational release gates.

## Delivered implementation

| Area | Implemented behavior |
| --- | --- |
| Developer APIs & Keys | Scoped developer API key lifecycle (`developer_api_keys`); 256-bit entropy token generation with `tk_live_` prefix; secure SHA-256 hash storage; prefix-based identification; granular authorization scopes (`tasks`, `calendar`, `notes`, `webhooks`); immediate revocation. |
| Signed Webhooks | Webhook subscription management (`webhooks`) and delivery history ledger (`webhook_deliveries`); cryptographic HMAC-SHA256 signatures (`X-Tantu-Signature`); unix timestamp replay protection; on-demand secret rotation (`whsec_`); test ping dispatches. |
| Provider Evaluations | Transparent capability matrix (`getIntegrationProviders`); verified Google Workspace and Microsoft 365 native integrations; truthful evaluation of generic IMAP/SMTP and CalDAV/CardDAV without unsupported simulated claims. |
| Enterprise Governance | Workspace enterprise policy controls (`enterprise_policies`); SSO enforcement toggle; SAML 2.0 / OIDC provider options; bounded session durations; IP allowlist CIDR enforcement; configurable retention thresholds. |
| Data Loss Prevention | Real-time DLP redaction engine (`scanAndRedactText`); default pattern rules for US SSN, credit cards, and API secrets; custom pattern support; redaction audit logging (`dlp_redaction_logs`); interactive tester console. |
| Audit Exports | Cryptographically signed workspace audit log exports (`enterprise_audit_exports`); structured NDJSON and CSV formats; SHA-256 stream integrity checksums; time-bounded download tokens. |
| Operating Model Qualification | Formal evaluations for SAML/SCIM identity lifecycles, self-hosting cost and support burdens, and data retention standards against GDPR Art. 17 and SOC 2 Type II controls. |

See [implementation](implementation.md) and [setup/operational procedures](setup.md) for detailed contracts and configuration. Private technology guides remain gitignored.

## Explicit supported bounds

- Developer API keys cannot bypass workspace row-level security or project permissions. A key's effective permissions are strictly bounded by both its assigned scopes and the owning workspace role.
- Webhook delivery signatures require constant-time comparison and enforce a 300-second replay tolerance window.
- Additional provider evaluations are explicit: generic IMAP/SMTP does not claim feature parity with modern REST APIs.
- Enterprise SSO enforcement restricts interactive session logins without granting administrators unauthorized access to private member records.
- DLP scanning runs deterministically without external API dependencies. Patterns are sandboxed and catch errors gracefully without interrupting core writes.
- Audit export checksums are calculated over the exact serialized payload stream.

## External acceptance still required

| Gate | Evidence still required |
| --- | --- |
| Enterprise IdP catalog listings | Official application approval and verification in Okta Integration Network (OIN) and Microsoft Entra Gallery. |
| SOC 2 Type II third-party attestation | Formal external auditor evaluation of control effectiveness over a continuous observation period. |
| Hardware security module (HSM) key custody | Enterprise dedicated HSM integration (e.g. AWS CloudHSM or Google Cloud KMS) for master secret envelope encryption in air-gapped deployments. |
| Webhook ingress gateway SLA | Dedicated outbound proxy cluster qualification with static IP egress for enterprise subscriber firewall rules. |

These gates keep enterprise production release decisions distinct. This delivery satisfies local engineering and automated testing qualification.

## Validation record

Run `npm test` and `npm run check`. These execute unit test suites, integration tests, contract checks, linting, typechecking, and production builds across backend and frontend packages.

All tests execute against local fixtures and disposable PostgreSQL schemas without requiring external network connectivity or public cloud resources.

## Verified completion qualification

On 31 October 2026, all qualification suites passed.

| Check | Observed outcome |
| --- | --- |
| Lint and strict types | Passed across backend, frontend, and discovery packages. |
| Unit tests | Passed: 59 backend and 20 discovery tests (total 79 tests). |
| Contract verification | Synchronized `contracts/l1a.openapi.json` with 0 drift. |
| Build checks | Production builds succeeded for backend and frontend. |
