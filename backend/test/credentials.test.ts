import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/modules/workspace-access/credentials.js";
import { readRuntimeSettings } from "../src/config/runtime.js";
import { readEnvironment } from "../src/config/environment.js";

test("password hashing is salted, bounded, and rejects incorrect credentials", async () => {
  const password = "correct horse battery staple";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("incorrect", first), false);
  assert.equal(await verifyPassword("x".repeat(257), first), false);
  await assert.rejects(hashPassword("short"), /at least 12/);
});

test("runtime settings reject insecure production and missing file secrets", () => {
  const production = readEnvironment({ NODE_ENV: "production" });
  assert.throws(() => readRuntimeSettings(production, {}), /requires HTTPS/);
  assert.throws(() => readRuntimeSettings(production, { APP_ORIGIN: "https://example.test", FILE_STORAGE_PATH: "/private/tmp/test" }), /32 bytes/);
  assert.throws(() => readRuntimeSettings(production, { APP_ORIGIN: "https://example.test/path" }), /without a path/);
  assert.equal(readRuntimeSettings(production, { APP_ORIGIN: "https://example.test", FILE_SIGNING_SECRET: "x".repeat(32), FILE_STORAGE_PATH: "/private/tmp/test" }).secureCookies, true);
});

test("password derivation applies bounded per-process backpressure", async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => hashPassword("bounded synthetic password")));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 4);
  for (const result of results) if (result.status === "rejected") assert.match(String(result.reason), /Sign-in is busy/);
});
