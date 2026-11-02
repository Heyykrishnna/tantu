"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, acknowledgment, choice, items } from "../lib/api";
import type { User, Workspace } from "../lib/api";
import { invitationAccepted, invitationCreated, invitationDestination, invitationPreview, invitationToken, locationInvitation, pendingInvitation } from "../lib/invitations";
import type { InvitationRole, PendingInvitation } from "../lib/invitations";
import { pollWhileVisible } from "../lib/visible-polling";
import { Badge, Button, Field, headingClass, inputClass, mutedClass, Notice, panelClass } from "../components/ui";
import { Select } from "../components/ui/select";
import { Modal } from "../components/ui/modal";
import { SettingsSwitch } from "../components/ui/settings-switch";
import { usePanelVisible } from "../components/ui/retained-panel";

export interface InvitationRecord { id: string; title: string; kind: "task" | "page" }

function RoleFields({ role, onRole, owner, records, permission = "read", recordId = "", prefix = "" }: { role: InvitationRole; onRole: (role: InvitationRole) => void; owner: boolean; records: InvitationRecord[]; permission?: "read" | "edit"; recordId?: string; prefix?: string }) {
  const [manual, setManual] = useState(Boolean(recordId && !records.some(record => record.id === recordId)));
  return <>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Assigned role"><Select name="role" aria-label={prefix + "Role"} value={role} onChange={event => onRole(choice(event.target.value, ["admin", "member", "guest"]))} className={inputClass}><option value="member">Member</option><option value="guest">Guest · shared records only</option>{owner && <option value="admin">Administrator</option>}</Select></Field>
      <Field label="Shared record permission"><Select name="permission" aria-label={prefix + "Record permission"} defaultValue={permission} className={inputClass}><option value="read">Read only</option><option value="edit">Can edit</option></Select></Field></div>
    {role === "guest" && <div className="grid gap-2"><Field label="Shared record">{manual ? <input name="recordId" aria-label={prefix + "Record ID"} defaultValue={recordId} required maxLength={36} pattern="[0-9a-fA-F-]{36}" placeholder="Record UUID" className={inputClass} /> : <Select name="recordId" aria-label={prefix + "Shared record"} defaultValue={recordId} required className={inputClass}><option value="">Choose an editable record</option>{records.map(record => <option key={record.id} value={record.id}>[{record.kind}] {record.title}</option>)}</Select>}</Field><Button variant="ghost" size="sm" onClick={() => setManual(value => !value)}>{manual ? "Choose from your records" : "Enter a record ID"}</Button><p className={`text-xs ${mutedClass}`}>Guests receive access to the chosen record. Members can see workspace-visible work; private records keep their own permissions.</p></div>}
  </>;
}

export default function WorkspaceInvitations({ workspace, csrf, currentUser, records, onJoined, onMembersChanged }: { workspace: Workspace; csrf: string; currentUser?: User | null; records: InvitationRecord[]; onJoined: () => void; onMembersChanged: () => Promise<void> }) {
  const manager = workspace.role === "owner" || workspace.role === "admin";
  const owner = workspace.role === "owner";
  const path = `/workspaces/${workspace.id}/invitations`;
  const visible = usePanelVisible();
  const loaded = useRef(false);
  const [pending, setPending] = useState<PendingInvitation[]>([]);
  const [created, setCreated] = useState<ReturnType<typeof invitationCreated> | null>(null);
  const [role, setRole] = useState<InvitationRole>("member");
  const [emailLink, setEmailLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [acceptInput, setAcceptInput] = useState(() => typeof window === "undefined" ? "" : locationInvitation(window.location) ?? "");
  const [preview, setPreview] = useState<{ token: string; value: ReturnType<typeof invitationPreview> } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PendingInvitation | null>(null);
  const [editTarget, setEditTarget] = useState<PendingInvitation | null>(null);
  const [editRole, setEditRole] = useState<InvitationRole>("member");
  const token = invitationToken(acceptInput);
  const info = preview?.token === token ? preview.value : null;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!manager) return;
    setPending(await api(path, items(pendingInvitation), { ...(signal ? { signal } : {}) }));
  }, [manager, path]);
  useEffect(() => {
    if (!visible || !manager) return;
    return pollWhileVisible(async signal => {
      const previous = loaded.current;
      await refresh(signal);
      loaded.current = true;
      if (previous) await onMembersChanged();
    }, error => setMessage(error instanceof Error ? error.message : "Invitations could not be refreshed."), document, { immediate: !loaded.current });
  }, [manager, refresh, visible, onMembersChanged]);
  useEffect(() => {
    if (!token || !visible) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api("/invitations/preview", invitationPreview, { method: "POST", body: { token }, signal: controller.signal })
        .then(value => setPreview({ token, value }))
        .catch((error: unknown) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Invitation could not be checked."); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [token, visible]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setMessage(""); setNotice("");
    try {
      const result = await api(path, invitationCreated, { method: "POST", csrf, body: { email: String(data.get("email")).trim(), role, permission: String(data.get("permission")), ...(data.get("recordId") ? { recordId: String(data.get("recordId")).trim() } : {}), delivery: emailLink ? "email" : "link" } });
      setCreated(result);
      setNotice(result.delivery.status === "sent" ? "Invitation email sent. You can also copy the link." : "Invitation link created.");
      if (result.delivery.status === "unconfirmed") setMessage(result.delivery.message);
      form.reset();
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation could not be created."); }
    finally { setBusy(false); }
  }
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) { setMessage("Paste a complete invitation link or token."); return; }
    setBusy(true); setMessage(""); setNotice("");
    try {
      const result = await api("/invitations/accept", invitationAccepted, { method: "POST", csrf, body: { token } });
      window.history.replaceState(null, "", invitationDestination(result.workspaceId));
      setAcceptInput("");
      onJoined();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation could not be accepted."); }
    finally { setBusy(false); }
  }
  async function revoke() {
    if (!revokeTarget) return;
    setBusy(true); setMessage(""); setNotice("");
    try {
      await api(path + "/" + revokeTarget.id, acknowledgment, { method: "DELETE", csrf });
      if (created?.id === revokeTarget.id) setCreated(null);
      setRevokeTarget(null);
      setNotice("Invitation revoked. The shared link can no longer be accepted.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be revoked.");
      try { await refresh(); await onMembersChanged(); } catch (refreshError) { setMessage(refreshError instanceof Error ? refreshError.message : "Workspace access could not be refreshed."); }
    } finally { setBusy(false); }
  }
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setNotice("");
    try {
      await api(path + "/" + editTarget.id, acknowledgment, { method: "PATCH", csrf, body: { role: editRole, permission: String(data.get("permission")), recordId: data.has("recordId") ? String(data.get("recordId")).trim() || null : editTarget.recordId } });
      setEditTarget(null);
      setNotice("Invitation access updated. The existing link uses these settings.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation could not be updated."); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.link); setNotice("Invitation link copied."); }
    catch { setMessage("Copy is unavailable. Select the invitation link and copy it manually."); }
  }

  return <div className="grid gap-6">
    <Notice tone="error" role="alert">{message}</Notice><Notice tone="success">{notice}</Notice>
    {manager && <section className={`${panelClass} p-5 sm:p-6`}><header className="mb-5 flex items-center justify-between gap-3"><div><h2 className={`${headingClass} text-base`}>Invite Teammate</h2><p className={`mt-1 text-xs ${mutedClass}`}>Create a link for a specific person and choose their workspace access.</p></div><Badge>Valid for 72 hours</Badge></header>
      <form onSubmit={create} className="grid gap-4"><Field label="Teammate Email"><input name="email" type="email" required maxLength={254} autoComplete="email" className={inputClass} placeholder="teammate@example.com" disabled={busy} /></Field><fieldset disabled={busy} className="grid gap-4"><RoleFields role={role} onRole={setRole} owner={owner} records={records} /><SettingsSwitch name="sendEmail" label="Email invitation link" description="Send a copy through the workspace email service. You can also share the generated link yourself." checked={emailLink} onChange={setEmailLink} /><div><Button type="submit" variant="primary" disabled={busy}>{busy ? "Creating invitation…" : "Generate Invitation Link"}</Button></div></fieldset></form>
      {created && <div className="mt-6 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"><h3 className="text-sm font-medium">Invitation Link Ready</h3><Field label="Invitation Link"><input aria-label="Invitation Link" value={created.link} readOnly onFocus={event => event.currentTarget.select()} className={`${inputClass} text-xs`} /></Field><div><Button size="sm" onClick={() => void copy()}>Copy Link</Button></div><p className={`text-xs ${mutedClass}`}>Creating another invitation for the same person replaces the previous pending link.</p></div>}
    </section>}
    {manager && <section className={`${panelClass} overflow-hidden`}><header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800"><h2 className="text-sm font-medium">Pending Invitations</h2><Badge>{pending.length} pending</Badge></header>{pending.length ? <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">{pending.map(invitation => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="break-all text-xs font-medium">{invitation.email}</p><div className="mt-1 flex items-center gap-2"><Badge>{invitation.role}</Badge><span className={`text-[10px] ${mutedClass}`}>{new Date(invitation.expiresAt).toLocaleString()}</span></div></div><div className="flex gap-2"><Button size="sm" disabled={busy || !owner && invitation.role === "admin"} onClick={() => { setMessage(""); setEditRole(invitation.role); setEditTarget(invitation); }}>Edit access</Button><Button size="sm" variant="ghost" disabled={busy || !owner && invitation.role === "admin"} onClick={() => { setMessage(""); setRevokeTarget(invitation); }}>Revoke</Button></div></li>)}</ul> : <p className={`p-5 text-xs ${mutedClass}`}>No pending invitations.</p>}</section>}
    <section className={`${panelClass} p-5 sm:p-6`}><h2 className={`${headingClass} text-base`}>Accept an Invitation</h2><p className={`mb-4 mt-2 text-xs ${mutedClass}`}>Paste an invitation link or token for your signed-in account.</p>{info && <Notice>Join {info.workspaceName} as {info.role}. This invitation is for {info.email}.{currentUser && currentUser.email.toLowerCase() !== info.email.toLowerCase() ? " Sign out and use the invited account to accept it." : ""}</Notice>}<form onSubmit={accept} className="mt-4 grid gap-4"><Field label="Invitation Token"><input name="token" value={acceptInput} onChange={event => setAcceptInput(event.target.value)} required maxLength={2048} autoComplete="off" placeholder="Paste a link or token" className={inputClass} disabled={busy} /></Field><div><Button type="submit" disabled={busy || !token}>Join Workspace</Button></div></form></section>
    <Modal open={Boolean(revokeTarget)} onClose={() => setRevokeTarget(null)} title="Revoke invitation" description="The invitation link will stop working. Existing memberships are managed separately in People & Roles." busy={busy}><Notice tone="error" role="alert">{message}</Notice><p className="mb-5 text-sm">Revoke the pending invitation for {revokeTarget?.email}?</p><div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setRevokeTarget(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={() => void revoke()}>Confirm revocation</Button></div></Modal>
    <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit invitation access" description="Changes apply when the existing link is accepted." busy={busy}>{editTarget && <form key={editTarget.id} onSubmit={edit} className="grid gap-4"><Notice tone="error" role="alert">{message}</Notice><p className={`text-xs ${mutedClass}`}>{editTarget.email}</p><fieldset disabled={busy} className="grid gap-4"><RoleFields role={editRole} onRole={setEditRole} owner={owner} records={records} recordId={editTarget.recordId ?? ""} permission={editTarget.permission} prefix="Pending " /><div className="flex justify-end gap-2"><Button onClick={() => setEditTarget(null)}>Cancel</Button><Button variant="primary" type="submit">Save invitation access</Button></div></fieldset></form>}</Modal>
  </div>;
}
