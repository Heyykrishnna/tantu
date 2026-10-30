# L3 setup and operational procedures

Start with [L2 setup](../l2/setup.md). Apply migrations `020_integrations_and_webhooks.sql` and `021_enterprise_governance.sql` using the database schema owner, then reapply `backend/migrations/runtime-grants.sql`.

## Database migrations and grants

Execute migrations in sequence:

```bash
# Apply pending L3 schema migrations
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/020_integrations_and_webhooks.sql
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/021_enterprise_governance.sql

# Reapply runtime privileges
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/runtime-grants.sql
```

The migrations establish:
- `tantu.developer_api_keys`
- `tantu.webhooks` and `tantu.webhook_deliveries`
- `tantu.enterprise_policies`
- `tantu.dlp_redaction_logs`
- `tantu.enterprise_audit_exports`

## Configuration parameters

| Parameter | Purpose | Default / Range |
| --- | --- | --- |
| `API_KEY_DEFAULT_EXPIRY_DAYS` | Default lifespan for newly generated developer API keys. | `30` (1 to 365) |
| `WEBHOOK_TOLERANCE_SECONDS` | Replay tolerance window for incoming webhook verification. | `300` seconds |
| `DEFAULT_SESSION_DURATION_MIN` | Default max session duration under enterprise policy. | `480` minutes (15 to 10080) |
| `DEFAULT_RETENTION_DAYS` | Workspace data retention period before archival pruning. | `365` days (30 to 3650) |
| `DLP_ENABLED_DEFAULT` | System-wide default for Data Loss Prevention scanning. | `true` |

## Operational procedures

### Managing developer API keys
- API keys must only be generated via `POST /api/v1/workspaces/:workspaceId/api-keys`.
- The secret key token (`tk_live_...`) is displayed only once. If lost, the key must be revoked and regenerated.
- Revocation via `DELETE /api/v1/workspaces/:workspaceId/api-keys/:keyId` is immediate and permanent across all worker threads.
- Never grant wildcard scope (`*`) to automated scripts or third-party webhooks unless full workspace control is required.

### Configuring signed webhooks
- Subscribers must configure endpoints accessible over HTTPS.
- Incoming payloads must be verified by extracting the `X-Tantu-Signature` header, parsing `t` and `v1`, and evaluating the HMAC-SHA256 signature using the shared secret.
- If a signing secret is compromised, rotate it immediately using `POST /api/v1/workspaces/:workspaceId/webhooks/:webhookId/rotate-secret`. Old signatures will be invalidated instantly.

### Enterprise SSO enforcement
- Before setting `ssoEnforced: true`, confirm that identity provider SAML/OIDC metadata is verified and at least two administrators have authenticated via SSO.
- Disabling local passwords when SSO is enforced prevents unauthorized credential use.

### Data Loss Prevention (DLP) rules
- Default rules monitor SSN, payment cards, and API secrets.
- Add custom regex rules through the Enterprise Governance panel for proprietary code keywords or confidential customer tags.
- Review `tantu.dlp_redaction_logs` periodically to identify recurring compliance risks or educate users.

### Generating audit exports
- Use `POST /api/v1/workspaces/:workspaceId/audit-exports` to create an export in `ndjson` or `csv` format.
- Verify download integrity by matching the computed SHA-256 hash of the downloaded stream against the stored `checksum_sha256`.

