CREATE SCHEMA l0;
CREATE ROLE l0_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE TABLE l0.memberships (tenant text NOT NULL, actor text NOT NULL, role text NOT NULL, active boolean NOT NULL DEFAULT true, PRIMARY KEY (tenant, actor));
CREATE TABLE l0.records (
  id text PRIMARY KEY,
  tenant text NOT NULL,
  owner text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('private', 'shared')),
  deleted boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED
);
CREATE TABLE l0.grants (record_id text REFERENCES l0.records(id), actor text NOT NULL, PRIMARY KEY (record_id, actor));
ALTER TABLE l0.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE l0.records FORCE ROW LEVEL SECURITY;
CREATE POLICY current_scope ON l0.records USING (
  tenant = current_setting('l0.tenant', true)
  AND NOT deleted
  AND EXISTS (SELECT 1 FROM l0.memberships m WHERE m.tenant = current_setting('l0.tenant', true) AND m.actor = current_setting('l0.actor', true) AND m.active)
  AND (
    owner = current_setting('l0.actor', true)
    OR EXISTS (SELECT 1 FROM l0.grants g WHERE g.record_id = records.id AND g.actor = current_setting('l0.actor', true))
    OR (visibility = 'shared' AND EXISTS (SELECT 1 FROM l0.memberships m WHERE m.tenant = current_setting('l0.tenant', true) AND m.actor = current_setting('l0.actor', true) AND m.role <> 'guest'))
  )
);
GRANT USAGE ON SCHEMA l0 TO l0_reader;
GRANT SELECT ON l0.records, l0.memberships, l0.grants TO l0_reader;
CREATE INDEX record_search ON l0.records USING gin(search);
CREATE INDEX record_scope ON l0.records(tenant, id);
CREATE TABLE l0.tasks (id uuid PRIMARY KEY, tenant text NOT NULL, title text NOT NULL, UNIQUE (tenant, id));
CREATE TABLE l0.operations (
  tenant text NOT NULL,
  operation_id uuid NOT NULL,
  digest text NOT NULL,
  task_id uuid NOT NULL,
  PRIMARY KEY (tenant, operation_id),
  FOREIGN KEY (tenant, task_id) REFERENCES l0.tasks(tenant, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE l0.outbox (
  tenant text NOT NULL,
  operation_id uuid NOT NULL,
  task_id uuid NOT NULL,
  PRIMARY KEY (tenant, operation_id),
  FOREIGN KEY (tenant, task_id) REFERENCES l0.tasks(tenant, id)
);
CREATE FUNCTION l0.capture_task(scope text, operation_key uuid, payload_digest text, new_task uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE stored l0.operations%ROWTYPE;
BEGIN
  INSERT INTO l0.operations VALUES (scope, operation_key, payload_digest, new_task) ON CONFLICT DO NOTHING;
  SELECT * INTO stored FROM l0.operations WHERE tenant = scope AND operation_id = operation_key FOR UPDATE;
  IF stored.digest <> payload_digest THEN
    RAISE EXCEPTION 'operation payload conflict' USING ERRCODE = '23505';
  END IF;
  INSERT INTO l0.tasks VALUES (stored.task_id, scope, 'Synthetic task') ON CONFLICT DO NOTHING;
  INSERT INTO l0.outbox VALUES (scope, operation_key, stored.task_id) ON CONFLICT DO NOTHING;
  RETURN stored.task_id;
END;
$$;
REVOKE ALL ON FUNCTION l0.capture_task(text, uuid, text, uuid) FROM PUBLIC;
CREATE TABLE l0.provider_items (connection_id text NOT NULL, item_id text NOT NULL, generation integer NOT NULL, PRIMARY KEY (connection_id, item_id));
CREATE TABLE l0.cursors (connection_id text PRIMARY KEY, cursor text NOT NULL, generation integer NOT NULL);
CREATE TABLE l0.job_claims (id uuid PRIMARY KEY, attempt integer NOT NULL, token uuid NOT NULL, completed boolean NOT NULL DEFAULT false);
CREATE TABLE l0.document_snapshots (record_id text PRIMARY KEY REFERENCES l0.records(id), snapshot bytea NOT NULL);
