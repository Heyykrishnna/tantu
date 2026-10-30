import { randomUUID } from "node:crypto";
import * as oidc from "./oauth.js";
import type { OAuthConfiguration } from "./oauth.js";
import type { PoolClient } from "pg";
import type { Database, Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import type { RuntimeSettings } from "../../config/runtime.js";
import type { Provider, ProviderSettings } from "./config.js";
import { readProviderSettings } from "./config.js";
import { open, seal, string } from "./vault.js";
import { ProviderHttp } from "./http.js";

export interface Connection { id: string; provider: Provider; subject: string; address: string; vault: unknown; scopes: string[]; expires_at: Date; version: number; status: string; retry_at: Date | null }
export class Providers {
  readonly configurations = new Map<Provider, Promise<OAuthConfiguration>>();
  constructor(readonly database: Database, readonly runtime: RuntimeSettings, readonly settings: ProviderSettings = readProviderSettings(), readonly http = new ProviderHttp()) {}
  configuration(provider: Provider): Promise<OAuthConfiguration> {
    const registration = this.settings.registrations[provider];
    if (!registration || !this.settings.key) throw new Failure(503, "PROVIDER_DISABLED", "An operator must configure this provider registration before accounts can connect.");
    let configuration = this.configurations.get(provider);
    if (!configuration) {
      configuration = oidc.discover(registration).catch((error: unknown) => { this.configurations.delete(provider); throw error; });
      this.configurations.set(provider, configuration);
    }
    return configuration;
  }
  redirect(workspaceId: string, provider: Provider): string { return this.runtime.origin + `/api/v1/workspaces/${workspaceId}/providers/${provider}/callback`; }
  async connection(client: PoolClient, id: string): Promise<Connection> {
    const connection = (await client.query<Connection>("SELECT * FROM tantu.provider_connections WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!connection || connection.status !== "active") throw new Failure(409, "CONNECTION_UNAVAILABLE", "Reconnect this account before continuing.");
    if (connection.retry_at && connection.retry_at.getTime() > Date.now()) throw new Failure(429, "PROVIDER_THROTTLED", "The account is waiting for its provider retry window.");
    return connection;
  }
  async access(client: PoolClient, connection: Connection): Promise<string> {
    const tokens = open(connection.vault, this.settings.key, "connection:" + connection.id);
    if (connection.expires_at.getTime() > Date.now() + 60_000) return string(tokens.access_token);
    if (typeof tokens.refresh_token !== "string") throw new Failure(409, "REAUTHORIZE", "Reconnect this account to renew provider consent.");
    try {
      const renewed = await oidc.refresh(await this.configuration(connection.provider), tokens.refresh_token);
      const vault = seal({ access_token: renewed.access_token, refresh_token: renewed.refresh_token ?? tokens.refresh_token }, this.settings.key, "connection:" + connection.id);
      await client.query("UPDATE tantu.provider_connections SET vault=$2,expires_at=now()+$3*interval '1 second' WHERE id=$1", [connection.id, JSON.stringify(vault), renewed.expires_in ?? 300]);
      return renewed.access_token;
    } catch { throw new Failure(409, "REAUTHORIZE", "Provider consent could not be renewed. Reconnect the account."); }
  }
  async begin(scope: Scope, provider: Provider, sessionHash: string): Promise<{ url: string }> {
    const config = await this.configuration(provider); const registration = this.settings.registrations[provider];
    if (!registration) throw new Error("Provider registration missing.");
    const verifier = oidc.generateRandomCodeVerifier(); const state = oidc.generateRandomState(); const nonce = oidc.generateRandomNonce();
    const { digest } = await import("../workspace-access/credentials.js"); const hash = digest(state);
    await this.database.transaction(scope, async (client) => {
      await client.query("DELETE FROM tantu.oauth_states WHERE expires_at<now()");
      if (Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.oauth_states")).rows[0]?.count) >= 10) throw new Failure(429, "CONSENT_LIMIT", "Finish an existing connection request or wait ten minutes.");
      await client.query("INSERT INTO tantu.oauth_states(state_hash,workspace_id,user_id,session_hash,provider,vault) VALUES($1,$2,$3,$4,$5,$6)", [hash, scope.workspaceId, scope.userId, sessionHash, provider, JSON.stringify(seal({ verifier, nonce }, this.settings.key, "oauth:" + hash))]);
    });
    return { url: oidc.authorizationUrl(config, { redirect_uri: this.redirect(scope.workspaceId, provider), scope: registration.scopes.join(" "), state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256", ...(provider === "google" ? { access_type: "offline", prompt: "consent" } : {}) }).href };
  }
  async complete(scope: Scope, provider: Provider, sessionHash: string, query: string, state: string): Promise<void> {
    const { digest } = await import("../workspace-access/credentials.js"); const hash = digest(state);
    const pending = await this.database.transaction(scope, async (client) => (await client.query<{ vault: unknown }>("DELETE FROM tantu.oauth_states WHERE state_hash=$1 AND session_hash=$2 AND provider=$3 AND expires_at>now() RETURNING vault", [hash, sessionHash, provider])).rows[0]);
    if (!pending) throw new Failure(400, "INVALID_CONSENT", "This consent request expired or was already used. Start a new connection.");
    const secret = open(pending.vault, this.settings.key, "oauth:" + hash); const config = await this.configuration(provider);
    const { tokens, claims, info } = await oidc.exchange(config, new URL(this.redirect(scope.workspaceId, provider) + query), this.redirect(scope.workspaceId, provider), string(secret.verifier), state, string(secret.nonce));
    const address = typeof info.email === "string" ? info.email : typeof claims.preferred_username === "string" ? claims.preferred_username : claims.sub;
    await this.database.transaction(scope, async (client) => {
      if (!(await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR SHARE", [scope.workspaceId, scope.userId])).rowCount) throw new Failure(404, "NOT_FOUND", "Workspace is unavailable.");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,62))", [scope.workspaceId + scope.userId]);
      const previous = (await client.query<{ id: string }>("SELECT id FROM tantu.provider_connections WHERE provider=$1 AND subject=$2", [provider, claims.sub])).rows[0];
      const id = previous?.id ?? randomUUID();
      if (!previous && Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.provider_connections")).rows[0]?.count) >= 10) throw new Failure(409, "QUOTA_EXCEEDED", "Ten provider connections are supported per workspace and user.");
      const vault = seal({ access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? null }, this.settings.key, "connection:" + id);
      const granted = tokens.scope?.split(" ") ?? [];
      await client.query("INSERT INTO tantu.provider_connections(id,workspace_id,user_id,provider,subject,address,vault,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+$9*interval '1 second') ON CONFLICT(workspace_id,user_id,provider,subject) DO UPDATE SET address=excluded.address,vault=excluded.vault,scopes=excluded.scopes,expires_at=excluded.expires_at,status='active',version=tantu.provider_connections.version+1,retry_at=NULL", [id, scope.workspaceId, scope.userId, provider, claims.sub, address.slice(0, 254), JSON.stringify(vault), granted, tokens.expires_in ?? 300]);
    });
  }
}
