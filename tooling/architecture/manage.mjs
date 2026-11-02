import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDelivery, differences, digest, snapshot } from "./snapshot.mjs";

const root = new URL("../../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const cli = ".agents/skills/archify/bin/archify.mjs";
const mode = process.argv[2];
const artifacts = readJson("tooling/architecture/artifacts.json").artifacts;
const baselinePath = "docs/architecture/sources.json";

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Archify ${args[0]} failed (${result.status ?? result.signal}).`);
}

function verifyArtifacts() {
  const runtimeAvailable = existsSync(new URL(cli, root));
  if (!runtimeAvailable && mode === "record-reviewed") throw new Error("Install the project Archify skill before recording reviewed sources.");
  for (const { candidate } of artifacts) {
    const spec = readJson(candidate);
    const receipt = readJson(spec.meta.output.replace(/\.html$/, ".delivery.json"));
    assertDelivery(readFileSync(new URL(candidate, root)), readFileSync(new URL(spec.meta.output, root)), receipt);
    if (runtimeAvailable) run(["validate", spec.diagram_type, candidate, "--repo-root", ".", "--quality", "showcase", "--json"]);
    if (runtimeAvailable && receipt.output === resolve(fileURLToPath(root), spec.meta.output)) {
      run(["check", spec.meta.output, "--json", "--require-provenance"]);
    }
  }
  if (!runtimeAvailable) process.stdout.write("Portable source and delivery-hash checks passed. Local Archify runtime revalidation was not run; the project skill is not installed in this checkout.\n");
}

function artifactDigests() {
  return Object.fromEntries(artifacts.flatMap(({ candidate }) => {
    const spec = readJson(candidate);
    return [candidate, spec.meta.output].map((path) => [path, digest(readFileSync(new URL(path, root)))]);
  }));
}

try {
  if (mode === "build") {
    for (const { candidate } of artifacts) {
      const spec = readJson(candidate);
      const evidence = `${dirname(spec.meta.output)}/verification-${Date.now()}`;
      run(["finalize", spec.diagram_type, candidate, spec.meta.output, "--repo-root", ".", "--quality", "showcase", "--out-dir", evidence, "--json"]);
    }
  } else if (mode === "record-reviewed") {
    verifyArtifacts();
    const record = {
      schemaVersion: 1,
      evidenceRevision: readJson(artifacts[0].candidate).meta.repository.revision,
      files: snapshot(root),
      artifacts: artifactDigests(),
    };
    mkdirSync(fileURLToPath(new URL("docs/architecture", root)), { recursive: true });
    writeFileSync(new URL(baselinePath, root), `${JSON.stringify(record, null, 2)}\n`);
    process.stdout.write("Recorded reviewed sources and delivered artifact hashes. Run architecture:check next.\n");
  } else if (mode === "check") {
    const baseline = readJson(baselinePath);
    const changes = [...differences(baseline.files, snapshot(root)), ...differences(baseline.artifacts, artifactDigests())];
    if (changes.length) throw new Error(`Architecture review required:\n${changes.join("\n")}\nReview the affected sources and diagrams, rebuild, then run architecture:record-reviewed.`);
    for (const { candidate } of artifacts) {
      const spec = readJson(candidate);
      for (const element of spec.components ?? spec.nodes) {
        for (const source of element.sources) {
          const committed = execFileSync("git", ["show", `${spec.meta.repository.revision}:${source.path}`], { cwd: root });
          const current = readFileSync(new URL(source.path, root));
          if (digest(committed) !== digest(current)) throw new Error(`Evidence differs from pinned revision: ${source.path}. Update the diagram revision and citations after review.`);
        }
      }
    }
    verifyArtifacts();
    process.stdout.write("Architecture sources, skill-lock identity, candidates and HTML are synchronized.\n");
  } else {
    throw new Error("Usage: node tooling/architecture/manage.mjs build|check|record-reviewed");
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
