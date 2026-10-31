# Tantu — System Architecture

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Architecture](#6-database-architecture)
7. [Authentication & Session Flow](#7-authentication--session-flow)
8. [API Route Reference](#8-api-route-reference)
9. [Frontend View-to-API Mapping](#9-frontend-view-to-api-mapping)
10. [Security Architecture](#10-security-architecture)
11. [Background Worker](#11-background-worker)
12. [Deployment Architecture](#12-deployment-architecture)
13. [Environment Configuration](#13-environment-configuration)
14. [Development Guide](#14-development-guide)

---

## 1. System Overview

Tantu is a collaborative workspace platform for managing tasks, pages, projects, decisions, promises, calendar schedules, mail, files, and team context. It is built as a full-stack TypeScript monorepo with a Next.js frontend and a Fastify backend, backed by PostgreSQL.

The platform supports:
- Rich-text collaborative records (tasks and pages) with CRDT-based editing (Yjs)
- Project management with milestones, dependencies, and member permissions
- Capture triage for inbox items that flow into tasks, promises, or decisions
- Context graph for linking decisions, knowledge, and people
- AI-powered meeting briefs and daily planning
- Google and Microsoft provider integrations for calendar and mail
- Enterprise governance with DLP content scanning, audit logs, and policy management
- Future-discovery features: handovers, attention budgets, freshness scores, exposure mapping
- Background job processing via pg-boss
- File attachments with ClamAV virus scanning

---

## 2. High-Level Architecture

```mermaid
flowchart LR
    Browser["Browser\n(React 19)"]
    NextJS["Next.js :3000\n(App Router)"]
    Fastify["Fastify :4000\n(API Server)"]
    PostgreSQL[("PostgreSQL\n:5432")]
    Scanner["ClamAV\n:3310"]
    FileStore["/data/files\n(Local / S3)"]
    Worker["Background Worker\n(pg-boss)"]

    Browser -->|"HTTP/WS\nAll requests"| NextJS
    NextJS -->|"Proxy /api/v1/*\nServer-side fetch"| Fastify
    Fastify -->|"SQL queries\nTransactions"| PostgreSQL
    Fastify -->|"File scan\nClamd protocol"| Scanner
    Fastify -->|"Read / Write\nSigned tokens"| FileStore
    Worker -->|"Job queue\nPoll + process"| PostgreSQL
    Worker -->|"Async scan"| Scanner
```

### Request Path

```
Browser → NextJS (Next.js route handler proxy) → Fastify (auth + business logic) → PostgreSQL
```

All API calls from the browser target the Next.js server. Next.js rewrites `/api/v1/*` paths directly to the Fastify backend. This keeps the backend internal and avoids CORS issues.

---

## 3. Technology Stack

| Layer | Technology | Version | Role |
|---|---|---|---|
| Frontend framework | Next.js | 16 | App Router, server-side rendering, API proxy |
| UI library | React | 19 | Component model |
| Styling | TailwindCSS | 4 | Utility-first CSS |
| Backend framework | Fastify | 5 | HTTP API server |
| Language | TypeScript | 5 | End-to-end type safety |
| Database | PostgreSQL | 16 | Primary data store |
| Job queue | pg-boss | – | Background job processing |
| Rich-text CRDT | Yjs | – | Collaborative document editing |
| Token signing | jose | – | JWT / HMAC session tokens |
| Schema validation | AJV (via Fastify) | – | Request body validation |
| File scanning | ClamAV (clamd) | – | Virus scanning for uploads |
| Security headers | @fastify/helmet | – | HTTP security headers |
| OAuth providers | Google, Microsoft | – | Calendar and mail integrations |
| Pub/Sub | Google Pub/Sub | – | Push notifications from Google Calendar |
| Container runtime | Docker Compose | – | Local development and deployment |

---

## 4. Frontend Architecture

### Structure

```
frontend/
├── app/                    Next.js App Router root
│   ├── page.tsx            Root page (loads WorkspaceApp)
│   ├── [view]/page.tsx     Dynamic routes for all 20 workspace views
│   ├── layout.tsx          Root HTML layout with fonts
│   ├── globals.css         TailwindCSS base styles
│   ├── workspace-app.tsx   Top-level single-page application shell
│   ├── workspace-navigation.tsx  Left-rail navigation
│   ├── sign-in.tsx         Authentication page
│   └── *-panel.tsx         Feature panels (one per workspace view)
├── lib/
│   └── api.ts              Typed HTTP client with CSRF, auth, and error handling
└── public/                 Static assets
```

### Single-Page Application Pattern

`WorkspaceApp` is the central shell. It holds the active view, current workspace, and open record dialog in state. Navigation changes the view without a full page reload. The URL is kept in sync using the History API so links are bookmarkable and shareable.

```mermaid
flowchart TD
    App["WorkspaceApp\n(Shell + State)"]
    Nav["WorkspaceNavigation\n(Left rail)"]
    View{"Active View\n(state)"}

    App --> Nav
    App --> View

    View --> Tasks["Tasks\n(RecordList + RecordEditor)"]
    View --> Pages["Pages\n(RecordList + RecordEditor)"]
    View --> Capture["CapturePanel"]
    View --> Calendar["CalendarPanel"]
    View --> Mail["MailPanel"]
    View --> Projects["ProjectPanel"]
    View --> Promises["PromisePanel"]
    View --> Decisions["DecisionPanel"]
    View --> Graph["ContextGraphPanel"]
    View --> Planning["PlanningPanel"]
    View --> Kits["KitsPanel"]
    View --> Meetings["MeetingBriefsPanel"]
    View --> Integrations["IntegrationsPanel"]
    View --> Enterprise["EnterprisePanel"]
    View --> Discovery["FutureDiscoveryPanel"]
    View --> Rules["RulesPanel"]
    View --> Activity["ActivityPanel"]
    View --> Collections["CollectionPanel"]
    View --> Settings["WorkspaceSettings"]
    View --> Operations["ActivityPanel (operations mode)"]
```

### URL Structure

| URL pattern | View |
|---|---|
| `/` | tasks (default) |
| `/tasks` | Task list |
| `/pages` | Pages |
| `/capture` | Capture triage |
| `/promises` | Promises |
| `/decisions` | Decisions |
| `/graph` | Context graph |
| `/planning` | Daily planning |
| `/kits` | Workspace kits |
| `/meetings` | Meeting briefs |
| `/integrations` | API keys + webhooks |
| `/enterprise` | Enterprise governance |
| `/discovery` | Future discovery |
| `/projects` | Projects |
| `/calendar` | Schedule / calendar |
| `/mail` | Mail |
| `/collections` | Knowledge collections |
| `/rules` | Automation rules |
| `/activity` | Activity log |
| `/settings` | Workspace settings |
| `/operations` | Background job operations |

### API Client (`frontend/lib/api.ts`)

All API calls go through a single `api<T>(path, parser, options?)` function:

- **Path normalisation:** Paths starting with `/workspaces/...` get `/api/v1` prepended. Paths already starting with `/api/v1/...` are used as-is.
- **CSRF:** All mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) automatically include the `x-csrf-token` header.
- **Body serialisation:** `options.body` accepts a plain object and is serialised to JSON automatically.
- **Error handling:** Non-2xx responses are parsed and thrown as typed errors.
- **Response parsing:** A `parser` callback handles shape validation of the response body.

---

## 5. Backend Architecture

### Structure

```
backend/src/
├── app.ts                  Fastify instance factory and module registration
├── main.ts                 Process entrypoint (reads config, starts server)
├── worker.ts               Background worker entrypoint
├── config/
│   ├── environment.ts      Environment variable parsing and validation
│   └── runtime.ts          Runtime settings (signing keys, derived config)
├── http/
│   ├── errors.ts           Fastify error handler registration
│   └── routes/
│       ├── health.ts        GET /health
│       └── operations.ts    Activity + job management routes
├── modules/
│   ├── workspace-access/   Auth, sessions, workspaces, members, invitations
│   ├── work-management/    Tasks and pages (canonical records)
│   ├── files/              File upload, download, scanning
│   ├── projects/           Projects, milestones, dependencies
│   ├── work-coordination/  Work actions, views, coordination
│   ├── scheduling/         Schedule blocks, preferences, recurrence
│   ├── providers/          OAuth providers, calendar, mail, notifications
│   ├── knowledge/          Collections, templates, relations, sources, collaboration
│   ├── capture-relationships/ Capture triage, promises, decisions, context graph
│   ├── kits-collaboration/ Workspace kits, formula evaluation
│   ├── ai-meetings/        Meeting briefs, AI settings
│   ├── planning-workload/  Daily plan, workload weather
│   ├── automation/         Automation rules, rule runs
│   ├── search-archive/     Full-text search, export/import, tombstones
│   ├── portability-quotas/ Quota management, export
│   ├── context-decisions/  Decision records, context graph nodes
│   ├── integrations-webhooks/ API keys, webhooks, deliveries
│   ├── enterprise-governance/ Policy, DLP, audit, operating model
│   └── future-discovery/   Handovers, freshness, scenarios, attention budgets, exposure
└── platform/
    ├── database/            Database pool, transaction helpers, Neon config
    └── ...
```

### Module Pattern

Each feature module follows the same pattern:

```
module-name/
├── routes.ts       Register Fastify routes, call service methods
└── service.ts      Business logic, database queries
```

Routes define the HTTP contract (path, method, schema validation). Services hold all business logic and SQL queries.

### Middleware Stack (per request)

```mermaid
sequenceDiagram
    participant B as Browser
    participant F as Fastify
    participant DB as PostgreSQL

    B->>F: HTTP request
    F->>F: Helmet (security headers)
    F->>F: AJV schema validation
    F->>F: Session cookie auth (identity.scope)
    F->>DB: Business logic query
    DB-->>F: Result rows
    F-->>B: JSON response
```

---

## 6. Database Architecture

All tables live in the `tantu` schema.

```mermaid
erDiagram
    users {
        uuid id PK
        text email
        text name
        text password_hash
        timestamptz created_at
    }
    workspaces {
        uuid id PK
        text name
        timestamptz created_at
    }
    memberships {
        uuid workspace_id FK
        uuid user_id FK
        text role
    }
    sessions {
        uuid id PK
        uuid user_id FK
        text token_hash
        timestamptz expires_at
    }
    records {
        uuid id PK
        uuid workspace_id FK
        text kind
        text title
        text body_ydoc
        integer version
        timestamptz created_at
    }
    projects {
        uuid id PK
        uuid workspace_id FK
        text title
    }
    promises {
        uuid id PK
        uuid workspace_id FK
        text description
    }
    decisions {
        uuid id PK
        uuid workspace_id FK
        text title
    }
    capture_items {
        uuid id PK
        uuid workspace_id FK
        text state
    }
    collections {
        uuid id PK
        uuid workspace_id FK
        text name
    }
    files {
        uuid id PK
        uuid record_id FK
        text name
        text media_type
        text scan_state
    }
    providers {
        uuid id PK
        uuid workspace_id FK
        text kind
        text access_token_enc
    }
    kits {
        uuid id PK
        uuid workspace_id FK
        text name
    }
    automation_rules {
        uuid id PK
        uuid workspace_id FK
        text name
    }
    webhooks {
        uuid id PK
        uuid workspace_id FK
        text url
    }
    api_keys {
        uuid id PK
        uuid workspace_id FK
        text key_hash
    }

    workspaces ||--o{ memberships : "has"
    users ||--o{ memberships : "belongs to"
    users ||--o{ sessions : "has"
    workspaces ||--o{ records : "owns"
    workspaces ||--o{ projects : "owns"
    workspaces ||--o{ promises : "owns"
    workspaces ||--o{ decisions : "owns"
    workspaces ||--o{ capture_items : "owns"
    workspaces ||--o{ collections : "owns"
    workspaces ||--o{ providers : "owns"
    workspaces ||--o{ kits : "owns"
    workspaces ||--o{ automation_rules : "owns"
    workspaces ||--o{ webhooks : "owns"
    workspaces ||--o{ api_keys : "owns"
    records ||--o{ files : "has"
```

---

## 7. Authentication & Session Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js
    participant F as Fastify
    participant DB as PostgreSQL

    B->>N: POST /api/v1/auth/login {email, password}
    N->>F: Proxied to :4000
    F->>DB: SELECT user WHERE email = ?
    DB-->>F: User row
    F->>F: bcrypt verify password
    F->>DB: INSERT session (token_hash, expires_at)
    F-->>B: Set-Cookie: tantu_session (HttpOnly)\nSet-Cookie: tantu_csrf (readable)
    B->>N: GET /api/v1/auth/session
    N->>F: Proxied + cookies forwarded
    F->>DB: SELECT session WHERE token_hash = ?
    F-->>B: {user, csrf}

    Note over B,F: Subsequent mutating requests
    B->>N: POST /api/v1/workspaces/:id/tasks\nX-CSRF-Token: <csrf value>
    N->>F: Proxied
    F->>F: Verify session cookie + CSRF header match
    F->>DB: INSERT record
    F-->>B: {id, title, ...}
```

**Session mechanism:**
- `tantu_session` — HttpOnly cookie containing an HMAC-SHA256 signed token. Never readable by JavaScript.
- `tantu_csrf` — Readable cookie. Its value must be echoed back as the `x-csrf-token` header on every mutating request. This is a synchronised double-submit CSRF pattern.

---

## 8. API Route Reference

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/health/ready` | Readiness probe (queries DB) |

### Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | Email + password login, sets session and CSRF cookies |
| GET | `/api/v1/auth/session` | Returns current user and CSRF token |
| POST | `/api/v1/auth/logout` | Destroys session, clears cookies |

### Workspaces & Members

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces` | List workspaces for authenticated user |
| POST | `/api/v1/workspaces` | Create workspace |
| PATCH | `/api/v1/workspaces/:workspaceId` | Rename workspace |
| GET | `/api/v1/workspaces/:workspaceId/members` | List members |
| PATCH | `/api/v1/workspaces/:workspaceId/members/:userId` | Update member role |
| DELETE | `/api/v1/workspaces/:workspaceId/members/:userId` | Remove member or leave workspace |
| POST | `/api/v1/workspaces/:workspaceId/invitations` | Invite member (Admin, Member, Guest) |
| POST | `/api/v1/invitations/accept` | Accept invitation (creates account if new) |

### Tasks & Pages (Records)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/tasks` | List tasks |
| POST | `/api/v1/workspaces/:workspaceId/tasks` | Create task |
| GET | `/api/v1/workspaces/:workspaceId/tasks/:recordId` | Get task |
| PATCH | `/api/v1/workspaces/:workspaceId/tasks/:recordId` | Update task |
| DELETE | `/api/v1/workspaces/:workspaceId/tasks/:recordId` | Delete task |
| GET | `/api/v1/workspaces/:workspaceId/tasks/:recordId/history` | Version history |
| GET | `/api/v1/workspaces/:workspaceId/pages` | List pages |
| POST | `/api/v1/workspaces/:workspaceId/pages` | Create page |
| GET | `/api/v1/workspaces/:workspaceId/pages/:recordId` | Get page |
| PATCH | `/api/v1/workspaces/:workspaceId/pages/:recordId` | Update page |
| DELETE | `/api/v1/workspaces/:workspaceId/pages/:recordId` | Delete page |
| GET | `/api/v1/workspaces/:workspaceId/pages/:recordId/history` | Version history |

### Files

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/workspaces/:workspaceId/records/:recordId/files` | Upload file |
| GET | `/api/v1/workspaces/:workspaceId/records/:recordId/files` | List files |
| POST | `/api/v1/workspaces/:workspaceId/records/:recordId/files/:fileId/access` | Get signed download token |
| GET | `/api/v1/workspaces/:workspaceId/records/:recordId/files/:fileId/content` | Download file content |
| DELETE | `/api/v1/workspaces/:workspaceId/records/:recordId/files/:fileId` | Delete file |
| POST | `/api/v1/workspaces/:workspaceId/records/:recordId/files/:fileId/rescan` | Trigger rescan |

### Projects

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/projects` | List projects |
| GET | `/api/v1/workspaces/:workspaceId/projects/:projectId` | Get project |
| POST | `/api/v1/workspaces/:workspaceId/projects/:projectId/tasks` | Link/unlink task to project |
| POST | `/api/v1/workspaces/:workspaceId/dependencies` | Add task dependency |
| POST | `/api/v1/workspaces/:workspaceId/projects/:projectId/members` | Manage project members |
| POST | `/api/v1/workspaces/:workspaceId/projects/:projectId/milestones` | Create milestone |

### Work Coordination

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/workspaces/:workspaceId/work/review` | Preview bulk work action |
| POST | `/api/v1/workspaces/:workspaceId/work/apply` | Apply reviewed work action |
| GET | `/api/v1/workspaces/:workspaceId/work/archived` | List archived items |

### Scheduling & Calendar

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/schedule` | Get schedule blocks |
| POST | `/api/v1/workspaces/:workspaceId/schedule/review` | Preview schedule changes |
| POST | `/api/v1/workspaces/:workspaceId/schedule/apply` | Apply schedule |
| POST | `/api/v1/workspaces/:workspaceId/schedule/unlock` | Unlock time block |
| GET | `/api/v1/workspaces/:workspaceId/schedule/preferences` | Get preferences |
| PATCH | `/api/v1/workspaces/:workspaceId/schedule/preferences` | Update preferences |
| POST | `/api/v1/workspaces/:workspaceId/tasks/:recordId/recurrence` | Set recurrence |

### Providers (Google / Microsoft)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/providers` | List connected providers |
| POST | `/api/v1/workspaces/:workspaceId/providers` | Connect provider (OAuth) |
| DELETE | `/api/v1/workspaces/:workspaceId/providers/:providerId` | Disconnect provider |
| GET | `/api/v1/workspaces/:workspaceId/providers/health` | Provider health status |
| POST | `/api/v1/workspaces/:workspaceId/providers/calendar/actions` | Calendar effect actions |
| POST | `/api/v1/workspaces/:workspaceId/providers/mail/actions` | Mail actions |
| GET | `/api/v1/workspaces/:workspaceId/providers/mail` | List mail threads |
| GET | `/api/v1/workspaces/:workspaceId/providers/notifications` | Pub/Sub notification endpoint |

### Capture, Promises, Decisions

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/capture` | List capture items |
| POST | `/api/v1/workspaces/:workspaceId/capture` | Add capture item |
| POST | `/api/v1/workspaces/:workspaceId/capture/:itemId/triage` | Triage item |
| DELETE | `/api/v1/workspaces/:workspaceId/capture/:itemId` | Delete item |
| GET | `/api/v1/workspaces/:workspaceId/promises` | List promises |
| POST | `/api/v1/workspaces/:workspaceId/promises` | Create promise |
| PATCH | `/api/v1/workspaces/:workspaceId/promises/:promiseId` | Update promise |
| GET | `/api/v1/workspaces/:workspaceId/decisions` | List decisions |
| POST | `/api/v1/workspaces/:workspaceId/decisions` | Create decision |
| GET | `/api/v1/workspaces/:workspaceId/context-graph` | Get context graph edges |
| POST | `/api/v1/workspaces/:workspaceId/context-graph` | Add edge |
| DELETE | `/api/v1/workspaces/:workspaceId/context-graph/:edgeId` | Remove edge |

### Collections & Knowledge

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/collections` | List collections |
| POST | `/api/v1/workspaces/:workspaceId/collections` | Create collection |
| GET | `/api/v1/workspaces/:workspaceId/collections/:collectionId` | Get collection |
| GET | `/api/v1/workspaces/:workspaceId/templates` | List templates |
| GET | `/api/v1/workspaces/:workspaceId/views/:kind/:resourceId` | Get saved views |
| POST | `/api/v1/workspaces/:workspaceId/views/:kind/:resourceId` | Save view |
| GET | `/api/v1/workspaces/:workspaceId/records/:recordId/context` | Record context |
| POST | `/api/v1/workspaces/:workspaceId/records/:recordId/relations` | Create relation |
| GET | `/api/v1/workspaces/:workspaceId/records/:recordId/embeds` | Source embeds |

### Kits

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/kits` | List kits |
| POST | `/api/v1/workspaces/:workspaceId/kits` | Create kit |
| GET | `/api/v1/workspaces/:workspaceId/kits/:kitId` | Get kit |
| POST | `/api/v1/workspaces/:workspaceId/kits/:kitId/formulas` | Evaluate formula |

### Planning & Workload

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/plan/daily` | Get daily plan |
| POST | `/api/v1/workspaces/:workspaceId/plan/daily` | Update daily plan |
| GET | `/api/v1/workspaces/:workspaceId/workload/weather` | Workload weather |

### AI Meetings

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/meetings/briefs` | List meeting briefs |
| GET | `/api/v1/workspaces/:workspaceId/meetings/briefs/:briefId` | Get brief |
| POST | `/api/v1/workspaces/:workspaceId/meetings/briefs` | Generate brief |
| PUT | `/api/v1/workspaces/:workspaceId/meetings/ai-settings` | Update AI settings |

### Automation Rules

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/rules` | List rules |
| POST | `/api/v1/workspaces/:workspaceId/rules` | Create rule |
| PATCH | `/api/v1/workspaces/:workspaceId/rules/:ruleId` | Update rule |
| DELETE | `/api/v1/workspaces/:workspaceId/rules/:ruleId` | Delete rule |
| GET | `/api/v1/workspaces/:workspaceId/rules/:ruleId/runs` | List rule runs |
| POST | `/api/v1/workspaces/:workspaceId/rules/:ruleId/runs` | Trigger rule manually |

### Search & Archive

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/search` | Full-text search |
| GET | `/api/v1/workspaces/:workspaceId/archive/export` | Export workspace data |
| POST | `/api/v1/workspaces/:workspaceId/archive/import` | Import workspace data |

### Integrations & Webhooks

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/api-keys` | List API keys |
| POST | `/api/v1/workspaces/:workspaceId/api-keys` | Create API key |
| DELETE | `/api/v1/workspaces/:workspaceId/api-keys/:keyId` | Revoke API key |
| GET | `/api/v1/workspaces/:workspaceId/webhooks` | List webhooks |
| POST | `/api/v1/workspaces/:workspaceId/webhooks` | Create webhook |
| PATCH | `/api/v1/workspaces/:workspaceId/webhooks/:webhookId` | Update webhook |
| POST | `/api/v1/workspaces/:workspaceId/webhooks/:webhookId/ping` | Send test ping |
| DELETE | `/api/v1/workspaces/:workspaceId/webhooks/:webhookId` | Delete webhook |

### Enterprise Governance

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/enterprise/policy` | Get policy |
| PUT | `/api/v1/workspaces/:workspaceId/enterprise/policy` | Update policy |
| POST | `/api/v1/workspaces/:workspaceId/enterprise/dlp/scan` | DLP scan |
| GET | `/api/v1/workspaces/:workspaceId/enterprise/audit` | Audit log |
| POST | `/api/v1/workspaces/:workspaceId/enterprise/audit/export` | Export audit log |
| GET | `/api/v1/workspaces/:workspaceId/enterprise/operating-model` | Operating model |

### Future Discovery

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/workspaces/:workspaceId/exposure/previews` | Exposure map preview |
| GET | `/api/v1/workspaces/:workspaceId/handovers` | List handover packs |
| POST | `/api/v1/workspaces/:workspaceId/handovers` | Create handover pack |
| GET | `/api/v1/workspaces/:workspaceId/freshness` | Freshness scores |
| POST | `/api/v1/workspaces/:workspaceId/scenarios` | Create scenario |
| DELETE | `/api/v1/workspaces/:workspaceId/scenarios/:scenarioId` | Delete scenario |
| GET | `/api/v1/workspaces/:workspaceId/attention-budget` | Attention budget |
| POST | `/api/v1/workspaces/:workspaceId/attention-budget` | Update attention budget |

### Portability & Quotas

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/quota` | Quota status |
| GET | `/api/v1/workspaces/:workspaceId/quota/usage` | Detailed usage |
| PATCH | `/api/v1/workspaces/:workspaceId/quota` | Update quota limits |
| POST | `/api/v1/workspaces/:workspaceId/export` | Export workspace |
| GET | `/api/v1/workspaces/:workspaceId/export/:exportId` | Export status |
| POST | `/api/v1/workspaces/:workspaceId/import` | Import data |

### Activity & Operations

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/activity` | Activity log |
| GET | `/api/v1/workspaces/:workspaceId/operations` | Background operations |
| POST | `/api/v1/workspaces/:workspaceId/jobs/:jobId` | Retry or cancel job |

---

## 9. Frontend View-to-API Mapping

| View | Panel file | Primary backend paths |
|---|---|---|
| tasks | record-list + record-editor | `/workspaces/:id/tasks`, `/workspaces/:id/tasks/:recordId` |
| pages | record-list + record-editor | `/workspaces/:id/pages`, `/workspaces/:id/pages/:recordId` |
| capture | capture-panel | `/workspaces/:id/capture`, capture triage |
| promises | promise-panel | `/workspaces/:id/promises` |
| decisions | decision-panel | `/workspaces/:id/decisions` |
| graph | context-graph-panel | `/workspaces/:id/context-graph` |
| planning | planning-panel | `/workspaces/:id/plan/daily`, `/workspaces/:id/workload/weather` |
| kits | kits-panel | `/workspaces/:id/kits` |
| meetings | meeting-briefs-panel | `/workspaces/:id/meetings/briefs`, `/workspaces/:id/meetings/ai-settings` |
| integrations | integrations-panel | `/workspaces/:id/api-keys`, `/workspaces/:id/webhooks` |
| enterprise | enterprise-panel | `/workspaces/:id/enterprise/policy`, DLP, audit |
| discovery | future-discovery-panel | `/workspaces/:id/exposure/previews`, handovers, freshness, scenarios, attention-budget |
| projects | project-panel | `/workspaces/:id/projects`, milestones, dependencies |
| calendar | calendar-panel | `/workspaces/:id/schedule`, calendar effects |
| mail | mail-panel | `/workspaces/:id/providers/mail` |
| collections | collection-panel | `/workspaces/:id/collections`, templates, views |
| rules | rules-panel | `/workspaces/:id/rules` |
| activity | activity-panel | `/workspaces/:id/activity` |
| settings | workspace-settings | `/workspaces/:id`, members, invitations, providers connect/disconnect |
| operations | activity-panel (ops mode) | `/workspaces/:id/operations`, `/workspaces/:id/jobs/:jobId` |

---

## 10. Security Architecture

```mermaid
flowchart TD
    Request["Incoming Request"]
    Helmet["Helmet\n(CSP, HSTS, X-Frame-Options)"]
    Schema["AJV Schema Validation\n(strict mode, no coercion)"]
    Session["Session Auth\nHMAC-SHA256 cookie verification"]
    CSRF["CSRF Check\nDouble-submit cookie pattern"]
    Handler["Route Handler"]
    DLP["DLP Engine\n(content scan)"]
    Scanner["ClamAV\n(file scan)"]

    Request --> Helmet
    Helmet --> Schema
    Schema --> Session
    Session --> CSRF
    CSRF --> Handler
    Handler --> DLP
    Handler --> Scanner
```

### CSRF Protection

All mutating requests require:
1. `tantu_csrf` cookie — set by the server at login
2. `x-csrf-token` request header — must match the cookie value

The server verifies both are present and equal. A cross-origin attacker cannot read the cookie to forge the header.

### Session Security

- Sessions stored in the database with `token_hash = HMAC-SHA256(raw_token, signing_key)`.
- Only the raw token travels in the cookie; the database never stores it.
- Session cookie is `HttpOnly; Secure; SameSite=Strict`.
- Session expiry is enforced on every request.

### Request Validation

- AJV validates every request body against a registered JSON Schema.
- `coerceTypes: false` — types must be exact (no `"123"` coerced to `123`).
- `removeAdditional: false` — extra fields cause a 400 error, preventing prototype pollution.

### File Security

- All uploaded files are virus-scanned by ClamAV before being made available.
- Download tokens are time-limited signed JWTs.
- File content is served from the Fastify backend, not a public bucket.

### DLP

- Enterprise workspaces can enable DLP scanning.
- Text content is inspected for policy violations before being persisted.

### Network Security

- Fastify only binds to `127.0.0.1` in production (`HOST` env var).
- `trustProxy: false` prevents IP spoofing via `X-Forwarded-For`.
- `APP_ORIGIN` is compared against the `Origin` header on cross-origin requests.

---

## 11. Background Worker

The worker process (`backend/src/worker.ts`) runs separately from the API server and shares the same PostgreSQL database.

```mermaid
flowchart LR
    API["API Server\n(enqueue jobs)"]
    PgBoss["pg-boss\n(job queue in PostgreSQL)"]
    Worker["Worker Process\n(dequeue + run)"]
    Scanner["ClamAV"]
    Providers["Google / Microsoft\nOAuth APIs"]

    API -->|"INSERT job"| PgBoss
    PgBoss -->|"SELECT + lock job"| Worker
    Worker -->|"Virus scan"| Scanner
    Worker -->|"Push notifications\nCalendar sync"| Providers
    Worker -->|"UPDATE job status"| PgBoss
```

**Processed job types:**
- File virus scan — scan uploaded files with ClamAV, update scan status
- Automation rule execution — evaluate and apply automation rules
- Webhook delivery — deliver payloads to registered webhook URLs with retry
- Provider sync — synchronise Google/Microsoft calendar and mail state
- Notification delivery — dispatch push notifications

---

## 12. Deployment Architecture

```mermaid
flowchart TD
    subgraph "docker-compose services"
        postgres[("postgres\n:5432\nPostgreSQL 16")]
        scanner["scanner\n:3310\nClamAV clamd"]
        migrator["migrator\n(one-shot)\nRun DB migrations"]
        backend["backend\n:4000\nFastify API server"]
        worker["worker\n(long-running)\npg-boss consumer"]
        frontend["frontend\n:3000\nNext.js server"]
    end

    migrator -->|"Depends on"| postgres
    backend -->|"Depends on"| postgres
    backend -->|"Depends on"| scanner
    worker -->|"Depends on"| postgres
    worker -->|"Depends on"| scanner
    frontend -->|"Proxies /api/v1/*"| backend
    migrator -.->|"Runs migrations then exits"| postgres
```

### Service Responsibilities

| Service | Image | Role |
|---|---|---|
| `postgres` | `postgres:16` | Primary database |
| `scanner` | `clamav/clamav` | File virus scanning daemon |
| `migrator` | local build | Runs SQL migrations, exits on completion |
| `backend` | local build | Fastify API server |
| `worker` | local build | Background job consumer |
| `frontend` | local build | Next.js app server |

---

## 13. Environment Configuration

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `HOST` | No | `127.0.0.1` | Bind address for Fastify |
| `PORT` | No | `4000` | Bind port for Fastify |
| `LOG_LEVEL` | No | `info` | Fastify log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `APP_ORIGIN` | Yes | – | Frontend origin, e.g. `http://localhost:3000`. Used for CORS and CSRF origin check. |
| `DATABASE_URL` | Yes | – | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/tantu` |
| `FILE_STORAGE_PATH` | Yes | – | Absolute path on disk to store uploaded files |
| `FILE_SIGNING_SECRET` | Yes | – | Hex-encoded secret for signing download tokens. Generate: `openssl rand -hex 32` |
| `SCANNER_HOST` | No | `127.0.0.1` | ClamAV daemon host |
| `SCANNER_PORT` | No | `3310` | ClamAV daemon port |
| `PROVIDER_VAULT_KEY` | Yes | – | Encryption key for storing OAuth tokens at rest |
| `GOOGLE_CLIENT_ID` | No | – | Google OAuth client ID (needed for Google integrations) |
| `GOOGLE_CLIENT_SECRET` | No | – | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | No | – | Microsoft OAuth client ID (needed for Microsoft integrations) |
| `MICROSOFT_CLIENT_SECRET` | No | – | Microsoft OAuth client secret |
| `MICROSOFT_TENANT_ID` | No | – | Microsoft tenant ID |
| `PROVIDER_NOTIFICATION_ORIGIN` | No | – | Public URL for receiving provider push notifications |
| `GOOGLE_PUBSUB_TOPIC` | No | – | Google Pub/Sub topic for calendar push |
| `GOOGLE_PUBSUB_AUDIENCE` | No | – | Expected audience on Pub/Sub JWT |
| `GOOGLE_PUBSUB_SERVICE_EMAIL` | No | – | Service account email for Pub/Sub verification |
| `GOOGLE_PUBSUB_SUBSCRIPTION` | No | – | Pub/Sub subscription name |

### Database Migration (`backend/.env` or separate)

| Variable | Required | Description |
|---|---|---|
| `MIGRATION_DATABASE_URL` | Yes | Connection string with migration-capable role (superuser or owner). May differ from `DATABASE_URL` if runtime role is restricted. |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `BACKEND_ORIGIN` | No | `http://127.0.0.1:4000` | URL of the Fastify backend, used by Next.js API proxy route handlers |

---

## 14. Development Guide

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or Docker)
- ClamAV (or Docker)

### Quick Start with Docker Compose

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your values

docker compose up -d postgres scanner
npm run migrate
npm run dev
```

### Manual Setup

```bash
# Install all dependencies
npm install

# Start the database and scanner
docker compose up -d postgres scanner

# Run database migrations
npm run migrate

# Start all services in parallel
npm run dev
```

### Individual Service Commands

| Command | What it runs |
|---|---|
| `npm run dev` | Starts frontend, backend, and worker in parallel |
| `npm run dev:frontend` | Next.js dev server on :3000 |
| `npm run dev:backend` | Fastify server on :4000 with ts-node |
| `npm run dev:worker` | Background worker with ts-node |
| `npm run migrate` | Runs all pending database migrations |
| `npm run check` | Lint + typecheck + test + build for all packages |

### Per-Package Commands

```bash
# Frontend
npm --prefix frontend run dev        # Dev server
npm --prefix frontend run build      # Production build
npm --prefix frontend run lint       # ESLint
npm --prefix frontend run typecheck  # tsc --noEmit

# Backend
npm --prefix backend run dev         # Dev server
npm --prefix backend run test        # Vitest unit tests
npm --prefix backend run lint        # ESLint
npm --prefix backend run typecheck   # tsc --noEmit

# Discovery (integration validation)
npm --prefix discovery run test      # Contract tests
npm --prefix discovery run lint      # ESLint
npm --prefix discovery run typecheck # tsc --noEmit
```

### Adding a New Workspace View

1. Create `frontend/app/<view-name>-panel.tsx`
2. Add the view name to `WORKSPACE_VIEWS` in `frontend/app/workspace-app.tsx`
3. Add `{ view: "<view-name>" }` to `generateStaticParams` in `frontend/app/[view]/page.tsx`
4. Add a navigation item in `frontend/app/workspace-navigation.tsx`
5. Add a case to the view-rendering section of `WorkspaceApp`

### Adding a New Backend Module

1. Create `backend/src/modules/<module-name>/routes.ts` and `service.ts`
2. Import and register the route function in `backend/src/app.ts`
3. All routes must be prefixed with `/api/v1/workspaces/:workspaceId/`
4. Use `identity.scope(request, workspaceId)` at the start of each handler to enforce session authentication and workspace membership

