import assert from "node:assert/strict";
import { test } from "node:test";
import { invitationAccepted, invitationCreated, invitationDestination, invitationPreview, invitationToken, locationInvitation, pendingInvitation } from "../lib/invitations.ts";

const token = "a".repeat(43);
test("invitation links normalize fragments and legacy queries without trusting their origin", () => {
  for (const input of [token, `https://example.test/settings#invite=${token}`, `http://localhost:3000/?invitation=${token}`, `/settings?token=${token}`]) assert.equal(invitationToken(input), token);
  for (const input of ["", "short", `javascript:alert(1)#invite=${token}`, `https://example.test/#invite=${token}extra`]) assert.equal(invitationToken(input), null);
  assert.equal(locationInvitation({search: "", hash: `#invite=${token}`}), token);
  assert.equal(invitationDestination("workspace"), "/settings?w=workspace&section=members");
});
test("invitation responses validate lifecycle contracts", () => {
  const pending = {id: "hash", email: "invite@example.test", role: "guest", recordId: null, permission: "read", expiresAt: "2026-11-03"};
  assert.equal(pendingInvitation(pending).role, "guest");
  assert.throws(() => pendingInvitation({...pending, role: "owner"}));
  assert.throws(() => invitationPreview({invitation: {...pending, workspaceId: "id"}}));
  assert.throws(() => invitationAccepted({workspaceId: "id"}));
  assert.equal(invitationCreated({id: "hash", token, link: `https://example.test/#invite=${token}`, delivery: {status: "unconfirmed", message: "Share the link"}}).delivery.status, "unconfirmed");
});
