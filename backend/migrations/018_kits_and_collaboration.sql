CREATE TABLE tantu.workspace_kits(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '1.0.0',
  manifest jsonb NOT NULL DEFAULT '{}',
  author_id uuid NOT NULL REFERENCES tantu.users,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.workspace_kits(workspace_id, is_published);

CREATE TABLE tantu.workspace_kit_installations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  kit_id uuid NOT NULL REFERENCES tantu.workspace_kits,
  installed_version text NOT NULL,
  applied_manifest jsonb NOT NULL DEFAULT '{}',
  installed_by uuid NOT NULL REFERENCES tantu.users,
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, kit_id)
);
CREATE INDEX ON tantu.workspace_kit_installations(workspace_id, kit_id);

CREATE TABLE tantu.synced_blocks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  canonical_entity_id uuid NOT NULL,
  entity_type text NOT NULL CHECK(entity_type IN ('page', 'task')),
  content jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.synced_blocks(workspace_id, canonical_entity_id);

ALTER TABLE tantu.workspace_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.workspace_kit_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.synced_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_kits_tenant_isolation ON tantu.workspace_kits
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY workspace_kit_installations_tenant_isolation ON tantu.workspace_kit_installations
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY synced_blocks_tenant_isolation ON tantu.synced_blocks
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );
