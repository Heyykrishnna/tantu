"use client";
import { Select } from "@/components/ui/select";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, items, record, string } from "../lib/api";
import {
  Button,
  Field,
  Notice,
  inputClass,
  panelClass,
} from "../components/ui";
export default function MailboxActions({
  workspaceId,
  connectionId,
  provider,
  csrf,
}: {
  workspaceId: string;
  connectionId: string;
  provider: "google" | "microsoft";
  csrf: string;
}) {
  const base = `/workspaces/${workspaceId}/providers/${connectionId}/mail-actions`;
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([]);
  const [operations, setOperations] = useState<{ id: string; state: string }[]>(
    [],
  );
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(
        base + "/targets",
        items((value) => {
          const row = record(value);
          return { id: string(row.id), name: string(row.name) };
        }),
        { signal: controller.signal },
      ),
      api(
        base + "/operations",
        items((value) => {
          const row = record(value);
          return { id: string(row.id), state: string(row.state) };
        }),
        { signal: controller.signal },
      ),
    ])
      .then(([targets, operations]) => {
        setTargets(targets);
        setOperations(operations);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Mailbox controls unavailable.",
          );
      });
    return () => controller.abort();
  }, [base]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Mailbox action unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      setReview(
        await api(base + "/review", record, {
          method: "POST",
          csrf,
          body: {
            messageId: String(data.get("messageId")),
            action: String(data.get("action")),
            targetId: String(data.get("targetId")) || null,
          },
        }),
      );
    });
  }
  return (
    <section className={`${panelClass} grid gap-4 p-5`}>
      <h2 className="text-sm font-medium">Reviewed mailbox changes</h2>
      {message && <Notice>{message}</Notice>}
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={prepare}>
        <Field label="Provider message ID">
          <input
            className={inputClass}
            name="messageId"
            required
            maxLength={1024}
          />
        </Field>
        <Field label="Action">
          <Select className={inputClass} name="action">
            <option value="read">Mark read</option>
            <option value="unread">Mark unread</option>
            <option value={provider === "google" ? "label" : "move"}>
              {provider === "google"
                ? "Add Gmail label"
                : "Move to Microsoft folder"}
            </option>
          </Select>
        </Field>
        <Field
          label={provider === "google" ? "Gmail label" : "Microsoft folder"}
        >
          <Select className={inputClass} name="targetId">
            <option value="">No organization change</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={busy}>
          Review mailbox change
        </Button>
      </form>
      {review && (
        <section
          aria-label="Mailbox change review"
          className="grid gap-3 rounded-lg border border-white/10 p-4"
        >
          <pre className="overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(review.request, null, 2)}
          </pre>
          <p className="text-xs">
            Changes the selected provider mailbox. An uncertain outcome is
            reconciled by reading its current state.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(base + "/apply", acknowledgment, {
                  method: "POST",
                  csrf,
                  body: {
                    reviewId: string(review.id),
                    operationId: crypto.randomUUID(),
                  },
                });
                setReview(null);
                setMessage(
                  "Queued for the background worker. Refresh outcomes after processing.",
                );
              })
            }
          >
            Confirm mailbox change
          </Button>
          <Button onClick={() => setReview(null)}>Cancel review</Button>
        </section>
      )}
      <Button
        disabled={busy}
        onClick={() =>
          void run(async () =>
            setOperations(
              await api(
                base + "/operations",
                items((value) => {
                  const row = record(value);
                  return { id: string(row.id), state: string(row.state) };
                }),
              ),
            ),
          )
        }
      >
        Refresh mailbox outcomes
      </Button>
      {operations.map((operation) => (
        <div
          key={operation.id}
          className="flex flex-wrap items-center gap-3 text-xs"
        >
          <code className="break-all">{operation.id}</code>
          <span>{operation.state}</span>
          {operation.state === "unknown" && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api(
                    base + `/${operation.id}/reconcile`,
                    record,
                    { method: "POST", csrf },
                  );
                  setOperations((current) =>
                    current.map((item) =>
                      item.id === operation.id
                        ? { ...item, state: string(result.state) }
                        : item,
                    ),
                  );
                })
              }
            >
              Read back outcome
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
