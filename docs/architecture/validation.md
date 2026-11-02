# Architecture validation

Verified on 2 November 2026. These results describe this authoring session and local working tree; they do not establish a successful remote CI run or production deployment.

| Command / check | Actual result |
| --- | --- |
| `node .agents/skills/archify/bin/archify.mjs doctor` | Passed for the project-only Codex installation, Archify 3.2.0 |
| `npm run architecture:build` | Passed for both diagrams: showcase validation, repository evidence, delivery, strict artifact provenance and real Chrome browser checks |
| Archify `visual-check` | Light/dark captures at 1440×900 and 2048×1320 passed for both diagrams; runtime and workflow captures were inspected for alignment and readability |
| `npm run check` | Passed lint, strict type checks, unit tests and frontend/backend production builds; 133 tests passed across tooling, frontend, backend and discovery |
| `npm run test:architecture` | Four regression tests passed: deterministic drift reporting, exact-byte hashing, source additions/edits/deletions with ignored-secret exclusion, and candidate/HTML delivery binding |
| `npm run architecture:inventory` | Generated the exact-version inventory from all three lockfiles |
| `npm run architecture:record-reviewed` and `npm run architecture:check` | Reviewed-source snapshot recorded; source, candidate, delivered HTML and skill-lock checks passed |
| Isolated checkout without the local Archify skill | Portable source/delivery-hash checks passed; no fresh Archify browser run was claimed for that checkout |
| Deliberately added source and altered HTML in the isolated checkout | Both rejected by the synchronization check as expected |
| Node syntax checks for the new tooling, documentation links and authored-file whitespace | Passed |
| `git diff --check -- README.md package.json` | Passed for the edited tracked files |
| Repository-wide `git diff --check` | Failed on existing unrelated whitespace in frontend capture, decision, kits, rules and workspace-settings edits; those files were preserved |

Database integration, provider-account, end-to-end application journeys, deployment and manual assistive-technology qualification were not run for this documentation/tooling change. The passing production builds and unit tests do not imply those separate checks passed. Initial diagram authoring found source-range errors, which were corrected. Sandboxed Chrome startup initially failed; the final build and browser checks succeeded with desktop execution permission.

Archify verification folders are ignored runtime evidence. Checked-in candidates, HTML and delivery hashes live in `diagrams/`; source fingerprints live in `sources.json`. The absolute host paths in Archify receipts are deliberately not presented as portable browser evidence. See the [synchronization workflow](README.md#keeping-the-atlas-synchronized).
