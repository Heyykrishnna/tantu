import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export interface DeveloperApiKeyRecord {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: "active" | "revoked" | "expired";
}

export interface CreateApiKeyResult {
  apiKey: DeveloperApiKeyRecord;
  secretKey: string;
}

export interface WebhookRecord {
  id: string;
  workspaceId: string;
  targetUrl: string;
  subscribedEvents: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookResult {
  webhook: WebhookRecord;
  secret: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  workspaceId: string;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  errorMessage: string | null;
  attemptCount: number;
  deliveredAt: string;
}

export interface ProviderCapabilityRecord {
  id: string;
  name: string;
  category: "mail" | "calendar" | "sync";
  status: "supported" | "evaluated" | "unsupported";
  capabilities: string[];
  documentation: string;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function createApiKey(
  client: PoolClient,
  workspaceId: string,
  name: string,
  scopes: string[],
  expiresInDays?: number
): Promise<CreateApiKeyResult> {
  const token = `tk_live_${randomBytes(24).toString("hex")}`;
  const keyPrefix = token.slice(0, 12);
  const keyHash = hashSecret(token);
  const expiresAt = expiresInDays && expiresInDays > 0
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  const result = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>(
    `INSERT INTO tantu.developer_api_keys(workspace_id, name, key_prefix, key_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, workspace_id, name, key_prefix, scopes, expires_at, revoked_at, created_at`,
    [workspaceId, name, keyPrefix, keyHash, JSON.stringify(scopes), expiresAt]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to generate developer API key");
  }

  return {
    apiKey: {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      scopes: row.scopes,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      status: "active"
    },
    secretKey: token
  };
}

export async function listApiKeys(
  client: PoolClient,
  workspaceId: string
): Promise<DeveloperApiKeyRecord[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>(
    `SELECT id, workspace_id, name, key_prefix, scopes, expires_at, revoked_at, created_at
     FROM tantu.developer_api_keys
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );

  const now = Date.now();
  return result.rows.map((row) => {
    let status: "active" | "revoked" | "expired" = "active";
    if (row.revoked_at) {
      status = "revoked";
    } else if (row.expires_at && new Date(row.expires_at).getTime() < now) {
      status = "expired";
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      scopes: row.scopes,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      status
    };
  });
}

export async function revokeApiKey(
  client: PoolClient,
  workspaceId: string,
  keyId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE tantu.developer_api_keys
     SET revoked_at = now()
     WHERE workspace_id = $1 AND id = $2 AND revoked_at IS NULL`,
    [workspaceId, keyId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function verifyApiKeyScope(
  client: PoolClient,
  secretKey: string,
  requiredScope: string
): Promise<{ valid: boolean; workspaceId?: string; scopes?: string[] }> {
  const keyHash = hashSecret(secretKey);
  const result = await client.query<{
    workspace_id: string;
    scopes: string[];
    expires_at: string | null;
    revoked_at: string | null;
  }>(
    `SELECT workspace_id, scopes, expires_at, revoked_at
     FROM tantu.developer_api_keys
     WHERE key_hash = $1`,
    [keyHash]
  );

  const row = result.rows[0];
  if (!row || row.revoked_at) {
    return { valid: false };
  }

  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { valid: false };
  }

  const hasScope = row.scopes.includes("*") || row.scopes.includes(requiredScope);
  if (!hasScope) {
    return { valid: false, workspaceId: row.workspace_id, scopes: row.scopes };
  }

  return { valid: true, workspaceId: row.workspace_id, scopes: row.scopes };
}

export async function createWebhook(
  client: PoolClient,
  workspaceId: string,
  targetUrl: string,
  subscribedEvents: string[]
): Promise<CreateWebhookResult> {
  if (!/^https?:\/\/.+/.test(targetUrl)) {
    throw new Failure(400, "BAD_REQUEST", "Target URL must be a valid HTTP or HTTPS address");
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const secretHash = hashSecret(secret);

  const result = await client.query<{
    id: string;
    workspace_id: string;
    target_url: string;
    subscribed_events: string[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO tantu.webhooks(workspace_id, target_url, subscribed_events, secret_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, workspace_id, target_url, subscribed_events, is_active, created_at, updated_at`,
    [workspaceId, targetUrl, JSON.stringify(subscribedEvents), secretHash]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to register webhook");
  }

  return {
    webhook: {
      id: row.id,
      workspaceId: row.workspace_id,
      targetUrl: row.target_url,
      subscribedEvents: row.subscribed_events,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    },
    secret
  };
}

export async function listWebhooks(
  client: PoolClient,
  workspaceId: string
): Promise<WebhookRecord[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    target_url: string;
    subscribed_events: string[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, workspace_id, target_url, subscribed_events, is_active, created_at, updated_at
     FROM tantu.webhooks
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    targetUrl: row.target_url,
    subscribedEvents: row.subscribed_events,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function updateWebhook(
  client: PoolClient,
  workspaceId: string,
  webhookId: string,
  isActive: boolean,
  subscribedEvents?: string[]
): Promise<WebhookRecord> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    target_url: string;
    subscribed_events: string[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(
    `UPDATE tantu.webhooks
     SET is_active = $1,
         subscribed_events = COALESCE($2, subscribed_events),
         updated_at = now()
     WHERE workspace_id = $3 AND id = $4
     RETURNING id, workspace_id, target_url, subscribed_events, is_active, created_at, updated_at`,
    [
      isActive,
      subscribedEvents ? JSON.stringify(subscribedEvents) : null,
      workspaceId,
      webhookId
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(404, "NOT_FOUND", "Webhook not found");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    targetUrl: row.target_url,
    subscribedEvents: row.subscribed_events,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function rotateWebhookSecret(
  client: PoolClient,
  workspaceId: string,
  webhookId: string
): Promise<{ secret: string }> {
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const secretHash = hashSecret(secret);

  const result = await client.query(
    `UPDATE tantu.webhooks
     SET secret_hash = $1, updated_at = now()
     WHERE workspace_id = $2 AND id = $3`,
    [secretHash, workspaceId, webhookId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Failure(404, "NOT_FOUND", "Webhook not found");
  }

  return { secret };
}

export async function deleteWebhook(
  client: PoolClient,
  workspaceId: string,
  webhookId: string
): Promise<boolean> {
  const result = await client.query(
    `DELETE FROM tantu.webhooks
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, webhookId]
  );
  return (result.rowCount ?? 0) > 0;
}

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  payload: Record<string, unknown>
): string {
  const serialized = `${timestamp}.${JSON.stringify(payload)}`;
  const signature = createHmac("sha256", secret).update(serialized).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(
  secret: string,
  header: string,
  payload: Record<string, unknown>,
  toleranceSeconds = 300
): boolean {
  const match = /^t=(\d+),v1=([a-f0-9]+)$/.exec(header);
  if (!match) return false;

  const timestampStr = match[1];
  const signature = match[2];
  if (!timestampStr || !signature) return false;

  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signature, "hex");

  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function recordWebhookDelivery(
  client: PoolClient,
  webhookId: string,
  workspaceId: string,
  eventType: string,
  payload: Record<string, unknown>,
  responseStatus: number | null,
  errorMessage: string | null
): Promise<WebhookDeliveryRecord> {
  const result = await client.query<{
    id: string;
    webhook_id: string;
    workspace_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    response_status: number | null;
    error_message: string | null;
    attempt_count: number;
    delivered_at: string;
  }>(
    `INSERT INTO tantu.webhook_deliveries(webhook_id, workspace_id, event_type, payload, response_status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, webhook_id, workspace_id, event_type, payload, response_status, error_message, attempt_count, delivered_at`,
    [webhookId, workspaceId, eventType, JSON.stringify(payload), responseStatus, errorMessage]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to log delivery");
  }

  return {
    id: row.id,
    webhookId: row.webhook_id,
    workspaceId: row.workspace_id,
    eventType: row.event_type,
    payload: row.payload,
    responseStatus: row.response_status,
    errorMessage: row.error_message,
    attemptCount: row.attempt_count,
    deliveredAt: row.delivered_at
  };
}

export async function listWebhookDeliveries(
  client: PoolClient,
  workspaceId: string,
  webhookId: string
): Promise<WebhookDeliveryRecord[]> {
  const result = await client.query<{
    id: string;
    webhook_id: string;
    workspace_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    response_status: number | null;
    error_message: string | null;
    attempt_count: number;
    delivered_at: string;
  }>(
    `SELECT id, webhook_id, workspace_id, event_type, payload, response_status, error_message, attempt_count, delivered_at
     FROM tantu.webhook_deliveries
     WHERE workspace_id = $1 AND webhook_id = $2
     ORDER BY delivered_at DESC
     LIMIT 50`,
    [workspaceId, webhookId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    webhookId: row.webhook_id,
    workspaceId: row.workspace_id,
    eventType: row.event_type,
    payload: row.payload,
    responseStatus: row.response_status,
    errorMessage: row.error_message,
    attemptCount: row.attempt_count,
    deliveredAt: row.delivered_at
  }));
}

export function getIntegrationProviders(): ProviderCapabilityRecord[] {
  return [
    {
      id: "google-workspace",
      name: "Google Workspace",
      category: "mail",
      status: "supported",
      capabilities: [
        "mail.read",
        "mail.send",
        "calendar.read",
        "calendar.write",
        "drafts.reconciliation"
      ],
      documentation: "Native OAuth 2.0 PKCE integration with push subscriptions and delta synchronization."
    },
    {
      id: "microsoft-365",
      name: "Microsoft 365 / Exchange",
      category: "mail",
      status: "supported",
      capabilities: [
        "mail.read",
        "mail.send",
        "calendar.read",
        "calendar.write",
        "delta.sync"
      ],
      documentation: "Microsoft Graph REST API integration with tenant consent and incremental sync."
    },
    {
      id: "generic-imap-smtp",
      name: "Generic IMAP/SMTP",
      category: "mail",
      status: "evaluated",
      capabilities: [
        "mail.read.evaluated",
        "mail.send.evaluated"
      ],
      documentation: "Evaluation completed: provider credential exposure, lack of push subscriptions, and variable TLS cipher suites preclude native production parity without dedicated gateway infrastructure."
    },
    {
      id: "caldav-carddav",
      name: "CalDAV / CardDAV Standards",
      category: "calendar",
      status: "evaluated",
      capabilities: [
        "calendar.sync.evaluated"
      ],
      documentation: "Evaluation completed: unsupported cross-server recurrence expansion discrepancies require explicit translation layer."
    }
  ];
}
