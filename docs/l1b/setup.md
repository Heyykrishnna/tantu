# L1B setup and provider operations

Start with [L1A setup](../l1a/setup.md). Back up an existing installation, stop HTTP/workers, apply every ordered migration with the schema owner, and reapply `backend/migrations/runtime-grants.sql`. Runtime remains a non-owner without superuser or row-security bypass privileges. Restart HTTP, worker and frontend separately. Migrations preserve canonical task/page IDs; do not edit previously applied migration files.

## Optional delegated providers

| Setting | Purpose |
| --- | --- |
| `PROVIDER_VAULT_KEY` | Independent 32-byte AES key encoded as canonical unpadded base64url. Required when any provider is configured. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Approved Google confidential web client. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Approved Microsoft confidential web client. |
| `MICROSOFT_TENANT_ID` | Explicit approved tenant UUID. |
| `APP_ORIGIN` | Exact browser origin; production HTTPS. Determines fixed OAuth callbacks. |

Register `<APP_ORIGIN>/api/v1/providers/google/callback` and/or `<APP_ORIGIN>/api/v1/providers/microsoft/callback`. Route `/api/v1` to Fastify with session cookies intact. Keep all credentials in ignored backend environments or a secret manager.

New Google consent requests `openid`, `email`, Gmail modify/send and calendar events access. New Microsoft consent requests `openid`, `email`, `offline_access`, `User.Read`, `Mail.ReadWrite`, `Mail.Send` and `Calendars.ReadWrite`. Existing grants are not silently expanded: reconnect with the newly required scopes before enabling write capabilities. The actual granted scopes are retained and checked. No provider public verification or tenant-admin consent is implied.

## Worker and coverage

Run `npm run dev:worker` or the compiled worker. A worker checks due connections every 30 seconds and schedules mail/calendar reconciliation at five-minute intervals. Existing pending read jobs are reused; provider Retry-After windows delay work. Manual synchronization remains available. Connection health in Mail displays account state, retry time, last completion, checkpoint coverage and subscription expiration.

Gmail covers paged mailbox baseline/history. Microsoft discovers root/nested/hidden folders, up to 1,000 folders, and checkpoints each folder independently. Provider calendars cover the primary/default calendar in a rolling -30/+90-day window, including expanded occurrences and explicit exceptions. Microsoft windows renew daily; Google refreshes bounded instance windows. Other calendars and unlimited history are not claimed. Discovered data is a current provider projection; app-owned tasks/pages remain authoritative in their own store.

## Optional public notification subscriptions

Leave notification settings unset for local validation. Periodic reads still run. Public callbacks require trusted HTTPS ingress, approved provider configuration and controlled real-account qualification.

| Setting | Purpose |
| --- | --- |
| `PROVIDER_NOTIFICATION_ORIGIN` | HTTPS origin with no path/trailing slash, routed directly to backend `/api/v1/provider-notifications/…` endpoints. Must preserve Google channel headers and Graph validation requests. |
| `GOOGLE_PUBSUB_TOPIC` | Existing `projects/<project>/topics/<topic>` granted to Gmail's publisher service account. |
| `GOOGLE_PUBSUB_AUDIENCE` | Exact audience configured for authenticated Pub/Sub push. |
| `GOOGLE_PUBSUB_SERVICE_EMAIL` | Expected verified push service-account email. |
| `GOOGLE_PUBSUB_SUBSCRIPTION` | Exact expected Pub/Sub subscription resource name. |

All four Google Pub/Sub variables are required together. Provision the topic/push subscription through the provider's approved infrastructure process. The push endpoint is `<PROVIDER_NOTIFICATION_ORIGIN>/api/v1/provider-notifications/google/<workspaceId>/<userId>/<connectionId>`; obtain routing IDs from the authenticated connection, and configure the exact audience and subscription. JWT keys are fetched only from Google's fixed trusted JWKS endpoint. Mailbox address must also match.

Google Calendar watches use the same Google endpoint plus `/calendar`, with a random channel token, channel/resource IDs and expiration. Microsoft subscriptions use the corresponding `/microsoft/<workspaceId>/<userId>/<connectionId>` endpoint, random clientState and lifecycle notifications. Graph validation tokens are echoed as bounded plain text; notification resource bodies are never treated as authoritative records. Watches renew within one day of expiration; Microsoft uses three-day subscriptions. Invalid or forged hints cannot bypass private connection authorization. Old disconnected subscriptions may continue sending until provider expiration; use provider controls to remove them when decommissioning public ingress.

## Reviewed writes and recovery

Use Calendar to configure working hours, buffer, density, timezone and selected account overlays. Local rescheduling through drag or form opens the same review. Provider event writes are a separate explicit review, including attendees, recurrence/occurrence/series scope and notification effects. A stale review or locked block returns an explained conflict; dependent deadlines and external meetings never change implicitly.

In Mail, save/edit a versioned draft, select only clean authorized attachments, inspect sender/recipients/body/files in send review, then confirm. Reply-all recipients exclude the connected sender by default; review the final list. Forwarding does not silently include provider attachments. Microsoft attachments use the small-file path with a two-MiB total bound; Google allows ten MiB total and each local file remains capped at five MiB.

Pending reviewed mail sends can be executed while their review remains valid. Calendar/mailbox changes are processed by the external-effect worker. Confirmed means provider acceptance or sufficient readback evidence, not delivery. Unknown operations are reconciled only; never automatically create a replacement draft or intent. Inconclusive updates remain unknown for provider-side investigation. Internal retries do not reset the committed uncertainty fence.

Snooze and simple tagging rules are personal app preferences. They do not create external sends or general automation. Snoozes can be cleared from the mail workflow's source selector, including currently snoozed records.

Disconnect disables local access, clears tokens/projections/cursors and cancels pending sends. Unknown operations remain unknown, and app-owned tasks/pages/blocks survive. Local disconnect does not revoke the OAuth grant: use the provider's account-security settings separately.

Expired cursors rebuild provider projections without deleting app-owned work. Throttling records a bounded Retry-After. Renew consent when refresh fails. Refresh rotation plus a crash can still require reconnecting. The vault has one key version; back it up separately and qualify a multi-key rotation/migration procedure before production key rotation. Never discard a live key as an ad hoc recovery step.

## Knowledge and deployment boundaries

Rich/native page editing shares one Yjs document and authenticated polling. Saved views are private or shared according to current source permissions. Templates require fresh source versions and review; created records are private, with no copied sharing/files/relations. Removed schema properties and unavailable source previews expose repair states.

The local topology is one private file store plus PostgreSQL, HTTP and worker processes. Production retention, key management, scanner/storage/identity qualification, worker quotas/alerts, load/security testing and human accessibility acceptance remain separate gates. See [readiness](readiness.md).
