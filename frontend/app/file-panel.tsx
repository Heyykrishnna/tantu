"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, file, items, record, string } from "../lib/api";
import type { FileItem } from "../lib/api";

export default function FilePanel({ workspaceId, recordId, csrf, canEdit }: { workspaceId: string; recordId: string; csrf: string; canEdit: boolean }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = useRef<{ file: File; id: string } | null>(null);
  const path = `/workspaces/${workspaceId}/records/${recordId}/files`;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { setFiles(await api(path, items(file), { ...(signal ? { signal } : {}) })); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Files are unavailable."); }
  }, [path]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = setInterval(() => void refresh(controller.signal), 15_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [refresh]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const input = new FormData(event.currentTarget).get("file");
    if (!(input instanceof File) || !input.size || input.size > 5 * 1024 * 1024) { setMessage("Choose a nonempty file no larger than 5 MiB."); setBusy(false); return; }
    try {
      if (operation.current?.file !== input) operation.current = { file: input, id: crypto.randomUUID() };
      const bytes = new Uint8Array(await input.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      await api(path, file, { method: "POST", csrf, body: { operationId: operation.current.id, name: input.name, mediaType: ["text/plain", "application/pdf"].includes(input.type) ? input.type : "application/octet-stream", content: btoa(binary) } });
      operation.current = null; await refresh();
      setMessage("Upload stored in quarantine. It becomes downloadable after a successful scan.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  async function action(item: FileItem, action: "download" | "delete" | "rescan") {
    if (action === "delete" && !window.confirm(`Delete file “${item.name}”?`)) return;
    setBusy(true); setMessage("");
    try {
      if (action === "download") {
        const token = await api(path + `/${item.id}/access`, (value) => string(record(value).token), { method: "POST", csrf });
        const anchor = document.createElement("a");
        anchor.href = "/api/v1" + path + `/${item.id}/content?token=${encodeURIComponent(token)}`;
        anchor.rel = "noreferrer"; anchor.download = item.name; anchor.click();
      } else await api(path + "/" + item.id + (action === "rescan" ? "/rescan" : ""), acknowledgment, { method: action === "delete" ? "DELETE" : "POST", csrf });
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "File operation failed."); }
    finally { setBusy(false); }
  }
  return <section className="attachments" aria-label="Attachments"><h3>Files</h3><p className="small muted">Private attachments · 5 MiB each · quarantined until scanned</p>
    {files.length ? <ul className="file-list">{files.map((item) => <li key={item.id}><div><strong>{item.name}</strong><span className="small muted">{Math.ceil(item.bytes / 1024)} KiB · {item.state}</span></div><div className="actions">{item.state === "clean" && <button disabled={busy} onClick={() => void action(item, "download")}>Download</button>}{canEdit && item.state === "unavailable" && <button disabled={busy} onClick={() => void action(item, "rescan")}>Retry scan</button>}{canEdit && <button disabled={busy} onClick={() => void action(item, "delete")}>Remove</button>}</div></li>)}</ul> : <p className="small muted">No files attached.</p>}
    {canEdit && <form onSubmit={upload}><label>Add a file<input name="file" type="file" required /></label><button disabled={busy}>{busy ? "Please wait…" : "Upload file"}</button></form>}<p className="small" role="status">{message}</p>
  </section>;
}
