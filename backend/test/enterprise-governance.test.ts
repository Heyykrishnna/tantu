import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DLP_RULES,
  scanAndRedactText
} from "../src/modules/enterprise-governance/service.js";
import type { DlpRule } from "../src/modules/enterprise-governance/service.js";

test("dlp engine redacts US social security numbers accurately", () => {
  const input = "User identification record SSN: 123-45-6789 in personnel file.";
  const result = scanAndRedactText(input, DEFAULT_DLP_RULES, true);

  assert.equal(result.matched, true);
  assert.equal(result.cleanText, "User identification record SSN: [REDACTED:SSN] in personnel file.");
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0]?.ruleName, "US Social Security Number");
});

test("dlp engine redacts payment card numbers and API keys", () => {
  const input = "Charged card 4111222233334444 using token tk_live_abcdef1234567890abcdef";
  const result = scanAndRedactText(input, DEFAULT_DLP_RULES, true);

  assert.equal(result.matched, true);
  assert.ok(!result.cleanText.includes("4111222233334444"));
  assert.ok(!result.cleanText.includes("tk_live_abcdef1234567890abcdef"));
  assert.ok(result.cleanText.includes("[REDACTED:CARD]"));
  assert.ok(result.cleanText.includes("[REDACTED:SECRET]"));
  assert.equal(result.violations.length, 2);
});

test("dlp engine preserves clean text without false positives", () => {
  const input = "Standard sprint retrospective: completed 24 tasks across 3 epics.";
  const result = scanAndRedactText(input, DEFAULT_DLP_RULES, true);

  assert.equal(result.matched, false);
  assert.equal(result.cleanText, input);
  assert.equal(result.violations.length, 0);
});

test("dlp engine supports custom pattern rules", () => {
  const customRule: DlpRule = {
    id: "rule-internal-project",
    name: "Internal Project Codename",
    pattern: "\\bProject\\s+Titan\\b",
    category: "custom",
    action: "redact",
    replacement: "[CONFIDENTIAL]"
  };

  const input = "Discussion regarding Project Titan launch milestones.";
  const result = scanAndRedactText(input, [customRule], true);

  assert.equal(result.matched, true);
  assert.equal(result.cleanText, "Discussion regarding [CONFIDENTIAL] launch milestones.");
});

test("dlp engine bypasses scanning when disabled in enterprise policy", () => {
  const input = "Unredacted sensitive data with SSN 123-45-6789.";
  const result = scanAndRedactText(input, DEFAULT_DLP_RULES, false);

  assert.equal(result.matched, false);
  assert.equal(result.cleanText, input);
  assert.equal(result.violations.length, 0);
});

