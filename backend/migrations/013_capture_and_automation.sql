CREATE TABLE tantu.capture_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  kind text NOT NULL CHECK(kind IN ('note','link','mail','request')),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  content text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual','mail','url','task')),
  source_id text,
  source_url text,
  status text NOT NULL DEFAULT 'inbox' CHECK(status IN ('inbox','converted','dismissed')),
  converted_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX ON tantu.capture_items(workspace_id,user_id,status);
CREATE TABLE tantu.capture_reviews(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  capture_id uuid NOT NULL REFERENCES tantu.capture_items,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes'
);
CREATE TABLE tantu.promises(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  creator_id uuid NOT NULL REFERENCES tantu.users,
  responsible_id uuid NOT NULL REFERENCES tantu.users,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  agreed_date date,
  confirmation_state text NOT NULL DEFAULT 'inferred' CHECK(confirmation_state IN ('inferred','confirmed')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fulfilled','broken')),
  source_record_id uuid,
  task_id uuid,
  notes text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.promises(workspace_id,responsible_id,status);
CREATE TABLE tantu.automation_rules(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  owner_id uuid NOT NULL REFERENCES tantu.users,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  trigger_type text NOT NULL CHECK(trigger_type IN ('task.created','task.completed','capture.created','promise.confirmed')),
  conditions jsonb NOT NULL DEFAULT '[]',
  actions jsonb NOT NULL DEFAULT '[]',
  is_enabled boolean NOT NULL DEFAULT true,
  quota_used integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tantu.automation_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  rule_id uuid NOT NULL REFERENCES tantu.automation_rules,
  trigger_type text NOT NULL,
  target_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('completed','failed','blocked_review')),
  dedup_key text NOT NULL UNIQUE,
  executed_actions jsonb NOT NULL DEFAULT '[]',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.automation_runs(workspace_id,rule_id,created_at);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['capture_items','capture_reviews'] LOOP
    EXECUTE format('ALTER TABLE tantu.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE tantu.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I_scope ON tantu.%I FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL)',t,t);
  END LOOP;
END $$;
ALTER TABLE tantu.promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.promises FORCE ROW LEVEL SECURITY;
CREATE POLICY promise_read ON tantu.promises FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL AND (creator_id=tantu.actor() OR responsible_id=tantu.actor() OR (task_id IS NOT NULL AND tantu.can_access(task_id)) OR tantu.member_role(workspace_id) IN ('owner','admin')));
CREATE POLICY promise_insert ON tantu.promises FOR INSERT WITH CHECK(workspace_id=tantu.tenant() AND creator_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE POLICY promise_update ON tantu.promises FOR UPDATE USING(workspace_id=tantu.tenant() AND (creator_id=tantu.actor() OR responsible_id=tantu.actor() OR tantu.member_role(workspace_id) IN ('owner','admin'))) WITH CHECK(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE POLICY promise_delete ON tantu.promises FOR DELETE USING(workspace_id=tantu.tenant() AND (creator_id=tantu.actor() OR tantu.member_role(workspace_id) IN ('owner','admin')));
ALTER TABLE tantu.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.automation_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY rule_scope ON tantu.automation_rules FOR ALL USING(workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
ALTER TABLE tantu.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.automation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY run_read ON tantu.automation_runs FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE POLICY run_insert ON tantu.automation_runs FOR INSERT WITH CHECK(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL);
