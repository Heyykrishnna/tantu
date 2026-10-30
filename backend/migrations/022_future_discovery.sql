CREATE TABLE tantu.sharing_exposure_previews(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  target_record_id text NOT NULL,
  target_record_type text NOT NULL CHECK(target_record_type IN ('page', 'task', 'project', 'collection')),
  recipient_email text NOT NULL,
  access_level text NOT NULL CHECK(access_level IN ('view', 'comment', 'edit', 'admin')),
  inherited_access jsonb NOT NULL DEFAULT '[]',
  inaccessible_references jsonb NOT NULL DEFAULT '[]',
  exposure_summary text NOT NULL,
  evaluated_by uuid REFERENCES tantu.users,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.sharing_exposure_previews(workspace_id, created_at DESC);

CREATE TABLE tantu.handover_packs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  from_user_id uuid NOT NULL REFERENCES tantu.users,
  to_user_email text NOT NULL,
  handover_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'revoked', 'expired')),
  record_ids jsonb NOT NULL DEFAULT '[]',
  checklist jsonb NOT NULL DEFAULT '[]',
  notes text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.handover_packs(workspace_id, created_at DESC);

CREATE TABLE tantu.knowledge_freshness_reviews(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  page_id text NOT NULL,
  review_cadence_days integer NOT NULL DEFAULT 90 CHECK(review_cadence_days BETWEEN 7 AND 365),
  last_reviewed_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_by uuid REFERENCES tantu.users,
  freshness_status text NOT NULL DEFAULT 'fresh' CHECK(freshness_status IN ('fresh', 'due_for_review', 'stale')),
  source_change_alerts jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, page_id)
);
CREATE INDEX ON tantu.knowledge_freshness_reviews(workspace_id, freshness_status);

CREATE TABLE tantu.scenario_plans(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 150),
  baseline_project_id text,
  description text,
  modifications jsonb NOT NULL DEFAULT '[]',
  impact_summary jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES tantu.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.scenario_plans(workspace_id, created_at DESC);

CREATE TABLE tantu.attention_budgets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  focus_window_start text NOT NULL DEFAULT '09:00',
  focus_window_end text NOT NULL DEFAULT '12:00',
  batching_interval_minutes integer NOT NULL DEFAULT 60,
  urgent_bypass_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

ALTER TABLE tantu.sharing_exposure_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.handover_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.knowledge_freshness_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.scenario_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.attention_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY sharing_exposure_previews_isolation ON tantu.sharing_exposure_previews
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY handover_packs_isolation ON tantu.handover_packs
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY knowledge_freshness_reviews_isolation ON tantu.knowledge_freshness_reviews
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY scenario_plans_isolation ON tantu.scenario_plans
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY attention_budgets_isolation ON tantu.attention_budgets
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

