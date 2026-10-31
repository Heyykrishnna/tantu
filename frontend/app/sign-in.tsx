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
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      if (invitation)
        await api("/invitations/accept", record, {
          method: "POST",
          body: {
            token: invitation,
            name: String(data.get("name")),
            password: String(data.get("password")),
          },
        });
      else if (mode === "register")
        await api("/auth/register", (value) => string(record(value).csrf), {
          method: "POST",
          body: {
            email: String(data.get("email")),
            name: String(data.get("name")),
            password: String(data.get("password")),
          },
        });
      else
        await api("/auth/login", (value) => string(record(value).csrf), {
          method: "POST",
          body: {
            email: String(data.get("email")),
            password: String(data.get("password")),
          },
        });
      onSignedIn();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-dvh bg-[#f5f6fb] p-4 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:p-6 dark:bg-[#131314]">
      <section className="relative hidden min-h-175 overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(ellipse_at_top_right,#6969c1_0%,#3d4d80_46%,#252d47_100%)] p-10 text-white lg:flex lg:flex-col xl:p-14">
        <Link
          className="relative z-10 inline-flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          href="/"
          aria-label="tantu home"
        >
          <Brand compact />
          <span className="font-heading text-[23px] font-semibold tracking-[-0.06em] text-white">
            tantu.
          </span>
        </Link>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-64 top-1/4 size-162.5 rounded-full border border-white/8 bg-white/2.5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 top-[38%] size-97.5 rounded-full border border-white/8 bg-white/2.5"
        />
        <div className="relative z-10 my-auto max-w-110 py-20">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[10px] tracking-widest text-[#d0d6f7]">
            <span className="size-1.5 rounded-full bg-[#b7b1ff]" />A LITTLE
            CLARITY, EVERY DAY
          </div>
          <h1 className="mb-6 font-heading text-[42px] leading-[1.22] font-medium tracking-[-0.055em] xl:text-[49px]">
            Your work.
            <br />A place to think.
          </h1>
          <p className="max-w-87.5 text-[13px] leading-7 text-[#c2cbe8]">
            Keep the things you need to do beside the ideas that move them
            forward.
          </p>
          <div className="mt-10 rounded-2xl border border-white/15 bg-white/7 p-1.5 shadow-2xl shadow-[#151a43]/20 backdrop-blur-sm">
            <div className="rounded-xl border border-white/10 bg-[#242b48]/45 px-5 py-4">
              <div className="mb-5 flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-lg bg-[#9690e7]/20 text-[#c4bdff]">
                  <Icon name="layers" className="size-4" />
                </span>
                <span className="text-[12px] font-medium text-[#e0e3f9]">
                  Everything, a little more connected.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <Icon name="tasks" className="mb-3 size-4 text-[#a7b5e9]" />
                  <p className="text-[11px] text-[#e3e7f8]">
                    Tasks with intention
                  </p>
                  <p className="mt-1 text-[10px] text-[#a8b5d8]">
                    One clear next step.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <Icon name="pages" className="mb-3 size-4 text-[#beb3ee]" />
                  <p className="text-[11px] text-[#e3e7f8]">
                    Room for your ideas
                  </p>
                  <p className="mt-1 text-[10px] text-[#a8b5d8]">
                    Notes with a home.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-[11px] text-[#aeb9da]">
          <Icon name="shield" className="size-4" />
          Private by default. Shared with intention.
        </div>
      </section>
      <section className="flex min-h-[calc(100dvh-32px)] items-center justify-center rounded-[22px] border border-[#e3e6f0] bg-white px-6 py-12 sm:px-12 lg:min-h-0 dark:border-[#29292d] dark:bg-[#1b1b1d]">
        <div className="w-full max-w-90">
          <Link
            href="/"
            className="mb-12 flex w-fit items-center gap-2.5 lg:hidden"
            aria-label="tantu home"
          >
            <Brand />
          </Link>
          <span className="mb-6 inline-flex size-11 items-center justify-center rounded-xl border border-[#e5e2f4] bg-[#f4f2fc] text-[#9990d5] dark:border-[#42394e] dark:bg-[#30283b]">
            <Icon
              name={
                invitation ? "users" : mode === "register" ? "users" : "lock"
              }
              className="size-5"
            />
          </span>
          <h2 className={`${headingClass} mb-3 text-[27px]`}>
            {invitation
              ? "You’re invited."
              : mode === "register"
                ? "Create your account."
                : "Welcome back."}
          </h2>
          <p className={`mb-8 text-[12px] leading-relaxed ${mutedClass}`}>
            {invitation
              ? "Create your account and join your workspace."
              : mode === "register"
                ? "Get started with your private workspace in seconds."
                : "Sign in to your workspace. Pick up where you left off."}
          </p>
          <form onSubmit={submit} className="grid gap-4">
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
                  : mode === "register"
                    ? "Create account"
                    : "Sign in"}
              <Icon name="arrow" className="size-4" />
            </Button>
            {!invitation && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setMode(mode === "signin" ? "register" : "signin");
                  }}
                  className="text-[12px] font-medium text-violet-600 hover:underline dark:text-violet-400"
                >
                  {mode === "signin"
                    ? "Don't have an account? Create one"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            )}
          </form>
          <div className="mt-7 border-t border-[#e7e9f1] pt-5 dark:border-[#303034]">
            <p className={`text-[10px] leading-6 ${mutedClass}`}>
              Already have an account? Sign in first, then accept the invitation
              in Workspace settings. For a new installation, ask its operator to
              create the first account.
            </p>
          </div>
          <p className="mt-9 flex items-center justify-center gap-1.5 text-[10px] text-[#6f798c] dark:text-[#90909b]">
            <Icon name="shield" className="size-3" />A private place for focused
            work
          </p>
        </div>
      </section>
    </main>
  );
}
