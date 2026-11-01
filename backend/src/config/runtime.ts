import { isAbsolute } from "node:path";
import type { ServerConfig } from "./environment.js";

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
  readonly fromName: string;
  readonly fromEmail: string;
}

export interface RuntimeSettings {
  readonly origin: string;
  readonly secureCookies: boolean;
  readonly storagePath: string;
  readonly signingSecret: string;
  readonly scannerHost: string;
  readonly scannerPort: number;
  readonly smtp: SmtpSettings;
}

export function readRuntimeSettings(config: ServerConfig, environment = process.env): RuntimeSettings {
  const origin = new URL(environment.APP_ORIGIN ?? "http://localhost:3000");
  if (origin.origin !== origin.href.replace(/\/$/, "") || origin.username || origin.password || !["http:", "https:"].includes(origin.protocol)) throw new Error("APP_ORIGIN must be an HTTP origin without a path.");
  if (config.nodeEnvironment === "production" && origin.protocol !== "https:") throw new Error("Production APP_ORIGIN requires HTTPS.");
  const storagePath = environment.FILE_STORAGE_PATH ?? "";
  if (!isAbsolute(storagePath)) throw new Error("FILE_STORAGE_PATH must be an explicit absolute private directory.");
  const signingSecret = environment.FILE_SIGNING_SECRET ?? "";
  if (Buffer.byteLength(signingSecret) < 32) throw new Error("FILE_SIGNING_SECRET requires at least 32 bytes from a cryptographic generator.");
  const scannerHost = environment.SCANNER_HOST ?? "127.0.0.1";
  const scannerPort = Number(environment.SCANNER_PORT ?? "3310");
  if (!scannerHost || !Number.isInteger(scannerPort) || scannerPort < 1 || scannerPort > 65535) throw new Error("Scanner host/port are invalid.");
  const smtpHost = environment.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number(environment.SMTP_PORT ?? "587");
  const smtpUser = environment.SMTP_USER ?? environment.SMTP_USERNAME ?? "";
  const rawPass = (environment.SMTP_PASS ?? environment.SMTP_PASSWORD ?? "").replace(/^["']|["']$/g, "").trim();
  const smtpPass = smtpHost.includes("gmail") ? rawPass.replace(/\s+/g, "") : rawPass;
  const smtpFromName = environment.SMTP_FROM_NAME ?? "tantu";
  const smtpFromEmail = environment.SMTP_FROM_EMAIL ?? environment.SENDER_EMAIL ?? "support@dradix.dev";
  const smtp: SmtpSettings = {
    host: smtpHost,
    port: Number.isInteger(smtpPort) && smtpPort >= 1 && smtpPort <= 65535 ? smtpPort : 587,
    user: smtpUser,
    pass: smtpPass,
    fromName: smtpFromName,
    fromEmail: smtpFromEmail,
  };
  return { origin: origin.origin, secureCookies: origin.protocol === "https:", storagePath, signingSecret, scannerHost, scannerPort, smtp };
}
