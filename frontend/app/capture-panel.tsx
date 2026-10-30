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

export interface CaptureItem {
  id: string;
  workspaceId: string;
  userId: string;
  kind: "note" | "link" | "mail" | "request";
  title: string;
  content: string;
  sourceType: "manual" | "mail" | "url" | "task";
  sourceId: string | null;
  sourceUrl: string | null;
  status: "inbox" | "converted" | "dismissed";
  convertedRecordId: string | null;
  createdAt: string;
  version: number;
}

interface CandidateProject {
  id: string;
  title: string;
}

interface CandidateMember {
  id: string;
  name: string;
}

interface ReviewData {
  capture: CaptureItem;
  candidateProjects: CandidateProject[];
  candidateMembers: CandidateMember[];
  audienceNotice: string;
}

export default function CapturePanel({
  workspaceId,
  csrf,
  onTaskCreated,
}: {
  workspaceId: string;
  csrf: string;
  onTaskCreated?: (taskId: string) => void;
}) {
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [kind, setKind] = useState<CaptureItem["kind"]>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [reviewing, setReviewing] = useState<ReviewData | null>(null);
  const [convertTitle, setConvertTitle] = useState("");
  const [convertVisibility, setConvertVisibility] = useState<
    "private" | "workspace"
  >("private");
  const [convertProjectId, setConvertProjectId] = useState<string>("");
  const [convertAssigneeId, setConvertAssigneeId] = useState<string>("");
  const [convertDeadline, setConvertDeadline] = useState("");
  const [convertExcerpts, setConvertExcerpts] = useState("");

  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<{ items: CaptureItem[] }>(
      `/api/v1/workspaces/${workspaceId}/capture?status=inbox`,
      (v) => v as { items: CaptureItem[] },
      { signal: controller.signal },
    )
      .then((data) => {
        setItems(data.items);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load triage items.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, version]);

  const handleCaptureSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      setBusy(true);
      setError("");
      const res = await api<{ item: CaptureItem }>(
        `/api/v1/workspaces/${workspaceId}/capture`,
        (v) => v as { item: CaptureItem },
        {
          method: "POST",
          csrf,
          body: { kind, title: title.trim(), content: content.trim() },
        },
      );
      setItems((prev) => [res.item, ...prev]);
      setTitle("");
      setContent("");
      setNotice("Captured to triage queue.");
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture item.");
    } finally {
      setBusy(false);
    }
  };

  const openReview = async (item: CaptureItem) => {
    try {
      setBusy(true);
      setError("");
      const data = await api<ReviewData>(
        `/api/v1/workspaces/${workspaceId}/capture/${item.id}/review`,
        (v) => v as ReviewData,
      );
      setReviewing(data);
      setConvertTitle(data.capture.title);
      setConvertExcerpts(data.capture.content);
      setConvertVisibility("private");
      setConvertProjectId("");
      setConvertAssigneeId("");
      setConvertDeadline("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load conversion preview.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConvert = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewing || !convertTitle.trim()) return;
    try {
      setBusy(true);
      setError("");
      const operationId = crypto.randomUUID();
      const res = await api<{ task: { id: string }; capture: CaptureItem }>(
        `/api/v1/workspaces/${workspaceId}/capture/${reviewing.capture.id}/convert`,
        (v) => v as { task: { id: string }; capture: CaptureItem },
        {
          method: "POST",
          csrf,
          body: {
            operationId,
            captureId: reviewing.capture.id,
            title: convertTitle.trim(),
            visibility: convertVisibility,
            projectId: convertProjectId || null,
            milestoneId: null,
            deadline: convertDeadline || null,
            assigneeId: convertAssigneeId || null,
            estimateMinutes: null,
            selectedExcerpts: convertExcerpts,
          },
        },
      );
      setItems((prev) => prev.filter((i) => i.id !== reviewing.capture.id));
      setReviewing(null);
      setNotice("Capture converted to task.");
      setVersion((v) => v + 1);
      if (onTaskCreated) onTaskCreated(res.task.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async (itemId: string) => {
    try {
      setBusy(true);
      await api(
        `/api/v1/workspaces/${workspaceId}/capture/${itemId}`,
        (v) => v,
        {
          method: "DELETE",
          csrf,
        },
      );
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setNotice("Item dismissed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss item.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={headingClass}>Quick Capture & Triage</h2>
          <p className={`text-xs ${mutedClass}`}>
            Capture incoming thoughts, links, and requests into a private triage
            queue before converting to work.
          </p>
        </div>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="neutral">{notice}</Notice>}

      <form
        onSubmit={handleCaptureSubmit}
        className={`${panelClass} space-y-4 p-4`}
      >
        <div className="flex flex-wrap gap-2">
          {(["note", "link", "mail", "request"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                kind === k
                  ? "bg-violet-600 text-white"
                  : "bg-[#e2e5ee] text-[#555e70] hover:bg-[#d8dce6] dark:bg-[#252528] dark:text-[#a4a4ad]"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <Field label="What do you want to capture?">
          <input
            type="text"
            className={inputClass}
            placeholder="Capture an actionable note, meeting request, or link..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            required
            maxLength={200}
          />
        </Field>
        <Field label="Details / Context (Optional)">
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            placeholder="Add relevant notes, links, or email body excerpts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={busy}
          />
        </Field>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !title.trim()}
          >
            <Icon name="capture" className="size-4" />
            Capture to Inbox
          </Button>
        </div>
      </form>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#677287] dark:text-[#8a8a93]">
          Triage Queue ({items.length})
        </h3>
        {loading ? (
          <div className="p-8 text-center text-sm text-[#707c93]">
            Loading triage items...
          </div>
        ) : items.length === 0 ? (
          <div
            className={`${panelClass} p-8 text-center text-sm ${mutedClass}`}
          >
            Your capture inbox is empty. Capture notes or mail above to triage
            them into tasks.
          </div>
        ) : (
          <div className="divide-y divide-[#e3e6ef] rounded-lg border border-[#e3e6ef] bg-white dark:divide-[#2d2d31] dark:border-[#2d2d31] dark:bg-[#1a1a1c]">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                      {item.kind}
                    </span>
                    <span className="text-xs font-medium text-[#1e2025] dark:text-[#e4e4e7]">
                      {item.title}
                    </span>
                  </div>
                  {item.content && (
                    <p className="mt-1 line-clamp-2 text-xs text-[#677287] dark:text-[#a4a4ad]">
                      {item.content}
                    </p>
                  )}
                  <span className={`text-[10px] ${mutedClass}`}>
                    Source: {item.sourceType} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openReview(item)}
                    disabled={busy}
                  >
                    <Icon name="arrow" className="size-3.5" />
                    Review & Convert
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDismiss(item.id)}
                    disabled={busy}
                  >
                    <Icon name="close" className="size-3.5" />
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleConvert}
            className={`${panelClass} max-h-[90vh] w-full max-w-lg overflow-y-auto space-y-4 p-6 shadow-2xl`}
          >
            <div className="flex items-center justify-between border-b border-[#e3e6ef] pb-3 dark:border-[#2d2d31]">
              <h3 className="text-sm font-semibold text-[#1e2025] dark:text-white">
                Review Task Conversion
              </h3>
              <button
                type="button"
                onClick={() => setReviewing(null)}
                className="text-[#677287] hover:text-black dark:hover:text-white"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            <Notice tone="neutral">{reviewing.audienceNotice}</Notice>

            <Field label="Task Title">
              <input
                type="text"
                className={inputClass}
                value={convertTitle}
                onChange={(e) => setConvertTitle(e.target.value)}
                required
                maxLength={200}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Visibility & Audience">
                <select
                  className={inputClass}
                  value={convertVisibility}
                  onChange={(e) =>
                    setConvertVisibility(
                      e.target.value as "private" | "workspace",
                    )
                  }
                >
                  <option value="private">Private (Only you)</option>
                  <option value="workspace">Workspace (All members)</option>
                </select>
              </Field>

              <Field label="Target Project (Optional)">
                <select
                  className={inputClass}
                  value={convertProjectId}
                  onChange={(e) => setConvertProjectId(e.target.value)}
                >
                  <option value="">No Project</option>
                  {reviewing.candidateProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Assignee (Optional)">
                <select
                  className={inputClass}
                  value={convertAssigneeId}
                  onChange={(e) => setConvertAssigneeId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {reviewing.candidateMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Deadline (Optional)">
                <input
                  type="date"
                  className={inputClass}
                  value={convertDeadline}
                  onChange={(e) => setConvertDeadline(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Excerpts to copy to Task body">
              <textarea
                className={`${inputClass} min-h-20`}
                value={convertExcerpts}
                onChange={(e) => setConvertExcerpts(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#e3e6ef] dark:border-[#2d2d31]">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setReviewing(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !convertTitle.trim()}
              >
                Confirm & Create Task
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
