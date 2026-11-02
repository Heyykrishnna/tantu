"use client";

import { Select } from "@/components/ui/select";
import { Orb } from "../components/ui/orb";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CanonicalRecord, Document } from "../lib/contracts";
import {
  acknowledgment,
  api,
  ApiError,
  canonical,
  items,
  record,
  string,
} from "../lib/api";
import { TaskCoordination } from "./coordination-panel";
import WorkActions from "./work-actions";
import RecordContext from "./record-context";
import CollaborativeBody from "./collaborative-body";
import RecurrencePanel from "./recurrence-panel";
import FilePanel from "./file-panel";
import { Icon } from "../components/icon";
import { ConfirmMorph } from "@/components/ui/confirm-morph";
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

function toDocument(value: string): Document {
  return {
    type: "doc",
    content: value.split("\n").map((text) => ({
      type: text.startsWith("# ") ? "heading" : "paragraph",
      content: text ? [{ type: "text", text: text.replace(/^# /, "") }] : [],
    })),
  };
}

export default function RecordEditor({
  entry,
  kind,
  workspaceId,
  userId,
  csrf,
  onSaved,
  onClose,
  onNavigatePage,
}: {
  entry: CanonicalRecord | null;
  kind: "task" | "page";
  workspaceId: string;
  userId: string;
  csrf: string;
  onSaved: (entry?: CanonicalRecord) => void;
  onClose: () => void;
  onNavigatePage: (recordId?: string, parentId?: string) => void;
}) {
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
        if (
          (field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLSelectElement) &&
          typeof value === "string"
        )
          field.value = value;
      }
      if (
        typeof record(draft).__operationId === "string" &&
        typeof record(draft).__fingerprint === "string"
      )
        operation.current = {
          id: string(record(draft).__operationId),
          fingerprint: string(record(draft).__fingerprint),
        };
      if (draftNotice.current) draftNotice.current.hidden = false;
    } catch {
      if (draftNotice.current) {
        draftNotice.current.textContent =
          "Browser draft storage is unavailable. Keep this tab open until your save is confirmed.";
        draftNotice.current.hidden = false;
      }
    }
  }, [key]);

  function keepDraft() {
    if (!form.current) return;
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify(Object.fromEntries(new FormData(form.current))),
      );
    } catch {
      setMessage(
        "Browser draft storage is unavailable. Keep this tab open until your save is confirmed.",
      );
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const body = {
      title: String(data.get("title")),
      visibility: String(
        data.get("visibility") ?? entry?.visibility ?? "private",
      ),
      ...(kind === "task"
        ? {
            status: String(data.get("status")),
            priority: String(data.get("priority")),
            deadline: data.get("deadline") || null,
            estimateMinutes: data.get("estimate")
              ? Number(data.get("estimate"))
              : null,
          }
        : {
            ...(!entry ? { body: toDocument(String(data.get("body"))) } : {}),
            ...(!entry && data.get("parentId")
              ? { parentId: String(data.get("parentId")) }
              : {}),
          }),
      ...(entry ? { expectedVersion: entry.version } : {}),
    };
    const fingerprint = JSON.stringify(body);
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { fingerprint, id: crypto.randomUUID() };
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          ...Object.fromEntries(data),
          __operationId: operation.current.id,
          __fingerprint: fingerprint,
        }),
      );
      const saved = await api(path + (entry ? "/" + entry.id : ""), canonical, {
        method: entry ? "PATCH" : "POST",
        csrf,
        body: { ...body, operationId: operation.current.id },
      });
      sessionStorage.removeItem(key);
      operation.current = null;
      onSaved(saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
      setConflict(
        error instanceof ApiError && error.code === "VERSION_CONFLICT",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (!entry) return;
    if (
      !window.confirm(
        "Reload the current version and discard your unsaved browser draft?",
      )
    )
      return;
    try {
      const current = await api(path + "/" + entry.id, canonical);
      sessionStorage.removeItem(key);
      onSaved(current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reload failed.");
    }
  }
  async function remove(skipConfirm = false) {
    if (
      !entry ||
      (!skipConfirm &&
        !window.confirm(
          `Delete “${entry.title}”? Nested content will become unavailable.`,
        ))
    )
      return;
    setBusy(true);
    try {
      await api(path + "/" + entry.id, acknowledgment, {
        method: "DELETE",
        csrf,
        body: {
          operationId: crypto.randomUUID(),
          expectedVersion: entry.version,
        },
      });
      sessionStorage.removeItem(key);
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory() {
    if (!entry) return;
    try {
      setHistory(
        await api(
          path + "/" + entry.id + "/history",
          items(
            (value) =>
              "Version " +
              string(String(record(value).version)) +
              " · " +
              new Date(string(record(value).createdAt)).toLocaleString(),
          ),
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "History failed.");
    }
  }
  return (
    <section
      aria-label={entry ? "Record details" : `New ${kind}`}
      className={`${panelClass} order-1 overflow-hidden xl:sticky xl:top-21.25 xl:order-2 xl:max-h-[calc(100dvh-110px)] xl:overflow-y-auto`}
    >
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-zinc-200 px-5 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <Icon
            name={kind === "task" ? "tasks" : "pages"}
            className="size-4 text-zinc-500 dark:text-zinc-400"
          />
          <h2 className="text-[12px] font-medium">
            {entry ? "Record details" : `New ${kind}`}
          </h2>
          {entry && <Badge>v{entry.version}</Badge>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close record details"
        >
          <Icon name="close" className="size-4" />
        </Button>
      </header>
      <div className="grid gap-5 p-5">
        <p
          ref={draftNotice}
          hidden
          role="status"
          className="rounded-lg border border-zinc-200 bg-zinc-100 p-3 text-[11px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-850 dark:text-zinc-300"
        >
          Recovered your unsaved draft from this browser session.
        </p>
        {entry && !entry.canEdit && (
          <Notice>You have read-only access to this record.</Notice>
        )}
        <form ref={form} onSubmit={save} onChange={keepDraft}>
          <fieldset
            disabled={busy || (entry !== null && !entry.canEdit)}
            className="grid min-w-0 gap-4 disabled:opacity-65"
          >
            <Field label="Title">
              <input
                name="title"
                defaultValue={entry?.title ?? ""}
                placeholder={
                  kind === "task"
                    ? "What needs doing?"
                    : "Give your page a title"
                }
                required
                maxLength={200}
                autoFocus
                className={inputClass}
              />
            </Field>
            <Field label="Visibility">
              <Select
                aria-label="Visibility"
                name="visibility"
                disabled={entry !== null && entry.ownerId !== userId}
                defaultValue={entry?.visibility ?? "private"}
                className={inputClass}
              >
                <option value="private">Private — invited people only</option>
                <option value="workspace">Workspace — members can edit</option>
              </Select>
            </Field>
            {kind === "task" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <Select
                      aria-label="Status"
                      name="status"
                      defaultValue={entry?.status ?? "open"}
                      className={inputClass}
                    >
                      <option value="open">Open</option>
                      <option value="done">Complete</option>
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Select
                      aria-label="Priority"
                      name="priority"
                      defaultValue={entry?.priority ?? "normal"}
                      className={inputClass}
                    >
                      {["low", "normal", "high", "urgent"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Deadline">
                    <input
                      name="deadline"
                      type="date"
                      defaultValue={entry?.deadline ?? ""}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Estimate (minutes)">
                    <input
                      name="estimate"
                      type="number"
                      min={1}
                      max={10080}
                      defaultValue={entry?.estimateMinutes ?? ""}
                      placeholder="e.g. 30"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </>
            ) : (
              <>
                {!entry && (
                  <Field
                    label={
                      <span>
                        Parent page ID{" "}
                        <span
                          className={`ml-1 text-[10px] font-normal ${mutedClass}`}
                        >
                          optional
                        </span>
                      </span>
                    }
                  >
                    <input
                      name="parentId"
                      pattern="[0-9a-f-]{36}"
                      defaultValue={
                        new URLSearchParams(
                          typeof window === "undefined"
                            ? ""
                            : window.location.search,
                        ).get("parent") ?? ""
                      }
                      placeholder="Leave blank for a top-level page"
                      className={inputClass}
                    />
                  </Field>
                )}
                {!entry && (
                  <Field label="Page text">
                    <textarea
                      aria-label="Page text"
                      name="body"
                      rows={9}
                      maxLength={100000}
                      defaultValue=""
                      placeholder="Start writing. Use # for a heading."
                      className={`${inputClass} min-h-50 resize-y leading-7`}
                    />
                  </Field>
                )}
              </>
            )}
            <Notice tone="error" role="alert">
              {message}
            </Notice>
            {conflict && (
              <div className="grid gap-3 rounded-lg border border-amber-300/20 bg-amber-400/10 p-3 text-[11px] text-amber-800 dark:text-amber-200">
                <p>Your draft is kept in this browser session.</p>
                <Button size="sm" onClick={reload}>
                  Reload the current version
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <Button
                type="submit"
                variant="primary"
                disabled={busy || conflict}
              >
                {busy ? <Orb state="solving" size={20} display={16} theme="auto" interactive={false} /> : <Icon name="check" className="size-3.5" />}
                {busy ? "Saving…" : entry ? "Save changes" : `Create ${kind}`}
              </Button>
              {entry && (
                <ConfirmMorph
                  label="Delete"
                  prompt={`Delete “${entry.title}”?`}
                  onConfirm={() => remove(true)}
                  tone="danger"
                  disabled={busy}
                  className="ml-auto"
                />
              )}
            </div>
          </fieldset>
        </form>
        {entry?.kind === "page" && (
          <CollaborativeBody
            workspaceId={workspaceId}
            recordId={entry.id}
            userId={userId}
            csrf={csrf}
            canEdit={entry.canEdit}
          />
        )}
        {entry && (
          <>
            <section className="grid gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
              <h3 className={`${headingClass} text-[12px]`}>
                Record information
              </h3>
              <dl className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[10px]">
                <dt className={mutedClass}>Source</dt>
                <dd className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                  tantu
                </dd>
                <dt className={mutedClass}>Record ID</dt>
                <dd
                  className={`break-all font-mono leading-relaxed ${mutedClass}`}
                >
                  {entry.id}
                </dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                {entry.parentId && (
                  <Button
                    size="sm"
                    onClick={() => onNavigatePage(entry.parentId ?? undefined)}
                  >
                    <Icon name="folder" className="size-3.5" />
                    Open parent page
                  </Button>
                )}
                {entry.kind === "page" && entry.canEdit && (
                  <Button
                    size="sm"
                    onClick={() => onNavigatePage(undefined, entry.id)}
                  >
                    <Icon name="plus" className="size-3.5" />
                    Add nested page
                  </Button>
                )}
                <Button size="sm" onClick={loadHistory}>
                  <Icon name="history" className="size-3.5" />
                  View history
                </Button>
              </div>
              {history.length > 0 && (
                <ol
                  className={`grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[10px] dark:border-zinc-800 dark:bg-zinc-900/60 ${mutedClass}`}
                >
                  {history.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              )}
            </section>
            {entry.kind === "task" && (
              <RecurrencePanel
                workspaceId={workspaceId}
                taskId={entry.id}
                canEdit={entry.canEdit}
                csrf={csrf}
              />
            )}
            {entry.kind === "task" && entry.canEdit && (
              <>
                <TaskCoordination
                  workspaceId={workspaceId}
                  taskId={entry.id}
                  csrf={csrf}
                />
                <WorkActions
                  workspaceId={workspaceId}
                  csrf={csrf}
                  targets={[entry]}
                  onApplied={onClose}
                />
              </>
            )}
            <RecordContext
              entry={entry}
              workspaceId={workspaceId}
              csrf={csrf}
              onReload={() => {
                api(path + "/" + entry.id, canonical)
                  .then(onSaved)
                  .catch((error: unknown) =>
                    setMessage(
                      error instanceof Error ? error.message : "Reload failed.",
                    ),
                  );
              }}
            />
            <FilePanel
              workspaceId={workspaceId}
              recordId={entry.id}
              csrf={csrf}
              canEdit={entry.canEdit}
            />
            <p
              className={`flex items-start gap-2 text-[10px] leading-relaxed ${mutedClass}`}
            >
              <Icon name="shield" className="mt-0.5 size-3.5 text-zinc-400" />
              Sharing is managed through an explicit record invitation in
              Workspace settings.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
