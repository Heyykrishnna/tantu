import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export type TriggerType =
  | "task.created"
  | "task.completed"
  | "capture.created"
  | "promise.confirmed";

export interface RuleCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains";
  value: string;
}

export interface RuleAction {
  type: "set_priority" | "assign_user" | "create_capture" | "request_review";
  targetField?: string;
  value?: string;
}

export interface AutomationRule {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  triggerType: TriggerType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  isEnabled: boolean;
  quotaUsed: number;
  version: number;
  createdAt: string;
}

export interface AutomationRun {
  id: string;
  workspaceId: string;
  ruleId: string;
  triggerType: string;
  targetId: string;
  status: "completed" | "failed" | "blocked_review";
  dedupKey: string;
  executedActions: RuleAction[];
  errorMessage: string | null;
  createdAt: string;
}

export function evaluateConditions(
  conditions: RuleCondition[],
  context: Record<string, unknown>
): boolean {
  for (const condition of conditions) {
    const contextValue = String(context[condition.field] ?? "");
    const targetValue = condition.value;
    if (condition.operator === "equals" && contextValue !== targetValue) {
      return false;
    }
    if (condition.operator === "not_equals" && contextValue === targetValue) {
      return false;
    }
    if (
      condition.operator === "contains" &&
      !contextValue.toLowerCase().includes(targetValue.toLowerCase())
    ) {
      return false;
    }
  }
  return true;
}

export async function executeRule(
  client: PoolClient,
  workspaceId: string,
  rule: AutomationRule,
  targetId: string,
  context: Record<string, unknown>
): Promise<AutomationRun> {
  const dedupKey = createHash("sha256")
    .update(`${rule.id}:${targetId}:${rule.triggerType}`)
    .digest("hex");

  const existingRun = await client.query<AutomationRun>(
    `SELECT
      id,
      workspace_id AS "workspaceId",
      rule_id AS "ruleId",
      trigger_type AS "triggerType",
      target_id AS "targetId",
      status,
      dedup_key AS "dedupKey",
      executed_actions AS "executedActions",
      error_message AS "errorMessage",
      created_at::text AS "createdAt"
    FROM tantu.automation_runs
    WHERE dedup_key = $1`,
    [dedupKey]
  );
  if (existingRun.rows[0]) {
    return existingRun.rows[0];
  }

  if (rule.quotaUsed >= 500) {
    throw new Failure(429, "QUOTA_EXCEEDED", "Rule execution quota reached.");
  }

  if (!evaluateConditions(rule.conditions, context)) {
    const runResult = await client.query<AutomationRun>(
      `INSERT INTO tantu.automation_runs(
        workspace_id, rule_id, trigger_type, target_id, status, dedup_key, executed_actions, error_message
      ) VALUES($1, $2, $3, $4, 'completed', $5, '[]', 'Conditions not met')
      RETURNING
        id,
        workspace_id AS "workspaceId",
        rule_id AS "ruleId",
        trigger_type AS "triggerType",
        target_id AS "targetId",
        status,
        dedup_key AS "dedupKey",
        executed_actions AS "executedActions",
        error_message AS "errorMessage",
        created_at::text AS "createdAt"`,
      [workspaceId, rule.id, rule.triggerType, targetId, dedupKey]
    );
    const run = runResult.rows[0];
    if (!run) throw new Failure(500, "DATABASE_ERROR", "Run could not be recorded.");
    return run;
  }

  const executedActions: RuleAction[] = [];
  let requiresReview = false;

  for (const action of rule.actions) {
    if (action.type === "request_review") {
      requiresReview = true;
      executedActions.push(action);
      continue;
    }

    if (action.type === "set_priority" && action.value) {
      await client.query(
        `UPDATE tantu.records SET priority = $1 WHERE id = $2 AND workspace_id = $3`,
        [action.value, targetId, workspaceId]
      );
      executedActions.push(action);
    } else if (action.type === "assign_user" && action.value) {
      await client.query(
        `INSERT INTO tantu.task_coordination(workspace_id, task_id, assignee_id)
         VALUES($1, $2, $3)
         ON CONFLICT(task_id) DO UPDATE SET assignee_id = excluded.assignee_id, version = tantu.task_coordination.version + 1`,
        [workspaceId, targetId, action.value]
      );
      executedActions.push(action);
    } else if (action.type === "create_capture" && action.value) {
      await client.query(
        `INSERT INTO tantu.capture_items(
          workspace_id, user_id, kind, title, content, source_type, source_id
        ) VALUES($1, $2, 'request', $3, $4, 'task', $5)`,
        [workspaceId, rule.ownerId, action.value, JSON.stringify(context), targetId]
      );
      executedActions.push(action);
    }
  }

  await client.query(
    `UPDATE tantu.automation_rules SET quota_used = quota_used + 1 WHERE id = $1`,
    [rule.id]
  );

  const status = requiresReview ? "blocked_review" : "completed";
  const runResult = await client.query<AutomationRun>(
    `INSERT INTO tantu.automation_runs(
      workspace_id, rule_id, trigger_type, target_id, status, dedup_key, executed_actions
    ) VALUES($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      id,
      workspace_id AS "workspaceId",
      rule_id AS "ruleId",
      trigger_type AS "triggerType",
      target_id AS "targetId",
      status,
      dedup_key AS "dedupKey",
      executed_actions AS "executedActions",
      error_message AS "errorMessage",
      created_at::text AS "createdAt"`,
    [workspaceId, rule.id, rule.triggerType, targetId, status, dedupKey, JSON.stringify(executedActions)]
  );
  const run = runResult.rows[0];
  if (!run) throw new Failure(500, "DATABASE_ERROR", "Run could not be recorded.");
  return run;
}
