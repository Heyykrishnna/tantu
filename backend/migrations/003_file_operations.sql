ALTER TABLE tantu.files ADD operation_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE tantu.files ADD UNIQUE(workspace_id,owner_id,operation_id);
ALTER TABLE tantu.workspaces ADD file_bytes integer NOT NULL DEFAULT 0 CHECK(file_bytes BETWEEN 0 AND 104857600);
ALTER TABLE tantu.workspaces ADD file_count integer NOT NULL DEFAULT 0 CHECK(file_count BETWEEN 0 AND 1000);
ALTER TABLE tantu.workspaces ADD record_count integer NOT NULL DEFAULT 0 CHECK(record_count BETWEEN 0 AND 10000);
CREATE TABLE tantu.deletions (
  file_id uuid PRIMARY KEY REFERENCES tantu.files,
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  requested_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE TABLE tantu.audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  actor_id uuid,
  subject_id uuid NOT NULL,
  record_id uuid,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.audit(workspace_id,created_at DESC);
CREATE FUNCTION tantu.audit_metadata() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
BEGIN
  IF TG_TABLE_NAME='memberships' THEN
    INSERT INTO tantu.audit(workspace_id,actor_id,subject_id,type) VALUES(NEW.workspace_id,tantu.actor(),NEW.user_id,'membership.'||lower(TG_OP));
  ELSIF TG_TABLE_NAME='files' THEN
    INSERT INTO tantu.audit(workspace_id,actor_id,subject_id,record_id,type) VALUES(NEW.workspace_id,tantu.actor(),NEW.id,NEW.record_id,'file.'||NEW.state);
  ELSIF TG_TABLE_NAME='sessions' THEN
    INSERT INTO tantu.audit(actor_id,subject_id,type) VALUES(NEW.user_id,NEW.user_id,CASE WHEN NEW.revoked_at IS NULL THEN 'session.created' ELSE 'session.revoked' END);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION tantu.audit_metadata() FROM PUBLIC;
CREATE TRIGGER membership_audit AFTER INSERT OR UPDATE ON tantu.memberships FOR EACH ROW EXECUTE FUNCTION tantu.audit_metadata();
CREATE TRIGGER file_audit AFTER INSERT OR UPDATE ON tantu.files FOR EACH ROW EXECUTE FUNCTION tantu.audit_metadata();
CREATE TRIGGER session_audit AFTER INSERT OR UPDATE ON tantu.sessions FOR EACH ROW EXECUTE FUNCTION tantu.audit_metadata();
