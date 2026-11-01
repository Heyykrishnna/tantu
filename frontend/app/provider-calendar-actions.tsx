"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, items, list, record, string } from "../lib/api";
import {
  Button,
  Field,
  Notice,
  inputClass,
  panelClass,
  mutedClass,
  Badge,
} from "../components/ui";
function event(value: unknown) {
  const row = record(value);
  return {
    id: string(row.id),
    title: typeof row.title === "string" ? row.title : "Untitled event",
  };
}
function review(value: unknown) {
  const row = record(value);
  return {
    id: string(row.id),
    request: record(row.request),
    notifications: string(row.notifications),
    current: row.current === null ? null : record(row.current),
  };
}
function effect(value: unknown) {
  const row = record(value);
  return { id: string(row.id), state: string(row.state) };
}
export default function ProviderCalendarActions({
  workspaceId,
  connectionId,
  csrf,
}: {
  workspaceId: string;
  connectionId: string;
  csrf: string;
}) {
  const [events, setEvents] = useState<ReturnType<typeof event>[]>([]);
  const [pending, setPending] = useState<ReturnType<typeof review> | null>(
    null,
  );
  const [effects, setEffects] = useState<ReturnType<typeof effect>[]>([]);
  const [operationId, setOperationId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/workspaces/${workspaceId}/providers/${connectionId}/calendar`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(
        `/workspaces/${workspaceId}/providers/${connectionId}/items?kind=calendar`,
        items(event),
        { signal: controller.signal },
      ),
      api(base + "/operations", items(effect), { signal: controller.signal }),
    ])
      .then(([events, effects]) => {
        setEvents(events);
        setEffects(effects);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Calendar actions unavailable.",
          );
      });
    return () => controller.abort();
  }, [base, workspaceId, connectionId]);
  async function inspect(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const fields = new FormData(formEvent.currentTarget);
    setBusy(true);
    setMessage("");
    setPending(null);
    try {
      const result = await api(base + "/review", review, {
        method: "POST",
        csrf,
        body: {
          action: String(fields.get("action")),
          externalId: fields.get("externalId") || null,
          etag: null,
          scope: String(fields.get("scope")),
          title: String(fields.get("title")),
          start: String(fields.get("start")),
          end: String(fields.get("end")),
          timezone: String(fields.get("timezone")),
          allDay: fields.get("allDay") === "on",
          attendees: String(fields.get("attendees"))
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          frequency: String(fields.get("frequency")),
          count: Number(fields.get("count")),
          interval: Number(fields.get("interval")),
        },
      });
      setPending(result);
      setOperationId(crypto.randomUUID());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not review provider event.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={`${panelClass} p-5`}>
      <summary className="cursor-pointer text-[12px] font-medium">
        Reviewed provider calendar actions
      </summary>
      <div className="mt-4 grid gap-4">
        <Notice role="alert" tone="error">
          {message}
        </Notice>
        <form
          onSubmit={(value) => void inspect(value)}
          onChange={() => setPending(null)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label="Calendar action">
            <select
              aria-label="Calendar action"
              name="action"
              className={inputClass}
            >
              <option value="create">Create event</option>
              <option value="update">Update event</option>
              <option value="delete">Cancel event</option>
            </select>
          </Field>
          <Field label="Existing provider event">
            <select
              aria-label="Existing provider event"
              name="externalId"
              className={inputClass}
            >
              <option value="">New event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Edit scope">
            <select aria-label="Edit scope" name="scope" className={inputClass}>
              <option value="single">Single event</option>
              <option value="occurrence">This occurrence</option>
              <option value="series">Entire series</option>
            </select>
          </Field>
          <Field label="Event title">
            <input
              name="title"
              maxLength={200}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Event start (local time or date)">
            <input
              name="start"
              required
              placeholder="2026-11-01T09:00 or 2026-11-01"
              maxLength={40}
              className={inputClass}
            />
          </Field>
          <Field label="Event end (exclusive for all-day)">
            <input
              name="end"
              required
              placeholder="2026-11-01T10:00 or 2026-11-02"
              maxLength={40}
              className={inputClass}
            />
          </Field>
          <Field label="Event timezone">
            <input
              name="timezone"
              required
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
              maxLength={100}
              className={inputClass}
            />
          </Field>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" name="allDay" />
            All-day date range
          </label>
          <Field label="Attendee emails">
            <input
              name="attendees"
              maxLength={5000}
              placeholder="Comma separated"
              className={inputClass}
            />
          </Field>
          <Field label="Event recurrence">
            <select
              aria-label="Event recurrence"
              name="frequency"
              className={inputClass}
            >
              {["none", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Event occurrence count">
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
          <Field label="Event repeat interval">
            <input
              name="interval"
              type="number"
              min={1}
              max={366}
              defaultValue={1}
              required
              className={inputClass}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            Review external calendar change
          </Button>
        </form>
        {pending && (
          <section
            aria-label="External calendar review"
            className="grid gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h3 className="text-[13px] font-medium">
              Review the exact external change
            </h3>
            <p className="text-[12px]">
              {String(pending.request.action)} · {String(pending.request.scope)}{" "}
              · {String(pending.request.title)}
            </p>
            <p className="text-[11px]">
              {String(pending.request.start)} → {String(pending.request.end)} ·{" "}
              {String(pending.request.timezone)}
            </p>
            <p className="text-[11px]">
              Attendees:{" "}
              {list(pending.request.attendees, string).join(", ") || "None"}
            </p>
            {pending.current && (
              <p className="text-[11px]">
                Existing attendees:{" "}
                {Array.isArray(pending.current.attendees)
                  ? pending.current.attendees.length
                  : 0}
                . Review changes carefully before notifying them.
              </p>
            )}
            <Notice>{pending.notifications}</Notice>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                api(base + "/apply", acknowledgment, {
                  method: "POST",
                  csrf,
                  body: { reviewId: pending.id, operationId },
                })
                  .then(() => api(base + "/operations", items(effect)))
                  .then((value) => {
                    setEffects(value);
                    setPending(null);
                    setMessage(
                      "Reviewed calendar operation queued. The worker will report its outcome.",
                    );
                  })
                  .catch((error: unknown) =>
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Could not confirm operation.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Confirm provider calendar change
            </Button>
          </section>
        )}
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            api(base + "/operations", items(effect))
              .then(setEffects)
              .catch((error: unknown) =>
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Outcomes unavailable.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Refresh calendar outcomes
        </Button>
        {effects.map((value) => (
          <div
            key={value.id}
            className="flex flex-wrap items-center gap-2 text-[11px]"
          >
            <code className="break-all">{value.id}</code>
            <Badge
              tone={
                value.state === "unknown"
                  ? "amber"
                  : value.state === "confirmed"
                    ? "green"
                    : "neutral"
              }
            >
              {value.state}
            </Badge>
            {value.state === "unknown" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  api(base + `/${value.id}/reconcile`, acknowledgment, {
                    method: "POST",
                    csrf,
                  })
                    .then(() => api(base + "/operations", items(effect)))
                    .then(setEffects)
                    .catch((error: unknown) =>
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Reconciliation unavailable.",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                Reconcile without retrying
              </Button>
            )}
          </div>
        ))}
        <p className={`text-[10px] ${mutedClass}`}>
          Uncertain operations are never automatically resubmitted. Confirmed
          describes provider acceptance or read-back evidence, not attendee
          delivery.
        </p>
      </div>
    </details>
  );
}
