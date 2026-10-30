CREATE TABLE tantu.decisions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  owner_id uuid NOT NULL REFERENCES tantu.users,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  rationale text NOT NULL CHECK(length(rationale) >= 1),
  status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('draft','confirmed','superseded','revoked')),
  decision_date date NOT NULL DEFAULT CURRENT_DATE,
  supporting_evidence jsonb NOT NULL DEFAULT '[]',
  affected_work_ids jsonb NOT NULL DEFAULT '[]',
  superseded_by_id uuid REFERENCES tantu.decisions,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.decisions(workspace_id, status);
CREATE INDEX ON tantu.decisions(workspace_id, decision_date);

CREATE TABLE tantu.decision_revisions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES tantu.decisions ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL,
  modified_by uuid NOT NULL REFERENCES tantu.users,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tantu.decision_revisions(decision_id, version);

CREATE TABLE tantu.context_nodes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  entity_type text NOT NULL CHECK(entity_type IN ('project','task','page','event','promise','decision')),
  entity_id uuid NOT NULL,
  title text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}',
  confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, entity_type, entity_id)
);
CREATE INDEX ON tantu.context_nodes(workspace_id, entity_type);

CREATE TABLE tantu.context_edges(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  source_node_id uuid NOT NULL REFERENCES tantu.context_nodes ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES tantu.context_nodes ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK(relationship_type IN ('informs','decides','blocks','references','derives')),
  provenance jsonb NOT NULL DEFAULT '{}',
  confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_node_id, target_node_id, relationship_type)
);
CREATE INDEX ON tantu.context_edges(workspace_id, source_node_id);
CREATE INDEX ON tantu.context_edges(workspace_id, target_node_id);

ALTER TABLE tantu.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.decision_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.context_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.context_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY decisions_tenant_isolation ON tantu.decisions
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY decision_revisions_tenant_isolation ON tantu.decision_revisions
  FOR ALL
  USING (
    decision_id IN (
      SELECT id FROM tantu.decisions
      WHERE workspace_id IN (
        SELECT workspace_id FROM tantu.workspace_members
        WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  );

CREATE POLICY context_nodes_tenant_isolation ON tantu.context_nodes
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY context_edges_tenant_isolation ON tantu.context_edges
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

