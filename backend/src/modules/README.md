# Domain module ownership

This is the canonical module map. The foundation implements workspace access, canonical persistence and secure files. Connected-work adds projects, scheduling, private delegated providers and knowledge services. Task/page mutations share one canonical record service under work-management, so pages and tasks do not acquire competing identity, version or permission systems. File services are cross-domain attachment infrastructure. Provider routes require real configured registrations; production paths never return fabricated provider responses.

| Module | Responsibility | Future operations | Required behavioral evidence |
| --- | --- | --- | --- |
| `workspace-access` | Tenants, memberships, spaces, sessions, grants, and current authorization. | Resolve scope; authorize; grant/revoke access. | Tenant isolation, guests, inheritance, and revocation. |
| `work-management` | Tasks, subtasks, dependencies, recurrence, projects, and milestones. | Mutate work; resolve dependencies; derive progress. | Canonical identity, stale edits, cycle rejection, recurrence, and rollups. |
| `work-coordination` | Project membership, milestones, assignment/subtask metadata, reviewed bulk recovery and saved views. | Review/revalidate/apply; preserve canonical records and source permissions. | Cycle rejection, current-access rollups, stale reviews, archive/restore and private/shared view isolation. |
| `knowledge` | Pages, document bodies, typed collections, linked views, comments, and history. | Edit documents/schemas; render authorized views. | Concurrent editing, schema repair, current access, and revision recovery. |
| `scheduling` | Availability, work blocks, recurrence, timezones, conflicts, and calendar intent. | Preview; revalidate; apply reviewed changes. | DST/all-day/exception round trips, stale previews, and locked commitments. |
| `mail` | Conversations, labels/folders, drafts, attachments, and durable send intents. | Read; draft; submit a reviewed send. | Provider-faithful behavior, recipient review, and unknown-send reconciliation. |
| `capture-relationships` | Capture triage, source references, reviewed snapshots, promises, and decisions. | Convert; link; confirm commitments. | Deduplication, source privacy, explicit audience, and atomic app-owned writes. |
| `search-archive` | Authorized live search, historical manifests, exact-byte retrieval, and completeness. | Search live records; query eligible archives. | Relevance, current ACL/tombstones, oracle parity, and resource limits. |
| `sync` | Provider cursors, renewal, retries, reconciliation, checkpoints, and health. | Reconcile; apply approved provider intent; report coverage. | Crash/replay, expired cursors, lost hints, throttling, and revocation. |
| `automation` | Scoped triggers, conditions, rule previews, durable execution, and run history. | Preview a rule; execute an approved run. | Deduplication, loop prevention, quotas, and execution-time access checks. |

The concrete `projects` directory implements the project/dependency portion of work management; `providers` owns the shared delegated mail/calendar HTTP, vault and synchronization boundary rather than duplicating clients under `mail` and `sync`. `connected-work` supplies scoped durable receipts, not a competing identity store. Remaining ownership boundaries describe planned product responsibilities; consult [readiness](../../../docs/l1b/readiness.md) for unimplemented requirements.

## Implementation rules

Add routes, domain operations, data access, and schemas only when the corresponding behavior exists. Do not generate unused controllers/services/repositories for every folder in advance. Keep interfaces small and domain rules owned by one module; share runtime-neutral types only when they represent real contracts.

Persistence adapters and provider clients belong behind the [platform boundaries](../platform/README.md). Accepted app-owned writes must commit with their outbox event, while remote effects remain durable, status-tracked operations. A source relationship never grants access.

Frontend views reference canonical records through validated backend contracts. They must not become competing owners of backend authorization, recurrence, or provider rules.
