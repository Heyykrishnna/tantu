import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./support.js";
import { digest } from "../../src/modules/workspace-access/credentials.js";

test("invitation role changes and revocation report their actual state", { timeout: 60_000 }, async context => {
  const environment = await fixture();
  try {
    const owner = await environment.account("invite-owner@example.test");
    const target = await environment.account("invite-target@example.test");
    const admin = await environment.account("invite-admin@example.test");
    await environment.owner.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,'admin')", [owner.workspaceId, admin.userId]);
    const path = `/api/v1/workspaces/${owner.workspaceId}`;
    const created = await environment.app.inject({ method: "POST", url: path + "/invitations", headers: owner.headers, payload: { email: "pending@example.test", role: "member", permission: "read" } });
    assert.equal(created.statusCode, 201);
    const id = digest(created.json<{ token: string }>().token);
    await context.test("pending links can change roles without being recreated", async () => {
      const response = await environment.app.inject({ method: "PATCH", url: path + "/invitations/" + id, headers: owner.headers, payload: { role: "admin", permission: "read" } });
      assert.equal(response.statusCode, 200, response.body);
    });
    const incoming = await environment.app.inject({ method: "POST", url: path + "/invitations", headers: owner.headers, payload: { email: "invite-target@example.test", role: "member", permission: "read" } });
    const token = incoming.json<{ token: string }>().token;
    const accepted = await environment.app.inject({ method: "POST", url: "/api/v1/invitations/accept", headers: target.headers, payload: { token } });
    assert.equal(accepted.statusCode, 200, accepted.body);
    await context.test("accepted links cannot falsely report revoked membership", async () => {
      const response = await environment.app.inject({ method: "DELETE", url: path + "/invitations/" + digest(token), headers: owner.headers });
      assert.equal(response.statusCode, 409, response.body);
    });
    await context.test("administrators can manage member and guest roles", async () => {
      const response = await environment.app.inject({ method: "PATCH", url: path + "/members/" + target.userId, headers: admin.headers, payload: { role: "guest" } });
      assert.equal(response.statusCode, 200, response.body);
    });
  } finally { await environment.close(); }
});

test("invitation lifecycle preserves scope, email delivery, and revocation", { timeout: 60_000 }, async context => {
  const environment = await fixture();
  try {
    const owner = await environment.account("lifecycle-owner@example.test");
    const target = await environment.account("lifecycle-target@example.test");
    const stranger = await environment.account("lifecycle-stranger@example.test");
    const path = `/api/v1/workspaces/${owner.workspaceId}`;
    const create = async (email: string, extra: Record<string, unknown> = {}) => {
      const response = await environment.app.inject({ method: "POST", url: path + "/invitations", headers: owner.headers, payload: {email, role: "member", permission: "read", ...extra} });
      assert.equal(response.statusCode, 201, response.body);
      return response.json<{id: string; token: string; link: string; delivery: {status: string}}>();
    };
    await context.test("email contains the usable fragment link and pending replacements expire", async () => {
      const { testOutbox } = await import("../../src/modules/mail/smtp.js");
      const first = await create("replace@example.test", { delivery: "email" });
      assert.equal(first.delivery.status, "sent");
      assert.ok(testOutbox.some(mail => mail.to === "replace@example.test" && mail.text.includes(first.link)));
      assert.equal(new URL(first.link).search, "");
      const replacement = await create("replace@example.test");
      assert.notEqual(first.token, replacement.token);
      const expired = await environment.app.inject({ method: "POST", url: "/api/v1/invitations/preview", headers: {origin: environment.settings.origin}, payload: {token: first.token} });
      assert.equal(expired.statusCode, 404);
      const revoked = await environment.app.inject({ method: "DELETE", url: path + "/invitations/" + replacement.id, headers: owner.headers });
      assert.equal(revoked.statusCode, 200, revoked.body);
      const accept = await environment.app.inject({ method: "POST", url: "/api/v1/invitations/accept", headers: {origin: environment.settings.origin}, payload: {token: replacement.token, name: "Revoked", password: "synthetic test password only"} });
      assert.equal(accept.statusCode, 404, accept.body);
    });
    await context.test("existing accounts authenticate before joining and use the latest role", async () => {
      const invitation = await create("lifecycle-target@example.test");
      const wrong = await environment.app.inject({method: "POST", url: "/api/v1/invitations/accept", headers: stranger.headers, payload: {token: invitation.token}});
      assert.equal(wrong.statusCode, 401);
      const noCsrf = await environment.app.inject({method: "POST", url: "/api/v1/invitations/accept", headers: {origin: target.headers.origin, cookie: target.headers.cookie}, payload: {token: invitation.token}});
      assert.equal(noCsrf.statusCode, 403);
      const update = await environment.app.inject({method: "PATCH", url: path + "/invitations/" + invitation.id, headers: owner.headers, payload: {role: "admin", permission: "read"}});
      assert.equal(update.statusCode, 200);
      const accepted = await environment.app.inject({method: "POST", url: "/api/v1/invitations/accept", headers: target.headers, payload: {token: invitation.token}});
      assert.equal(accepted.statusCode, 200, accepted.body);
      assert.equal(accepted.json<{workspaceId: string}>().workspaceId, owner.workspaceId);
      assert.equal((await environment.owner.query("SELECT role FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2", [owner.workspaceId, target.userId])).rows[0]?.role, "admin");
      const duplicate = await environment.app.inject({method: "POST", url: path + "/invitations", headers: owner.headers, payload: {email: "lifecycle-target@example.test", role: "member", permission: "read"}});
      assert.equal(duplicate.statusCode, 409);
    });
    await context.test("membership removal clears grants and reinvitation cannot restore old shares", async () => {
      const page = await environment.app.inject({method: "POST", url: path + "/pages", headers: owner.headers, payload: {operationId: crypto.randomUUID(), title: "Restricted page"}});
      assert.equal(page.statusCode, 201, page.body);
      const pageId = page.json<{id: string}>().id;
      await environment.owner.query("INSERT INTO tantu.grants(workspace_id,record_id,user_id,permission) VALUES($1,$2,$3,'edit')", [owner.workspaceId, pageId, target.userId]);
      const removed = await environment.app.inject({method: "DELETE", url: path + "/members/" + target.userId, headers: owner.headers});
      assert.equal(removed.statusCode, 200, removed.body);
      assert.equal((await environment.owner.query("SELECT 1 FROM tantu.grants WHERE workspace_id=$1 AND user_id=$2", [owner.workspaceId, target.userId])).rowCount, 0);
      const members = await environment.app.inject({url: path + "/members", headers: owner.headers});
      assert.ok(!members.json<{items: {id: string}[]}>().items.some(member => member.id === target.userId));
      const invitation = await create("lifecycle-target@example.test", {role: "guest", recordId: pageId});
      const login = await environment.app.inject({method: "POST", url: "/api/v1/auth/login", headers: {origin: environment.settings.origin}, payload: {email: "lifecycle-target@example.test", password: "synthetic test password only"}});
      const headers = {origin: environment.settings.origin, cookie: login.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; "), "x-csrf-token": login.json<{csrf: string}>().csrf};
      const accepted = await environment.app.inject({method: "POST", url: "/api/v1/invitations/accept", headers, payload: {token: invitation.token}});
      assert.equal(accepted.statusCode, 200, accepted.body);
      assert.equal((await environment.owner.query("SELECT permission FROM tantu.grants WHERE workspace_id=$1 AND user_id=$2", [owner.workspaceId, target.userId])).rows[0]?.permission, "read");
    });
    await context.test("new accounts join directly and revoked inviters cannot authorize acceptance", async () => {
      const invitation = await create("new-invitee@example.test");
      const accepted = await environment.app.inject({method: "POST", url: "/api/v1/invitations/accept", headers: {origin: environment.settings.origin}, payload: {token: invitation.token, name: "New invitee", password: "synthetic test password only"}});
      assert.equal(accepted.statusCode, 200, accepted.body);
      const stale = await create("stale-invitee@example.test");
      await environment.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [owner.workspaceId, owner.userId]);
      const invalid = await environment.app.inject({method: "POST", url: "/api/v1/invitations/accept", headers: {origin: environment.settings.origin}, payload: {token: stale.token, name: "Unavailable", password: "synthetic test password only"}});
      assert.equal(invalid.statusCode, 404, invalid.body);
    });
  } finally { await environment.close(); }
});
