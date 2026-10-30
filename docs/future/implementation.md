# Future discovery and CI/CD orchestration implementation

The local future discovery implementation delivers the core candidate capabilities outlined in Phase 07 (`07-future-discovery`) of Tantu alongside a complete modernization of the GitHub Actions CI/CD workflow architecture. This encompasses Sharing Exposure Maps (F-05), Secure Handover Packs (F-03), Knowledge Freshness Checks (F-04), Workspace Scenario Planning (F-01), Attention Budgets (F-06), and 14 specialized GitHub Actions workflows. [Readiness](readiness.md) details verified engineering evidence and distinguishes local qualification from production rollout.

## Sharing exposure map and preview (F-05)

The Sharing Exposure Map (`tantu.sharing_exposure_previews`) calculates the blast radius of sharing workspace records before permissions are committed:
- **Recipient Analysis**: Inspects intended recipient identity and evaluates effective access levels (`view`, `comment`, `edit`, `admin`).
- **Inherited Access Trace**: Resolves parent project and workspace memberships to display what ambient rights the recipient will inherit upon sharing.
- **Inaccessible Reference Detection**: Identifies cross-referenced documents, tasks, or attachments contained within the shared record that the recipient will not have permissions to read, preventing unintentional data omission or broken links.
- **Human-Readable Summary**: Produces an unambiguous narrative explaining the exact consequences of the proposed share action.

## Secure handover packs (F-03)

Secure Handover Packs (`tantu.handover_packs`) facilitate structured responsibility transitions between team members:
- **Cryptographic Token Handshake**: Issues high-entropy handover tokens (`hnd_` prefix with 24 bytes of random hex) with automated time-bounded expiration (default 14 days).
- **Checklist Tracking**: Preserves explicit operational responsibilities (e.g. task handoffs, document ownership, external vendor touchpoints) with individual completion states.
- **Atomic Acceptance & Revocation**: Handover acceptance atomically transitions status from `pending` to `accepted` while logging timestamp and accepting user identity. Senders retain immediate revocation authority prior to acceptance.

## Knowledge freshness checks (F-04)

Knowledge Freshness Reviews (`tantu.knowledge_freshness_reviews`) prevent documentation decay in fast-evolving workspaces:
- **Cadence Configuration**: Configurable verification intervals (`review_cadence_days`, 7 to 365 days).
- **Dynamic Age Classification**: Computes status dynamically based on elapsed time:
  - `fresh`: Age < 80% of configured cadence.
  - `due_for_review`: Age between 80% and 100% of cadence.
  - `stale`: Age exceeds configured cadence.
- **Verification Logging**: Recording a verification confirms document accuracy, updates `last_reviewed_at`, and clears source change alerts.

## Workspace scenario planning (F-01)

The Scenario Simulator (`tantu.scenario_plans`) models hypothetical schedule revisions without altering live production records:
- **Delta Simulation**: Records proposed shifts in deadlines and task estimates against baseline projects.
- **Impact Summary Engine (`calculateScenarioImpact`)**: Computes total deadline shift in days, workload delta in hours, and counts impacted delivery commitments.
- **Feasibility Calibration**: Classifies proposals into `feasible` (safe capacity), `tight` (minor compression or moderate workload increase), and `infeasible` (heavy schedule compression < -5 days or workload expansion > 20 hours).

## Attention budgets and interruption controls (F-06)

Attention Budgets (`tantu.attention_budgets`) balance focus time with delivery awareness:
- **Focus Windows**: Configurable daily uninterrupted focus intervals (e.g. 09:00 to 12:00).
- **Notification Batching**: Consolidates non-critical notifications into scheduled delivery intervals (default 60 minutes).
- **Urgent Priority Bypasses**: Allows critical blocker alerts and urgent-priority tasks to penetrate focus windows immediately.

## Specialized GitHub Actions workflow architecture

The legacy monolithic `validate.yml` workflow has been replaced with 14 modular, path-filtered workflows:
1. `ci.yml`: Unified CI Pipeline orchestrating linting, strict typing, tests, builds, and synthetic qualifications.
2. `frontend.yml`: Path-filtered Next.js quality, strict TypeScript, and production build artifact generation.
3. `backend.yml`: Path-filtered Fastify typechecking, contract verification, and unit test execution.
4. `e2e.yml`: Playwright end-to-end browser journeys and synthetic test validation.
5. `codeql.yml`: CodeQL AST static security analysis for TypeScript and Go.
6. `dependency-scanner.yml`: Automated npm dependency vulnerability auditing (`npm audit`).
7. `secret-detection.yml`: Gitleaks scanner detecting leaked API tokens and credentials.
8. `docker.yml`: Multi-stage Docker container builds and Trivy container vulnerability scanning.
9. `deploy.yml`: Staging and production deployment pipelines with healthcheck readiness probes.
10. `release.yml`: Automated release packaging, changelog generation, and checksum publication.
11. `coverage.yml`: Code quality and test coverage tracking using Node's native test runner.
12. `lighthouse.yml`: Performance audits and JavaScript bundle budget enforcement.
13. `dependency-updates.yml`: Automated scheduled dependency updates and lockfile checks.
14. `maintenance.yml`: Scheduled repository maintenance, branch pruning, and workflow run retention.

