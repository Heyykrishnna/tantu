import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

for (const project of ["frontend", "backend", "discovery"]) {
  const require = createRequire(new URL(`../../../${project}/package.json`, import.meta.url));
  const match = require("minimatch");

  test(`${project}: legacy callable matcher preserves lint glob behavior`, () => {
    assert.equal(match("src/app.ts", "**/*.{ts,tsx}"), true);
    assert.equal(match("src/app.js", "**/*.ts"), false);
    assert.equal(match(".env", "*"), false);
    assert.equal(match(".env", "*", { dot: true }), true);
    assert.equal(new match.Minimatch("**/*.tsx").match("app/page.tsx"), true);
    assert.deepEqual(match.match(["a.ts", "b.js"], "*.ts"), ["a.ts"]);
    assert.equal(match.defaults({ matchBase: true })("src/a.ts", "*.ts"), true);
  });

  test(`${project}: ESM default and named APIs use the same patched engine`, async () => {
    const entry = new URL("./index.mjs", pathToFileURL(require.resolve("minimatch")));
    const engine = await import(entry.href);
    assert.equal(engine.default("app/page.tsx", "**/*.tsx"), true);
    assert.equal(engine.minimatch("app/page.tsx", "**/*.tsx"), true);
    assert.equal(new engine.Minimatch("*.ts").match("a.ts"), true);
    assert.equal(engine.braceExpand("{1..1000}", { braceExpandMax: 32 }).length, 32);
  });
}
