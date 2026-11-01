"use client";
import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as Y from "yjs";
import { applyEditorDocument, editorDocument } from "../lib/rich-body";
import { Button, Notice, inputClass } from "../components/ui";
export default function RichBody({
  document,
  editable,
}: {
  document: Y.Doc;
  editable: boolean;
}) {
  const [error, setError] = useState("");
  const undo = useMemo(
    () =>
      new Y.UndoManager(document.getText("body"), {
        trackedOrigins: new Set([null]),
      }),
    [document],
  );
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1] },
          blockquote: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          listKeymap: false,
          codeBlock: false,
          hardBreak: false,
          horizontalRule: false,
          undoRedo: false,
          link: false,
          underline: false,
          trailingNode: false,
        }),
      ],
      content: editorDocument(document.getText("body")),
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-label": "Rich page body",
          "aria-multiline": "true",
          class: `${inputClass} min-h-55 leading-7 [&_h1]:font-[family-name:var(--font-poppins)] [&_h1]:text-xl [&_h1]:font-medium [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_code]:text-zinc-800 dark:[&_code]:bg-zinc-800 dark:[&_code]:text-zinc-200 [&_p]:min-h-7`,
        },
        handleKeyDown: (_view, event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "z"
          ) {
            if (event.shiftKey) undo.redo();
            else undo.undo();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        try {
          applyEditorDocument(document.getText("body"), editor.getJSON());
          setError("");
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "The edit exceeds supported document bounds.",
          );
          editor.commands.setContent(editorDocument(document.getText("body")), {
            emitUpdate: false,
          });
        }
      },
    },
    [document],
  );
  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      Object.fromEntries(
        (["bold", "italic", "strike", "code"] as const).map((mark) => [
          mark,
          editor?.isActive(mark) ?? false,
        ]),
      ),
  });
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const next = editorDocument(document.getText("body"));
      if (JSON.stringify(editor.getJSON()) === JSON.stringify(next)) return;
      const { from, to } = editor.state.selection;
      editor.commands.setContent(next, { emitUpdate: false });
      const maximum = editor.state.doc.content.size;
      editor.commands.setTextSelection({
        from: Math.min(from, maximum),
        to: Math.min(to, maximum),
      });
    };
    document.on("update", update);
    update();
    return () => {
      document.off("update", update);
    };
  }, [document, editor]);
  useEffect(() => () => undo.destroy(), [undo]);
  return (
    <details className="rounded-lg border border-[#dedfeb] p-3 dark:border-[#303032]">
      <summary className="cursor-pointer text-xs font-medium">
        Rich text formatting
      </summary>
      <div className="mt-3 grid gap-3">
        <div
          role="toolbar"
          aria-label="Page formatting"
          className="flex flex-wrap gap-2"
        >
          {(["bold", "italic", "strike", "code"] as const).map((mark) => (
            <Button
              key={mark}
              disabled={!editable || !editor}
              size="sm"
              aria-pressed={active?.[mark] ?? false}
              onClick={() => editor?.chain().focus().toggleMark(mark).run()}
            >
              {mark}
            </Button>
          ))}
          <Button
            size="sm"
            disabled={!editable || !editor}
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            Heading
          </Button>
          <Button size="sm" disabled={!editable} onClick={() => undo.undo()}>
            Undo
          </Button>
          <Button size="sm" disabled={!editable} onClick={() => undo.redo()}>
            Redo
          </Button>
        </div>
        <EditorContent editor={editor} />
        {error && (
          <Notice role="alert" tone="error">
            {error}
          </Notice>
        )}
        <p className="text-[10px] text-[#8b8b90]">
          Paragraphs, headings, bold, italic, strike and inline code. Formatting
          and text share the same collaborative body. External HTML, links and
          executable embeds are excluded.
        </p>
      </div>
    </details>
  );
}
