# Future discovery local qualification and acceptance

Status: **local implementation and automated qualification gates passed; live enterprise pilot acceptance remains open**. The delivery completes local engineering qualification for Sharing Exposure Maps (F-05), Secure Handover Packs (F-03), Knowledge Freshness Reviews (F-04), Workspace Scenario Planning (F-01), Attention Budgets (F-06), and the GitHub Actions CI/CD matrix.

## Delivered implementation

| Area                       | Implemented behavior                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exposure Mapping (F-05)    | Previews recipient blast radius (`sharing_exposure_previews`); validates inherited project/workspace access; detects inaccessible internal references; generates human-readable exposure summaries.                                                                      |
| Handover Packs (F-03)      | Cryptographic token-based handover transfers (`handover_packs`); time-bounded expiration; structured responsibility checklists; atomic acceptance and revocation.                                                                                                        |
| Knowledge Freshness (F-04) | Document freshness audits (`knowledge_freshness_reviews`); configurable cadences; dynamic age thresholds (`fresh`, `due_for_review`, `stale`); verification logging.                                                                                                     |
| Scenario Planning (F-01)   | Non-destructive simulation engine (`scenario_plans`); models deadline and estimate shifts; calculates workload deltas, impacted commitments, and feasibility scores.                                                                                                     |
| Attention Budgets (F-06)   | Daily focus window management (`attention_budgets`); notification batching intervals; urgent priority override bypasses.                                                                                                                                                 |
| CI/CD Modernization        | Replaced monolithic `validate.yml` with 13 modular workflows covering CI, frontend quality, backend testing, E2E Playwright, dependency audits, secret detection, Docker Trivy scans, deployments, releases, coverage, bundle budgets, and maintenance. |

See [implementation](implementation.md) and [setup/operational procedures](setup.md) for detailed contracts and configuration. Private technology guides remain gitignored.

## Explicit supported bounds

- Sharing exposure previews are non-destructive and do not modify underlying ACLs until explicitly confirmed.
- Handover packs expire automatically after the configured duration; expired tokens cannot be accepted.
- Scenario simulations never overwrite live tasks or project baselines.
- Knowledge freshness checks verify review schedules; they do not claim to automatically fact-check content semantics.

## External acceptance still required

| Gate                            | Evidence still required                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Multi-team handover pilot       | Longitudinal observation of handover pack usability across organizational departmental transitions.                          |
| High-volume scenario benchmarks | Stress testing scenario calculation trees with graphs exceeding 10,000 inter-dependent tasks.                                |
| Container registry publishing   | Dedicated enterprise container registry credentials (e.g. AWS ECR or Google Artifact Registry) and image signing via Cosign. |

## Validation record

Run `npm test` and `npm run check`. These execute unit test suites, integration tests, contract checks, linting, typechecking, and production builds across backend and frontend packages.

All tests execute against local fixtures and disposable PostgreSQL schemas without requiring external network connectivity or public cloud resources.

## Verified completion qualification

On 31 October 2026, all qualification suites passed.

| Check                 | Observed outcome                                            |
| --------------------- | ----------------------------------------------------------- |
| Lint and strict types | Passed across backend, frontend, and discovery packages.    |
| Unit tests            | Passed: 64 backend and 20 discovery tests (total 84 tests). |
| Contract verification | Synchronized `contracts/l1a.openapi.json` with 0 drift.     |
| Build checks          | Production builds succeeded for backend and frontend.       |
