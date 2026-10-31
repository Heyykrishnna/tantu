import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseConfiguration } from "../src/platform/database/connection.js";

test("local and socket database settings retain their existing behavior", () => {
  for (const configuration of [{ host: "/tmp/postgres", user: "runtime", max: 2 }, { connectionString: "postgresql://runtime@localhost/tantu?sslmode=disable" }]) {
    assert.deepEqual(databaseConfiguration(configuration), configuration);
  }
});

test("Neon connections enforce verified TLS and explicitly enable channel binding", () => {
  for (const mode of ["require", "disable", "no-verify"]) {
    const configuration = { connectionString: `postgresql://runtime@example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=${mode}&channel_binding=require`, max: 3 };
    const result = databaseConfiguration(configuration);
    const url = new URL(result.connectionString ?? "");
    assert.equal(url.searchParams.get("sslmode"), "verify-full");
    assert.equal(url.searchParams.get("channel_binding"), "require");
    assert.equal(result.enableChannelBinding, true);
    assert.equal(result.connectionTimeoutMillis, 20_000);
    assert.equal(result.max, 3);
    assert.equal(new URL(configuration.connectionString).searchParams.get("sslmode"), mode);
  }
});

test("Neon settings preserve explicit connection deadlines and direct migration endpoints", () => {
  const result = databaseConfiguration({ connectionString: "postgresql://owner@example.us-east-2.aws.neon.tech/neondb", connectionTimeoutMillis: 30_000 }, true);
  assert.equal(result.connectionTimeoutMillis, 30_000);
  assert.equal(new URL(result.connectionString ?? "").hostname, "example.us-east-2.aws.neon.tech");
});

test("migration configuration rejects pooled Neon endpoints without revealing credentials", () => {
  assert.throws(() => databaseConfiguration({ connectionString: "postgresql://owner:private@example-pooler.us-east-2.aws.neon.tech/neondb" }, true), { message: "Neon migrations require a direct connection, without the -pooler hostname suffix." });
  assert.throws(() => databaseConfiguration({ connectionString: "invalid-private-value" }), { message: "Database connection string must be a valid PostgreSQL URL." });
});
