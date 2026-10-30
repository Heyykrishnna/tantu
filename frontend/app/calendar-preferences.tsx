"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, choice, list, record, string } from "../lib/api";
import { integer } from "../lib/projects";
import { connections } from "../lib/providers";
import {
  Button,
  Field,
  Notice,
  inputClass,
  panelClass,
} from "../components/ui";
export function preferences(value: unknown) {
  const row = record(value);
  return {
    timezone: string(row.timezone),
    weekStart: integer(row.weekStart),
    startHour: integer(row.startHour),
    endHour: integer(row.endHour),
    workingDays: list(row.workingDays, integer),
    bufferMinutes: integer(row.bufferMinutes),
    density: choice(row.density, ["compact", "comfortable"]),
    connections: list(row.connections, string),
    version: integer(row.version),
  };
}
export default function CalendarPreferences({
  workspaceId,
  csrf,
  onLoaded,
}: {
  workspaceId: string;
  csrf: string;
  onLoaded: (value: ReturnType<typeof preferences>) => void;
}) {
  const [data, setData] = useState<ReturnType<typeof preferences> | null>(null);
  const [accounts, setAccounts] = useState<
    ReturnType<typeof connections>["items"]
  >([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/workspaces/${workspaceId}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(base + "/schedule/preferences", preferences, {
        signal: controller.signal,
      }),
      api(base + "/providers", connections, { signal: controller.signal }),
    ])
      .then(([value, accounts]) => {
        setData(value);
        setAccounts(accounts.items);
        if (value.version > 0) onLoaded(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Calendar preferences unavailable.",
          );
      });
    return () => controller.abort();
  }, [base, onLoaded]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(base + "/schedule/preferences", acknowledgment, {
        method: "POST",
        csrf,
        body: {
          timezone: String(fields.get("timezone")),
          weekStart: Number(fields.get("weekStart")),
          startHour: Number(fields.get("startHour")),
          endHour: Number(fields.get("endHour")),
          workingDays: fields.getAll("day").map(Number),
          bufferMinutes: Number(fields.get("buffer")),
          density: String(fields.get("density")),
          connections: fields.getAll("connection"),
          version: data.version,
          operationId: crypto.randomUUID(),
        },
      });
      const saved = await api(base + "/schedule/preferences", preferences);
      setData(saved);
      onLoaded(saved);
      setMessage("Calendar preferences saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save preferences.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={`${panelClass} p-4`}>
      <summary className="cursor-pointer text-[12px] font-medium">
        Working hours, buffers and calendar overlays
      </summary>
      <Notice>{message}</Notice>
      {data && (
        <form
          key={data.version}
          onSubmit={(event) => void save(event)}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <Field label="Preferred timezone">
            <input
              name="timezone"
              defaultValue={data.timezone}
              required
              maxLength={100}
              className={inputClass}
            />
          </Field>
          <Field label="Preferred week start">
            <select
              aria-label="Preferred week start"
              name="weekStart"
              defaultValue={data.weekStart}
              className={inputClass}
            >
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </select>
          </Field>
          <Field label="Working day starts">
            <input
              name="startHour"
              type="number"
              min={0}
              max={23}
              defaultValue={data.startHour}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Working day ends">
            <input
              name="endHour"
              type="number"
              min={1}
              max={24}
              defaultValue={data.endHour}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Buffer minutes">
            <input
              name="buffer"
              type="number"
              min={0}
              max={120}
              defaultValue={data.bufferMinutes}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Calendar density">
            <select
              aria-label="Calendar density"
              name="density"
              defaultValue={data.density}
              className={inputClass}
            >
              <option>comfortable</option>
              <option>compact</option>
            </select>
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-[11px]">Working days</legend>
            {[
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ].map((day, index) => (
              <label key={day} className="flex gap-2 text-[11px]">
                <input
                  name="day"
                  type="checkbox"
                  value={index + 1}
                  defaultChecked={data.workingDays.includes(index + 1)}
                />
                {day}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid content-start gap-2">
            <legend className="mb-2 text-[11px]">
              Private calendar overlays
            </legend>
            {accounts
              .filter((account) => account.status === "active")
              .map((account) => (
                <label className="flex gap-2 text-[11px]" key={account.id}>
                  <input
                    name="connection"
                    type="checkbox"
                    value={account.id}
                    defaultChecked={data.connections.includes(account.id)}
                  />
                  {account.address}
                </label>
              ))}
          </fieldset>
          <Button type="submit" disabled={busy}>
            Save calendar preferences
          </Button>
        </form>
      )}
    </details>
  );
}
