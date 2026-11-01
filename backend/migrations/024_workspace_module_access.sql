ALTER VIEW tantu.workspace_members SET (security_invoker = true);

DROP POLICY decisions_tenant_isolation ON tantu.decisions;
CREATE POLICY decisions_read ON tantu.decisions FOR SELECT USING (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE POLICY decisions_write ON tantu.decisions FOR ALL USING (workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IN ('owner','admin','member')) WITH CHECK (workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IN ('owner','admin','member'));
ALTER TABLE tantu.decisions FORCE ROW LEVEL SECURITY;

DROP POLICY decision_revisions_tenant_isolation ON tantu.decision_revisions;
CREATE POLICY decision_revisions_read ON tantu.decision_revisions FOR SELECT USING (EXISTS(SELECT 1 FROM tantu.decisions d WHERE d.id=decision_revisions.decision_id));
CREATE POLICY decision_revisions_write ON tantu.decision_revisions FOR INSERT WITH CHECK (modified_by=tantu.actor() AND EXISTS(SELECT 1 FROM tantu.decisions d WHERE d.id=decision_revisions.decision_id AND d.owner_id=tantu.actor()));
ALTER TABLE tantu.decision_revisions FORCE ROW LEVEL SECURITY;

CREATE FUNCTION tantu.can_read_context_source(kind text, source_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,tantu AS $$
  SELECT CASE $1
    WHEN 'task' THEN EXISTS(SELECT 1 FROM tantu.records WHERE id=$2 AND kind='task' AND deleted_at IS NULL)
    WHEN 'page' THEN EXISTS(SELECT 1 FROM tantu.records WHERE id=$2 AND kind='page' AND deleted_at IS NULL)
    WHEN 'project' THEN EXISTS(SELECT 1 FROM tantu.projects WHERE id=$2)
    WHEN 'promise' THEN EXISTS(SELECT 1 FROM tantu.promises WHERE id=$2)
    WHEN 'decision' THEN EXISTS(SELECT 1 FROM tantu.decisions WHERE id=$2)
    ELSE false END
$$;
REVOKE ALL ON FUNCTION tantu.can_read_context_source(text,uuid) FROM PUBLIC;

DROP POLICY context_nodes_tenant_isolation ON tantu.context_nodes;
CREATE POLICY context_nodes_read ON tantu.context_nodes FOR SELECT USING (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL AND tantu.can_read_context_source(entity_type,entity_id));
CREATE POLICY context_nodes_write ON tantu.context_nodes FOR ALL USING (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin','member') AND tantu.can_read_context_source(entity_type,entity_id)) WITH CHECK (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin','member') AND tantu.can_read_context_source(entity_type,entity_id));
ALTER TABLE tantu.context_nodes FORCE ROW LEVEL SECURITY;

DROP POLICY context_edges_tenant_isolation ON tantu.context_edges;
CREATE POLICY context_edges_read ON tantu.context_edges FOR SELECT USING (workspace_id=tantu.tenant() AND EXISTS(SELECT 1 FROM tantu.context_nodes n WHERE n.id=context_edges.source_node_id) AND EXISTS(SELECT 1 FROM tantu.context_nodes n WHERE n.id=context_edges.target_node_id));
CREATE POLICY context_edges_write ON tantu.context_edges FOR ALL USING (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin','member') AND EXISTS(SELECT 1 FROM tantu.context_nodes n WHERE n.id=context_edges.source_node_id) AND EXISTS(SELECT 1 FROM tantu.context_nodes n WHERE n.id=context_edges.target_node_id)) WITH CHECK (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin','member') AND EXISTS(SELECT 1 FROM tantu.context_nodes n WHERE n.id=context_edges.source_node_id) AND EXISTS(SELECT 1 FROM tantu.context_nodes n WHERE n.id=context_edges.target_node_id));
ALTER TABLE tantu.context_edges FORCE ROW LEVEL SECURITY;

DROP POLICY ai_workspace_settings_tenant_isolation ON tantu.ai_workspace_settings;
CREATE POLICY ai_workspace_settings_read ON tantu.ai_workspace_settings FOR SELECT USING (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE POLICY ai_workspace_settings_write ON tantu.ai_workspace_settings FOR ALL USING (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin')) WITH CHECK (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin'));
ALTER TABLE tantu.ai_workspace_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE tantu.meeting_briefs ADD COLUMN owner_id uuid REFERENCES tantu.users DEFAULT tantu.actor();
ALTER TABLE tantu.meeting_briefs DROP CONSTRAINT meeting_briefs_workspace_id_event_id_key;
ALTER TABLE tantu.meeting_briefs ADD UNIQUE(workspace_id,event_id,owner_id);
DROP POLICY meeting_briefs_tenant_isolation ON tantu.meeting_briefs;
CREATE POLICY meeting_briefs_read ON tantu.meeting_briefs FOR SELECT USING (workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
CREATE POLICY meeting_briefs_write ON tantu.meeting_briefs FOR ALL USING (workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IN ('owner','admin','member')) WITH CHECK (workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IN ('owner','admin','member'));
ALTER TABLE tantu.meeting_briefs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tantu_runtime') THEN
    GRANT EXECUTE ON FUNCTION tantu.can_read_context_source(text,uuid) TO tantu_runtime;
  END IF;
END $$;
