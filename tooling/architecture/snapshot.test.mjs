import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { assertDelivery, differences, digest, snapshot } from "./snapshot.mjs";

test("detects added, changed and deleted source files deterministically", () => {
  assert.deepEqual(differences({ a: "old", b: "same", d: "gone" }, { a: "new", b: "same", c: "added" }), ["Changed: a", "Added: c", "Deleted: d"]);
  assert.deepEqual(differences({ a: "same" }, { a: "same" }), []);
});

test("hashes exact bytes", () => {
  assert.equal(digest(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(digest("abc"), digest("abc\n"));
});

test("snapshot tracks source additions, edits and deletion without reading ignored secrets", () => {
  const directory = mkdtempSync(join(tmpdir(), "tantu-architecture-"));
  const root = pathToFileURL(`${directory}/`);
  try {
    execFileSync("git", ["init", "-q", directory]);
    mkdirSync(join(directory, "backend/src"), { recursive: true });
    mkdirSync(join(directory, "docs/architecture"), { recursive: true });
    writeFileSync(join(directory, ".gitignore"), ".env\n");
    writeFileSync(join(directory, "backend/src/.env"), "private fixture");
    writeFileSync(join(directory, "docs/architecture/sources.json"), "{}");
    const path = join(directory, "backend/src/app.ts");
    writeFileSync(path, "original");
    execFileSync("git", ["add", "backend/src/app.ts"], { cwd: directory });
    const before = snapshot(root);
    assert.deepEqual(Object.keys(before), ["backend/src/app.ts"]);
    writeFileSync(path, "edited");
    writeFileSync(join(directory, "backend/src/new.ts"), "added");
    assert.deepEqual(differences(before, snapshot(root)), ["Changed: backend/src/app.ts", "Added: backend/src/new.ts"]);
    unlinkSync(path);
    assert.deepEqual(differences(before, snapshot(root)), ["Deleted: backend/src/app.ts", "Added: backend/src/new.ts"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("delivery binding rejects a changed candidate or HTML", () => {
  const receipt = { status: "current", specification: { sha256: digest("candidate") }, artifact: { sha256: digest("html") } };
  assert.doesNotThrow(() => assertDelivery("candidate", "html", receipt));
  assert.throws(() => assertDelivery("edited candidate", "html", receipt), /differs/);
  assert.throws(() => assertDelivery("candidate", "edited html", receipt), /differs/);
  assert.throws(() => assertDelivery("candidate", "html", { ...receipt, status: "failed" }), /differs/);
});
