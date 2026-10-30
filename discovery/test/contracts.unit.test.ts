import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const document: unknown = JSON.parse(await readFile(new URL("../../contracts/openapi.json", import.meta.url), "utf8"));
assert.ok(typeof document === "object" && document !== null && "components" in document && "paths" in document);
const components = document.components;
assert.ok(typeof components === "object" && components !== null && "schemas" in components);
const schemas = components.schemas;
assert.ok(typeof schemas === "object" && schemas !== null);
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats.default(ajv);
const validators = new Map(Object.entries(schemas).map(([name, schema]) => {
  assert.ok(typeof schema === "object" && schema !== null);
  return [name, ajv.compile(schema)];
}));
const id = "11111111-1111-4111-8111-111111111111";

test("all draft schemas compile under JSON Schema 2020-12", () => {
  assert.equal(validators.size, 16);
});

test("task contract requires version and operation identity and rejects unknown fields", () => {
  const validate = validators.get("TaskMutation");
  assert.ok(validate);
  const valid = { operationId: id, workspaceId: id, expectedVersion: 1, changes: { title: "Synthetic task" } };
  assert.equal(validate(valid), true);
  assert.equal(validate({ ...valid, expectedVersion: 0 }), false);
  assert.equal(validate({ ...valid, operationId: "not-a-uuid" }), false);
  assert.equal(validate({ ...valid, extra: "private" }), false);
  assert.equal(validate({ ...valid, changes: { title: "" } }), false);
});

test("external effect contracts require a bound version and explicit review", () => {
  const validate = validators.get("MailSendIntent");
  assert.ok(validate);
  const input = { operationId: id, workspaceId: id, connectionId: id, draftId: id, draftVersion: 1, recipientVersion: 1, attachmentVersions: [], reviewed: true };
  assert.equal(validate(input), true);
  assert.equal(validate({ ...input, reviewed: false }), false);
  assert.equal(validate({ ...input, recipientVersion: 0 }), false);
  assert.equal(validate({ ...input, recipients: ["not-bound-to-the-draft"] }), false);
});

test("search is bounded and archive semantics are explicit", () => {
  const validate = validators.get("Search");
  assert.ok(validate);
  const input = { workspaceId: id, query: "needle", pageSize: 25, cursor: null, mode: "archive-literal" };
  assert.equal(validate(input), true);
  for (const pageSize of [0, 101, 1.5]) assert.equal(validate({ ...input, pageSize }), false);
  assert.equal(validate({ ...input, query: "" }), false);
  assert.equal(validate({ ...input, query: "x".repeat(257) }), false);
  assert.equal(validate({ ...input, mode: "semantic-archive" }), false);
});

test("draft product paths declare authorization and safe failures without claiming implementation", () => {
  const paths = document.paths;
  assert.ok(typeof paths === "object" && paths !== null);
  for (const [path, value] of Object.entries(paths)) {
    assert.ok(typeof value === "object" && value !== null);
    for (const operation of Object.values(value)) {
      assert.ok(typeof operation === "object" && operation !== null);
      if (path === "/health/live") continue;
      assert.ok("x-tantu-status" in operation && "x-tantu-authorization" in operation);
      assert.equal(operation["x-tantu-status"], "draft-not-registered");
      assert.equal(operation["x-tantu-authorization"], "current-canonical-scope");
      assert.ok("responses" in operation && typeof operation.responses === "object" && operation.responses !== null);
      for (const code of ["400", "401", "403", "409", "429", "503"]) assert.ok(code in operation.responses);
    }
  }
});


test("read responses expose bounded coverage and reviewable schedule versions", () => {
  const search = validators.get("SearchPage");
  const preview = validators.get("SchedulePreviewResult");
  assert.ok(search && preview);
  assert.equal(search({ records: [], nextCursor: null, coverage: "partial", mode: "archive-literal", asOf: "2026-10-30T00:00:00Z" }), true);
  assert.equal(search({ records: [], nextCursor: null, mode: "live", asOf: "2026-10-30T00:00:00Z" }), false);
  const input = { previewId: id, sourceVersion: 1, expiresAt: "2026-10-30T00:05:00Z", timezone: "UTC", intervals: [], conflicts: [], requiresReview: true };
  assert.equal(preview(input), true);
  assert.equal(preview({ ...input, requiresReview: false }), false);
  assert.equal(preview({ ...input, sourceVersion: 0 }), false);
});
