# Workflow validation and release operations

All workflows can be started from GitHub Actions with `workflow_dispatch`. Run them against the same commit SHA and inspect each result before declaring the revision qualified. A successful workflow is evidence for its stated checks, not a production certification.

## Validation coverage

| Workflow | Checks |
| --- | --- |
| CI Pipeline | Application checks, foundation qualification, connected-work qualification, real isolated PostgreSQL, browser journeys, audits, Go archive checks, and baseline validation |
| Backend Testing & Validation | Backend lint, types, generated contract synchronization, unit tests, real PostgreSQL integration tests, and production compilation |
| Frontend Quality & Build | Frontend lint, types, route regression tests, and production build |
| End-to-End Testing | Isolated prototype browser journeys; connected application journeys additionally run through CI qualification |
| Code Quality & Coverage | Instrumented backend and discovery unit tests |
| Dependency Vulnerability Scanner | All three npm dependency trees, including development dependencies |
| Automated Dependency Updates | Informational outdated-package inventory; does not install updates |
| Docker Build & Container Security | Container image build and a blocking Trivy high/critical vulnerability scan |
| Performance & Lighthouse Audit | Static JavaScript bundle budget; this workflow currently does not run Lighthouse |
| Secret Detection | Gitleaks scan with the repository's reviewed example-template and exact historical test-fixture exceptions |

## Security tooling compatibility

The reviewed minimatch advisory [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) requires a patched 11.x matcher. Existing ESLint dependencies consume both legacy callable CommonJS exports and modern named exports. `tooling/minimatch-compat` adapts those export shapes to the unmodified `minimatch@11.0.3` engine. It does not reimplement pattern matching or suppress audit findings.

Each package overrides minimatch to this local development dependency. Package-local `.npmrc` files enable npm's packed `file:` dependencies with `install-links=true`, so clean installs resolve the engine independently in each package. The Dockerfile copies the adapter and npm configuration before installation. `npm run test:tooling` verifies the APIs used by the current lint configuration, ESM/CommonJS imports, and bounded brace expansion in all three installations. APIs removed by upstream minimatch 11, such as `makeRe`, are not restored; enabling a lint rule that requires them needs a separate compatibility review.

Keep all three lockfiles and the adapter engine pin synchronized. Run `npm run setup`, `npm run check`, and the low-severity audits after changing this dependency. The audits continue to include development dependencies.

The runtime image excludes the base image's npm package manager and its unused vulnerable dependencies. Compose starts Next.js directly with Node. Build stages retain npm for reproducible dependency installation. CI artifacts explicitly include the scoped hidden `discovery/.artifacts/` evidence directory, and failed qualification stages print bounded diagnostic output.

## Operational workflows

Release Management defaults to `publish=false` for manual runs. This mode builds a candidate archive, verifies its SHA-256 checksum, and retains it as a workflow artifact. It creates neither a version tag nor a GitHub release. Publication requires `publish=true` and an existing semantic version tag pointing at the checked-out commit. Pushing a version tag retains the publication behavior.

Production Deployment defaults to `validation_only=true` for manual runs. It verifies production builds without activating an environment. There is currently no hosting adapter in this repository: a real deployment request fails explicitly until artifact transfer, service activation, and an actual readiness request are implemented. The former echo-only steps did not deploy or check a service. Production confirmation gates remain in place.

Repository Maintenance defaults to `dry_run=true` for manual runs. It inspects workflow-retention candidates without deleting history. Scheduled retention keeps its existing behavior: fourteen-day retention with at least five runs preserved.

## CodeQL removal

CodeQL was removed at the repository owner's explicit request. The former workflow's JavaScript/TypeScript and Go matrix checks no longer run. The repository remains private. Dependency audits, Gitleaks, Trivy, and application security regressions remain enabled. Historical CodeQL failures remain in GitHub Actions history; removing the workflow does not erase them.

## Secret-scan fixtures

The full-history secret scan has exact historical exceptions for the synthetic HMAC key in `backend/test/integrations-webhooks.test.ts` at `fcb36b7:10`, the in-memory signing-key input in `backend/test/auth-security.test.ts` at `5b38f86:229`, and illustrative request passwords in `AUTH_SPECIFICATION.md` at `907828f:145`, `907828f:170`, and `f5e3cd3:209`. These inputs are examples, not deployed credentials. Current signing tests generate keys and documentation uses explicit placeholders. Existing environment-template exceptions remain unchanged. No test-directory exclusion or scanner disablement is used.

The SMTP normalization fixture also contained a deployed credential, discovered by manual review. Current source uses synthetic repeated-letter input instead. This credential has no scanner exception: the owner must revoke and replace it because removing it from current source does not remove Git history. Never copy real environment values into tests, even when a scanner does not identify their format.
