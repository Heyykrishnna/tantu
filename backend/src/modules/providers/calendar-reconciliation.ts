import { Temporal } from "@js-temporal/polyfill";
import type { Scope } from "../../platform/database/database.js";
import type { Providers } from "./service.js";
import { calendarEdit, eventPath, calendarBody } from "./calendar-effects.js";
import type { CalendarEdit } from "./calendar-effects.js";
import type { Provider } from "./config.js";
import { object, array } from "../../platform/value.js";
import { Failure } from "../../platform/failure.js";
import { ProviderFailure } from "./http.js";
function boundary(value: unknown, allDay: boolean): string | null {
  try { const row = object(value); if (allDay) return typeof row.date === "string" ? row.date : typeof row.dateTime === "string" ? row.dateTime.slice(0, 10) : null; if (typeof row.dateTime !== "string") return null; return /(?:Z|[+-]\d\d:\d\d)$/.test(row.dateTime) ? Temporal.Instant.from(row.dateTime).toString() : Temporal.PlainDateTime.from(row.dateTime).toZonedDateTime(typeof row.timeZone === "string" ? row.timeZone : "UTC", { disambiguation: "reject" }).toInstant().toString(); } catch { return null; }
}
export function matchesCalendarEdit(provider: Provider, input: CalendarEdit, current: Record<string, unknown>): boolean {
  const expected = object(calendarBody(input, provider, "readback")); const addresses = (value: unknown) => array(value ?? []).map(item => { const row = object(item); return provider === "google" ? String(row.email ?? "").toLowerCase() : String(object(row.emailAddress).address ?? "").toLowerCase(); }).sort();
  try { return current[provider === "google" ? "summary" : "subject"] === input.title && (provider === "google" ? typeof object(current.start).date === "string" : current.isAllDay === true) === input.allDay && boundary(current.start, input.allDay) === boundary(expected.start, input.allDay) && boundary(current.end, input.allDay) === boundary(expected.end, input.allDay) && JSON.stringify(addresses(current.attendees)) === JSON.stringify([...input.attendees].map(value => value.toLowerCase()).sort()) && JSON.stringify(current.recurrence ?? (provider === "google" ? [] : null)) === JSON.stringify(expected.recurrence ?? (provider === "google" ? [] : null)); } catch { return false; }
}
export async function reconcileCalendarEffect(providers: Providers, scope: Scope, connectionId: string, id: string): Promise<{ state: string }> {
  return providers.database.transaction(scope, async client => {
    const effect = (await client.query<{ state: string; provider_id: string | null; request: unknown }>("SELECT e.state,e.provider_id,r.request FROM tantu.provider_effects e JOIN tantu.provider_effect_reviews r ON r.id=e.review_id WHERE e.id=$1 AND e.connection_id=$2 AND r.request->>'kind' IS DISTINCT FROM 'mail' FOR UPDATE OF e", [id, connectionId])).rows[0]; if (!effect) throw new Failure(404, "NOT_FOUND", "Calendar operation unavailable."); if (effect.state !== "unknown") return { state: effect.state };
    const account = await providers.connection(client, connectionId); const input = calendarEdit(effect.request); const providerId = effect.provider_id ?? (input.action === "create" && account.provider === "google" ? id.replaceAll("-", "") : input.externalId); if (!providerId) return { state: "unknown" }; const token = await providers.access(client, account); let confirmed: boolean;
    try { const current = object(await providers.http.request(account.provider, token, eventPath(account.provider, providerId))); confirmed = input.action === "create" || input.action === "update" && matchesCalendarEdit(account.provider, input, current) || input.action === "delete" && (current.status === "cancelled" || current.isCancelled === true); } catch (error) { if (error instanceof ProviderFailure && [404, 410].includes(error.providerStatus)) confirmed = input.action === "delete"; else throw error; }
    if (confirmed) await client.query("UPDATE tantu.provider_effects SET state='confirmed',provider_id=$2 WHERE id=$1", [id, providerId]); return { state: confirmed ? "confirmed" : "unknown" };
  });
}
