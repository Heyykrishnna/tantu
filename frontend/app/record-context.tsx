"use client";
import SourcePreviews from "./source-previews";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, page, items, record, string } from "../lib/api";
import type { CanonicalRecord } from "../lib/contracts";
import { context } from "../lib/knowledge";
import {
  Badge,
  Button,
  Field,
  Notice,
  inputClass,
  mutedClass,
} from "../components/ui";

export default function RecordContext({
  entry,
  workspaceId,
  csrf,
  onReload,
}: {
  entry: CanonicalRecord;
  workspaceId: string;
  csrf: string;
  onReload: () => void;
}) {
  const [data, setData] = useState<ReturnType<typeof context> | null>(null);
  const [sources, setSources] = useState<CanonicalRecord[]>([]);
  const [mentionOptions,setMentionOptions]=useState<{id:string;name:string}[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/workspaces/${workspaceId}/records/${entry.id}`;
  const load = useCallback(
    () => api(base + "/context", context).then(setData),
    [base],
  );
  useEffect(() => {
    const controller = new AbortController();
    api(base + "/context", context, { signal: controller.signal })
      .then(setData)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Related context is unavailable.",
          );
      });
    return () => controller.abort();
  }, [base]);
  useEffect(()=>{if(!entry.canEdit)return;const controller=new AbortController();api(base+"/mention-options",items(value=>{const row=record(value);return{id:string(row.id),name:string(row.name)};}),{signal:controller.signal}).then(setMentionOptions).catch((error:unknown)=>{if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:"Mention options unavailable.");});return()=>controller.abort();},[base,entry.canEdit]);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: "comments" | "relations" | "duplicate-page" | "restore-body",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const body =
        action === "comments"
          ? {
              body: String(fields.get("body")),
              mentions: fields.getAll("mentions").map(value=>String(value)).filter(Boolean),
            }
          : action === "relations"
            ? {
                targetId: String(fields.get("targetId")),
                type: String(fields.get("type")),
                linked: true,
              }
            : action === "duplicate-page"
              ? { title: String(fields.get("title")) }
              : {
                  revision: Number(fields.get("revision")),
                  expectedVersion: entry.version,
                };
      await api(base + "/" + action, acknowledgment, {
        method: "POST",
        csrf,
        body: { ...body, operationId: crypto.randomUUID() },
      });
      await load();
      form.reset();
      if (action === "restore-body") onReload();
      if (action === "duplicate-page")
        setMessage(
          "A new private page was created from this page’s body. Find it in Pages.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save context.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="border-t border-[#e6e8ef] pt-4 dark:border-[#303034]">
      <summary
        className="cursor-pointer text-[12px] font-medium"
        onClick={() => {
          if (!sources.length)
            Promise.all([
              api(`/workspaces/${workspaceId}/tasks?limit=50`, page),
              api(`/workspaces/${workspaceId}/pages?limit=50`, page),
            ])
              .then(([tasks, pages]) =>
                setSources([...tasks.items, ...pages.items]),
              )
              .catch((error: unknown) =>
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Sources could not load.",
                ),
              );
        }}
      >
        Connections and comments
      </summary>
      <div className="mt-4 grid gap-4">
        <Notice role="alert" tone="error">
          {message}
        </Notice>
        <SourcePreviews base={base} csrf={csrf} editable={entry.canEdit} sources={sources.filter(source=>source.id!==entry.id)}/>
        {data?.relations.map((relation) => (
          <p
            key={relation.sourceId + relation.targetId + relation.type}
            className="text-[11px]"
          >
            <Badge>{relation.type}</Badge>
            <span className="ml-2">{relation.title}</span>
          </p>
        ))}
        {entry.canEdit && (
          <form
            onSubmit={(event) => void submit(event, "relations")}
            className="grid gap-3"
          >
            <Field label="Connect an existing record">
              <select name="targetId" required className={inputClass}>
                <option value="">Choose a task or page (first 50 each)</option>
                {sources
                  .filter((source) => source.id !== entry.id && source.canEdit)
                  .map((source) => (
                    <option value={source.id} key={source.id}>
                      {source.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Relationship">
              <select name="type" className={inputClass}>
                <option value="related">Related</option>
                <option value="source">Source reference</option>
              </select>
            </Field>
            <Button type="submit" size="sm" disabled={busy}>
              Add connection
            </Button>
          </form>
        )}
        <h3 className="text-[12px] font-medium">Comments</h3>
        {data?.comments.map((comment) => (
          <article
            className="rounded-lg border border-[#e6e8ef] p-3 dark:border-[#303034]"
            key={comment.id}
          >
            <p className={`mb-2 text-[10px] ${mutedClass}`}>
              {comment.author} · {new Date(comment.createdAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap break-words text-[11px]">
              {comment.body}
            </p>
          </article>
        ))}
        {entry.canEdit && (
          <form
            onSubmit={(event) => void submit(event, "comments")}
            className="grid gap-3"
          >
            <Field label="Mention people with current source access"><select name="mentions" multiple className={inputClass} size={Math.min(4,Math.max(2,mentionOptions.length))}>{mentionOptions.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
            <Field label="Add a comment">
              <textarea
                name="body"
                required
                maxLength={4000}
                rows={3}
                className={inputClass}
              />
            </Field>
            <Button type="submit" size="sm" disabled={busy}>
              Post comment
            </Button>
          </form>
        )}
        {entry.kind === "page" && entry.canEdit && (
          <>
            <form
              onSubmit={(event) => void submit(event, "duplicate-page")}
              className="grid gap-3"
            >
              <Field label="New page from this template">
                <input
                  name="title"
                  required
                  maxLength={200}
                  placeholder="New page title"
                  className={inputClass}
                />
              </Field>
              <Button type="submit" size="sm" disabled={busy}>
                Create private page
              </Button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  window.confirm(
                    "Restore this body revision as a new collaborative edit? Current sharing and properties are preserved.",
                  )
                )
                  void submit(event, "restore-body");
              }}
              className="grid gap-3"
            >
              <Field label="Body revision to restore">
                <input
                  name="revision"
                  type="number"
                  min={1}
                  max={entry.version}
                  required
                  className={inputClass}
                />
              </Field>
              <Button type="submit" size="sm" disabled={busy}>
                Restore page body
              </Button>
            </form>
          </>
        )}
      </div>
    </details>
  );
}
