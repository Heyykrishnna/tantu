"use client";

import { Select } from "@/components/ui/select";
import { LoadingState } from "../components/ui/loading-state";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api } from "../lib/api";
import { recurrence } from "../lib/scheduling";
import {
  Button,
  Field,
  Notice,
  inputClass,
  mutedClass,
} from "../components/ui";

export default function RecurrencePanel({
  workspaceId,
  taskId,
  canEdit,
  csrf,
}: {
  workspaceId: string;
  taskId: string;
  canEdit: boolean;
  csrf: string;
}) {
  const [data, setData] = useState<ReturnType<typeof recurrence> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(10);
  const path = `/workspaces/${workspaceId}/tasks/${taskId}/recurrence`;
  const load = useCallback(() => api(path, recurrence).then(setData), [path]);
  useEffect(() => {
    const controller = new AbortController();
    api(path, recurrence, { signal: controller.signal })
      .then(setData)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load recurrence.",
          );
      });
    return () => controller.abort();
  }, [path]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const start = String(form.get("start")).replace(/[-:]/g, "") + "00";
      await api(path, acknowledgment, {
        method: "POST",
        csrf,
        body: {
          operationId: crypto.randomUUID(),
          timezone: String(form.get("timezone")),
          rule: `DTSTART:${start}\nRRULE:FREQ=${String(form.get("frequency"))};COUNT=${String(form.get("count"))}`,
        },
      });
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save recurrence.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resolve(instant: string, action: "skip" | "materialize") {
    setBusy(true);
    try {
      await api(path + "/occurrences", acknowledgment, {
        method: "POST",
        csrf,
        body: { operationId: crypto.randomUUID(), instant, action },
      });
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not resolve occurrence.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="border-t border-[#e6e8ef] pt-4 dark:border-[#303034]">
      <summary className="cursor-pointer text-[12px] font-medium">
        Recurring task
      </summary>
      <div className="mt-4 grid gap-3">
        <Notice tone="error" role="alert">
          {message}
        </Notice>
        {!data ? (
          <LoadingState label="Loading recurrence…" />
        ) : data.id ? (
          <>
            {canEdit && (
              <form
                key={data.version}
                className="grid gap-3 rounded-lg border border-[#dedfeb] p-3 dark:border-[#303032]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  setBusy(true);
                  api(path, acknowledgment, {
                    method: "PATCH",
                    csrf,
                    body: {
                      rule: String(form.get("rule")),
                      timezone: String(form.get("timezone")),
                      expectedVersion: data.version,
                      operationId: crypto.randomUUID(),
                    },
                  })
                    .then(load)
                    .catch((error: unknown) =>
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Recurrence edit failed.",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <Field label="Recurrence definition">
                  <textarea
                    name="rule"
                    defaultValue={data.rule}
                    maxLength={1000}
                    required
                    rows={3}
                    className={inputClass}
                  />
                </Field>
                <Field label="Recurrence timezone">
                  <input
                    name="timezone"
                    defaultValue={data.timezone}
                    required
                    className={inputClass}
                  />
                </Field>
                <p className="text-[10px] text-[#8b8b90]">
                  Changes future unresolved occurrences. Previously materialized
                  or skipped occurrences remain in history.
                </p>
                <Button type="submit" disabled={busy}>
                  Save recurrence definition
                </Button>
              </form>
            )}
            <p className={`text-[10px] ${mutedClass}`}>
              {data.timezone} · Each occurrence becomes a separate private task.
              Your source task stays unchanged.
            </p>
            {data.instants.slice(0, limit).map((instant) => {
              const result = data.items.find(
                (item) => Date.parse(item.instant) === Date.parse(instant),
              );
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e6e8ef] py-2 text-[10px] dark:border-[#303034]"
                  key={instant}
                >
                  <time>
                    {new Date(instant).toLocaleString(undefined, {
                      timeZone: data.timezone,
                    })}
                  </time>
                  {result ? (
                    <span>{result.state}</span>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy || !canEdit}
                        onClick={() => void resolve(instant, "materialize")}
                      >
                        Create task
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy || !canEdit}
                        onClick={() => void resolve(instant, "skip")}
                      >
                        Skip
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {limit < data.instants.length && (
              <Button size="sm" onClick={() => setLimit((value) => value + 10)}>
                More occurrences
              </Button>
            )}
          </>
        ) : canEdit ? (
          <form onSubmit={(event) => void create(event)} className="grid gap-3">
            <Field label="First occurrence (local)">
              <input
                name="start"
                type="datetime-local"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Recurrence timezone">
              <input
                name="timezone"
                defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
                required
                maxLength={100}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Repeat">
                <Select
                  aria-label="Repeat"
                  name="frequency"
                  className={inputClass}
                >
                  {["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].map((frequency) => (
                    <option key={frequency}>{frequency}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Occurrences">
                <input
                  name="count"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={10}
                  required
                  className={inputClass}
                />
              </Field>
            </div>
            <Button type="submit" disabled={busy}>
              Create recurrence
            </Button>
          </form>
        ) : (
          <p className={`text-[11px] ${mutedClass}`}>
            No recurrence configured.
          </p>
        )}
      </div>
    </details>
  );
}
