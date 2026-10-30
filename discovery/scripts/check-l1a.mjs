import { spawnSync, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const connected = process.argv.includes("--connected");
const phase = connected ? "l1b" : "l1a";
const artifacts = new URL(`../.artifacts/${phase}/`, import.meta.url);
await mkdir(artifacts, { recursive: true });
const stages = [
  ["application", "npm", "run", "check"],
  ["integration", "npm", "--prefix", "backend", "run", "test:integration"],
  ["browser", "npm", "--prefix", "discovery", "run", "test:l1a:browser"],
  ["contracts", "npm", "--prefix", "backend", "run", "contracts:check"],
  ["frontend-audit", "npm", "--prefix", "frontend", "audit", "--audit-level=low"],
  ["backend-audit", "npm", "--prefix", "backend", "audit", "--audit-level=low"],
  ["discovery-audit", "npm", "--prefix", "discovery", "audit", "--audit-level=low"],
  ["baseline", "node", "discovery/scripts/validate-baseline.mjs"],
];
const report = { executedAt: new Date().toISOString(), revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), workingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0, scope: connected ? "local L1B implementation qualification with synthetic accounts and provider HTTPS fixtures; real-provider and human G2 acceptance remain open" : "local L1A application qualification with synthetic accounts", productionReady: false, realMalwareEngineVerified: false, stages: [], result: "running" };
for (const [name, executable, ...args] of stages) {
  const startedAt = Date.now();
  process.stdout.write(`Checking ${name}…\n`);
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024, env: process.env });
  await writeFile(new URL(name + ".log", artifacts), (result.stdout ?? "") + (result.stderr ?? "") + (result.error ? "\n" + result.error.message : ""));
  const passed = result.status === 0 && !result.error;
  report.stages.push({ name, command: [executable, ...args], exitCode: result.status, result: passed ? "passed" : "failed", milliseconds: Date.now() - startedAt });
  report.result = passed ? "running" : "failed";
  await writeFile(new URL("report.json", artifacts), JSON.stringify(report, null, 2) + "\n");
  if (!passed) { process.stderr.write(`Failed ${name}; inspect discovery/.artifacts/${phase}/${name}.log.\n`); process.exitCode = 1; break; }
}
if (report.stages.length === stages.length && report.stages.every((stage) => stage.result === "passed")) report.result = "passed";
await writeFile(new URL("report.json", artifacts), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(`${phase.toUpperCase()} local qualification: ${report.result}. Production and real-engine gates remain separate.\n`);
