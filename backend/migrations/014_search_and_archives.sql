CREATE TABLE tantu.search_projections(
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  record_id uuid NOT NULL,
  target_type text NOT NULL CHECK(target_type IN ('task','page','project','mail','promise')),
  title text NOT NULL,
  snippet text NOT NULL DEFAULT '',
  content_tsv tsvector NOT NULL,
  owner_id uuid NOT NULL REFERENCES tantu.users,
  visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','workspace')),
  status text NOT NULL DEFAULT 'open',
  tags text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,target_type,record_id)
);
CREATE INDEX ON tantu.search_projections USING gin(content_tsv);
CREATE INDEX ON tantu.search_projections(workspace_id,target_type,updated_at);
CREATE TABLE tantu.archive_manifests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  generation text NOT NULL UNIQUE CHECK(length(generation) BETWEEN 3 AND 64),
  stream_hash text NOT NULL CHECK(length(stream_hash)=64),
  sidecar_hash text NOT NULL CHECK(length(sidecar_hash)=64),
  record_count integer NOT NULL CHECK(record_count>=0),
  compressed_bytes bigint NOT NULL CHECK(compressed_bytes>=0),
  uncompressed_bytes bigint NOT NULL CHECK(uncompressed_bytes>=0),
  privacy_compartment text NOT NULL DEFAULT 'standard' CHECK(privacy_compartment IN ('standard','restricted')),
  encryption_key_id text,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','compacted','tombstoned')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.archive_manifests(workspace_id,status);
CREATE TABLE tantu.archive_tombstones(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  generation text NOT NULL REFERENCES tantu.archive_manifests(generation),
  record_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(generation,record_id)
);
CREATE INDEX ON tantu.archive_tombstones(workspace_id,generation);
ALTER TABLE tantu.search_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.search_projections FORCE ROW LEVEL SECURITY;
CREATE POLICY search_read ON tantu.search_projections FOR SELECT USING(
  workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL AND (
    (target_type IN ('task','page') AND tantu.can_access(record_id)) OR
    (target_type='project' AND tantu.can_project(record_id,false)) OR
    (target_type='mail' AND owner_id=tantu.actor()) OR
    (target_type='promise' AND (owner_id=tantu.actor() OR tantu.member_role(workspace_id) IN ('owner','admin')))
  )
);
CREATE POLICY search_write ON tantu.search_projections FOR ALL USING(
  workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL
) WITH CHECK(
  workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IS NOT NULL
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['archive_manifests','archive_tombstones'] LOOP
    EXECUTE format('ALTER TABLE tantu.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE tantu.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I_admin ON tantu.%I FOR ALL USING(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN (\'owner\',\'admin\')) WITH CHECK(workspace_id=tantu.tenant() AND tantu.member_role(workspace_id) IN (\'owner\',\'admin\'))',t,t);
  END LOOP;
END $$;

