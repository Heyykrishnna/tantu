import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const root = new URL("../../", import.meta.url);
const artifacts = new URL("../.artifacts/l0/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const commands = [
  ["application", "npm", ["run", "check"]],
  ["browser", "npm", ["--prefix", "discovery", "run", "test:browser"]],
  ["postgres", "npm", ["--prefix", "discovery", "run", "test:postgres"]],
  ["archive", "node", ["discovery/scripts/check-archive.mjs"]],
  ["frontend-audit", "npm", ["--prefix", "frontend", "audit", "--audit-level=low"]],
  ["backend-audit", "npm", ["--prefix", "backend", "audit", "--audit-level=low"]],
  ["discovery-audit", "npm", ["--prefix", "discovery", "audit", "--audit-level=low"]],
  ["baseline", "node", ["discovery/scripts/validate-baseline.mjs"]],
  ["workflow", process.env.TANTU_GO_BINARY || "go", ["run", "github.com/rhysd/actionlint/cmd/actionlint@v1.7.12", ".github/workflows/ci.yml"]],
];
const stages = [];
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0;

function run(name, command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: root,
      env: { ...process.env, GOCACHE: process.env.GOCACHE || join(tmpdir(), "tantu-l0-go-cache"), GOPATH: process.env.GOPATH || join(tmpdir(), "tantu-l0-go-path") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); process.stderr.write(chunk); });
    const deadline = setTimeout(() => child.kill("SIGKILL"), 300_000);
    child.on("error", (error) => { clearTimeout(deadline); reject(error); });
    child.on("close", async (code) => {
      clearTimeout(deadline);
      try {
        await writeFile(new URL(`${name}.log`, artifacts), output);
        stages.push({ name, command: [command, ...arguments_], exitCode: code, result: code === 0 ? "passed" : "failed" });
        if (code !== 0) reject(new Error(`L0 stage failed: ${name}`));
        else resolve();
      } catch (error) { reject(error); }
    });
  });
}

let result = "passed";
try {
  for (const [name, command, arguments_] of commands) await run(name, command, arguments_);
} catch (error) {
  result = "failed";
  process.stderr.write(`${error instanceof Error ? error.message : "L0 validation failed."}\n`);
  process.exitCode = 1;
}
await writeFile(new URL("report.json", artifacts), JSON.stringify({ result, revision, workingTreeDirty: dirty, executedAt: new Date().toISOString(), scope: "local synthetic engineering qualification", stages, productionReady: false, providerAccountsVerified: false, humanUsabilityQualified: false }, null, 2) + "\n");
process.stdout.write(`L0 ${result}; evidence at ${fileURLToPath(artifacts)}. Production and provider gates remain separate.\n`);
