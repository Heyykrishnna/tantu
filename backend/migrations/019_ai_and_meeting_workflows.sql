CREATE TABLE tantu.ai_workspace_settings(
  workspace_id uuid PRIMARY KEY REFERENCES tantu.workspaces,
  is_enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'local-deterministic' CHECK(provider IN ('local-deterministic','openai','gemini','anthropic')),
  allowed_scopes jsonb NOT NULL DEFAULT '["meeting_briefs","task_summaries"]',
  max_monthly_tokens integer NOT NULL DEFAULT 100000,
  used_monthly_tokens integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES tantu.users,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tantu.meeting_briefs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES tantu.workspaces,
  event_id text NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  attendees jsonb NOT NULL DEFAULT '[]',
  linked_task_ids jsonb NOT NULL DEFAULT '[]',
  linked_decision_ids jsonb NOT NULL DEFAULT '[]',
  linked_promise_ids jsonb NOT NULL DEFAULT '[]',
  key_topics jsonb NOT NULL DEFAULT '[]',
  citations jsonb NOT NULL DEFAULT '[]',
  action_items jsonb NOT NULL DEFAULT '[]',
  generation_mode text NOT NULL DEFAULT 'deterministic' CHECK(generation_mode IN ('deterministic','assisted')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, event_id)
);
CREATE INDEX ON tantu.meeting_briefs(workspace_id, meeting_date);

ALTER TABLE tantu.ai_workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tantu.meeting_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_workspace_settings_tenant_isolation ON tantu.ai_workspace_settings
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY meeting_briefs_tenant_isolation ON tantu.meeting_briefs
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM tantu.workspace_members
      WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

