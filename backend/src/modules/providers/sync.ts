import { randomUUID } from "node:crypto";
import type { Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import { ProviderFailure } from "./http.js";
import { projectionPage } from "./projections.js";
import type { Providers } from "./service.js";

export async function syncPage(providers: Providers, scope: Scope, connectionId: string, kind: "mail" | "calendar"): Promise<{ state: string; complete?: boolean; count?: number; coverage?: string }> {
  return providers.database.transaction(scope, async (client) => {
    const member = await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR SHARE", [scope.workspaceId, scope.userId]);
    if (!member.rowCount) throw new Failure(404, "NOT_FOUND", "Workspace is unavailable.");
    const connection = await providers.connection(client, connectionId);
    const cursor = (await client.query<{ cursor: string | null; generation: string }>("SELECT cursor,generation FROM tantu.provider_cursors WHERE connection_id=$1 AND kind=$2 FOR UPDATE", [connectionId, kind])).rows[0];
    const generation = cursor?.generation ?? randomUUID();
    try {
      const token = await providers.access(client, connection);
      const page = await projectionPage(providers.http, connection.provider, token, kind, cursor?.cursor ?? null);
      for (const item of page.items) {
        if (item.deleted) await client.query("DELETE FROM tantu.provider_projections WHERE connection_id=$1 AND kind=$2 AND external_id=$3", [connectionId, kind, item.id]);
        else await client.query("INSERT INTO tantu.provider_projections VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,kind,external_id) DO UPDATE SET data=excluded.data,generation=excluded.generation", [scope.workspaceId, connectionId, item.id, kind, JSON.stringify(item.data), generation]);
      }
      await client.query("INSERT INTO tantu.provider_cursors(workspace_id,connection_id,kind,cursor,generation,coverage) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,kind) DO UPDATE SET cursor=excluded.cursor,generation=excluded.generation,coverage=excluded.coverage", [scope.workspaceId, connectionId, kind, page.cursor, generation, page.coverage]);
      if (kind === "mail") await client.query("INSERT INTO tantu.mail_preferences(workspace_id,connection_id,message_id,tag) SELECT p.workspace_id,p.connection_id,p.external_id,r.tag FROM tantu.provider_projections p JOIN LATERAL(SELECT tag FROM tantu.mail_rules r WHERE r.connection_id=p.connection_id AND r.enabled AND strpos(lower(p.data->>r.field),lower(r.contains))>0 ORDER BY r.id LIMIT 1)r ON true WHERE p.connection_id=$1 AND p.kind='mail' AND p.external_id=ANY($2::text[]) ON CONFLICT(connection_id,message_id) DO UPDATE SET tag=excluded.tag,version=tantu.mail_preferences.version+1 WHERE tantu.mail_preferences.tag IS DISTINCT FROM excluded.tag", [connectionId, page.items.filter(item => !item.deleted).map(item => item.id)]);
      if (page.complete) {
        await client.query("DELETE FROM tantu.provider_projections WHERE connection_id=$1 AND kind=$2 AND generation<>$3", [connectionId, kind, generation]);
        await client.query("UPDATE tantu.provider_connections SET last_synced_at=now(),retry_at=NULL WHERE id=$1", [connectionId]);
      }
      return { state: page.complete ? "confirmed" : "pending", complete: page.complete, count: page.items.length, coverage: page.coverage };
    } catch (error) {
      if (error instanceof ProviderFailure && [404, 410].includes(error.providerStatus)) {
        await client.query("INSERT INTO tantu.provider_cursors(workspace_id,connection_id,kind,generation,coverage) VALUES($1,$2,$3,$4,'rebuilding provider projection') ON CONFLICT(connection_id,kind) DO UPDATE SET cursor=NULL,generation=excluded.generation,coverage=excluded.coverage", [scope.workspaceId, connectionId, kind, randomUUID()]);
        return { state: "rebuilding" };
      }
      if ((error instanceof ProviderFailure && error.providerStatus === 401) || (error instanceof Failure && error.code === "REAUTHORIZE")) await client.query("UPDATE tantu.provider_connections SET status='reauthorize',version=version+1 WHERE id=$1", [connectionId]);
      if (error instanceof ProviderFailure && error.providerStatus === 429) await client.query("UPDATE tantu.provider_connections SET retry_at=now()+$2*interval '1 second' WHERE id=$1", [connectionId, error.retrySeconds]);
      return { state: error instanceof ProviderFailure && error.providerStatus === 429 ? "throttled" : "failed" };
    }
  });
}
