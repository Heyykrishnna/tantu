"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, ApiError, canonical, choice, items, page, record, session, string, workspace } from "../lib/api";
import type { User, Workspace } from "../lib/api";
import type { CanonicalRecord } from "../lib/contracts";
import SignIn from "./sign-in";
import RecordEditor from "./record-editor";
import WorkspaceSettings from "./workspace-settings";
import ActivityPanel from "./activity-panel";

type View = "tasks" | "pages" | "activity" | "settings" | "operations";
function forgetDrafts() {
  for (const key of Object.keys(sessionStorage)) if (key.startsWith("tantu-draft:")) sessionStorage.removeItem(key);
}

export default function WorkspaceApp() {
  const [user, setUser] = useState<User | null>(null);
  const [csrf, setCsrf] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [view, setView] = useState<View>("tasks");
  const [entries, setEntries] = useState<CanonicalRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<CanonicalRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const currentWorkspace = workspaces.find((item) => item.id === workspaceId);
  const manager = currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";

  const handleError = useCallback((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") return;
    setMessage(error instanceof Error ? error.message : "The request could not be completed.");
    if (error instanceof ApiError && error.status === 401) {
      setUser(null); setSignedOut(true); setSelected(null); setEntries([]); setEditorOpen(false);
      try { forgetDrafts(); } catch { setMessage("Sign in again. Browser draft storage is unavailable."); }
    }
  }, []);

  const acceptIdentity = useCallback(([identity, spaces]: [ReturnType<typeof session>, Workspace[]]) => {
    setUser(identity.user); setCsrf(identity.csrf); setWorkspaces(spaces); setSignedOut(false); setMessage("");
    const url = new URLSearchParams(window.location.search);
    setWorkspaceId(spaces.find((item) => item.id === url.get("w"))?.id ?? spaces[0]?.id ?? "");
    const initialView = url.get("view");
    if (initialView && ["tasks", "pages", "activity", "settings", "operations"].includes(initialView)) setView(choice(initialView, ["tasks", "pages", "activity", "settings", "operations"]));
  }, []);
  const authenticationFailure = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) setSignedOut(true);
    else handleError(error);
  }, [handleError]);
  const authenticate = useCallback(() => Promise.all([api("/auth/session", session), api("/workspaces", items(workspace))]).then(acceptIdentity).catch(authenticationFailure).finally(() => setLoading(false)), [acceptIdentity, authenticationFailure]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api("/auth/session", session, { signal: controller.signal }), api("/workspaces", items(workspace), { signal: controller.signal })]).then(acceptIdentity).catch(authenticationFailure).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [acceptIdentity, authenticationFailure]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); dialog.current?.showModal(); } };
    const back = () => window.location.reload();
    window.addEventListener("popstate", back);
    try { document.documentElement.dataset.theme = localStorage.getItem("tantu-theme") ?? "light"; } catch { document.documentElement.dataset.theme = "light"; }
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); window.removeEventListener("popstate", back); };
  }, []);

  const open = useCallback(async (entryId: string, targetView: "tasks" | "pages" = view === "pages" ? "pages" : "tasks") => {
    try {
      const entry = await api(`/workspaces/${workspaceId}/${targetView}/${entryId}`, canonical);
      setSelected(entry); setEditorOpen(true); setEditorVersion((value) => value + 1); setMessage("");
      window.history.pushState(null, "", `/?w=${workspaceId}&view=${targetView}&r=${entry.id}`);
    } catch (error) { handleError(error); }
  }, [workspaceId, view, handleError]);

  useEffect(() => {
    if (!workspaceId || !user || (view !== "tasks" && view !== "pages")) return;
    const controller = new AbortController();
    async function load() {
      setLoadingRecords(true); setEntries([]);
      try {
        const result = await api(`/workspaces/${workspaceId}/${view}?limit=25${query ? "&q=" + encodeURIComponent(query) : ""}`, page, { signal: controller.signal });
        setEntries(result.items); setCursor(result.nextCursor);
        if (new URLSearchParams(window.location.search).get("new") === "1") setEditorOpen(true);
      } catch (error) { handleError(error); }
      finally { if (!controller.signal.aborted) setLoadingRecords(false); }
    }
    void load();
    return () => controller.abort();
  }, [workspaceId, view, query, user, listVersion, handleError]);

  useEffect(() => {
    if (!workspaceId || !user) return;
    const parameters = new URLSearchParams(window.location.search);
    const id = parameters.get("r");
    if (!id || (view !== "tasks" && view !== "pages")) return;
    const controller = new AbortController();
    api(`/workspaces/${workspaceId}/${view}/${id}`, canonical, { signal: controller.signal }).then((entry) => { setSelected(entry); setEditorOpen(true); }).catch(handleError);
    return () => controller.abort();
  }, [workspaceId, view, user, handleError]);

  useEffect(() => {
    if (!workspaceId || !user) return;
    const controller = new AbortController();
    const interval = setInterval(async () => {
      try {
        const spaces = await api("/workspaces", items(workspace), { signal: controller.signal });
        if (!spaces.some((item) => item.id === workspaceId)) {
          setWorkspaces(spaces); setWorkspaceId(spaces[0]?.id ?? ""); setSelected(null); setEditorOpen(false); setEntries([]); setMessage("Workspace access was removed."); forgetDrafts();
        } else if (selected) await api(`/workspaces/${workspaceId}/${selected.kind === "task" ? "tasks" : "pages"}/${selected.id}`, canonical, { signal: controller.signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) { setSelected(null); setEditorOpen(false); forgetDrafts(); }
        handleError(error);
      }
    }, 15_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [workspaceId, user, selected, handleError]);

  function navigate(target: View, space = workspaceId) {
    setView(target); setWorkspaceId(space); setEditorOpen(false); setSelected(null); setQuery(""); setMessage(""); setNotice("");
    window.history.pushState(null, "", space ? `/?w=${space}&view=${target}` : "/");
    dialog.current?.close();
  }
  async function newWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const created = await api("/workspaces", (value) => string(record(value).id), { method: "POST", csrf, body: { name: String(data.get("name")) } });
      setWorkspaces(await api("/workspaces", items(workspace))); navigate("tasks", created);
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }
  async function logout() {
    try { await api("/auth/logout", acknowledgment, { method: "POST", csrf }); forgetDrafts(); setSignedOut(true); setUser(null); setEntries([]); setSelected(null); setEditorOpen(false); window.history.replaceState(null, "", "/"); }
    catch (error) { handleError(error); }
  }
  async function more() {
    if (!cursor) return;
    setBusy(true);
    try { const result = await api(`/workspaces/${workspaceId}/${view}?cursor=${cursor}&limit=25${query ? "&q=" + encodeURIComponent(query) : ""}`, page); setEntries((current) => [...current, ...result.items]); setCursor(result.nextCursor); }
    catch (error) { handleError(error); }
    finally { setBusy(false); }
  }
  function saved(entry?: CanonicalRecord) {
    setSelected(entry ?? null); setEditorOpen(!!entry); setEditorVersion((value) => value + 1); setListVersion((value) => value + 1); setNotice(entry ? "Saved. Your changes are stored." : "Record deleted.");
    window.history.replaceState(null, "", `/?w=${workspaceId}&view=${view}${entry ? "&r=" + entry.id : ""}`);
  }

  if (loading) return <main className="boot" role="status"><span className="wordmark">tantu<span>●</span></span><p>Opening your workspace…</p></main>;
  if (signedOut) return <SignIn onSignedIn={() => void authenticate()} />;
  if (!user) return <main className="boot"><h1>The workspace is taking a moment.</h1><p role="alert">{message}</p><button onClick={() => void authenticate()}>Try again</button></main>;
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to workspace</a>
    <aside className="sidebar"><Link className="wordmark" href="/">tantu<span>●</span></Link><label className="workspace-switch">Your workspace<select value={workspaceId} onChange={(event) => navigate("tasks", event.target.value)} aria-label="Switch workspace"><option value="" disabled>Select workspace</option>{workspaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
      <button className="command-button" onClick={() => dialog.current?.showModal()}>Find your way <kbd>⌘ K</kbd></button>
      <p className="nav-caption">Your space</p><nav aria-label="Workspace navigation">{([['tasks', 'Tasks', '○'], ['pages', 'Pages', '▤'], ['activity', 'Activity', '↗'], ['settings', 'Workspace settings', '⚙']] as const).map(([target, label, icon]) => <button key={target} onClick={() => navigate(target)} aria-current={view === target ? "page" : undefined}><span aria-hidden="true">{icon}</span>{label}</button>)}{manager && <button onClick={() => navigate("operations")} aria-current={view === "operations" ? "page" : undefined}><span aria-hidden="true">◷</span>Operations</button>}</nav>
      <details className="new-workspace"><summary>New workspace</summary><form onSubmit={newWorkspace}><label>Workspace name<input name="name" required maxLength={100} /></label><button disabled={busy}>Create workspace</button></form></details>
      <footer className="sidebar-footer"><div className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</div><div><strong>{user.name}</strong><span className="small muted">A little more considered.</span></div><button className="quiet" onClick={() => void logout()}>Sign out</button></footer>
    </aside>
    <main id="main-content" className="workspace-main"><header className="topbar"><span>{currentWorkspace?.name ?? "Your first workspace"}</span><div className="actions"><span className="small muted">Private by default</span><button aria-label="Toggle light and dark theme" onClick={() => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; try { localStorage.setItem("tantu-theme", theme); } catch { setNotice("Theme changed for this tab."); } }}>◐</button></div></header><div className="workspace-content"><p role="alert" className="error">{message}</p><p role="status" className="success">{notice}</p>
      {!currentWorkspace ? <section className="empty first-workspace"><p className="eyebrow">A fresh page</p><h1>Make yourself some space.</h1><p>Create a workspace for your tasks and ideas.</p><form onSubmit={newWorkspace}><label>Workspace name<input name="name" required maxLength={100} placeholder="Personal workspace" /></label><button className="primary" disabled={busy}>Create your workspace</button></form></section> : view === "settings" ? <WorkspaceSettings key={workspaceId} workspace={currentWorkspace} csrf={csrf} onJoined={() => void authenticate()} /> : view === "activity" || view === "operations" ? <ActivityPanel key={workspaceId + view} workspaceId={workspaceId} csrf={csrf} operations={view === "operations"} /> : <>
        <header className="page-heading"><div><p className="eyebrow">Room for what matters</p><h1>{view === "tasks" ? "Things to move forward." : "Thoughts, with a home."}</h1><p className="muted">{view === "tasks" ? "One considered step at a time." : "A place for notes, plans, and the ideas between them."}</p></div>{currentWorkspace.role !== "guest" && <button className="primary" onClick={() => { setSelected(null); setEditorOpen(true); setEditorVersion((value) => value + 1); window.history.replaceState(null, "", `/?w=${workspaceId}&view=${view}&new=1`); }}>+ New {view === "tasks" ? "task" : "page"}</button>}</header>
        <form className="search-form" onSubmit={(event) => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("q"))); }}><label className="sr-only" htmlFor="record-search">Search {view}</label><input id="record-search" name="q" type="search" placeholder={`Find a ${view === "tasks" ? "task" : "page"} by title…`} maxLength={100} /><button>Search</button><button type="button" onClick={() => { setQuery(""); setListVersion((value) => value + 1); }}>Refresh</button></form>
        <div className={editorOpen ? "work-grid with-detail" : "work-grid"}><section aria-label={view === "tasks" ? "Task list" : "Page list"} className="record-list" aria-busy={loadingRecords}>{loadingRecords ? <div className="empty" role="status">Gathering your {view}…</div> : entries.length ? <><div className="list-heading"><span>{view === "tasks" ? "Your tasks" : "Your pages"}</span><span>{entries.length} shown</span></div><ul>{entries.map((entry) => <li key={entry.id}><button className={selected?.id === entry.id ? "record-row selected" : "record-row"} onClick={() => void open(entry.id)}><span className={`record-icon ${entry.status}`} aria-hidden="true">{entry.kind === "page" ? "▤" : entry.status === "done" ? "✓" : "○"}</span><span className="record-copy"><strong>{entry.title}</strong><span className="small muted">{entry.kind === "page" ? entry.parentId ? "Nested page" : "Top-level page" : entry.deadline ? "Due " + entry.deadline : "No deadline"} · {entry.visibility === "private" ? "Private" : "Workspace"}</span></span><span className="tag">{entry.kind === "task" ? entry.status === "done" ? "Complete" : entry.priority : "Page"}</span></button></li>)}</ul>{cursor && <button className="load-more" disabled={busy} onClick={() => void more()}>Load more</button>}</> : <div className="empty"><span className="empty-mark" aria-hidden="true">{view === "tasks" ? "○" : "▤"}</span><h2>{query ? "Nothing by that title." : view === "tasks" ? "A little space to begin." : "Every idea starts somewhere."}</h2><p>{query ? "Try a different title or clear the search." : currentWorkspace.role === "guest" ? "Records shared with you will appear here." : `Create your first ${view === "tasks" ? "task" : "page"} when you are ready.`}</p></div>}</section>
          {editorOpen && <RecordEditor key={`${workspaceId}:${selected?.id ?? "new"}:${editorVersion}`} entry={selected} kind={view === "tasks" ? "task" : "page"} workspaceId={workspaceId} userId={user.id} csrf={csrf} onSaved={saved} onNavigatePage={(recordId, parentId) => { setView("pages"); setNotice(""); if (recordId) void open(recordId, "pages"); else { window.history.replaceState(null, "", `/?w=${workspaceId}&view=pages&new=1&parent=${parentId ?? ""}`); setSelected(null); setEditorOpen(true); setEditorVersion((value) => value + 1); } }} onClose={() => { setEditorOpen(false); setSelected(null); window.history.replaceState(null, "", `/?w=${workspaceId}&view=${view}`); }} />}
        </div>
      </>}
      <footer className="workspace-footer">A place for the work. And the thinking around it.</footer></div></main>
    <dialog ref={dialog} className="command-dialog"><header><h2>Find your way</h2><button onClick={() => dialog.current?.close()} aria-label="Close command palette">×</button></header><nav aria-label="Quick navigation"><button onClick={() => navigate("tasks")}>Open Tasks</button><button onClick={() => navigate("pages")}>Open Pages</button><button onClick={() => navigate("settings")}>Workspace settings</button></nav><form onSubmit={(event) => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("q"))); if (view !== "tasks" && view !== "pages") setView("tasks"); dialog.current?.close(); }}><label>Search record titles<input name="q" type="search" maxLength={100} placeholder="Type a title, then press Enter" /></label><button className="primary">Search</button></form><p className="small muted">Escape closes this palette. Search checks your current access.</p></dialog>
  </div>;
}
