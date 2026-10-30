# L0 readiness and evidence

Baseline: 30 October 2026. Project-owner execution choice: local validation with documented defaults. Engineering experiments are reproducible and isolated; the product backend remains boilerplate.

## Gate decision

**Local engineering qualification:** implemented and subject to the recorded command results. **Full G0:** conditional, not unconditionally passed. No production readiness, real-provider access, security certification, legal review, participant usability result, or deployed identity is claimed.

The original phase plan requires choices and approvals beyond a local experiment. Those requirements are retained rather than waived. Work can be reviewed and handed to the next implementation slice, but production ingestion/provider availability must stay disabled until their prerequisites are satisfied.

The original checklist records 28 locally addressed engineering tasks and four unresolved items: frontend toolchain support, production identity/hosting/region, approved real provider test accounts, and retention/policy review. The corresponding boxes remain unchecked. A successful local command does not close them automatically.

## Deliverables

| L0 part | Delivered evidence | Remaining qualification boundary |
| --- | --- | --- |
| Product and experience | Fifty original stories mapped to 56 clearly derived requirement IDs, six local audience/recovery previews, pilot denominators, scope/information architecture, keyboard/mobile engineering checks. | Participant usability, manual screen-reader review, and human pilot acceptance are not fabricated. |
| Architecture and contracts | One backend direction, nine module owners, 16 strict draft schemas, collaboration/recurrence experiments, PostgreSQL/job recovery, immutable CI pins, and recorded technology trade-offs. | Production identity/region/hosting decisions and the frontend lint support exception remain open. |
| Provider/security readiness | Delegated scope/capability plan, threat model, synthetic adversarial inventory, privacy/state fixtures, retention proposals, and external approval ledger. | Approved real test accounts, public verification/assessment, and contractual/jurisdiction retention review are not performed. |
| Search/archive | Real 100,000-record PostgreSQL search/RLS fixture; pinned Go MinLZ oracle/integrity/resource tests, vet/race/fuzz checks, and synthetic inline/sidecar observations. | Production corpus, encrypted object storage, actual provider data, and full archive enablement remain separate gates. |

## Required validation

From the project root:

```bash
npm run setup
npm run check:l0
```

Use Node.js 24/npm 11, PostgreSQL 16+ tools, Python 3, Go 1.24+, and Chrome locally or Playwright Chromium in CI. Set `PG_BIN` and `TANTU_GO_BINARY` when binaries are outside PATH. The harness creates a private database cluster and deletes it; it must never use an existing database.

The full command runs application/discovery lint, strict types, unit tests, both application builds, two browser journeys, database experiments, archive checks, three dependency audits, tracked-document/ignore validation, and pinned actionlint workflow checks. It returns nonzero on any failed stage and stores exact commands, revision, dirty-tree state, results, and logs in ignored artifacts. A workflow file is validated locally; GitHub execution is not claimed until a remote run actually occurs.

## Actual evidence interpretation

The fixed PostgreSQL corpus has 100,000 mixed-access records and 566 expected authorized matches for the designated query. The workload exercises 1,000 jobs with two claimers. Reports record actual timing and environment; numbers are observations, not an independent production benchmark.

The archive uses MinLZ v1.2.0 with an independent byte oracle, 4-KiB search blocks, a bounded full decoder, and explicit complete/partial/failed states. Five seconds of bounded fuzzing and 20 iterations per synthetic benchmark are configured. Search-table/read counts and compressed-size ratios describe that corpus; logical MB/s is not physical storage bandwidth or a promised customer outcome.

Earlier failures remain documented: direct recurrence TZID drift led to explicit Temporal conversion; newer pg-boss declaration failures led to a strictly typed API pin with explicit application fencing; the MinLZ decoder rejects its documented 4-KiB option boundary, so the bounded full decoder uses 8 KiB while search/output bounds remain independent. These are decisions supported by experiments, not reasons to weaken expected results.

## Open decisions and owners

| Item | Accountable owner | Unblock condition | Gate affected |
| --- | --- | --- | --- |
| Frontend lint support | Engineering maintainer | Compatible supported plugin/toolchain or an explicitly approved maintenance exception; retain current checks meanwhile. | Full G0 / release maintenance approval. |
| Production identity/host/region/keys/backup | Project owner with platform/security review | Explicit service/account, residency, operating responsibility, key/backup, and cost choices. | Full G0 production-design closure and real-data ingestion. |
| Real Google/Microsoft test accounts and consent | Project owner / Integration | Register applications and approve controlled accounts/scopes; never send credentials through documentation. | Provider contract qualification. |
| Provider public approval/assessment | Project owner / Security | Complete applicable verification and assessment with actual provider evidence. | Public provider availability. |
| Retention/contract/jurisdiction policy | Project owner / Security | Review proposed defaults and deletion/restore obligations against the actual deployment. | Production policy and ingestion. |
| Human usability/accessibility review | Product / Design | Review journeys with participants and perform manual keyboard/screen-reader qualification. | Pilot/launch acceptance. |

The detailed technology explanation requested by the project owner is local-only and excluded from commits. Tracked engineering decisions, requirements, and reproducible tests remain available to collaborators. No tracked document links to private local reports.

## L1 handoff

Implement identity/tenant scope and canonical persistence first, carrying current-access checks, transactional outbox, monotonic job fencing, schema/version/idempotency rules, and privacy-preserving relationships forward. Do not import the disposable SQL, policy model, synthetic records, or archive experiment as finished production behavior. The relevant L1 gates still require real integration, migration/recovery, accessibility, provider, and operational evidence.

Supporting records: [product baseline](product-baseline.md), [provider/security readiness](provider-security-readiness.md), [database methodology](database-qualification.md), [architecture decision](../decisions/0003-l0-local-engineering-baseline.md), and [requirement register](requirements.json).
