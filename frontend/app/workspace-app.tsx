"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { applyTheme } from "../lib/theme";
import { pollWhileVisible } from "../lib/visible-polling";
import type { FormEvent } from "react";
import {
  acknowledgment,
  api,
  ApiError,
  canonical,
  items,
  page,
  record,
  session,
  string,
  workspace,
} from "../lib/api";
import type { User, Workspace } from "../lib/api";
import type { CanonicalRecord } from "../lib/contracts";
import SignIn from "./sign-in";
import WorkspaceNavigation from "./workspace-navigation";
import { resolveView } from "../lib/navigation";
import type { WorkspaceView } from "../lib/navigation";
import WorkActions from "./work-actions";
import RecordList, { RecordOverview } from "./record-list";
import { Icon } from "../components/icon";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Orb } from "@/components/ui/orb";
import { Toaster, type ToastItem } from "@/components/ui/toaster";
import {
  Brand,
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";

const CollectionPanel = dynamic(() => import("./collection-panel"), { loading: PanelLoading });
const MailPanel = dynamic(() => import("./mail-panel"), { loading: PanelLoading });
const CalendarPanel = dynamic(() => import("./calendar-panel"), { loading: PanelLoading });
const ProjectPanel = dynamic(() => import("./project-panel"), { loading: PanelLoading });
const CapturePanel = dynamic(() => import("./capture-panel"), { loading: PanelLoading });
const PromisePanel = dynamic(() => import("./promise-panel"), { loading: PanelLoading });
const RulesPanel = dynamic(() => import("./rules-panel"), { loading: PanelLoading });
const DecisionPanel = dynamic(() => import("./decision-panel"), { loading: PanelLoading });
const ContextGraphPanel = dynamic(() => import("./context-graph-panel"), { loading: PanelLoading });
const PlanningPanel = dynamic(() => import("./planning-panel"), { loading: PanelLoading });
const KitsPanel = dynamic(() => import("./kits-panel"), { loading: PanelLoading });
const MeetingBriefsPanel = dynamic(() => import("./meeting-briefs-panel"), { loading: PanelLoading });
const IntegrationsPanel = dynamic(() => import("./integrations-panel"), { loading: PanelLoading });
const EnterprisePanel = dynamic(() => import("./enterprise-panel"), { loading: PanelLoading });
const FutureDiscoveryPanel = dynamic(() => import("./future-discovery-panel"), { loading: PanelLoading });
const SearchModal = dynamic(() => import("./search-modal"), { loading: PanelLoading });
const RecordEditor = dynamic(() => import("./record-editor"), { loading: PanelLoading });
const WorkspaceSettings = dynamic(() => import("./workspace-settings"), { loading: PanelLoading });
const ActivityPanel = dynamic(() => import("./activity-panel"), { loading: PanelLoading });
function PanelLoading() {
  return <div role="status" className="min-h-48 animate-pulse rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 motion-reduce:animate-none dark:border-zinc-800">Loading workspace view…</div>;
}

type View = WorkspaceView;
function forgetDrafts() {
  for (const key of Object.keys(sessionStorage))
    if (key.startsWith("tantu-draft:")) sessionStorage.removeItem(key);
}

export default function WorkspaceApp({
  initialView: initialViewProp,
}: {
  initialView?: WorkspaceView;
} = {}) {
  const [user, setUser] = useState<User | null>(null);
  const [csrf, setCsrf] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [view, setView] = useState<View>(() => {
    if (typeof window !== "undefined") {
      const url = new URLSearchParams(window.location.search);
      const queryView = resolveView(url.get("view"));
      if (queryView) return queryView;
      const pathView = resolveView(
        window.location.pathname.replace(/^\//, "").split("/")[0],
      );
      if (pathView) return pathView;
    }
    return initialViewProp ?? "tasks";
  });
  const [entries, setEntries] = useState<CanonicalRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<CanonicalRecord | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const toasts: ToastItem[] = [
    ...(message
      ? [
          {
            id: "msg",
            title: message,
            tone: "danger" as const,
          },
        ]
      : []),
    ...(notice
      ? [
          {
            id: "notice",
            title: notice,
            tone: "success" as const,
          },
        ]
      : []),
  ];
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const currentWorkspace = workspaces.find((item) => item.id === workspaceId);
  const manager =
    currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";

  const handleError = useCallback((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") return;
    setMessage(
      error instanceof Error
        ? error.message
        : "The request could not be completed.",
    );
    if (error instanceof ApiError && error.status === 401) {
      setUser(null);
      setSignedOut(true);
      setSelected(null);
      setEntries([]);
      setEditorOpen(false);
      try {
        forgetDrafts();
      } catch {
        setMessage("Sign in again. Browser draft storage is unavailable.");
      }
    }
  }, []);

  const acceptIdentity = useCallback(
    ([identity, spaces]: [ReturnType<typeof session>, Workspace[]]) => {
      setUser(identity.user);
      setCsrf(identity.csrf);
      setWorkspaces(spaces);
      setSignedOut(false);
      setMessage("");
      const url = new URLSearchParams(window.location.search);
      setWorkspaceId(
        spaces.find((item) => item.id === url.get("w"))?.id ??
          spaces[0]?.id ??
          "",
      );
      const pathView =
        typeof window !== "undefined"
          ? resolveView(
              window.location.pathname.replace(/^\//, "").split("/")[0],
            )
          : null;
      const inviteToken =
        url.get("invite") || url.get("invitation") || url.get("token");
      const targetView =
        (inviteToken ? "settings" : null) ??
        resolveView(url.get("view")) ??
        pathView ??
        initialViewProp;
      if (targetView) setView(targetView);
    },
    [initialViewProp],
  );
  const authenticationFailure = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) setSignedOut(true);
      else handleError(error);
    },
    [handleError],
  );
  const authenticate = useCallback(
    () =>
      Promise.all([
        api("/auth/session", session),
        api("/workspaces", items(workspace)),
      ])
        .then(acceptIdentity)
        .catch(authenticationFailure)
        .finally(() => setLoading(false)),
    [acceptIdentity, authenticationFailure],
  );
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api("/auth/session", session, { signal: controller.signal }),
      api("/workspaces", items(workspace), { signal: controller.signal }),
    ])
      .then(acceptIdentity)
      .catch(authenticationFailure)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [acceptIdentity, authenticationFailure]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchModalOpen(true);
      }
    };
    const handlePopState = () => {
      const url = new URLSearchParams(window.location.search);
      const pathView = resolveView(
        window.location.pathname.replace(/^\//, "").split("/")[0],
      );
      const targetView = resolveView(url.get("view")) ?? pathView;
      if (targetView) setView(targetView);
      const targetSpace = url.get("w");
      if (targetSpace) setWorkspaceId(targetSpace);
      const recordId = url.get("r");
      if (!recordId) {
        setSelected(null);
        setEditorOpen(false);
      }
    };
    window.addEventListener("popstate", handlePopState);
    try {
      applyTheme(localStorage.getItem("tantu-theme") === "light" ? "light" : "dark");
    } catch {
      applyTheme("dark");
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const open = useCallback(
    async (
      entryId: string,
      targetView: "tasks" | "pages" = view === "pages" ? "pages" : "tasks",
    ) => {
      try {
        const entry = await api(
          `/workspaces/${workspaceId}/${targetView}/${entryId}`,
          canonical,
        );
        setSelected(entry);
        setEditorOpen(true);
        setEditorVersion((value) => value + 1);
        setMessage("");
        const url = workspaceId
          ? `/${targetView}?w=${workspaceId}&r=${entry.id}`
          : `/${targetView}?r=${entry.id}`;
        window.history.pushState(null, "", url);
      } catch (error) {
        handleError(error);
      }
    },
    [workspaceId, view, handleError],
  );

  useEffect(() => {
    if (!workspaceId || !user || (view !== "tasks" && view !== "pages")) return;
    const controller = new AbortController();
    async function load() {
      setLoadingRecords(true);
      setEntries([]);
      try {
        const result = await api(
          `/workspaces/${workspaceId}/${view}?limit=25${query ? "&q=" + encodeURIComponent(query) : ""}`,
          page,
          { signal: controller.signal },
        );
        setEntries(result.items);
        setCursor(result.nextCursor);
        if (new URLSearchParams(window.location.search).get("new") === "1")
          setEditorOpen(true);
      } catch (error) {
        handleError(error);
      } finally {
        if (!controller.signal.aborted) setLoadingRecords(false);
      }
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
    api(`/workspaces/${workspaceId}/${view}/${id}`, canonical, {
      signal: controller.signal,
    })
      .then((entry) => {
        setSelected(entry);
        setEditorOpen(true);
      })
      .catch(handleError);
    return () => controller.abort();
  }, [workspaceId, view, user, handleError]);

  useEffect(() => {
    if (!workspaceId || !user) return;
    return pollWhileVisible(async (signal) => {
      try {
        const spaces = await api("/workspaces", items(workspace), {
          signal,
        });
        if (!spaces.some((item) => item.id === workspaceId)) {
          setWorkspaces(spaces);
          setWorkspaceId(spaces[0]?.id ?? "");
          setSelected(null);
          setEditorOpen(false);
          setEntries([]);
          setMessage("Workspace access was removed.");
          forgetDrafts();
        } else if (selected)
          await api(
            `/workspaces/${workspaceId}/${selected.kind === "task" ? "tasks" : "pages"}/${selected.id}`,
            canonical,
            { signal },
          );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setSelected(null);
          setEditorOpen(false);
          forgetDrafts();
        }
        handleError(error);
      }
    }, handleError, document, { immediate: false });
  }, [workspaceId, user, selected, handleError]);

  function navigate(target: View, space = workspaceId) {
    setView(target);
    setWorkspaceId(space);
    setEditorOpen(false);
    setSelected(null);
    setQuery("");
    setMessage("");
    setNotice("");
    const url = space ? `/${target}?w=${space}` : `/${target}`;
    window.history.pushState(null, "", url);
    dialog.current?.close();
    drawer.current?.close();
  }
  async function newWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const created = await api(
        "/workspaces",
        (value) => string(record(value).id),
        { method: "POST", csrf, body: { name: String(data.get("name")) } },
      );
      const spaceName = String(data.get("name") || "workspace");
      setWorkspaces(await api("/workspaces", items(workspace)));
      navigate("tasks", created);
      setNotice(`Workspace “${spaceName}” created successfully.`);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", acknowledgment, { method: "POST", csrf });
      forgetDrafts();
      setSignedOut(true);
      setUser(null);
      setEntries([]);
      setSelected(null);
      setEditorOpen(false);
      window.history.replaceState(null, "", "/");
    } catch (error) {
      handleError(error);
    }
  }
  async function more() {
    if (!cursor) return;
    setBusy(true);
    try {
      const result = await api(
        `/workspaces/${workspaceId}/${view}?cursor=${cursor}&limit=25${query ? "&q=" + encodeURIComponent(query) : ""}`,
        page,
      );
      setEntries((current) => [...current, ...result.items]);
      setCursor(result.nextCursor);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }
  function saved(entry?: CanonicalRecord) {
    setSelected(entry ?? null);
    setEditorOpen(!!entry);
    setEditorVersion((value) => value + 1);
    setListVersion((value) => value + 1);
    setNotice(entry ? "Saved. Your changes are stored." : "Record deleted.");
    const url = workspaceId
      ? `/${view}?w=${workspaceId}${entry ? "&r=" + entry.id : ""}`
      : `/${view}${entry ? "?r=" + entry.id : ""}`;
    window.history.replaceState(null, "", url);
  }

  const viewTitle = {
    tasks: "Tasks",
    pages: "Pages",
    capture: "Quick Capture",
    promises: "Promise Tracker",
    decisions: "Decisions",
    graph: "Context Graph",
    planning: "Plan My Day",
    kits: "Workspace Kits",
    meetings: "Meeting Briefs",
    integrations: "Integrations & APIs",
    enterprise: "Enterprise & Governance",
    discovery: "Future Discovery",
    rules: "Automation Rules",
    activity: "Activity",
    settings: "Workspace settings",
    operations: "Operations",
    projects: "Projects",
    calendar: "Calendar",
    mail: "Mail",
    collections: "Collections",
  }[view];
  const navigation = user ? (
    <WorkspaceNavigation
      user={user}
      workspaces={workspaces}
      workspaceId={workspaceId}
      view={view}
      manager={manager}
      busy={busy}
      onNavigate={navigate}
      onCreateWorkspace={newWorkspace}
      onSearch={() => {
        drawer.current?.close();
        setSearchModalOpen(true);
      }}
      onLogout={() => void logout()}
    />
  ) : null;

  if (loading)
    return (
      <main
        className="grid min-h-dvh place-content-center gap-5 px-6 text-center"
        role="status"
      >
        <div className="mx-auto inline-flex items-center gap-2.5">
          <Brand />
        </div>
        <div className="flex flex-col items-center justify-center gap-3">
          <Orb state="solving" size={64} display={48} />
          <p className={`text-xs font-medium ${mutedClass}`}>
            Preparing workspace session...
          </p>
        </div>
      </main>
    );
  if (signedOut) return <SignIn onSignedIn={() => void authenticate()} />;
  if (!user)
    return (
      <main className="mx-auto grid min-h-dvh max-w-md content-center gap-5 px-6">
        <div className="flex items-center gap-2.5">
          <Brand />
        </div>
        <h1 className={`${headingClass} text-2xl`}>
          Your workspace is taking a moment.
        </h1>
        <Notice tone="error" role="alert">
          {message}
        </Notice>
        <Button onClick={() => void authenticate()}>Try again</Button>
      </main>
    );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a
        className="fixed -top-20 left-4 z-50 rounded-lg bg-zinc-900 px-4 py-2 text-white shadow-md focus:top-4 dark:bg-zinc-100 dark:text-zinc-900"
        href="#main-content"
      >
        Skip to workspace
      </a>
      <aside className="sticky top-0 hidden h-dvh border-r border-zinc-200/80 lg:block dark:border-zinc-850">
        {navigation}
      </aside>
      <dialog
        ref={drawer}
        aria-label="Workspace navigation drawer"
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-64 max-w-[88vw] overflow-hidden border-0 bg-[#f8f9fa] p-0 text-inherit backdrop:bg-black/60 backdrop:backdrop-blur-sm dark:bg-[#0c0c0e]"
      >
        <WorkspaceNavigation
          user={user}
          workspaces={workspaces}
          workspaceId={workspaceId}
          view={view}
          manager={manager}
          busy={busy}
          onNavigate={navigate}
          onCreateWorkspace={newWorkspace}
          onSearch={() => {
            drawer.current?.close();
            dialog.current?.showModal();
          }}
          onLogout={() => void logout()}
          onClose={() => drawer.current?.close()}
        />
      </dialog>
      <main id="main-content" className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/80 px-4 sm:px-6 backdrop-blur-md lg:px-8 dark:border-zinc-850 dark:bg-[#0c0c0e]/80">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => drawer.current?.showModal()}
              aria-label="Open navigation"
            >
              <Icon name="menu" />
            </Button>
            <Icon
              name="panel"
              className="hidden size-4 text-zinc-400 lg:block dark:text-zinc-500"
            />
            <span className="hidden h-4 w-px bg-zinc-200 sm:block dark:bg-zinc-800" />
            <span
              className={`hidden truncate text-[11px] font-medium sm:block ${mutedClass}`}
            >
              {currentWorkspace?.name ?? "Workspace"}
            </span>
            <Icon
              name="right"
              className="hidden size-3 text-zinc-400 sm:block dark:text-zinc-600"
            />
            <span className="truncate text-[12px] font-medium text-zinc-900 dark:text-zinc-100">
              {viewTitle}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => dialog.current?.showModal()}
              aria-label="Open command palette"
              className="mr-1 hidden h-8.5 w-60 items-center gap-2 rounded-lg border border-zinc-200 bg-[#f4f4f6] px-2.5 text-left text-[11px] text-zinc-500 shadow-xs outline-none transition-colors hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-zinc-400 xl:flex dark:border-zinc-800 dark:bg-[#141416] dark:text-zinc-400 dark:hover:border-zinc-700"
            >
              <Icon name="search" className="size-3.5" />
              <span className="flex-1">Search or jump to…</span>
              <kbd className="rounded border border-zinc-200 px-1 text-[9px] font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle variant="circle" />
            <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
            <span
              title={user.name}
              aria-label={user.name}
              className="grid size-8 place-items-center rounded-full border border-zinc-300 bg-zinc-200 text-[10px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <div className="mx-auto max-w-[1540px] px-4 pb-8 pt-6 sm:px-6 lg:px-8">
          <div className="mb-5 grid gap-2 empty:hidden">
            <Notice role="alert" tone="error">
              {message}
            </Notice>
            <Notice tone="success">{notice}</Notice>
          </div>
          {!currentWorkspace ? (
            <section
              className={`${panelClass} mx-auto my-8 max-w-lg p-7 sm:p-10`}
            >
              <span className="mb-6 inline-flex rounded-xl border border-zinc-200 bg-zinc-100 p-3 text-zinc-800 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <Icon name="folder" className="size-6" />
              </span>
              <h1 className={`${headingClass} mb-3 text-[25px]`}>
                Make space for your work.
              </h1>
              <p className={`mb-7 text-[12px] leading-relaxed ${mutedClass}`}>
                Create a workspace for your tasks and ideas. You decide what
                stays private and what you share.
              </p>
              <form onSubmit={newWorkspace} className="grid gap-5">
                <Field label="Workspace name">
                  <input
                    name="name"
                    required
                    maxLength={100}
                    placeholder="Personal workspace"
                    className={inputClass}
                  />
                </Field>
                <Button type="submit" variant="primary" disabled={busy}>
                  Create your workspace
                  <Icon name="arrow" className="size-4" />
                </Button>
              </form>
            </section>
          ) : view === "settings" ? (
            <WorkspaceSettings
              key={workspaceId}
              workspace={currentWorkspace}
              csrf={csrf}
              currentUser={user}
              onJoined={() => void authenticate()}
              onWorkspaceRenamed={(newName) => {
                setWorkspaces((prev) =>
                  prev.map((w) =>
                    w.id === workspaceId ? { ...w, name: newName } : w,
                  ),
                );
              }}
              onWorkspaceLeft={() => void authenticate()}
            />
          ) : view === "collections" ? (
            <CollectionPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
              onOpen={(id, kind) => {
                const target = kind === "task" ? "tasks" : "pages";
                navigate(target);
                void open(id, target);
              }}
            />
          ) : view === "mail" ? (
            <MailPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "calendar" ? (
            <CalendarPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
              onOpenTask={(id) => {
                navigate("tasks");
                void open(id, "tasks");
              }}
            />
          ) : view === "projects" ? (
            <ProjectPanel
              key={workspaceId}
              workspaceId={workspaceId}
              userId={user.id}
              csrf={csrf}
              onOpenTask={(id) => {
                navigate("tasks");
                void open(id, "tasks");
              }}
            />
          ) : view === "capture" ? (
            <CapturePanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
              onTaskCreated={(id) => {
                navigate("tasks");
                void open(id, "tasks");
              }}
            />
          ) : view === "promises" ? (
            <PromisePanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
              currentUserId={user.id}
            />
          ) : view === "decisions" ? (
            <DecisionPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "graph" ? (
            <ContextGraphPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "planning" ? (
            <PlanningPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "kits" ? (
            <KitsPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "meetings" ? (
            <MeetingBriefsPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "integrations" ? (
            <IntegrationsPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "enterprise" ? (
            <EnterprisePanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "discovery" ? (
            <FutureDiscoveryPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "rules" ? (
            <RulesPanel
              key={workspaceId}
              workspaceId={workspaceId}
              csrf={csrf}
            />
          ) : view === "activity" || view === "operations" ? (
            <ActivityPanel
              key={workspaceId + view}
              workspaceId={workspaceId}
              csrf={csrf}
              operations={view === "operations"}
            />
          ) : (
            <>
              <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <h1 className={`${headingClass} text-[24px] leading-tight`}>
                      {view === "tasks" ? "My tasks" : "Your pages"}
                    </h1>
                    <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 uppercase dark:border-zinc-800 dark:bg-zinc-850 dark:text-zinc-300">
                      {currentWorkspace.role}
                    </span>
                  </div>
                  <p className={`text-[12px] ${mutedClass}`}>
                    {view === "tasks"
                      ? "A clear view of what’s next. One task at a time."
                      : "Notes, plans, and the ideas that connect your work."}
                  </p>
                </div>
                {currentWorkspace.role !== "guest" && (
                  <Button
                    variant="primary"
                    aria-label={view === "tasks" ? "+ New task" : "+ New page"}
                    onClick={() => {
                      setSelected(null);
                      setEditorOpen(true);
                      setEditorVersion((value) => value + 1);
                      const url = workspaceId
                        ? `/${view}?w=${workspaceId}&new=1`
                        : `/${view}?new=1`;
                      window.history.replaceState(null, "", url);
                    }}
                  >
                    <Icon name="plus" className="size-4" />
                    New {view === "tasks" ? "task" : "page"}
                  </Button>
                )}
              </header>
              {view === "tasks" && (
                <WorkActions
                  workspaceId={workspaceId}
                  csrf={csrf}
                  targets={entries.filter((entry) => entry.canEdit)}
                  onApplied={() => setListVersion((value) => value + 1)}
                />
              )}
              <RecordOverview
                entries={entries}
                kind={view === "tasks" ? "task" : "page"}
                loading={loadingRecords}
              />
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100">
                    <Icon
                      name={view === "tasks" ? "tasks" : "pages"}
                      className="size-3.5"
                    />
                    All {view}
                  </span>
                  <span className={`px-2 text-[10px] ${mutedClass}`}>
                    Current view
                  </span>
                </div>
                <form
                  className="flex w-full min-w-0 items-center gap-2 sm:w-auto"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setQuery(
                      String(new FormData(event.currentTarget).get("q")),
                    );
                  }}
                >
                  <label htmlFor="record-search" className="sr-only">
                    Search {view}
                  </label>
                  <div className="relative min-w-0 flex-1 sm:w-60">
                    <span className="pointer-events-none absolute top-2.5 left-2.5 text-zinc-400 dark:text-zinc-500">
                      <Icon name="search" className="size-3.5" />
                    </span>
                    <input
                      id="record-search"
                      key={`${workspaceId}:${view}:${query}`}
                      defaultValue={query}
                      name="q"
                      type="search"
                      placeholder={`Search ${view}…`}
                      maxLength={100}
                      className={`${inputClass} py-1.5 pl-8`}
                    />
                  </div>
                  <Button type="submit" size="sm">
                    Search
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Refresh records"
                    title="Refresh records"
                    onClick={() => {
                      setQuery("");
                      setListVersion((value) => value + 1);
                    }}
                  >
                    <Icon name="refresh" className="size-4" />
                  </Button>
                </form>
              </div>
              <div
                className={
                  editorOpen
                    ? "grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"
                    : "min-w-0"
                }
              >
                <div
                  className={
                    editorOpen ? "order-2 min-w-0 xl:order-1" : "min-w-0"
                  }
                >
                  <RecordList
                    entries={entries}
                    kind={view === "tasks" ? "task" : "page"}
                    loading={loadingRecords}
                    query={query}
                    selectedId={selected?.id}
                    cursor={cursor}
                    busy={busy}
                    guest={currentWorkspace.role === "guest"}
                    onOpen={(id) => void open(id)}
                    onMore={() => void more()}
                  />
                </div>
                {editorOpen && (
                  <RecordEditor
                    key={`${workspaceId}:${selected?.id ?? "new"}:${editorVersion}`}
                    entry={selected}
                    kind={view === "tasks" ? "task" : "page"}
                    workspaceId={workspaceId}
                    userId={user.id}
                    csrf={csrf}
                    onSaved={saved}
                    onNavigatePage={(recordId, parentId) => {
                      setView("pages");
                      setNotice("");
                      if (recordId) void open(recordId, "pages");
                      else {
                        window.history.replaceState(
                          null,
                          "",
                          `/?w=${workspaceId}&view=pages&new=1&parent=${parentId ?? ""}`,
                        );
                        setSelected(null);
                        setEditorOpen(true);
                        setEditorVersion((value) => value + 1);
                      }
                    }}
                    onClose={() => {
                      setEditorOpen(false);
                      setSelected(null);
                      window.history.replaceState(
                        null,
                        "",
                        `/?w=${workspaceId}&view=${view}`,
                      );
                    }}
                  />
                )}
              </div>
              <div
                className={`mt-4 flex items-center justify-between gap-3 text-[10px] ${mutedClass}`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="shield" className="size-3" />
                  Only records you can access are shown
                </span>
                <span className="hidden sm:inline">⌘ K to find your way</span>
              </div>
            </>
          )}
        </div>
      </main>
      <dialog
        ref={dialog}
        aria-label="Command palette"
        className={`${panelClass} m-auto w-120 max-w-[calc(100vw-32px)] p-0 text-inherit shadow-2xl dark:shadow-black/70 backdrop:bg-black/60 backdrop:backdrop-blur-sm`}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <h2 className="flex items-center gap-2.5 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
            <Icon name="search" className="size-4 text-zinc-400" />
            Find your way
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dialog.current?.close()}
            aria-label="Close command palette"
          >
            <Icon name="close" className="size-4" />
          </Button>
        </header>
        <nav aria-label="Quick navigation" className="grid gap-1 p-3">
          {(
            [
              ["tasks", "Open Tasks"],
              ["pages", "Open Pages"],
              ["settings", "Workspace settings"],
            ] as const
          ).map(([target, label]) => (
            <Button
              key={target}
              variant="ghost"
              className="justify-start hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
              onClick={() => navigate(target)}
            >
              <Icon name={target} className="size-4" />
              {label}
              <span className="ml-auto opacity-50">
                <Icon name="arrow" className="size-3.5" />
              </span>
            </Button>
          ))}
        </nav>
        <form
          className="grid gap-3 border-t border-zinc-200 p-5 dark:border-zinc-800"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(String(new FormData(event.currentTarget).get("q")));
            if (view !== "tasks" && view !== "pages") setView("tasks");
            dialog.current?.close();
          }}
        >
          <Field label="Search record titles">
            <input
              name="q"
              type="search"
              maxLength={100}
              placeholder="Type a title, then press Enter"
              className={inputClass}
            />
          </Field>
          <Button type="submit" variant="primary">
            Search
            <Icon name="arrow" className="size-4" />
          </Button>
        </form>
        <p
          className={`border-t border-zinc-200 px-5 py-3 text-[10px] dark:border-zinc-800 ${mutedClass}`}
        >
          Escape to close · Your current access applies to every search
        </p>
      </dialog>
      {searchModalOpen && <SearchModal
        key={workspaceId}
        isOpen={searchModalOpen}
        workspaceId={workspaceId}
        onClose={() => setSearchModalOpen(false)}
        onSelectResult={(targetType, recordId) => {
          if (targetType === "task") {
            navigate("tasks");
            void open(recordId, "tasks");
          } else if (targetType === "page") {
            navigate("pages");
            void open(recordId, "pages");
          } else if (targetType === "project") {
            navigate("projects");
          } else if (targetType === "promise") {
            navigate("promises");
          }
        }}
      />}
      <Toaster
        items={toasts}
        onDismiss={(id) => {
          if (id === "msg") setMessage("");
          if (id === "notice") setNotice("");
        }}
      />
    </div>
  );
}
