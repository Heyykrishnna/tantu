"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CanonicalRecord, Document } from "../lib/contracts";
import { acknowledgment, api, ApiError, canonical, items, record, string } from "../lib/api";
import FilePanel from "./file-panel";

function bodyText(body: Document): string { return body.content.map((block) => (block.type === "heading" ? "# " : "") + block.content.map((text) => text.text).join("")).join("\n"); }
function toDocument(value: string): Document { return { type: "doc", content: value.split("\n").map((text) => ({ type: text.startsWith("# ") ? "heading" : "paragraph", content: text ? [{ type: "text", text: text.replace(/^# /, "") }] : [] })) }; }

export default function RecordEditor({ entry, kind, workspaceId, userId, csrf, onSaved, onClose, onNavigatePage }: { entry: CanonicalRecord | null; kind: "task" | "page"; workspaceId: string; userId: string; csrf: string; onSaved: (entry?: CanonicalRecord) => void; onClose: () => void; onNavigatePage: (recordId?: string, parentId?: string) => void }) {
  const form = useRef<HTMLFormElement>(null);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const draftNotice = useRef<HTMLParagraphElement>(null);
  const key = `tantu-draft:${userId}:${workspaceId}:${kind}:${entry?.id ?? "new"}`;
  const path = `/workspaces/${workspaceId}/${kind === "task" ? "tasks" : "pages"}`;

  useEffect(() => {
    const current = form.current;
    if (!current) return;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const draft: unknown = JSON.parse(raw);
      for (const [name, value] of Object.entries(record(draft))) {
        const field = current.elements.namedItem(name);
        if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) && typeof value === "string") field.value = value;
      }
      if (typeof record(draft).__operationId === "string" && typeof record(draft).__fingerprint === "string") operation.current = { id: string(record(draft).__operationId), fingerprint: string(record(draft).__fingerprint) };
      if (draftNotice.current) draftNotice.current.hidden = false;
    } catch { if (draftNotice.current) { draftNotice.current.textContent = "Browser draft storage is unavailable. Keep this tab open until your save is confirmed."; draftNotice.current.hidden = false; } }
  }, [key]);

  function keepDraft() {
    if (!form.current) return;
    try { sessionStorage.setItem(key, JSON.stringify(Object.fromEntries(new FormData(form.current)))); }
    catch { setMessage("Browser draft storage is unavailable. Keep this tab open until your save is confirmed."); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const body = { title: String(data.get("title")), visibility: String(data.get("visibility") ?? entry?.visibility ?? "private"), ...(kind === "task" ? { status: String(data.get("status")), priority: String(data.get("priority")), deadline: data.get("deadline") || null, estimateMinutes: data.get("estimate") ? Number(data.get("estimate")) : null } : { body: toDocument(String(data.get("body"))), ...(!entry && data.get("parentId") ? { parentId: String(data.get("parentId")) } : {}) }), ...(entry ? { expectedVersion: entry.version } : {}) };
    const fingerprint = JSON.stringify(body);
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...Object.fromEntries(data), __operationId: operation.current.id, __fingerprint: fingerprint }));
      const saved = await api(path + (entry ? "/" + entry.id : ""), canonical, { method: entry ? "PATCH" : "POST", csrf, body: { ...body, operationId: operation.current.id } });
      sessionStorage.removeItem(key); operation.current = null; onSaved(saved);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); setConflict(error instanceof ApiError && error.code === "VERSION_CONFLICT"); }
    finally { setBusy(false); }
  }
  async function reload() {
    if (!entry) return;
    if (!window.confirm("Reload the current version and discard your unsaved browser draft?")) return;
    try { const current = await api(path + "/" + entry.id, canonical); sessionStorage.removeItem(key); onSaved(current); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Reload failed."); }
  }
  async function remove() {
    if (!entry || !window.confirm(`Delete “${entry.title}”? Nested content will become unavailable.`)) return;
    setBusy(true);
    try { await api(path + "/" + entry.id, acknowledgment, { method: "DELETE", csrf, body: { operationId: crypto.randomUUID(), expectedVersion: entry.version } }); sessionStorage.removeItem(key); onSaved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Delete failed."); }
    finally { setBusy(false); }
  }
  async function loadHistory() {
    if (!entry) return;
    try { setHistory(await api(path + "/" + entry.id + "/history", items((value) => "Version " + string(String(record(value).version)) + " · " + new Date(string(record(value).createdAt)).toLocaleString()))); }
    catch (error) { setMessage(error instanceof Error ? error.message : "History failed."); }
  }
  return <section className="detail" aria-label={entry ? "Record details" : `New ${kind}`}>
    <header className="detail-heading"><p className="eyebrow">{entry ? `${kind} · version ${entry.version}` : `Make room for a new ${kind}`}</p><button type="button" className="quiet" onClick={onClose} aria-label="Close record details">×</button></header>
    <p ref={draftNotice} hidden className="notice" role="status">Recovered your unsaved draft from this browser session.</p>
    {entry && !entry.canEdit && <p className="notice">You have read-only access to this record.</p>}
    <form ref={form} onSubmit={save} onChange={keepDraft}><fieldset disabled={busy || (entry !== null && !entry.canEdit)}>
      <label>Title<input name="title" defaultValue={entry?.title ?? ""} placeholder={kind === "task" ? "What needs doing?" : "An idea worth keeping"} required maxLength={200} autoFocus /></label>
      <label>Visibility<select aria-label="Visibility" name="visibility" disabled={entry !== null && entry.ownerId !== userId} defaultValue={entry?.visibility ?? "private"}><option value="private">Private — invited people only</option><option value="workspace">Workspace — members can edit</option></select></label>
      {kind === "task" ? <><div className="field-row"><label>Status<select aria-label="Status" name="status" defaultValue={entry?.status ?? "open"}><option value="open">Open</option><option value="done">Complete</option></select></label><label>Priority<select aria-label="Priority" name="priority" defaultValue={entry?.priority ?? "normal"}>{["low", "normal", "high", "urgent"].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="field-row"><label>Deadline<input name="deadline" type="date" defaultValue={entry?.deadline ?? ""} /></label><label>Estimate (minutes)<input name="estimate" type="number" min={1} max={10080} defaultValue={entry?.estimateMinutes ?? ""} /></label></div></> : <>{!entry && <label>Parent page ID <span className="optional">optional</span><input name="parentId" pattern="[0-9a-f-]{36}" defaultValue={new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("parent") ?? ""} placeholder="Leave blank for a top-level page" /></label>}<label>Page text<textarea aria-label="Page text" name="body" rows={12} maxLength={100000} defaultValue={entry ? bodyText(entry.body) : ""} placeholder="Start with a thought. Each line becomes a paragraph." /></label></>}
      <p role="alert" className="error">{message}</p>
      {conflict && <div className="notice">Your draft is kept in this browser session. <button type="button" onClick={reload}>Reload the current version</button></div>}
      <div className="actions"><button className="primary" disabled={busy || conflict}>{busy ? "Saving…" : entry ? "Save changes" : `Create ${kind}`}</button>{entry && <button type="button" className="danger" onClick={remove} disabled={busy}>Delete</button>}</div>
    </fieldset></form>
    {entry && <><div className="record-meta"><span>Source: tantu</span><span className="record-id">{entry.id}</span>{entry.parentId && <button onClick={() => onNavigatePage(entry.parentId ?? undefined)}>Open parent page</button>}{entry.kind === "page" && entry.canEdit && <button onClick={() => onNavigatePage(undefined, entry.id)}>Add nested page</button>}<button onClick={loadHistory}>View history</button></div>{history.length > 0 && <ol className="small">{history.map((item) => <li key={item}>{item}</li>)}</ol>}<FilePanel workspaceId={workspaceId} recordId={entry.id} csrf={csrf} canEdit={entry.canEdit} /><p className="small muted">Sharing is managed through an explicit record invitation in Workspace settings.</p></>}
  </section>;
}
