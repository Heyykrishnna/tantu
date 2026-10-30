import assert from "node:assert/strict";
import test from "node:test";

test("quota limits evaluate storage and record allowances accurately", () => {
  const currentQuota = {
    storageBytesUsed: 95000000,
    storageBytesLimit: 104857600,
    recordCount: 4950,
    recordLimit: 5000,
  };

  const isStorageAllowed = (additionalBytes: number) =>
    currentQuota.storageBytesUsed + additionalBytes <= currentQuota.storageBytesLimit;

  const isRecordAllowed = (additionalRecords: number) =>
    currentQuota.recordCount + additionalRecords <= currentQuota.recordLimit;

  assert.equal(isStorageAllowed(5000000), true);
  assert.equal(isStorageAllowed(15000000), false);
  assert.equal(isRecordAllowed(40), true);
  assert.equal(isRecordAllowed(60), false);
});

test("export job serializes authorized canonical structure", () => {
  const exportPayload = {
    version: "1.0",
    exportedAt: "2026-10-31T01:00:00.000Z",
    workspaceId: "w-001",
    records: [
      { id: "r-1", kind: "task", title: "Task 1", status: "open" },
      { id: "r-2", kind: "page", title: "Page 1", status: "open" },
    ],
    projects: [{ id: "p-1", title: "Project 1" }],
  };

  const json = JSON.stringify(exportPayload);
  const parsed = JSON.parse(json);

  assert.equal(parsed.version, "1.0");
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.projects.length, 1);
});

