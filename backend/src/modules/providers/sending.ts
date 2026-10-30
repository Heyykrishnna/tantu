import type { Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import type { Providers } from "./service.js";
import { object, string, array } from "./vault.js";
import { ProviderFailure } from "./http.js";
import { attachments, attachmentBytes, mimeMessage } from "./mail-content.js";
interface Intent { id: string; connection_id: string; draft_id: string; draft_version: number; message_id: string; provider_id: string | null; state: string; connection_version: number; expires_at: Date; attachment_fingerprint: string }
export async function executeSend(providers: Providers, scope: Scope, id: string): Promise<{ state: string }> {
  const claimed = await providers.database.transaction(scope, async client => { if (!(await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR SHARE", [scope.workspaceId, scope.userId])).rowCount) throw new Failure(404, "NOT_FOUND", "Workspace unavailable."); const intent = (await client.query<{ state: string }>("SELECT state FROM tantu.send_intents WHERE id=$1 FOR UPDATE", [id])).rows[0]; if (!intent) throw new Failure(404, "NOT_FOUND", "Send intent unavailable."); if (intent.state !== "pending") return false; await client.query("UPDATE tantu.send_intents SET state='unknown' WHERE id=$1", [id]); return true; });
  if (!claimed) return providers.database.transaction(scope, async client => ({ state: (await client.query<{ state: string }>("SELECT state FROM tantu.send_intents WHERE id=$1", [id])).rows[0]?.state ?? "unknown" }));
  return providers.database.transaction(scope, async client => {
    if (!(await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR SHARE", [scope.workspaceId, scope.userId])).rowCount) return { state: "unknown" };
    const intent = (await client.query<Intent>("SELECT i.*,r.connection_version,r.expires_at,r.attachment_fingerprint FROM tantu.send_intents i JOIN tantu.send_reviews r ON r.id=i.review_id WHERE i.id=$1 FOR UPDATE OF i", [id])).rows[0]; if (!intent) return { state: "unknown" }; let attempted = false;
    try {
      const account = await providers.connection(client, intent.connection_id); const draft = (await client.query<{ recipients: string[]; subject: string; body: string; version: number; mode: string; source_id: string | null; source_meta: unknown; attachment_ids: string[] }>("SELECT * FROM tantu.mail_drafts WHERE id=$1 FOR UPDATE", [intent.draft_id])).rows[0]; if (!draft || draft.version !== intent.draft_version || account.version !== intent.connection_version || intent.expires_at.getTime() < Date.now()) throw new Failure(409, "REVIEW_EXPIRED", "Review the current draft again.");
      const files = await attachments(client, draft.attachment_ids, account.provider); if (files.fingerprint !== intent.attachment_fingerprint) throw new Failure(409, "ATTACHMENT_CHANGED", "An attachment changed after review."); const bytes = await attachmentBytes(providers, files.items); const token = await providers.access(client, account);
      if (!/^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/.test(account.address)) throw new Failure(409, "INVALID_SENDER", "Reconnect with a usable sender address.");
      if (account.provider === "google") { const source = draft.mode === "reply" || draft.mode === "replyAll" ? object(draft.source_meta) : {}; const raw = mimeMessage(account.address, draft.recipients, draft.subject, draft.body, intent.message_id, source, bytes); attempted = true; const result = object(await providers.http.request(account.provider, token, "/gmail/v1/users/me/messages/send", "POST", { raw: Buffer.from(raw).toString("base64url"), ...(typeof source.threadId === "string" ? { threadId: source.threadId } : {}) })); await client.query("UPDATE tantu.send_intents SET state='confirmed',provider_id=$2 WHERE id=$1", [id, string(result.id)]); }
      else {
        const content = { subject: draft.subject, body: { contentType: "Text", content: draft.body }, toRecipients: draft.recipients.map(address => ({ emailAddress: { address } })), ccRecipients: [], bccRecipients: [] }; let providerDraft: Record<string, unknown>; attempted = true;
        if (draft.mode !== "new" && draft.source_id) { const action = draft.mode === "reply" ? "createReply" : draft.mode === "replyAll" ? "createReplyAll" : "createForward"; providerDraft = object(await providers.http.request(account.provider, token, `/v1.0/me/messages/${encodeURIComponent(draft.source_id)}/${action}`, "POST", {})); const inherited = object(await providers.http.request(account.provider, token, `/v1.0/me/messages/${encodeURIComponent(string(providerDraft.id))}/attachments?$select=id&$top=100`)); const inheritedFiles = array(inherited.value ?? []); if (inherited["@odata.nextLink"] || inheritedFiles.length > 100) throw new Failure(409, "ATTACHMENT_REVIEW_REQUIRED", "The inherited provider draft has too many attachments. No message was sent."); for (const item of inheritedFiles) await providers.http.request(account.provider, token, `/v1.0/me/messages/${encodeURIComponent(string(providerDraft.id))}/attachments/${encodeURIComponent(string(object(item).id))}`, "DELETE"); await providers.http.request(account.provider, token, `/v1.0/me/messages/${encodeURIComponent(string(providerDraft.id))}`, "PATCH", content); }
        else providerDraft = object(await providers.http.request(account.provider, token, "/v1.0/me/messages", "POST", { ...content, internetMessageHeaders: [{ name: "x-tantu-intent", value: intent.message_id }] }));
        const providerId = string(providerDraft.id); await client.query("UPDATE tantu.send_intents SET provider_id=$2 WHERE id=$1", [id, providerId]); for (const { file, bytes: contentBytes } of bytes) await providers.http.request(account.provider, token, `/v1.0/me/messages/${encodeURIComponent(providerId)}/attachments`, "POST", { "@odata.type": "#microsoft.graph.fileAttachment", name: file.name, contentType: file.mediaType, contentBytes: contentBytes.toString("base64") }); await providers.http.request(account.provider, token, `/v1.0/me/messages/${encodeURIComponent(providerId)}/send`, "POST"); await client.query("UPDATE tantu.send_intents SET state='confirmed' WHERE id=$1", [id]);
      }
      return { state: "confirmed" };
    } catch (error) { const rejected = error instanceof ProviderFailure && [400, 401, 403, 404, 409, 412, 413, 429].includes(error.providerStatus); const state = !attempted || rejected ? "failed" : "unknown"; await client.query("UPDATE tantu.send_intents SET state=$2 WHERE id=$1", [id, state]); return { state }; }
  });
}
export async function reconcileSend(providers: Providers, scope: Scope, id: string): Promise<{ state: string }> {
  return providers.database.transaction(scope, async (client) => {
    const intent = (await client.query<Intent>("SELECT * FROM tantu.send_intents WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!intent) throw new Failure(404, "NOT_FOUND", "Send intent is unavailable.");
    if (intent.state !== "unknown") return { state: intent.state };
    const account = await providers.connection(client, intent.connection_id); const token = await providers.access(client, account);
    let confirmed = false;
    if (account.provider === "google") {
      const result = object(await providers.http.request(account.provider, token, `/gmail/v1/users/me/messages?labelIds=SENT&q=${encodeURIComponent("rfc822msgid:" + intent.message_id)}&maxResults=2`));
      if (Array.isArray(result.messages) && result.messages.length > 0) { confirmed = true; await client.query("UPDATE tantu.send_intents SET provider_id=$2 WHERE id=$1", [id, string(object(result.messages[0]).id)]); }
    } else if (intent.provider_id) {
      try { const result = object(await providers.http.request(account.provider, token, `/v1.0/me/messages/${encodeURIComponent(intent.provider_id)}?$select=id,isDraft`)); confirmed = result.isDraft === false; }
      catch (error) { if (!(error instanceof ProviderFailure && error.providerStatus === 404)) throw error; }
    }
    if (confirmed) await client.query("UPDATE tantu.send_intents SET state='confirmed' WHERE id=$1", [id]);
    return { state: confirmed ? "confirmed" : "unknown" };
  });
}
