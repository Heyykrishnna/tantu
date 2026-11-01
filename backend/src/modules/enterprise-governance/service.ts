import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export interface DlpRule {
  id: string;
  name: string;
  pattern: string;
  category: "pii" | "financial" | "credentials" | "custom";
  action: "redact" | "flag";
  replacement: string;
}

export interface EnterprisePolicyRecord {
  workspaceId: string;
  ssoEnforced: boolean;
  ssoProvider: "saml" | "oidc" | "none";
  sessionDurationMinutes: number;
  allowedIpRanges: string[];
  dlpEnabled: boolean;
  dlpRules: DlpRule[];
  retentionDays: number;
  updatedAt: string;
}

export interface DlpScanViolation {
  ruleName: string;
  pattern: string;
  snippet: string;
}

export interface DlpScanResult {
  cleanText: string;
  matched: boolean;
  violations: DlpScanViolation[];
}

export interface DlpRedactionLogRecord {
  id: string;
  workspaceId: string;
  ruleName: string;
  matchedPattern: string;
  entityType: string;
  entityId: string;
  redactedSnippet: string;
  createdAt: string;
}

export interface EnterpriseAuditExportRecord {
  id: string;
  workspaceId: string;
  exportFormat: "ndjson" | "csv";
  status: "completed" | "pending" | "failed";
  downloadToken: string;
  recordCount: number;
  checksumSha256: string;
  expiresAt: string;
  createdAt: string;
}

export const DEFAULT_DLP_RULES: DlpRule[] = [
  {
    id: "dlp-rule-ssn",
    name: "US Social Security Number",
    pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
    category: "pii",
    action: "redact",
    replacement: "[REDACTED:SSN]"
  },
  {
    id: "dlp-rule-cc",
    name: "Payment Card Number",
    pattern: "\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\b",
    category: "financial",
    action: "redact",
    replacement: "[REDACTED:CARD]"
  },
  {
    id: "dlp-rule-secrets",
    name: "API Secret Key Tokens",
    pattern: "\\b(?:tk_live_|whsec_|sk_live_)[0-9a-zA-Z]{16,}\\b",
    category: "credentials",
    action: "redact",
    replacement: "[REDACTED:SECRET]"
  }
];

export async function getEnterprisePolicy(
  client: PoolClient,
  workspaceId: string
): Promise<EnterprisePolicyRecord> {
  const result = await client.query<{
    workspace_id: string;
    sso_enforced: boolean;
    sso_provider: "saml" | "oidc" | "none";
    session_duration_minutes: number;
    allowed_ip_ranges: string[];
    dlp_enabled: boolean;
    dlp_rules: DlpRule[];
    retention_days: number;
    updated_at: string;
  }>(
    `SELECT workspace_id, sso_enforced, sso_provider, session_duration_minutes,
            allowed_ip_ranges, dlp_enabled, dlp_rules, retention_days, updated_at
     FROM tantu.enterprise_policies
     WHERE workspace_id = $1`,
    [workspaceId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      workspaceId,
      ssoEnforced: false,
      ssoProvider: "none",
      sessionDurationMinutes: 480,
      allowedIpRanges: [],
      dlpEnabled: true,
      dlpRules: DEFAULT_DLP_RULES,
      retentionDays: 365,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    workspaceId: row.workspace_id,
    ssoEnforced: row.sso_enforced,
    ssoProvider: row.sso_provider,
    sessionDurationMinutes: row.session_duration_minutes,
    allowedIpRanges: row.allowed_ip_ranges,
    dlpEnabled: row.dlp_enabled,
    dlpRules: row.dlp_rules.length ? row.dlp_rules : DEFAULT_DLP_RULES,
    retentionDays: row.retention_days,
    updatedAt: row.updated_at
  };
}

export async function updateEnterprisePolicy(
  client: PoolClient,
  workspaceId: string,
  params: {
    ssoEnforced?: boolean;
    ssoProvider?: "saml" | "oidc" | "none";
    sessionDurationMinutes?: number;
    allowedIpRanges?: string[];
    dlpEnabled?: boolean;
    dlpRules?: DlpRule[];
    retentionDays?: number;
    updatedBy?: string;
  }
): Promise<EnterprisePolicyRecord> {
  if (params.ssoEnforced === true || (params.allowedIpRanges?.length ?? 0) > 0 || (params.sessionDurationMinutes !== undefined && params.sessionDurationMinutes !== 480))
    throw new Failure(409, "IDENTITY_INTEGRATION_REQUIRED", "External identity enforcement is not configured. Existing sign-in and session protections remain active.");
  const current = await getEnterprisePolicy(client, workspaceId);

  const ssoEnforced = params.ssoEnforced ?? current.ssoEnforced;
  const ssoProvider = params.ssoProvider ?? current.ssoProvider;
  const sessionDurationMinutes = params.sessionDurationMinutes ?? current.sessionDurationMinutes;
  const allowedIpRanges = params.allowedIpRanges ?? current.allowedIpRanges;
  const dlpEnabled = params.dlpEnabled ?? current.dlpEnabled;
  const dlpRules = params.dlpRules ?? current.dlpRules;
  const retentionDays = params.retentionDays ?? current.retentionDays;

  const result = await client.query<{
    workspace_id: string;
    sso_enforced: boolean;
    sso_provider: "saml" | "oidc" | "none";
    session_duration_minutes: number;
    allowed_ip_ranges: string[];
    dlp_enabled: boolean;
    dlp_rules: DlpRule[];
    retention_days: number;
    updated_at: string;
  }>(
    `INSERT INTO tantu.enterprise_policies(
       workspace_id, sso_enforced, sso_provider, session_duration_minutes,
       allowed_ip_ranges, dlp_enabled, dlp_rules, retention_days, updated_by, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (workspace_id) DO UPDATE
     SET sso_enforced = EXCLUDED.sso_enforced,
         sso_provider = EXCLUDED.sso_provider,
         session_duration_minutes = EXCLUDED.session_duration_minutes,
         allowed_ip_ranges = EXCLUDED.allowed_ip_ranges,
         dlp_enabled = EXCLUDED.dlp_enabled,
         dlp_rules = EXCLUDED.dlp_rules,
         retention_days = EXCLUDED.retention_days,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
     RETURNING workspace_id, sso_enforced, sso_provider, session_duration_minutes,
               allowed_ip_ranges, dlp_enabled, dlp_rules, retention_days, updated_at`,
    [
      workspaceId,
      ssoEnforced,
      ssoProvider,
      sessionDurationMinutes,
      JSON.stringify(allowedIpRanges),
      dlpEnabled,
      JSON.stringify(dlpRules),
      retentionDays,
      params.updatedBy ?? null
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to update enterprise policy");
  }

  return {
    workspaceId: row.workspace_id,
    ssoEnforced: row.sso_enforced,
    ssoProvider: row.sso_provider,
    sessionDurationMinutes: row.session_duration_minutes,
    allowedIpRanges: row.allowed_ip_ranges,
    dlpEnabled: row.dlp_enabled,
    dlpRules: row.dlp_rules,
    retentionDays: row.retention_days,
    updatedAt: row.updated_at
  };
}

export function scanAndRedactText(
  text: string,
  rules: DlpRule[],
  enabled = true
): DlpScanResult {
  if (!enabled || !text) {
    return { cleanText: text, matched: false, violations: [] };
  }

  let cleanText = text;
  const violations: DlpScanViolation[] = [];

  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, "g");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const fullMatch = match[0];
        if (fullMatch) {
          violations.push({
            ruleName: rule.name,
            pattern: rule.pattern,
            snippet: fullMatch.slice(0, 4) + "***"
          });
        }
      }
      if (rule.action === "redact") {
        cleanText = cleanText.replace(regex, rule.replacement);
      }
    } catch {
      continue;
    }
  }

  return {
    cleanText,
    matched: violations.length > 0,
    violations
  };
}

export async function logDlpRedactions(
  client: PoolClient,
  workspaceId: string,
  entityType: string,
  entityId: string,
  violations: DlpScanViolation[]
): Promise<void> {
  for (const v of violations) {
    await client.query(
      `INSERT INTO tantu.dlp_redaction_logs(workspace_id, rule_name, matched_pattern, entity_type, entity_id, redacted_snippet)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [workspaceId, v.ruleName, v.pattern, entityType, entityId, v.snippet]
    );
  }
}

export async function listDlpLogs(
  client: PoolClient,
  workspaceId: string,
  limit = 50
): Promise<DlpRedactionLogRecord[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    rule_name: string;
    matched_pattern: string;
    entity_type: string;
    entity_id: string;
    redacted_snippet: string;
    created_at: string;
  }>(
    `SELECT id, workspace_id, rule_name, matched_pattern, entity_type, entity_id, redacted_snippet, created_at
     FROM tantu.dlp_redaction_logs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(limit, 100)]
  );

  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    ruleName: row.rule_name,
    matchedPattern: row.matched_pattern,
    entityType: row.entity_type,
    entityId: row.entity_id,
    redactedSnippet: row.redacted_snippet,
    createdAt: row.created_at
  }));
}

export async function createAuditExport(
  client: PoolClient,
  workspaceId: string,
  format: "ndjson" | "csv" = "ndjson"
): Promise<EnterpriseAuditExportRecord> {
  const auditResult = await client.query<{
    id: string;
    action: string;
    occurred_at: string;
    actor_id: string | null;
  }>(
    `SELECT id, type AS action, created_at::text AS occurred_at, actor_id
     FROM tantu.audit WHERE workspace_id=$1
     ORDER BY created_at DESC
     LIMIT 500`, [workspaceId]
  );

  const records = auditResult.rows;
  const payload = format === "ndjson"
    ? records
      .map((r) =>
        JSON.stringify({
          id: r.id,
          workspaceId,
          action: r.action,
          occurredAt: r.occurred_at,
          actorId: r.actor_id
        })
      )
      .join("\n")
    : "id,workspaceId,action,occurredAt,actorId\n" +
    records
      .map((r) => `"${r.id}","${workspaceId}","${r.action}","${r.occurred_at}","${r.actor_id ?? ""}"`)
      .join("\n");

  const checksumSha256 = createHash("sha256").update(payload).digest("hex");
  const downloadToken = `exp_${randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const insertResult = await client.query<{
    id: string;
    workspace_id: string;
    export_format: "ndjson" | "csv";
    status: "completed" | "pending" | "failed";
    download_token: string;
    record_count: number;
    checksum_sha256: string;
    expires_at: string;
    created_at: string;
  }>(
    `INSERT INTO tantu.enterprise_audit_exports(
       workspace_id, export_format, status, download_token, record_count, checksum_sha256, expires_at, payload
     )
     VALUES ($1, $2, 'completed', $3, $4, $5, $6, $7)
     RETURNING id, workspace_id, export_format, status, download_token, record_count, checksum_sha256, expires_at, created_at`,
    [workspaceId, format, downloadToken, records.length, checksumSha256, expiresAt, payload]
  );

  const row = insertResult.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to generate enterprise audit export");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    exportFormat: row.export_format,
    status: row.status,
    downloadToken: row.download_token,
    recordCount: row.record_count,
    checksumSha256: row.checksum_sha256,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

export async function listAuditExports(
  client: PoolClient,
  workspaceId: string
): Promise<EnterpriseAuditExportRecord[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    export_format: "ndjson" | "csv";
    status: "completed" | "pending" | "failed";
    download_token: string;
    record_count: number;
    checksum_sha256: string;
    expires_at: string;
    created_at: string;
  }>(
    `SELECT id, workspace_id, export_format, status, download_token, record_count, checksum_sha256, expires_at, created_at
     FROM tantu.enterprise_audit_exports
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [workspaceId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    exportFormat: row.export_format,
    status: row.status,
    downloadToken: row.download_token,
    recordCount: row.record_count,
    checksumSha256: row.checksum_sha256,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  }));
}

export async function getAuditExportFile(client: PoolClient, workspaceId: string, exportId: string) {
  const result = await client.query<{ payload: string; export_format: "ndjson" | "csv"; checksum_sha256: string }>(
    "SELECT payload,export_format,checksum_sha256 FROM tantu.enterprise_audit_exports WHERE id=$1 AND workspace_id=$2 AND status='completed' AND expires_at>now() AND payload IS NOT NULL",
    [exportId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw new Failure(404, "NOT_FOUND", "The export is unavailable or has expired. Create a new export.");
  return { payload: row.payload, fileName: `audit-${exportId}.${row.export_format === "csv" ? "csv" : "ndjson"}`, mediaType: row.export_format === "csv" ? "text/csv" : "application/x-ndjson", checksumSha256: row.checksum_sha256 };
}
