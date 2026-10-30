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

export interface SharingExposureItem {
  id: string;
  workspaceId: string;
  targetRecordId: string;
  targetRecordType: "page" | "task" | "project" | "collection";
  recipientEmail: string;
  accessLevel: "view" | "comment" | "edit" | "admin";
  inheritedAccess: Array<{
    sourceId: string;
    sourceType: string;
    role: string;
  }>;
  inaccessibleReferences: Array<{
    referenceId: string;
    referenceType: string;
    title: string;
  }>;
  exposureSummary: string;
  createdAt: string;
}

export interface HandoverPackItem {
  id: string;
  workspaceId: string;
  title: string;
  fromUserId: string;
  toUserEmail: string;
  handoverToken: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  recordIds: string[];
  checklist: Array<{ task: string; completed: boolean }>;
  notes: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface KnowledgeFreshnessItem {
  id: string;
  workspaceId: string;
  pageId: string;
  reviewCadenceDays: number;
  lastReviewedAt: string;
  freshnessStatus: "fresh" | "due_for_review" | "stale";
  sourceChangeAlerts: string[];
  updatedAt: string;
}

export interface ScenarioPlanItem {
  id: string;
  workspaceId: string;
  name: string;
  baselineProjectId: string | null;
  description: string | null;
  modifications: Array<{
    entityId: string;
    field: string;
    baselineValue: unknown;
    simulatedValue: unknown;
  }>;
  impactSummary: {
    deadlineShiftDays: number;
    workloadDeltaHours: number;
    impactedCommitmentCount: number;
    feasibility: "feasible" | "tight" | "infeasible";
  };
  createdAt: string;
  updatedAt: string;
}

export interface AttentionBudgetItem {
  workspaceId: string;
  userId: string;
  focusWindowStart: string;
  focusWindowEnd: string;
  batchingIntervalMinutes: number;
  urgentBypassEnabled: boolean;
}

export default function FutureDiscoveryPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [activeTab, setActiveTab] = useState<
    "exposure" | "handover" | "freshness" | "scenarios" | "attention"
  >("exposure");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [previews, setPreviews] = useState<SharingExposureItem[]>([]);
  const [targetId, setTargetId] = useState("page-q3-roadmap");
  const [targetType, setTargetType] = useState<
    "page" | "task" | "project" | "collection"
  >("page");
  const [recipientEmail, setRecipientEmail] = useState("alex@example.com");
  const [accessLevel, setAccessLevel] = useState<
    "view" | "comment" | "edit" | "admin"
  >("view");
  const [latestPreview, setLatestPreview] =
    useState<SharingExposureItem | null>(null);

  const [handovers, setHandovers] = useState<HandoverPackItem[]>([]);
  const [handoverTitle, setHandoverTitle] = useState("");
  const [handoverEmail, setHandoverEmail] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");

  const [freshnessList, setFreshnessList] = useState<KnowledgeFreshnessItem[]>(
    [],
  );

  const [scenarios, setScenarios] = useState<ScenarioPlanItem[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [deadlineShiftInput, setDeadlineShiftInput] = useState(5);
  const [workloadDeltaInput, setWorkloadDeltaInput] = useState(10);

  const [, setAttention] = useState<AttentionBudgetItem | null>(null);
  const [focusStart, setFocusStart] = useState("09:00");
  const [focusEnd, setFocusEnd] = useState("12:00");
  const [batchingInterval, setBatchingInterval] = useState(60);
  const [urgentBypass, setUrgentBypass] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ previews: SharingExposureItem[] }>(
        `/workspaces/${workspaceId}/exposure/previews`,
        (v) => v as { previews: SharingExposureItem[] },
        { signal: controller.signal },
      ),
      api<{ packs: HandoverPackItem[] }>(
        `/workspaces/${workspaceId}/handovers`,
        (v) => v as { packs: HandoverPackItem[] },
        { signal: controller.signal },
      ),
      api<{ reviews: KnowledgeFreshnessItem[] }>(
        `/workspaces/${workspaceId}/freshness`,
        (v) => v as { reviews: KnowledgeFreshnessItem[] },
        { signal: controller.signal },
      ),
      api<{ scenarios: ScenarioPlanItem[] }>(
        `/workspaces/${workspaceId}/scenarios`,
        (v) => v as { scenarios: ScenarioPlanItem[] },
        { signal: controller.signal },
      ),
      api<{ budget: AttentionBudgetItem }>(
        `/workspaces/${workspaceId}/attention-budget`,
        (v) => v as { budget: AttentionBudgetItem },
        { signal: controller.signal },
      ),
    ])
      .then(([prevRes, handRes, freshRes, scenRes, attRes]) => {
        setPreviews(prevRes.previews ?? []);
        setHandovers(handRes.packs ?? []);
        setFreshnessList(freshRes.reviews ?? []);
        setScenarios(scenRes.scenarios ?? []);
        const b = attRes.budget;
        setAttention(b);
        setFocusStart(b.focusWindowStart);
        setFocusEnd(b.focusWindowEnd);
        setBatchingInterval(b.batchingIntervalMinutes);
        setUrgentBypass(b.urgentBypassEnabled);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load discovery data.",
          );
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  function handleEvaluateExposure(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    api<{ preview: SharingExposureItem }>(
      `/workspaces/${workspaceId}/exposure/preview`,
      (v) => v as { preview: SharingExposureItem },
      {
        method: "POST",
        csrf,
        body: {
          targetRecordId: targetId.trim(),
          targetRecordType: targetType,
          recipientEmail: recipientEmail.trim(),
          accessLevel,
        },
      },
    )
      .then((res) => {
        setLatestPreview(res.preview);
        setPreviews([res.preview, ...previews]);
        setNotice(
          "Exposure map evaluated. Review visible links and inherited rights below.",
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Exposure evaluation failed.",
        );
        setBusy(false);
      });
  }

  function handleCreateHandover(e: FormEvent) {
    e.preventDefault();
    if (!handoverTitle.trim() || !handoverEmail.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");

    api<{ pack: HandoverPackItem }>(
      `/workspaces/${workspaceId}/handovers`,
      (v) => v as { pack: HandoverPackItem },
      {
        method: "POST",
        csrf,
        body: {
          title: handoverTitle.trim(),
          toUserEmail: handoverEmail.trim(),
          recordIds: ["task-project-alpha", "doc-system-spec"],
          notes: handoverNotes.trim() || undefined,
          expiryDays: 14,
        },
      },
    )
      .then((res) => {
        setHandovers([res.pack, ...handovers]);
        setHandoverTitle("");
        setHandoverEmail("");
        setHandoverNotes("");
        setNotice(
          `Handover pack created with token: ${res.pack.handoverToken}`,
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to create handover pack.",
        );
        setBusy(false);
      });
  }

  function handleRevokeHandover(packId: string) {
    setBusy(true);
    setError("");
    api(`/workspaces/${workspaceId}/handovers/${packId}`, (v) => v, {
      method: "DELETE",
      csrf,
    })
      .then(() => {
        setHandovers(
          handovers.map((p) =>
            p.id === packId ? { ...p, status: "revoked" as const } : p,
          ),
        );
        setNotice("Handover pack revoked.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to revoke pack.");
        setBusy(false);
      });
  }

  function handleVerifyFreshness(pageId: string) {
    setBusy(true);
    setError("");
    api<{ review: KnowledgeFreshnessItem }>(
      `/workspaces/${workspaceId}/freshness/${pageId}/verify`,
      (v) => v as { review: KnowledgeFreshnessItem },
      {
        method: "POST",
        csrf,
        body: { reviewCadenceDays: 90 },
      },
    )
      .then((res) => {
        setFreshnessList(
          freshnessList.map((f) => (f.pageId === pageId ? res.review : f)),
        );
        setNotice(
          `Freshness verified for page '${pageId}'. Next review in 90 days.`,
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Verification failed.");
        setBusy(false);
      });
  }

  function handleCreateScenario(e: FormEvent) {
    e.preventDefault();
    if (!scenarioName.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");

    const simulatedModifications = [
      {
        entityId: "task-release-candidate",
        field: "deadline",
        baselineValue: new Date().toISOString().slice(0, 10),
        simulatedValue: new Date(Date.now() + deadlineShiftInput * 86_400_000)
          .toISOString()
          .slice(0, 10),
      },
      {
        entityId: "task-integration-review",
        field: "estimateMinutes",
        baselineValue: 120,
        simulatedValue: 120 + workloadDeltaInput * 60,
      },
    ];

    api<{ scenario: ScenarioPlanItem }>(
      `/workspaces/${workspaceId}/scenarios`,
      (v) => v as { scenario: ScenarioPlanItem },
      {
        method: "POST",
        csrf,
        body: {
          name: scenarioName.trim(),
          description: "Simulated schedule shift and estimate revision impact",
          modifications: simulatedModifications,
        },
      },
    )
      .then((res) => {
        setScenarios([res.scenario, ...scenarios]);
        setScenarioName("");
        setNotice(
          `Scenario '${res.scenario.name}' created with feasibility: ${res.scenario.impactSummary.feasibility}.`,
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to simulate scenario.",
        );
        setBusy(false);
      });
  }

  function handleSaveAttention(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    api<{ budget: AttentionBudgetItem }>(
      `/workspaces/${workspaceId}/attention-budget`,
      (v) => v as { budget: AttentionBudgetItem },
      {
        method: "PUT",
        csrf,
        body: {
          focusWindowStart: focusStart,
          focusWindowEnd: focusEnd,
          batchingIntervalMinutes: batchingInterval,
          urgentBypassEnabled: urgentBypass,
        },
      },
    )
      .then((res) => {
        setAttention(res.budget);
        setNotice("Attention budget and focus windows updated.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to update attention budget.",
        );
        setBusy(false);
      });
  }

  if (loading) {
    return (
      <div className={panelClass}>
        <div className="flex items-center gap-2 text-stone-500 py-8 justify-center">
          <Icon name="refresh" className="animate-spin" />
          <span>Loading future discovery capabilities...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h2 className={headingClass}>
            Future Discovery & Advanced Capabilities
          </h2>
          <p className={mutedClass}>
            Explore and evaluate exposure maps, handover packs, knowledge
            freshness, and scenario planning.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("exposure")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "exposure"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            Exposure Map
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("handover")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "handover"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            Handover Packs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("freshness")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "freshness"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            Knowledge Freshness
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scenarios")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "scenarios"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            Scenario Planning
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("attention")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "attention"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            Attention Budgets
          </button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {activeTab === "exposure" && (
        <div className="space-y-6 pt-4">
          <form
            onSubmit={handleEvaluateExposure}
            className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-4"
          >
            <h3 className="text-base font-semibold">
              Evaluate Sharing Preview & Exposure Map (F-05)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Field label="Record ID">
                <input
                  type="text"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Record Type">
                <select
                  value={targetType}
                  onChange={(e) =>
                    setTargetType(
                      e.target.value as
                        | "page"
                        | "task"
                        | "project"
                        | "collection",
                    )
                  }
                  className={inputClass}
                >
                  <option value="page">Page</option>
                  <option value="task">Task</option>
                  <option value="project">Project</option>
                  <option value="collection">Collection</option>
                </select>
              </Field>
              <Field label="Recipient Email">
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Granted Access">
                <select
                  value={accessLevel}
                  onChange={(e) =>
                    setAccessLevel(
                      e.target.value as "view" | "comment" | "edit" | "admin",
                    )
                  }
                  className={inputClass}
                >
                  <option value="view">View</option>
                  <option value="comment">Comment</option>
                  <option value="edit">Edit</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
            </div>
            <Button type="submit" disabled={busy}>
              Inspect Exposure Map
            </Button>
          </form>

          {latestPreview && (
            <div className="p-4 border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-blue-900 dark:text-blue-300 text-sm">
                  Simulated Recipient Exposure Result
                </h4>
                <span className="text-xs font-mono uppercase bg-blue-200 dark:bg-blue-900 px-2 py-0.5 rounded text-blue-800 dark:text-blue-200">
                  {latestPreview.accessLevel}
                </span>
              </div>
              <p className="text-xs text-stone-700 dark:text-stone-300">
                {latestPreview.exposureSummary}
              </p>
              <div className="text-xs text-stone-500 font-mono">
                Inherited context: {latestPreview.inheritedAccess.length} parent
                permissions validated.
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-base font-semibold">
              Recent Exposure Map Evaluations
            </h4>
            {previews.length === 0 ? (
              <p className={mutedClass}>
                No exposure map evaluations conducted yet.
              </p>
            ) : (
              <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden text-xs">
                {previews.map((prev) => (
                  <div
                    key={prev.id}
                    className="p-3 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {prev.recipientEmail}
                      </span>
                      <span className="text-stone-500 ml-2">
                        ({prev.targetRecordType}: {prev.targetRecordId})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded text-[11px]">
                        {prev.accessLevel}
                      </span>
                      <span className="text-stone-400">
                        {new Date(prev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "handover" && (
        <div className="space-y-6 pt-4">
          <form
            onSubmit={handleCreateHandover}
            className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-4"
          >
            <h3 className="text-base font-semibold">
              Initiate Secure Handover Pack (F-03)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Handover Title">
                <input
                  type="text"
                  placeholder="e.g. Q4 Sprint Leadership Transfer"
                  value={handoverTitle}
                  onChange={(e) => setHandoverTitle(e.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Recipient Email">
                <input
                  type="email"
                  placeholder="successor@example.com"
                  value={handoverEmail}
                  onChange={(e) => setHandoverEmail(e.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
            </div>
            <Field label="Handover Briefing Notes">
              <textarea
                rows={2}
                placeholder="Key context, pending deliverables, and stakeholder expectations..."
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Button
              type="submit"
              disabled={busy || !handoverTitle.trim() || !handoverEmail.trim()}
            >
              Create Handover Pack
            </Button>
          </form>

          <div className="space-y-3">
            <h4 className="text-base font-semibold">
              Active & Completed Handover Packs
            </h4>
            {handovers.length === 0 ? (
              <p className={mutedClass}>
                No handover packs active in this workspace.
              </p>
            ) : (
              <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
                {handovers.map((h) => (
                  <div
                    key={h.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900 dark:text-stone-100">
                          {h.title}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-mono ${
                            h.status === "accepted"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : h.status === "pending"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          }`}
                        >
                          {h.status}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 mt-1">
                        To: {h.toUserEmail} • Token:{" "}
                        <span className="font-mono">
                          {h.handoverToken.slice(0, 12)}...
                        </span>
                      </div>
                      {h.checklist && h.checklist.length > 0 && (
                        <div className="mt-2 text-xs text-stone-600 dark:text-stone-400">
                          {h.checklist.length} handover responsibilities linked.
                        </div>
                      )}
                    </div>
                    {h.status === "pending" && (
                      <Button
                        variant="secondary"
                        onClick={() => handleRevokeHandover(h.id)}
                        disabled={busy}
                        className="text-xs text-red-600 dark:text-red-400 self-start sm:self-center"
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "freshness" && (
        <div className="space-y-6 pt-4">
          <div className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800">
            <h3 className="text-base font-semibold">
              Knowledge Freshness & Review Cycles (F-04)
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Automated review schedules ensure documentation remains accurate
              and flags changes to linked source entities.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-base font-semibold">Audited Workspace Pages</h4>
            {freshnessList.length === 0 ? (
              <div className="p-4 border border-stone-200 dark:border-stone-800 rounded-lg text-center space-y-2">
                <p className={mutedClass}>
                  No page freshness schedules registered yet.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => handleVerifyFreshness("architecture-manifest")}
                  disabled={busy}
                  className="text-xs"
                >
                  Register Architecture Manifest Schedule
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
                {freshnessList.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900 dark:text-stone-100">
                          {item.pageId}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-mono ${
                            item.freshnessStatus === "fresh"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : item.freshnessStatus === "due_for_review"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          }`}
                        >
                          {item.freshnessStatus}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 mt-1">
                        Cadence: {item.reviewCadenceDays} days • Last Reviewed:{" "}
                        {new Date(item.lastReviewedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => handleVerifyFreshness(item.pageId)}
                      disabled={busy}
                      className="text-xs"
                    >
                      Confirm Freshness
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "scenarios" && (
        <div className="space-y-6 pt-4">
          <form
            onSubmit={handleCreateScenario}
            className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-4"
          >
            <h3 className="text-base font-semibold">
              Workspace Scenario Planning & Impact Simulation (F-01)
            </h3>
            <Field label="Scenario Name">
              <input
                type="text"
                placeholder="e.g. Expedited Q4 Delivery (+5h buffer, -3 days)"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Simulated Deadline Shift (days)">
                <input
                  type="number"
                  value={deadlineShiftInput}
                  onChange={(e) =>
                    setDeadlineShiftInput(parseInt(e.target.value, 10) || 0)
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Simulated Workload Delta (hours)">
                <input
                  type="number"
                  value={workloadDeltaInput}
                  onChange={(e) =>
                    setWorkloadDeltaInput(parseInt(e.target.value, 10) || 0)
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <Button type="submit" disabled={busy || !scenarioName.trim()}>
              Run Scenario Impact Simulation
            </Button>
          </form>

          <div className="space-y-3">
            <h4 className="text-base font-semibold">
              Simulated Workspace Scenarios
            </h4>
            {scenarios.length === 0 ? (
              <p className={mutedClass}>No scenario simulations created yet.</p>
            ) : (
              <div className="space-y-3">
                {scenarios.map((scen) => (
                  <div
                    key={scen.id}
                    className="p-4 border border-stone-200 dark:border-stone-800 rounded-lg bg-white dark:bg-stone-900 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {scen.name}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-mono ${
                          scen.impactSummary.feasibility === "feasible"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : scen.impactSummary.feasibility === "tight"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {scen.impactSummary.feasibility}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 text-xs font-mono text-stone-600 dark:text-stone-400">
                      <div>Shift: {scen.impactSummary.deadlineShiftDays}d</div>
                      <div>
                        Workload: {scen.impactSummary.workloadDeltaHours}h
                      </div>
                      <div>
                        Commitments:{" "}
                        {scen.impactSummary.impactedCommitmentCount}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "attention" && (
        <form onSubmit={handleSaveAttention} className="space-y-6 pt-4">
          <div className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-4">
            <h3 className="text-base font-semibold">
              Attention Budgets & Interruption Controls (F-06)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Daily Focus Window Start">
                <input
                  type="text"
                  value={focusStart}
                  onChange={(e) => setFocusStart(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Daily Focus Window End">
                <input
                  type="text"
                  value={focusEnd}
                  onChange={(e) => setFocusEnd(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Batching Interval (minutes)">
                <input
                  type="number"
                  min="15"
                  max="480"
                  value={batchingInterval}
                  onChange={(e) =>
                    setBatchingInterval(parseInt(e.target.value, 10) || 60)
                  }
                  className={inputClass}
                />
              </Field>
              <label className="flex items-center gap-3 p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg cursor-pointer self-end">
                <input
                  type="checkbox"
                  checked={urgentBypass}
                  onChange={(e) => setUrgentBypass(e.target.checked)}
                  className="rounded text-stone-900 focus:ring-stone-500"
                />
                <span className="text-sm text-stone-700 dark:text-stone-300">
                  Allow Urgent Priority Bypasses
                </span>
              </label>
            </div>
            <Button type="submit" disabled={busy}>
              Save Attention Budget
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
