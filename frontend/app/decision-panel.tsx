"use client";

import { Modal } from "../components/ui/modal";
import { CandyButton } from "@/components/ui/candy-button";
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
import { Orb } from "@/components/ui/orb";

export interface DecisionItem {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  rationale: string;
  status: "draft" | "confirmed" | "superseded" | "revoked";
  decisionDate: string;
  supportingEvidence: Array<{ id: string; type: string; title: string }>;
  affectedWorkIds: string[];
  supersededById: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionRevision {
  id: string;
  decisionId: string;
  version: number;
  title: string;
  rationale: string;
  status: string;
  modifiedBy: string;
  createdAt: string;
}

export default function DecisionPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedDecision, setSelectedDecision] = useState<DecisionItem | null>(
    null,
  );
  const [revisions, setRevisions] = useState<DecisionRevision[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newRationale, setNewRationale] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  const [supersedeTarget, setSupersedeTarget] = useState<DecisionItem | null>(
    null,
  );
  const [supersedeTitle, setSupersedeTitle] = useState("");
  const [supersedeRationale, setSupersedeRationale] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<{ decisions: DecisionItem[] }>(
      `/workspaces/${workspaceId}/decisions`,
      (v) => v as { decisions: DecisionItem[] },
      { signal: controller.signal },
    )
      .then((res) => {
        setDecisions(res.decisions ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Failed to load decisions.",
          );
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  function loadDecisions() {
    setBusy(true);
    api<{ decisions: DecisionItem[] }>(
      `/workspaces/${workspaceId}/decisions`,
      (v) => v as { decisions: DecisionItem[] },
    )
      .then((res) => {
        setDecisions(res.decisions ?? []);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to reload decisions.",
        );
        setBusy(false);
      });
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newRationale.trim()) return;

    setBusy(true);
    setError("");
    api<{ decision: DecisionItem }>(
      `/workspaces/${workspaceId}/decisions`,
      (v) => v as { decision: DecisionItem },
      {
        method: "POST",
        csrf,
        body: {
          title: newTitle.trim(),
          rationale: newRationale.trim(),
          decisionDate: newDate,
        },
      },
    )
      .then((res) => {
        setDecisions((prev) => [res.decision, ...prev]);
        setIsCreating(false);
        setNewTitle("");
        setNewRationale("");
        setNotice("Decision recorded successfully.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to record decision.",
        );
        setBusy(false);
      });
  }

  function handleSupersede(e: FormEvent) {
    e.preventDefault();
    if (
      !supersedeTarget ||
      !supersedeTitle.trim() ||
      !supersedeRationale.trim()
    )
      return;

    setBusy(true);
    setError("");
    api<{ decision: DecisionItem }>(
      `/workspaces/${workspaceId}/decisions/${supersedeTarget.id}/supersede`,
      (v) => v as { decision: DecisionItem },
      {
        method: "POST",
        csrf,
        body: {
          title: supersedeTitle.trim(),
          rationale: supersedeRationale.trim(),
        },
      },
    )
      .then(() => {
        setSupersedeTarget(null);
        setSupersedeTitle("");
        setSupersedeRationale("");
        setNotice("Decision superseded by new confirmed version.");
        loadDecisions();
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to supersede decision.",
        );
        setBusy(false);
      });
  }

  function viewRevisions(decision: DecisionItem) {
    setSelectedDecision(decision);
    setShowHistory(true);
    api<{ revisions: DecisionRevision[] }>(
      `/workspaces/${workspaceId}/decisions/${decision.id}/revisions`,
      (v) => v as { revisions: DecisionRevision[] },
    )
      .then((res) => {
        setRevisions(res.revisions ?? []);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load revisions.",
        );
      });
  }

  const filtered = decisions.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={headingClass}>Decision Memory</h2>
          <p className={mutedClass}>
            Explicit rationale, context linkage, and auditable supersession
            history.
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
            <span>Record Decision</span>
          </Button>
        </div>
      </div>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {["all", "confirmed", "draft", "superseded", "revoked"].map((st) => (
          <CandyButton variant="ghost" size="unstyled"
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === st
                ? "bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-200 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
            }`}
          >
            {st.charAt(0).toUpperCase() + st.slice(1)}
          </CandyButton>
        ))}
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className={`${panelClass} space-y-4 p-5 sm:p-6`}>
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">
              New Architectural / Work Decision
            </h3>
            <CandyButton variant="ghost" size="unstyled"
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-neutral-400 hover:text-neutral-600 text-xs"
            >
              Cancel
            </CandyButton>
          </div>
          <Field label="Decision Title">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Adopt Row-Level Security for multi-tenant isolation"
              className={inputClass}
              maxLength={200}
              required
            />
          </Field>
          <Field label="Rationale & Context">
            <textarea
              value={newRationale}
              onChange={(e) => setNewRationale(e.target.value)}
              placeholder="Disclose the context, evaluated alternatives, and reasons for this decision..."
              className={`${inputClass} min-h-24`}
              required
            />
          </Field>
          <Field label="Effective Date">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreating(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving..." : "Confirm Decision"}
            </Button>
          </div>
        </form>
      )}

      {supersedeTarget && (
        <form
          onSubmit={handleSupersede}
          className={`${panelClass} space-y-4 p-5 sm:p-6 border-amber-300 dark:border-amber-700`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm text-amber-900 dark:text-amber-200">
                Supersede Decision: {supersedeTarget.title}
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This marks the previous decision as superseded and records a
                confirmed successor.
              </p>
            </div>
            <CandyButton variant="ghost" size="unstyled"
              type="button"
              onClick={() => setSupersedeTarget(null)}
              className="text-neutral-400 hover:text-neutral-600 text-xs"
            >
              Cancel
            </CandyButton>
          </div>
          <Field label="Successor Decision Title">
            <input
              type="text"
              value={supersedeTitle}
              onChange={(e) => setSupersedeTitle(e.target.value)}
              placeholder="New decision title reflecting current direction..."
              className={inputClass}
              maxLength={200}
              required
            />
          </Field>
          <Field label="Updated Rationale & Migration Path">
            <textarea
              value={supersedeRationale}
              onChange={(e) => setSupersedeRationale(e.target.value)}
              placeholder="Explain why this decision supersedes the prior one..."
              className={`${inputClass} min-h-24`}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSupersedeTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Applying..." : "Supersede & Confirm"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={`${panelClass} flex flex-col items-center justify-center gap-3 p-12 text-center`}>
          <Orb state="solving" interactive={false} theme="auto" size={64} display={44} />
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Loading decisions...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${panelClass} p-8 text-center space-y-2`}>
          <Icon name="decision" className="size-8 mx-auto text-zinc-400" />
          <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">No decisions found</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Decisions capture architecture choices, trade-offs, and commitments
            with provenance.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`${panelClass} space-y-3 p-5 sm:p-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                      item.status === "confirmed"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : item.status === "superseded"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : item.status === "draft"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300"
                    }`}
                  >
                    {item.status}
                  </span>
                  <h4 className="font-medium text-sm">{item.title}</h4>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>{item.decisionDate}</span>
                  <span>•</span>
                  <span>v{item.version}</span>
                </div>
              </div>

              <div className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap pl-3 border-l-2 border-neutral-200 dark:border-neutral-800">
                {item.rationale}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-900 text-xs">
                <CandyButton variant="ghost" size="unstyled"
                  type="button"
                  onClick={() => viewRevisions(item)}
                  className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline"
                >
                  View audit history
                </CandyButton>
                {item.status === "confirmed" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSupersedeTarget(item);
                      setSupersedeTitle(`Supersedes: ${item.title}`);
                    }}
                  >
                    Supersede
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showHistory && selectedDecision && (
        <Modal open onClose={() => setShowHistory(false)} title={`Decision History: ${selectedDecision.title}`} busy={busy}>
          <div className="space-y-4">
            
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="p-3 bg-neutral-50 dark:bg-neutral-950 rounded border border-neutral-200 dark:border-neutral-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      v{rev.version} — {rev.status}
                    </span>
                    <span className="text-neutral-400">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-400">
                    {rev.rationale}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
