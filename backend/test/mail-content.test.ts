import assert from "node:assert/strict";
import { test } from "node:test";
import { addresses, mimeMessage } from "../src/modules/providers/mail-content.js";
test("mail addresses preserve quoted names and groups and MIME encodes content without introducing headers", () => {
  assert.deepEqual(addresses('Team: "Last, First" <first@example.test>, second@example.test;'), ["first@example.test", "second@example.test"]);
  const mime = mimeMessage("owner@example.test", ["recipient@example.test"], "Unicode ✓\r\nBcc: hidden@example.test", "plain text", "stable@example.test", { messageId: "<source@example.test>", references: "<prior@example.test>" }, [{ file: { id: "file", name: 'quote"\r\nname.pdf', bytes: 4, mediaType: "application/pdf", digest: "digest", version: 1 }, bytes: Buffer.from("file") }]);
  assert.ok(mime.includes("In-Reply-To: <source@example.test>\r\n"));
  assert.ok(mime.includes("References: <prior@example.test> <source@example.test>"));
  assert.ok(!mime.includes("\r\nBcc:")); assert.ok(!mime.includes('filename="quote"'));
  assert.ok(mime.includes("ZmlsZQ==")); assert.ok(mime.endsWith("--\r\n"));
});
