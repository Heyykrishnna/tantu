CREATE TABLE tantu.revisions (
  record_id uuid NOT NULL REFERENCES tantu.records,
  version integer NOT NULL,
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(record_id,version)
);
ALTER TABLE tantu.revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY revision_read ON tantu.revisions FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id));
CREATE POLICY revision_insert ON tantu.revisions FOR INSERT WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(record_id,true));
ALTER TABLE tantu.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.operations FORCE ROW LEVEL SECURITY;
CREATE POLICY operation_scope ON tantu.operations USING(workspace_id=tantu.tenant() AND user_id=tantu.actor());
DROP POLICY record_read ON tantu.records;
CREATE FUNCTION tantu.is_new_record(r uuid,w uuid,o uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
  SELECT w=tantu.tenant() AND o=tantu.actor() AND tantu.member_role(w) IN ('owner','admin','member')
    AND NOT EXISTS(SELECT 1 FROM tantu.access_metadata WHERE id=r)
    AND (p IS NULL OR tantu.can_access(p,true))
$$;
REVOKE ALL ON FUNCTION tantu.is_new_record(uuid,uuid,uuid,uuid) FROM PUBLIC;
CREATE POLICY record_read ON tantu.records FOR SELECT USING(
  workspace_id=tantu.tenant() AND (tantu.can_access(id) OR tantu.is_new_record(id,workspace_id,owner_id,parent_id))
);
ALTER TABLE tantu.events ADD delivery_state text NOT NULL DEFAULT 'pending' CHECK(delivery_state IN ('pending','published','discarded'));
