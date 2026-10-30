CREATE TABLE tantu.daily_plans(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  plan_date date NOT NULL DEFAULT CURRENT_DATE,
  target_hours numeric(4,2) NOT NULL DEFAULT 8.00,
  allocated_hours numeric(4,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','applied','canceled')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id, plan_date)
);
CREATE INDEX ON tantu.daily_plans(workspace_id, user_id, plan_date);

CREATE TABLE tantu.daily_plan_blocks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES tantu.daily_plans ON DELETE CASCADE,
  task_id uuid REFERENCES tantu.records,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer NOT NULL CHECK(duration_minutes >= 5),
  placement_reason text NOT NULL DEFAULT '',
  unplaced_reason text,
  is_placed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.daily_plan_blocks(plan_id, is_placed);

ALTER TABLE tantu.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.daily_plan_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_plans_tenant_isolation ON tantu.daily_plans
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY daily_plan_blocks_tenant_isolation ON tantu.daily_plan_blocks
  FOR ALL
  USING (
    plan_id IN (
      SELECT id FROM tantu.daily_plans
      WHERE workspace_id IN (
        SELECT workspace_id FROM tantu.workspace_members
        WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  );

