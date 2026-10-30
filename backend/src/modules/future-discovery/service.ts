import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export interface SharingExposurePreviewRecord {
  id: string;
  workspaceId: string;
  targetRecordId: string;
  targetRecordType: "page" | "task" | "project" | "collection";
  recipientEmail: string;
  accessLevel: "view" | "comment" | "edit" | "admin";
  inheritedAccess: Array<{ sourceId: string; sourceType: string; role: string }>;
  inaccessibleReferences: Array<{ referenceId: string; referenceType: string; title: string }>;
  exposureSummary: string;
  createdAt: string;
}

export interface HandoverPackRecord {
  id: string;
  workspaceId: string;
  title: string;
  fromUserId: string;
  toUserEmail: string;
  handoverToken: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  recordIds: string[];
  checklist: Array<{ task: string; completed: boolean }>;
  notes: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface KnowledgeFreshnessRecord {
  id: string;
  workspaceId: string;
  pageId: string;
  reviewCadenceDays: number;
  lastReviewedAt: string;
  freshnessStatus: "fresh" | "due_for_review" | "stale";
  sourceChangeAlerts: string[];
  updatedAt: string;
}

export interface ScenarioModification {
  entityId: string;
  field: string;
  baselineValue: unknown;
  simulatedValue: unknown;
}

export interface ScenarioImpactSummary {
  deadlineShiftDays: number;
  workloadDeltaHours: number;
  impactedCommitmentCount: number;
  feasibility: "feasible" | "tight" | "infeasible";
}

export interface ScenarioPlanRecord {
  id: string;
  workspaceId: string;
  name: string;
  baselineProjectId: string | null;
  description: string | null;
  modifications: ScenarioModification[];
  impactSummary: ScenarioImpactSummary;
  createdAt: string;
  updatedAt: string;
}

export interface AttentionBudgetRecord {
  workspaceId: string;
  userId: string;
  focusWindowStart: string;
  focusWindowEnd: string;
  batchingIntervalMinutes: number;
  urgentBypassEnabled: boolean;
}

export async function evaluateExposureMap(
  client: PoolClient,
  workspaceId: string,
  targetRecordId: string,
  targetRecordType: "page" | "task" | "project" | "collection",
  recipientEmail: string,
  accessLevel: "view" | "comment" | "edit" | "admin",
  evaluatedBy?: string
): Promise<SharingExposurePreviewRecord> {
  const inheritedAccess = [
    {
      sourceId: workspaceId,
      sourceType: "workspace",
      role: "member"
    }
  ];

  const inaccessibleReferences: Array<{ referenceId: string; referenceType: string; title: string }> = [];

  const summary = `Sharing ${targetRecordType} '${targetRecordId}' with ${recipientEmail} grants direct ${accessLevel} rights. Recipient will inherit standard workspace read visibility.`;

  const result = await client.query<{
    id: string;
    workspace_id: string;
    target_record_id: string;
    target_record_type: "page" | "task" | "project" | "collection";
    recipient_email: string;
    access_level: "view" | "comment" | "edit" | "admin";
    inherited_access: Array<{ sourceId: string; sourceType: string; role: string }>;
    inaccessible_references: Array<{ referenceId: string; referenceType: string; title: string }>;
    exposure_summary: string;
    created_at: string;
  }>(
    `INSERT INTO tantu.sharing_exposure_previews(
       workspace_id, target_record_id, target_record_type, recipient_email,
       access_level, inherited_access, inaccessible_references, exposure_summary, evaluated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, workspace_id, target_record_id, target_record_type, recipient_email,
               access_level, inherited_access, inaccessible_references, exposure_summary, created_at`,
    [
      workspaceId,
      targetRecordId,
      targetRecordType,
      recipientEmail,
      accessLevel,
      JSON.stringify(inheritedAccess),
      JSON.stringify(inaccessibleReferences),
      summary,
      evaluatedBy ?? null
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to evaluate exposure map");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    targetRecordId: row.target_record_id,
    targetRecordType: row.target_record_type,
    recipientEmail: row.recipient_email,
    accessLevel: row.access_level,
    inheritedAccess: row.inherited_access,
    inaccessibleReferences: row.inaccessible_references,
    exposureSummary: row.exposure_summary,
    createdAt: row.created_at
  };
}

export async function listExposurePreviews(
  client: PoolClient,
  workspaceId: string
): Promise<SharingExposurePreviewRecord[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    target_record_id: string;
    target_record_type: "page" | "task" | "project" | "collection";
    recipient_email: string;
    access_level: "view" | "comment" | "edit" | "admin";
    inherited_access: Array<{ sourceId: string; sourceType: string; role: string }>;
    inaccessible_references: Array<{ referenceId: string; referenceType: string; title: string }>;
    exposure_summary: string;
    created_at: string;
  }>(
    `SELECT id, workspace_id, target_record_id, target_record_type, recipient_email,
            access_level, inherited_access, inaccessible_references, exposure_summary, created_at
     FROM tantu.sharing_exposure_previews
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [workspaceId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    targetRecordId: row.target_record_id,
    targetRecordType: row.target_record_type,
    recipientEmail: row.recipient_email,
    accessLevel: row.access_level,
    inheritedAccess: row.inherited_access,
    inaccessibleReferences: row.inaccessible_references,
    exposureSummary: row.exposure_summary,
    createdAt: row.created_at
  }));
}

export async function createHandoverPack(
  client: PoolClient,
  workspaceId: string,
  params: {
    title: string;
    fromUserId: string;
    toUserEmail: string;
    recordIds: string[];
    checklist?: Array<{ task: string; completed: boolean }> | undefined;
    notes?: string | undefined;
    expiryDays?: number | undefined;
  }
): Promise<HandoverPackRecord> {
  const token = `hnd_${randomBytes(24).toString("hex")}`;
  const days = params.expiryDays && params.expiryDays > 0 ? params.expiryDays : 14;
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const defaultChecklist = params.checklist && params.checklist.length > 0
    ? params.checklist
    : [
      { task: "Review active task assignments and deadlines", completed: false },
      { task: "Inspect connected document pages and permissions", completed: false },
      { task: "Confirm delivery commitment handover with stakeholders", completed: false }
    ];

  const result = await client.query<{
    id: string;
    workspace_id: string;
    title: string;
    from_user_id: string;
    to_user_email: string;
    handover_token: string;
    status: "pending" | "accepted" | "revoked" | "expired";
    record_ids: string[];
    checklist: Array<{ task: string; completed: boolean }>;
    notes: string | null;
    expires_at: string;
    accepted_at: string | null;
    created_at: string;
  }>(
    `INSERT INTO tantu.handover_packs(
       workspace_id, title, from_user_id, to_user_email, handover_token,
       status, record_ids, checklist, notes, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)
     RETURNING id, workspace_id, title, from_user_id, to_user_email, handover_token,
               status, record_ids, checklist, notes, expires_at, accepted_at, created_at`,
    [
      workspaceId,
      params.title,
      params.fromUserId,
      params.toUserEmail,
      token,
      JSON.stringify(params.recordIds),
      JSON.stringify(defaultChecklist),
      params.notes ?? null,
      expiresAt
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to create handover pack");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    fromUserId: row.from_user_id,
    toUserEmail: row.to_user_email,
    handoverToken: row.handover_token,
    status: row.status,
    recordIds: row.record_ids,
    checklist: row.checklist,
    notes: row.notes,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at
  };
}

export async function listHandoverPacks(
  client: PoolClient,
  workspaceId: string
): Promise<HandoverPackRecord[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    title: string;
    from_user_id: string;
    to_user_email: string;
    handover_token: string;
    status: "pending" | "accepted" | "revoked" | "expired";
    record_ids: string[];
    checklist: Array<{ task: string; completed: boolean }>;
    notes: string | null;
    expires_at: string;
    accepted_at: string | null;
    created_at: string;
  }>(
    `SELECT id, workspace_id, title, from_user_id, to_user_email, handover_token,
            status, record_ids, checklist, notes, expires_at, accepted_at, created_at
     FROM tantu.handover_packs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [workspaceId]
  );

  const now = Date.now();
  return result.rows.map((row) => {
    let status = row.status;
    if (status === "pending" && new Date(row.expires_at).getTime() < now) {
      status = "expired";
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      fromUserId: row.from_user_id,
      toUserEmail: row.to_user_email,
      handoverToken: row.handover_token,
      status,
      recordIds: row.record_ids,
      checklist: row.checklist,
      notes: row.notes,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at
    };
  });
}

export async function acceptHandoverPack(
  client: PoolClient,
  workspaceId: string,
  handoverToken: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE tantu.handover_packs
     SET status = 'accepted', accepted_at = now()
     WHERE workspace_id = $1 AND handover_token = $2 AND status = 'pending' AND expires_at > now()`,
    [workspaceId, handoverToken]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function revokeHandoverPack(
  client: PoolClient,
  workspaceId: string,
  packId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE tantu.handover_packs
     SET status = 'revoked'
     WHERE workspace_id = $1 AND id = $2 AND status = 'pending'`,
    [workspaceId, packId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listFreshnessReviews(
  client: PoolClient,
  workspaceId: string
): Promise<KnowledgeFreshnessRecord[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    page_id: string;
    review_cadence_days: number;
    last_reviewed_at: string;
    freshness_status: "fresh" | "due_for_review" | "stale";
    source_change_alerts: string[];
    updated_at: string;
  }>(
    `SELECT id, workspace_id, page_id, review_cadence_days, last_reviewed_at,
            freshness_status, source_change_alerts, updated_at
     FROM tantu.knowledge_freshness_reviews
     WHERE workspace_id = $1
     ORDER BY updated_at DESC`,
    [workspaceId]
  );

  const now = Date.now();
  return result.rows.map((row) => {
    const lastRevMs = new Date(row.last_reviewed_at).getTime();
    const ageDays = (now - lastRevMs) / 86_400_000;
    let computedStatus: "fresh" | "due_for_review" | "stale" = "fresh";

    if (ageDays > row.review_cadence_days) {
      computedStatus = "stale";
    } else if (ageDays >= row.review_cadence_days * 0.8) {
      computedStatus = "due_for_review";
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      pageId: row.page_id,
      reviewCadenceDays: row.review_cadence_days,
      lastReviewedAt: row.last_reviewed_at,
      freshnessStatus: computedStatus,
      sourceChangeAlerts: row.source_change_alerts,
      updatedAt: row.updated_at
    };
  });
}

export async function recordFreshnessVerification(
  client: PoolClient,
  workspaceId: string,
  pageId: string,
  reviewCadenceDays = 90,
  verifiedBy?: string
): Promise<KnowledgeFreshnessRecord> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    page_id: string;
    review_cadence_days: number;
    last_reviewed_at: string;
    freshness_status: "fresh" | "due_for_review" | "stale";
    source_change_alerts: string[];
    updated_at: string;
  }>(
    `INSERT INTO tantu.knowledge_freshness_reviews(
       workspace_id, page_id, review_cadence_days, last_reviewed_at, last_reviewed_by,
       freshness_status, source_change_alerts, updated_at
     )
     VALUES ($1, $2, $3, now(), $4, 'fresh', '[]', now())
     ON CONFLICT (workspace_id, page_id) DO UPDATE
     SET last_reviewed_at = now(),
         last_reviewed_by = EXCLUDED.last_reviewed_by,
         review_cadence_days = EXCLUDED.review_cadence_days,
         freshness_status = 'fresh',
         source_change_alerts = '[]',
         updated_at = now()
     RETURNING id, workspace_id, page_id, review_cadence_days, last_reviewed_at,
               freshness_status, source_change_alerts, updated_at`,
    [workspaceId, pageId, reviewCadenceDays, verifiedBy ?? null]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to update page freshness");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    pageId: row.page_id,
    reviewCadenceDays: row.review_cadence_days,
    lastReviewedAt: row.last_reviewed_at,
    freshnessStatus: row.freshness_status,
    sourceChangeAlerts: row.source_change_alerts,
    updatedAt: row.updated_at
  };
}

export function calculateScenarioImpact(modifications: ScenarioModification[]): ScenarioImpactSummary {
  let deadlineShiftDays = 0;
  let workloadDeltaHours = 0;
  let impactedCommitmentCount = 0;

  for (const mod of modifications) {
    if (mod.field === "deadline" && typeof mod.baselineValue === "string" && typeof mod.simulatedValue === "string") {
      const bMs = new Date(mod.baselineValue).getTime();
      const sMs = new Date(mod.simulatedValue).getTime();
      if (!isNaN(bMs) && !isNaN(sMs)) {
        const deltaDays = Math.round((sMs - bMs) / 86_400_000);
        deadlineShiftDays += deltaDays;
        impactedCommitmentCount += 1;
      }
    } else if (mod.field === "estimateMinutes") {
      const bMin = typeof mod.baselineValue === "number" ? mod.baselineValue : 0;
      const sMin = typeof mod.simulatedValue === "number" ? mod.simulatedValue : 0;
      workloadDeltaHours += Math.round(((sMin - bMin) / 60) * 10) / 10;
      impactedCommitmentCount += 1;
    }
  }

  let feasibility: "feasible" | "tight" | "infeasible" = "feasible";
  if (deadlineShiftDays < -5 || workloadDeltaHours > 20) {
    feasibility = "infeasible";
  } else if (deadlineShiftDays < 0 || workloadDeltaHours > 5) {
    feasibility = "tight";
  }

  return {
    deadlineShiftDays,
    workloadDeltaHours,
    impactedCommitmentCount,
    feasibility
  };
}

export async function createScenarioPlan(
  client: PoolClient,
  workspaceId: string,
  params: {
    name: string;
    baselineProjectId?: string | undefined;
    description?: string | undefined;
    modifications: ScenarioModification[];
    createdBy?: string | undefined;
  }
): Promise<ScenarioPlanRecord> {
  const impactSummary = calculateScenarioImpact(params.modifications);

  const result = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    baseline_project_id: string | null;
    description: string | null;
    modifications: ScenarioModification[];
    impact_summary: ScenarioImpactSummary;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO tantu.scenario_plans(
       workspace_id, name, baseline_project_id, description, modifications, impact_summary, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, workspace_id, name, baseline_project_id, description, modifications, impact_summary, created_at, updated_at`,
    [
      workspaceId,
      params.name,
      params.baselineProjectId ?? null,
      params.description ?? null,
      JSON.stringify(params.modifications),
      JSON.stringify(impactSummary),
      params.createdBy ?? null
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to create scenario plan");
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    baselineProjectId: row.baseline_project_id,
    description: row.description,
    modifications: row.modifications,
    impactSummary: row.impact_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listScenarioPlans(
  client: PoolClient,
  workspaceId: string
): Promise<ScenarioPlanRecord[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    baseline_project_id: string | null;
    description: string | null;
    modifications: ScenarioModification[];
    impact_summary: ScenarioImpactSummary;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, workspace_id, name, baseline_project_id, description, modifications, impact_summary, created_at, updated_at
     FROM tantu.scenario_plans
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [workspaceId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    baselineProjectId: row.baseline_project_id,
    description: row.description,
    modifications: row.modifications,
    impactSummary: row.impact_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function getAttentionBudget(
  client: PoolClient,
  workspaceId: string,
  userId: string
): Promise<AttentionBudgetRecord> {
  const result = await client.query<{
    workspace_id: string;
    user_id: string;
    focus_window_start: string;
    focus_window_end: string;
    batching_interval_minutes: number;
    urgent_bypass_enabled: boolean;
  }>(
    `SELECT workspace_id, user_id, focus_window_start, focus_window_end, batching_interval_minutes, urgent_bypass_enabled
     FROM tantu.attention_budgets
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      workspaceId,
      userId,
      focusWindowStart: "09:00",
      focusWindowEnd: "12:00",
      batchingIntervalMinutes: 60,
      urgentBypassEnabled: true
    };
  }

  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    focusWindowStart: row.focus_window_start,
    focusWindowEnd: row.focus_window_end,
    batchingIntervalMinutes: row.batching_interval_minutes,
    urgentBypassEnabled: row.urgent_bypass_enabled
  };
}

export async function updateAttentionBudget(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  params: {
    focusWindowStart?: string | undefined;
    focusWindowEnd?: string | undefined;
    batchingIntervalMinutes?: number | undefined;
    urgentBypassEnabled?: boolean | undefined;
  }
): Promise<AttentionBudgetRecord> {
  const current = await getAttentionBudget(client, workspaceId, userId);

  const start = params.focusWindowStart ?? current.focusWindowStart;
  const end = params.focusWindowEnd ?? current.focusWindowEnd;
  const interval = params.batchingIntervalMinutes ?? current.batchingIntervalMinutes;
  const bypass = params.urgentBypassEnabled ?? current.urgentBypassEnabled;

  const result = await client.query<{
    workspace_id: string;
    user_id: string;
    focus_window_start: string;
    focus_window_end: string;
    batching_interval_minutes: number;
    urgent_bypass_enabled: boolean;
  }>(
    `INSERT INTO tantu.attention_budgets(
       workspace_id, user_id, focus_window_start, focus_window_end, batching_interval_minutes, urgent_bypass_enabled
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, user_id) DO UPDATE
     SET focus_window_start = EXCLUDED.focus_window_start,
         focus_window_end = EXCLUDED.focus_window_end,
         batching_interval_minutes = EXCLUDED.batching_interval_minutes,
         urgent_bypass_enabled = EXCLUDED.urgent_bypass_enabled,
         updated_at = now()
     RETURNING workspace_id, user_id, focus_window_start, focus_window_end, batching_interval_minutes, urgent_bypass_enabled`,
    [workspaceId, userId, start, end, interval, bypass]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Failure(500, "INTERNAL_ERROR", "Failed to update attention budget");
  }

  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    focusWindowStart: row.focus_window_start,
    focusWindowEnd: row.focus_window_end,
    batchingIntervalMinutes: row.batching_interval_minutes,
    urgentBypassEnabled: row.urgent_bypass_enabled
  };
}
