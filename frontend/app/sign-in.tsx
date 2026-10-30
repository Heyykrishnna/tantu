"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { api, record, string } from "../lib/api";

export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [invitation, setInvitation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      if (invitation) await api("/invitations/accept", record, { method: "POST", body: { token: invitation, name: String(data.get("name")), password: String(data.get("password")) } });
      else await api("/auth/login", (value) => string(record(value).csrf), { method: "POST", body: { email: String(data.get("email")), password: String(data.get("password")) } });
      onSignedIn();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }
  return <main className="welcome">
    <section className="welcome-story"><Link className="wordmark" href="/">tantu<span>●</span></Link><p className="eyebrow">A little clarity, every day</p><h1>Your work.<br />A place to think.</h1><p>Keep the things you need to do beside the ideas that move them forward.</p><div className="welcome-note">Private by default.<br />Shared with intention.</div></section>
    <section className="sign-in"><p className="eyebrow">Welcome to your workspace</p><h2>{invitation ? "Accept your invitation" : "Good to see you."}</h2><p className="muted">Sign in with your installation account. Your workspace stays yours.</p>
      <form onSubmit={submit}>
        <label>Invitation token <span className="optional">optional</span><input name="invitation" value={invitation} onChange={(event) => setInvitation(event.target.value)} autoComplete="off" maxLength={100} /></label>
        {invitation ? <label>Your name<input name="name" required autoComplete="name" maxLength={100} /></label> : <label>Email address<input name="email" type="email" required autoComplete="username" maxLength={254} /></label>}
        <label>Password<input name="password" type="password" required minLength={invitation ? 12 : 1} autoComplete={invitation ? "new-password" : "current-password"} maxLength={256} /></label>
        <p role="alert" className="error">{message}</p><button className="primary" disabled={busy}>{busy ? "Please wait…" : invitation ? "Create account & join" : "Sign in"}</button>
      </form>
      <p className="small muted">Already have an account? Sign in first, then accept the invitation in Workspace settings. For a new installation, ask its operator to create the first account.</p>
    </section>
  </main>;
}
