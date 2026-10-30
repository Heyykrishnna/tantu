# L0 product and measurement baseline

Date: 30 October 2026. Execution scope: local validation with documented defaults, confirmed by the project owner. All fixtures are synthetic. No real account consent, customer research, or production approval is represented as completed.

## Scope and terminology

Individuals, contributors, project owners, administrators, and invited guests retain the audiences defined by the PRD. A workspace contains personal/shared spaces; records have one canonical identity. A source reference links context without granting source access. A selected shared snapshot is a separate destination-governed copy. A promise requires explicit confirmation; a suggested request is not a confirmed commitment.

Mailbox inbox, Capture queue, and workspace Activity are different surfaces with different ownership and retention. Personal density/timezone/default views do not change teammates’ settings. Shared schemas and views require edit rights. Navigation remains Home, Capture, My Work, Projects, Calendar, Mail, Knowledge, Search, and Activity, with workspace/space switching, a command palette, and a shared record detail panel.

## Release boundary

L1 delivers the four connected domains, reliable sync/access/search, Capture-to-Action, and manual Promise Tracker. L2 adds the other five distinctive features, optional AI, shared mailboxes, and richer knowledge/planning. L2 public integration contracts/webhooks are a scoped interface foundation; L3 is the broader integration ecosystem, additional protocols, enterprise controls, and native/self-hosted evaluations. This distinction reconciles the PRD/roadmap wording without adding integration delivery to L1.

Generic IMAP/SMTP, native clients, self-hosting, SSO/SCIM, broad public publishing, arbitrary executable plugins, field-level collaboration permissions, and automatic unreviewed sending remain outside L1.

## Traceability decision

[requirements.json](requirements.json) assigns 50 derived `TNT-US-*` IDs to the original 50 numbered stories and six explicit `TNT-ARCHIVE-*` engineering requirements. These are newly assigned identifiers, not reconstructed missing originals. The dangling `ARCHIVE-06` reference now aliases `TNT-ARCHIVE-006`, the independent production archive enablement gate.

Historical cross-references are resolved here: retention is PRD §14, nonfunctional targets are §15, and future ideas are §22. The original PRD is preserved; the derived register supplies current ticket/acceptance traceability. Its generic story acceptance must be expanded with each implementation slice rather than treated as a complete behavior test by itself.

## Reviewable journeys

The isolated discovery prototype covers all six canonical journeys: email-to-work, meeting-to-execution, daily planning, research-to-knowledge, project recovery, and connection recovery. Each includes ordered steps, a source/access invariant, failure recovery, audience selection, and explicit excerpt-copy preview. It sends nothing and creates no production records.

Mobile review prioritizes capture, mail, task editing, and agenda. Native controls, visible focus, skip navigation, a single-column narrow layout, readable labels, and non-drag actions are design requirements. Automated browser checks are engineering evidence; they do not replace participant research or screen-reader qualification before launch.

## Pilot measurement definitions

All targets below remain qualification objectives, not measured user outcomes. Product owner is the project maintainer; engineering measurements are owned by the repository maintainer until named team assignments exist. No staffing, budget, delivery date, or pricing is invented.

| Measure | Denominator and window | Qualification objective | Collection boundary |
| --- | --- | --- | --- |
| Activation | Consented invited pilot users with an active account and a full seven-day observation window. | At least 60% create a task, schedule a block, and link context; report invitations and activated accounts separately. | Content-free completion events; exclude withdrawn consent. |
| Capture efficiency | Completed scripted synthetic email-to-task conversions; exclude user writing time. | Median under 30 seconds in a usability session. | Timings and outcome only; no message or recipient content. |
| Connected adoption | Retained opted-in workspaces with a complete weekly window. | At least 50% use three core domains in the week. | Domain-level event counts, not bodies or queries. |
| Commitment completion | Explicit promises with an agreed due date in the observed period. | Compare against that team’s measured baseline. | Confirmed state changes; unknown/cancelled outcomes reported separately. |
| Search usefulness | Fixed consented/synthetic authorized query set. | Expected record in the first five results for at least 90%. | Fixture identity and hit position; no private query logs. |
| Trust | Qualified writes/shares/sends and fault cases. | Zero accepted-write loss, unauthorized disclosure, or duplicate sends attributable to retries. | Incident class, operation ID, and sanitized evidence. |
| Integration health | Active authorized connections during healthy-provider windows. | At least 99% reconcile in their declared service window. | Separate provider delay, user revocation, and app faults. |

No participant values are fabricated. Baseline fixture checks and technical timings are recorded by the discovery harness; human usability/retention measurements begin with an approved pilot.

## Adoption and review

Engineering uses this unchanged-product-scope interpretation for local L0 execution. A human review of the prototype and pilot policy remains an explicit release input; this document does not claim a stakeholder interview, legal review, provider verification, or production launch authorization.
