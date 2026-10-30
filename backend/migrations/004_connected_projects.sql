CREATE TABLE tantu.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  owner_id uuid NOT NULL REFERENCES tantu.users,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  visibility text NOT NULL CHECK(visibility IN ('private','workspace')),
  state text NOT NULL DEFAULT 'planning' CHECK(state IN ('planning','active','at-risk','completed','archived')),
  deadline date,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE tantu.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.projects FORCE ROW LEVEL SECURITY;
CREATE POLICY project_read ON tantu.projects FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL AND (owner_id=tantu.actor() OR visibility='workspace' AND tantu.member_role(workspace_id)<>'guest'));
CREATE POLICY project_insert ON tantu.projects FOR INSERT WITH CHECK(workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IN ('owner','admin','member'));
CREATE POLICY project_update ON tantu.projects FOR UPDATE USING(workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE TABLE tantu.project_tasks (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  PRIMARY KEY(project_id,task_id),
  FOREIGN KEY(workspace_id,project_id) REFERENCES tantu.projects(workspace_id,id),
  FOREIGN KEY(workspace_id,task_id) REFERENCES tantu.records(workspace_id,id)
);
ALTER TABLE tantu.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.project_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY project_task_read ON tantu.project_tasks FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(task_id) AND EXISTS(SELECT 1 FROM tantu.projects WHERE id=project_id));
CREATE POLICY project_task_write ON tantu.project_tasks FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(task_id,true) AND EXISTS(SELECT 1 FROM tantu.projects WHERE id=project_id AND owner_id=tantu.actor())) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(task_id,true) AND EXISTS(SELECT 1 FROM tantu.projects WHERE id=project_id AND owner_id=tantu.actor()));
CREATE TABLE tantu.task_dependencies (
  workspace_id uuid NOT NULL,
  prerequisite_id uuid NOT NULL,
  dependent_id uuid NOT NULL,
  PRIMARY KEY(prerequisite_id,dependent_id),
  FOREIGN KEY(workspace_id,prerequisite_id) REFERENCES tantu.records(workspace_id,id),
  FOREIGN KEY(workspace_id,dependent_id) REFERENCES tantu.records(workspace_id,id),
  CHECK(prerequisite_id<>dependent_id)
);
ALTER TABLE tantu.task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY dependency_read ON tantu.task_dependencies FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(prerequisite_id) AND tantu.can_access(dependent_id));
CREATE POLICY dependency_write ON tantu.task_dependencies FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(prerequisite_id,true) AND tantu.can_access(dependent_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(prerequisite_id,true) AND tantu.can_access(dependent_id,true));
CREATE FUNCTION tantu.reject_dependency_cycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text,123));
  IF EXISTS(WITH RECURSIVE reachable(id) AS (
    SELECT dependent_id FROM tantu.task_dependencies WHERE workspace_id=NEW.workspace_id AND prerequisite_id=NEW.dependent_id
    UNION SELECT d.dependent_id FROM tantu.task_dependencies d JOIN reachable r ON d.prerequisite_id=r.id WHERE d.workspace_id=NEW.workspace_id
  ) SELECT 1 FROM reachable WHERE id=NEW.prerequisite_id) THEN
    RAISE EXCEPTION 'Dependency cycle' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dependency_cycle BEFORE INSERT OR UPDATE ON tantu.task_dependencies FOR EACH ROW EXECUTE FUNCTION tantu.reject_dependency_cycle();
CREATE TABLE tantu.connected_operations (
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  operation_id uuid NOT NULL,
  digest text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,user_id,operation_id)
);
ALTER TABLE tantu.connected_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.connected_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY connected_operation_scope ON tantu.connected_operations FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
REVOKE ALL ON FUNCTION tantu.reject_dependency_cycle() FROM PUBLIC;
