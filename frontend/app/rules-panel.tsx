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

export interface RuleCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains";
  value: string;
}

export interface RuleAction {
  type: "set_priority" | "assign_user" | "create_capture" | "request_review";
  targetField?: string;
  value?: string;
}

export interface AutomationRule {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  triggerType: "task.created" | "task.completed" | "capture.created" | "promise.confirmed";
  conditions: RuleCondition[];
  actions: RuleAction[];
  isEnabled: boolean;
  quotaUsed: number;
  version: number;
  createdAt: string;
}

export interface AutomationRun {
  id: string;
  workspaceId: string;
  ruleId: string;
  triggerType: string;
  targetId: string;
  status: "completed" | "failed" | "blocked_review";
  dedupKey: string;
  executedActions: RuleAction[];
  errorMessage: string | null;
  createdAt: string;
}

export default function RulesPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationRule["triggerType"]>("task.created");
  const [conditionField, setConditionField] = useState("priority");
  const [conditionOp, setConditionOp] = useState<RuleCondition["operator"]>("equals");
  const [conditionVal, setConditionVal] = useState("urgent");
  const [actionType, setActionType] = useState<RuleAction["type"]>("set_priority");
  const [actionValue, setActionValue] = useState("urgent");

  const [selectedRuleRuns, setSelectedRuleRuns] = useState<{ rule: AutomationRule; runs: AutomationRun[] } | null>(null);

  const [rulesVersion, setRulesVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<{ rules: AutomationRule[] }>(
      `/workspaces/${workspaceId}/rules`,
      (v) => v as { rules: AutomationRule[] },
      { signal: controller.signal }
    )
      .then((res) => {
        setRules(res.rules);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load automation rules.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, rulesVersion]);

  const handleCreateRule = async (e: FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;
    try {
      setBusy(true);
      setError("");
      const conditions: RuleCondition[] = conditionVal ? [{ field: conditionField, operator: conditionOp, value: conditionVal }] : [];
      const actions: RuleAction[] = [{ type: actionType, value: actionValue }];
      const res = await api<{ rule: AutomationRule }>(
        `/workspaces/${workspaceId}/rules`,
        (v) => v as { rule: AutomationRule },
        {
          method: "POST",
          csrf,
          body: {
            name: ruleName.trim(),
            triggerType,
            conditions,
            actions,
          },
        }
      );
      setRules((prev) => [res.rule, ...prev]);
      setModalOpen(false);
      setRuleName("");
      setNotice("Automation rule created.");
      setRulesVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRule = async (rule: AutomationRule) => {
    try {
      setBusy(true);
      const res = await api<{ rule: AutomationRule }>(
        `/workspaces/${workspaceId}/rules/${rule.id}`,
        (v) => v as { rule: AutomationRule },
        {
          method: "PATCH",
          csrf,
          body: {
            isEnabled: !rule.isEnabled,
            expectedVersion: rule.version,
          },
        }
      );
      setRules((prev) => prev.map((r) => (r.id === rule.id ? res.rule : r)));
      setRulesVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rule.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      setBusy(true);
      await api(
        `/workspaces/${workspaceId}/rules/${ruleId}`,
        (v) => v,
        {
          method: "DELETE",
          csrf,
        }
      );
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      if (selectedRuleRuns?.rule.id === ruleId) setSelectedRuleRuns(null);
      setNotice("Rule removed.");
      setRulesVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule.");
    } finally {
      setBusy(false);
    }
  };

  const handleViewRuns = async (rule: AutomationRule) => {
    try {
      setBusy(true);
      const res = await api<{ runs: AutomationRun[] }>(
        `/workspaces/${workspaceId}/rules/${rule.id}/runs`,
        (v) => v as { runs: AutomationRun[] }
      );
      setSelectedRuleRuns({ rule, runs: res.runs });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run history.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={headingClass}>Automation & Rules</h2>
          <p className={`text-xs ${mutedClass}`}>
            Configure scoped event triggers, conditions, and actions. External actions remain review-protected and cannot bypass explicit user approval.
          </p>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Icon name="plus" className="size-4" />
          Create Rule
        </Button>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="neutral">{notice}</Notice>}

      <section>
        {loading ? (
          <div className="p-8 text-center text-sm text-[#707c93]">Loading rules...</div>
        ) : rules.length === 0 ? (
          <div className={`${panelClass} p-8 text-center text-sm ${mutedClass}`}>
            No rules configured yet. Create a rule to automatically triage tasks or route commitments.
          </div>
        ) : (
          <div className="divide-y divide-[#e3e6ef] rounded-lg border border-[#e3e6ef] bg-white dark:divide-[#2d2d31] dark:border-[#2d2d31] dark:bg-[#1a1a1c]">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block size-2 rounded-full ${
                        rule.isEnabled ? "bg-emerald-500" : "bg-zinc-400"
                      }`}
                    />
                    <h4 className="text-xs font-medium text-[#1e2025] dark:text-[#e4e4e7]">
                      {rule.name}
                    </h4>
                    <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                      When: {rule.triggerType}
                    </span>
                  </div>
                  <div className={`flex flex-wrap items-center gap-3 text-[11px] ${mutedClass}`}>
                    <span>
                      Conditions:{" "}
                      {rule.conditions.length === 0
                        ? "Always"
                        : rule.conditions.map((c) => `${c.field} ${c.operator} "${c.value}"`).join(", ")}
                    </span>
                    <span>·</span>
                    <span>Actions: {rule.actions.map((a) => a.type).join(", ")}</span>
                    <span>·</span>
                    <span>Usage: {rule.quotaUsed}/500</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleToggleRule(rule)}
                    disabled={busy}
                  >
                    {rule.isEnabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewRuns(rule)}
                    disabled={busy}
                  >
                    Runs
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteRule(rule.id)}
                    disabled={busy}
                  >
                    <Icon name="trash" className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleCreateRule}
            className={`${panelClass} max-h-[90vh] w-full max-w-lg overflow-y-auto space-y-4 p-6 shadow-2xl`}
          >
            <div className="flex items-center justify-between border-b border-[#e3e6ef] pb-3 dark:border-[#2d2d31]">
              <h3 className="text-sm font-semibold text-[#1e2025] dark:text-white">
                Create Automation Rule
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[#677287] hover:text-black dark:hover:text-white"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            <Notice tone="neutral">
              Rules execute automatically for app-owned changes. Actions with external side effects require manual review and cannot be executed automatically.
            </Notice>

            <Field label="Rule Name">
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Flag urgent incoming tasks"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                required
                maxLength={100}
              />
            </Field>

            <Field label="When Event Occurs (Trigger)">
              <select
                className={inputClass}
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as AutomationRule["triggerType"])}
              >
                <option value="task.created">Task Created</option>
                <option value="task.completed">Task Completed</option>
                <option value="capture.created">Capture Item Added</option>
                <option value="promise.confirmed">Promise Confirmed</option>
              </select>
            </Field>

            <div className="space-y-2 rounded-lg border border-[#e3e6ef] p-3 dark:border-[#2d2d31]">
              <h4 className="text-xs font-semibold text-[#1e2025] dark:text-[#e4e4e7]">Condition</h4>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Field">
                  <select
                    className={inputClass}
                    value={conditionField}
                    onChange={(e) => setConditionField(e.target.value)}
                  >
                    <option value="priority">Priority</option>
                    <option value="status">Status</option>
                    <option value="title">Title</option>
                    <option value="kind">Kind</option>
                  </select>
                </Field>
                <Field label="Operator">
                  <select
                    className={inputClass}
                    value={conditionOp}
                    onChange={(e) => setConditionOp(e.target.value as RuleCondition["operator"])}
                  >
                    <option value="equals">Equals</option>
                    <option value="not_equals">Does Not Equal</option>
                    <option value="contains">Contains</option>
                  </select>
                </Field>
                <Field label="Value">
                  <input
                    type="text"
                    className={inputClass}
                    value={conditionVal}
                    onChange={(e) => setConditionVal(e.target.value)}
                    placeholder="e.g. urgent"
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-[#e3e6ef] p-3 dark:border-[#2d2d31]">
              <h4 className="text-xs font-semibold text-[#1e2025] dark:text-[#e4e4e7]">Action</h4>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Action Type">
                  <select
                    className={inputClass}
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as RuleAction["type"])}
                  >
                    <option value="set_priority">Set Priority</option>
                    <option value="create_capture">Create Triage Capture</option>
                    <option value="request_review">Request Manual Review</option>
                  </select>
                </Field>
                <Field label="Action Value">
                  <input
                    type="text"
                    className={inputClass}
                    value={actionValue}
                    onChange={(e) => setActionValue(e.target.value)}
                    placeholder="e.g. urgent"
                  />
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#e3e6ef] dark:border-[#2d2d31]">
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy || !ruleName.trim()}>
                Save Rule
              </Button>
            </div>
          </form>
        </div>
      )}

      {selectedRuleRuns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className={`${panelClass} max-h-[90vh] w-full max-w-xl overflow-y-auto space-y-4 p-6 shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-[#e3e6ef] pb-3 dark:border-[#2d2d31]">
              <div>
                <h3 className="text-sm font-semibold text-[#1e2025] dark:text-white">
                  Run History: {selectedRuleRuns.rule.name}
                </h3>
                <span className={`text-[10px] ${mutedClass}`}>
                  Quota: {selectedRuleRuns.rule.quotaUsed}/500 executed
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRuleRuns(null)}
                className="text-[#677287] hover:text-black dark:hover:text-white"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            {selectedRuleRuns.runs.length === 0 ? (
              <p className={`p-4 text-center text-xs ${mutedClass}`}>
                No runs recorded for this rule yet.
              </p>
            ) : (
              <div className="divide-y divide-[#e3e6ef] dark:divide-[#2d2d31]">
                {selectedRuleRuns.runs.map((run) => (
                  <div key={run.id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          run.status === "completed"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : run.status === "blocked_review"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                        }`}
                      >
                        {run.status}
                      </span>
                      <span className={`text-[10px] ${mutedClass}`}>
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[#677287] dark:text-[#a4a4ad]">
                      Trigger: {run.triggerType} · Target: {run.targetId}
                    </div>
                    {run.errorMessage && (
                      <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                        Notice: {run.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-[#e3e6ef] dark:border-[#2d2d31]">
              <Button type="button" variant="secondary" onClick={() => setSelectedRuleRuns(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
