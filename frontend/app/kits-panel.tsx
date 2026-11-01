"use client";

import { CandyButton } from "@/components/ui/candy-button";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { Icon } from "../components/icon";
import { Orb } from "@/components/ui/orb";
import { WorkflowCard, type WorkflowSection } from "@/components/ui/workflow-card";
import {
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";

export interface KitItem {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  version: string;
  manifest: {
    schemas?: Array<{ name: string; properties: Array<{ name: string; type: string }> }>;
    templates?: Array<{ title: string; kind: string }>;
    views?: Array<{ name: string; target: string }>;
    rules?: Array<{ name: string; trigger: string; action: string }>;
  };
  authorId: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  isInstalled?: boolean;
}

export interface ConflictItem {
  type: "schema" | "view" | "rule";
  identifier: string;
  existingValue: string;
  incomingValue: string;
  action: "preserve_local" | "replace";
}

export interface PreviewData {
  kitId: string;
  kitName: string;
  conflicts: ConflictItem[];
  canInstall: boolean;
  summary: string;
}

export default function KitsPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [kits, setKits] = useState<KitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [previewKit, setPreviewKit] = useState<PreviewData | null>(null);
  const [choices, setChoices] = useState<Record<string, "preserve_local" | "replace">>({});

  const [isCreating, setIsCreating] = useState(false);
  const [kitName, setKitName] = useState("");
  const [kitDesc, setKitDesc] = useState("");
  const [kitVersion, setKitVersion] = useState("1.0.0");
  const [schemaName, setSchemaName] = useState("");

  const [formulaExpr, setFormulaExpr] = useState("ROUND(45.678 * 2, 2)");
  const [formulaResult, setFormulaResult] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [evaluatingFormula, setEvaluatingFormula] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<{ kits: KitItem[] }>(
      `/workspaces/${workspaceId}/kits`,
      (v) => v as { kits: KitItem[] },
      { signal: controller.signal }
    )
      .then((res) => {
        setKits(res.kits ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load kits.");
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  function loadKits() {
    setBusy(true);
    api<{ kits: KitItem[] }>(
      `/workspaces/${workspaceId}/kits`,
      (v) => v as { kits: KitItem[] }
    )
      .then((res) => {
        setKits(res.kits ?? []);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to reload kits.");
        setBusy(false);
      });
  }

  function handleCreateKit(e: FormEvent) {
    e.preventDefault();
    if (!kitName.trim()) return;

    setBusy(true);
    setError("");
    const manifest = {
      schemas: schemaName.trim()
        ? [
            {
              name: schemaName.trim(),
              properties: [
                { name: "Priority", type: "select" },
                { name: "Estimate", type: "number" },
                { name: "Notes", type: "text" },
              ],
            },
          ]
        : [],
      templates: [
        { title: `${kitName} Checklist`, kind: "task" },
        { title: `${kitName} Specification`, kind: "page" },
      ],
      views: [{ name: `${kitName} Active Board`, target: "tasks" }],
    };

    api<{ kit: KitItem }>(
      `/workspaces/${workspaceId}/kits`,
      (v) => v as { kit: KitItem },
      {
        method: "POST",
        csrf,
        body: {
          name: kitName.trim(),
          description: kitDesc.trim(),
          version: kitVersion.trim(),
          manifest,
        },
      }
    )
      .then((res) => {
        setKits((prev) => [res.kit, ...prev]);
        setIsCreating(false);
        setKitName("");
        setKitDesc("");
        setSchemaName("");
        setNotice("Workspace Kit created and published.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to create kit.");
        setBusy(false);
      });
  }

  function handleOpenPreview(kitId: string) {
    setBusy(true);
    setError("");
    api<{ preview: PreviewData }>(
      `/workspaces/${workspaceId}/kits/${kitId}/preview`,
      (v) => v as { preview: PreviewData }
    )
      .then((res) => {
        setPreviewKit(res.preview);
        const initialChoices: Record<string, "preserve_local" | "replace"> = {};
        for (const c of res.preview.conflicts) {
          initialChoices[c.identifier] = "preserve_local";
        }
        setChoices(initialChoices);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to inspect kit.");
        setBusy(false);
      });
  }

  function handleInstallKit() {
    if (!previewKit) return;
    setBusy(true);
    setError("");
    api<{ installed: boolean; appliedCount: number }>(
      `/workspaces/${workspaceId}/kits/${previewKit.kitId}/install`,
      (v) => v as { installed: boolean; appliedCount: number },
      {
        method: "POST",
        csrf,
        body: { choices },
      }
    )
      .then((res) => {
        setNotice(`Kit installed successfully (${res.appliedCount} schemas/items applied).`);
        setPreviewKit(null);
        loadKits();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to install kit.");
        setBusy(false);
      });
  }

  function handleEvaluateFormula(e: FormEvent) {
    e.preventDefault();
    if (!formulaExpr.trim()) return;
    setEvaluatingFormula(true);
    setFormulaError(null);
    setFormulaResult(null);

    api<{ evaluation: { result: unknown; error: string | null; evaluatedType: string } }>(
      `/workspaces/${workspaceId}/formulas/evaluate`,
      (v) => v as { evaluation: { result: unknown; error: string | null; evaluatedType: string } },
      {
        method: "POST",
        csrf,
        body: { expression: formulaExpr.trim() },
      }
    )
      .then((res) => {
        if (res.evaluation.error) {
          setFormulaError(res.evaluation.error);
        } else {
          setFormulaResult(String(res.evaluation.result) + ` (${res.evaluation.evaluatedType})`);
        }
        setEvaluatingFormula(false);
      })
      .catch((err: unknown) => {
        setFormulaError(err instanceof Error ? err.message : "Evaluation failed.");
        setEvaluatingFormula(false);
      });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={headingClass}>Workspace Kits & Rich Knowledge</h2>
          <p className={mutedClass}>
            Reusable, versioned templates, schemas, formula calculations, and conflict-safe installations.
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
            <span>Publish Kit</span>
          </Button>
        </div>
      </div>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className={`${panelClass} space-y-4 p-5 sm:p-6`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Rich Formula Sandbox
          </span>
        </div>
        <form onSubmit={handleEvaluateFormula} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <Field label="Formula Expression (ROUND, CONCAT, IF, DAYS_BETWEEN, arithmetic)">
              <input
                type="text"
                value={formulaExpr}
                onChange={(e) => setFormulaExpr(e.target.value)}
                className={inputClass}
                placeholder='e.g. IF(10 > 5, "Above target", "Below target")'
                required
              />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={evaluatingFormula}>
            <span>{evaluatingFormula ? "Evaluating..." : "Evaluate"}</span>
          </Button>
        </form>
        {formulaResult && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200">
            <span className="font-semibold">Result:</span> {formulaResult}
          </div>
        )}
        {formulaError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
            <span className="font-semibold">Evaluation Error:</span> {formulaError}
          </div>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleCreateKit} className={`${panelClass} space-y-4 p-5 sm:p-6`}>
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Create New Workspace Kit</h3>
            <CandyButton variant="ghost" size="unstyled"
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-neutral-400 hover:text-neutral-600 text-xs"
            >
              Cancel
            </CandyButton>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Kit Name">
              <input
                type="text"
                value={kitName}
                onChange={(e) => setKitName(e.target.value)}
                placeholder="e.g. Sprint & Delivery Kit"
                className={inputClass}
                maxLength={100}
                required
              />
            </Field>
            <Field label="Version">
              <input
                type="text"
                value={kitVersion}
                onChange={(e) => setKitVersion(e.target.value)}
                placeholder="1.0.0"
                className={inputClass}
                required
              />
            </Field>
          </div>
          <Field label="Description">
            <input
              type="text"
              value={kitDesc}
              onChange={(e) => setKitDesc(e.target.value)}
              placeholder="Package of sprint planning templates, custom collection schema, and views..."
              className={inputClass}
            />
          </Field>
          <Field label="Collection Schema Name (Optional)">
            <input
              type="text"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
              placeholder="e.g. Sprint Backlog"
              className={inputClass}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Publishing..." : "Publish Kit"}
            </Button>
          </div>
        </form>
      )}

      {previewKit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Install Kit: {previewKit.kitName}</h3>
              <CandyButton variant="ghost" size="unstyled"
                type="button"
                onClick={() => setPreviewKit(null)}
                className="text-neutral-400 hover:text-neutral-600 text-xs"
              >
                Close
              </CandyButton>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {previewKit.summary}
            </p>

            {previewKit.conflicts.length > 0 && (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Detected Conflicts & Resolution:
                </h4>
                {previewKit.conflicts.map((c) => (
                  <div key={c.identifier} className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded border border-amber-200 dark:border-amber-900 text-xs space-y-2">
                    <div className="font-medium">{c.identifier} ({c.type})</div>
                    <div className="text-neutral-600 dark:text-neutral-400 text-[11px]">
                      {c.existingValue} vs {c.incomingValue}
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`choice_${c.identifier}`}
                          checked={choices[c.identifier] === "preserve_local"}
                          onChange={() => setChoices({ ...choices, [c.identifier]: "preserve_local" })}
                        />
                        <span>Preserve Local</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`choice_${c.identifier}`}
                          checked={choices[c.identifier] === "replace"}
                          onChange={() => setChoices({ ...choices, [c.identifier]: "replace" })}
                        />
                        <span>Replace with Kit</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setPreviewKit(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleInstallKit} disabled={busy}>
                {busy ? "Installing..." : "Confirm & Install"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className={`${panelClass} flex flex-col items-center justify-center gap-3 p-12 text-center`}>
          <Orb state="solving" interactive={false} theme="auto" size={64} display={48} />
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Loading workspace kits...</p>
        </div>
      ) : kits.length === 0 ? (
        <div className={`${panelClass} p-8 text-center space-y-2`}>
          <Icon name="kit" className="size-8 mx-auto text-zinc-400" />
          <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">No workspace kits available</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Workspace Kits bundle collection schemas, templates, views, and automation rules into reusable packages.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {kits.map((k) => {
            const sections: WorkflowSection[] = [
              {
                id: "schemas",
                label: "Schemas & Types",
                tasks: (k.manifest.schemas ?? []).map((s, idx) => ({
                  id: `schema-${idx}`,
                  label: s.name,
                  done: true,
                })),
              },
              {
                id: "templates",
                label: "Templates & Views",
                tasks: (k.manifest.templates ?? []).map((t, idx) => ({
                  id: `tpl-${idx}`,
                  label: t.title,
                  done: k.isInstalled ?? false,
                })),
              },
            ];

            return (
              <div
                key={k.id}
                className={`${panelClass} flex flex-col justify-between p-5 space-y-4`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{k.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      v{k.version}
                    </span>
                  </div>
                  {k.isInstalled && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Installed
                    </span>
                  )}
                </div>

                <div className="flex justify-center overflow-hidden py-1">
                  <WorkflowCard
                    title={k.name}
                    description={k.description || "Pre-packaged workspace workflows and schema specifications."}
                    status={k.isInstalled ? "done" : "todo"}
                    sections={sections}
                    width={380}
                  />
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>{k.manifest.schemas?.length ?? 0} schemas</span>
                    <span>•</span>
                    <span>{k.manifest.templates?.length ?? 0} templates</span>
                  </div>
                  <Button
                    type="button"
                    variant={k.isInstalled ? "ghost" : "primary"}
                    onClick={() => handleOpenPreview(k.id)}
                    disabled={busy}
                  >
                    <span>{k.isInstalled ? "Reconfigure" : "Install Kit"}</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

