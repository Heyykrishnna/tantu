# L1C setup and operational procedures

Start with [L1B setup](../l1b/setup.md). Back up an existing database installation, apply migrations `013_capture_and_automation.sql`, `014_search_and_archives.sql`, and `015_portability_and_quotas.sql` with the schema owner, and reapply `backend/migrations/runtime-grants.sql`. Runtime execution continues under a non-owner database user without superuser privileges.

## Database migrations and grants

Execute migrations in sequence:

```bash
# Apply pending L1C schema migrations
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/013_capture_and_automation.sql
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/014_search_and_archives.sql
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/015_portability_and_quotas.sql

# Reapply runtime privileges
psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -f backend/migrations/runtime-grants.sql
```

The migrations establish:
- `capture_items`, `capture_relationships`, `promises`, `automation_rules`, and `automation_runs`.
- `unified_search_projections` with weighted `tsvector` columns and automated update triggers.
- `archive_manifests` for MinLZ chunk referencing.
- `workspace_quotas` and `user_workspace_preferences`.

## Configuration settings

| Setting | Purpose | Default / Requirement |
| --- | --- | --- |
| `ARCHIVE_STORAGE_ROOT` | Absolute path to MinLZ compressed historical archives directory. | `./local-data/archives` |
| `MAX_WORKSPACE_TASKS` | Default task quota for newly provisioned workspaces. | `50000` |
| `MAX_WORKSPACE_STORAGE_BYTES` | Default file and document storage limit per workspace. | `10737418240` (10 GiB) |
| `MAX_PROVIDER_CONNECTIONS` | Maximum external OAuth connections allowed per workspace. | `20` |
| `SLO_PROMETHEUS_ENDPOINT` | Optional metrics export endpoint for telemetry scrapers. | Unset for local mode |

## Capture and automation operations

The capture triage queue operates locally within the workspace database. No third-party queue service is needed. Automation rules execute synchronously or through the existing `pg-boss` worker. If a rule produces an error during execution:
- The error is captured and recorded in `automation_runs` with status `failed`.
- The originating event mutation is not rolled back unless explicitly configured.
- Rules that fail repeatedly can be disabled through `PATCH /api/v1/workspaces/:workspaceId/rules/:ruleId`.

## Search projections and archive recovery

Unified search projections are maintained in real time via database triggers. In the event of projection drift or corrupted indices:
1. Re-index search projections by executing a full projection rebuild.
2. The search trigger handles incremental upserts and deletes on canonical records.
3. Historical archive manifests query MinLZ chunks directly without locking active PostgreSQL tables.

## Portability and disaster recovery

Workspace export produces a portable JSON snapshot:
- Execute `GET /api/v1/workspaces/:workspaceId/export` using a workspace administrator token.
- The resulting JSON bundle includes all canonical records, relationships, preferences, and schemas.
- File attachments are referenced by content digest and can be backed up from the configured object store.
- Private OAuth tokens and vault keys are never exported in the portable manifest.

## Telemetry and health verification

Verify system operational health after deployment:
- Inspect `/api/v1/workspaces/:workspaceId/slos` to check that availability, p95 latency, and worker queue depths satisfy launch thresholds.
- Inspect `/api/v1/workspaces/:workspaceId/launch-readiness` to verify that all launch gates report ready status before directing production traffic.
