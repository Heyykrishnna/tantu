import type { Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import type { Providers } from "./service.js";
import { object, string } from "./vault.js";
import { ProviderFailure } from "./http.js";

interface Intent { id: string; connection_id: string; draft_id: string; draft_version: number; message_id: string; provider_id: string | null; state: string; connection_version: number; expires_at: Date }
async function liveMember(providers: Providers, scope: Scope): Promise<void> {
  if (!(await providers.database.pool.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active", [scope.workspaceId, scope.userId])).rowCount) throw new Failure(404, "NOT_FOUND", "Workspace is unavailable.");
}
export async function executeSend(providers: Providers, scope: Scope, id: string): Promise<{ state: string }> {
  await liveMember(providers, scope);
  const claimed = await providers.database.transaction(scope, async (client) => {
    const intent = (await client.query<Intent>("SELECT i.*,r.connection_version,r.expires_at FROM tantu.send_intents i JOIN tantu.send_reviews r ON r.id=i.review_id WHERE i.id=$1 FOR UPDATE OF i", [id])).rows[0];
    if (!intent) throw new Failure(404, "NOT_FOUND", "Send intent is unavailable.");
    if (intent.state !== "pending") return false;
    await client.query("UPDATE tantu.send_intents SET state='unknown' WHERE id=$1", [id]); return true;
  });
  if (!claimed) return providers.database.transaction(scope, async (client) => ({ state: (await client.query<{ state: string }>("SELECT state FROM tantu.send_intents WHERE id=$1", [id])).rows[0]?.state ?? "unknown" }));
  return providers.database.transaction(scope, async (client) => {
    const member = await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR SHARE", [scope.workspaceId, scope.userId]);
    if (!member.rowCount) return { state: "unknown" };
    const intent = (await client.query<Intent>("SELECT i.*,r.connection_version,r.expires_at FROM tantu.send_intents i JOIN tantu.send_reviews r ON r.id=i.review_id WHERE i.id=$1 AND i.state='unknown' FOR UPDATE OF i", [id])).rows[0];
    if (!intent) return { state: "unknown" };
    const connection = (await client.query<{ id: string; status: string; version: number }>("SELECT id,status,version FROM tantu.provider_connections WHERE id=$1 FOR UPDATE", [intent.connection_id])).rows[0];
    const draft = (await client.query<{ recipients: string[]; subject: string; body: string; version: number }>("SELECT recipients,subject,body,version FROM tantu.mail_drafts WHERE id=$1 FOR UPDATE", [intent.draft_id])).rows[0];
    if (intent.expires_at.getTime() < Date.now() || !connection || connection.status !== "active" || connection.version !== intent.connection_version || !draft || draft.version !== intent.draft_version) { await client.query("UPDATE tantu.send_intents SET state='failed' WHERE id=$1", [id]); return { state: "failed" }; }
    let attempted = false;
    try {
      const account = await providers.connection(client, connection.id); const token = await providers.access(client, account);
      if (!/^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/.test(account.address)) throw new Failure(409, "INVALID_SENDER", "The connected account did not supply a usable sender address.");
      if (account.provider === "google") {
        const raw = [`From: ${account.address}`, `To: ${draft.recipients.join(", ")}`, `Subject: =?UTF-8?B?${Buffer.from(draft.subject).toString("base64")}?=`, `Message-ID: <${intent.message_id}>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(draft.body).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? ""].join("\r\n");
        attempted = true; const result = object(await providers.http.request(account.provider, token, "/gmail/v1/users/me/messages/send", "POST", { raw: Buffer.from(raw).toString("base64url") }));
        await client.query("UPDATE tantu.send_intents SET state='confirmed',provider_id=$2 WHERE id=$1", [id, string(result.id)]);
      } else {
        attempted = true; const draftResult = object(await providers.http.request(account.provider, token, "/v1.0/me/messages", "POST", { subject: draft.subject, body: { contentType: "Text", content: draft.body }, toRecipients: draft.recipients.map((address) => ({ emailAddress: { address } })), internetMessageHeaders: [{ name: "x-tantu-intent", value: intent.message_id }] }));
        const providerId = string(draftResult.id); await client.query("UPDATE tantu.send_intents SET provider_id=$2 WHERE id=$1", [id, providerId]);
        await providers.http.request(account.provider, token, `/v1.0/me/messages/${encodeURIComponent(providerId)}/send`, "POST");
        await client.query("UPDATE tantu.send_intents SET state='confirmed' WHERE id=$1", [id]);
      }
      return { state: "confirmed" };
    } catch (error) {
      const knownRejection = error instanceof ProviderFailure && [400, 401, 403, 404, 413, 429].includes(error.providerStatus);
      const state = !attempted || knownRejection ? "failed" : "unknown";
      await client.query("UPDATE tantu.send_intents SET state=$2 WHERE id=$1", [id, state]); return { state };
    }
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
