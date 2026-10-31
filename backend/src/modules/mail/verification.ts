import { randomBytes } from "node:crypto";
import { Failure } from "../../platform/failure.js";

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateVerificationCode(length = 6): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += codeAlphabet[bytes[i]! % codeAlphabet.length];
  }
  return result;
}

export function normalizeVerificationCode(input: string): string {
  const cleaned = input.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 6) {
    throw new Failure(400, "INVALID_CODE", "Verification code must be exactly 6 alphanumeric characters.");
  }
  return cleaned;
}

export function buildVerificationEmail(name: string, code: string): { subject: string; text: string; html: string } {
  const subject = `Your verification code: ${code} - tantu`;
  const text = `Hi ${name},\n\nYour 6-character verification code is: ${code}\n\nThis code will expire in 15 minutes. If you did not request this code, you can safely ignore this email.\n\nBest regards,\nThe tantu team`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f5f6fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.03em;">tantu.</h1>
      <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 13px;">A connected workspace for focused work</p>
    </div>
    <div style="padding: 32px 28px;">
      <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #0f172a;">Verify your email address</h2>
      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
        Hello <strong>${escapeHtml(name)}</strong>, welcome to tantu. Enter the following 6-character code to confirm your email and create your account:
      </p>
      <div style="margin: 28px 0; text-align: center;">
        <div style="display: inline-block; padding: 16px 36px; background-color: #f8fafc; border: 2px dashed #6366f1; border-radius: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #4338ca;">
          ${code}
        </div>
      </div>
      <p style="margin: 0 0 12px 0; font-size: 12px; line-height: 1.5; color: #64748b; text-align: center;">
        This single-use code expires in <strong>15 minutes</strong>.
      </p>
      <hr style="margin: 28px 0; border: 0; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #94a3b8; text-align: center;">
        If you did not initiate this request, someone may have entered your email by mistake. You can safely ignore this message.
      </p>
    </div>
  </div>
</body>
</html>`;
  return { subject, text, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

