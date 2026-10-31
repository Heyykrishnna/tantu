import type { PoolConfig } from "pg";

type ConnectionConfiguration = PoolConfig & { enableChannelBinding?: boolean };

export function databaseConfiguration(configuration: PoolConfig, direct = false): ConnectionConfiguration {
  if (!configuration.connectionString) return { ...configuration };
  let url: URL;
  try { url = new URL(configuration.connectionString); }
  catch { throw new Error("Database connection string must be a valid PostgreSQL URL."); }
  if (!url.hostname.endsWith(".neon.tech")) return { ...configuration };
  if (direct && url.hostname.includes("-pooler.")) throw new Error("Neon migrations require a direct connection, without the -pooler hostname suffix.");
  url.searchParams.set("sslmode", "verify-full");
  return {
    ...configuration,
    connectionString: url.href,
    enableChannelBinding: true,
    connectionTimeoutMillis: configuration.connectionTimeoutMillis ?? 20_000,
  };
}
