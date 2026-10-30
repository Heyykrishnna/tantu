CREATE FUNCTION tantu.can_access_as(r uuid,u uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
DECLARE previous text; allowed boolean;
BEGIN
  IF NOT tantu.can_access(r) THEN RETURN false; END IF;
  previous := current_setting('tantu.actor',true);
  PERFORM set_config('tantu.actor',u::text,true);
  allowed := tantu.can_access(r);
  PERFORM set_config('tantu.actor',previous,true);
  RETURN allowed;
END $$;
REVOKE ALL ON FUNCTION tantu.can_access_as(uuid,uuid) FROM PUBLIC;
CREATE TABLE tantu.page_collaboration (
  workspace_id uuid NOT NULL,
  record_id uuid PRIMARY KEY,
  state bytea NOT NULL CHECK(octet_length(state)<=262144),
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id)
);
CREATE TABLE tantu.page_presence (
  workspace_id uuid NOT NULL,
  record_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES tantu.users,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 seconds',
  PRIMARY KEY(record_id,user_id),
  FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id)
);
CREATE TABLE tantu.record_relations (
  workspace_id uuid NOT NULL,
  source_id uuid NOT NULL,
  target_id uuid NOT NULL,
  type text NOT NULL CHECK(type IN ('related','source','blocks')),
  PRIMARY KEY(source_id,target_id,type),
  CHECK(source_id<>target_id),
  FOREIGN KEY(workspace_id,source_id) REFERENCES tantu.records(workspace_id,id),
  FOREIGN KEY(workspace_id,target_id) REFERENCES tantu.records(workspace_id,id)
);
CREATE TABLE tantu.record_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  record_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES tantu.users,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id)
);
CREATE TABLE tantu.collections (
  workspace_id uuid NOT NULL,
  record_id uuid PRIMARY KEY,
  properties jsonb NOT NULL DEFAULT '[]',
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id)
);
CREATE TABLE tantu.collection_items (
  workspace_id uuid NOT NULL,
  collection_id uuid NOT NULL REFERENCES tantu.collections,
  record_id uuid NOT NULL,
  values jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY(collection_id,record_id),
  FOREIGN KEY(workspace_id,record_id) REFERENCES tantu.records(workspace_id,id)
);
CREATE TABLE tantu.schema_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  collection_id uuid NOT NULL REFERENCES tantu.collections,
  user_id uuid NOT NULL REFERENCES tantu.users,
  properties jsonb NOT NULL,
  expected_version integer NOT NULL,
  item_fingerprint text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
ALTER TABLE tantu.page_collaboration ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.page_collaboration FORCE ROW LEVEL SECURITY;
CREATE POLICY collaboration_read ON tantu.page_collaboration FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id));
CREATE POLICY collaboration_write ON tantu.page_collaboration FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(record_id,true));
ALTER TABLE tantu.page_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.page_presence FORCE ROW LEVEL SECURITY;
CREATE POLICY presence_read ON tantu.page_presence FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id) AND tantu.can_access_as(record_id,user_id));
CREATE POLICY presence_write ON tantu.page_presence FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.can_access(record_id)) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.can_access(record_id));
ALTER TABLE tantu.record_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.record_relations FORCE ROW LEVEL SECURITY;
CREATE POLICY relation_read ON tantu.record_relations FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(source_id) AND tantu.can_access(target_id));
CREATE POLICY relation_write ON tantu.record_relations FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(source_id,true) AND tantu.can_access(target_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(source_id,true) AND tantu.can_access(target_id,true));
ALTER TABLE tantu.record_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.record_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY comment_read ON tantu.record_comments FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id));
CREATE POLICY comment_write ON tantu.record_comments FOR INSERT WITH CHECK(workspace_id=tantu.tenant() AND author_id=tantu.actor() AND tantu.can_access(record_id,true));
ALTER TABLE tantu.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.collections FORCE ROW LEVEL SECURITY;
CREATE POLICY collection_read ON tantu.collections FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id));
CREATE POLICY collection_write ON tantu.collections FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(record_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(record_id,true));
ALTER TABLE tantu.collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.collection_items FORCE ROW LEVEL SECURITY;
CREATE POLICY collection_item_read ON tantu.collection_items FOR SELECT USING(workspace_id=tantu.tenant() AND tantu.can_access(collection_id) AND tantu.can_access(record_id));
CREATE POLICY collection_item_write ON tantu.collection_items FOR ALL USING(workspace_id=tantu.tenant() AND tantu.can_access(collection_id,true) AND tantu.can_access(record_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND tantu.can_access(collection_id,true) AND tantu.can_access(record_id,true));
ALTER TABLE tantu.schema_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.schema_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY schema_review_scope ON tantu.schema_reviews FOR ALL USING(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.can_access(collection_id,true)) WITH CHECK(workspace_id=tantu.tenant() AND user_id=tantu.actor() AND tantu.can_access(collection_id,true));
