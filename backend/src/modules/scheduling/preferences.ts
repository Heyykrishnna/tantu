import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import type { FastifyInstance } from "fastify";
import type { Identity } from "../workspace-access/service.js";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { change, receipt, versionConflict } from "../connected-work/change.js";
import { digest } from "../workspace-access/credentials.js";
import { Failure } from "../../platform/failure.js";
export interface CalendarPreferences { timezone: string; weekStart: number; startHour: number; endHour: number; workingDays: number[]; bufferMinutes: number; density: "compact" | "comfortable"; connections: string[]; version: number }
export async function calendarPreferences(client: PoolClient): Promise<CalendarPreferences> { return (await client.query<CalendarPreferences>('SELECT timezone,week_start AS "weekStart",start_hour AS "startHour",end_hour AS "endHour",working_days AS "workingDays",buffer_minutes AS "bufferMinutes",density,connections,version FROM tantu.calendar_preferences')).rows[0] ?? { timezone: "UTC", weekStart: 1, startHour: 9, endHour: 17, workingDays: [1, 2, 3, 4, 5], bufferMinutes: 0, density: "comfortable", connections: [], version: 0 }; }
export async function scheduleSources(client: PoolClient, taskId: string): Promise<string> {
    const preferences = await calendarPreferences(client);
    const dependencies = (await client.query("SELECT r.id,r.version,r.status,r.deadline::text FROM tantu.records r WHERE r.id IN(SELECT prerequisite_id FROM tantu.task_dependencies WHERE dependent_id=$1) ORDER BY r.id FOR SHARE", [taskId])).rows;
    const provider = (await client.query("SELECT p.connection_id,p.external_id,md5(p.data::text) AS digest,c.version,c.status FROM tantu.provider_projections p JOIN tantu.provider_connections c ON c.id=p.connection_id WHERE p.kind='calendar' AND p.connection_id=ANY($1::uuid[]) ORDER BY p.connection_id,p.external_id LIMIT 5001", [preferences.connections])).rows;
    if (provider.length > 5000) throw new Failure(409, "CALENDAR_COVERAGE_LIMIT", "Select fewer provider calendars before reviewing work.");
    return digest(JSON.stringify({ preferences, dependencies, provider }));
}
export function preferenceRoutes(app: FastifyInstance, identity: Identity): void {
    const path = "/api/v1/workspaces/:workspaceId/schedule/preferences";
    app.get<{ Params: { workspaceId: string } }>(path, { schema: { params: workspaceParams } }, async request => { const scope = await identity.scope(request, request.params.workspaceId); return identity.database.transaction(scope, calendarPreferences); });
    app.post<{ Params: { workspaceId: string }; Body: CalendarPreferences & { operationId: string } }>(path, { schema: { params: workspaceParams, body: object({ timezone: text(100), weekStart: { enum: [0, 1] }, startHour: { type: "integer", minimum: 0, maximum: 23 }, endHour: { type: "integer", minimum: 1, maximum: 24 }, workingDays: { type: "array", minItems: 1, maxItems: 7, uniqueItems: true, items: { type: "integer", minimum: 1, maximum: 7 } }, bufferMinutes: { type: "integer", minimum: 0, maximum: 120 }, density: { enum: ["compact", "comfortable"] }, connections: { type: "array", maxItems: 10, uniqueItems: true, items: uuid }, version: { type: "integer", minimum: 0 }, operationId: uuid }) } }, async request => {
        const scope = await identity.scope(request, request.params.workspaceId, true); const input = request.body;
        try { Temporal.Now.zonedDateTimeISO(input.timezone); } catch { throw new Failure(400, "INVALID_TIMEZONE", "Choose a valid IANA timezone."); } if (input.endHour <= input.startHour) throw new Failure(400, "INVALID_HOURS", "Working hours must end after they start.");
        return change(identity.database, scope, input.operationId, { command: "calendar.preferences", ...input }, async client => { await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,53))", [scope.workspaceId + scope.userId]); for (const id of input.connections) if (!(await client.query("SELECT id FROM tantu.provider_connections WHERE id=$1 AND status='active' FOR SHARE", [id])).rowCount) throw new Failure(404, "NOT_FOUND", "A selected provider calendar is unavailable."); }, async client => { const current = await calendarPreferences(client); if (current.version !== input.version) versionConflict(); return receipt((await client.query("INSERT INTO tantu.calendar_preferences(workspace_id,user_id,timezone,week_start,start_hour,end_hour,working_days,buffer_minutes,density,connections) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(workspace_id,user_id) DO UPDATE SET timezone=excluded.timezone,week_start=excluded.week_start,start_hour=excluded.start_hour,end_hour=excluded.end_hour,working_days=excluded.working_days,buffer_minutes=excluded.buffer_minutes,density=excluded.density,connections=excluded.connections,version=tantu.calendar_preferences.version+1 RETURNING user_id AS id,version", [scope.workspaceId, scope.userId, input.timezone, input.weekStart, input.startHour, input.endHour, input.workingDays, input.bufferMinutes, input.density, input.connections])).rows[0]); });
    });
}
