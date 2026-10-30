CREATE TABLE tantu.enterprise_policies(
  workspace_id uuid PRIMARY KEY REFERENCES tantu.workspaces,
  sso_enforced boolean NOT NULL DEFAULT false,
  sso_provider text NOT NULL DEFAULT 'saml' CHECK(sso_provider IN ('saml', 'oidc', 'none')),
  session_duration_minutes integer NOT NULL DEFAULT 480 CHECK(session_duration_minutes BETWEEN 15 AND 10080),
  allowed_ip_ranges jsonb NOT NULL DEFAULT '[]',
  dlp_enabled boolean NOT NULL DEFAULT true,
  dlp_rules jsonb NOT NULL DEFAULT '[]',
  retention_days integer NOT NULL DEFAULT 365 CHECK(retention_days BETWEEN 30 AND 3650),
  updated_by uuid REFERENCES tantu.users,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tantu.dlp_redaction_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  rule_name text NOT NULL CHECK(length(rule_name) BETWEEN 1 AND 100),
  matched_pattern text NOT NULL,
  entity_type text NOT NULL CHECK(length(entity_type) BETWEEN 1 AND 50),
  entity_id text NOT NULL,
  redacted_snippet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.dlp_redaction_logs(workspace_id, created_at DESC);

CREATE TABLE tantu.enterprise_audit_exports(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  export_format text NOT NULL CHECK(export_format IN ('ndjson', 'csv')),
  status text NOT NULL DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'failed')),
  download_token text NOT NULL UNIQUE,
  record_count integer NOT NULL DEFAULT 0,
  checksum_sha256 text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.enterprise_audit_exports(workspace_id, created_at DESC);

ALTER TABLE tantu.enterprise_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.dlp_redaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.enterprise_audit_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY enterprise_policies_tenant_isolation ON tantu.enterprise_policies
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY dlp_redaction_logs_tenant_isolation ON tantu.dlp_redaction_logs
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY enterprise_audit_exports_tenant_isolation ON tantu.enterprise_audit_exports
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );
