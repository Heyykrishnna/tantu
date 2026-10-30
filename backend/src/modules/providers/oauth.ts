import * as oauth from "oauth4webapi";
import type { Registration } from "./config.js";

function transport(fetcher: typeof fetch) {
  return (url: string, options: oauth.CustomFetchOptions<string, URLSearchParams | string | undefined>) => fetcher(url, { method: options.method, headers: options.headers, redirect: options.redirect, ...(options.body === undefined ? {} : { body: options.body }), ...(options.signal ? { signal: options.signal } : {}) });
}

export interface OAuthConfiguration { server: oauth.AuthorizationServer; client: oauth.Client; authentication: oauth.ClientAuth; fetcher: typeof fetch }
export async function discover(registration: Registration, fetcher: typeof fetch = fetch): Promise<OAuthConfiguration> {
  const issuer = new URL(registration.issuer);
  const response = await oauth.discoveryRequest(issuer, { [oauth.customFetch]: transport(fetcher), signal: AbortSignal.timeout(15_000) });
  const server = await oauth.processDiscoveryResponse(issuer, response);
  return { server, client: { client_id: registration.clientId }, authentication: oauth.ClientSecretPost(registration.clientSecret), fetcher };
}
export function authorizationUrl(configuration: OAuthConfiguration, parameters: Record<string, string>): URL {
  const endpoint = configuration.server.authorization_endpoint;
  if (!endpoint) throw new Error("Provider omitted its authorization endpoint.");
  const url = new URL(endpoint); if (url.protocol !== "https:") throw new Error("Provider consent requires HTTPS.");
  url.search = new URLSearchParams({ ...parameters, client_id: configuration.client.client_id, response_type: "code" }).toString(); return url;
}
export async function exchange(configuration: OAuthConfiguration, url: URL, redirect: string, verifier: string, state: string, nonce: string): Promise<{ tokens: oauth.TokenEndpointResponse; claims: oauth.IDToken; info: oauth.UserInfoResponse }> {
  const { server, client, authentication, fetcher } = configuration;
  const parameters = oauth.validateAuthResponse(server, client, url, state);
  const response = await oauth.authorizationCodeGrantRequest(server, client, authentication, parameters, redirect, verifier, { [oauth.customFetch]: transport(fetcher), signal: AbortSignal.timeout(15_000) });
  const tokens = await oauth.processAuthorizationCodeResponse(server, client, response, { expectedNonce: nonce, requireIdToken: true });
  await oauth.validateApplicationLevelSignature(server, response, { [oauth.customFetch]: transport(fetcher), signal: AbortSignal.timeout(15_000) });
  const claims = oauth.getValidatedIdTokenClaims(tokens); if (!claims) throw new Error("Provider identity is missing.");
  const userInfo = await oauth.userInfoRequest(server, client, tokens.access_token, { [oauth.customFetch]: transport(fetcher), signal: AbortSignal.timeout(15_000) });
  const info = await oauth.processUserInfoResponse(server, client, claims.sub, userInfo);
  return { tokens, claims, info };
}
export async function refresh(configuration: OAuthConfiguration, refreshToken: string): Promise<oauth.TokenEndpointResponse> {
  const { server, client, authentication, fetcher } = configuration;
  const response = await oauth.refreshTokenGrantRequest(server, client, authentication, refreshToken, { [oauth.customFetch]: transport(fetcher), signal: AbortSignal.timeout(15_000) });
  const tokens = await oauth.processRefreshTokenResponse(server, client, response);
  if (tokens.id_token) await oauth.validateApplicationLevelSignature(server, response, { [oauth.customFetch]: transport(fetcher), signal: AbortSignal.timeout(15_000) });
  return tokens;
}
export { generateRandomCodeVerifier, generateRandomNonce, generateRandomState, calculatePKCECodeChallenge } from "oauth4webapi";
