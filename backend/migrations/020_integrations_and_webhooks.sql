CREATE TABLE tantu.developer_api_keys(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  key_prefix text NOT NULL CHECK(length(key_prefix) BETWEEN 4 AND 32),
  key_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '[]',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.developer_api_keys(workspace_id);

CREATE TABLE tantu.webhooks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  target_url text NOT NULL CHECK(target_url ~ '^https?://'),
  subscribed_events jsonb NOT NULL DEFAULT '[]',
  secret_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.webhooks(workspace_id);

CREATE TABLE tantu.webhook_deliveries(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES tantu.webhooks ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  response_status integer,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 1,
  delivered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.webhook_deliveries(webhook_id);
CREATE INDEX ON tantu.webhook_deliveries(workspace_id, delivered_at);

ALTER TABLE tantu.developer_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY developer_api_keys_tenant_isolation ON tantu.developer_api_keys
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY webhooks_tenant_isolation ON tantu.webhooks
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY webhook_deliveries_tenant_isolation ON tantu.webhook_deliveries
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );
