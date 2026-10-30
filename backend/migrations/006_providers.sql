CREATE TABLE tantu.provider_connections (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  provider text NOT NULL CHECK(provider IN ('google','microsoft')),
  subject text NOT NULL,
  address text NOT NULL,
  vault jsonb NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','reauthorize','disconnected')),
  version integer NOT NULL DEFAULT 1,
  retry_at timestamptz,
  last_synced_at timestamptz,
  UNIQUE(workspace_id,user_id,provider,subject),
  UNIQUE(workspace_id,id)
);
CREATE TABLE tantu.oauth_states (
  state_hash text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  session_hash text NOT NULL,
  provider text NOT NULL CHECK(provider IN ('google','microsoft')),
  vault jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE TABLE tantu.provider_projections (
  workspace_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('mail','calendar')),
  data jsonb NOT NULL,
  generation uuid NOT NULL,
  PRIMARY KEY(connection_id,kind,external_id),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES tantu.provider_connections(workspace_id,id)
);
CREATE TABLE tantu.provider_cursors (
  workspace_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('mail','calendar')),
  cursor text,
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  coverage text NOT NULL,
  PRIMARY KEY(connection_id,kind),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES tantu.provider_connections(workspace_id,id)
);
CREATE TABLE tantu.mail_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  recipients text[] NOT NULL CHECK(cardinality(recipients) BETWEEN 1 AND 20),
  subject text NOT NULL CHECK(length(subject)<=200),
  body text NOT NULL CHECK(length(body)<=100000),
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY(workspace_id,connection_id) REFERENCES tantu.provider_connections(workspace_id,id),
  UNIQUE(workspace_id,id)
);
CREATE TABLE tantu.send_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  draft_version integer NOT NULL,
  connection_version integer NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  FOREIGN KEY(workspace_id,draft_id) REFERENCES tantu.mail_drafts(workspace_id,id),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES tantu.provider_connections(workspace_id,id)
);
CREATE TABLE tantu.send_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  draft_version integer NOT NULL,
  review_id uuid NOT NULL REFERENCES tantu.send_reviews,
  message_id text NOT NULL,
  provider_id text,
  state text NOT NULL CHECK(state IN ('pending','unknown','confirmed','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(draft_id,draft_version),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES tantu.provider_connections(workspace_id,id),
  FOREIGN KEY(workspace_id,draft_id) REFERENCES tantu.mail_drafts(workspace_id,id)
);
ALTER TABLE tantu.provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.provider_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_connection_scope ON tantu.provider_connections FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
ALTER TABLE tantu.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.oauth_states FORCE ROW LEVEL SECURITY;
CREATE POLICY oauth_state_scope ON tantu.oauth_states FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.member_role(workspace_id) IS NOT NULL);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['provider_projections','provider_cursors','mail_drafts','send_reviews','send_intents'] LOOP
    EXECUTE format('ALTER TABLE tantu.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE tantu.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY connection_scope ON tantu.%I FOR ALL USING(workspace_id=tantu.tenant() AND EXISTS(SELECT 1 FROM tantu.provider_connections WHERE id=connection_id)) WITH CHECK(workspace_id=tantu.tenant() AND EXISTS(SELECT 1 FROM tantu.provider_connections WHERE id=connection_id))',t);
  END LOOP;
END $$;
