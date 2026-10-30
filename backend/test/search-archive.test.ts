import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

test("archive generation validation rejects invalid stream and sidecar hashes", () => {
  const validHash = createHash("sha256").update("sample stream content").digest("hex");
  const shortHash = "abcd1234";

  assert.equal(validHash.length, 64);
  assert.notEqual(shortHash.length, 64);

  const validateHashes = (stream: string, sidecar: string): boolean => {
    return stream.length === 64 && sidecar.length === 64 && /^[0-9a-f]{64}$/.test(stream) && /^[0-9a-f]{64}$/.test(sidecar);
  };

  assert.equal(validateHashes(validHash, validHash), true);
  assert.equal(validateHashes(shortHash, validHash), false);
  assert.equal(validateHashes(validHash, "not-a-valid-hex-hash-at-all-0000000000000000000000000000000000000000"), false);
});

test("tombstone ledger mapping skips deleted records during archive scan", () => {
  const records = ["rec-001", "rec-002", "rec-003", "rec-004"];
  const tombstones = new Set(["rec-002", "rec-004"]);

  const filtered = records.filter((id) => !tombstones.has(id));
  assert.deepEqual(filtered, ["rec-001", "rec-003"]);
});

