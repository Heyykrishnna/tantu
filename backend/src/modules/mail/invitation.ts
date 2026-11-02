import type { EmailMessage } from "./smtp.js";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function invitationLink(origin: string, token: string): string {
  const url = new URL("/settings", origin);
  url.hash = new URLSearchParams({ invite: token }).toString();
  return url.href;
}

export function buildInvitationEmail(to: string, workspace: string, inviter: string, role: string, link: string): EmailMessage {
  return {
    to,
    subject: "You are invited to a tantu workspace",
    text: `${inviter} invited you to ${workspace} as a ${role}.\n\nOpen this link to sign in or create your invited account:\n${link}\n\nThis invitation is for ${to} and expires in 72 hours. If you did not expect it, you can ignore this message.`,
    html: `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b"><h1>You are invited to a workspace</h1><p>${escape(inviter)} invited you to <strong>${escape(workspace)}</strong> as a ${escape(role)}.</p><p><a href="${escape(link)}">Open your invitation</a></p><p>Sign in to your invited account or create a new account for ${escape(to)}. The link expires in 72 hours.</p><p>If you did not expect this invitation, you can ignore this message.</p></main>`,
  };
}
