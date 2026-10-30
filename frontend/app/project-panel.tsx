"use client";
import ProjectTaskViews from "./project-task-views";
import SavedViews from "./saved-views";
import type { ViewSettings } from "./saved-views";
import ProjectCoordination from "./coordination-panel";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, choice, page } from "../lib/api";
import { projectDetail, projects } from "../lib/projects";
import type { CanonicalRecord } from "../lib/contracts";
import {
  Badge,
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";

type Mode = "list" | "board" | "table" | "timeline";
export default function ProjectPanel({
  workspaceId,
  userId,
  csrf,
  onOpenTask,
}: {
  workspaceId: string;
  userId: string;
  csrf: string;
  onOpenTask: (id: string) => void;
}) {
  const [entries, setEntries] = useState<ReturnType<typeof projects>>({
    items: [],
    nextCursor: null,
  });
  const [detail, setDetail] = useState<ReturnType<typeof projectDetail> | null>(
    null,
  );
  const [tasks, setTasks] = useState<CanonicalRecord[]>([]);
  const [preferences,setPreferences]=useState<Omit<ViewSettings,"mode"|"status">>({sort:"title",group:"none",columns:["status","priority","deadline","estimate"]});
  const [mode, setMode] = useState<Mode>("list");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const base = `/workspaces/${workspaceId}/projects`;
  const load = useCallback(
    async (id?: string) => {
      const listing = await api(base, projects);
      setEntries(listing);
      if (id) setDetail(await api(base + "/" + id, projectDetail));
      const available = await api(
        `/workspaces/${workspaceId}/tasks?limit=50`,
        page,
      );
      setTasks(available.items);
    },
    [base, workspaceId],
  );
  useEffect(() => {
    const controller = new AbortController();
    api(base, projects, { signal: controller.signal })
      .then(setEntries)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error ? error.message : "Could not load projects.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base]);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: "create" | "link" | "dependency" | "update",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      if (action === "create" || action === "update")
        await api(
          base + (action === "update" && detail ? "/" + detail.project.id : ""),
          acknowledgment,
          {
            method: action === "update" ? "PATCH" : "POST",
            csrf,
            body: {
              operationId: crypto.randomUUID(),
              title: String(data.get("title")),
              visibility: String(data.get("visibility")),
              state: String(data.get("state")),
              deadline: data.get("deadline") || null,
              ...(action === "update" && detail
                ? { expectedVersion: detail.project.version }
                : {}),
            },
          },
        );
      else if (action === "link" && detail)
        await api(base + "/" + detail.project.id + "/tasks", acknowledgment, {
          method: "POST",
          csrf,
          body: {
            operationId: crypto.randomUUID(),
            expectedVersion: detail.project.version,
            taskId: String(data.get("taskId")),
            linked: true,
          },
        });
      else if (action === "dependency")
        await api(`/workspaces/${workspaceId}/dependencies`, acknowledgment, {
          method: "POST",
          csrf,
          body: {
            operationId: crypto.randomUUID(),
            prerequisiteId: String(data.get("prerequisiteId")),
            dependentId: String(data.get("dependentId")),
            linked: true,
          },
        });
      await load(detail?.project.id);
      if (action !== "update") form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save changes.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function select(id: string) {
    setBusy(true);
    setMessage("");
    try {
      await load(id);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Project is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visible =
    detail?.items.filter(
      (task) => filter === "all" || task.status === filter,
    ) ?? [];
  return (
    <section className="grid gap-5">
      <header>
        <h1 className={`${headingClass} text-2xl`}>Projects</h1>
        <p className={`mt-2 text-[12px] ${mutedClass}`}>
          Connect your work. Every view opens the same canonical task.
        </p>
      </header>
      <Notice tone="error" role="alert">
        {message}
      </Notice>
      <details className={`${panelClass} p-4`}>
        <summary className="cursor-pointer text-[12px] font-medium">
          New project
        </summary>
        <form
          onSubmit={(event) => void submit(event, "create")}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <Field label="Project title">
            <input
              name="title"
              required
              maxLength={200}
              className={inputClass}
            />
          </Field>
          <Field label="Visibility">
            <select aria-label="Visibility" name="visibility" className={inputClass}>
              <option value="private">Private</option>
              <option value="workspace">Workspace</option>
            </select>
          </Field>
          <Field label="Project status">
            <select aria-label="Project status" name="state" className={inputClass}>
              {["planning", "active", "at-risk", "completed", "archived"].map(
                (state) => (
                  <option key={state}>{state}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Project deadline">
            <input name="deadline" type="date" className={inputClass} />
          </Field>
          <Button type="submit" disabled={busy}>
            Create project
          </Button>
        </form>
      </details>
      <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className={`${panelClass} grid gap-2 p-3`} aria-label="Projects">
          {loading ? (
            <p role="status" className="p-3 text-[12px]">
              Loading projects…
            </p>
          ) : !entries.items.length ? (
            <p className={`p-3 text-[12px] ${mutedClass}`}>
              Create your first project to organize tasks.
            </p>
          ) : (
            entries.items.map((item) => (
              <button
                key={item.id}
                onClick={() => void select(item.id)}
                aria-pressed={detail?.project.id === item.id}
                className={`rounded-lg p-3 text-left text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${detail?.project.id === item.id ? "bg-violet-400/15" : "hover:bg-violet-400/5"}`}
              >
                <span className="mb-2 block truncate font-medium">
                  {item.title}
                </span>
                <Badge>{item.state}</Badge>
              </button>
            ))
          )}
          {entries.nextCursor && (
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                api(base + "?cursor=" + entries.nextCursor, projects)
                  .then((next) =>
                    setEntries({
                      items: [...entries.items, ...next.items],
                      nextCursor: next.nextCursor,
                    }),
                  )
                  .catch((error: unknown) =>
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Could not load projects.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              More projects
            </Button>
          )}
        </aside>
        {detail ? (
          <div className="grid min-w-0 gap-4">
            <header className={`${panelClass} p-5`}>
              <h2 className={`${headingClass} text-xl`}>
                {detail.project.title}
              </h2>
              <div className="mt-3 flex flex-wrap gap-3 text-[12px]">
                <Badge>{detail.project.state}</Badge>
                <span>
                  {detail.done} of {detail.total} completed
                </span>
                <span className={mutedClass}>
                  {detail.estimated} estimated · {detail.minutes} minutes
                </span>
              </div>
              <p className={`mt-3 text-[10px] ${mutedClass}`}>
                Rollup covers tasks you can currently access. Unestimated work
                has no inferred duration.
                {detail.truncated ? " First 500 tasks shown." : ""}
              </p>
            </header>
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Project views"
            >
              {(["list", "board", "table", "timeline"] as const).map((item) => (
                <Button
                  key={item}
                  variant={mode === item ? "primary" : "secondary"}
                  onClick={() => setMode(item)}
                  aria-pressed={mode === item}
                >
                  {item}
                </Button>
              ))}
              <label className="ml-auto flex items-center gap-2 text-[11px]">
                Status
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(
                      choice(event.target.value, ["all", "open", "done"]),
                    )
                  }
                  className={inputClass}
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="done">Done</option>
                </select>
              </label>
            </div>
            <SavedViews workspaceId={workspaceId} kind="project" resourceId={detail.project.id} csrf={csrf} current={{...preferences,mode,status:filter === "open" ? "open" : filter === "done" ? "done" : "all"}} onApply={value=>{setMode(value.mode);setFilter(value.status);setPreferences({sort:value.sort,group:value.group,columns:value.columns});}}/>
            <ProjectTaskViews tasks={visible} settings={{...preferences,mode,status:filter === "open" ? "open" : filter === "done" ? "done" : "all"}} onOpen={onOpenTask}/>
            {detail.project.canEdit && (
              <details className={`${panelClass} p-4`}>
                <summary className="cursor-pointer text-[12px] font-medium">
                  Manage project and task links
                </summary>
                <ProjectCoordination workspaceId={workspaceId} projectId={detail.project.id} csrf={csrf} owner={detail.project.ownerId===userId} />
                <form
                  onSubmit={(event) => void submit(event, "update")}
                  key={detail.project.version}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <Field label="Title">
                    <input
                      name="title"
                      defaultValue={detail.project.title}
                      required
                      maxLength={200}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Status">
                    <select aria-label="Status"
                      name="state"
                      defaultValue={detail.project.state}
                      className={inputClass}
                    >
                      {[
                        "planning",
                        "active",
                        "at-risk",
                        "completed",
                        "archived",
                      ].map((state) => (
                        <option key={state}>{state}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Visibility">
                    <select aria-label="Visibility"
                      name="visibility"
                      defaultValue={detail.project.visibility}
                      className={inputClass}
                    >
                      <option value="private">Private</option>
                      <option value="workspace">Workspace</option>
                    </select>
                  </Field>
                  <Field label="Deadline">
                    <input
                      name="deadline"
                      type="date"
                      defaultValue={detail.project.deadline ?? ""}
                      className={inputClass}
                    />
                  </Field>
                  <Button type="submit" disabled={busy}>
                    Save project
                  </Button>
                </form>
                <form
                  onSubmit={(event) => void submit(event, "link")}
                  className="mt-5 flex flex-wrap items-end gap-3"
                >
                  <Field label="Existing task (first 50)">
                    <select aria-label="Existing task (first 50)" name="taskId" required className={inputClass}>
                      <option value="">Select task</option>
                      {tasks
                        .filter((task) => task.canEdit)
                        .map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Button type="submit" disabled={busy}>
                    Link task
                  </Button>
                </form>
                <form
                  onSubmit={(event) => void submit(event, "dependency")}
                  className="mt-5 flex flex-wrap items-end gap-3"
                >
                  <Field label="Prerequisite">
                    <select aria-label="Prerequisite"
                      name="prerequisiteId"
                      required
                      className={inputClass}
                    >
                      <option value="">Select task</option>
                      {detail.items
                        .filter((task) => task.canEdit)
                        .map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Dependent task">
                    <select aria-label="Dependent task" name="dependentId" required className={inputClass}>
                      <option value="">Select task</option>
                      {detail.items
                        .filter((task) => task.canEdit)
                        .map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Button type="submit" disabled={busy}>
                    Add dependency
                  </Button>
                </form>
                <p className={`mt-3 text-[10px] ${mutedClass}`}>
                  {detail.dependencies.length} visible dependencies. Linking a
                  task never changes its permissions.
                </p>
              </details>
            )}
          </div>
        ) : (
          <p className={`${panelClass} p-8 text-[12px]`}>
            Select a project to see its tasks and progress.
          </p>
        )}
      </div>
    </section>
  );
}
