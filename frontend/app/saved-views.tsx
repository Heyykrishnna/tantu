"use client";
import { useEffect, useState } from "react";
import {
  acknowledgment,
  api,
  choice,
  items,
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
export interface ViewSettings {
  mode: "list" | "board" | "table" | "timeline";
  sort: "title" | "deadline" | "priority";
  group: "none" | "status" | "priority";
  status: "all" | "open" | "done";
  columns: string[];
}
function settings(value: unknown): ViewSettings {
  const row = record(value);
  return {
    mode: choice(row.mode, ["list", "board", "table", "timeline"]),
    sort: choice(row.sort, ["title", "deadline", "priority"]),
    group: choice(row.group, ["none", "status", "priority"]),
    status: choice(row.status, ["all", "open", "done"]),
    columns: list(row.columns, string),
  };
}
function view(value: unknown) {
  const row = record(value);
  return {
    id: string(row.id),
    name: string(row.name),
    shared: row.ownerId === null,
    version: integer(row.version),
    settings: settings(row.settings),
  };
}
export default function SavedViews({
  workspaceId,
  kind,
  resourceId,
  csrf,
  current,
  onApply,
}: {
  workspaceId: string;
  kind: "project" | "collection";
  resourceId: string;
  csrf: string;
  current: ViewSettings;
  onApply: (value: ViewSettings) => void;
}) {
  const [views, setViews] = useState<ReturnType<typeof view>[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("My focus");
  const [shared, setShared] = useState(false);
  const path = `/workspaces/${workspaceId}/views/${kind}/${resourceId}`;
  useEffect(() => {
    const controller = new AbortController();
    api(path, items(view), { signal: controller.signal })
      .then(setViews)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error ? error.message : "Views unavailable.",
          );
      });
    return () => controller.abort();
  }, [path]);
  return (
    <details className="rounded-lg border border-[#dedfeb] p-3 dark:border-[#303032]">
      <summary className="cursor-pointer text-[11px] font-medium">
        Personal and shared views
      </summary>
      <div className="mt-3 grid gap-3">
        <Notice>{message}</Notice>
        <div className="flex flex-wrap gap-2">
          {views.map((value) => (
            <Button
              size="sm"
              key={value.id}
              onClick={() => onApply(value.settings)}
            >
              {value.name} · {value.shared ? "Shared" : "Personal"}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sort tasks">
            <select
              aria-label="Sort tasks"
              value={current.sort}
              onChange={(event) =>
                onApply({
                  ...current,
                  sort: choice(event.target.value, [
                    "title",
                    "deadline",
                    "priority",
                  ]),
                })
              }
              className={inputClass}
            >
              {["title", "deadline", "priority"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Group tasks">
            <select
              aria-label="Group tasks"
              value={current.group}
              onChange={(event) =>
                onApply({
                  ...current,
                  group: choice(event.target.value, [
                    "none",
                    "status",
                    "priority",
                  ]),
                })
              }
              className={inputClass}
            >
              {["none", "status", "priority"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Saved view name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              className={inputClass}
            />
          </Field>
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={shared}
              onChange={(event) => setShared(event.target.checked)}
            />
            Save as shared view
          </label>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px]">
          {["status", "priority", "deadline", "estimate"].map((column) => (
            <label key={column} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={current.columns.includes(column)}
                onChange={(event) =>
                  onApply({
                    ...current,
                    columns: event.target.checked
                      ? [...current.columns, column]
                      : current.columns.filter((value) => value !== column),
                  })
                }
              />
              {column}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          disabled={busy || !name.trim()}
          onClick={() => {
            setBusy(true);
            setMessage("");
            api(path, acknowledgment, {
              method: "POST",
              csrf,
              body: {
                name,
                shared,
                settings: current,
                expectedVersion:
                  views.find(
                    (value) => value.name === name && value.shared === shared,
                  )?.version ?? 0,
                operationId: crypto.randomUUID(),
              },
            })
              .then(() => api(path, items(view)))
              .then(setViews)
              .catch((error: unknown) =>
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "View could not save.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Save current view
        </Button>
        <p className={`text-[10px] ${mutedClass}`}>
          Personal views belong to you. Shared changes require edit access to
          the source.
        </p>
      </div>
    </details>
  );
}
