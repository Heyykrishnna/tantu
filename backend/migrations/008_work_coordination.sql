CREATE TABLE tantu.project_authority AS SELECT id,workspace_id,owner_id,visibility FROM tantu.projects;
ALTER TABLE tantu.project_authority ADD PRIMARY KEY(id);
CREATE FUNCTION tantu.sync_project_authority() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
BEGIN
  INSERT INTO tantu.project_authority VALUES(NEW.id,NEW.workspace_id,NEW.owner_id,NEW.visibility)
  ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,visibility=excluded.visibility;
  RETURN NEW;
END $$;
CREATE TRIGGER project_authority AFTER INSERT OR UPDATE ON tantu.projects FOR EACH ROW EXECUTE FUNCTION tantu.sync_project_authority();
CREATE TABLE tantu.project_members (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL CHECK(permission IN ('read','edit')),
  PRIMARY KEY(project_id,user_id),
  FOREIGN KEY(workspace_id,project_id) REFERENCES tantu.projects(workspace_id,id),
  FOREIGN KEY(workspace_id,user_id) REFERENCES tantu.memberships(workspace_id,user_id)
);
CREATE FUNCTION tantu.can_project(p uuid,editing boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
 SELECT EXISTS(SELECT 1 FROM tantu.project_authority a WHERE a.id=p AND a.workspace_id=tantu.tenant() AND tantu.member_role(a.workspace_id) IS NOT NULL AND
 (a.owner_id=tantu.actor() OR NOT editing AND a.visibility='workspace' AND tantu.member_role(a.workspace_id)<>'guest' OR
 EXISTS(SELECT 1 FROM tantu.project_members m WHERE m.project_id=p AND m.user_id=tantu.actor() AND (NOT editing OR m.permission='edit'))))
$$;
CREATE FUNCTION tantu.project_owned(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$ SELECT EXISTS(SELECT 1 FROM tantu.project_authority WHERE id=p AND workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) $$;
ALTER TABLE tantu.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_member_read ON tantu.project_members FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_project(project_id));
CREATE POLICY project_member_write ON tantu.project_members FOR ALL USING(workspace_id=tantu.tenant() AND tantu.project_owned(project_id) AND tantu.can_project(project_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.project_owned(project_id) AND tantu.can_project(project_id,true));
DROP POLICY project_read ON tantu.projects;
CREATE POLICY project_read ON tantu.projects FOR SELECT USING(tantu.can_project(id) OR owner_id=tantu.actor() AND workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL);
DROP POLICY project_update ON tantu.projects;
CREATE POLICY project_update ON tantu.projects FOR UPDATE USING(tantu.can_project(id,true));
DROP POLICY project_task_write ON tantu.project_tasks;
CREATE POLICY project_task_write ON tantu.project_tasks FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(task_id,true) AND tantu.can_project(project_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(task_id,true) AND tantu.can_project(project_id,true));
CREATE TABLE tantu.milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,project_id uuid NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),deadline date,version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(workspace_id,project_id) REFERENCES tantu.projects(workspace_id,id),UNIQUE(workspace_id,id)
);
ALTER TABLE tantu.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.milestones FORCE ROW LEVEL SECURITY;
CREATE POLICY milestone_read ON tantu.milestones FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_project(project_id));
CREATE POLICY milestone_write ON tantu.milestones FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_project(project_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_project(project_id,true));
CREATE TABLE tantu.task_coordination (
 workspace_id uuid NOT NULL,task_id uuid PRIMARY KEY,parent_task_id uuid,assignee_id uuid,milestone_id uuid,archived boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(workspace_id,task_id) REFERENCES tantu.records(workspace_id,id),FOREIGN KEY(workspace_id,parent_task_id) REFERENCES tantu.records(workspace_id,id),FOREIGN KEY(workspace_id,assignee_id) REFERENCES tantu.memberships(workspace_id,user_id),FOREIGN KEY(workspace_id,milestone_id) REFERENCES tantu.milestones(workspace_id,id),CHECK(parent_task_id IS DISTINCT FROM task_id)
);
ALTER TABLE tantu.task_coordination ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_coordination_read ON tantu.task_coordination FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(task_id));
CREATE POLICY task_coordination_write ON tantu.task_coordination FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(task_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(task_id,true) AND (parent_task_id IS NULL OR tantu.can_access(parent_task_id,true)) AND (milestone_id IS NULL OR EXISTS(SELECT 1 FROM tantu.milestones WHERE id=milestone_id)));
CREATE FUNCTION tantu.reject_subtask_cycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text,123));
 IF EXISTS(WITH RECURSIVE ancestors(id) AS (SELECT NEW.parent_task_id UNION SELECT c.parent_task_id FROM tantu.task_coordination c JOIN ancestors a ON c.task_id=a.id WHERE c.workspace_id=NEW.workspace_id) SELECT 1 FROM ancestors WHERE id=NEW.task_id) THEN RAISE EXCEPTION 'Subtask cycle' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subtask_cycle BEFORE INSERT OR UPDATE ON tantu.task_coordination FOR EACH ROW EXECUTE FUNCTION tantu.reject_subtask_cycle();
CREATE TABLE tantu.work_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES tantu.workspaces,user_id uuid NOT NULL REFERENCES tantu.users,payload jsonb NOT NULL,fingerprint text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes');
ALTER TABLE tantu.work_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.work_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY work_review_scope ON tantu.work_reviews FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE TABLE tantu.saved_views(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES tantu.workspaces,kind text NOT NULL CHECK(kind IN ('project','collection','calendar')),resource_id uuid NOT NULL,owner_id uuid REFERENCES tantu.users,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),settings jsonb NOT NULL,version integer NOT NULL DEFAULT 1,UNIQUE NULLS NOT DISTINCT(workspace_id,kind,resource_id,owner_id,name));
CREATE FUNCTION tantu.view_access(k text,r uuid,editing boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT CASE WHEN k='project' THEN tantu.can_project(r,editing) WHEN k='collection' THEN tantu.can_access(r,editing) ELSE r=tantu.actor() AND tantu.member_role(tantu.tenant()) IS NOT NULL END $$;
ALTER TABLE tantu.saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.saved_views FORCE ROW LEVEL SECURITY;
CREATE POLICY view_read ON tantu.saved_views FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.view_access(kind,resource_id,false) AND (owner_id IS NULL OR owner_id=tantu.actor()));
CREATE POLICY view_write ON tantu.saved_views FOR ALL USING(workspace_id=tantu.tenant() AND tantu.view_access(kind,resource_id,owner_id IS NULL) AND (owner_id IS NULL OR owner_id=tantu.actor())) WITH CHECK(workspace_id=tantu.tenant() AND tantu.view_access(kind,resource_id,owner_id IS NULL) AND (owner_id IS NULL OR owner_id=tantu.actor()));
ALTER TABLE tantu.recurrences ADD version integer NOT NULL DEFAULT 1;
CREATE FUNCTION tantu.restorable(r uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$ SELECT current_setting('tantu.restoring',true)='on' AND EXISTS(SELECT 1 FROM tantu.access_metadata WHERE id=r AND workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND deleted_at IS NOT NULL AND tantu.member_role(workspace_id) IS NOT NULL AND (parent_id IS NULL OR tantu.can_access(parent_id,true))) $$;
CREATE POLICY record_restore_read ON tantu.records FOR SELECT USING(tantu.restorable(id));
CREATE POLICY record_restore_update ON tantu.records FOR UPDATE USING(tantu.restorable(id)) WITH CHECK(workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND (parent_id IS NULL OR tantu.can_access(parent_id,true)));
REVOKE ALL ON FUNCTION tantu.sync_project_authority(),tantu.can_project(uuid,boolean),tantu.reject_subtask_cycle(),tantu.view_access(text,uuid,boolean),tantu.restorable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tantu.project_owned(uuid) FROM PUBLIC;
CREATE TABLE tantu.project_references(workspace_id uuid NOT NULL,project_id uuid NOT NULL,record_id uuid NOT NULL,type text NOT NULL CHECK(type IN ('page','decision')),PRIMARY KEY(project_id,record_id,type),FOREIGN KEY(workspace_id,project_id) REFERENCES tantu.projects(workspace_id,id),FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id));
ALTER TABLE tantu.project_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.project_references FORCE ROW LEVEL SECURITY;
CREATE POLICY project_reference_read ON tantu.project_references FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_project(project_id) AND tantu.can_access(record_id));
CREATE POLICY project_reference_write ON tantu.project_references FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_project(project_id,true) AND tantu.can_access(record_id)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_project(project_id,true) AND tantu.can_access(record_id));
