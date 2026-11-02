"use client";

import { Select } from "@/components/ui/select";
import { CandyButton } from "@/components/ui/candy-button";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Orb } from "@/components/ui/orb";
import {
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";

export interface DlpRuleItem {
  id: string;
  name: string;
  pattern: string;
  category: "pii" | "financial" | "credentials" | "custom";
  action: "redact" | "flag";
  replacement: string;
}

export interface EnterprisePolicyItem {
  workspaceId: string;
  ssoEnforced: boolean;
  ssoProvider: "saml" | "oidc" | "none";
  sessionDurationMinutes: number;
  allowedIpRanges: string[];
  dlpEnabled: boolean;
  dlpRules: DlpRuleItem[];
  retentionDays: number;
  updatedAt: string;
}

export interface DlpLogItem {
  id: string;
  workspaceId: string;
  ruleName: string;
  matchedPattern: string;
  entityType: string;
  entityId: string;
  redactedSnippet: string;
  createdAt: string;
}

export interface AuditExportItem {
  id: string;
  workspaceId: string;
  exportFormat: "ndjson" | "csv";
  status: "completed" | "pending" | "failed";
  downloadToken: string;
  recordCount: number;
  checksumSha256: string;
  expiresAt: string;
  createdAt: string;
}

export interface OperatingModelEvaluation {
  ssoScimLifecycle: {
    status: string;
    standard: string;
    findings: string;
  };
  selfHostingEvaluation: {
    status: string;
    operationalCostRatio: string;
    supportBurden: string;
    recommendation: string;
  };
  dataRetentionAndDlp: {
    status: string;
    complianceCoverage: string[];
    exportFormats: string[];
  };
}

export default function EnterprisePanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [activeTab, setActiveTab] = useState<
    "policy" | "dlp" | "audit" | "evaluation" | "requests"
  >("policy");
  const [policy, setPolicy] = useState<EnterprisePolicyItem | null>(null);
  const [dlpLogs, setDlpLogs] = useState<DlpLogItem[]>([]);
  const [auditExports, setAuditExports] = useState<AuditExportItem[]>([]);
  const [evaluation, setEvaluation] = useState<OperatingModelEvaluation | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [ssoEnforced, setSsoEnforced] = useState(false);
  const [ssoProvider, setSsoProvider] = useState<"saml" | "oidc" | "none">(
    "none",
  );
  const [sessionMinutes, setSessionMinutes] = useState(480);
  const [ipRangesInput, setIpRangesInput] = useState("");
  const [retentionDays, setRetentionDays] = useState(365);

  const [testText, setTestText] = useState(
    "Meeting note: contact John at 123-45-6789 or charge card 4111222233334444 with key tk_live_998877665544332211",
  );
  const [scanResult, setScanResult] = useState<{
    cleanText: string;
    matched: boolean;
    violations: Array<{ ruleName: string; snippet: string }>;
  } | null>(null);
  const [exportFormat, setExportFormat] = useState<"ndjson" | "csv">("ndjson");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ policy: EnterprisePolicyItem }>(
        `/workspaces/${workspaceId}/enterprise-policy`,
        (v) => v as { policy: EnterprisePolicyItem },
        { signal: controller.signal },
      ),
      api<{ logs: DlpLogItem[] }>(
        `/workspaces/${workspaceId}/dlp/logs`,
        (v) => v as { logs: DlpLogItem[] },
        { signal: controller.signal },
      ),
      api<{ exports: AuditExportItem[] }>(
        `/workspaces/${workspaceId}/audit-exports`,
        (v) => v as { exports: AuditExportItem[] },
        { signal: controller.signal },
      ),
      api<{ evaluation: OperatingModelEvaluation }>(
        `/workspaces/${workspaceId}/operating-model/evaluation`,
        (v) => v as { evaluation: OperatingModelEvaluation },
        { signal: controller.signal },
      ),
    ])
      .then(([policyRes, logsRes, exportsRes, evalRes]) => {
        const p = policyRes.policy;
        setPolicy(p);
        setSsoEnforced(p.ssoEnforced);
        setSsoProvider(p.ssoProvider);
        setSessionMinutes(p.sessionDurationMinutes);
        setIpRangesInput((p.allowedIpRanges ?? []).join(", "));
        setRetentionDays(p.retentionDays);
        setDlpLogs(logsRes.logs ?? []);
        setAuditExports(exportsRes.exports ?? []);
        setEvaluation(evalRes.evaluation);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load enterprise settings.",
          );
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  function handleSavePolicy(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    api<{ policy: EnterprisePolicyItem }>(
      `/workspaces/${workspaceId}/enterprise-policy`,
      (v) => v as { policy: EnterprisePolicyItem },
      {
        method: "PUT",
        csrf,
        body: {
          retentionDays,
        },
      },
    )
      .then((res) => {
        setPolicy(res.policy);
        setNotice("Enterprise governance policy updated successfully.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to update enterprise policy.",
        );
        setBusy(false);
      });
  }

  function handleToggleDlp(enabled: boolean) {
    setBusy(true);
    setError("");
    api<{ policy: EnterprisePolicyItem }>(
      `/workspaces/${workspaceId}/enterprise-policy`,
      (v) => v as { policy: EnterprisePolicyItem },
      {
        method: "PUT",
        csrf,
        body: { dlpEnabled: enabled },
      },
    )
      .then((res) => {
        setPolicy(res.policy);
        setNotice(`Data Loss Prevention ${enabled ? "enabled" : "disabled"}.`);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to update DLP status.",
        );
        setBusy(false);
      });
  }

  function handleScanTestText() {
    if (!testText.trim()) return;
    setBusy(true);
    setError("");
    api<{
      scan: {
        cleanText: string;
        matched: boolean;
        violations: Array<{ ruleName: string; snippet: string }>;
      };
    }>(
      `/workspaces/${workspaceId}/dlp/scan`,
      (v) =>
        v as {
          scan: {
            cleanText: string;
            matched: boolean;
            violations: Array<{ ruleName: string; snippet: string }>;
          };
        },
      {
        method: "POST",
        csrf,
        body: { content: testText },
      },
    )
      .then((res) => {
        setScanResult(res.scan);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "DLP scan failed.");
        setBusy(false);
      });
  }

  function handleCreateAuditExport() {
    setBusy(true);
    setError("");
    api<{ export: AuditExportItem }>(
      `/workspaces/${workspaceId}/audit-exports`,
      (v) => v as { export: AuditExportItem },
      {
        method: "POST",
        csrf,
        body: { format: exportFormat },
      },
    )
      .then((res) => {
        setAuditExports([res.export, ...auditExports]);
        setNotice(
          `Audit export initiated in ${res.export.exportFormat.toUpperCase()} format.`,
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to create audit export.",
        );
        setBusy(false);
      });
  }

  if (loading) {
    return (
      <div className={`${panelClass} flex flex-col items-center justify-center gap-3 p-12 text-center`}>
        <Orb state="solving" interactive={false} theme="auto" size={64} display={48} />
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Loading enterprise governance controls...
        </p>
      </div>
    );
  }

  return (
    <div className={`${panelClass} space-y-6 p-5 sm:p-6`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className={headingClass}>
            Enterprise Governance & Policy Controls
          </h2>
          <p className={mutedClass}>
            Review identity integration prerequisites, DLP redaction rules, audit exports, and
            operating model compliance.
          </p>
        </div>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/90 p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {(
            [
              ["policy", "Policy & SSO"],
              ["dlp", "Data Loss Prevention"],
              ["audit", "Audit Exports"],
              ["evaluation", "Operating Models"],
              ["requests", "Access Requests"],
            ] as const
          ).map(([tabKey, tabLabel]) => (
            <CandyButton variant="ghost" size="unstyled"
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className="relative rounded-lg px-3 py-1.5 text-xs font-medium outline-none transition-colors"
            >
              {activeTab === tabKey && (
                <motion.div
                  layoutId="enterprise-tab-pill"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  className="absolute inset-0 rounded-lg border border-zinc-200/90 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
              )}
              <span
                className={`relative z-10 ${
                  activeTab === tabKey
                    ? "font-semibold text-zinc-950 dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {tabLabel}
              </span>
            </CandyButton>
          ))}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {activeTab === "policy" && (
        <form onSubmit={handleSavePolicy} className="space-y-6 pt-4">
          <div className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-4">
            <h3 className="text-base font-semibold">
              Single Sign-On (SSO) & Identity Federation
            </h3>
            <Notice>SSO/SCIM requires a configured and verified identity provider. Per-workspace session limits and network restrictions are not enforced in this foundation release. Existing sign-in and server session controls remain active.</Notice>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  disabled
                  checked={ssoEnforced}
                  onChange={(e) => setSsoEnforced(e.target.checked)}
                  className="rounded text-stone-900 focus:ring-stone-500"
                />
                <div>
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
                    Enforce SSO For All Members
                  </div>
                  <div className="text-xs text-stone-500">
                    Require IdP authentication before granting workspace session
                    tokens.
                  </div>
                </div>
              </label>

              <Field label="Identity Provider Protocol">
                <Select
                  disabled
                  value={ssoProvider}
                  onChange={(e) =>
                    setSsoProvider(e.target.value as "saml" | "oidc" | "none")
                  }
                  className={inputClass}
                >
                  <option value="none">None (Password / Magic Link)</option>
                  <option value="saml">SAML 2.0 (Okta, Azure AD, Ping)</option>
                  <option value="oidc">OpenID Connect (OIDC)</option>
                </Select>
              </Field>
            </div>
          </div>

          <div className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-4">
            <h3 className="text-base font-semibold">
              Session Governance & Network Boundaries
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Max Active Session Duration (minutes)">
                <input
                  type="number"
                  min="15"
                  max="10080"
                  disabled
                  value={sessionMinutes}
                  onChange={(e) =>
                    setSessionMinutes(parseInt(e.target.value, 10) || 480)
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Data Retention Policy (days)">
                <input
                  type="number"
                  min="30"
                  max="3650"
                  value={retentionDays}
                  onChange={(e) =>
                    setRetentionDays(parseInt(e.target.value, 10) || 365)
                  }
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Allowed IP Ranges / CIDR Blocks (comma separated)">
              <input
                type="text"
                placeholder="e.g. 192.168.1.0/24, 10.0.0.0/16"
                disabled
                value={ipRangesInput}
                onChange={(e) => setIpRangesInput(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Button type="submit" disabled={busy}>
            Save Enterprise Policy
          </Button>
        </form>
      )}

      {activeTab === "dlp" && (
        <div className="space-y-6 pt-4">
          <div className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">
                Data Loss Prevention (DLP) Engine
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Scans input text, comments, and task bodies to automatically
                mask sensitive PII, credit cards, and API secrets.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => handleToggleDlp(!policy?.dlpEnabled)}
              disabled={busy}
            >
              {policy?.dlpEnabled ? "Disable DLP" : "Enable DLP"}
            </Button>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase text-stone-500">
              Active Pattern Detection Rules
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(policy?.dlpRules ?? []).map((rule) => (
                <div
                  key={rule.id}
                  className="p-3 border border-stone-200 dark:border-stone-800 rounded-lg bg-white dark:bg-stone-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-stone-900 dark:text-stone-100">
                      {rule.name}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      {rule.category}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-stone-400 mt-2 truncate">
                    Pattern: {rule.pattern}
                  </div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                    Mask: {rule.replacement}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border border-stone-200 dark:border-stone-800 rounded-lg bg-white dark:bg-stone-900 space-y-4">
            <h4 className="text-base font-semibold">
              Live Redaction Tester Console
            </h4>
            <Field label="Sample Text to Evaluate">
              <textarea
                rows={3}
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Button
              onClick={handleScanTestText}
              disabled={busy || !testText.trim()}
            >
              Execute Live DLP Scan
            </Button>

            {scanResult && (
              <div className="mt-4 p-3 bg-stone-50 dark:bg-stone-950/40 border border-stone-200 dark:border-stone-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Sanitized Output</span>
                  <span
                    className={
                      scanResult.matched
                        ? "text-amber-600 font-mono"
                        : "text-emerald-600 font-mono"
                    }
                  >
                    {scanResult.matched
                      ? `${scanResult.violations.length} violations detected & masked`
                      : "Clean (No matches)"}
                  </span>
                </div>
                <div className="font-mono text-xs bg-white dark:bg-stone-900 p-2.5 rounded border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200">
                  {scanResult.cleanText}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-base font-semibold">
              DLP Violation & Masking Audit Trail
            </h4>
            {dlpLogs.length === 0 ? (
              <p className={mutedClass}>
                No redactions logged in this workspace.
              </p>
            ) : (
              <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden text-xs font-mono">
                {dlpLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-stone-800 dark:text-stone-200">
                        {log.ruleName}
                      </span>
                      <span className="text-stone-400 ml-2">
                        Matched: {log.redactedSnippet}
                      </span>
                    </div>
                    <div className="text-stone-400">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "audit" && (
        <div className="space-y-6 pt-4">
          <div className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">
                Cryptographically Signed Audit Export
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Stream workspace access and record history with SHA-256
                verification hashes for compliance verification.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={exportFormat}
                onChange={(e) =>
                  setExportFormat(e.target.value as "ndjson" | "csv")
                }
                className={inputClass}
              >
                <option value="ndjson">NDJSON Stream</option>
                <option value="csv">CSV Flat File</option>
              </Select>
              <Button onClick={handleCreateAuditExport} disabled={busy}>
                Generate Export
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold">Audit Export History</h3>
            {auditExports.length === 0 ? (
              <p className={mutedClass}>No audit exports generated yet.</p>
            ) : (
              <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden font-mono text-xs">
                {auditExports.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-stone-900"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900 dark:text-stone-100 uppercase">
                          {exp.exportFormat} Audit Ledger
                        </span>
                        <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded text-[10px]">
                          {exp.recordCount} events
                        </span>
                      </div>
                      <div className="text-stone-400 text-[11px] mt-1 break-all">
                        SHA-256: {exp.checksumSha256}
                      </div>
                      <div className="text-stone-500 text-[11px] mt-1">
                        Created: {new Date(exp.createdAt).toLocaleDateString()}{" "}
                        • Expires:{" "}
                        {new Date(exp.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-stone-600 dark:text-stone-400 text-[11px] self-start sm:self-center">
                      Token:{" "}
                      <span className="bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded">
                        {exp.downloadToken.slice(0, 14)}...
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "evaluation" && (
        <div className="space-y-6 pt-4">
          <div className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800">
            <h3 className="text-base font-semibold">
              Operating Models & Architecture Qualifications
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Qualified enterprise architecture evaluations against real
              operational responsibilities (L3.2).
            </p>
          </div>

          {evaluation && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border border-stone-200 dark:border-stone-800 rounded-lg bg-white dark:bg-stone-900 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Identity & SCIM</h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    {evaluation.ssoScimLifecycle.status}
                  </span>
                </div>
                <div className="text-xs text-stone-600 dark:text-stone-400">
                  <strong>Standard:</strong>{" "}
                  {evaluation.ssoScimLifecycle.standard}
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">
                  {evaluation.ssoScimLifecycle.findings}
                </p>
              </div>

              <div className="p-4 border border-stone-200 dark:border-stone-800 rounded-lg bg-white dark:bg-stone-900 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Self-Hosting Model</h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {evaluation.selfHostingEvaluation.status}
                  </span>
                </div>
                <div className="text-xs text-stone-600 dark:text-stone-400">
                  <strong>Cost Ratio:</strong>{" "}
                  {evaluation.selfHostingEvaluation.operationalCostRatio}
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">
                  {evaluation.selfHostingEvaluation.recommendation}
                </p>
              </div>

              <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-[#141416] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Data Retention</h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {evaluation.dataRetentionAndDlp.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {evaluation.dataRetentionAndDlp.complianceCoverage.map(
                    (c) => (
                      <span
                        key={c}
                        className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded"
                      >
                        {c}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "requests" && (
        <div className="space-y-6 pt-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#141416] space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Pending Access Reviews & Elevation Requests
              </h3>
              <p className={`text-xs ${mutedClass} mt-1`}>
                Review elevated role requests, DLP policy exemptions, and audit log access from workspace members.
              </p>
            </div>
            <Notice>Access request reviews are not available yet. Manage current members and invitations in Workspace settings. No role changes can be made from this panel.</Notice>
          </div>
        </div>
      )}
    </div>
  );
}
