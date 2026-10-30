import type { Provider } from "./config.js";
import { Failure } from "../../platform/failure.js";
export class ProviderFailure extends Failure {
  constructor(readonly providerStatus: number, readonly retrySeconds: number) { super(providerStatus === 429 ? 429 : 502, providerStatus === 429 ? "PROVIDER_THROTTLED" : "PROVIDER_FAILED", providerStatus === 429 ? "The provider asked us to wait before trying again." : "The provider request could not be confirmed."); }
}
export function allowedUrl(provider: Provider, path: string): URL {
  const url = new URL(path, provider === "google" ? "https://gmail.googleapis.com" : "https://graph.microsoft.com");
  const roots = provider === "google" ? ["https://gmail.googleapis.com/gmail/v1/users/me/", "https://www.googleapis.com/calendar/v3/"] : ["https://graph.microsoft.com/v1.0/me/"];
  if (url.username || url.password || url.hash || !roots.some((root) => url.href.startsWith(root))) throw new Error("Provider URL is outside its allowed API boundary.");
  return url;
}
export function retrySeconds(value: string | null, now = Date.now()): number {
  if (!value) return 60;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) ? Math.max(1, Math.min(3600, seconds)) : 60;
}
export class ProviderHttp {
  constructor(readonly fetcher: typeof fetch = fetch) {}
  async request(provider: Provider, token: string, path: string, method = "GET", body?: unknown): Promise<unknown> {
    const response = await this.fetcher(allowedUrl(provider, path), { method, redirect: "error", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${token}`, ...(provider === "microsoft" ? { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text", outlook.timezone="UTC"' } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) { await response.body?.cancel(); throw new ProviderFailure(response.status, retrySeconds(response.headers.get("retry-after"))); }
    if (response.status === 202 || response.status === 204) { await response.body?.cancel(); return { accepted: true }; }
    const reader = response.body?.getReader(); if (!reader) throw new Error("Provider response was empty.");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 2_097_152) throw new Error("Provider response limit exceeded."); chunks.push(part.value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); return value;
  }
}
