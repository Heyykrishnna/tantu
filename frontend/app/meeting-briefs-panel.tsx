"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { Icon } from "../components/icon";
import {
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";

export interface AiSettingsItem {
  workspaceId: string;
  isEnabled: boolean;
  provider: "local-deterministic" | "openai" | "gemini" | "anthropic";
  allowedScopes: string[];
  maxMonthlyTokens: number;
  usedMonthlyTokens: number;
  updatedAt: string;
}

export interface SourceCitationItem {
  sourceId: string;
  sourceType: string;
  excerpt: string;
  timestamp: string;
}

export interface ActionItemData {
  title: string;
  assignee?: string;
  dueDate?: string;
}

export interface MeetingBriefItem {
  id: string;
  workspaceId: string;
  eventId: string;
  title: string;
  meetingDate: string;
  attendees: Array<{ name: string; email: string }>;
  linkedTaskIds: string[];
  linkedDecisionIds: string[];
  linkedPromiseIds: string[];
  keyTopics: string[];
  citations: SourceCitationItem[];
  actionItems: ActionItemData[];
  generationMode: "deterministic" | "assisted";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export default function MeetingBriefsPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [briefs, setBriefs] = useState<MeetingBriefItem[]>([]);
  const [settings, setSettings] = useState<AiSettingsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selectedBrief, setSelectedBrief] = useState<MeetingBriefItem | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendeeEmail, setAttendeeEmail] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ briefs: MeetingBriefItem[] }>(
        `/api/v1/workspaces/${workspaceId}/meetings/briefs`,
        (v) => v as { briefs: MeetingBriefItem[] },
        { signal: controller.signal }
      ),
      api<{ settings: AiSettingsItem }>(
        `/api/v1/workspaces/${workspaceId}/ai/settings`,
        (v) => v as { settings: AiSettingsItem },
        { signal: controller.signal }
      ),
    ])
      .then(([briefsRes, settingsRes]) => {
        setBriefs(briefsRes.briefs ?? []);
        setSettings(settingsRes.settings);
        if (briefsRes.briefs && briefsRes.briefs.length > 0) {
          setSelectedBrief(briefsRes.briefs[0] ?? null);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load meeting briefs.");
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  function handleToggleAi(enabled: boolean) {
    if (!settings) return;
    setBusy(true);
    setError("");
    api<{ settings: AiSettingsItem }>(
      `/api/v1/workspaces/${workspaceId}/ai/settings`,
      (v) => v as { settings: AiSettingsItem },
      {
        method: "PUT",
        csrf,
        body: JSON.stringify({
          isEnabled: enabled,
          provider: settings.provider,
        }),
      }
    )
      .then((res) => {
        setSettings(res.settings);
        setNotice(enabled ? "AI assistance opted in." : "AI assistance disabled. Full deterministic operation active.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to update AI settings.");
        setBusy(false);
      });
  }

  function handleCreateBrief(e: FormEvent) {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    setBusy(true);
    setError("");
    const eventId = `event-${Date.now()}`;
    const attendees = attendeeEmail.trim()
      ? [{ name: attendeeEmail.split("@")[0] ?? "Attendee", email: attendeeEmail.trim() }]
      : [];

    api<{ brief: MeetingBriefItem }>(
      `/api/v1/workspaces/${workspaceId}/meetings/${eventId}/brief`,
      (v) => v as { brief: MeetingBriefItem },
      {
        method: "POST",
        csrf,
        body: JSON.stringify({
          title: eventTitle.trim(),
          meetingDate,
          attendees,
        }),
      }
    )
      .then((res) => {
        setBriefs((prev) => [res.brief, ...prev]);
        setSelectedBrief(res.brief);
        setIsCreating(false);
        setEventTitle("");
        setAttendeeEmail("");
        setNotice("Meeting brief compiled from source tasks, decisions, and promises.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to prepare brief.");
        setBusy(false);
      });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={headingClass}>Meeting Preparation & Review Briefs</h2>
          <p className={mutedClass}>
            Source-grounded agenda preparation, decisions review, and action tracking with deterministic fallbacks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => setIsCreating(true)}
            disabled={busy}
          >
            <Icon name="plus" className="size-4" />
            <span>Prepare Brief</span>
          </Button>
        </div>
      </div>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {settings && (
        <div className={`${panelClass} flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 ${settings.isEnabled ? "border-l-violet-500" : "border-l-neutral-400"}`}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs">AI Assistance Mode:</span>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${settings.isEnabled ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300"}`}>
                {settings.isEnabled ? "Opted In (Assisted)" : "Disabled (Deterministic Only)"}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Provider: {settings.provider} • Tokens: {settings.usedMonthlyTokens} / {settings.maxMonthlyTokens}
            </p>
          </div>
          <Button
            type="button"
            variant={settings.isEnabled ? "secondary" : "primary"}
            onClick={() => handleToggleAi(!settings.isEnabled)}
            disabled={busy}
          >
            <span>{settings.isEnabled ? "Opt Out / Disable AI" : "Opt In to AI"}</span>
          </Button>
        </div>
      )}

      {isCreating && (
        <form onSubmit={handleCreateBrief} className={`${panelClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Prepare New Meeting Brief</h3>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-neutral-400 hover:text-neutral-600 text-xs"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Meeting / Event Title">
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="e.g. Architecture Alignment & Roadmap Sync"
                className={inputClass}
                maxLength={200}
                required
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Key Attendee Email (Optional)">
              <input
                type="email"
                value={attendeeEmail}
                onChange={(e) => setAttendeeEmail(e.target.value)}
                placeholder="lead@example.com"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Compiling..." : "Compile Brief"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-neutral-500">Loading meeting briefs...</div>
      ) : briefs.length === 0 ? (
        <div className={`${panelClass} p-8 text-center space-y-2`}>
          <Icon name="brain" className="size-8 mx-auto text-neutral-400" />
          <h3 className="font-medium text-sm">No meeting briefs generated</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Meeting briefs correlate open tasks, confirmed decisions, and bilateral promises into a source-grounded agenda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h3 className="text-xs uppercase font-bold tracking-wider text-neutral-500">
              Briefs Ledger ({briefs.length})
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {briefs.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBrief(b)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                    selectedBrief?.id === b.id
                      ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-800"
                      : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <div className="font-medium text-sm">{b.title}</div>
                  <div className="flex items-center justify-between mt-1 text-neutral-500 text-[11px]">
                    <span>{b.meetingDate}</span>
                    <span className="capitalize">{b.generationMode}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            {selectedBrief ? (
              <div className={`${panelClass} space-y-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-base">{selectedBrief.title}</h3>
                    <p className="text-xs text-neutral-500">
                      Date: {selectedBrief.meetingDate} • Mode: {selectedBrief.generationMode} • v{selectedBrief.version}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-neutral-500">
                    Discussion Topics ({selectedBrief.keyTopics.length})
                  </h4>
                  <ul className="list-disc list-inside text-xs space-y-1 text-neutral-700 dark:text-neutral-300">
                    {selectedBrief.keyTopics.map((topic, i) => (
                      <li key={i}>{topic}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-neutral-500">
                    Action Items ({selectedBrief.actionItems.length})
                  </h4>
                  {selectedBrief.actionItems.length === 0 ? (
                    <div className="text-xs text-neutral-500">No immediate action items.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedBrief.actionItems.map((item, i) => (
                        <div key={i} className="p-2 bg-neutral-50 dark:bg-neutral-950 rounded border border-neutral-200 dark:border-neutral-800 text-xs flex justify-between">
                          <span>{item.title}</span>
                          {item.dueDate && <span className="text-neutral-400 font-mono">{item.dueDate}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-neutral-500">
                    Source Citations ({selectedBrief.citations.length})
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selectedBrief.citations.map((c, i) => (
                      <div key={i} className="p-2 bg-neutral-50 dark:bg-neutral-950 rounded border border-neutral-100 dark:border-neutral-900 text-[11px] space-y-0.5">
                        <div className="flex justify-between text-neutral-400 text-[10px]">
                          <span className="uppercase font-semibold">{c.sourceType}</span>
                          <span>{new Date(c.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-neutral-700 dark:text-neutral-300 italic">{c.excerpt}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${panelClass} p-8 text-center text-xs text-neutral-500`}>
                Select a meeting brief from the ledger to inspect topics, citations, and action items.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
