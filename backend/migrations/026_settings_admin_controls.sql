DO $$
DECLARE table_name text; policy_name text; read_scope text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['enterprise_policies','dlp_redaction_logs','enterprise_audit_exports','developer_api_keys','webhooks','webhook_deliveries'] LOOP
    FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname='tantu' AND tablename=table_name LOOP
      EXECUTE format('DROP POLICY %I ON tantu.%I',policy_name,table_name);
    END LOOP;
    read_scope := 'workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN (''owner'',''admin'')';
    IF table_name='enterprise_policies' THEN
      read_scope := 'workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL';
    END IF;
    EXECUTE format('CREATE POLICY settings_read ON tantu.%I FOR SELECT USING (%s)',table_name,read_scope);
    EXECUTE format('CREATE POLICY settings_write ON tantu.%I FOR ALL USING (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN (''owner'',''admin'')) WITH CHECK (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN (''owner'',''admin''))',table_name);
    EXECUTE format('ALTER TABLE tantu.%I FORCE ROW LEVEL SECURITY',table_name);
  END LOOP;
END $$;

ALTER TABLE tantu.audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_scoped_read ON tantu.audit FOR SELECT USING (workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN ('owner','admin'));
ALTER TABLE tantu.enterprise_audit_exports ADD COLUMN payload text;
