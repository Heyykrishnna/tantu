# L1B local setup and provider operations

Start with the [L1A setup](../l1a/setup.md). Back up an existing installation, stop HTTP/workers during migration, apply all ordered migrations using the schema owner and reapply the reviewed runtime privilege manifest. Runtime must remain a non-owner with no superuser or row-security bypass privileges. Start backend, worker and frontend separately. Existing task/page IDs remain unchanged.

## Optional provider registrations

Leave the new provider settings empty for local app-only use. To enable a provider, configure its approved OAuth client and an independent `PROVIDER_VAULT_KEY` containing exactly 32 random bytes encoded as unpadded base64url. Generate and store it through the deployment’s secret mechanism; do not reuse file-signing/session secrets, paste credentials into chat, or commit local environments.

| Setting | Requirement |
| --- | --- |
| `PROVIDER_VAULT_KEY` | Separate 32-byte AES key, canonical base64url; required when either provider is configured. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Approved Google confidential web client. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Approved Microsoft confidential web client. |
| `MICROSOFT_TENANT_ID` | Explicit approved tenant UUID; the local implementation does not assume multi-tenant consent. |
| `APP_ORIGIN` | Browser origin; production requires HTTPS. It determines fixed callback addresses. |

Register exactly `<APP_ORIGIN>/api/v1/providers/google/callback` and/or `<APP_ORIGIN>/api/v1/providers/microsoft/callback`. The frontend must route `/api/v1` to the backend with cookies intact. Do not register the internal backend port when the browser uses the frontend origin.

Google currently requests identity, Gmail read/send and read-only calendar access. Microsoft requests identity/offline access, User.Read, Mail.ReadWrite/Mail.Send and read-only calendars. Review these scopes with the account/deployment owner before connecting. Granted scopes are retained, and send review requires actual send consent. This does not assert that a public provider verification or tenant-admin approval has been obtained.

## Use and inspect

In Mail, connect an account through the actual provider consent page. Request a mail or calendar synchronization, keep the worker running, and refresh to inspect the resulting bounded projections and coverage. The worker follows continuation pages; a completed page is not a promise that every provider resource is covered. Workspace administrators cannot read another member’s connection or mailbox through these routes.

Create a plain-text draft, choose Review send, inspect the exact sender/recipients/body, then confirm. An intent is durable before execution. Confirmed means provider acceptance. Pending may be executed only while its original review is valid. Unknown may only be reconciled; never issue a fresh draft/send as an automatic retry. Failed/cancelled intents are retained for diagnosis.

Disconnect disables future local use, clears sealed tokens and local projections/cursors, and cancels pending intents. Unknown effects remain unknown; disconnect cannot undo a remote send. App-owned tasks/pages/work blocks remain. Local disconnect does not claim to revoke the OAuth grant at the provider: use the provider’s account-security settings to revoke that grant separately.

## Recovery and limits

Expired cursors rebuild only provider projections. Throttling records a bounded Retry-After delay. Reconnect when consent cannot refresh. Refresh-token rotation and a process crash can still require a new consent flow; do not treat a recovered HTTP connection as proof that every token remains valid.

The current vault envelope has one key version. Back up the key separately from database backups. Do not replace or discard it on a running installation: a tested multi-key rotation/migration procedure is required before production rotation. Losing the key requires reconnecting accounts; it cannot be reconstructed from database rows.

The local collaboration transport uses authenticated HTTP polling and bounded PostgreSQL snapshots. It is not a deployed Hocuspocus/WebSocket cluster. Keep local HTTP, database and worker resources together as described in the foundation runbook. Production topology, retention, encryption-at-rest, monitoring, real malware scanning and human accessibility qualification remain release prerequisites.
