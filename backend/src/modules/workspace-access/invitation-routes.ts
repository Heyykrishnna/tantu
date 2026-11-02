import type { FastifyInstance } from "fastify";
import { email, object, password, text, uuid, workspaceParams } from "../../http/schema.js";
import { acceptInvitation, createInvitation, invitationLimit, previewInvitation, revokeInvitation, updateInvitation } from "./invitations.js";
import type { InvitationInput, InvitationUpdate } from "./invitations.js";
import { cookies } from "./service.js";
import type { Identity } from "./service.js";

const invitationParams = object({ workspaceId: uuid, tokenHash: { type: "string", pattern: "^[a-f0-9]{64}$" } });
const role = { enum: ["admin", "member", "guest"] };
const permission = { enum: ["read", "edit"] };
const recordId = { anyOf: [uuid, { type: "null" }] };

export function invitationRoutes(app: FastifyInstance, identity: Identity) {
  const root = "/api/v1/workspaces/:workspaceId/invitations";
  app.post<{ Params: { workspaceId: string }; Body: InvitationInput }>(root, { schema: { params: workspaceParams, body: object({ email, role, permission, recordId, delivery: { enum: ["link", "email"] } }, ["email", "role", "permission"]) } }, async (request, reply) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return reply.code(201).send(await createInvitation(identity, scope, request.body));
  });
  app.get<{ Params: { workspaceId: string } }>(root, { schema: { params: workspaceParams } }, async request => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return identity.database.transaction(scope, async client => {
      await identity.requireManager(client, scope);
      const result = await client.query("SELECT token_hash AS id,email,role,record_id AS \"recordId\",permission,expires_at::text AS \"expiresAt\" FROM tantu.invitations WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 100", [scope.workspaceId]);
      return { items: result.rows };
    });
  });
  app.patch<{ Params: { workspaceId: string; tokenHash: string }; Body: InvitationUpdate }>(root + "/:tokenHash", { schema: { params: invitationParams, body: object({ role, permission, recordId }, ["role", "permission"]) } }, async request => updateInvitation(identity, await identity.scope(request, request.params.workspaceId, true), request.params.tokenHash, request.body));
  app.delete<{ Params: { workspaceId: string; tokenHash: string } }>(root + "/:tokenHash", { schema: { params: invitationParams } }, async request => revokeInvitation(identity, await identity.scope(request, request.params.workspaceId, true), request.params.tokenHash));
  app.post<{ Body: { token: string } }>("/api/v1/invitations/preview", { schema: { body: object({ token: text(100) }) } }, async request => {
    identity.requireOrigin(request);
    await invitationLimit(identity, "invitation-preview:" + request.ip, 60);
    return previewInvitation(identity, request.body.token);
  });
  app.post<{ Body: { token: string; name?: string; password?: string } }>("/api/v1/invitations/accept", { schema: { body: object({ token: text(100), name: { ...text(100), pattern: "\\S" }, password }, ["token"]) } }, async (request, reply) => {
    identity.requireOrigin(request);
    await invitationLimit(identity, "invitation-accept:" + request.ip, 20);
    const authenticated = cookies(request).has("tantu_session") ? await identity.session(request, true) : undefined;
    const accepted = await acceptInvitation(identity, request.body.token, request.body, authenticated);
    return { workspaceId: accepted.workspaceId, ...await identity.issueSession(accepted.userId, reply, cookies(request).get("tantu_session")) };
  });
}
