import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import { insertDocument, richDocument } from "../src/modules/knowledge/rich-text.js";
test("rich body marks survive concurrent text edits and reject executable or embedded attributes", () => {
  const left = new Y.Doc(); const right = new Y.Doc();
  try {
    insertDocument(left.getText("body"), { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Title", marks: [{ type: "bold" }] }] }, { type: "paragraph", content: [{ type: "text", text: "Body" }] }] }); Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    left.getText("body").format(8, 4, { italic: true }); right.getText("body").insert(right.getText("body").length, " extended", {}); Y.applyUpdate(left, Y.encodeStateAsUpdate(right)); Y.applyUpdate(right, Y.encodeStateAsUpdate(left)); assert.deepEqual(richDocument(left.getText("body")), richDocument(right.getText("body"))); assert.deepEqual(richDocument(left.getText("body")).content[0]?.content[0]?.marks, [{ type: "bold" }]);
    left.getText("body").format(0, 1, { href: "javascript:alert(1)" }); assert.throws(() => richDocument(left.getText("body")), /Only bold/);
  } finally { left.destroy(); right.destroy(); }
});
