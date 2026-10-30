CREATE TABLE tantu.workspace_quotas(
  workspace_id uuid PRIMARY KEY REFERENCES tantu.workspaces,
  storage_bytes_used bigint NOT NULL DEFAULT 0,
  storage_bytes_limit bigint NOT NULL DEFAULT 104857600,
  record_count integer NOT NULL DEFAULT 0,
  record_limit integer NOT NULL DEFAULT 5000,
  automation_runs_today integer NOT NULL DEFAULT 0,
  automation_limit_daily integer NOT NULL DEFAULT 500,
  quota_reset_at timestamptz NOT NULL DEFAULT now()+interval '1 day',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tantu.user_preferences(
  user_id uuid NOT NULL REFERENCES tantu.users,
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('system','light','dark')),
  density text NOT NULL DEFAULT 'comfortable' CHECK(density IN ('comfortable','compact')),
  timezone text NOT NULL DEFAULT 'UTC',
  week_start text NOT NULL DEFAULT 'monday' CHECK(week_start IN ('sunday','monday')),
  locale text NOT NULL DEFAULT 'en',
  default_calendar text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,workspace_id)
);
CREATE TABLE tantu.export_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),
  format text NOT NULL DEFAULT 'json' CHECK(format IN ('json','zip')),
  payload jsonb,
  bytes bigint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.export_jobs(workspace_id,user_id,status);
ALTER TABLE tantu.workspace_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.workspace_quotas FORCE ROW LEVEL SECURITY;
CREATE POLICY quota_read ON tantu.workspace_quotas FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE POLICY quota_write ON tantu.workspace_quotas FOR ALL USING(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin')) WITH CHECK(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin'));
ALTER TABLE tantu.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.user_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY pref_scope ON tantu.user_preferences FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
ALTER TABLE tantu.export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.export_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY export_scope ON tantu.export_jobs FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
