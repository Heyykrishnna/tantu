import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export const sourcePaths = [
  "backend/src", "backend/migrations", "frontend/app", "frontend/components", "frontend/lib",
  "contracts", "docker", ".github/workflows", ".agents/skills/archify", "skills-lock.json",
  "tooling/architecture", "docs/architecture", "package.json", ".nvmrc", "Dockerfile",
  "docker-compose.yml", "frontend/next.config.ts", "frontend/package.json",
  "frontend/package-lock.json", "backend/package.json", "backend/package-lock.json",
  "discovery/package.json", "discovery/package-lock.json", "README.md",
];

export function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function snapshot(root) {
  const paths = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...sourcePaths], { cwd: root, encoding: "utf8" });
  const unique = [...new Set(paths.split("\0").filter(Boolean))].filter((path) => path !== "docs/architecture/sources.json").sort();
  return Object.fromEntries(unique.filter((path) => existsSync(new URL(path, root))).map((path) => [path, digest(readFileSync(new URL(path, root)))]));
}

export function assertDelivery(candidate, html, receipt) {
  if (receipt.status !== "current" || receipt.specification?.sha256 !== digest(candidate) || receipt.artifact?.sha256 !== digest(html)) {
    throw new Error("Candidate or HTML differs from the successful delivery. Rebuild the diagram before recording reviewed sources.");
  }
}

export function differences(expected, actual) {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort().flatMap((path) => {
    if (!(path in actual)) return [`Deleted: ${path}`];
    if (!(path in expected)) return [`Added: ${path}`];
    return expected[path] === actual[path] ? [] : [`Changed: ${path}`];
  });
}
