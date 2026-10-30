import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import { test } from "node:test";
import { allowedUrl, ProviderHttp, retrySeconds } from "../src/modules/providers/http.js";
import { readProviderSettings } from "../src/modules/providers/config.js";
import { open, seal } from "../src/modules/providers/vault.js";
import { discover, exchange } from "../src/modules/providers/oauth.js";
import { projectionPage } from "../src/modules/providers/projections.js";

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
test("token vault authenticates its resource binding and provider URLs reject credential exfiltration", async () => {
  const key = randomBytes(32); const envelope = seal({ access_token: "synthetic" }, key, "connection:one");
  assert.deepEqual(open(envelope, key, "connection:one"), { access_token: "synthetic" }); assert.throws(() => open(envelope, key, "connection:two")); assert.throws(() => open(envelope, randomBytes(32), "connection:one"));
  for (const url of ["https://graph.microsoft.com.evil.test/v1.0/me/messages", "https://evil.test/token", "https://graph.microsoft.com/v1.0/users/other/messages", "http://graph.microsoft.com/v1.0/me/messages"]) assert.throws(() => allowedUrl("microsoft", url));
  assert.equal(retrySeconds("999999"), 3600); assert.equal(retrySeconds("invalid"), 60); assert.equal(retrySeconds("1"), 1);
  assert.throws(() => readProviderSettings({ GOOGLE_CLIENT_ID: "synthetic" })); assert.deepEqual(readProviderSettings({}).registrations, {});
  await assert.rejects(new ProviderHttp(async () => new Response("large".repeat(500000))).request("google", "synthetic", "/gmail/v1/users/me/profile"), /limit/);
});

test("OAuth validates state, nonce, issuer, audience, signature and user-info subject with HTTPS fixtures", async () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 }); const publicJwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "fixture", alg: "RS256", use: "sig" };
  let nonce = "expected-nonce"; let subject = "provider-user";
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("openid-configuration")) return json({ issuer: "https://issuer.example.test", authorization_endpoint: "https://issuer.example.test/authorize", token_endpoint: "https://issuer.example.test/token", userinfo_endpoint: "https://issuer.example.test/userinfo", jwks_uri: "https://issuer.example.test/jwks", response_types_supported: ["code"], id_token_signing_alg_values_supported: ["RS256"] });
    if (url.endsWith("jwks")) return json({ keys: [publicJwk] });
    if (url.endsWith("userinfo")) return json({ sub: subject, email: "fixture@example.test" });
    const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url"); const now = Math.floor(Date.now() / 1000);
    const unsigned = encoded({ alg: "RS256", kid: "fixture" }) + "." + encoded({ iss: "https://issuer.example.test", aud: "fixture-client", sub: "provider-user", nonce, iat: now, exp: now + 300 });
    return json({ token_type: "Bearer", access_token: "synthetic-token", expires_in: 300, id_token: unsigned + "." + sign("RSA-SHA256", Buffer.from(unsigned), pair.privateKey).toString("base64url") });
  };
  const config = await discover({ issuer: "https://issuer.example.test", clientId: "fixture-client", clientSecret: "synthetic-secret", scopes: ["openid"] }, fetcher);
  const url = new URL("https://app.example.test/callback?code=fixture&state=expected-state");
  assert.equal((await exchange(config, url, "https://app.example.test/callback", "v".repeat(43), "expected-state", "expected-nonce")).claims.sub, "provider-user");
  await assert.rejects(exchange(config, url, "https://app.example.test/callback", "v".repeat(43), "wrong-state", "expected-nonce"));
  nonce = "wrong-nonce"; await assert.rejects(exchange(config, url, "https://app.example.test/callback", "v".repeat(43), "expected-state", "expected-nonce"));
  nonce = "expected-nonce"; subject = "different-user"; await assert.rejects(exchange(config, url, "https://app.example.test/callback", "v".repeat(43), "expected-state", "expected-nonce"));
});

test("provider projections preserve plaintext, immutable identifiers, cursor boundaries and all-day semantics", async () => {
  const requested: string[] = [];
  const http = new ProviderHttp(async (input, options) => {
    const url = String(input); requested.push(url);
    if (url.includes("graph.microsoft.com")) { assert.match(String(new Headers(options?.headers).get("prefer")), /ImmutableId/); return json({ value: [{ id: "immutable", subject: "Hello", body: { contentType: "html", content: "<script>bad</script>" }, from: { emailAddress: { address: "sender@example.test" } } }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=one" }); }
    if (url.includes("calendar")) return json({ items: [{ id: "all-day", start: { date: "2026-10-30" }, end: { date: "2026-10-31" } }], nextSyncToken: "next" });
    if (url.endsWith("profile")) return json({ historyId: "anchor" });
    if (url.includes("format=full")) return json({ id: "message", threadId: "thread", labelIds: ["INBOX", "UNREAD"], payload: { mimeType: "text/plain", body: { data: Buffer.from("Safe plain text").toString("base64url") }, headers: [{ name: "Subject", value: "Fixture" }] } });
    return json({ messages: [{ id: "message" }] });
  });
  const google = await projectionPage(http, "google", "fixture", "mail", null); assert.equal(google.cursor, "history:anchor"); assert.equal(JSON.stringify(google.items).includes("Safe plain text"), true);
  const graph = await projectionPage(http, "microsoft", "fixture", "mail", null); assert.equal(JSON.stringify(graph.items).includes("<script>"), false); assert.equal(graph.items[0]?.id, "immutable");
  const calendar = await projectionPage(http, "google", "fixture", "calendar", null); assert.match(JSON.stringify(calendar.items), /exclusive/); assert.match(JSON.stringify(calendar.items), /2026-10-31/); assert.equal(requested.length, 5);
});
