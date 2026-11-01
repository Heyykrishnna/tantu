"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { WorkspacePreferences } from "../lib/appearance";
import {
  Button,
  Field,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";
import { SettingsSwitch } from "../components/ui/settings-switch";

export default function SettingsAppearance({
  preferences,
  busy,
  onSave,
}: {
  preferences: WorkspacePreferences;
  busy: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [motion, setMotion] = useState(preferences.reduceMotion);
  const [accent, setAccent] = useState(preferences.accent);

  return (
    <section className={`${panelClass} p-5 sm:p-7`}>
      <header className="mb-6 max-w-xl">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          Make room for your work
        </p>
        <h2 className={`${headingClass} text-xl`}>Appearance & preferences</h2>
        <p className={`mt-2 text-sm leading-relaxed ${mutedClass}`}>
          A quiet workspace, tuned to you. Preferences are private to your
          account and saved for this workspace.
        </p>
      </header>
      <div
        aria-label="Appearance preview"
        className="mb-7 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex gap-1.5 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="size-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <span className="size-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <span className="size-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>
        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className={`${headingClass} text-base`}>One thing at a time.</p>
            <p className={`mt-1 text-xs ${mutedClass}`}>
              Inter for clarity. Poppins for a little character.
            </p>
          </div>
          <span
            className={`rounded-lg px-3 py-2 text-xs text-white ${accent === "indigo" ? "bg-indigo-600" : accent === "sage" ? "bg-emerald-800" : "bg-zinc-800"}`}
          >
            Your workspace
          </span>
        </div>
      </div>
      <form onSubmit={onSave} className="grid gap-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Color theme">
            <select
              name="theme"
              defaultValue={preferences.theme}
              className={inputClass}
              disabled={busy}
            >
              <option value="system">Follow device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Layout density">
            <select
              name="density"
              defaultValue={preferences.density}
              className={inputClass}
              disabled={busy}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </Field>
        </div>
        <fieldset disabled={busy}>
          <legend className="mb-3 text-xs font-medium">Action accent</legend>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["neutral", "Graphite", "bg-zinc-700"],
                ["indigo", "Indigo", "bg-indigo-600"],
                ["sage", "Forest", "bg-emerald-800"],
              ] as const
            ).map(([value, label, color]) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name="accent"
                  value={value}
                  checked={accent === value}
                  onChange={() => setAccent(value)}
                  className="peer sr-only"
                />
                <span className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 p-3 text-xs transition-colors peer-checked:border-zinc-600 peer-checked:bg-zinc-50 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 dark:border-zinc-800 dark:peer-checked:border-zinc-400 dark:peer-checked:bg-zinc-900">
                  <span className={`size-3 rounded-full ${color}`} />
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <SettingsSwitch
          name="reduceMotion"
          label="Reduce decorative motion"
          description="Keep interactions clear and still. Animated orbs pause, and supported transitions follow your preference. Your device’s accessibility preference is always respected."
          checked={motion}
          onChange={setMotion}
          disabled={busy}
        />
        <div className="grid gap-5 border-t border-zinc-200 pt-6 sm:grid-cols-2 dark:border-zinc-800">
          <Field label="Week starts on">
            <select
              name="weekStart"
              defaultValue={preferences.weekStart}
              className={inputClass}
              disabled={busy}
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </Field>
          <Field label="Timezone">
            <input
              name="timezone"
              defaultValue={preferences.timezone}
              maxLength={50}
              required
              placeholder="Asia/Kolkata"
              className={inputClass}
              disabled={busy}
            />
          </Field>
          <Field label="Locale">
            <input
              name="locale"
              defaultValue={preferences.locale}
              maxLength={10}
              required
              placeholder="en-IN"
              className={inputClass}
              disabled={busy}
            />
          </Field>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <p className={`text-xs ${mutedClass}`}>
            Changes apply after you save.
          </p>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save Preferences"}
          </Button>
        </footer>
      </form>
    </section>
  );
}
