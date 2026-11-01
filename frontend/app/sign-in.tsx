"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { api, record, string } from "../lib/api";
import { Icon } from "../components/icon";
import {
  Brand,
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
} from "../components/ui";

export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [invitation, setInvitation] = useState(() => {
    if (typeof window === "undefined") return "";
    const search = new URLSearchParams(window.location.search);
    return (
      search.get("invite") ||
      search.get("invitation") ||
      search.get("token") ||
      ""
    );
  });
  const [mode, setMode] = useState<"signin" | "register" | "verify">("signin");
  const [pendingEmail, setPendingEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [infoNotice, setInfoNotice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function resendCode() {
    setBusy(true);
    setMessage("");
    try {
      await api("/auth/signup/resend", record, {
        method: "POST",
        body: { email: pendingEmail },
      });
      setInfoNotice(`A fresh 6-character code was sent to ${pendingEmail}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to resend code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setInfoNotice("");
    const data = new FormData(event.currentTarget);
    try {
      if (invitation) {
        await api("/invitations/accept", record, {
          method: "POST",
          body: {
            token: invitation,
            name: String(data.get("name")),
            password: String(data.get("password")),
          },
        });
        onSignedIn();
      } else if (mode === "register") {
        const emailVal = String(data.get("email")).toLowerCase().trim();
        const nameVal = String(data.get("name")).trim();
        const passVal = String(data.get("password"));
        await api("/auth/signup/start", record, {
          method: "POST",
          body: { email: emailVal, name: nameVal, password: passVal },
        });
        setPendingEmail(emailVal);
        setVerificationCode("");
        setMode("verify");
        setInfoNotice(`We sent a 6-character verification code to ${emailVal}`);
      } else if (mode === "verify") {
        await api(
          "/auth/signup/verify",
          (value) => string(record(value).csrf),
          {
            method: "POST",
            body: {
              email: pendingEmail,
              code: verificationCode.toUpperCase().trim(),
            },
          },
        );
        onSignedIn();
      } else {
        await api("/auth/login", (value) => string(record(value).csrf), {
          method: "POST",
          body: {
            email: String(data.get("email")),
            password: String(data.get("password")),
          },
        });
        onSignedIn();
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-dvh bg-[#f8f9fa] p-4 lg:grid-cols-[1fr_1fr] lg:gap-6 lg:p-8 dark:bg-[#09090b]">
      <section className="relative hidden min-h-175 overflow-hidden rounded-2xl border border-zinc-800 bg-[#121214] p-10 text-white shadow-2xl shadow-black/40 lg:flex lg:flex-col xl:p-14">
        <Link
          className="relative z-10 inline-flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          href="/"
          aria-label="tantu home"
        >
          <Brand compact />
          <span className="font-heading text-[22px] font-semibold tracking-[-0.04em] text-white">
            tantu.
          </span>
        </Link>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-64 top-1/4 size-160 rounded-full border border-zinc-800/80 bg-zinc-900/20"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 top-[38%] size-96 rounded-full border border-zinc-800/80 bg-zinc-900/30"
        />
        <div className="relative z-10 my-auto max-w-lg py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[10px] font-medium tracking-widest text-zinc-300">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            ORGANIZED WORKSPACE
          </div>
          <h1 className="mb-5 font-heading text-[40px] leading-[1.2] font-semibold tracking-tight xl:text-[46px]">
            Your work.
            <br />A place to think.
          </h1>
          <p className="max-w-md text-[13px] leading-relaxed text-zinc-400">
            Keep the things you need to do beside the ideas that move them
            forward. A focused space designed for clarity and precision.
          </p>
          <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/70 p-1.5 shadow-xl">
            <div className="rounded-lg border border-zinc-800/80 bg-[#151518] px-5 py-4">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200">
                  <Icon name="layers" className="size-4" />
                </span>
                <span className="text-[12px] font-medium text-zinc-200">
                  Everything, cleanly connected.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5 transition-colors hover:border-zinc-700">
                  <Icon name="tasks" className="mb-3 size-4 text-zinc-300" />
                  <p className="text-[11px] font-medium text-zinc-200">
                    Tasks with intention
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-400">
                    One clear next step.
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5 transition-colors hover:border-zinc-700">
                  <Icon name="pages" className="mb-3 size-4 text-zinc-300" />
                  <p className="text-[11px] font-medium text-zinc-200">
                    Room for your ideas
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-400">
                    Notes with a home.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-[11px] font-medium text-zinc-400">
          <Icon name="shield" className="size-4 text-zinc-400" />
          Private by default. Shared with intention.
        </div>
      </section>
      <section className="flex min-h-[calc(100dvh-32px)] items-center justify-center rounded-2xl border border-zinc-200/90 bg-white px-6 py-12 shadow-xl sm:px-12 lg:min-h-0 dark:border-zinc-800/80 dark:bg-[#141416] dark:shadow-2xl">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-10 flex w-fit items-center gap-2.5 lg:hidden"
            aria-label="tantu home"
          >
            <Brand />
          </Link>
          <span className="mb-6 inline-flex size-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-800 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            <Icon
              name={
                invitation
                  ? "users"
                  : mode === "verify"
                    ? "mail"
                    : mode === "register"
                      ? "users"
                      : "lock"
              }
              className="size-5"
            />
          </span>
          <h2 className={`${headingClass} mb-2 text-[26px]`}>
            {invitation
              ? "You’re invited."
              : mode === "verify"
                ? "Check your email."
                : mode === "register"
                  ? "Create your account."
                  : "Welcome back."}
          </h2>
          <p className={`mb-7 text-[12px] leading-relaxed ${mutedClass}`}>
            {invitation
              ? "Create your account and join your workspace."
              : mode === "verify"
                ? `Enter the 6-character code sent to ${pendingEmail} to activate your account.`
                : mode === "register"
                  ? "We'll send a 6-character verification code to your email."
                  : "Sign in to your workspace. Pick up where you left off."}
          </p>
          <form onSubmit={submit} className="grid gap-4">
            {mode === "verify" ? (
              <>
                <Field label="6-Character Verification Code">
                  <input
                    name="code"
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    autoComplete="one-time-code"
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, ""),
                      )
                    }
                    placeholder="e.g. K7N2P4"
                    className={`${inputClass} font-mono text-center tracking-[0.25em] text-lg font-bold uppercase`}
                  />
                </Field>
                <div className="flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resendCode()}
                    className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-200"
                  >
                    Didn’t receive code? Resend
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMessage("");
                      setInfoNotice("");
                      setMode("register");
                    }}
                    className="text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
                  >
                    Change email
                  </button>
                </div>
              </>
            ) : (
              <>
                {(invitation || mode === "register") && (
                  <Field label="Your name">
                    <input
                      name="name"
                      required
                      autoComplete="name"
                      maxLength={100}
                      placeholder="Your full name"
                      className={inputClass}
                    />
                  </Field>
                )}
                {!invitation && (
                  <Field label="Email address">
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="username"
                      maxLength={254}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </Field>
                )}
                <Field label="Password">
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={invitation || mode === "register" ? 12 : 1}
                    autoComplete={
                      invitation || mode === "register"
                        ? "new-password"
                        : "current-password"
                    }
                    maxLength={256}
                    placeholder={
                      invitation || mode === "register"
                        ? "At least 12 characters"
                        : "Enter your password"
                    }
                    className={inputClass}
                  />
                </Field>
                <Field
                  label={
                    <span>
                      Invitation token{" "}
                      <span
                        className={`ml-1 text-[10px] font-normal ${mutedClass}`}
                      >
                        optional
                      </span>
                    </span>
                  }
                >
                  <input
                    name="invitation"
                    value={invitation}
                    onChange={(event) => setInvitation(event.target.value)}
                    autoComplete="off"
                    maxLength={100}
                    placeholder="Have an invitation? Paste it here"
                    className={inputClass}
                  />
                </Field>
              </>
            )}
            {infoNotice && (
              <Notice tone="neutral" role="status">
                {infoNotice}
              </Notice>
            )}
            <Notice tone="error" role="alert">
              {message}
            </Notice>
            <Button
              variant="primary"
              type="submit"
              disabled={busy}
              className="mt-1 w-full"
            >
              {busy
                ? "Please wait…"
                : invitation
                  ? "Create account & join"
                  : mode === "verify"
                    ? "Verify & Create Workspace"
                    : mode === "register"
                      ? "Send Verification Code"
                      : "Sign in"}
              <Icon name="arrow" className="size-4" />
            </Button>
            {!invitation && mode !== "verify" && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setInfoNotice("");
                    setMode(mode === "signin" ? "register" : "signin");
                  }}
                  className="text-[12px] font-medium text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-white"
                >
                  {mode === "signin"
                    ? "Don’t have an account? Create one"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            )}
          </form>
          <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <p className={`text-[10px] leading-5 ${mutedClass}`}>
              Already have an account? Sign in first, then accept the invitation
              in Workspace settings. For a new installation, ask its operator to
              create the first account.
            </p>
          </div>
          <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <Icon name="shield" className="size-3.5" />A private place for focused
            work
          </p>
        </div>
      </section>
    </main>
  );
}
