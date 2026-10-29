import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readEnvironment } from "../src/config/environment.js";

const config = readEnvironment({ NODE_ENV: "test" });

function readResponse(body: string): Record<string, unknown> {
  const payload: unknown = JSON.parse(body);
  assert.ok(typeof payload === "object" && payload !== null && !Array.isArray(payload));
  return { ...payload };
}

test("liveness reports the running process with security headers", async (context) => {
  const app = createApp(config);
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health/live" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(readResponse(response.body), { status: "ok" });
  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("unimplemented product routes return a safe not-found response", async (context) => {
  const app = createApp(config);
  context.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/tasks?private=hidden-content",
    headers: { "request-id": "untrusted-id" },
  });
  const payload = readResponse(response.body);

  assert.equal(response.statusCode, 404);
  assert.equal(payload.code, "NOT_FOUND");
  assert.equal(payload.message, "Route not found.");
  assert.ok(typeof payload.requestId === "string");
  assert.match(payload.requestId, /^[0-9a-f-]{36}$/);
  assert.ok(!response.body.includes("hidden-content"));
  assert.ok(!response.body.includes("untrusted-id"));
});

test("unexpected failures do not expose internal error content", async (context) => {
  const app = createApp(config);
  context.after(() => app.close());
  app.get("/test-failure", async () => {
    throw new Error("private-database-credential");
  });

  const response = await app.inject({ method: "GET", url: "/test-failure" });

  assert.equal(response.statusCode, 500);
  assert.equal(readResponse(response.body).code, "INTERNAL_ERROR");
  assert.ok(!response.body.includes("private-database-credential"));
  assert.ok(!response.body.includes("stack"));
});

test("input schemas reject invalid types and unrecognized fields", async (context) => {
  const app = createApp(config);
  context.after(() => app.close());
  app.post(
    "/test-validation",
    {
      schema: {
        body: {
          type: "object",
          required: ["title"],
          additionalProperties: false,
          properties: { title: { type: "string", minLength: 1 } },
        },
      },
    },
    async () => ({ accepted: true }),
  );

  for (const payload of [{ title: 123 }, { title: "valid", extra: "hidden" }, {}]) {
    const response = await app.inject({ method: "POST", url: "/test-validation", payload });

    assert.equal(response.statusCode, 400);
    assert.equal(readResponse(response.body).code, "VALIDATION_FAILED");
  }
});

test("oversized and unsupported payloads receive safe errors", async (context) => {
  const app = createApp(config);
  context.after(() => app.close());
  app.post("/test-payload", async () => ({ accepted: true }));

  const oversized = await app.inject({
    method: "POST",
    url: "/test-payload",
    headers: { "content-type": "text/plain" },
    payload: "a".repeat(1_048_577),
  });
  const unsupported = await app.inject({
    method: "POST",
    url: "/test-payload",
    headers: { "content-type": "application/x-unsupported" },
    payload: "private-body",
  });

  assert.equal(oversized.statusCode, 413);
  assert.equal(readResponse(oversized.body).code, "PAYLOAD_TOO_LARGE");
  assert.equal(unsupported.statusCode, 415);
  assert.equal(readResponse(unsupported.body).code, "UNSUPPORTED_MEDIA_TYPE");
  assert.ok(!unsupported.body.includes("private-body"));
});
