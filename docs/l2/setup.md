# L2 setup and operational procedures

Start with [L1C setup](../l1c/setup.md). Apply migrations `016_context_graph_and_decisions.sql`, `017_planning_and_workload.sql`, `018_kits_and_collaboration.sql`, and `019_ai_and_meeting_workflows.sql` using the schema owner, then reapply `backend/migrations/runtime-grants.sql`.

## Database migrations and grants

Execute migrations in sequence:

```bash
# Apply pending L2 schema migrations
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/016_context_graph_and_decisions.sql
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/017_planning_and_workload.sql
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/018_kits_and_collaboration.sql
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/019_ai_and_meeting_workflows.sql

# Reapply runtime privileges
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/runtime-grants.sql
```

The migrations establish:
- `tantu.decisions` and `tantu.decision_revisions`
- `tantu.context_nodes` and `tantu.context_edges`
- `tantu.daily_plans` and `tantu.daily_plan_blocks`
- `tantu.workspace_kits` and `tantu.workspace_kit_installations`
- `tantu.synced_blocks`
- `tantu.ai_workspace_settings` and `tantu.meeting_briefs`

## Configuration settings

| Setting | Purpose | Default / Requirement |
| --- | --- | --- |
| `DEFAULT_DAILY_PLAN_HOURS` | Default daily target capacity for Plan My Day. | `8.0` |
| `AI_OPT_IN_DEFAULT` | System-wide default for AI processing opt-in. | `false` |
| `MAX_MONTHLY_AI_TOKENS` | Token consumption ceiling per workspace. | `100000` |
| `AI_PROVIDER_DEFAULT` | Default model backend for assisted features. | `local-deterministic` |

## Operational procedures

### Decision Memory and Context Graph
- Context nodes are indexed automatically upon creation of canonical records.
- To repair or backfill missing context nodes, run a graph sync routine using workspace administrator privileges.
- Decision supersession is forward-only; previous versions remain immutable in `decision_revisions`.

### Plan My Day and Workload Weather
- Daily plans are user-specific and tenant-isolated.
- Generated plans remain in `draft` status until explicitly committed by the user.
- Applying a plan updates `work_blocks` atomically.

### Workspace Kits
- Kits can be published globally within a workspace or imported across environments.
- Conflict preview is non-destructive; local customizations are preserved unless explicitly overridden.

### AI and Meeting Briefs
- AI features require explicit tenant opt-in via `PUT /api/v1/workspaces/:workspaceId/ai/settings`.
- Outages or quota exhaustion trigger safe fallbacks to deterministic meeting brief generation.

