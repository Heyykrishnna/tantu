import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInvitationEmail, invitationLink } from "../src/modules/mail/invitation.js";

test("invitation emails escape user content and keep tokens in URL fragments", () => {
  const link = invitationLink("https://example.test", "opaque-token");
  assert.equal(link, "https://example.test/settings#invite=opaque-token");
  const email = buildInvitationEmail("invitee@example.test", "<script>workspace</script>", "<img src=x>", "member", link);
  assert.ok(email.text.includes(link));
  assert.ok(!email.html.includes("<script>"));
  assert.ok(!email.html.includes("<img src=x>"));
  assert.ok(email.html.includes("&lt;script&gt;"));
});
