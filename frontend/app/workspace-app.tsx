"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, ApiError, canonical, choice, items, page, record, session, string, workspace } from "../lib/api";
import type { User, Workspace } from "../lib/api";
import type { CanonicalRecord } from "../lib/contracts";
import MailPanel from "./mail-panel";
import CalendarPanel from "./calendar-panel";
import ProjectPanel from "./project-panel";
import SignIn from "./sign-in";
import RecordEditor from "./record-editor";
import WorkspaceSettings from "./workspace-settings";
import ActivityPanel from "./activity-panel";
import WorkspaceNavigation from "./workspace-navigation";
import type { WorkspaceView } from "./workspace-navigation";
import RecordList, { RecordOverview } from "./record-list";
import { Icon } from "../components/icon";
import { Brand, Button, Field, Notice, headingClass, inputClass, mutedClass, panelClass } from "../components/ui";

type View = WorkspaceView;
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
  const drawer = useRef<HTMLDialogElement>(null);
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
    if (initialView && ["tasks", "pages", "activity", "settings", "operations", "projects", "calendar", "mail"].includes(initialView)) setView(choice(initialView, ["tasks", "pages", "activity", "settings", "operations", "projects", "calendar", "mail"]));
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
    try { document.documentElement.dataset.theme = localStorage.getItem("tantu-theme") === "light" ? "light" : "dark"; } catch { document.documentElement.dataset.theme = "dark"; }
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
    dialog.current?.close(); drawer.current?.close();
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

  const viewTitle = { tasks: "Tasks", pages: "Pages", activity: "Activity", settings: "Workspace settings", operations: "Operations", projects: "Projects", calendar: "Calendar", mail: "Mail" }[view];
  const navigation = user ? <WorkspaceNavigation user={user} workspaces={workspaces} workspaceId={workspaceId} view={view} manager={manager} busy={busy} onNavigate={navigate} onCreateWorkspace={newWorkspace} onSearch={() => { drawer.current?.close(); dialog.current?.showModal(); }} onLogout={() => void logout()} /> : null;

  if (loading) return <main className="grid min-h-dvh place-content-center gap-5 px-6 text-center" role="status"><div className="mx-auto inline-flex items-center gap-2.5"><Brand /></div><div className={`flex items-center justify-center gap-2 text-[12px] ${mutedClass}`}><Icon name="refresh" className="size-3.5 motion-safe:animate-spin" />Opening your workspace…</div></main>;
  if (signedOut) return <SignIn onSignedIn={() => void authenticate()} />;
  if (!user) return <main className="mx-auto grid min-h-dvh max-w-md content-center gap-5 px-6"><div className="flex items-center gap-2.5"><Brand /></div><h1 className={`${headingClass} text-2xl`}>Your workspace is taking a moment.</h1><Notice tone="error" role="alert">{message}</Notice><Button onClick={() => void authenticate()}>Try again</Button></main>;
  return <div className="min-h-dvh lg:grid lg:grid-cols-[238px_minmax(0,1fr)]">
    <a className="fixed -top-20 left-4 z-50 rounded-lg bg-violet-500 px-4 py-2 text-white focus:top-4" href="#main-content">Skip to workspace</a>
    <aside className="sticky top-0 hidden h-dvh border-r border-[#dfe3ed] lg:block dark:border-[#2a2a2d]">{navigation}</aside>
    <dialog ref={drawer} aria-label="Workspace navigation drawer" className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[270px] max-w-[88vw] overflow-hidden border-0 bg-[#edf0f8] p-0 text-inherit backdrop:bg-black/55 backdrop:backdrop-blur-sm dark:bg-[#151516]">
      <WorkspaceNavigation user={user} workspaces={workspaces} workspaceId={workspaceId} view={view} manager={manager} busy={busy} onNavigate={navigate} onCreateWorkspace={newWorkspace} onSearch={() => { drawer.current?.close(); dialog.current?.showModal(); }} onLogout={() => void logout()} onClose={() => drawer.current?.close()} />
    </dialog>
    <main id="main-content" className="min-w-0">
      <header className="sticky top-0 z-20 flex h-[65px] items-center justify-between gap-3 border-b border-[#e1e4ed] bg-white/95 px-5 backdrop-blur-md lg:px-7 dark:border-[#2c2c2f] dark:bg-[#1c1c1d]/95">
        <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => drawer.current?.showModal()} aria-label="Open navigation"><Icon name="menu" /></Button><Icon name="panel" className="hidden size-4 text-[#727c8e] lg:block dark:text-[#777780]" /><span className="hidden h-4 w-px bg-[#e1e4ed] sm:block dark:bg-[#36363a]" /><span className={`hidden truncate text-[11px] sm:block ${mutedClass}`}>{currentWorkspace?.name ?? "Workspace"}</span><Icon name="right" className="hidden size-3 text-[#a0a7b4] sm:block dark:text-[#5c5c66]" /><span className="truncate text-[12px] font-medium">{viewTitle}</span></div>
        <div className="flex shrink-0 items-center gap-2"><button onClick={() => dialog.current?.showModal()} aria-label="Open command palette" className="mr-1 hidden h-8 w-[220px] items-center gap-2 rounded-lg border border-[#e1e4ed] bg-[#f8f9fc] px-2.5 text-left text-[11px] text-[#70798b] outline-none focus-visible:ring-2 focus-visible:ring-violet-400 xl:flex dark:border-[#343438] dark:bg-[#19191b] dark:text-[#94949e]"><Icon name="search" className="size-3.5" /><span className="flex-1">Search or jump to…</span><kbd className="rounded border border-[#e1e4ed] px-1 text-[9px] dark:border-[#36363b]">⌘K</kbd></button><Button variant="ghost" size="icon" aria-label="Toggle light and dark theme" onClick={() => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; try { localStorage.setItem("tantu-theme", theme); } catch { setNotice("Theme changed for this tab."); } }}><span className="hidden dark:inline-flex"><Icon name="sun" className="size-4" /></span><span className="inline-flex dark:hidden"><Icon name="moon" className="size-4" /></span></Button><span className="mx-1 h-5 w-px bg-[#e1e4ed] dark:bg-[#343438]" /><span title={user.name} aria-label={user.name} className="grid size-8 place-items-center rounded-full border border-violet-300/20 bg-[#e9e8fa] text-[10px] font-medium text-[#7167aa] dark:bg-[#2f2d46] dark:text-[#b9b1ed]">{user.name.slice(0, 2).toUpperCase()}</span></div>
      </header>
      <div className="mx-auto max-w-[1540px] px-5 pb-8 pt-7 sm:px-8 lg:px-9 lg:pt-9">
        <div className="mb-5 grid gap-2 empty:hidden"><Notice role="alert" tone="error">{message}</Notice><Notice tone="success">{notice}</Notice></div>
        {!currentWorkspace ? <section className={`${panelClass} mx-auto my-8 max-w-lg p-7 sm:p-10`}><span className="mb-6 inline-flex rounded-xl bg-violet-400/10 p-3 text-[#9c94e3]"><Icon name="folder" className="size-6" /></span><h1 className={`${headingClass} mb-3 text-[25px]`}>Make space for your work.</h1><p className={`mb-7 text-[12px] leading-relaxed ${mutedClass}`}>Create a workspace for your tasks and ideas. You decide what stays private and what you share.</p><form onSubmit={newWorkspace} className="grid gap-5"><Field label="Workspace name"><input name="name" required maxLength={100} placeholder="Personal workspace" className={inputClass} /></Field><Button type="submit" variant="primary" disabled={busy}>Create your workspace<Icon name="arrow" className="size-4" /></Button></form></section>
        : view === "settings" ? <WorkspaceSettings key={workspaceId} workspace={currentWorkspace} csrf={csrf} onJoined={() => void authenticate()} />
        : view === "mail" ? <MailPanel key={workspaceId} workspaceId={workspaceId} csrf={csrf} />
        : view === "calendar" ? <CalendarPanel key={workspaceId} workspaceId={workspaceId} csrf={csrf} onOpenTask={(id) => { navigate("tasks"); void open(id, "tasks"); }} />
        : view === "projects" ? <ProjectPanel key={workspaceId} workspaceId={workspaceId} userId={user.id} csrf={csrf} onOpenTask={(id) => { navigate("tasks"); void open(id, "tasks"); }} />
        : view === "activity" || view === "operations" ? <ActivityPanel key={workspaceId + view} workspaceId={workspaceId} csrf={csrf} operations={view === "operations"} /> : <>
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><div className="mb-2 flex items-center gap-2"><h1 className={`${headingClass} text-[25px] leading-tight`}>{view === "tasks" ? "My tasks" : "Your pages"}</h1><span className="rounded-md border border-[#dedff0] bg-[#f0effa] px-1.5 text-[10px] text-[#8c83bc] dark:border-[#3b364d] dark:bg-[#2b2838] dark:text-[#aca2e1]">{currentWorkspace.role}</span></div><p className={`text-[12px] ${mutedClass}`}>{view === "tasks" ? "A clear view of what’s next. One task at a time." : "Notes, plans, and the ideas that connect your work."}</p></div>{currentWorkspace.role !== "guest" && <Button variant="primary" aria-label={view === "tasks" ? "+ New task" : "+ New page"} onClick={() => { setSelected(null); setEditorOpen(true); setEditorVersion((value) => value + 1); window.history.replaceState(null, "", `/?w=${workspaceId}&view=${view}&new=1`); }}><Icon name="plus" className="size-4" />New {view === "tasks" ? "task" : "page"}</Button>}</header>
          <RecordOverview entries={entries} kind={view === "tasks" ? "task" : "page"} loading={loadingRecords} />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="inline-flex items-center gap-1 rounded-lg border border-[#e0e3ed] bg-[#edf0f7] p-1 dark:border-[#303034] dark:bg-[#242426]"><span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-[#535b77] shadow-xs dark:bg-[#343437] dark:text-[#ededf2]"><Icon name={view === "tasks" ? "tasks" : "pages"} className="size-3.5" />All {view}</span><span className={`px-2 text-[10px] ${mutedClass}`}>Current view</span></div><form className="flex w-full min-w-0 items-center gap-2 sm:w-auto" onSubmit={(event) => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("q"))); }}><label htmlFor="record-search" className="sr-only">Search {view}</label><div className="relative min-w-0 flex-1 sm:w-[220px]"><span className="pointer-events-none absolute top-2.5 left-2.5 text-[#70798b] dark:text-[#94949e]"><Icon name="search" className="size-3.5" /></span><input id="record-search" key={`${workspaceId}:${view}:${query}`} defaultValue={query} name="q" type="search" placeholder={`Search ${view}…`} maxLength={100} className={`${inputClass} py-2 pl-8`} /></div><Button type="submit" size="sm">Search</Button><Button variant="ghost" size="icon" aria-label="Refresh records" title="Refresh records" onClick={() => { setQuery(""); setListVersion((value) => value + 1); }}><Icon name="refresh" className="size-4" /></Button></form></div>
          <div className={editorOpen ? "grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]" : "min-w-0"}>
            <div className={editorOpen ? "order-2 min-w-0 xl:order-1" : "min-w-0"}><RecordList entries={entries} kind={view === "tasks" ? "task" : "page"} loading={loadingRecords} query={query} selectedId={selected?.id} cursor={cursor} busy={busy} guest={currentWorkspace.role === "guest"} onOpen={(id) => void open(id)} onMore={() => void more()} /></div>
            {editorOpen && <RecordEditor key={`${workspaceId}:${selected?.id ?? "new"}:${editorVersion}`} entry={selected} kind={view === "tasks" ? "task" : "page"} workspaceId={workspaceId} userId={user.id} csrf={csrf} onSaved={saved} onNavigatePage={(recordId, parentId) => { setView("pages"); setNotice(""); if (recordId) void open(recordId, "pages"); else { window.history.replaceState(null, "", `/?w=${workspaceId}&view=pages&new=1&parent=${parentId ?? ""}`); setSelected(null); setEditorOpen(true); setEditorVersion((value) => value + 1); } }} onClose={() => { setEditorOpen(false); setSelected(null); window.history.replaceState(null, "", `/?w=${workspaceId}&view=${view}`); }} />}
          </div>
          <div className={`mt-4 flex items-center justify-between gap-3 text-[10px] ${mutedClass}`}><span className="inline-flex items-center gap-1.5"><Icon name="shield" className="size-3" />Only records you can access are shown</span><span className="hidden sm:inline">⌘ K to find your way</span></div>
        </>}
      </div>
    </main>
    <dialog ref={dialog} aria-label="Command palette" className={`${panelClass} m-auto w-[460px] max-w-[calc(100vw-32px)] p-0 text-inherit shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm`}><header className="flex items-center justify-between border-b border-[#e3e6ef] px-5 py-4 dark:border-[#303034]"><h2 className="flex items-center gap-2.5 text-[13px] font-medium"><Icon name="search" className="size-4 text-[#9992df]" />Find your way</h2><Button variant="ghost" size="icon" onClick={() => dialog.current?.close()} aria-label="Close command palette"><Icon name="close" className="size-4" /></Button></header><nav aria-label="Quick navigation" className="grid gap-1 p-3">{([['tasks', 'Open Tasks'], ['pages', 'Open Pages'], ['settings', 'Workspace settings']] as const).map(([target, label]) => <Button key={target} variant="ghost" className="justify-start" onClick={() => navigate(target)}><Icon name={target} className="size-4" />{label}<span className="ml-auto opacity-50"><Icon name="arrow" className="size-3.5" /></span></Button>)}</nav><form className="grid gap-3 border-t border-[#e3e6ef] p-5 dark:border-[#303034]" onSubmit={(event) => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("q"))); if (view !== "tasks" && view !== "pages") setView("tasks"); dialog.current?.close(); }}><Field label="Search record titles"><input name="q" type="search" maxLength={100} placeholder="Type a title, then press Enter" className={inputClass} /></Field><Button type="submit" variant="primary">Search<Icon name="arrow" className="size-4" /></Button></form><p className={`border-t border-[#e3e6ef] px-5 py-3 text-[10px] dark:border-[#303034] ${mutedClass}`}>Escape to close · Your current access applies to every search</p></dialog>
  </div>;
}
