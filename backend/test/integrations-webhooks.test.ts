import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  getIntegrationProviders,
  signWebhookPayload,
  verifyWebhookSignature
} from "../src/modules/integrations-webhooks/service.js";

test("signed webhook payload creates valid HMAC-SHA256 signature header", () => {
  const secret = randomBytes(32).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { event: "task.created", id: "task-001", title: "Review RFC" };

  const header = signWebhookPayload(secret, timestamp, payload);
  assert.match(header, /^t=\d+,v1=[a-f0-9]{64}$/);
  assert.ok(header.startsWith(`t=${timestamp},v1=`));
});

test("webhook signature verification validates authentic payloads within tolerance window", () => {
  const secret = randomBytes(32).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { event: "calendar.event_created", id: "evt-42" };

  const header = signWebhookPayload(secret, timestamp, payload);
  const valid = verifyWebhookSignature(secret, header, payload, 300);
  assert.equal(valid, true);
});

test("webhook signature verification rejects tampered payload or invalid secret", () => {
  const secret = randomBytes(32).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { amount: 100 };
  const tampered = { amount: 999 };

  const header = signWebhookPayload(secret, timestamp, payload);
  const tamperedValid = verifyWebhookSignature(secret, header, tampered, 300);
  assert.equal(tamperedValid, false);

  const wrongSecretValid = verifyWebhookSignature("whsec_wrong_secret", header, payload, 300);
  assert.equal(wrongSecretValid, false);
});

test("webhook signature verification rejects replayed headers exceeding tolerance", () => {
  const secret = randomBytes(32).toString("hex");
  const expiredTimestamp = Math.floor(Date.now() / 1000) - 600;
  const payload = { action: "sync" };

  const header = signWebhookPayload(secret, expiredTimestamp, payload);
  const valid = verifyWebhookSignature(secret, header, payload, 300);
  assert.equal(valid, false);
});

test("provider capability matrix accurately reflects supported and evaluated integrations", () => {
  const providers = getIntegrationProviders();
  assert.ok(providers.length >= 4);

  const google = providers.find((p) => p.id === "google-workspace");
  assert.ok(google);
  assert.equal(google.status, "supported");
  assert.ok(google.capabilities.includes("mail.read"));

  const imap = providers.find((p) => p.id === "generic-imap-smtp");
  assert.ok(imap);
  assert.equal(imap.status, "evaluated");
  assert.ok(imap.capabilities.includes("mail.read.evaluated"));
});

