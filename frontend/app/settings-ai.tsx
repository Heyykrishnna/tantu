"use client";

import { LoadingState } from "../components/ui/loading-state";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, list, record, string } from "../lib/api";
import {
  Button,
  Field,
  headingClass,
  inputClass,
  mutedClass,
  Notice,
  panelClass,
} from "../components/ui";
import { SettingsSwitch } from "../components/ui/settings-switch";

interface AiPreferences {
  isEnabled: boolean;
  allowedScopes: string[];
  maxMonthlyTokens: number;
}
function parse(value: unknown): AiPreferences {
  const data = record(record(value).settings);
  if (
    typeof data.isEnabled !== "boolean" ||
    typeof data.maxMonthlyTokens !== "number" ||
    !Number.isSafeInteger(data.maxMonthlyTokens)
  )
    throw new Error("The AI settings response is invalid.");
  return {
    isEnabled: data.isEnabled,
    allowedScopes: list(data.allowedScopes, string),
    maxMonthlyTokens: data.maxMonthlyTokens,
  };
}

export default function SettingsAi({
  workspaceId,
  csrf,
  manager,
}: {
  workspaceId: string;
  csrf: string;
  manager: boolean;
}) {
  const [settings, setSettings] = useState<AiPreferences | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/workspaces/${workspaceId}/ai/settings`, parse, {
      signal: controller.signal,
    })
      .then(setSettings)
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "AI settings are unavailable.",
          );
      });
    return () => controller.abort();
  }, [workspaceId, version]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || !manager) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await api(
        `/workspaces/${workspaceId}/ai/settings`,
        parse,
        {
          method: "PUT",
          csrf,
          body: { ...settings, provider: "local-deterministic" },
        },
      );
      setSettings(updated);
      setNotice("Workspace AI consent and scope preferences saved.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`${panelClass} p-6`}>
      <h2 className={`${headingClass} text-lg`}>AI & data controls</h2>
      <p className={`mb-6 mt-2 max-w-xl text-sm leading-relaxed ${mutedClass}`}>
        Briefs currently use local, deterministic source extraction. No external
        model is connected. These controls record explicit consent and scope
        limits for assisted processing; consent alone does not activate a
        provider.
      </p>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {notice && <Notice tone="success">{notice}</Notice>}
      {settings ? (
        <form onSubmit={save} className="mt-5 grid gap-5">
          <SettingsSwitch
            label="Allow assisted processing"
            description="Off by default. Only administrators can change workspace consent."
            checked={settings.isEnabled}
            disabled={!manager || busy}
            onChange={(isEnabled) => setSettings({ ...settings, isEnabled })}
          />
          <fieldset disabled={!manager || busy} className="grid gap-3">
            <legend className="mb-3 text-xs font-medium">
              Approved scopes
            </legend>
            {[
              ["meeting_briefs", "Meeting preparation"],
              ["task_summaries", "Task summaries"],
            ].map(([scope, label]) => (
              <label key={scope} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={settings.allowedScopes.includes(scope)}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      allowedScopes: event.target.checked
                        ? [...settings.allowedScopes, scope]
                        : settings.allowedScopes.filter(
                            (value) => value !== scope,
                          ),
                    })
                  }
                  className="accent-zinc-700"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <Field label="Monthly token budget">
            <input
              type="number"
              min={1000}
              max={10000000}
              step={1000}
              value={settings.maxMonthlyTokens}
              disabled={!manager || busy}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  maxMonthlyTokens: Number(event.target.value),
                })
              }
              className={`${inputClass} max-w-xs`}
            />
          </Field>
          {manager ? (
            <div>
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save AI preferences"}
              </Button>
            </div>
          ) : (
            <Notice>
              Your current role can review these preferences. An administrator
              must change them.
            </Notice>
          )}
        </form>
      ) : (
        !error && (
          <LoadingState label="Loading AI preferences…" />
        )
      )}
      {error && (
        <Button
          className="mt-4"
          onClick={() => {
            setError("");
            setVersion((value) => value + 1);
          }}
        >
          Retry
        </Button>
      )}
    </section>
  );
}
