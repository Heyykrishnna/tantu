"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, items, record, string } from "../lib/api";
import type { Workspace } from "../lib/api";

interface Member { id: string; name: string; email: string; role: string; active: boolean }
function member(value: unknown): Member { const data = record(value); if (typeof data.active !== "boolean") throw new Error("Invalid membership response."); return { id: string(data.id), name: string(data.name), email: string(data.email), role: string(data.role), active: data.active }; }

export default function WorkspaceSettings({ workspace, csrf, onJoined }: { workspace: Workspace; csrf: string; onJoined: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const manager = workspace.role === "owner" || workspace.role === "admin";
  const path = `/workspaces/${workspace.id}`;
  const refresh = useCallback(async () => {
    if (!manager) return;
    try { setMembers(await api(path + "/members", items(member))); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Members are unavailable."); }
  }, [manager, path]);
  useEffect(() => {
    if (!manager) return;
    const controller = new AbortController();
    api(path + "/members", items(member), { signal: controller.signal }).then(setMembers).catch((error: unknown) => { if (!(error instanceof Error && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Members are unavailable."); });
    return () => controller.abort();
  }, [manager, path]);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setToken("");
    const data = new FormData(event.currentTarget);
    try { setToken(await api(path + "/invitations", (value) => string(record(value).token), { method: "POST", csrf, body: { email: String(data.get("email")), role: String(data.get("role")), permission: String(data.get("permission")), ...(data.get("recordId") ? { recordId: String(data.get("recordId")) } : {}) } })); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Invitation failed."); }
    finally { setBusy(false); }
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api("/invitations/accept", acknowledgment, { method: "POST", csrf, body: { token: String(new FormData(event.currentTarget).get("token")) } }); onJoined(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Invitation failed."); }
    finally { setBusy(false); }
  }
  async function remove(item: Member) {
    if (!window.confirm(`Remove ${item.name} from this workspace? Access will stop immediately.`)) return;
    setBusy(true);
    try { await api(path + "/members/" + item.id, acknowledgment, { method: "DELETE", csrf }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Removal failed."); }
    finally { setBusy(false); }
  }
  return <section className="settings"><h2>Workspace settings</h2><p className="muted">{workspace.name} · your role: {workspace.role}</p><p role="alert" className="error">{message}</p>
    {manager && <><h3>Invite someone</h3><form onSubmit={invite}><label>Email<input name="email" type="email" required maxLength={254} /></label><div className="field-row"><label>Role<select name="role" defaultValue="member"><option value="member">Member</option><option value="guest">Guest — record access only</option>{workspace.role === "owner" && <option value="admin">Administrator</option>}</select></label><label>Record permission<select name="permission"><option value="read">Read</option><option value="edit">Edit</option></select></label></div><label>Record ID <span className="optional">required for guests</span><input name="recordId" placeholder="Copy the ID from record details" pattern="[0-9a-f-]{36}" /></label><button disabled={busy}>Create invitation</button></form>{token && <div className="notice"><label>Invitation token<textarea readOnly value={token} rows={2} /></label><p className="small">Share privately with the intended person. Expires after 72 hours and works once. This app has not sent an email.</p></div>}
      <h3>People</h3><ul className="member-list">{members.map((item) => <li key={item.id}><div><strong>{item.name}</strong><span className="small muted">{item.email} · {item.role} · {item.active ? "active" : "removed"}</span></div>{item.active && item.role !== "owner" && <button disabled={busy} onClick={() => void remove(item)}>Remove member</button>}</li>)}</ul></>}
    <h3>Accept an invitation</h3><form onSubmit={join}><label>Invitation token<input name="token" required maxLength={100} autoComplete="off" /></label><button disabled={busy}>Join workspace</button></form>
  </section>;
}
