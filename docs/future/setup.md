# Future discovery setup and operational procedures

Start with [L3 setup](../l3/setup.md). Apply migration `022_future_discovery.sql` using the database schema owner, then reapply `backend/migrations/runtime-grants.sql`.

## Database migrations and grants

Execute migrations in sequence:

```bash
# Apply pending Future Discovery schema migrations
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/022_future_discovery.sql

# Reapply runtime privileges
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/runtime-grants.sql
```

The migrations establish:
- `tantu.sharing_exposure_previews`
- `tantu.handover_packs`
- `tantu.knowledge_freshness_reviews`
- `tantu.scenario_plans`
- `tantu.attention_budgets`

## Configuration parameters

| Parameter | Purpose | Default / Range |
| --- | --- | --- |
| `DEFAULT_HANDOVER_EXPIRY_DAYS` | Default lifetime for pending handover tokens. | `14` (1 to 90) |
| `DEFAULT_REVIEW_CADENCE_DAYS` | Default review interval for knowledge documentation. | `90` (7 to 365) |
| `DEFAULT_BATCHING_INTERVAL_MIN` | Default interval for batched non-urgent notifications. | `60` (15 to 480) |
| `FOCUS_WINDOW_START_DEFAULT` | System default focus window start time. | `09:00` |
| `FOCUS_WINDOW_END_DEFAULT` | System default focus window end time. | `12:00` |

## Operational procedures

### Evaluating sharing exposure maps
- Triggered before high-impact record sharing via `POST /api/v1/workspaces/:workspaceId/exposure/preview`.
- Review the generated summary for any inaccessible cross-references before confirming external access.

### Managing handover packs
- Senders initiate packs with task checklists and notes via `POST /api/v1/workspaces/:workspaceId/handovers`.
- Recipients accept using the secure token via `POST /api/v1/workspaces/:workspaceId/handovers/:token/accept`.
- Revocations via `DELETE /api/v1/workspaces/:workspaceId/handovers/:packId` permanently cancel pending tokens.

### Knowledge freshness reviews
- Review schedules are registered via `POST /api/v1/workspaces/:workspaceId/freshness/:pageId/verify`.
- Team members inspect the Freshness tab in Future Discovery to prioritize `due_for_review` and `stale` articles.

### Scenario impact simulation
- Scenarios are created via `POST /api/v1/workspaces/:workspaceId/scenarios` with proposed deadline or estimate deltas.
- Scenarios never mutate baseline tasks or project records directly; they provide non-destructive sandbox evaluation.

### Running container builds locally
- Build the production container image: `docker build -t tantu:latest .`
- Run containerized service: `docker run -p 4000:4000 tantu:latest`

