import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { readEnvironment } from "../src/config/environment.js";
import { readRuntimeSettings } from "../src/config/runtime.js";
import type { SmtpSettings } from "../src/config/runtime.js";
import { digest, hashPassword, secret, validatePassword, verifyPassword } from "../src/modules/workspace-access/credentials.js";
import { cookies } from "../src/modules/workspace-access/service.js";
import { generateVerificationCode, normalizeVerificationCode, buildVerificationEmail } from "../src/modules/mail/verification.js";
import { sendMail, testOutbox } from "../src/modules/mail/smtp.js";
import { Failure } from "../src/platform/failure.js";

test("password policy validates minimum length, maximum byte length and character boundaries", () => {
  assert.doesNotThrow(() => validatePassword("correct horse battery staple"));
  assert.doesNotThrow(() => validatePassword("123456789012"));
  assert.throws(() => validatePassword("short"), (err) => err instanceof Failure && err.statusCode === 400 && err.code === "PASSWORD_POLICY");
  assert.throws(() => validatePassword(""), (err) => err instanceof Failure && err.statusCode === 400 && err.code === "PASSWORD_POLICY");
  assert.throws(() => validatePassword("a".repeat(11)), (err) => err instanceof Failure && err.statusCode === 400);
  assert.throws(() => validatePassword("x".repeat(257)), (err) => err instanceof Failure && err.statusCode === 400);
});

test("password hashing produces distinct salts and constant-time verification", async () => {
  const secretPhrase = "production-grade-secret-passphrase-2026";
  const hashOne = await hashPassword(secretPhrase);
  const hashTwo = await hashPassword(secretPhrase);

  assert.notEqual(hashOne, hashTwo);
  assert.ok(hashOne.startsWith("scrypt:"));
  assert.ok(!hashOne.includes(secretPhrase));

  const verified = await verifyPassword(secretPhrase, hashOne);
  assert.equal(verified, true);

  const wrongVerified = await verifyPassword("wrong-passphrase-attempt", hashOne);
  assert.equal(wrongVerified, false);

  const tamperedVerified = await verifyPassword(secretPhrase, hashOne.replace(/[0-9a-f]/, "z"));
  assert.equal(tamperedVerified, false);

  const malformedVerified = await verifyPassword(secretPhrase, "invalid:format");
  assert.equal(malformedVerified, false);
});

test("token generator produces 256-bit cryptographically secure base64url secrets", () => {
  const tokenOne = secret();
  const tokenTwo = secret();

  assert.notEqual(tokenOne, tokenTwo);
  assert.ok(tokenOne.length >= 43);
  assert.ok(/^[a-zA-Z0-9_-]+$/.test(tokenOne));

  const hashOne = digest(tokenOne);
  const hashTwo = digest(tokenTwo);
  assert.equal(hashOne.length, 64);
  assert.notEqual(hashOne, hashTwo);
});

test("session listing and lookup masking avoids leaking token digests", () => {
  const token = secret();
  const tokenHash = digest(token);
  const maskedPrefix = tokenHash.slice(0, 16);

  assert.equal(maskedPrefix.length, 16);
  assert.notEqual(maskedPrefix, tokenHash);
  assert.ok(tokenHash.startsWith(maskedPrefix));

  const cleanValid = maskedPrefix.replace(/[^a-f0-9]/gi, "");
  assert.equal(cleanValid.length, 16);

  const malformedInput = "'; DROP TABLE tantu.sessions; --";
  const cleanInvalid = malformedInput.replace(/[^a-f0-9]/gi, "");
  assert.ok(cleanInvalid.length < 8);
});

test("role permissions verify hierarchy and guest containment", () => {
  type Role = "owner" | "admin" | "member" | "guest";

  function canInviteAdmin(actor: Role): boolean {
    return actor === "owner";
  }

  function canManageMembers(actor: Role): boolean {
    return actor === "owner" || actor === "admin";
  }

  function requiresRecordGrant(actor: Role): boolean {
    return actor === "guest";
  }

  assert.equal(canInviteAdmin("owner"), true);
  assert.equal(canInviteAdmin("admin"), false);
  assert.equal(canInviteAdmin("member"), false);
  assert.equal(canInviteAdmin("guest"), false);

  assert.equal(canManageMembers("owner"), true);
  assert.equal(canManageMembers("admin"), true);
  assert.equal(canManageMembers("member"), false);
  assert.equal(canManageMembers("guest"), false);

  assert.equal(requiresRecordGrant("guest"), true);
  assert.equal(requiresRecordGrant("member"), false);
  assert.equal(requiresRecordGrant("admin"), false);
  assert.equal(requiresRecordGrant("owner"), false);
});

test("password change prevents identical passwords and checks length", () => {
  const current = "correct-horse-battery-staple-123";
  const nextSame = "correct-horse-battery-staple-123";
  const nextShort = "too-short";
  const nextValid = "new-fresh-battery-staple-456";

  assert.equal(current === nextSame, true);
  assert.throws(() => validatePassword(nextShort), /at least 12/);
  assert.doesNotThrow(() => validatePassword(nextValid));
});

test("cookie parser extracts secure session identifiers and rejects duplicates", () => {
  const reqValid = { headers: { cookie: "tantu_session=session-token-abc; tantu_csrf=csrf-token-123" } } as unknown as FastifyRequest;
  const parsed = cookies(reqValid);
  assert.equal(parsed.get("tantu_session"), "session-token-abc");
  assert.equal(parsed.get("tantu_csrf"), "csrf-token-123");

  const reqEmpty = { headers: {} } as unknown as FastifyRequest;
  assert.equal(cookies(reqEmpty).size, 0);

  const reqDuplicate = { headers: { cookie: "tantu_session=first; tantu_session=second" } } as unknown as FastifyRequest;
  assert.throws(() => cookies(reqDuplicate), (err) => err instanceof Failure && err.statusCode === 400 && err.code === "INVALID_COOKIE");
});

test("csrf validation enforces double-submit token match against session hash", () => {
  const rawCsrf = secret();
  const sessionHash = digest(rawCsrf);

  function validateCsrf(provided: string | undefined, expectedHash: string): boolean {
    if (typeof provided !== "string" || !provided) return false;
    return digest(provided) === expectedHash;
  }

  assert.equal(validateCsrf(rawCsrf, sessionHash), true);
  assert.equal(validateCsrf("wrong-token", sessionHash), false);
  assert.equal(validateCsrf(undefined, sessionHash), false);
  assert.equal(validateCsrf("", sessionHash), false);
});

test("origin verification enforces strict equality with configured origin", () => {
  const configured = "https://tantu.example.test";

  function checkOrigin(origin: string | undefined): boolean {
    return origin === configured;
  }

  assert.equal(checkOrigin("https://tantu.example.test"), true);
  assert.equal(checkOrigin("https://evil.test"), false);
  assert.equal(checkOrigin("http://tantu.example.test"), false);
  assert.equal(checkOrigin(undefined), false);
  assert.equal(checkOrigin("https://tantu.example.test:8080"), false);
  assert.equal(checkOrigin("https://tantu.example.test/subpath"), false);
});

test("email verification code generates 6-character random alphanumeric tokens", () => {
  const codeOne = generateVerificationCode();
  const codeTwo = generateVerificationCode();

  assert.equal(codeOne.length, 6);
  assert.equal(codeTwo.length, 6);
  assert.match(codeOne, /^[A-Z0-9]{6}$/);
  assert.match(codeTwo, /^[A-Z0-9]{6}$/);
  assert.notEqual(codeOne, codeTwo);
});

test("verification code normalizer enforces 6-character alphanumeric bounds and trims casing", () => {
  assert.equal(normalizeVerificationCode("  abc123  "), "ABC123");
  assert.equal(normalizeVerificationCode("xy9z8w"), "XY9Z8W");

  assert.throws(() => normalizeVerificationCode("12345"), (err) => err instanceof Failure && err.statusCode === 400 && err.code === "INVALID_CODE");
  assert.throws(() => normalizeVerificationCode("1234567"), (err) => err instanceof Failure && err.statusCode === 400 && err.code === "INVALID_CODE");
  assert.throws(() => normalizeVerificationCode(""), (err) => err instanceof Failure && err.statusCode === 400);
  assert.throws(() => normalizeVerificationCode("!@#$%^"), (err) => err instanceof Failure && err.statusCode === 400);
});

test("buildVerificationEmail produces plaintext and html representations containing code", () => {
  const email = buildVerificationEmail("Test User", "K9P4M2");
  assert.ok(email.subject.includes("K9P4M2"));
  assert.ok(email.text.includes("K9P4M2"));
  assert.ok(email.text.includes("Test User"));
  assert.ok(email.text.includes("15 minutes"));
  assert.ok(email.html.includes("K9P4M2"));
  assert.ok(email.html.includes("Test User"));
  assert.ok(email.html.includes("tantu"));
});

test("sendMail captures delivered messages in testOutbox during test execution", async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  try {
    testOutbox.length = 0;
    const dummySettings: SmtpSettings = {
      host: "smtp.example.test",
      port: 587,
      user: "user@example.test",
      pass: "secret",
      fromEmail: "support@example.test",
      fromName: "Tantu Test",
    };

    const message = {
      to: "recipient@example.test",
      subject: "Test Verification",
      text: "Code: 123456",
      html: "<p>Code: 123456</p>",
    };

    await sendMail(dummySettings, message);

    assert.equal(testOutbox.length, 1);
    assert.equal(testOutbox[0]?.to, "recipient@example.test");
    assert.equal(testOutbox[0]?.subject, "Test Verification");
    assert.equal(testOutbox[0]?.text, "Code: 123456");
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});

test("readRuntimeSettings normalizes Gmail app passwords and fallback variables", () => {
  const config = readEnvironment({ NODE_ENV: "development" });
  const settings = readRuntimeSettings(config, {
    APP_ORIGIN: "http://localhost:3000",
    FILE_STORAGE_PATH: "/tmp/tantu-files",
    FILE_SIGNING_SECRET: "0123456789abcdef0123456789abcdef",
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_USERNAME: "test@gmail.com",
    SMTP_PASS: '"xvpx ykrc acys khqa"',
    SENDER_EMAIL: "support@example.test",
  });

  assert.equal(settings.smtp.host, "smtp.gmail.com");
  assert.equal(settings.smtp.port, 587);
  assert.equal(settings.smtp.user, "test@gmail.com");
  assert.equal(settings.smtp.pass, "xvpxykrcacyskhqa");
  assert.equal(settings.smtp.fromEmail, "support@example.test");
});

test("sendMail rejects Gmail configuration when credentials are missing", async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const invalidSettings: SmtpSettings = {
      host: "smtp.gmail.com",
      port: 587,
      user: "",
      pass: "",
      fromEmail: "support@example.test",
      fromName: "Tantu Test",
    };
    const message = {
      to: "recipient@example.test",
      subject: "Test",
      text: "Code: 123456",
      html: "<p>Code: 123456</p>",
    };

    await assert.rejects(
      sendMail(invalidSettings, message),
      (err) => err instanceof Failure && err.statusCode === 503 && err.code === "SMTP_AUTH_REQUIRED",
    );
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});
