# tantu Roadmap and Project Design

Planning baseline: 29 October 2026. Source: current PRD and the confirmed requirements in this chat. Status: proposed delivery plan; no application work or validation results are represented as completed.

Miro board: [tantu Product roadmap architecture and project flows](https://miro.com/app/board/uXjVEURctQQ=/).

## Planning rules

Use dependencies and evidence gates rather than invented delivery dates. Assign named people, capacity, estimates and dates only after L0 validation. Accountable roles below describe responsibility, not an assigned employee. TypeScript frontend is fixed. Choose one primary TypeScript or Rust backend in L0; the upstream Go MinLZ integration remains an isolated archive adapter. Preserve personal mail privacy, canonical record identity and reviewed external actions throughout.

## Delivery sequence

| Stage | Deliverable and user outcome | Depends on | Accountable role | Exit evidence |
| --- | --- | --- | --- | --- |
| L0 | Confirm journeys, terminology, sharing model and prototype the riskiest interactions | Existing PRD | Product and Design | Reviewable flows and explicit scope/permissions |
| L0 | Decide backend, editor/collaboration, timezone/recurrence approach and durable job design | Workload and team capability | Tech Lead | Representative sync/query/worker spikes and architecture decision |
| L0 | Begin Gmail/Microsoft consent, scope verification and security-assessment preparation | Selected provider capabilities | Integration and Security | Tracked provider approval prerequisites and owners |
| L0 | Pin MinLZ and prove stream integrity/exact-search capabilities | Archive scope and upstream library | Archive Lead | Independent byte-scan oracle, boundary and resource tests |
| L1a | Establish tenant/space membership, role/grant checks and secure sessions | G0 | Identity and Access | Cross-tenant, guest and revocation tests |
| L1a | Establish canonical records, migrations, transactions, outbox and durable jobs | G0 | Backend | Crash/replay and accepted-write durability tests |
| L1a | Task/page core, shared record views and secure files | Identity and data foundations | Work, Knowledge and Platform | Canonical identity, safe files and history behavior |
| L1b | Projects, milestones, subtasks, dependencies, recurrence and all work views | G1 | Work Lead | Cycle rejection, rollups and recurrence fixtures |
| L1b | Interactive calendar with time blocks, overlays, timezone/DST, conflict and exception handling | G1 | Scheduling Lead | Keyboard/drag scheduling and recurrence round trips |
| L1b | Gmail/Microsoft mail, drafts/replies/attachments and provider-faithful mailbox organization | G1 and delegated account access | Mail Lead | Controlled provider-contract journeys and ambiguous-send handling |
| L1b | Robust cursors, renewal, throttling, resync and reconciliation | Durable jobs and provider mappings | Sync Lead | Missed/duplicate hints and expired-cursor recovery |
| L1b | Typed knowledge collections, linked views, backlinks, comments/history and collaboration | Task/page core and access | Knowledge Lead | Concurrency and authorized projection tests |
| L1c | Capture-to-Action and manual Promise Tracker | G2 | Product and Work Lead | Reviewed conversion preserves source privacy and deduplicates |
| L1c | Unified live search and controlled MinLZ archive integration | Canonical state and access | Search and Archive Lead | Current ACL/tombstones, exact archive matches and honest completeness |
| L1c | Export/import, customization, limited offline recovery and accessible responsive flows | Integrated domains | Platform and Design | Recovery, portability and manual accessibility qualification |
| L1c | Pilot launch and support readiness | G2, provider approvals and launch evidence | Security, QA and Operations | G3 evidence pack and incident ownership |
| L2 | Context Graph, Plan My Day, Workload Weather, Workspace Kits and Decision Memory | Stable L1 plus feature-specific evidence | Product and respective domain leads | User value, permissions and review policies qualified separately |
| L2 | Optional AI, meeting preparation/review, shared inboxes and richer formulas | Relevant stable domain modules | Product and respective domain leads | Source/privacy evaluations and maintained non-AI workflows |
| L3 | Integrations/webhooks, IMAP/SMTP, enterprise controls and native/self-hosted evaluations | Separate business case and technical readiness | Product, Security and Tech Lead | Separate approved specifications and operating model |

G0 closes discovery. G1 confirms foundation. G2 confirms connected workflows. G3 authorizes launch only after the evidence below exists. L2 feature gates apply independently; L3 is a strategic expansion, not a promise that every L2 feature must finish first. Provider verification begins in parallel in L0 and gates public provider availability. MinLZ production enablement has an independent correctness/security/suitability gate.

## Architecture and ownership

The browser application uses TypeScript with React/Next.js and the proposed presentation/editor/calendar libraries already identified in the PRD. Its network contract reaches a modular monolith implemented in either TypeScript or Rust. Next.js presentation does not become a second competing owner of domain rules.

Nine modules own behavior behind focused interfaces: Workspace/Access, Work management, Knowledge, Scheduling, Mail, Capture/Relationships, Search/Archive, Sync, and Automation. PostgreSQL stores canonical app-owned records and a transactional outbox. Durable workers reconcile provider data and project authorized state into search/graph views. Google/Microsoft adapters retain provider semantics. Private object storage holds approved files and archives. The isolated Go archive adapter uses the pinned upstream MinLZ implementation.

Providers are authoritative for provider-owned messages/events; app storage owns tasks, pages and reviewed snapshots. The search index and graph are derived. Current authorization applies to returned records, snippets, counts, backlinks, exports, assistant retrieval and queued external actions. Optional AI sits behind account/workspace opt-in and cannot acquire authority from source content.

## Product structure

Navigation: workspace/space switcher, Home, Capture, My Work, Projects, Calendar, Mail, Knowledge, Search and Activity. Distinguish the email inbox from workspace notifications and the capture queue. The shared record detail panel exposes properties, source, relationships, comments, history and access without duplicating records. Responsive mobile flows prioritize capture, mail, task editing and agenda; provide non-drag scheduling and accessible view alternatives.

A project links tasks, milestones, pages and decisions. Tasks have independent deadlines and may link multiple time blocks. A time block may map to a provider event, while event-series/occurrence identity remains separate. Collections define properties; linked views reuse canonical records. Private mail source references do not grant mailbox access. Reviewed selected snapshots become independent destination-governed copies.

## Main project flow

Receive information -> capture/triage -> review task properties and shared audience -> authorize/deduplicate -> create one task and source reference transactionally -> update derived views -> preview scheduling -> check conflicts/timezone/dependencies/locked time -> review external effects -> version recheck -> durable provider operation -> confirmed, failed or unknown status -> linked notes/promise tracking -> reviewed task completion and future blocks -> optional reviewed reply.

Duplicate capture offers the existing record or a deliberate new copy. Stale schedule previews require revision. Completing a task does not silently cancel external meetings. Suggested commitments are not confirmed promises. Provider acceptance is not proof of message delivery, and an ambiguous send is not blindly retried.

## Reliability and archive controls

Sync begins with a validated provider hint or reconciliation timer, uses a durable resource job, applies each page and its checkpoint safely, and publishes projections through the outbox. Expired provider cursors rebuild provider projections without destroying app-owned work. Repeated or reordered hints are deduplicated; throttling uses bounded backoff; revoked authorization stops execution.

Archive search selects authorized immutable manifests and privacy compartments, validates stream/sidecar association, decrypts eligible ranges, conservatively skips definite nonmatches, decodes candidates and handles cross-block patterns, verifies exact bytes, maps offsets to record identities and rechecks ACL/tombstones. Complete, partial and failed results remain distinct. Benchmarking, integrity and bounded-resource evidence precede enablement.

## Future development portfolio

These are discovery candidates, not additions to committed launch scope.

| Candidate | Recommendation | Practical first use | Promotion evidence |
| --- | --- | --- | --- |
| Sharing preview and exposure map | First discovery | Preview guest-visible records and copied excerpts | Users correctly predict access; no hidden-record leakage |
| Secure handover packs | First discovery | Transfer selected responsibilities to a covering colleague | Recipient identifies next actions without private-source exposure |
| Knowledge freshness checks | First discovery | Flag selected instructions when linked decisions change | Useful owner reviews with acceptable false-alert rate |
| Workspace scenario planning | Next once inputs are dependable | Compare date/scope/capacity alternatives before changing live work | Feasible choices explained accurately without invented capacity |
| Scope and change agreements | Conditional on service-team demand | Link new requests to approved deliverables/exclusions | Reduced repeated scope disputes |
| Attention budgets | Conditional on notification overload | Batch nonurgent updates around explicit focus windows | Fewer interruptions without missed critical work |
| Evidence of completion | Conditional on review-heavy workflows | Attach the accepted artifact/revision to a milestone | Fewer reopenings without routine-work friction |
| Automation recipe suggestions | After stable rule engine and consent | Suggest a dry-run recipe from repeated permitted actions | Useful accepted suggestions and low false-trigger rates |
| Estimate calibration | After adequate opted-in data | Improve review-task estimates from confirmed outcomes | Better planning with visible uncertainty and no employee scoring |
| Return-to-work planning | Conditional on recurring absences/handoffs | Review unresolved changes and choose a paced catch-up plan | Faster identification of useful actions without implicit commitments |

## Launch evidence and immediate decisions

Qualification must cover tenant isolation and current-access revocation; one-record consistency across views; email-to-task sharing; dependency cycles and progress; timezone/DST/recurrence; duplicate submissions and ambiguous sends; dropped/duplicate notifications; expired cursor recovery; concurrent page edits; archive byte-oracle and corrupted/short/boundary fixtures; keyboard/screen-reader journeys; restore/deletion ledgers; quotas and content-free diagnostics.

Before assigning dates: name the accountable people; choose backend/toolchain/library versions; confirm provider permissions and review lead times; select deployment region, identity provider and retention defaults; define the pilot cohort and load/relevance fixtures; estimate vertical slices with team capacity. Track every unresolved choice as a decision, not as a completed technical commitment.

## Miro review checklist

Verify actual native frames and content against this plan, inspect readability and connectors, preserve pending decisions, and leave sharing unchanged. Board creation is planning work; application test gates remain future implementation requirements.
