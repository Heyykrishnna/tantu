import assert from "node:assert/strict";
import { test } from "node:test";
import { promiseItem, promisePeople, promises } from "../lib/promises.ts";

const promise = {
  id: "promise",
  workspaceId: "workspace",
  creatorId: "creator",
  responsibleId: "responsible",
  title: "Deliver the review",
  agreedDate: null,
  confirmationState: "confirmed",
  status: "pending",
  sourceRecordId: null,
  taskId: null,
  notes: "",
  version: 1,
  createdAt: "2026-11-02",
  updatedAt: "2026-11-02",
};

test("promise parsers accept canonical lists and flat people without nested member assumptions", () => {
  assert.deepEqual(promises({ promises: [promise] }), [promise]);
  assert.deepEqual(
    promisePeople({ items: [{ id: "responsible", name: "Workspace person" }] }),
    [{ id: "responsible", name: "Workspace person" }],
  );
});

test("malformed promise responses fail validation before reaching rendered maps", () => {
  for (const value of [
    {},
    { promises: null },
    { promises: [{}] },
    { promises: [{ ...promise, status: "unknown" }] },
  ])
    assert.throws(() => promises(value));
  assert.throws(() => promisePeople({ members: [] }));
  assert.throws(() => promiseItem({ ...promise, version: -1 }));
});
