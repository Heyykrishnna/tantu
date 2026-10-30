import type { FastifyInstance } from "fastify";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import type {
  AutomationRule,
  AutomationRun,
  RuleAction,
  RuleCondition,
  TriggerType,
} from "./service.js";
import { evaluateConditions } from "./service.js";

const triggerTypeEnum = {
  enum: ["task.created", "task.completed", "capture.created", "promise.confirmed"],
};

export function automationRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.get<{ Params: { workspaceId: string } }>(
    root + "/rules",
    {
      schema: {
        params: workspaceParams,
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const result = await client.query<AutomationRule>(
          `SELECT
            id,
            workspace_id AS "workspaceId",
            owner_id AS "ownerId",
            name,
            trigger_type AS "triggerType",
            conditions,
            actions,
            is_enabled AS "isEnabled",
            quota_used AS "quotaUsed",
            version,
            created_at::text AS "createdAt"
          FROM tantu.automation_rules
          WHERE workspace_id = $1 AND owner_id = $2
          ORDER BY created_at DESC
          LIMIT 100`,
          [scope.workspaceId, scope.userId]
        );
        return { rules: result.rows };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      name: string;
      triggerType: TriggerType;
      conditions: RuleCondition[];
      actions: RuleAction[];
    };
  }>(
    root + "/rules",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            name: { ...text(100), pattern: "\\S" },
            triggerType: triggerTypeEnum,
            conditions: {
              type: "array",
              items: object(
                {
                  field: { type: "string", maxLength: 50 },
                  operator: { enum: ["equals", "not_equals", "contains"] },
                  value: { type: "string", maxLength: 200 },
                },
                ["field", "operator", "value"]
              ),
              maxItems: 10,
            },
            actions: {
              type: "array",
              items: object(
                {
                  type: { enum: ["set_priority", "assign_user", "create_capture", "request_review"] },
                  targetField: { type: "string", maxLength: 50 },
                  value: { type: "string", maxLength: 200 },
                },
                ["type"]
              ),
              minItems: 1,
              maxItems: 5,
            },
          },
          ["name", "triggerType", "actions"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      const input = request.body;
      return db.transaction(scope, async (client) => {
        const result = await client.query<AutomationRule>(
          `INSERT INTO tantu.automation_rules(
            workspace_id, owner_id, name, trigger_type, conditions, actions
          ) VALUES($1, $2, $3, $4, $5, $6)
          RETURNING
            id,
            workspace_id AS "workspaceId",
            owner_id AS "ownerId",
            name,
            trigger_type AS "triggerType",
            conditions,
            actions,
            is_enabled AS "isEnabled",
            quota_used AS "quotaUsed",
            version,
            created_at::text AS "createdAt"`,
          [
            scope.workspaceId,
            scope.userId,
            input.name.trim(),
            input.triggerType,
            JSON.stringify(input.conditions ?? []),
            JSON.stringify(input.actions),
          ]
        );
        return { rule: result.rows[0] };
      });
    }
  );

  app.patch<{
    Params: { workspaceId: string; ruleId: string };
    Body: {
      name?: string;
      isEnabled?: boolean;
      conditions?: RuleCondition[];
      actions?: RuleAction[];
      expectedVersion: number;
    };
  }>(
    root + "/rules/:ruleId",
    {
      schema: {
        params: object({ workspaceId: uuid, ruleId: uuid }),
        body: object(
          {
            name: { ...text(100), pattern: "\\S" },
            isEnabled: { type: "boolean" },
            conditions: {
              type: "array",
              items: object(
                {
                  field: { type: "string", maxLength: 50 },
                  operator: { enum: ["equals", "not_equals", "contains"] },
                  value: { type: "string", maxLength: 200 },
                },
                ["field", "operator", "value"]
              ),
              maxItems: 10,
            },
            actions: {
              type: "array",
              items: object(
                {
                  type: { enum: ["set_priority", "assign_user", "create_capture", "request_review"] },
                  targetField: { type: "string", maxLength: 50 },
                  value: { type: "string", maxLength: 200 },
                },
                ["type"]
              ),
              minItems: 1,
              maxItems: 5,
            },
            expectedVersion: { type: "integer", minimum: 1 },
          },
          ["expectedVersion"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      const input = request.body;
      return db.transaction(scope, async (client) => {
        const existing = (
          await client.query<{ version: number }>(
            `SELECT version FROM tantu.automation_rules WHERE id = $1 AND workspace_id = $2 AND owner_id = $3 FOR UPDATE`,
            [request.params.ruleId, scope.workspaceId, scope.userId]
          )
        ).rows[0];
        if (!existing) throw new Failure(404, "NOT_FOUND", "Rule not found.");
        if (existing.version !== input.expectedVersion) {
          throw new Failure(409, "VERSION_CONFLICT", "Rule was modified by another transaction.");
        }

        const updates: string[] = ["version = version + 1"];
        const values: unknown[] = [request.params.ruleId, scope.workspaceId, scope.userId];

        if (input.name) {
          values.push(input.name.trim());
          updates.push(`name = $${values.length}`);
        }
        if (input.isEnabled !== undefined) {
          values.push(input.isEnabled);
          updates.push(`is_enabled = $${values.length}`);
        }
        if (input.conditions) {
          values.push(JSON.stringify(input.conditions));
          updates.push(`conditions = $${values.length}`);
        }
        if (input.actions) {
          values.push(JSON.stringify(input.actions));
          updates.push(`actions = $${values.length}`);
        }

        const result = await client.query<AutomationRule>(
          `UPDATE tantu.automation_rules
           SET ${updates.join(", ")}
           WHERE id = $1 AND workspace_id = $2 AND owner_id = $3
           RETURNING
             id,
             workspace_id AS "workspaceId",
             owner_id AS "ownerId",
             name,
             trigger_type AS "triggerType",
             conditions,
             actions,
             is_enabled AS "isEnabled",
             quota_used AS "quotaUsed",
             version,
             created_at::text AS "createdAt"`,
          values
        );
        return { rule: result.rows[0] };
      });
    }
  );

  app.delete<{
    Params: { workspaceId: string; ruleId: string };
  }>(
    root + "/rules/:ruleId",
    {
      schema: {
        params: object({ workspaceId: uuid, ruleId: uuid }),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const result = await client.query(
          `DELETE FROM tantu.automation_rules WHERE id = $1 AND workspace_id = $2 AND owner_id = $3`,
          [request.params.ruleId, scope.workspaceId, scope.userId]
        );
        if (!result.rowCount) throw new Failure(404, "NOT_FOUND", "Rule not found.");
        return { success: true };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; ruleId: string };
  }>(
    root + "/rules/:ruleId/runs",
    {
      schema: {
        params: object({ workspaceId: uuid, ruleId: uuid }),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const result = await client.query<AutomationRun>(
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
          WHERE workspace_id = $1 AND rule_id = $2
          ORDER BY created_at DESC
          LIMIT 50`,
          [scope.workspaceId, request.params.ruleId]
        );
        return { runs: result.rows };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; ruleId: string };
    Body: { targetId: string; context: Record<string, unknown> };
  }>(
    root + "/rules/:ruleId/test",
    {
      schema: {
        params: object({ workspaceId: uuid, ruleId: uuid }),
        body: object(
          {
            targetId: uuid,
            context: { type: "object", additionalProperties: true },
          },
          ["targetId", "context"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const ruleResult = await client.query<AutomationRule>(
          `SELECT
            id,
            workspace_id AS "workspaceId",
            owner_id AS "ownerId",
            name,
            trigger_type AS "triggerType",
            conditions,
            actions,
            is_enabled AS "isEnabled",
            quota_used AS "quotaUsed",
            version,
            created_at::text AS "createdAt"
          FROM tantu.automation_rules
          WHERE id = $1 AND workspace_id = $2 AND owner_id = $3`,
          [request.params.ruleId, scope.workspaceId, scope.userId]
        );
        const rule = ruleResult.rows[0];
        if (!rule) throw new Failure(404, "NOT_FOUND", "Rule not found.");

        const matches = evaluateConditions(rule.conditions, request.body.context);
        return {
          matches,
          simulatedActions: matches ? rule.actions : [],
          quotaRemaining: Math.max(0, 500 - rule.quotaUsed),
          notice: "Test run evaluates conditions without mutating external services.",
        };
      });
    }
  );
}
