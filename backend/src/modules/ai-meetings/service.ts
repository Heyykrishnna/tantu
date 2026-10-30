import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export interface AiWorkspaceSettingsRecord {
  workspaceId: string;
  isEnabled: boolean;
  provider: "local-deterministic" | "openai" | "gemini" | "anthropic";
  allowedScopes: string[];
  maxMonthlyTokens: number;
  usedMonthlyTokens: number;
  updatedAt: string;
}

export interface SourceCitation {
  sourceId: string;
  sourceType: string;
  excerpt: string;
  timestamp: string;
}

export interface ActionItem {
  title: string;
  assignee?: string;
  dueDate?: string;
}

export interface MeetingBriefRecord {
  id: string;
  workspaceId: string;
  eventId: string;
  title: string;
  meetingDate: string;
  attendees: Array<{ name: string; email: string }>;
  linkedTaskIds: string[];
  linkedDecisionIds: string[];
  linkedPromiseIds: string[];
  keyTopics: string[];
  citations: SourceCitation[];
  actionItems: ActionItem[];
  generationMode: "deterministic" | "assisted";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function getAiSettings(
  client: PoolClient,
  workspaceId: string
): Promise<AiWorkspaceSettingsRecord> {
  const result = await client.query(
    `SELECT workspace_id AS "workspaceId", is_enabled AS "isEnabled", provider,
            allowed_scopes AS "allowedScopes", max_monthly_tokens AS "maxMonthlyTokens",
            used_monthly_tokens AS "usedMonthlyTokens", updated_at::text AS "updatedAt"
     FROM tantu.ai_workspace_settings
     WHERE workspace_id = $1`,
    [workspaceId]
  );

  if (result.rows.length === 0) {
    return {
      workspaceId,
      isEnabled: false,
      provider: "local-deterministic",
      allowedScopes: ["meeting_briefs", "task_summaries"],
      maxMonthlyTokens: 100000,
      usedMonthlyTokens: 0,
      updatedAt: new Date().toISOString()
    };
  }

  return result.rows[0] as AiWorkspaceSettingsRecord;
}

export async function updateAiSettings(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  input: {
    isEnabled: boolean;
    provider?: "local-deterministic" | "openai" | "gemini" | "anthropic";
    allowedScopes?: string[];
    maxMonthlyTokens?: number;
  }
): Promise<AiWorkspaceSettingsRecord> {
  const provider = input.provider ?? "local-deterministic";
  const scopes = JSON.stringify(input.allowedScopes ?? ["meeting_briefs", "task_summaries"]);
  const maxTokens = input.maxMonthlyTokens ?? 100000;

  const result = await client.query(
    `INSERT INTO tantu.ai_workspace_settings(
       workspace_id, is_enabled, provider, allowed_scopes, max_monthly_tokens, updated_by, updated_at
     ) VALUES($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (workspace_id)
     DO UPDATE SET is_enabled = EXCLUDED.is_enabled, provider = EXCLUDED.provider,
                   allowed_scopes = EXCLUDED.allowed_scopes, max_monthly_tokens = EXCLUDED.max_monthly_tokens,
                   updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING
       workspace_id AS "workspaceId", is_enabled AS "isEnabled", provider,
       allowed_scopes AS "allowedScopes", max_monthly_tokens AS "maxMonthlyTokens",
       used_monthly_tokens AS "usedMonthlyTokens", updated_at::text AS "updatedAt"`,
    [workspaceId, input.isEnabled, provider, scopes, maxTokens, userId]
  );

  return result.rows[0] as AiWorkspaceSettingsRecord;
}

export async function generateMeetingBrief(
  client: PoolClient,
  workspaceId: string,
  eventId: string,
  input: {
    title: string;
    meetingDate?: string;
    attendees?: Array<{ name: string; email: string }>;
  }
): Promise<MeetingBriefRecord> {
  if (!input.title || input.title.trim().length === 0 || input.title.length > 200) {
    throw new Failure(400, "INVALID_INPUT", "Meeting title must be between 1 and 200 characters.");
  }

  const meetingDate = input.meetingDate ?? new Date().toISOString().slice(0, 10);
  const attendees = input.attendees ?? [];

  const tasksResult = await client.query(
    `SELECT id, title, priority, deadline::text AS deadline
     FROM tantu.records
     WHERE workspace_id = $1 AND kind = 'task' AND status = 'open'
     ORDER BY
       CASE priority
         WHEN 'urgent' THEN 1
         WHEN 'high' THEN 2
         WHEN 'normal' THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT 5`,
    [workspaceId]
  );

  const decisionsResult = await client.query(
    `SELECT id, title, rationale, decision_date::text AS "decisionDate"
     FROM tantu.decisions
     WHERE workspace_id = $1 AND status = 'confirmed'
     ORDER BY decision_date DESC, created_at DESC
     LIMIT 3`,
    [workspaceId]
  );

  const promisesResult = await client.query(
    `SELECT id, title, status, agreed_date::text AS "agreedDate"
     FROM tantu.promises
     WHERE workspace_id = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 3`,
    [workspaceId]
  );

  const linkedTaskIds = tasksResult.rows.map((r: { id: string }) => r.id);
  const linkedDecisionIds = decisionsResult.rows.map((r: { id: string }) => r.id);
  const linkedPromiseIds = promisesResult.rows.map((r: { id: string }) => r.id);

  const citations: SourceCitation[] = [];
  const keyTopics: string[] = [`Review objectives for ${input.title.trim()}`];
  const actionItems: ActionItem[] = [];

  for (const t of tasksResult.rows as Array<{ id: string; title: string; priority: string }>) {
    citations.push({
      sourceId: t.id,
      sourceType: "task",
      excerpt: `Open ${t.priority} task: ${t.title}`,
      timestamp: new Date().toISOString()
    });
    keyTopics.push(`Work progress: ${t.title}`);
  }

  for (const d of decisionsResult.rows as Array<{ id: string; title: string; rationale: string; decisionDate: string }>) {
    citations.push({
      sourceId: d.id,
      sourceType: "decision",
      excerpt: `Confirmed on ${d.decisionDate}: ${d.title}`,
      timestamp: new Date().toISOString()
    });
    keyTopics.push(`Architectural alignment: ${d.title}`);
  }

  for (const p of promisesResult.rows as Array<{ id: string; title: string; agreedDate: string }>) {
    actionItems.push({
      title: `Verify commitment: ${p.title}`,
      dueDate: p.agreedDate
    });
  }

  const result = await client.query(
    `INSERT INTO tantu.meeting_briefs(
       workspace_id, event_id, title, meeting_date, attendees,
       linked_task_ids, linked_decision_ids, linked_promise_ids,
       key_topics, citations, action_items, generation_mode, version
     ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'deterministic', 1)
     ON CONFLICT (workspace_id, event_id)
     DO UPDATE SET title = EXCLUDED.title, meeting_date = EXCLUDED.meeting_date,
                   attendees = EXCLUDED.attendees, linked_task_ids = EXCLUDED.linked_task_ids,
                   linked_decision_ids = EXCLUDED.linked_decision_ids, linked_promise_ids = EXCLUDED.linked_promise_ids,
                   key_topics = EXCLUDED.key_topics, citations = EXCLUDED.citations,
                   action_items = EXCLUDED.action_items, version = tantu.meeting_briefs.version + 1, updated_at = now()
     RETURNING
       id, workspace_id AS "workspaceId", event_id AS "eventId", title,
       meeting_date::text AS "meetingDate", attendees,
       linked_task_ids AS "linkedTaskIds", linked_decision_ids AS "linkedDecisionIds",
       linked_promise_ids AS "linkedPromiseIds", key_topics AS "keyTopics",
       citations, action_items AS "actionItems", generation_mode AS "generationMode",
       version, created_at::text AS "createdAt", updated_at::text AS "updatedAt"`,
    [
      workspaceId,
      eventId,
      input.title.trim(),
      meetingDate,
      JSON.stringify(attendees),
      JSON.stringify(linkedTaskIds),
      JSON.stringify(linkedDecisionIds),
      JSON.stringify(linkedPromiseIds),
      JSON.stringify(keyTopics),
      JSON.stringify(citations),
      JSON.stringify(actionItems)
    ]
  );

  return result.rows[0] as MeetingBriefRecord;
}

export async function listMeetingBriefs(
  client: PoolClient,
  workspaceId: string
): Promise<MeetingBriefRecord[]> {
  const result = await client.query(
    `SELECT id, workspace_id AS "workspaceId", event_id AS "eventId", title,
            meeting_date::text AS "meetingDate", attendees,
            linked_task_ids AS "linkedTaskIds", linked_decision_ids AS "linkedDecisionIds",
            linked_promise_ids AS "linkedPromiseIds", key_topics AS "keyTopics",
            citations, action_items AS "actionItems", generation_mode AS "generationMode",
            version, created_at::text AS "createdAt", updated_at::text AS "updatedAt"
     FROM tantu.meeting_briefs
     WHERE workspace_id = $1
     ORDER BY meeting_date DESC, created_at DESC`,
    [workspaceId]
  );

  return result.rows as MeetingBriefRecord[];
}

export async function getMeetingBrief(
  client: PoolClient,
  workspaceId: string,
  eventId: string
): Promise<MeetingBriefRecord | null> {
  const result = await client.query(
    `SELECT id, workspace_id AS "workspaceId", event_id AS "eventId", title,
            meeting_date::text AS "meetingDate", attendees,
            linked_task_ids AS "linkedTaskIds", linked_decision_ids AS "linkedDecisionIds",
            linked_promise_ids AS "linkedPromiseIds", key_topics AS "keyTopics",
            citations, action_items AS "actionItems", generation_mode AS "generationMode",
            version, created_at::text AS "createdAt", updated_at::text AS "updatedAt"
     FROM tantu.meeting_briefs
     WHERE workspace_id = $1 AND event_id = $2`,
    [workspaceId, eventId]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0] as MeetingBriefRecord;
}
