"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { api, record, string } from "../lib/api";
import type { Workspace } from "../lib/api";
import {
  Badge,
  Button,
  Field,
  headingClass,
  inputClass,
  mutedClass,
  Notice,
  panelClass,
} from "../components/ui";

export default function SettingsSpaces({
  workspaces,
  currentId,
  csrf,
  onSwitch,
  onCreated,
}: {
  workspaces: Workspace[];
  currentId: string;
  csrf: string;
  onSwitch: (id: string) => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name || name.length > 100) {
      setError("Enter a space name between 1 and 100 characters.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const id = await api("/workspaces", (value) => string(record(value).id), {
        method: "POST",
        csrf,
        body: { name },
      });
      form.reset();
      await onCreated(id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The workspace could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`${panelClass} p-6`}>
      <h2 className={`${headingClass} text-lg`}>Your spaces</h2>
      <p className={`mt-2 text-sm ${mutedClass}`}>
        Spaces keep members, records, and permissions separate. Your appearance
        preferences are saved for each workspace.
      </p>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <ul className="my-6 divide-y divide-zinc-200 dark:divide-zinc-800">
        {workspaces.map((workspace) => (
          <li
            key={workspace.id}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-lg bg-zinc-100 text-lg dark:bg-zinc-800"
              >
                {workspace.icon ?? "⚡"}
              </span>
              <span className="truncate text-sm font-medium">
                {workspace.name}
              </span>
              <Badge>{workspace.role}</Badge>
            </div>
            <Button
              size="sm"
              disabled={busy || workspace.id === currentId}
              onClick={() => onSwitch(workspace.id)}
            >
              {workspace.id === currentId ? "Current space" : "Switch space"}
            </Button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={create}
        className="grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/40"
      >
        <div>
          <h3 className={`${headingClass} text-base`}>Create a workspace</h3>
          <p className={`mt-1 text-xs ${mutedClass}`}>
            Start with a private space. Invite people when you are ready.
          </p>
        </div>
        <Field label="New space name">
          <input
            name="name"
            autoComplete="off"
            placeholder="For example, Design studio"
            maxLength={100}
            required
            className={inputClass}
            disabled={busy}
          />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Creating…" : "Create space"}
          </Button>
        </div>
      </form>
    </section>
  );
}
