CREATE TABLE tantu.calendar_states (
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE tantu.work_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES tantu.users,
  task_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK(ends_at>starts_at AND ends_at-starts_at<=interval '7 days'),
  timezone text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  cancelled boolean NOT NULL DEFAULT false,
  FOREIGN KEY(workspace_id,task_id) REFERENCES tantu.records(workspace_id,id),
  UNIQUE(workspace_id,id)
);
CREATE INDEX ON tantu.work_blocks(workspace_id,user_id,starts_at) WHERE NOT cancelled;
CREATE TABLE tantu.schedule_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  payload jsonb NOT NULL,
  calendar_version integer NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE TABLE tantu.recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  source_id uuid NOT NULL,
  rule text NOT NULL,
  timezone text NOT NULL,
  instants jsonb NOT NULL,
  FOREIGN KEY(workspace_id,source_id) REFERENCES tantu.records(workspace_id,id),
  UNIQUE(workspace_id,id),
  UNIQUE(source_id)
);
CREATE TABLE tantu.recurrence_occurrences (
  workspace_id uuid NOT NULL,
  recurrence_id uuid NOT NULL,
  instant timestamptz NOT NULL,
  state text NOT NULL CHECK(state IN ('materialized','skipped')),
  task_id uuid,
  PRIMARY KEY(recurrence_id,instant),
  FOREIGN KEY(workspace_id,recurrence_id) REFERENCES tantu.recurrences(workspace_id,id),
  FOREIGN KEY(workspace_id,task_id) REFERENCES tantu.records(workspace_id,id)
);
ALTER TABLE tantu.calendar_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.calendar_states FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_state_scope ON tantu.calendar_states FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
ALTER TABLE tantu.work_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.work_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY work_block_scope ON tantu.work_blocks FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.can_access(task_id)) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.can_access(task_id,true));
ALTER TABLE tantu.schedule_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.schedule_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY schedule_review_scope ON tantu.schedule_reviews FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
ALTER TABLE tantu.recurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.recurrences FORCE ROW LEVEL SECURITY;
CREATE POLICY recurrence_read ON tantu.recurrences FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(source_id));
CREATE POLICY recurrence_write ON tantu.recurrences FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(source_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(source_id,true));
ALTER TABLE tantu.recurrence_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.recurrence_occurrences FORCE ROW LEVEL SECURITY;
CREATE POLICY occurrence_scope ON tantu.recurrence_occurrences FOR SELECT USING(workspace_id=tantu.tenant() AND EXISTS(SELECT 1 FROM tantu.recurrences WHERE id=recurrence_id) AND (task_id IS NULL OR tantu.can_access(task_id)));
CREATE POLICY occurrence_write ON tantu.recurrence_occurrences FOR INSERT WITH CHECK(workspace_id=tantu.tenant() AND EXISTS(SELECT 1 FROM tantu.recurrences WHERE id=recurrence_id AND tantu.can_access(source_id,true)) AND (task_id IS NULL OR tantu.can_access(task_id,true)));
