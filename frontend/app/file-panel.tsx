"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, file, items, record, string } from "../lib/api";
import type { FileItem } from "../lib/api";
import { Icon } from "../components/icon";
import { Badge, Button, Field, inputClass, mutedClass } from "../components/ui";

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
  return <section aria-label="Attachments" className="border-t border-[#e6e8ef] pt-5 dark:border-[#303034]">
    <div className="mb-1 flex items-center gap-2"><Icon name="file" className="size-3.5 text-[#9690d2]" /><h3 className="text-[12px] font-medium">Attachments</h3><span className={`ml-auto text-[10px] ${mutedClass}`}>{files.length} files</span></div><p className={`mb-4 text-[10px] leading-relaxed ${mutedClass}`}>Private attachments · 5 MiB each · quarantined until scanned</p>
    {files.length ? <ul className="mb-4 divide-y divide-[#e3e6ef] rounded-lg border border-[#e3e6ef] px-3 dark:divide-[#323237] dark:border-[#323237]">{files.map((item) => <li key={item.id} className="grid gap-2 py-3"><div className="flex min-w-0 items-start gap-2"><Icon name="pages" className="mt-0.5 size-4 text-[#8c86c6]" /><div className="min-w-0 flex-1"><strong className="block truncate text-[11px] font-medium">{item.name}</strong><span className={`text-[10px] ${mutedClass}`}>{Math.ceil(item.bytes / 1024)} KiB</span></div><Badge tone={item.state === "clean" ? "green" : item.state === "pending" ? "violet" : "amber"}>{item.state}</Badge></div><div className="flex flex-wrap gap-1">{item.state === "clean" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void action(item, "download")}><Icon name="download" className="size-3.5" />Download</Button>}{canEdit && item.state === "unavailable" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void action(item, "rescan")}>Retry scan</Button>}{canEdit && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void action(item, "delete")}>Remove</Button>}</div></li>)}</ul> : <div className={`mb-4 rounded-lg border border-dashed border-[#dfe2ec] px-3 py-5 text-center text-[11px] dark:border-[#39393e] ${mutedClass}`}>No files attached to this record.</div>}
    {canEdit && <form onSubmit={upload} className="grid gap-3"><Field label="Add a file"><input name="file" type="file" required className={`${inputClass} py-2 text-[10px] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#ecebf7] file:px-2 file:py-1 file:text-[10px] file:text-[#7366a8] dark:file:bg-[#343044] dark:file:text-[#c2b7ee]`} /></Field><Button type="submit" size="sm" className="justify-self-start" disabled={busy}><Icon name="plus" className="size-3.5" />{busy ? "Please wait…" : "Upload file"}</Button></form>}
    <p role="status" className={`mt-3 text-[10px] leading-relaxed empty:hidden ${mutedClass}`}>{message}</p>
  </section>;
}
