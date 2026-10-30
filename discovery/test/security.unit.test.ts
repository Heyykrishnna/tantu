import assert from "node:assert/strict";
import { test } from "node:test";
import { canReadFixture, canSeeFixtureRelationship, nextFixtureSendState, validateFixtureExecution } from "../src/access-model.js";
import type { Actor, RecordScope } from "../src/access-model.js";

const owner: Actor = { id: "owner-a", tenant: "alpha", role: "owner", active: true };
const privateMail: RecordScope = { id: "mail-a", tenant: "alpha", owner: owner.id, visibility: "private", readers: [], deleted: false, version: 1 };
const sharedTask: RecordScope = { id: "task-a", tenant: "alpha", owner: owner.id, visibility: "shared", readers: [], deleted: false, version: 1 };

test("administration and a source link do not confer private mailbox access", () => {
  const admin: Actor = { ...owner, id: "admin-a", role: "admin" };
  assert.equal(canReadFixture(admin, sharedTask), true);
  assert.equal(canReadFixture(admin, privateMail), false);
  assert.equal(canSeeFixtureRelationship(admin, sharedTask, privateMail), false);
});

test("foreign tenants, revoked actors, and tombstones remain undiscoverable", () => {
  assert.equal(canReadFixture({ ...owner, tenant: "beta" }, privateMail), false);
  assert.equal(canReadFixture({ ...owner, active: false }, privateMail), false);
  assert.equal(canReadFixture(owner, { ...privateMail, deleted: true }), false);
});

test("a guest requires an explicit record grant without workspace-wide visibility", () => {
  const guest: Actor = { ...owner, id: "guest-a", role: "guest" };
  assert.equal(canReadFixture(guest, sharedTask), false);
  assert.equal(canReadFixture(guest, { ...sharedTask, readers: [guest.id] }), true);
  assert.equal(canReadFixture(guest, privateMail), false);
});

test("shared snapshots use destination permissions independently of their private source", () => {
  const member: Actor = { ...owner, id: "member-a", role: "member" };
  const snapshot = { ...sharedTask, id: "snapshot-a" };
  assert.equal(canReadFixture(member, snapshot), true);
  assert.equal(canReadFixture(member, privateMail), false);
});

test("queued external work rechecks review, version, and current permissions", () => {
  assert.doesNotThrow(() => validateFixtureExecution(owner, privateMail, 1, true));
  assert.throws(() => validateFixtureExecution(owner, privateMail, 1, false), /Review required/);
  assert.throws(() => validateFixtureExecution(owner, { ...privateMail, version: 2 }, 1, true), /stale/);
  assert.throws(() => validateFixtureExecution({ ...owner, active: false }, privateMail, 1, true), /access denied/);
});

test("a timed-out send cannot be blindly submitted again", () => {
  const reviewed = nextFixtureSendState("draft", "review");
  const pending = nextFixtureSendState(reviewed, "submit");
  const unknown = nextFixtureSendState(pending, "timeout");
  assert.equal(unknown, "unknown");
  assert.throws(() => nextFixtureSendState(unknown, "submit"), /do not blindly repeat/);
  assert.equal(nextFixtureSendState(unknown, "reconciled-sent"), "confirmed");
  assert.throws(() => nextFixtureSendState("draft", "submit"));
});
