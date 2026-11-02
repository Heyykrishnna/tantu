"use client";
import { Select } from "@/components/ui/select";
import { useState } from "react";
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
  panelClass,
  mutedClass,
} from "../components/ui";
interface Target {
  id: string;
  version: number;
  title: string;
}
function target(value: unknown): Target {
  const row = record(value);
  return {
    id: string(row.id),
    version: integer(row.version),
    title: string(row.title),
  };
}
function review(value: unknown) {
  const row = record(value);
  return {
    id: string(row.id),
    blocks: list(row.blocks, record),
    dependencies: list(row.dependencies, record),
    coverage: string(row.coverage),
    explanation: typeof row.explanation === "string" ? row.explanation : "",
  };
}
export default function WorkActions({
  workspaceId,
  csrf,
  targets,
  onApplied,
}: {
  workspaceId: string;
  csrf: string;
  targets: Target[];
  onApplied: () => void;
}) {
  const [selection, setSelection] = useState<string[]>([]);
  const [action, setAction] = useState<
    "complete" | "reopen" | "archive" | "unarchive" | "delete" | "restore"
  >("complete");
  const [extra, setExtra] = useState<Target[]>([]);
  const [cancel, setCancel] = useState(false);
  const [pending, setPending] = useState<ReturnType<typeof review> | null>(
    null,
  );
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const base = `/workspaces/${workspaceId}/work`;
  const available = [...targets, ...extra].filter(
    (item, index, all) =>
      all.findIndex((other) => other.id === item.id) === index,
  );
  async function run(callback: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await callback();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Work action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={`${panelClass} my-4 p-4`}>
      <summary className="cursor-pointer text-[12px] font-medium">
        Reviewed work actions and recovery
      </summary>
      <div className="mt-4 grid gap-3">
        <Notice
          role={message === "Reviewed work action saved." ? "status" : "alert"}
          tone={message === "Reviewed work action saved." ? "success" : "error"}
        >
          {message}
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setExtra(await api(base + "/archived", items(target)));
                setAction("unarchive");
                setSelection([]);
                setPending(null);
              })
            }
          >
            Load archived tasks
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setExtra(await api(base + "/trash", items(target)));
                setAction("restore");
                setSelection([]);
                setPending(null);
              })
            }
          >
            Load deleted tasks
          </Button>
        </div>
        <div className="grid max-h-48 gap-2 overflow-auto">
          {available.map((item) => (
            <label
              className="flex items-center gap-2 text-[11px]"
              key={item.id}
            >
              <input
                type="checkbox"
                checked={selection.includes(item.id)}
                disabled={busy}
                onChange={(event) => {
                  setSelection(
                    event.target.checked
                      ? [...selection, item.id]
                      : selection.filter((id) => id !== item.id),
                  );
                  setPending(null);
                }}
              />
              {item.title}
            </label>
          ))}
        </div>
        <Field label="Work action">
          <Select
            aria-label="Work action"
            value={action}
            disabled={busy}
            onChange={(event) => {
              setAction(
                choice(event.target.value, [
                  "complete",
                  "reopen",
                  "archive",
                  "unarchive",
                  "delete",
                  "restore",
                ]),
              );
              setPending(null);
              setCancel(false);
            }}
            className={inputClass}
          >
            {[
              "complete",
              "reopen",
              "archive",
              "unarchive",
              "delete",
              "restore",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </Field>
        {["complete", "delete", "archive"].includes(action) && (
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={cancel}
              disabled={busy}
              onChange={(event) => {
                setCancel(event.target.checked);
                setPending(null);
              }}
            />
            Also cancel my reviewed future local blocks
          </label>
        )}
        <Button
          size="sm"
          disabled={busy || !selection.length || selection.length > 50}
          onClick={() =>
            void run(async () => {
              setPending(
                await api(base + "/review", review, {
                  method: "POST",
                  csrf,
                  body: {
                    action,
                    targets: available
                      .filter((item) => selection.includes(item.id))
                      .map(({ id, version }) => ({ id, version })),
                    cancelOwnBlocks: cancel,
                  },
                }),
              );
              setKey(crypto.randomUUID());
            })
          }
        >
          Review selected work
        </Button>
        {pending && (
          <section
            aria-label="Work impact review"
            className="grid gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <p className="text-[12px]">
              {selection.length} tasks · {pending.blocks.length} future local
              blocks · {pending.dependencies.length} visible dependent links
            </p>
            <p className={`text-[11px] ${mutedClass}`}>{pending.coverage}</p>
            <p className="text-[11px]">{pending.explanation}</p>
            {pending.dependencies.map((edge, index) => (
              <p key={index} className="text-[10px]">
                Dependent task {String(edge.title ?? edge.dependentId)} ·{" "}
                {String(edge.status)} · deadline{" "}
                {String(edge.deadline ?? "unset")}{" "}
                {edge.deadlineRisk === true
                  ? "· Prerequisite deadline is later: review this dependency slip."
                  : ""}
              </p>
            ))}
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(base + "/apply", acknowledgment, {
                    method: "POST",
                    csrf,
                    body: { reviewId: pending.id, operationId: key },
                  });
                  setPending(null);
                  setSelection([]);
                  setExtra([]);
                  setMessage("Reviewed work action saved.");
                  onApplied();
                })
              }
            >
              Confirm reviewed work
            </Button>
          </section>
        )}
      </div>
    </details>
  );
}
