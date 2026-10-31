import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, settings, testPassword } from "./support.js";

test("real sessions, origin/CSRF, invitations, current membership and logout", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const a = await f.account("owner@example.test");
    const b = await f.account("foreign@example.test");
    const session = await f.app.inject({ url: "/api/v1/auth/session", headers: a.headers });
    assert.equal(session.statusCode, 200);
    assert.equal(session.json<{ user: { id: string } }>().user.id, a.userId);
    assert.equal(session.headers["cache-control"], "no-store");
    assert.equal((await f.app.inject({ method: "POST", url: "/api/v1/workspaces", headers: { ...a.headers, origin: "https://evil.test" }, payload: { name: "attack" } })).statusCode, 403);
    assert.equal((await f.app.inject({ method: "POST", url: "/api/v1/workspaces", headers: { ...a.headers, "x-csrf-token": "wrong" }, payload: { name: "attack" } })).statusCode, 403);
    assert.equal((await f.app.inject({ url: `/api/v1/workspaces/${a.workspaceId}/members`, headers: b.headers })).statusCode, 404);
    const invitation = await f.app.inject({ method: "POST", url: `/api/v1/workspaces/${a.workspaceId}/invitations`, headers: a.headers, payload: { email: "new@example.test", role: "member", permission: "read" } });
    assert.equal(invitation.statusCode, 201);
    const token = invitation.json<{ token: string }>().token;
    const accepted = await f.app.inject({ method: "POST", url: "/api/v1/invitations/accept", headers: { origin: settings.origin }, payload: { token, name: "New member", password: testPassword } });
    assert.equal(accepted.statusCode, 200);
    assert.equal((await f.app.inject({ method: "POST", url: "/api/v1/invitations/accept", headers: { origin: settings.origin }, payload: { token, name: "Replay", password: testPassword } })).statusCode, 404);
    const member = (await f.owner.query<{ id: string }>("SELECT id FROM tantu.users WHERE email='new@example.test'")).rows[0];
    assert.ok(member);
    const revoked = await f.app.inject({ method: "DELETE", url: `/api/v1/workspaces/${a.workspaceId}/members/${member.id}`, headers: a.headers });
    assert.equal(revoked.statusCode, 200);
    const memberHeaders = { cookie: accepted.cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
    assert.deepEqual((await f.app.inject({ url: "/api/v1/workspaces", headers: memberHeaders })).json<{ items: unknown[] }>().items, []);
    const logout = await f.app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: a.headers });
    assert.equal(logout.statusCode, 200);
    assert.equal((await f.app.inject({ url: "/api/v1/auth/session", headers: a.headers })).statusCode, 401);
    await f.owner.query("UPDATE tantu.sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [b.userId]);
    assert.equal((await f.app.inject({ url: "/api/v1/auth/session", headers: b.headers })).statusCode, 401);
  } finally { await f.close(); }
});

test("failed login limits are durable and do not reveal account existence", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 9; index++) {
      const response = await f.app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin: settings.origin }, payload: { email: "absent@example.test", password: "incorrect" } });
      assert.equal(response.statusCode, index < 8 ? 401 : 429);
      assert.ok(!response.body.includes("password_hash"));
    }
  } finally { await f.close(); }
});

test("registration, session listing, remote session revocation, password rotation and logout-all", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const email = "self-registered@example.test";
    const regRes = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin: settings.origin },
      payload: { email, name: "Self Registered", password: testPassword },
    });
    assert.equal(regRes.statusCode, 201);
    const regBody = regRes.json<{ user: { id: string; email: string }; workspaceId: string; csrf: string }>();
    assert.ok(regBody.workspaceId);
    assert.equal(regBody.user.email, email);

    const dupRes = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin: settings.origin },
      payload: { email, name: "Duplicate", password: testPassword },
    });
    assert.equal(dupRes.statusCode, 409);

    const headers = {
      cookie: regRes.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      origin: settings.origin,
      "x-csrf-token": regBody.csrf,
    };

    const meRes = await f.app.inject({ url: "/api/v1/auth/me", headers });
    assert.equal(meRes.statusCode, 200);
    assert.equal(meRes.json<{ user: { id: string } }>().user.id, regBody.user.id);

    const sessionsFirst = await f.app.inject({ url: "/api/v1/auth/sessions", headers });
    assert.equal(sessionsFirst.statusCode, 200);
    const firstItems = sessionsFirst.json<{ items: Array<{ id: string; current: boolean }> }>().items;
    assert.equal(firstItems.length, 1);
    assert.equal(firstItems[0]?.current, true);

    const loginSecond = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: settings.origin },
      payload: { email, password: testPassword },
    });
    assert.equal(loginSecond.statusCode, 200);

    const sessionsSecond = await f.app.inject({ url: "/api/v1/auth/sessions", headers });
    assert.equal(sessionsSecond.statusCode, 200);
    const secondItems = sessionsSecond.json<{ items: Array<{ id: string; current: boolean }> }>().items;
    assert.equal(secondItems.length, 2);

    const remote = secondItems.find((s) => !s.current);
    assert.ok(remote);
    const revokeRes = await f.app.inject({
      method: "DELETE",
      url: `/api/v1/auth/sessions/${remote.id}`,
      headers,
    });
    assert.equal(revokeRes.statusCode, 200);
    assert.equal(revokeRes.json<{ revoked: boolean }>().revoked, true);

    const wrongPass = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers,
      payload: { currentPassword: "wrong-current-password", newPassword: testPassword + "-new123" },
    });
    assert.equal(wrongPass.statusCode, 401);

    const samePass = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers,
      payload: { currentPassword: testPassword, newPassword: testPassword },
    });
    assert.equal(samePass.statusCode, 400);

    const changeRes = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers,
      payload: { currentPassword: testPassword, newPassword: testPassword + "-new123" },
    });
    assert.equal(changeRes.statusCode, 200);
    assert.equal(changeRes.json<{ updated: boolean }>().updated, true);

    const oldLogin = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: settings.origin },
      payload: { email, password: testPassword },
    });
    assert.equal(oldLogin.statusCode, 401);

    const newLogin = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: settings.origin },
      payload: { email, password: testPassword + "-new123" },
    });
    assert.equal(newLogin.statusCode, 200);

    const logoutAllRes = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout-all",
      headers,
    });
    assert.equal(logoutAllRes.statusCode, 200);
    assert.equal(logoutAllRes.json<{ revokedAll: boolean }>().revokedAll, true);

    const sessionAfter = await f.app.inject({ url: "/api/v1/auth/session", headers });
    assert.equal(sessionAfter.statusCode, 401);
  } finally { await f.close(); }
});
