"use client";

import { useEffect, useState } from "react";
import { acknowledgment, api, items, record, string } from "../lib/api";

interface Row { id: string; label: string; when: string; state: string }

export default function ActivityPanel({ workspaceId, csrf, operations }: { workspaceId: string; csrf: string; operations: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/workspaces/${workspaceId}/${operations ? "operations" : "activity"}`, items((value) => { const data = record(value); return { id: string(data.id), label: string(operations ? data.name : data.type), when: string(data.createdAt), state: string(operations ? data.state : data.deliveryState) }; }), { signal: controller.signal }).then(setRows).catch((error: unknown) => { if (!(error instanceof Error && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Activity is unavailable."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, operations, version]);
  async function action(row: Row, action: "retry" | "cancel") {
    try { await api(`/workspaces/${workspaceId}/jobs/${row.id}`, acknowledgment, { method: "POST", csrf, body: { action } }); setVersion((value) => value + 1); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Operation failed."); }
  }
  return <section className="settings"><h2>{operations ? "Operations" : "Workspace activity"}</h2><p className="muted">{operations ? "Internal processing and recovery. Only work you are allowed to inspect appears here." : "A small, content-free record of changes you can access."}</p><p role="alert" className="error">{message}</p><button onClick={() => setVersion((value) => value + 1)}>Refresh</button>{loading ? <p role="status">Loading…</p> : rows.length ? <ul className="activity-list">{rows.map((row) => <li key={row.id}><div><strong>{row.label}</strong><span className="small muted">{new Date(row.when).toLocaleString()} · {row.state}</span></div>{operations && ["created", "active", "retry"].includes(row.state) && <button onClick={() => void action(row, "cancel")}>Cancel</button>}{operations && row.state === "failed" && row.label !== "dead-letters" && <button onClick={() => void action(row, "retry")}>Retry</button>}</li>)}</ul> : <div className="empty"><h3>A quiet beginning.</h3><p>Changes will appear here as you work.</p></div>}</section>;
}
