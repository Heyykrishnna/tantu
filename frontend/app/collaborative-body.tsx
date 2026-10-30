"use client";
import RichBody from "./rich-body";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  acknowledgment,
  api,
  ApiError,
  list,
  record,
  string,
} from "../lib/api";
import { integer } from "../lib/projects";
import {
  Button,
  Field,
  Notice,
  inputClass,
  mutedClass,
} from "../components/ui";

function encode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function snapshot(value: unknown) {
  const item = record(value);
  return {
    state: string(item.state),
    version: integer(item.version),
    canEdit: item.canEdit === true,
    presence: list(item.presence, (value) => string(record(value).name)),
  };
}
export default function CollaborativeBody({
  workspaceId,
  recordId,
  userId,
  csrf,
  canEdit,
}: {
  workspaceId: string;
  recordId: string;
  userId: string;
  csrf: string;
  canEdit: boolean;
}) {
  const document = useRef<Y.Doc | null>(null);
  const [text, setText] = useState("");
  const [richDocument,setRichDocument]=useState<Y.Doc|null>(null);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [editable, setEditable] = useState(canEdit);
  const [presence, setPresence] = useState<string[]>([]);
  const retry = useRef<(() => Promise<void>) | null>(null);
  const path = `/workspaces/${workspaceId}/pages/${recordId}/collaboration`;
  const key = `tantu-draft:${userId}:${workspaceId}:collaboration:${recordId}`;
  useEffect(() => {
    const controller = new AbortController();
    const doc = new Y.Doc();
    document.current = doc;
    let pending: { update: string; operationId: string } | null = null;
    let busy = false;
    let stopped = false;
    let lastPresence = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    function store() {
      try {
        if (pending) sessionStorage.setItem(key, JSON.stringify(pending));
        else sessionStorage.removeItem(key);
      } catch {
        setError(
          "Browser draft storage is unavailable. Keep this tab open until all changes are saved.",
        );
      }
    }
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      setText(doc.getText("body").toString());
      if (origin === "remote") return;
      const merged = pending
        ? Y.mergeUpdates([decode(pending.update), update])
        : update;
      pending = { update: encode(merged), operationId: crypto.randomUUID() };
      store();
      setStatus("Unsaved changes");
    });
    function failure(error: unknown) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        stopped = true;
        setEditable(false);
        setText("");
        setReady(false);
        try {
          sessionStorage.removeItem(key);
        } catch {
          setError(
            "Access changed. Browser draft storage could not be cleared.",
          );
        }
        setStatus("Page access changed. Reopen the page after signing in.");
      } else {
        setStatus("Offline or unavailable · local draft retained");
        setError(
          error instanceof Error
            ? error.message
            : "Could not synchronize this page.",
        );
      }
    }
    async function synchronize() {
      if (busy || stopped || controller.signal.aborted) return;
      busy = true;
      try {
        const server = await api(path, snapshot, { signal: controller.signal });
        if (controller.signal.aborted) return;
        Y.applyUpdate(doc, decode(server.state), "remote");
        setEditable(server.canEdit);
        setPresence(server.presence);
        if (pending && server.canEdit) {
          const sending = pending;
          await api(path, acknowledgment, {
            method: "POST",
            csrf,
            body: sending,
            signal: controller.signal,
          });
          if (pending === sending) {
            pending = null;
            store();
          }
        }
        if (Date.now() - lastPresence > 15000) {
          await api(path + "/presence", acknowledgment, {
            method: "POST",
            csrf,
            signal: controller.signal,
          });
          lastPresence = Date.now();
        }
        setStatus(pending ? "Unsaved changes" : "All body changes saved");
        setError("");
      } catch (error) {
        failure(error);
      } finally {
        busy = false;
      }
    }
    retry.current = synchronize;
    api(path, snapshot, { signal: controller.signal })
      .then(async (server) => {
        if (controller.signal.aborted) return;
        Y.applyUpdate(doc, decode(server.state), "remote");
        setEditable(server.canEdit);
        setPresence(server.presence);
        try {
          const saved = sessionStorage.getItem(key);
          if (saved) {
            const raw: unknown = JSON.parse(saved);
            const data = record(raw);
            pending = {
              update: string(data.update),
              operationId: string(data.operationId),
            };
            Y.applyUpdate(doc, decode(pending.update), "remote");
          }
        } catch {
          setError(
            "The saved collaboration draft could not be recovered. Keep a copy of any unsaved text.",
          );
        }
        setText(doc.getText("body").toString());
        setReady(true);
        setRichDocument(doc);
        setStatus(
          pending ? "Recovered unsaved body changes" : "All body changes saved",
        );
        await synchronize();
        if (!controller.signal.aborted)
          interval = setInterval(() => {
            if (globalThis.document.visibilityState === "visible")
              void synchronize();
          }, 1500);
      })
      .catch(failure);
    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
      retry.current = null;
      document.current = null;
      doc.destroy();
    };
  }, [path, key, csrf]);
  function change(value: string) {
    const doc = document.current;
    if (!doc || !ready || !editable) return;
    const current = doc.getText("body");
    const before = current.toString();
    let prefix = 0;
    while (
      prefix < before.length &&
      prefix < value.length &&
      before[prefix] === value[prefix]
    )
      prefix++;
    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < value.length - prefix &&
      before[before.length - suffix - 1] === value[value.length - suffix - 1]
    )
      suffix++;
    doc.transact(() => {
      const removed = before.length - prefix - suffix;
      if (removed) current.delete(prefix, removed);
      const inserted = value.slice(prefix, value.length - suffix);
      if (inserted) current.insert(prefix, inserted);
    });
  }
  return (
    <section className="grid gap-3">
      {ready && richDocument && <RichBody document={richDocument} editable={editable} />}
      <Field label="Page text">
        <textarea
          name="collaborative-body"
          aria-label="Page text"
          rows={10}
          maxLength={100000}
          disabled={!ready || !editable}
          value={text}
          onChange={(event) => change(event.target.value)}
          className={`${inputClass} min-h-55 resize-y leading-7`}
          placeholder="Start writing. Use # for a heading."
        />
      </Field>
      <p role="status" className={`text-[10px] ${mutedClass}`}>
        {status}
      </p>
      {presence.length > 0 && (
        <p className={`text-[10px] ${mutedClass}`}>
          Here now: {presence.join(", ")}
        </p>
      )}
      <Notice role="alert" tone="error">
        {error}
      </Notice>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void retry.current?.()}>
          Sync body now
        </Button>
        <Button
          size="sm"
          disabled={!ready}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([text], { type: "text/plain;charset=utf-8" }),
            );
            const link = globalThis.document.createElement("a");
            link.href = url;
            link.download = "page-draft.txt";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export text
        </Button>
      </div>
      <p className={`text-[10px] ${mutedClass}`}>
        Page bodies save collaboratively. Structured properties use version
        checks when you save changes.
      </p>
    </section>
  );
}
