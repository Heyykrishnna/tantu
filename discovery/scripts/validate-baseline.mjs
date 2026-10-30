import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const registry = JSON.parse(await readFile(new URL("../../docs/l0/requirements.json", import.meta.url), "utf8"));
assert.equal(registry.requirements.length, 56);
assert.equal(new Set(registry.requirements.map((record) => record.id)).size, 56);
assert.equal(registry.legacyAliases["ARCHIVE-06"], "TNT-ARCHIVE-006");
for (let number = 1; number <= 50; number++) assert.ok(registry.requirements.some((record) => record.id === `TNT-US-${String(number).padStart(3, "0")}`));
const names = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
assert.ok(!names.some((name) => name.startsWith("phases/") || name.startsWith("local-docs/")));
for (const name of names.filter((value) => value.endsWith(".md"))) {
  const address = new URL(name, new URL("../../", import.meta.url));
  const text = await readFile(address, "utf8");
  assert.ok(text.endsWith("\n"), name);
  assert.equal(text.split("```").length % 2, 1, name);
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\n]+)\)/g)) {
    const target = match[1];
    if (/^https?:|^mailto:/.test(target)) continue;
    const resolved = new URL(target, address);
    const anchor = decodeURIComponent(resolved.hash.slice(1));
    resolved.hash = "";
    const body = await readFile(resolved, "utf8");
    if (anchor) {
      const headings = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((entry) => entry[1].toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, "").replaceAll(" ", "-"));
      assert.ok(headings.includes(anchor), `${name}: ${target}`);
    }
  }
}
execFileSync("git", ["check-ignore", "--quiet", "--no-index", "local-docs/phase-zero-technology-guide.md"], { cwd: root });
execFileSync("git", ["check-ignore", "--quiet", "--no-index", "phases/README.md"], { cwd: root });
process.stdout.write("Baseline, traceability, Markdown references, and ignored documentation checks passed.\n");
