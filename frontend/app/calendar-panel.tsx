"use client";

import CalendarPreferences, { preferences } from "./calendar-preferences";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, choice, page, record, string } from "../lib/api";
import type { CanonicalRecord } from "../lib/contracts";
import {
  localDate,
  localTime,
  schedule,
  scheduleReview,
} from "../lib/scheduling";
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

type Block = ReturnType<typeof schedule>["items"][number];
type Mode = "day" | "week" | "month" | "agenda";
function dayOffset(value: string, days: number): string {
  return new Date(Date.parse(value + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export default function CalendarPanel({
  workspaceId,
  csrf,
  onOpenTask,
}: {
  workspaceId: string;
  csrf: string;
  onOpenTask: (id: string) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [mode, setMode] = useState<Mode>("week");
  const [movedDate,setMovedDate]=useState<string|null>(null);
  const [overlayVersion,setOverlayVersion]=useState(0);
  const [overlays,setOverlays]=useState<{id:string;title:string;startsAt:string;endsAt:string}[]>([]);
  const [overlayCoverage,setOverlayCoverage]=useState("");
  const [density,setDensity]=useState<"compact"|"comfortable">("comfortable");
  const [weekStart, setWeekStart] = useState("1");
  const applyPreferences=useCallback((value:ReturnType<typeof preferences>)=>{setZone(value.timezone);setWeekStart(String(value.weekStart));setDensity(value.density);setOverlayVersion(value.version);},[]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tasks, setTasks] = useState<CanonicalRecord[]>([]);
  const [selected, setSelected] = useState<Block | null>(null);
  const [review, setReview] = useState<ReturnType<
    typeof scheduleReview
  > | null>(null);
  const [reviewOperation, setReviewOperation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const base = `/workspaces/${workspaceId}/schedule`;
  const from =
    mode === "month"
      ? date.slice(0, 7) + "-01"
      : mode === "week"
        ? dayOffset(
            date,
            -(
              (new Date(date + "T12:00:00Z").getUTCDay() -
                Number(weekStart) +
                7) %
              7
            ),
          )
        : date;
  const count =
    mode === "month"
      ? new Date(
          Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
        ).getUTCDate()
      : mode === "week"
        ? 7
        : mode === "agenda"
          ? 30
          : 1;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api(
        base +
          `?from=${dayOffset(from, -1)}T00:00:00Z&to=${dayOffset(from, count + 1)}T00:00:00Z`,
        schedule,
        signal ? { signal } : {},
      );
      setBlocks(result.items);
      setTruncated(result.truncated);
      const available = await api(
        `/workspaces/${workspaceId}/tasks?limit=50`,
        page,
        signal ? { signal } : {},
      );
      setTasks(available.items);
    },
    [base, from, count, workspaceId],
  );
  useEffect(() => {
    const controller = new AbortController();
    const request = api(
      base +
        `?from=${dayOffset(from, -1)}T00:00:00Z&to=${dayOffset(from, count + 1)}T00:00:00Z`,
      schedule,
      { signal: controller.signal },
    )
      .then((result) => {
        setBlocks(result.items);
        setTruncated(result.truncated);
        return api(`/workspaces/${workspaceId}/tasks?limit=50`, page, {
          signal: controller.signal,
        });
      })
      .then((result) => setTasks(result.items));
    request
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error ? error.message : "Calendar could not load.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, from, count, workspaceId]);
  useEffect(()=>{const controller=new AbortController();api(base+`/overlays?from=${dayOffset(from,-1)}T00:00:00Z&to=${dayOffset(from,count+1)}T00:00:00Z`,value=>{const row=record(value);const coverage=record(row.coverage);return {items:Array.isArray(row.items)?row.items.map((value:unknown)=>{const item=record(value);return{id:string(item.connectionId)+":"+string(item.id),title:string(item.title),startsAt:string(item.startsAt),endsAt:string(item.endsAt)};}):[],note:coverage.truncated||coverage.unavailable||Number(coverage.unexpandedSeries)>0?"Provider availability is incomplete. Synchronize selected accounts and review unresolved recurring series before relying on these overlays.":"Selected provider projections are shown separately from local task work blocks."};},{signal:controller.signal}).then(value=>{setOverlays(value.items);setOverlayCoverage(value.note);}).catch((error:unknown)=>{if(!controller.signal.aborted)setOverlayCoverage(error instanceof Error?error.message:"Provider overlays unavailable.");});return()=>controller.abort();},[base,from,count,overlayVersion]);
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setReview(null);
    const data = new FormData(event.currentTarget);
    const taskId = String(data.get("taskId"));
    const task = tasks.find((item) => item.id === taskId);
    try {
      const result = await api(base + "/review", scheduleReview, {
        method: "POST",
        csrf,
        body: {
          taskId,
          taskVersion: task?.version ?? selected?.taskVersion,
          start: String(data.get("start")),
          end: String(data.get("end")),
          timezone: zone,
          locked: data.get("locked") === "on",
          cancelled: data.get("cancelled") === "on",
          ...(selected
            ? { blockId: selected.id, blockVersion: selected.version }
            : {}),
        },
      });
      setReview(result);
      setReviewOperation(crypto.randomUUID());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not review schedule.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!review) return;
    setBusy(true);
    setMessage("");
    try {
      await api(base + "/apply", (value) => string(record(value).id), {
        method: "POST",
        csrf,
        body: { reviewId: review.id, operationId: reviewOperation },
      });
      setReview(null);
      setSelected(null);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not confirm schedule. Retry this same review to reuse its operation key.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function unlock(block: Block) {
    setBusy(true);
    try {
      await api(base + `/${block.id}/unlock`, acknowledgment, {
        method: "POST",
        csrf,
        body: {
          expectedVersion: block.version,
          operationId: crypto.randomUUID(),
        },
      });
      await load();
      setSelected(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not unlock block.",
      );
    } finally {
      setBusy(false);
    }
  }
  const days = Array.from({ length: count }, (_, index) =>
    dayOffset(from, index),
  );
  return (
    <section className="grid gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={`${headingClass} text-2xl`}>Calendar</h1>
          <p className={`mt-2 text-[12px] ${mutedClass}`}>
            Plan focused work without moving task deadlines.
          </p>
        </div>
        <Badge>Personal work blocks</Badge>
      </header>
      <CalendarPreferences workspaceId={workspaceId} csrf={csrf} onLoaded={applyPreferences}/>
      <Notice role="alert" tone="error">
        {message}
      </Notice>
      <div className={`${panelClass} flex flex-wrap items-end gap-3 p-4`}>
        <Field label="Calendar date">
          <input
            type="date"
            required
            value={date}
            onChange={(event) => {
              if (event.target.value) {
                setDate(event.target.value);
                setReview(null);
              }
            }}
            className={inputClass}
          />
        </Field>
        <Field label="Timezone">
          <input
            defaultValue={zone}
            onChange={(event) => {
              try {
                new Intl.DateTimeFormat("en", {
                  timeZone: event.target.value,
                }).format();
                setZone(event.target.value);
                setReview(null);
                setMessage("");
              } catch {
                setMessage("Enter a valid IANA timezone.");
              }
            }}
            className={inputClass}
            placeholder="Asia/Kolkata"
          />
        </Field>
        <Field label="Week starts">
          <select aria-label="Week starts"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            className={inputClass}
          >
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </select>
        </Field>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Calendar views"
        >
          {(["day", "week", "month", "agenda"] as const).map((item) => (
            <Button
              key={item}
              aria-pressed={mode === item}
              variant={mode === item ? "primary" : "secondary"}
              onClick={() =>
                setMode(choice(item, ["day", "week", "month", "agenda"]))
              }
            >
              {item}
            </Button>
          ))}
        </div>
      </div>
      {overlayCoverage&&<Notice>{overlayCoverage}</Notice>}
      {loading ? (
        <p role="status">Loading calendar…</p>
      ) : (
        <div
          className={`grid gap-3 ${mode === "month" ? "sm:grid-cols-2 xl:grid-cols-7" : mode === "week" ? "sm:grid-cols-2 xl:grid-cols-7" : ""}`}
        >
          {days.map((day) => {
            let daily: Block[] = [];
            try {
              daily = blocks.filter(
                (block) =>
                  localDate(block.startsAt, zone) <= day &&
                  localDate(
                    new Date(Date.parse(block.endsAt) - 1).toISOString(),
                    zone,
                  ) >= day,
              );
            } catch {
              return (
                <p key={day} className="text-[12px]">
                  Enter a valid IANA timezone.
                </p>
              );
            }
            const external=overlays.filter(event=>localDate(event.startsAt,zone)<=day&&localDate(new Date(Date.parse(event.endsAt)-1).toISOString(),zone)>=day);
            if (mode === "agenda" && !daily.length&&!external.length) return null;
            return (
              <section onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const block=blocks.find(value=>value.id===event.dataTransfer.getData("text/plain"));if(block&&!block.locked){setSelected(block);setMovedDate(day);setReview(null);setMessage("Review the dragged block’s local date and time in the form before applying.");}}} key={day} className={`${panelClass} min-w-0 ${density === "compact" ? "p-2" : "p-4"}`}>
                <h2 className="mb-3 text-[11px] font-medium">{day}</h2>
                <div className="grid gap-2">
                  {external.map(event=><article key={event.id} className="rounded-lg border border-teal-400/20 bg-teal-400/10 p-2 text-[10px]"><p>{event.title}</p><span className={mutedClass}>Provider calendar · {localTime(event.startsAt,zone)}</span></article>)}
                  {daily.map((block) => (
                    <div
                      draggable={!block.locked}
                      onDragStart={event=>event.dataTransfer.setData("text/plain",block.id)}
                      key={block.id}
                      className="grid gap-2 rounded-lg border border-violet-400/20 bg-violet-400/8 p-2.5"
                    >
                      <button
                        onClick={() => onOpenTask(block.taskId)}
                        className="truncate rounded text-left text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      >
                        {block.title}
                      </button>
                      <span className={`text-[10px] ${mutedClass}`}>
                        {localTime(block.startsAt, zone)}–
                        {localTime(block.endsAt, zone)}
                      </span>
                      {block.status === "done" && (
                        <Badge tone="green">Task complete</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setMovedDate(null);setSelected(block);
                          setReview(null);
                        }}
                      >
                        {block.locked ? "Locked block" : "Reschedule"}
                      </Button>
                      {block.locked && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void unlock(block)}
                        >
                          Unlock
                        </Button>
                      )}
                    </div>
                  ))}
                  {!daily.length && (
                    <p className={`text-[10px] ${mutedClass}`}>
                      No work blocks
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {truncated && (
        <Notice>First 500 blocks shown. Select a smaller date window.</Notice>
      )}
      <details open={selected !== null} className={`${panelClass} p-5`}>
        <summary className="cursor-pointer text-[12px] font-medium">
          {selected ? "Review work-block changes" : "Schedule a task"}
        </summary>
        <form
          key={`${selected?.id ?? "new"}:${movedDate ?? ""}`}
          onSubmit={(event) => void preview(event)}
          onChange={() => setReview(null)}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <Field label="Task to schedule">
            <select aria-label="Task to schedule"
              name="taskId"
              required
              defaultValue={selected?.taskId ?? ""}
              disabled={!!selected}
              className={inputClass}
            >
              <option value="">Select a task (first 50)</option>
              {selected &&
                !tasks.some((task) => task.id === selected.taskId) && (
                  <option value={selected.taskId}>{selected.title}</option>
                )}
              {tasks
                .filter((task) => task.canEdit)
                .map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
            </select>
            {selected && (
              <input type="hidden" name="taskId" value={selected.taskId} />
            )}
          </Field>
          <div className="grid content-end gap-2 text-[11px]">
            <label className="flex items-center gap-2">
              <input
                name="locked"
                type="checkbox"
                defaultChecked={selected?.locked}
              />
              Lock this commitment
            </label>
            {selected && (
              <label className="flex items-center gap-2">
                <input name="cancelled" type="checkbox" />
                Cancel this local work block
              </label>
            )}
          </div>
          <Field label="Start (local time)">
            <input
              name="start"
              type="datetime-local"
              required
              defaultValue={
                selected
                  ? (movedDate ?? localDate(selected.startsAt, zone)) +
                    "T" +
                    localTime(selected.startsAt, zone)
                  : date + "T09:00"
              }
              className={inputClass}
            />
          </Field>
          <Field label="End (local time)">
            <input
              name="end"
              type="datetime-local"
              required
              defaultValue={
                selected
                  ? (movedDate ? dayOffset(movedDate,Math.round((Date.parse(localDate(selected.endsAt,zone))-Date.parse(localDate(selected.startsAt,zone)))/86400000)) : localDate(selected.endsAt, zone)) +
                    "T" +
                    localTime(selected.endsAt, zone)
                  : date + "T10:00"
              }
              className={inputClass}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={busy || selected?.locked}
              variant="primary"
            >
              Review schedule
            </Button>
            {selected && (
              <Button
                onClick={() => {
                  setSelected(null);
                  setReview(null);
                }}
              >
                New block
              </Button>
            )}
          </div>
        </form>
      </details>
      {review && (
        <section
          aria-label="Schedule review"
          className={`${panelClass} grid gap-4 p-5`}
        >
          <h2 className={`${headingClass} text-lg`}>Review before applying</h2>
          <Notice>{review.providerBusy} provider busy intervals · {review.bufferMinutes} minute buffers.{review.outsideHours ? " This selection is outside your configured working hours." : ""}{review.coverage.truncated||review.coverage.unavailable||Number(review.coverage.unexpandedSeries)>0?" Provider coverage is incomplete; availability is unknown for unresolved events.":""}</Notice>
          <p className="text-[12px]">
            {review.startsAt} → {review.endsAt}
          </p>
          <p className="text-[12px]">
            {review.conflicts.length} overlapping blocks ·{" "}
            {review.dependencies.length} incomplete visible prerequisites
          </p>
          {review.dependencies.length > 0 && (
            <ul className={`list-inside list-disc text-[11px] ${mutedClass}`}>
              {review.dependencies.map((title, index) => (
                <li key={index}>{title}</li>
              ))}
            </ul>
          )}
          <ul className={`grid gap-2 text-[11px] ${mutedClass}`}>
            {review.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <Button
            disabled={busy}
            variant="primary"
            onClick={() => void apply()}
          >
            Confirm and apply schedule
          </Button>
        </section>
      )}
    </section>
  );
}
