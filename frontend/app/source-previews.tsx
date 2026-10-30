"use client";
import { useEffect, useState } from "react";
import { acknowledgment, api, items, record, string } from "../lib/api";
import type { CanonicalRecord } from "../lib/contracts";
import { Button, Field, Notice, inputClass } from "../components/ui";
function preview(value: unknown) {
  const row = record(value);
  return {
    id: string(row.id),
    targetId: typeof row.targetId === "string" ? row.targetId : null,
    title: typeof row.title === "string" ? row.title : "Source unavailable",
    kind: typeof row.kind === "string" ? row.kind : "",
    status: typeof row.status === "string" ? row.status : "",
  };
}
export default function SourcePreviews({
  base,
  csrf,
  editable,
  sources,
}: {
  base: string;
  csrf: string;
  editable: boolean;
  sources: CanonicalRecord[];
}) {
  const [entries, setEntries] = useState<ReturnType<typeof preview>[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api(base + "/embeds", items(preview), { signal: controller.signal })
      .then(setEntries)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Source previews unavailable.",
          );
      });
    return () => controller.abort();
  }, [base]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setEntries(await api(base + "/embeds", items(preview)));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Source preview action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-3 rounded-lg border border-[#dedfeb] p-3 dark:border-[#303032]">
      <h3 className="text-xs font-medium">Live source previews</h3>
      {message && <Notice>{message}</Notice>}
      {entries.map((entry) => (
        <article
          key={entry.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded bg-violet-400/5 p-3 text-xs"
        >
          <div>
            <p>{entry.title}</p>
            <p className="mt-1 text-[10px] text-[#8b8b90]">
              {entry.targetId
                ? `${entry.kind} · ${entry.status}`
                : "This source was deleted or is no longer available to you."}
            </p>
          </div>
          {editable && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(base + `/embeds/${entry.id}`, acknowledgment, {
                    method: "DELETE",
                    csrf,
                    body: { operationId: crypto.randomUUID() },
                  });
                })
              }
            >
              Remove preview
            </Button>
          )}
        </article>
      ))}
      {editable && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(async () => {
              await api(base + "/embeds", acknowledgment, {
                method: "POST",
                csrf,
                body: {
                  targetId: String(form.get("targetId")),
                  operationId: crypto.randomUUID(),
                },
              });
            });
          }}
        >
          <Field label="Preview an existing source">
            <select className={inputClass} name="targetId" required>
              <option value="">Choose an accessible record</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" disabled={busy}>
            Add source preview
          </Button>
        </form>
      )}
      <Button
        disabled={busy}
        size="sm"
        onClick={() => void run(async () => {})}
      >
        Refresh source previews
      </Button>
    </section>
  );
}
