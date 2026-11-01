import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export interface WorkspaceQuotaInfo {
  workspaceId: string;
  storageBytesUsed: number;
  storageBytesLimit: number;
  recordCount: number;
  recordLimit: number;
  automationRunsToday: number;
  automationLimitDaily: number;
  quotaResetAt: string;
}

export interface UserPreferencesInfo {
  userId: string;
  workspaceId: string;
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  timezone: string;
  weekStart: "sunday" | "monday";
  locale: string;
  defaultCalendar: string | null;
  accent: "neutral" | "indigo" | "sage";
  reduceMotion: boolean;
  updatedAt: string;
}

export interface ExportJobRecord {
  id: string;
  workspaceId: string;
  userId: string;
  status: "pending" | "completed" | "failed";
  format: "json" | "zip";
  payload: Record<string, unknown> | null;
  bytes: number;
  expiresAt: string;
  createdAt: string;
}

export async function getWorkspaceQuota(
  client: PoolClient,
  workspaceId: string
): Promise<WorkspaceQuotaInfo> {
  let row = (
    await client.query<WorkspaceQuotaInfo>(
      `SELECT
        workspace_id AS "workspaceId",
        storage_bytes_used AS "storageBytesUsed",
        storage_bytes_limit AS "storageBytesLimit",
        record_count AS "recordCount",
        record_limit AS "recordLimit",
        automation_runs_today AS "automationRunsToday",
        automation_limit_daily AS "automationLimitDaily",
        quota_reset_at::text AS "quotaResetAt"
      FROM tantu.workspace_quotas
      WHERE workspace_id = $1`,
      [workspaceId]
    )
  ).rows[0];

  if (!row) {
    const defaultRow = await client.query<WorkspaceQuotaInfo>(
      `INSERT INTO tantu.workspace_quotas(workspace_id)
       VALUES($1)
       ON CONFLICT(workspace_id) DO UPDATE SET updated_at = now()
       RETURNING
         workspace_id AS "workspaceId",
         storage_bytes_used AS "storageBytesUsed",
         storage_bytes_limit AS "storageBytesLimit",
         record_count AS "recordCount",
         record_limit AS "recordLimit",
         automation_runs_today AS "automationRunsToday",
         automation_limit_daily AS "automationLimitDaily",
         quota_reset_at::text AS "quotaResetAt"`,
      [workspaceId]
    );
    row = defaultRow.rows[0];
  }

  if (!row) throw new Failure(500, "DATABASE_ERROR", "Quota could not be resolved.");
  return row;
}

export async function checkQuotaAllowance(
  client: PoolClient,
  workspaceId: string,
  kind: "storage" | "record" | "automation",
  amount: number = 1
): Promise<void> {
  const quota = await getWorkspaceQuota(client, workspaceId);
  if (kind === "record" && quota.recordCount + amount > quota.recordLimit) {
    throw new Failure(429, "QUOTA_EXCEEDED", "Workspace record limit reached.");
  }
  if (kind === "storage" && quota.storageBytesUsed + amount > quota.storageBytesLimit) {
    throw new Failure(429, "QUOTA_EXCEEDED", "Workspace storage limit reached.");
  }
  if (kind === "automation" && quota.automationRunsToday + amount > quota.automationLimitDaily) {
    throw new Failure(429, "QUOTA_EXCEEDED", "Workspace daily automation run limit reached.");
  }
}

export async function getUserPreferences(
  client: PoolClient,
  userId: string,
  workspaceId: string
): Promise<UserPreferencesInfo> {
  const row = (
    await client.query<UserPreferencesInfo>(
      `SELECT
        user_id AS "userId",
        workspace_id AS "workspaceId",
        theme,
        density,
        timezone,
        week_start AS "weekStart",
        locale,
        default_calendar AS "defaultCalendar",
        accent, reduce_motion AS "reduceMotion",
        updated_at::text AS "updatedAt"
      FROM tantu.user_preferences
      WHERE user_id = $1 AND workspace_id = $2`,
      [userId, workspaceId]
    )
  ).rows[0];

  if (row) return row;

  return {
    userId,
    workspaceId,
    theme: "system",
    density: "comfortable",
    timezone: "UTC",
    weekStart: "monday",
    locale: "en",
    defaultCalendar: null,
    accent: "neutral",
    reduceMotion: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateUserPreferences(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  input: {
    theme?: "system" | "light" | "dark";
    density?: "comfortable" | "compact";
    timezone?: string;
    weekStart?: "sunday" | "monday";
    locale?: string;
    defaultCalendar?: string | null;
    accent?: "neutral" | "indigo" | "sage";
    reduceMotion?: boolean;
  }
): Promise<UserPreferencesInfo> {
  const existing = await getUserPreferences(client, userId, workspaceId);

  const theme = input.theme ?? existing.theme;
  const density = input.density ?? existing.density;
  const timezone = input.timezone ?? existing.timezone;
  const weekStart = input.weekStart ?? existing.weekStart;
  const locale = input.locale ?? existing.locale;
  try {
    new Intl.DateTimeFormat(locale, { timeZone: timezone });
    Intl.getCanonicalLocales(locale);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new Failure(400, "INVALID_PREFERENCES", "Choose a valid IANA timezone and locale, such as Asia/Kolkata and en-IN.");
  }
  const defaultCalendar = input.defaultCalendar !== undefined ? input.defaultCalendar : existing.defaultCalendar;

  const result = await client.query<UserPreferencesInfo>(
    `INSERT INTO tantu.user_preferences(
      user_id, workspace_id, theme, density, timezone, week_start, locale, default_calendar, accent, reduce_motion, updated_at
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
    ON CONFLICT(user_id, workspace_id) DO UPDATE SET
      theme = excluded.theme,
      density = excluded.density,
      timezone = excluded.timezone,
      week_start = excluded.week_start,
      locale = excluded.locale,
      default_calendar = excluded.default_calendar,
      accent = excluded.accent,
      reduce_motion = excluded.reduce_motion,
      updated_at = now()
    RETURNING
      user_id AS "userId",
      workspace_id AS "workspaceId",
      theme,
      density,
      timezone,
      week_start AS "weekStart",
      locale,
      default_calendar AS "defaultCalendar",
      accent, reduce_motion AS "reduceMotion",
      updated_at::text AS "updatedAt"`,
    [userId, workspaceId, theme, density, timezone, weekStart, locale, defaultCalendar, input.accent ?? existing.accent, input.reduceMotion ?? existing.reduceMotion]
  );

  const updated = result.rows[0];
  if (!updated) throw new Failure(500, "DATABASE_ERROR", "Preferences could not be saved.");
  return updated;
}

export async function createExportJob(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  format: "json" | "zip" = "json"
): Promise<ExportJobRecord> {
  const records = (
    await client.query<{ id: string; kind: string; title: string; status: string; created_at: string }>(
      `SELECT id, kind, title, status, created_at::text
       FROM tantu.records
       WHERE workspace_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [workspaceId]
    )
  ).rows;

  const projects = (
    await client.query<{ id: string; title: string; created_at: string }>(
      `SELECT id, title, created_at::text
       FROM tantu.projects
       WHERE workspace_id = $1
       ORDER BY created_at ASC`,
      [workspaceId]
    )
  ).rows;

  const payload = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    workspaceId,
    records,
    projects,
  };

  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");

  const result = await client.query<ExportJobRecord>(
    `INSERT INTO tantu.export_jobs(
      workspace_id, user_id, status, format, payload, bytes
    ) VALUES($1, $2, 'completed', $3, $4, $5)
    RETURNING
      id,
      workspace_id AS "workspaceId",
      user_id AS "userId",
      status,
      format,
      payload,
      bytes,
      expires_at::text AS "expiresAt",
      created_at::text AS "createdAt"`,
    [workspaceId, userId, format, JSON.stringify(payload), payloadBytes]
  );

  const job = result.rows[0];
  if (!job) throw new Failure(500, "DATABASE_ERROR", "Export job could not be recorded.");
  return job;
}

