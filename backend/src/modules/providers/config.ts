export type Provider = "google" | "microsoft";
export interface Registration { issuer: string; clientId: string; clientSecret: string; scopes: string[] }
export interface ProviderSettings { key: Buffer | null; registrations: Partial<Record<Provider, Registration>> }
export function readProviderSettings(environment = process.env): ProviderSettings {
  const registrations: Partial<Record<Provider, Registration>> = {};
  const encoded = environment.PROVIDER_VAULT_KEY;
  let key: Buffer | null = null;
  if (encoded) {
    key = Buffer.from(encoded, "base64url");
    if (key.length !== 32 || key.toString("base64url") !== encoded) throw new Error("PROVIDER_VAULT_KEY must be a canonical base64url encoding of 32 random bytes.");
  }
  for (const provider of ["google", "microsoft"] as const) {
    const prefix = provider.toUpperCase();
    const clientId = environment[`${prefix}_CLIENT_ID`]; const clientSecret = environment[`${prefix}_CLIENT_SECRET`];
    if (!clientId && !clientSecret) continue;
    if (!key || !clientId || !clientSecret) throw new Error(`${prefix} requires a vault key and both client credentials.`);
    const tenant = environment.MICROSOFT_TENANT_ID ?? "";
    if (provider === "microsoft" && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tenant)) throw new Error("MICROSOFT_TENANT_ID must identify the explicitly approved tenant.");
    registrations[provider] = { clientId, clientSecret, issuer: provider === "google" ? "https://accounts.google.com" : `https://login.microsoftonline.com/${tenant}/v2.0`, scopes: provider === "google" ? ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/calendar.readonly"] : ["openid", "email", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.Read"] };
  }
  return { key, registrations };
}
