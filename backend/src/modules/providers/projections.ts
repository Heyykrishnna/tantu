import type { Provider } from "./config.js";
import { array, object, string } from "./vault.js";
import type { ProviderHttp } from "./http.js";

export interface Projection { id: string; data: object; deleted?: boolean }
export interface ProjectionPage { items: Projection[]; cursor: string | null; complete: boolean; coverage: string }
function optionalString(value: unknown): string { return typeof value === "string" ? value : ""; }
function plainPart(value: unknown, depth = 0): string {
  if (depth > 10) return ""; const part = object(value);
  if (part.mimeType === "text/plain") { const body = object(part.body); return typeof body.data === "string" ? Buffer.from(body.data, "base64url").toString("utf8").slice(0, 100000) : ""; }
  return Array.isArray(part.parts) ? part.parts.map((item: unknown) => plainPart(item, depth + 1)).filter(Boolean).join("\n").slice(0, 100000) : "";
}
async function googleMail(http: ProviderHttp, token: string, id: string): Promise<Projection> {
  const message = object(await http.request("google", token, `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`));
  const payload = object(message.payload); const headers = array(payload.headers).map(object);
  const header = (name: string) => optionalString(headers.find((item) => optionalString(item.name).toLowerCase() === name)?.value).slice(0, 2000);
  return { id: string(message.id), data: { id: string(message.id), threadId: string(message.threadId), subject: header("subject"), from: header("from"), sentAt: header("date"), body: plainPart(payload), labels: array(message.labelIds ?? []).map(string), bodyState: plainPart(payload) ? "plain-text" : "no-plain-text", historyId: optionalString(message.historyId) } };
}
export async function projectionPage(http: ProviderHttp, provider: Provider, token: string, kind: "mail" | "calendar", cursor: string | null): Promise<ProjectionPage> {
  if (provider === "google" && kind === "mail") {
    let anchor: string; let pageToken = "";
    if (!cursor || cursor.startsWith("initial:")) {
      if (cursor) { const data = object(JSON.parse(Buffer.from(cursor.slice(8), "base64url").toString("utf8"))); anchor = string(data.anchor); pageToken = string(data.pageToken); }
      else anchor = string(object(await http.request(provider, token, "/gmail/v1/users/me/profile")).historyId);
      const result = object(await http.request(provider, token, "/gmail/v1/users/me/messages?maxResults=25" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")));
      const items: Projection[] = []; for (const entry of array(result.messages ?? [])) items.push(await googleMail(http, token, string(object(entry).id)));
      const next = optionalString(result.nextPageToken);
      return { items, cursor: next ? "initial:" + Buffer.from(JSON.stringify({ anchor, pageToken: next })).toString("base64url") : "history:" + anchor, complete: !next, coverage: "mailbox; paged baseline and history; plain-text bodies only" };
    }
    const data = cursor.startsWith("page:") ? object(JSON.parse(Buffer.from(cursor.slice(5), "base64url").toString("utf8"))) : { anchor: cursor.slice(8), pageToken: "" };
    const result = object(await http.request(provider, token, `/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(string(data.anchor))}&maxResults=25` + (data.pageToken ? "&pageToken=" + encodeURIComponent(string(data.pageToken)) : "")));
    const changed = new Set<string>(); const removed = new Set<string>();
    for (const value of array(result.history ?? [])) {
      const history = object(value);
      for (const key of ["messagesAdded", "labelsAdded", "labelsRemoved"]) for (const event of array(history[key] ?? [])) changed.add(string(object(object(event).message).id));
      for (const event of array(history.messagesDeleted ?? [])) removed.add(string(object(object(event).message).id));
    }
    if (changed.size + removed.size > 100) throw new Error("Provider history page exceeded the bounded processing limit.");
    const items: Projection[] = [...removed].map((id) => ({ id, data: {}, deleted: true }));
    for (const id of changed) if (!removed.has(id)) items.push(await googleMail(http, token, id));
    const next = optionalString(result.nextPageToken);
    return { items, cursor: next ? "page:" + Buffer.from(JSON.stringify({ anchor: data.anchor, pageToken: next })).toString("base64url") : "history:" + string(result.historyId), complete: !next, coverage: "mailbox; history checkpoint; plain-text bodies only" };
  }
  if (provider === "google") {
    let path = "/calendar/v3/calendars/primary/events?maxResults=25&showDeleted=true";
    let syncToken: string | null = cursor;
    if (cursor?.startsWith("next:")) { const continuation = object(JSON.parse(Buffer.from(cursor.slice(5), "base64url").toString("utf8"))); path += "&pageToken=" + encodeURIComponent(string(continuation.pageToken)); syncToken = typeof continuation.syncToken === "string" ? continuation.syncToken : null; }
    if (syncToken) path += "&syncToken=" + encodeURIComponent(syncToken);
    const result = object(await http.request(provider, token, "https://www.googleapis.com" + path));
    const items = array(result.items ?? []).map((value): Projection => { const event = object(value); const id = string(event.id); return { id, ...(event.status === "cancelled" ? { deleted: true } : {}), data: { id, title: optionalString(event.summary), start: event.start ?? null, end: event.end ?? null, recurrence: event.recurrence ?? [], recurringEventId: event.recurringEventId ?? null, originalStartTime: event.originalStartTime ?? null, etag: optionalString(event.etag), status: optionalString(event.status), allDay: typeof event.start === "object" && event.start !== null && "date" in event.start, endSemantics: "exclusive", attendees: event.attendees ?? [] } }; });
    const next = optionalString(result.nextPageToken); return { items, cursor: next ? "next:" + Buffer.from(JSON.stringify({ pageToken: next, syncToken })).toString("base64url") : string(result.nextSyncToken), complete: !next, coverage: "primary calendar; series masters and explicit exceptions; exclusive all-day end" };
  }
  const windowStart = new Date(Date.now() - 30 * 86400000).toISOString(); const windowEnd = new Date(Date.now() + 90 * 86400000).toISOString();
  const path = cursor ?? (kind === "mail" ? "/v1.0/me/mailFolders/inbox/messages/delta?$top=25&$select=id,conversationId,parentFolderId,subject,from,receivedDateTime,isRead,body,changeKey" : `/v1.0/me/calendarView/delta?startDateTime=${windowStart}&endDateTime=${windowEnd}`);
  const result = object(await http.request(provider, token, path));
  const values = array(result.value); if (values.length > 1000) throw new Error("Provider page exceeded the projection limit.");
  const items = values.map((value): Projection => {
    const item = object(value); const id = string(item.id); if (item["@removed"]) return { id, data: {}, deleted: true };
    if (kind === "calendar") return { id, data: { id, title: optionalString(item.subject), start: item.start ?? null, end: item.end ?? null, allDay: item.isAllDay === true, endSemantics: "exclusive", type: optionalString(item.type), seriesMasterId: item.seriesMasterId ?? null, originalStartTimeZone: item.originalStartTimeZone ?? null, recurrence: item.recurrence ?? null, cancelled: item.isCancelled === true, etag: optionalString(item["@odata.etag"]), attendees: item.attendees ?? [] } };
    const body = object(item.body ?? {}); const sender = object(object(item.from ?? {}).emailAddress ?? {});
    return { id, data: { id, threadId: optionalString(item.conversationId), folderId: optionalString(item.parentFolderId), subject: optionalString(item.subject), from: optionalString(sender.address), sentAt: optionalString(item.receivedDateTime), isRead: item.isRead === true, body: body.contentType === "text" ? optionalString(body.content).slice(0, 100000) : "", bodyState: body.contentType === "text" ? "plain-text" : "no-plain-text", changeKey: optionalString(item.changeKey) } };
  });
  const next = optionalString(result["@odata.nextLink"]); const delta = optionalString(result["@odata.deltaLink"]);
  if (!next && !delta) throw new Error("Provider page omitted its continuation checkpoint.");
  return { items, cursor: next || delta, complete: !next, coverage: kind === "mail" ? "inbox folder only; immutable IDs; plain-text bodies only" : "calendar-view delta; initial window -30/+90 days; exclusive all-day end" };
}
