import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyGoogleNotification } from "../src/modules/providers/notification-routes.js";
import { notificationSettings } from "../src/modules/providers/subscriptions.js";
test("notification identity validates signature, issuer, audience, expiry and verified service email", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256"); const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "fixture" }] });
  const token = async (overrides: Record<string, unknown> = {}) => new SignJWT({ email: "push@example.test", email_verified: true, ...overrides }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).setIssuer("https://accounts.google.com").setAudience("https://notify.example.test").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  await verifyGoogleNotification("Bearer " + await token(), "https://notify.example.test", "push@example.test", keys);
  await assert.rejects(verifyGoogleNotification("Bearer " + await token({ email_verified: false }), "https://notify.example.test", "push@example.test", keys));
  await assert.rejects(verifyGoogleNotification("Bearer " + await token(), "wrong", "push@example.test", keys));
  await assert.rejects(verifyGoogleNotification("Bearer " + await token(), "https://notify.example.test", "other@example.test", keys));
  assert.equal(notificationSettings({}), null); assert.throws(() => notificationSettings({ PROVIDER_NOTIFICATION_ORIGIN: "http://example.test" }));
});
