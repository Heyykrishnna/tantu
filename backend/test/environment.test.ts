import assert from "node:assert/strict";
import { test } from "node:test";
import { readEnvironment } from "../src/config/environment.js";

test("configuration has local defaults without external services", () => {
  assert.deepEqual(readEnvironment({}), {
    nodeEnvironment: "development",
    host: "127.0.0.1",
    port: 4000,
    logLevel: "info",
  });
});

test("configuration accepts explicit supported values", () => {
  assert.deepEqual(
    readEnvironment({ NODE_ENV: "production", HOST: "0.0.0.0", PORT: "8080", LOG_LEVEL: "warn" }),
    { nodeEnvironment: "production", host: "0.0.0.0", port: 8080, logLevel: "warn" },
  );
});

for (const port of ["", "0", "-1", "65536", "4.5", " 4000", "4000 ", "1e3", "abc", "9007199254740992"]) {
  test(`configuration rejects invalid port ${JSON.stringify(port)}`, () => {
    assert.throws(() => readEnvironment({ PORT: port }), /PORT must be an integer/);
  });
}

test("configuration accepts valid port boundaries", () => {
  assert.equal(readEnvironment({ PORT: "1" }).port, 1);
  assert.equal(readEnvironment({ PORT: "65535" }).port, 65535);
});

test("configuration rejects invalid environment, host, and log level", () => {
  assert.throws(() => readEnvironment({ NODE_ENV: "staging" }), /NODE_ENV must be/);
  assert.throws(() => readEnvironment({ HOST: "" }), /HOST must be/);
  assert.throws(() => readEnvironment({ HOST: " localhost" }), /HOST must be/);
  assert.throws(() => readEnvironment({ HOST: "local host" }), /HOST must be/);
  assert.throws(() => readEnvironment({ LOG_LEVEL: "verbose" }), /LOG_LEVEL must be/);
});
