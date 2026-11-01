import { randomUUID } from "node:crypto";
import * as net from "node:net";
import * as tls from "node:tls";
import type { SmtpSettings } from "../../config/runtime.js";
import { Failure } from "../../platform/failure.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const testOutbox: Array<{ to: string; subject: string; text: string; html: string; sentAt: Date }> = [];

class SmtpSession {
  private buffer = "";
  private lastReply = "";
  private resolveStep: ((code: string) => void) | undefined = undefined;
  private rejectStep: ((error: Error) => void) | undefined = undefined;
  private socket: net.Socket | tls.TLSSocket;

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.attach(socket);
  }

  private attach(sock: net.Socket | tls.TLSSocket): void {
    sock.on("data", (chunk: Buffer | string) => {
      this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      this.checkBuffer();
    });
    sock.on("error", (err: Error) => {
      if (this.rejectStep) {
        this.rejectStep(err);
        this.rejectStep = undefined;
        this.resolveStep = undefined;
      }
    });
  }

  detach(): void {
    this.socket.removeAllListeners("data");
    this.socket.removeAllListeners("error");
    this.buffer = "";
  }

  upgrade(tlsSocket: tls.TLSSocket): void {
    this.detach();
    this.socket = tlsSocket;
    this.attach(tlsSocket);
  }

  private checkBuffer(): void {
    const lines = this.buffer.split("\r\n");
    if (lines.length <= 1) return;
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!;
      const match = /^(\d{3})(?:[ -](.*))?$/.exec(line);
      if (match) {
        const code = match[1]!;
        const isLast = line.length === 3 || line.charAt(3) === " ";
        if (isLast) {
          this.lastReply = line;
          if (this.resolveStep) {
            this.buffer = lines.slice(i + 1).join("\r\n");
            const resolve = this.resolveStep;
            this.resolveStep = undefined;
            this.rejectStep = undefined;
            resolve(code);
            return;
          }
        }
      }
    }
  }

  async command(cmd: string | null, expectedCode: string, timeoutMs = 15000): Promise<string> {
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolveStep = undefined;
        this.rejectStep = undefined;
        reject(new Failure(504, "SMTP_TIMEOUT", "SMTP server communication timed out."));
      }, timeoutMs);

      this.resolveStep = (resultCode: string) => {
        clearTimeout(timer);
        resolve(resultCode);
      };
      this.rejectStep = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      if (cmd !== null) {
        this.socket.write(cmd + "\r\n");
      }

      this.checkBuffer();
    });

    if (code !== expectedCode) {
      const details = this.lastReply ? `: ${this.lastReply}` : "";
      throw new Failure(502, "SMTP_ERROR", `SMTP server returned unexpected code: ${code} (expected ${expectedCode})${details}.`);
    }

    return code;
  }

  destroy(): void {
    this.socket.destroy();
  }
}

export async function sendMail(settings: SmtpSettings, message: EmailMessage): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.execArgv.includes("--test")) {
    testOutbox.push({ ...message, sentAt: new Date() });
    return;
  }

  if (!settings.host || !settings.port) {
    throw new Failure(503, "SMTP_UNCONFIGURED", "SMTP host and port must be configured.");
  }

  const isGmail = settings.host.toLowerCase().includes("gmail");
  if (isGmail && (!settings.user || !settings.pass)) {
    throw new Failure(503, "SMTP_AUTH_REQUIRED", "Gmail SMTP requires SMTP_USER and SMTP_PASS to be configured.");
  }

  const boundary = "----=_Part_" + randomUUID();
  const dateStr = new Date().toUTCString();
  const envelopeFrom = isGmail && settings.user.includes("@") ? settings.user : settings.fromEmail;
  const rawData = [
    `From: ${settings.fromName} <${settings.fromEmail}>`,
    `To: <${message.to}>`,
    `Reply-To: <${settings.fromEmail}>`,
    ...(envelopeFrom !== settings.fromEmail ? [`Sender: <${envelopeFrom}>`] : []),
    `Subject: ${message.subject}`,
    `Date: ${dateStr}`,
    `Message-ID: <${randomUUID()}@${settings.host}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    message.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    message.html,
    "",
    `--${boundary}--`,
    ".",
  ].join("\r\n");

  const isDirectTls = settings.port === 465;

  let session: SmtpSession | undefined;
  try {
    if (isDirectTls) {
      const tlsSocket = tls.connect({
        host: settings.host,
        port: settings.port,
        minVersion: "TLSv1.2",
        servername: settings.host,
      });
      await new Promise<void>((res, rej) => {
        tlsSocket.once("secureConnect", () => res());
        tlsSocket.once("error", rej);
      });
      session = new SmtpSession(tlsSocket);
      await session.command(null, "220");
    } else {
      const netSocket = net.connect({ host: settings.host, port: settings.port });
      await new Promise<void>((res, rej) => {
        netSocket.once("connect", () => res());
        netSocket.once("error", rej);
      });
      session = new SmtpSession(netSocket);
      await session.command(null, "220");
      await session.command("EHLO tantu.local", "250");
      await session.command("STARTTLS", "220");

      session.detach();

      const upgraded = tls.connect({
        socket: netSocket,
        host: settings.host,
        minVersion: "TLSv1.2",
        servername: settings.host,
      });
      await new Promise<void>((res, rej) => {
        upgraded.once("secureConnect", () => res());
        upgraded.once("error", rej);
      });
      session.upgrade(upgraded);
    }

    await session.command("EHLO tantu.local", "250");

    if (settings.user && settings.pass) {
      const pass = isGmail ? settings.pass.replace(/\s+/g, "") : settings.pass;
      await session.command("AUTH LOGIN", "334");
      await session.command(Buffer.from(settings.user).toString("base64"), "334");
      await session.command(Buffer.from(pass).toString("base64"), "235");
    }

    await session.command(`MAIL FROM:<${envelopeFrom}>`, "250");
    await session.command(`RCPT TO:<${message.to}>`, "250");
    await session.command("DATA", "354");
    await session.command(rawData, "250");
    await session.command("QUIT", "221");
  } catch (error) {
    if (session) session.destroy();
    if (error instanceof Failure) throw error;
    throw new Failure(502, "EMAIL_DELIVERY_FAILED", error instanceof Error ? error.message : "Failed to deliver email.");
  }
}
