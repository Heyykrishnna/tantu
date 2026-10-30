import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export type DailyPlanStatus = "draft" | "reviewed" | "applied" | "canceled";
export type WorkloadWeatherState = "clear" | "tight" | "overloaded";

export interface DailyPlanRecord {
  id: string;
  workspaceId: string;
  userId: string;
  planDate: string;
  targetHours: number;
  allocatedHours: number;
  status: DailyPlanStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  blocks?: DailyPlanBlockRecord[];
}

export interface DailyPlanBlockRecord {
  id: string;
  planId: string;
  taskId: string | null;
  title: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  placementReason: string;
  unplacedReason: string | null;
  isPlaced: boolean;
  createdAt: string;
}

export interface WorkloadWeatherRecord {
  horizon: "day" | "week";
  totalCapacityHours: number;
  estimatedEffortHours: number;
  ratio: number;
  weather: WorkloadWeatherState;
  missingEstimateCount: number;
  uncertainItemCount: number;
  explanation: string;
}

interface CandidateTask {
  id: string;
  title: string;
  priority: string;
  deadline: string | null;
  estimateMinutes: number | null;
}

export async function generateDailyPlan(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  planDate: string,
  targetHours: number = 8.0
): Promise<DailyPlanRecord> {
  const boundedTarget = Math.min(Math.max(targetHours, 1.0), 16.0);

  const tasksResult = await client.query(
    `SELECT id, title, priority, deadline::text AS deadline, estimate_minutes AS "estimateMinutes"
     FROM tantu.records
     WHERE workspace_id = $1 AND kind = 'task' AND status = 'open'
     ORDER BY
       CASE priority
         WHEN 'urgent' THEN 1
         WHEN 'high' THEN 2
         WHEN 'normal' THEN 3
         ELSE 4
       END,
       deadline ASC NULLS LAST,
       created_at ASC
     LIMIT 50`,
    [workspaceId]
  );

  const candidateTasks = tasksResult.rows as CandidateTask[];

  const depResult = await client.query(
    `SELECT td.task_id AS "taskId", td.prerequisite_id AS "prerequisiteId"
     FROM tantu.task_dependencies td
     JOIN tantu.records r ON r.id = td.prerequisite_id
     WHERE td.workspace_id = $1 AND r.status = 'open'`,
    [workspaceId]
  );

  const blockedTaskIds = new Set<string>();
  for (const row of depResult.rows) {
    blockedTaskIds.add(row.taskId as string);
  }

  const planResult = await client.query(
    `INSERT INTO tantu.daily_plans(
       workspace_id, user_id, plan_date, target_hours, allocated_hours, status, version
     ) VALUES($1, $2, $3, $4, 0.00, 'draft', 1)
     ON CONFLICT (workspace_id, user_id, plan_date)
     DO UPDATE SET target_hours = EXCLUDED.target_hours, status = 'draft', version = tantu.daily_plans.version + 1, updated_at = now()
     RETURNING
       id, workspace_id AS "workspaceId", user_id AS "userId",
       plan_date::text AS "planDate", target_hours::float AS "targetHours",
       allocated_hours::float AS "allocatedHours", status, version,
       created_at::text AS "createdAt", updated_at::text AS "updatedAt"`,
    [workspaceId, userId, planDate, boundedTarget]
  );

  const plan = planResult.rows[0] as DailyPlanRecord;

  await client.query(`DELETE FROM tantu.daily_plan_blocks WHERE plan_id = $1`, [plan.id]);

  let allocatedMinutes = 0;
  const maxMinutes = Math.round(boundedTarget * 60);
  const blocks: DailyPlanBlockRecord[] = [];

  let currentSlotStart = new Date(`${planDate}T09:00:00.000Z`);

  for (const task of candidateTasks) {
    if (blockedTaskIds.has(task.id)) {
      const blockRes = await client.query(
        `INSERT INTO tantu.daily_plan_blocks(
           plan_id, task_id, title, duration_minutes, placement_reason, unplaced_reason, is_placed
         ) VALUES($1, $2, $3, $4, '', $5, false)
         RETURNING
           id, plan_id AS "planId", task_id AS "taskId", title,
           start_time::text AS "startTime", end_time::text AS "endTime",
           duration_minutes AS "durationMinutes", placement_reason AS "placementReason",
           unplaced_reason AS "unplacedReason", is_placed AS "isPlaced",
           created_at::text AS "createdAt"`,
        [plan.id, task.id, task.title, 30, "Blocked by unresolved prerequisite dependency."]
      );
      blocks.push(blockRes.rows[0] as DailyPlanBlockRecord);
      continue;
    }

    const duration = task.estimateMinutes && task.estimateMinutes > 0 ? task.estimateMinutes : 30;

    if (allocatedMinutes + duration > maxMinutes) {
      const blockRes = await client.query(
        `INSERT INTO tantu.daily_plan_blocks(
           plan_id, task_id, title, duration_minutes, placement_reason, unplaced_reason, is_placed
         ) VALUES($1, $2, $3, $4, '', $5, false)
         RETURNING
           id, plan_id AS "planId", task_id AS "taskId", title,
           start_time::text AS "startTime", end_time::text AS "endTime",
           duration_minutes AS "durationMinutes", placement_reason AS "placementReason",
           unplaced_reason AS "unplacedReason", is_placed AS "isPlaced",
           created_at::text AS "createdAt"`,
        [
          plan.id,
          task.id,
          task.title,
          duration,
          `Exceeds remaining daily target capacity (${boundedTarget}h).`
        ]
      );
      blocks.push(blockRes.rows[0] as DailyPlanBlockRecord);
      continue;
    }

    const slotEnd = new Date(currentSlotStart.getTime() + duration * 60_000);
    const placementReason = `Placed based on ${task.priority} priority with ${duration}m scheduled duration.`;

    const blockRes = await client.query(
      `INSERT INTO tantu.daily_plan_blocks(
         plan_id, task_id, title, start_time, end_time, duration_minutes,
         placement_reason, unplaced_reason, is_placed
       ) VALUES($1, $2, $3, $4, $5, $6, $7, null, true)
       RETURNING
         id, plan_id AS "planId", task_id AS "taskId", title,
         start_time::text AS "startTime", end_time::text AS "endTime",
         duration_minutes AS "durationMinutes", placement_reason AS "placementReason",
         unplaced_reason AS "unplacedReason", is_placed AS "isPlaced",
         created_at::text AS "createdAt"`,
      [
        plan.id,
        task.id,
        task.title,
        currentSlotStart.toISOString(),
        slotEnd.toISOString(),
        duration,
        placementReason
      ]
    );

    blocks.push(blockRes.rows[0] as DailyPlanBlockRecord);
    allocatedMinutes += duration;
    currentSlotStart = new Date(slotEnd.getTime() + 15 * 60_000);
  }

  const finalAllocatedHours = Number((allocatedMinutes / 60).toFixed(2));
  await client.query(
    `UPDATE tantu.daily_plans SET allocated_hours = $1 WHERE id = $2`,
    [finalAllocatedHours, plan.id]
  );
  plan.allocatedHours = finalAllocatedHours;
  plan.blocks = blocks;

  return plan;
}

export async function getDailyPlan(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  planDate: string
): Promise<DailyPlanRecord | null> {
  const planResult = await client.query(
    `SELECT id, workspace_id AS "workspaceId", user_id AS "userId",
            plan_date::text AS "planDate", target_hours::float AS "targetHours",
            allocated_hours::float AS "allocatedHours", status, version,
            created_at::text AS "createdAt", updated_at::text AS "updatedAt"
     FROM tantu.daily_plans
     WHERE workspace_id = $1 AND user_id = $2 AND plan_date = $3::date`,
    [workspaceId, userId, planDate]
  );

  if (planResult.rows.length === 0) return null;
  const plan = planResult.rows[0] as DailyPlanRecord;

  const blocksResult = await client.query(
    `SELECT id, plan_id AS "planId", task_id AS "taskId", title,
            start_time::text AS "startTime", end_time::text AS "endTime",
            duration_minutes AS "durationMinutes", placement_reason AS "placementReason",
            unplaced_reason AS "unplacedReason", is_placed AS "isPlaced",
            created_at::text AS "createdAt"
     FROM tantu.daily_plan_blocks
     WHERE plan_id = $1
     ORDER BY is_placed DESC, start_time ASC NULLS LAST`,
    [plan.id]
  );

  plan.blocks = blocksResult.rows as DailyPlanBlockRecord[];
  return plan;
}

export async function applyDailyPlan(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  planId: string,
  expectedVersion: number
): Promise<DailyPlanRecord> {
  const planResult = await client.query(
    `SELECT id, workspace_id AS "workspaceId", user_id AS "userId",
            plan_date::text AS "planDate", target_hours::float AS "targetHours",
            allocated_hours::float AS "allocatedHours", status, version,
            created_at::text AS "createdAt", updated_at::text AS "updatedAt"
     FROM tantu.daily_plans
     WHERE workspace_id = $1 AND id = $2 AND user_id = $3`,
    [workspaceId, planId, userId]
  );

  if (planResult.rows.length === 0) {
    throw new Failure(404, "NOT_FOUND", "Daily plan not found.");
  }

  const plan = planResult.rows[0] as DailyPlanRecord;
  if (plan.version !== expectedVersion) {
    throw new Failure(409, "CONFLICT", "Daily plan version conflict. Re-generate or review first.");
  }
  if (plan.status === "applied") {
    throw new Failure(400, "INVALID_STATE", "Daily plan has already been applied.");
  }

  const blocksResult = await client.query(
    `SELECT id, plan_id AS "planId", task_id AS "taskId", title,
            start_time AS "startTime", end_time AS "endTime",
            duration_minutes AS "durationMinutes", is_placed AS "isPlaced"
     FROM tantu.daily_plan_blocks
     WHERE plan_id = $1 AND is_placed = true AND task_id IS NOT NULL`,
    [plan.id]
  );

  for (const block of blocksResult.rows) {
    if (block.startTime && block.endTime && block.taskId) {
      await client.query(
        `INSERT INTO tantu.work_blocks(
           workspace_id, task_id, start_time, end_time, title, is_locked
         ) VALUES($1, $2, $3, $4, $5, false)`,
        [workspaceId, block.taskId, block.startTime, block.endTime, block.title]
      );
    }
  }

  const updateResult = await client.query(
    `UPDATE tantu.daily_plans
     SET status = 'applied', version = version + 1, updated_at = now()
     WHERE id = $1
     RETURNING
       id, workspace_id AS "workspaceId", user_id AS "userId",
       plan_date::text AS "planDate", target_hours::float AS "targetHours",
       allocated_hours::float AS "allocatedHours", status, version,
       created_at::text AS "createdAt", updated_at::text AS "updatedAt"`,
    [plan.id]
  );

  const updatedPlan = updateResult.rows[0] as DailyPlanRecord;
  const blocks = await client.query(
    `SELECT id, plan_id AS "planId", task_id AS "taskId", title,
            start_time::text AS "startTime", end_time::text AS "endTime",
            duration_minutes AS "durationMinutes", placement_reason AS "placementReason",
            unplaced_reason AS "unplacedReason", is_placed AS "isPlaced",
            created_at::text AS "createdAt"
     FROM tantu.daily_plan_blocks
     WHERE plan_id = $1
     ORDER BY is_placed DESC, start_time ASC NULLS LAST`,
    [plan.id]
  );
  updatedPlan.blocks = blocks.rows as DailyPlanBlockRecord[];
  return updatedPlan;
}

export async function calculateWorkloadWeather(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  horizon: "day" | "week" = "day"
): Promise<WorkloadWeatherRecord> {
  const totalCapacityHours = horizon === "day" ? 8.0 : 40.0;
  const intervalClause = horizon === "day" ? "AND deadline::date = CURRENT_DATE" : "AND deadline::date <= CURRENT_DATE + interval '7 days'";

  const tasksResult = await client.query(
    `SELECT id, estimate_minutes AS "estimateMinutes", deadline
     FROM tantu.records
     WHERE workspace_id = $1 AND kind = 'task' AND status = 'open' AND (owner_id = $2 OR owner_id IS NULL) ${intervalClause}`,
    [workspaceId, userId]
  );

  let totalEstimatedMinutes = 0;
  let missingEstimateCount = 0;

  for (const row of tasksResult.rows) {
    if (row.estimateMinutes === null || row.estimateMinutes === undefined) {
      missingEstimateCount++;
      totalEstimatedMinutes += 30;
    } else {
      totalEstimatedMinutes += Number(row.estimateMinutes);
    }
  }

  const estimatedEffortHours = Number((totalEstimatedMinutes / 60).toFixed(2));
  const ratio = Number((estimatedEffortHours / totalCapacityHours).toFixed(2));

  let weather: WorkloadWeatherState;
  let explanation: string;

  if (ratio <= 0.75) {
    weather = "clear";
    explanation = `Workload is well within nominal capacity (${estimatedEffortHours}h / ${totalCapacityHours}h, ratio ${ratio}).`;
  } else if (ratio <= 1.0) {
    weather = "tight";
    explanation = `Workload tightly packs available capacity (${estimatedEffortHours}h / ${totalCapacityHours}h, ratio ${ratio}). Low buffer for interrupts.`;
  } else {
    weather = "overloaded";
    explanation = `Workload exceeds nominal capacity (${estimatedEffortHours}h / ${totalCapacityHours}h, ratio ${ratio}). Rescheduling or scope adjustment required.`;
  }

  return {
    horizon,
    totalCapacityHours,
    estimatedEffortHours,
    ratio,
    weather,
    missingEstimateCount,
    uncertainItemCount: missingEstimateCount,
    explanation
  };
}
