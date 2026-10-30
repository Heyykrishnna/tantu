import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import { object } from "../../platform/value.js";
import { calendarPreferences } from "./preferences.js";
import { civilInstant } from "./time.js";
export async function calendarOverlays(client: PoolClient, from: string, to: string) {
    const preferences = await calendarPreferences(client); const rows = (await client.query<{ connection_id: string; external_id: string; data: unknown }>("SELECT p.connection_id,p.external_id,jsonb_build_object('title',left(p.data->>'title',200),'start',jsonb_build_object('date',p.data->'start'->'date','dateTime',p.data->'start'->'dateTime','timeZone',p.data->'start'->'timeZone'),'end',jsonb_build_object('date',p.data->'end'->'date','dateTime',p.data->'end'->'dateTime','timeZone',p.data->'end'->'timeZone'),'allDay',p.data->'allDay','type',p.data->'type','series',CASE WHEN jsonb_typeof(p.data->'recurrence')='array' THEN jsonb_array_length(p.data->'recurrence')>0 ELSE false END,'status',p.data->'status','cancelled',p.data->'cancelled') AS data FROM tantu.provider_projections p JOIN tantu.provider_connections c ON c.id=p.connection_id AND c.status='active' WHERE p.kind='calendar' AND p.connection_id=ANY($1::uuid[]) ORDER BY p.connection_id,p.external_id LIMIT 1001", [preferences.connections])).rows;
    const unavailable = (await client.query("SELECT id FROM tantu.provider_connections WHERE id=ANY($1::uuid[]) AND status='active'", [preferences.connections])).rows.length !== preferences.connections.length;
    const items: { id: string; connectionId: string; title: string; startsAt: string; endsAt: string; allDay: boolean }[] = []; let unresolved = 0;
    for (const row of rows.slice(0, 1000)) {
        const event = object(row.data); if (event.cancelled === true || event.status === "cancelled") continue;
        try {
            const start = object(event.start); const end = object(event.end); const allDay = event.allDay === true || typeof start.date === "string";
            const instant = (boundary: Record<string, unknown>) => { if (typeof boundary.date === "string") return civilInstant(boundary.date + "T00:00", preferences.timezone); if (typeof boundary.dateTime !== "string") throw new Error("Missing event boundary."); if (/(?:Z|[+-]\d\d:\d\d)$/.test(boundary.dateTime)) return Temporal.Instant.from(boundary.dateTime).toString(); return civilInstant(boundary.dateTime, typeof boundary.timeZone === "string" ? boundary.timeZone : preferences.timezone); };
            const startsAt = instant(start); const endsAt = instant(end); if (Array.isArray(event.recurrence) && event.recurrence.length || event.type === "seriesMaster" || event.series === true) unresolved++;
            if (Date.parse(startsAt) < Date.parse(to) && Date.parse(endsAt) > Date.parse(from)) items.push({ id: row.external_id, connectionId: row.connection_id, title: typeof event.title === "string" ? event.title : "Calendar event", startsAt, endsAt, allDay });
        } catch { unresolved++; }
    }
    return { items, coverage: { selected: preferences.connections.length, truncated: rows.length > 1000, unavailable, unexpandedSeries: unresolved, source: "current private provider projections; synchronize for latest changes" } };
}
