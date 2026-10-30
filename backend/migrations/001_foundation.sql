CREATE SCHEMA tantu;
REVOKE ALL ON SCHEMA tantu FROM PUBLIC;
CREATE TABLE tantu.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email=lower(email) AND length(email)<=254),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tantu.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tantu.memberships (
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  role text NOT NULL CHECK (role IN ('owner','admin','member','guest')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE tantu.sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES tantu.users,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX ON tantu.sessions(user_id);
CREATE TABLE tantu.login_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK(attempts>0),
  reset_at timestamptz NOT NULL
);
CREATE TABLE tantu.invitations (
  token_hash text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  email text NOT NULL,
  role text NOT NULL CHECK(role IN ('admin','member','guest')),
  record_id uuid,
  permission text NOT NULL CHECK(permission IN ('read','edit')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_by uuid NOT NULL REFERENCES tantu.users,
  CHECK(role<>'guest' OR record_id IS NOT NULL)
);
CREATE TABLE tantu.records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  owner_id uuid NOT NULL REFERENCES tantu.users,
  kind text NOT NULL CHECK(kind IN ('task','page')),
  visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','workspace')),
  parent_id uuid,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  body jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}',
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  deadline date,
  estimate_minutes integer CHECK(estimate_minutes BETWEEN 1 AND 10080),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  provenance text NOT NULL DEFAULT 'app' CHECK(provenance='app'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,parent_id) REFERENCES tantu.records(workspace_id,id),
  CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE INDEX ON tantu.records(workspace_id,id) WHERE deleted_at IS NULL;
ALTER TABLE tantu.invitations ADD FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id);
CREATE TABLE tantu.grants (
  workspace_id uuid NOT NULL,
  record_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL CHECK(permission IN ('read','edit')),
  PRIMARY KEY(record_id,user_id),
  FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id),
  FOREIGN KEY(workspace_id,user_id) REFERENCES tantu.memberships(workspace_id,user_id)
);
CREATE TABLE tantu.access_metadata (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  visibility text NOT NULL,
  parent_id uuid,
  deleted_at timestamptz
);
CREATE FUNCTION tantu.sync_access_metadata() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
BEGIN
  INSERT INTO tantu.access_metadata VALUES(NEW.id,NEW.workspace_id,NEW.owner_id,NEW.visibility,NEW.parent_id,NEW.deleted_at)
  ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,visibility=excluded.visibility,parent_id=excluded.parent_id,deleted_at=excluded.deleted_at;
  RETURN NEW;
END $$;
CREATE TRIGGER records_access AFTER INSERT OR UPDATE ON tantu.records FOR EACH ROW EXECUTE FUNCTION tantu.sync_access_metadata();
CREATE FUNCTION tantu.actor() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('tantu.actor',true),'')::uuid $$;
CREATE FUNCTION tantu.tenant() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('tantu.tenant',true),'')::uuid $$;
CREATE FUNCTION tantu.member_role(w uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
  SELECT role FROM tantu.memberships WHERE workspace_id=w AND user_id=tantu.actor() AND active AND w=tantu.tenant()
$$;
CREATE FUNCTION tantu.can_access(r uuid, editing boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
  WITH RECURSIVE ancestors AS (
    SELECT a.*,0 AS depth FROM tantu.access_metadata a WHERE id=r AND workspace_id=tantu.tenant()
    UNION ALL SELECT a.*,p.depth+1 FROM tantu.access_metadata a JOIN ancestors p ON a.id=p.parent_id WHERE p.depth<32
  ), decision AS (
    SELECT a.*,g.permission,
      a.owner_id=tantu.actor() OR
      (a.visibility='workspace' AND tantu.member_role(a.workspace_id) IN ('owner','admin','member')) OR
      EXISTS(SELECT 1 FROM ancestors invited JOIN tantu.grants ig ON ig.record_id=invited.id WHERE ig.user_id=tantu.actor() AND (NOT editing OR ig.permission='edit')) AS allowed
    FROM ancestors a LEFT JOIN tantu.grants g ON g.record_id=a.id AND g.user_id=tantu.actor()
  )
  SELECT tantu.member_role(tantu.tenant()) IS NOT NULL AND EXISTS(SELECT 1 FROM decision WHERE id=r)
    AND NOT EXISTS(SELECT 1 FROM decision WHERE deleted_at IS NOT NULL OR depth>=32 OR NOT allowed)
$$;
ALTER TABLE tantu.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.records FORCE ROW LEVEL SECURITY;
CREATE POLICY record_read ON tantu.records FOR SELECT USING(tantu.can_access(id));
CREATE POLICY record_insert ON tantu.records FOR INSERT WITH CHECK(workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.member_role(workspace_id) IN ('owner','admin','member') AND (parent_id IS NULL OR tantu.can_access(parent_id,true)));
CREATE POLICY record_update ON tantu.records FOR UPDATE USING(tantu.can_access(id,true)) WITH CHECK(workspace_id=tantu.tenant() AND (parent_id IS NULL OR tantu.can_access(parent_id,true)));
CREATE TABLE tantu.operations (
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  user_id uuid NOT NULL REFERENCES tantu.users,
  operation_id uuid NOT NULL,
  digest text NOT NULL,
  record_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,user_id,operation_id)
);
CREATE TABLE tantu.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  actor_id uuid NOT NULL REFERENCES tantu.users,
  record_id uuid,
  type text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  record_version integer,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(record_id,record_version)
);
CREATE INDEX ON tantu.events(workspace_id,created_at DESC);
CREATE TABLE tantu.job_claims (
  id uuid PRIMARY KEY,
  attempt integer NOT NULL,
  token uuid NOT NULL,
  completed boolean NOT NULL DEFAULT false
);
CREATE TABLE tantu.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  record_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES tantu.users,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  media_type text NOT NULL CHECK(media_type IN ('text/plain','application/pdf','application/octet-stream')),
  bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 5242880),
  digest text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','clean','rejected','unavailable','deleted')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id)
);
ALTER TABLE tantu.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.files FORCE ROW LEVEL SECURITY;
CREATE POLICY file_read ON tantu.files FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id));
CREATE POLICY file_insert ON tantu.files FOR INSERT WITH CHECK(workspace_id=tantu.tenant() AND owner_id=tantu.actor() AND tantu.can_access(record_id,true));
CREATE POLICY file_update ON tantu.files FOR UPDATE USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id,true));
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tantu FROM PUBLIC;
