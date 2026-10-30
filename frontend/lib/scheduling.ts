import { list, record, string } from "./api";
import { integer } from "./projects";
export function workBlock(value: unknown) {
  const data = record(value);
  return { id: string(data.id), taskId: string(data.taskId), title: string(data.title), taskVersion: integer(data.taskVersion), startsAt: string(data.startsAt), endsAt: string(data.endsAt), timezone: string(data.timezone), locked: data.locked === true, version: integer(data.version), status: string(data.status) };
}
export function schedule(value: unknown) { const data = record(value); return { items: list(data.items, workBlock), truncated: data.truncated === true }; }
export function scheduleReview(value: unknown) { const data = record(value); const selected = record(data.selection); return { id: string(data.id), startsAt: string(selected.startsAt), endsAt: string(selected.endsAt), conflicts: list(data.conflicts, (item) => string(record(item).id)), dependencies: list(data.dependencies, (item) => string(record(item).title)), outsideHours: data.outsideHours === true, bufferMinutes: typeof data.bufferMinutes === "number" ? data.bufferMinutes : 0, providerBusy: data.overlays ? list(record(data.overlays).items, record).length : 0, coverage: data.overlays ? record(record(data.overlays).coverage) : {}, warnings: list(data.warnings, string) }; }
export function recurrence(value: unknown) {
  const data = record(value); const definition = data.definition === null ? null : record(data.definition);
  return { id: definition ? string(definition.id) : null, timezone: definition ? string(definition.timezone) : "", rule:definition?string(definition.rule):"", version:definition?integer(definition.version):0, instants: definition ? list(definition.instants, string) : [], items: list(data.items, (value) => { const item = record(value); return { instant: string(item.instant), state: string(item.state), taskId: item.taskId === null ? null : string(item.taskId) }; }) };
}
export function localDate(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function localTime(instant: string, timezone: string): string { return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant)); }
