const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export type LogLevel = (typeof logLevels)[number];
export type NodeEnvironment = "development" | "test" | "production";

export interface ServerConfig {
  readonly nodeEnvironment: NodeEnvironment;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
}

function isLogLevel(value: string): value is LogLevel {
  return logLevels.some((level) => level === value);
}

export function readEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const nodeEnvironment = environment.NODE_ENV ?? "development";
  const host = environment.HOST ?? "127.0.0.1";
  const rawPort = environment.PORT ?? "4000";
  const logLevel = environment.LOG_LEVEL ?? "info";

  if (
    nodeEnvironment !== "development" &&
    nodeEnvironment !== "test" &&
    nodeEnvironment !== "production"
  ) {
    throw new Error("NODE_ENV must be development, test, or production.");
  }

  if (host.length === 0 || host.trim() !== host || /\s/.test(host)) {
    throw new Error("HOST must be a nonempty hostname or IP address without whitespace.");
  }

  if (!/^\d+$/.test(rawPort)) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const port = Number(rawPort);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  if (!isLogLevel(logLevel)) {
    throw new Error("LOG_LEVEL must be a supported logging level.");
  }

  return { nodeEnvironment, host, port, logLevel };
}
