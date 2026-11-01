"use client";

import { CandyButton } from "@/components/ui/candy-button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import dynamic from "next/dynamic";
import {
  applyWorkspacePreferences,
  parseWorkspacePreferences,
} from "../lib/appearance";
import type { WorkspacePreferences } from "../lib/appearance";
import { RetainedPanel } from "../components/ui/retained-panel";
import { LoadingState } from "../components/ui/loading-state";
import SettingsNavigation, { settingsSections } from "./settings-navigation";
import SettingsOverview, { PermissionsSummary } from "./settings-overview";
import SettingsAppearance from "./settings-appearance";
import SettingsSpaces from "./settings-spaces";

import { acknowledgment, api, choice, items, record, string } from "../lib/api";
import type { User, Workspace } from "../lib/api";
import { Icon } from "../components/icon";

import { MorphInvite } from "@/components/ui/morph-invite";
import { ConfirmMorph } from "@/components/ui/confirm-morph";
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

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  recordId: string | null;
  permission: string;
  expiresAt: string;
}

interface RecordOption {
  id: string;
  title: string;
  kind: "task" | "page";
}

interface Quota {
  storageBytesUsed: number;
  storageBytesLimit: number;
  recordCount: number;
  recordLimit: number;
  automationRunsToday: number;
  automationLimitDaily: number;
  quotaResetAt: string;
}

type Preferences = WorkspacePreferences;

interface EnterprisePolicy {
  ssoEnforced: boolean;
  sessionDurationMinutes: number;
  dlpEnabled: boolean;
  retentionDays: number;
}

interface UserSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

function parseSession(value: unknown): UserSession {
  const r = record(value);
  return {
    id: string(r.id),
    createdAt: string(r.createdAt),
    expiresAt: string(r.expiresAt),
    current: Boolean(r.current),
  };
}

const SettingsAi = dynamic(() => import("./settings-ai"), {
  loading: () => <LoadingState />,
});
const SettingsGovernance = dynamic(() => import("./settings-governance"), {
  loading: () => <LoadingState />,
});
const ConnectedApps = dynamic(() => import("./mail-panel"), {
  loading: () => <LoadingState />,
});
const DeveloperTools = dynamic(() => import("./integrations-panel"), {
  loading: () => <LoadingState />,
});
const AutomationSettings = dynamic(() => import("./rules-panel"), {
  loading: () => <LoadingState />,
});

function parseMember(value: unknown): Member {
  const data = record(value);
  if (typeof data.active !== "boolean") {
    throw new Error("Invalid membership response.");
  }
  return {
    id: string(data.id),
    name: string(data.name),
    email: string(data.email),
    role: string(data.role),
    active: data.active,
  };
}

function parsePendingInvitation(value: unknown): PendingInvitation {
  const data = record(value);
  return {
    id: string(data.id),
    email: string(data.email),
    role: string(data.role),
    recordId: data.recordId ? string(data.recordId) : null,
    permission: string(data.permission),
    expiresAt: string(data.expiresAt),
  };
}

function parseQuota(value: unknown): Quota {
  const root = record(value);
  const data = record(root.quota ?? value);
  return {
    storageBytesUsed: Number(data.storageBytesUsed ?? 0),
    storageBytesLimit: Number(data.storageBytesLimit ?? 104857600),
    recordCount: Number(data.recordCount ?? 0),
    recordLimit: Number(data.recordLimit ?? 5000),
    automationRunsToday: Number(data.automationRunsToday ?? 0),
    automationLimitDaily: Number(data.automationLimitDaily ?? 500),
    quotaResetAt: string(data.quotaResetAt ?? new Date().toISOString()),
  };
}

const parsePreferences = parseWorkspacePreferences;

function parsePolicy(value: unknown): EnterprisePolicy {
  const root = record(value);
  const data = record(root.policy ?? value);
  return {
    ssoEnforced: Boolean(data.ssoEnforced),
    sessionDurationMinutes: Number(data.sessionDurationMinutes ?? 480),
    dlpEnabled: Boolean(data.dlpEnabled),
    retentionDays: Number(data.retentionDays ?? 90),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WorkspaceSettings({
  workspace,
  preferences,
  onPreferencesChange,
  csrf,
  currentUser,
  workspaces = [],
  onSwitchWorkspace,
  onJoined,
  onWorkspaceCreated,
  onWorkspaceRenamed,
  onWorkspaceLeft,
}: {
  workspace: Workspace;
  preferences: Preferences | null;
  onPreferencesChange: (preferences: Preferences) => void;
  csrf: string;
  currentUser?: User | null;
  workspaces?: Workspace[];
  onSwitchWorkspace?: (id: string) => void;
  onJoined: () => void;
  onWorkspaceCreated?: (id: string) => Promise<void>;
  onWorkspaceRenamed?: (newName: string, icon?: string) => void;
  onWorkspaceLeft?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "overview";
    const search = new URLSearchParams(window.location.search);
    return search.get("invite") ||
      search.get("invitation") ||
      search.get("token")
      ? "members"
      : (settingsSections.find(
          (section) => section.id === search.get("section"),
        )?.id ?? "overview");
  });

  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const [recordOptions, setRecordOptions] = useState<RecordOption[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [manualRecordId, setManualRecordId] = useState(false);

  const [quota, setQuota] = useState<Quota | null>(null);
  const [policy, setPolicy] = useState<EnterprisePolicy | null>(null);

  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [workspaceEmoji, setWorkspaceEmoji] = useState(workspace.icon ?? "⚡");
  const [memberSearch, setMemberSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedInviteRole, setSelectedInviteRole] =
    useState<string>("member");

  const [token, setToken] = useState("");
  const [acceptTokenInput, setAcceptTokenInput] = useState(() => {
    if (typeof window === "undefined") return "";
    const search = new URLSearchParams(window.location.search);
    return (
      search.get("invite") ||
      search.get("invitation") ||
      search.get("token") ||
      ""
    );
  });
  const [importContent, setImportContent] = useState("");
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordTone, setPasswordTone] = useState<
    "neutral" | "positive" | "error"
  >("neutral");

  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{
    text: string;
    tone: "success" | "error" | "info";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const isManager = workspace.role === "owner" || workspace.role === "admin";
  const isOwner = workspace.role === "owner";
  const path = `/workspaces/${workspace.id}`;

  const showToast = useCallback(
    (text: string, tone: "success" | "error" | "info" = "success") => {
      setToast({ text, tone });
      setTimeout(() => {
        setToast((current) => (current?.text === text ? null : current));
      }, 3500);
    },
    [],
  );

  const refreshMembers = useCallback(async () => {
    if (!isManager) return;
    try {
      setMembers(await api(path + "/members", items(parseMember)));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Members are unavailable.",
      );
    }
  }, [isManager, path]);

  const refreshPendingInvites = useCallback(async () => {
    if (!isManager) return;
    try {
      setPendingInvites(
        await api(path + "/invitations", items(parsePendingInvitation)),
      );
    } catch {
      setPendingInvites([]);
    }
  }, [isManager, path]);

  const loadQuota = useCallback(async () => {
    try {
      const data = await api(path + "/quotas", parseQuota);
      setQuota(data);
    } catch {
      setQuota(null);
    }
  }, [path]);

  const resourceRequests = useRef(new Map<string, Promise<void>>());
  const resourceController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    resourceController.current = controller;
    const requests = resourceRequests.current;
    requests.clear();
    return () => {
      controller.abort();
      requests.clear();
    };
  }, [path, isManager]);

  useEffect(() => {
    const controller = resourceController.current;
    if (!controller || controller.signal.aborted) return;
    const options = { signal: controller.signal };
    function load(key: string, request: () => Promise<void>) {
      if (resourceRequests.current.has(key)) return;
      const pending = request().catch((error: unknown) => {
        if (resourceRequests.current.get(key) === pending)
          resourceRequests.current.delete(key);
        if (!controller?.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Settings could not be loaded.",
          );
      });
      resourceRequests.current.set(key, pending);
    }
    if (isManager && (activeTab === "members" || activeTab === "permissions")) {
      load("members", () =>
        api(path + "/members", items(parseMember), options).then(setMembers),
      );
      if (activeTab === "members") {
        load("invitations", () =>
          api(
            path + "/invitations",
            items(parsePendingInvitation),
            options,
          ).then(setPendingInvites),
        );
        load("record-options", () =>
          Promise.all([
            api(
              path + "/tasks?limit=25",
              (value) =>
                items((value) => {
                  const data = record(value);
                  return { id: string(data.id), title: string(data.title) };
                })(value),
              options,
            ),
            api(
              path + "/pages?limit=25",
              (value) =>
                items((value) => {
                  const data = record(value);
                  return { id: string(data.id), title: string(data.title) };
                })(value),
              options,
            ),
          ]).then(([tasks, pages]) =>
            setRecordOptions([
              ...tasks.map((item) => ({ ...item, kind: "task" as const })),
              ...pages.map((item) => ({ ...item, kind: "page" as const })),
            ]),
          ),
        );
      }
    }
    if (activeTab === "overview" || activeTab === "quotas")
      load("quotas", () =>
        api(path + "/quotas", parseQuota, options).then(setQuota),
      );
    if (activeTab === "security") {
      load("sessions", () =>
        api("/auth/sessions", items(parseSession), options).then(
          setUserSessions,
        ),
      );
      if (isManager)
        load("policy", () =>
          api(path + "/enterprise-policy", parsePolicy, options).then(
            setPolicy,
          ),
        );
    }
  }, [path, isManager, activeTab]);

  const refreshSessions = useCallback(async () => {
    try {
      setUserSessions(await api("/auth/sessions", items(parseSession)));
    } catch {
      setUserSessions([]);
    }
  }, []);

  async function revokeSession(sessionId: string) {
    setBusy(true);
    try {
      await api("/auth/sessions/" + encodeURIComponent(sessionId), record, {
        method: "DELETE",
        csrf,
      });
      showToast("Session revoked.");
      await refreshSessions();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to revoke session.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logoutAllDevices() {
    if (
      !confirm(
        "Are you sure you want to terminate all active sessions across all devices?",
      )
    )
      return;
    setBusy(true);
    try {
      await api("/auth/logout-all", record, { method: "POST", csrf });
      window.location.reload();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to log out all devices.",
        "error",
      );
      setBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordTone("neutral");
    if (newPasswordInput.length < 12) {
      setPasswordMessage("New password must be at least 12 characters long.");
      setPasswordTone("error");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", record, {
        method: "POST",
        csrf,
        body: {
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        },
      });
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setPasswordMessage(
        "Password changed successfully. Other active sessions have been revoked.",
      );
      setPasswordTone("positive");
      showToast("Password updated.");
      await refreshSessions();
    } catch (error) {
      setPasswordMessage(
        error instanceof Error ? error.message : "Failed to change password.",
      );
      setPasswordTone("error");
    } finally {
      setBusy(false);
    }
  }

  async function saveWorkspaceName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceName.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await api(path, (value) => string(record(value).name), {
        method: "PATCH",
        csrf,
        body: { name: workspaceName.trim(), icon: workspaceEmoji },
      });
      onWorkspaceRenamed?.(workspaceName.trim(), workspaceEmoji);
      showToast("Workspace profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setToken("");
    const data = new FormData(event.currentTarget);
    const roleValue = String(data.get("role"));
    const permissionValue = String(data.get("permission"));
    const recordIdValue = String(
      manualRecordId
        ? data.get("manualRecordId") || ""
        : selectedRecordId || data.get("recordId") || "",
    ).trim();

    if (roleValue === "guest" && !recordIdValue) {
      setMessage("Guests require a specific Record ID.");
      setBusy(false);
      return;
    }

    try {
      const generatedToken = await api(
        path + "/invitations",
        (value) => string(record(value).token),
        {
          method: "POST",
          csrf,
          body: {
            email: String(data.get("email")).trim(),
            role: roleValue,
            permission: permissionValue,
            ...(recordIdValue ? { recordId: recordIdValue } : {}),
          },
        },
      );
      setToken(generatedToken);
      showToast("Invitation created successfully.");
      await refreshPendingInvites();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation failed.");
    } finally {
      setBusy(false);
    }
  }

  const morphMembers = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        color: "#71717a",
      })),
    [members],
  );

  const handleMorphInvite = async (emailToInvite: string) => {
    try {
      const generatedToken = await api(
        path + "/invitations",
        (value) => string(record(value).token),
        {
          method: "POST",
          csrf,
          body: {
            email: emailToInvite.trim(),
            role: "member",
            permission: "edit",
          },
        },
      );
      setToken(generatedToken);
      showToast("Invitation created successfully.");
      await refreshPendingInvites();
      return {
        id: crypto.randomUUID(),
        name: emailToInvite.split("@")[0] || "Teammate",
        email: emailToInvite,
      };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation failed.");
    }
  };

  async function revokeInvitation(tokenHash: string) {
    if (!window.confirm("Revoke this invitation? It will become invalid."))
      return;
    setBusy(true);
    try {
      await api(path + "/invitations/" + tokenHash, acknowledgment, {
        method: "DELETE",
        csrf,
      });
      showToast("Invitation revoked.");
      await refreshPendingInvites();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revocation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/invitations/accept", acknowledgment, {
        method: "POST",
        csrf,
        body: { token: acceptTokenInput.trim() },
      });
      showToast("Joined workspace successfully.");
      onJoined();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Invitation acceptance failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateMemberRole(memberId: string, newRole: string) {
    const memberName = members.find((m) => m.id === memberId)?.name ?? "member";
    if (newRole === "owner") {
      const confirmed = window.confirm(
        `Transfer primary workspace ownership to ${memberName}? You will become an Administrator.`,
      );
      if (!confirmed) return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api(`${path}/members/${memberId}`, acknowledgment, {
        method: "PATCH",
        csrf,
        body: { role: newRole },
      });
      showToast(
        newRole === "owner"
          ? "Workspace ownership transferred."
          : "Member role updated.",
      );
      await refreshMembers();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Role update failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(item: Member, skipConfirm = false) {
    const isSelf = currentUser?.id === item.id;
    const promptMessage = isSelf
      ? "Leave this workspace? You will lose access immediately."
      : `Remove ${item.name} from this workspace? Access will stop immediately.`;

    if (!skipConfirm && !window.confirm(promptMessage)) return;

    setBusy(true);
    setMessage("");
    try {
      await api(path + "/members/" + item.id, acknowledgment, {
        method: "DELETE",
        csrf,
      });
      showToast(isSelf ? "Left workspace." : "Member removed.");
      if (isSelf) {
        onWorkspaceLeft?.();
      } else {
        await refreshMembers();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Removal failed.");
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const themeVal = choice(data.get("theme"), ["system", "light", "dark"]);
    const densityVal = choice(data.get("density"), ["comfortable", "compact"]);
    const weekStartVal = choice(data.get("weekStart"), ["sunday", "monday"]);
    const timezoneVal = String(data.get("timezone") || "UTC");

    setBusy(true);
    try {
      const updated = await api(path + "/preferences", parsePreferences, {
        method: "PATCH",
        csrf,
        body: {
          theme: themeVal,
          density: densityVal,
          weekStart: weekStartVal,
          timezone: timezoneVal,
          locale: String(data.get("locale") ?? "en"),
          accent: choice(data.get("accent"), ["neutral", "indigo", "sage"]),
          reduceMotion: data.get("reduceMotion") === "on",
        },
      });
      onPreferencesChange(updated);
      applyWorkspacePreferences(updated);
      try {
        localStorage.setItem("tantu-theme", themeVal);
      } catch {
        showToast(
          "Preferences saved. Browser theme storage is unavailable; this tab has been updated.",
        );
        return;
      }
      showToast("Preferences saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Preferences update failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportWorkspace() {
    setBusy(true);
    setMessage("");
    try {
      const res = await api<{ job: { payload: unknown } }>(
        path + "/export",
        (v) => v as { job: { payload: unknown } },
        { method: "POST", csrf, body: { format: "json" } },
      );
      const blob = new Blob([JSON.stringify(res.job.payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tantu-export-${workspace.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("Workspace exported successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function importRecords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importContent.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const parsed = JSON.parse(importContent) as {
        records: { kind: "task" | "page"; title: string; status?: string }[];
      };
      const result = await api<{ importedCount: number }>(
        path + "/import",
        (v) => v as { importedCount: number },
        {
          method: "POST",
          csrf,
          body: {
            version: "1.0",
            records: parsed.records ?? [],
          },
        },
      );
      showToast(`Imported ${result.importedCount} records successfully.`);
      setImportContent("");
      await loadQuota();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Import failed. Provide valid JSON records array.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleDlp(enabled: boolean) {
    if (!isManager) return;
    setBusy(true);
    try {
      const updated = await api(path + "/enterprise-policy", parsePolicy, {
        method: "PUT",
        csrf,
        body: { dlpEnabled: enabled },
      });
      setPolicy(updated);
      showToast(
        enabled ? "Enterprise DLP enabled." : "Enterprise DLP disabled.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Policy update failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function triggerAuditExport() {
    setBusy(true);
    try {
      await api(path + "/audit-exports", (v) => v, {
        method: "POST",
        csrf,
        body: { format: "ndjson" },
      });
      showToast("Audit export scheduled.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Audit export failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(content: string, label: string) {
    try {
      await navigator.clipboard.writeText(content);
      showToast(`${label} copied to clipboard!`);
    } catch {
      showToast(`Copy failed. Please copy manually.`, "info");
    }
  }

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(memberSearch.toLowerCase());
    const matchesRole = roleFilter === "all" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const inviteLink =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/?invite=${encodeURIComponent(token)}`
      : "";

  function selectSection(section: string) {
    setActiveTab(section);
    setMessage("");
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  const emojiChoices = ["⚡", "🚀", "💡", "🎯", "📚", "🏢", "🛠️", "🌐"];

  return (
    <section className="grid gap-6">
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-zinc-900/95 px-4 py-3 text-[12px] font-medium text-white shadow-2xl backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95"
        >
          <Icon
            name={toast.tone === "error" ? "close" : "check"}
            className={`size-4 ${toast.tone === "error" ? "text-rose-400" : "text-emerald-400"}`}
          />
          <span>{toast.text}</span>
        </div>
      )}

      <header className="border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-zinc-200 bg-zinc-100 text-xl font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
              {workspaceEmoji}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`${headingClass} text-[22px]`}>
                  {workspace.name}
                </h1>
                <Badge tone="neutral">{workspace.role}</Badge>
              </div>
              <p className={`text-[11px] ${mutedClass}`}>
                Workspace Settings, People &amp; Permissions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">ID: {workspace.id.slice(0, 8)}</Badge>
          </div>
        </div>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <SettingsNavigation
          active={activeTab}
          manager={isManager}
          onChange={selectSection}
        />
        <div className="min-w-0 space-y-6">
          <Notice tone="error" role="alert">
            {message}
          </Notice>

          <RetainedPanel active={activeTab === "general"}>
            <div className="grid gap-6">
              <section className={`${panelClass} p-6`}>
                <header className="mb-4">
                  <h2 className={`${headingClass} text-[16px]`}>
                    Workspace Profile
                  </h2>
                  <p className={`text-[11px] ${mutedClass}`}>
                    Change the name and icon branding of your workspace.
                  </p>
                </header>
                <form
                  onSubmit={saveWorkspaceName}
                  className="grid max-w-lg gap-4"
                >
                  <Field label="Workspace Icon">
                    <div className="flex flex-wrap items-center gap-2">
                      {emojiChoices.map((emoji) => (
                        <CandyButton
                          variant="ghost"
                          size="unstyled"
                          key={emoji}
                          type="button"
                          disabled={!isManager || busy}
                          aria-label={`Use ${emoji} as workspace icon`}
                          aria-pressed={workspaceEmoji === emoji}
                          onClick={() => setWorkspaceEmoji(emoji)}
                          className={`grid size-9 place-items-center rounded-lg border text-lg transition-transform hover:scale-110 ${
                            workspaceEmoji === emoji
                              ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-800"
                              : "border-zinc-200 dark:border-zinc-800"
                          }`}
                        >
                          {emoji}
                        </CandyButton>
                      ))}
                    </div>
                  </Field>
                  <Field label="Workspace Name">
                    <input
                      name="name"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      required
                      maxLength={100}
                      disabled={!isManager || busy}
                      className={inputClass}
                    />
                  </Field>
                  {isManager && (
                    <div>
                      <Button type="submit" variant="primary" disabled={busy}>
                        <Icon name="check" className="size-3.5" />
                        Save Changes
                      </Button>
                    </div>
                  )}
                </form>
              </section>

              <section className={`${panelClass} p-6`}>
                <header className="mb-4">
                  <h2 className={`${headingClass} text-[16px]`}>
                    Membership Overview
                  </h2>
                  <p className={`text-[11px] ${mutedClass}`}>
                    You are currently a{" "}
                    <span className="font-semibold">{workspace.role}</span> in
                    this workspace.
                  </p>
                </header>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <div className="mb-1 text-[11px] font-medium text-slate-700 dark:text-zinc-300">
                      Workspace ID
                    </div>
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                      <span className="truncate">{workspace.id}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void copyLink(workspace.id, "Workspace ID")
                        }
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <div className="mb-1 text-[11px] font-medium text-slate-700 dark:text-zinc-300">
                      Management Status
                    </div>
                    <p className={`text-[11px] ${mutedClass}`}>
                      {isOwner
                        ? "Full administrative custody and ownership."
                        : isManager
                          ? "Administrative management permissions granted."
                          : "Standard member collaborative access."}
                    </p>
                  </div>
                </div>

                {!isOwner && (
                  <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <ConfirmMorph
                      label="Leave Workspace"
                      prompt="Leave this workspace? You will lose access immediately."
                      onConfirm={() => {
                        if (currentUser) {
                          return removeMember(
                            {
                              id: currentUser.id,
                              name: currentUser.name,
                              email: currentUser.email,
                              role: workspace.role,
                              active: true,
                            },
                            true,
                          );
                        }
                      }}
                      tone="danger"
                      disabled={busy}
                    />
                  </div>
                )}
              </section>
            </div>
          </RetainedPanel>

          <RetainedPanel active={activeTab === "members"}>
            <div className="grid gap-6">
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#141416]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                      Owner
                    </span>
                    <Badge tone="neutral">Full</Badge>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${mutedClass}`}>
                    Full workspace custody, ownership transfer, and member
                    administration.
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#141416]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                      Administrator
                    </span>
                    <Badge>Admin</Badge>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${mutedClass}`}>
                    Invite members, manage roles, adjust security policies and
                    integrations.
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#141416]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                      Member
                    </span>
                    <Badge tone="neutral">Standard</Badge>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${mutedClass}`}>
                    Create, organize, and edit all workspace tasks, pages, and
                    projects.
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-[#141416]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                      Guest
                    </span>
                    <Badge tone="neutral">Scoped</Badge>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${mutedClass}`}>
                    External collaborator. Restricted exclusively to the
                    designated record ID.
                  </p>
                </div>
              </section>

              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                {isManager && (
                  <section className={panelClass}>
                    <header className="flex items-center justify-between border-b border-[#e4e6ef] px-5 py-4 dark:border-[#303034]">
                      <div className="flex items-center gap-2">
                        <Icon name="users" className="size-4 text-zinc-400" />
                        <h2 className="text-[13px] font-medium">
                          Invite Teammate
                        </h2>
                      </div>
                      <Badge>72-hour validity</Badge>
                    </header>
                    <div className="p-5 sm:p-6">
                      <p
                        className={`mb-5 text-[11px] leading-relaxed ${mutedClass}`}
                      >
                        Quickly invite collaborators with animated invitation
                        link creation or configure role-based access below.
                      </p>
                      <div className="mb-6 flex justify-center">
                        <MorphInvite
                          members={morphMembers}
                          onInvite={handleMorphInvite}
                        />
                      </div>
                      <form onSubmit={invite} className="grid gap-4">
                        <Field label="Teammate Email">
                          <input
                            name="email"
                            type="email"
                            required
                            maxLength={254}
                            placeholder="teammate@example.com"
                            className={inputClass}
                          />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Assigned Role">
                            <select
                              name="role"
                              aria-label="Role"
                              value={selectedInviteRole}
                              onChange={(e) =>
                                setSelectedInviteRole(e.target.value)
                              }
                              className={inputClass}
                            >
                              <option value="member">
                                Member (Workspace wide)
                              </option>
                              <option value="guest">
                                Guest (Single record only)
                              </option>
                              {isOwner && (
                                <option value="admin">
                                  Administrator (Settings + Members)
                                </option>
                              )}
                            </select>
                          </Field>
                          <Field label="Record Permission">
                            <select
                              name="permission"
                              aria-label="Record permission"
                              className={inputClass}
                            >
                              <option value="read">Read Only</option>
                              <option value="edit">Can Edit</option>
                            </select>
                          </Field>
                        </div>

                        {selectedInviteRole === "guest" && (
                          <div className="grid gap-2">
                            {!manualRecordId ? (
                              <Field
                                label={
                                  <div className="flex items-center justify-between">
                                    <span>Target Record</span>
                                    <CandyButton
                                      variant="ghost"
                                      size="unstyled"
                                      type="button"
                                      onClick={() => setManualRecordId(true)}
                                      className="text-[10px] text-zinc-700 underline dark:text-zinc-300"
                                    >
                                      Enter UUID manually
                                    </CandyButton>
                                  </div>
                                }
                              >
                                <select
                                  value={selectedRecordId}
                                  onChange={(e) =>
                                    setSelectedRecordId(e.target.value)
                                  }
                                  className={inputClass}
                                >
                                  <option value="">
                                    Choose a record to share...
                                  </option>
                                  {recordOptions.map((rec) => (
                                    <option key={rec.id} value={rec.id}>
                                      [{rec.kind.toUpperCase()}]{" "}
                                      {rec.title || "Untitled"}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            ) : (
                              <Field
                                label={
                                  <div className="flex items-center justify-between">
                                    <span>Record UUID</span>
                                    <CandyButton
                                      variant="ghost"
                                      size="unstyled"
                                      type="button"
                                      onClick={() => setManualRecordId(false)}
                                      className="text-[10px] text-zinc-700 underline dark:text-zinc-300"
                                    >
                                      Pick from list
                                    </CandyButton>
                                  </div>
                                }
                              >
                                <input
                                  name="manualRecordId"
                                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                                  pattern="[0-9a-f-]{36}"
                                  className={inputClass}
                                />
                              </Field>
                            )}
                          </div>
                        )}

                        <div className="border-t border-[#e4e6ef] pt-4 dark:border-[#303034]">
                          <Button
                            type="submit"
                            variant="primary"
                            disabled={busy}
                          >
                            <Icon name="plus" className="size-3.5" />
                            Generate Invitation Link
                          </Button>
                        </div>
                      </form>

                      {token && (
                        <div className="mt-5 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                              Invitation Link Ready
                            </span>
                            <Badge tone="neutral">Valid 72 Hours</Badge>
                          </div>

                          <Field label="Shareable Invite Link">
                            <div className="flex items-center gap-2">
                              <input
                                readOnly
                                value={inviteLink}
                                aria-label="Invitation Link"
                                className={`${inputClass} font-mono text-[11px]`}
                              />
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() =>
                                  void copyLink(inviteLink, "Invite link")
                                }
                              >
                                <Icon name="check" className="size-3.5" />
                                Copy Link
                              </Button>
                            </div>
                          </Field>

                          <Field label="Raw Invitation Token">
                            <div className="flex items-center gap-2">
                              <input
                                readOnly
                                value={token}
                                aria-label="Invitation Token"
                                className={`${inputClass} font-mono text-[11px]`}
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void copyLink(token, "Token")}
                              >
                                Copy Token
                              </Button>
                            </div>
                          </Field>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section className={panelClass}>
                  <header className="flex items-center gap-2 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                    <Icon name="mail" className="size-4 text-zinc-400" />
                    <h2 className="text-[13px] font-medium">
                      Accept an Invitation
                    </h2>
                  </header>
                  <div className="p-5 sm:p-6">
                    <p
                      className={`mb-4 text-[11px] leading-relaxed ${mutedClass}`}
                    >
                      Have an invitation token for this account? Paste the token
                      below to join this workspace.
                    </p>
                    <form onSubmit={join} className="grid gap-4">
                      <Field label="Invitation Token">
                        <input
                          name="token"
                          value={acceptTokenInput}
                          onChange={(e) => setAcceptTokenInput(e.target.value)}
                          required
                          maxLength={100}
                          autoComplete="off"
                          placeholder="Paste token here"
                          className={inputClass}
                        />
                      </Field>
                      <Button type="submit" disabled={busy}>
                        Join Workspace
                        <Icon name="arrow" className="size-3.5" />
                      </Button>
                    </form>
                  </div>
                </section>
              </div>

              {isManager && pendingInvites.length > 0 && (
                <section className={`${panelClass} overflow-hidden`}>
                  <header className="flex items-center justify-between border-b border-[#e4e6ef] px-5 py-4 dark:border-[#303034]">
                    <div className="flex items-center gap-2">
                      <Icon name="clock" className="size-4 text-amber-500" />
                      <h3 className="text-[13px] font-medium">
                        Pending Invitations
                      </h3>
                    </div>
                    <Badge tone="neutral">
                      {pendingInvites.length} pending
                    </Badge>
                  </header>
                  <ul className="divide-y divide-[#e6e9f1] dark:divide-[#2e2e32]">
                    {pendingInvites.map((inv) => (
                      <li
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                      >
                        <div>
                          <span className="text-[12px] font-medium">
                            {inv.email}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge tone="neutral">{inv.role}</Badge>
                            <span className={`text-[10px] ${mutedClass}`}>
                              Permission: {inv.permission}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void revokeInvitation(inv.id)}
                        >
                          Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {isManager && (
                <section className={`${panelClass} overflow-hidden`}>
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e6ef] px-5 py-4 dark:border-[#303034]">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[13px] font-medium">
                        Workspace Directory
                      </h2>
                      <Badge tone="neutral">{members.length} members</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1 rounded-lg border border-[#e4e6ef] px-2.5 py-1 text-[11px] dark:border-[#303034]">
                        <Icon name="search" className="size-3 text-slate-400" />
                        <input
                          type="search"
                          placeholder="Search member..."
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          className="bg-transparent outline-none"
                        />
                      </div>
                      <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        aria-label="Filter by role"
                        className="rounded-lg border border-[#e4e6ef] bg-transparent px-2.5 py-1 text-[11px] outline-none dark:border-[#303034]"
                      >
                        <option value="all">All Roles</option>
                        <option value="owner">Owners</option>
                        <option value="admin">Admins</option>
                        <option value="member">Members</option>
                        <option value="guest">Guests</option>
                      </select>
                    </div>
                  </header>

                  <ul className="divide-y divide-[#e6e9f1] dark:divide-[#2e2e32]">
                    {filteredMembers.map((item) => {
                      const isCurrent = currentUser?.id === item.id;
                      return (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="grid size-8 place-items-center rounded-full border border-zinc-300 bg-zinc-200 text-[10px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                              {item.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <strong className="text-[12px] font-medium">
                                  {item.name}
                                </strong>
                                {isCurrent && <Badge tone="neutral">You</Badge>}
                              </div>
                              <span
                                className={`block text-[11px] ${mutedClass}`}
                              >
                                {item.email}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {isOwner && item.role !== "owner" ? (
                              <select
                                value={item.role}
                                onChange={(e) =>
                                  void updateMemberRole(item.id, e.target.value)
                                }
                                aria-label={`Role for ${item.name}`}
                                className="rounded-md border border-[#e4e6ef] bg-transparent px-2 py-1 text-[11px] outline-none dark:border-[#303034]"
                              >
                                <option value="admin">Administrator</option>
                                <option value="member">Member</option>
                                <option value="guest">Guest</option>
                                <option value="owner">
                                  Transfer Ownership
                                </option>
                              </select>
                            ) : (
                              <Badge tone="neutral">{item.role}</Badge>
                            )}

                            {item.active && item.role !== "owner" && (
                              <ConfirmMorph
                                label="Remove"
                                prompt={`Remove ${item.name}?`}
                                onConfirm={() => removeMember(item, true)}
                                tone="danger"
                                disabled={busy}
                              />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </RetainedPanel>

          <RetainedPanel active={activeTab === "preferences"}>
            {preferences ? (
              <SettingsAppearance
                key={preferences.updatedAt}
                preferences={preferences}
                busy={busy}
                onSave={savePreferences}
              />
            ) : (
              <LoadingState label="Loading appearance preferences…" />
            )}
          </RetainedPanel>

          <RetainedPanel active={activeTab === "quotas"}>
            <div className="grid gap-6">
              <section className={`${panelClass} p-6`}>
                <header className="mb-4">
                  <h2 className={`${headingClass} text-[16px]`}>
                    Resource Quotas &amp; Fair Usage
                  </h2>
                  <p className={`text-[11px] ${mutedClass}`}>
                    Live consumption metrics for this workspace tenant.
                  </p>
                </header>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <span
                      className={`block text-[10px] font-semibold uppercase ${mutedClass}`}
                    >
                      Storage Used
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                      {formatBytes(quota?.storageBytesUsed ?? 0)} /{" "}
                      {formatBytes(quota?.storageBytesLimit ?? 104857600)}
                    </span>
                    <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((quota?.storageBytesUsed ?? 0) /
                                (quota?.storageBytesLimit ?? 104857600)) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <span
                      className={`block text-[10px] font-semibold uppercase ${mutedClass}`}
                    >
                      Record Limit
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                      {quota?.recordCount ?? 0} / {quota?.recordLimit ?? 5000}{" "}
                      items
                    </span>
                    <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((quota?.recordCount ?? 0) /
                                (quota?.recordLimit ?? 5000)) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <span
                      className={`block text-[10px] font-semibold uppercase ${mutedClass}`}
                    >
                      Automations Today
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                      {quota?.automationRunsToday ?? 0} /{" "}
                      {quota?.automationLimitDaily ?? 500} runs
                    </span>
                    <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((quota?.automationRunsToday ?? 0) /
                                (quota?.automationLimitDaily ?? 500)) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className={`${panelClass} p-6`}>
                <header className="mb-4">
                  <h2 className={`${headingClass} text-[16px]`}>
                    Data Portability (Export &amp; Import)
                  </h2>
                  <p className={`text-[11px] ${mutedClass}`}>
                    Export your workspace in structured JSON or import records
                    in bulk.
                  </p>
                </header>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <h3 className="mb-1 text-[13px] font-semibold">
                      Export Workspace
                    </h3>
                    <p className={`mb-4 text-[11px] ${mutedClass}`}>
                      Download all tasks, pages, and projects in a compliant
                      JSON package.
                    </p>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void exportWorkspace()}
                    >
                      <Icon name="download" className="size-3.5" />
                      Export Workspace JSON
                    </Button>
                  </div>

                  <div className="rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <h3 className="mb-1 text-[13px] font-semibold">
                      Import Records
                    </h3>
                    <p className={`mb-3 text-[11px] ${mutedClass}`}>
                      Paste JSON containing an array of records to create in
                      this workspace.
                    </p>
                    <form onSubmit={importRecords} className="grid gap-3">
                      <textarea
                        rows={3}
                        placeholder='{"records": [{"kind": "task", "title": "Setup workspace"}]}'
                        value={importContent}
                        onChange={(e) => setImportContent(e.target.value)}
                        className={`${inputClass} font-mono text-[11px]`}
                      />
                      <div>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={busy || !importContent.trim()}
                        >
                          <Icon name="plus" className="size-3.5" />
                          Import Records
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              </section>
            </div>
          </RetainedPanel>

          <RetainedPanel active={activeTab === "security"}>
            <div className="grid gap-6">
              <section className={`${panelClass} p-6`}>
                <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className={`${headingClass} text-[16px]`}>
                      Active Sessions &amp; Device Management
                    </h2>
                    <p className={`text-[11px] ${mutedClass}`}>
                      Review and terminate authenticated browser sessions for
                      your account.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void logoutAllDevices()}
                  >
                    <Icon name="trash" className="size-3.5 text-rose-500" />
                    Log Out All Devices
                  </Button>
                </header>

                <div className="grid gap-3">
                  {userSessions.length === 0 ? (
                    <p className={`text-[12px] ${mutedClass}`}>
                      No other active sessions found.
                    </p>
                  ) : (
                    userSessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e6ef] p-3.5 dark:border-[#303034]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                            <Icon name="panel" className="size-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
                                {s.id}…
                              </span>
                              {s.current ? (
                                <Badge tone="green">This Device</Badge>
                              ) : (
                                <Badge tone="neutral">Remote Session</Badge>
                              )}
                            </div>
                            <div className={`mt-0.5 text-[10px] ${mutedClass}`}>
                              Created{" "}
                              {new Date(s.createdAt).toLocaleDateString()}{" "}
                              {new Date(s.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              &bull; Expires{" "}
                              {new Date(s.expiresAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        {!s.current && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void revokeSession(s.id)}
                          >
                            <Icon
                              name="close"
                              className="size-3 text-rose-500"
                            />
                            Revoke
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className={`${panelClass} p-6`}>
                <header className="mb-5">
                  <h2 className={`${headingClass} text-[16px]`}>
                    Password &amp; Credentials
                  </h2>
                  <p className={`text-[11px] ${mutedClass}`}>
                    Update your account password. Requires at least 12
                    characters.
                  </p>
                </header>

                <form
                  onSubmit={handlePasswordChange}
                  className="grid max-w-xl gap-4"
                >
                  <Field label="Current password">
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      placeholder="Enter current password"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="New password">
                    <input
                      type="password"
                      required
                      minLength={12}
                      maxLength={256}
                      autoComplete="new-password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="At least 12 characters"
                      className={inputClass}
                    />
                  </Field>
                  {passwordMessage && (
                    <Notice
                      tone={passwordTone === "positive" ? "neutral" : "error"}
                      role="alert"
                    >
                      {passwordMessage}
                    </Notice>
                  )}
                  <div>
                    <Button type="submit" variant="primary" disabled={busy}>
                      <Icon name="check" className="size-3.5" />
                      Update Password
                    </Button>
                  </div>
                </form>
              </section>

              <section className={`${panelClass} p-6`}>
                <header className="mb-5">
                  <h2 className={`${headingClass} text-[16px]`}>
                    Enterprise Governance &amp; DLP
                  </h2>
                  <p className={`text-[11px] ${mutedClass}`}>
                    Automated Data Loss Prevention (DLP) scans text content for
                    PII and secrets.
                  </p>
                </header>

                <div className="grid max-w-xl gap-5">
                  <div className="flex items-center justify-between rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <div>
                      <strong className="block text-[13px] font-medium">
                        Automated DLP Inspection
                      </strong>
                      <span className={`block text-[11px] ${mutedClass}`}>
                        Detect and redact SSNs, API tokens, and payment card
                        patterns.
                      </span>
                    </div>
                    <Button
                      variant={policy?.dlpEnabled ? "primary" : "secondary"}
                      disabled={!isManager || busy}
                      onClick={() => void toggleDlp(!policy?.dlpEnabled)}
                    >
                      {policy?.dlpEnabled ? "Active (Redacting)" : "Disabled"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <div>
                      <strong className="block text-[13px] font-medium">
                        Audit Log Export
                      </strong>
                      <span className={`block text-[11px] ${mutedClass}`}>
                        Export structured NDJSON audit records for compliance
                        reviews.
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={!isManager || busy}
                      onClick={() => void triggerAuditExport()}
                    >
                      <Icon name="file" className="size-3.5" />
                      Trigger Audit Export
                    </Button>
                  </div>

                  <div className="rounded-xl border border-[#e4e6ef] p-4 dark:border-[#303034]">
                    <h3 className="mb-2 text-[12px] font-semibold text-slate-700 dark:text-zinc-300">
                      Security Architecture
                    </h3>
                    <ul className={`grid gap-1.5 text-[11px] ${mutedClass}`}>
                      <li className="flex items-center gap-2">
                        <Icon
                          name="check"
                          className="size-3 text-emerald-500"
                        />
                        Double-submit CSRF cookie protection on all mutating
                        routes
                      </li>
                      <li className="flex items-center gap-2">
                        <Icon
                          name="check"
                          className="size-3 text-emerald-500"
                        />
                        HMAC-SHA256 session token hashing and isolation
                      </li>
                      <li className="flex items-center gap-2">
                        <Icon
                          name="check"
                          className="size-3 text-emerald-500"
                        />
                        ClamAV antivirus background scanning for uploaded files
                      </li>
                      <li className="flex items-center gap-2">
                        <Icon
                          name="check"
                          className="size-3 text-emerald-500"
                        />
                        Strict JSON schema parameter and body verification
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          </RetainedPanel>

          <RetainedPanel active={activeTab === "overview"}>
            {
              <SettingsOverview
                workspace={workspace}
                quota={quota}
                onSelect={selectSection}
              />
            }
          </RetainedPanel>
          <RetainedPanel active={activeTab === "spaces"}>
            {
              <SettingsSpaces
                workspaces={workspaces}
                currentId={workspace.id}
                csrf={csrf}
                onSwitch={(id) => onSwitchWorkspace?.(id)}
                onCreated={onWorkspaceCreated ?? (async () => onJoined())}
              />
            }
          </RetainedPanel>
          <RetainedPanel active={activeTab === "permissions"}>
            {<PermissionsSummary role={workspace.role} />}
          </RetainedPanel>
          <RetainedPanel active={activeTab === "connections"}>
            {<ConnectedApps workspaceId={workspace.id} csrf={csrf} />}
          </RetainedPanel>
          <RetainedPanel active={activeTab === "ai"}>
            {
              <SettingsAi
                workspaceId={workspace.id}
                csrf={csrf}
                manager={isManager}
              />
            }
          </RetainedPanel>
          <RetainedPanel active={activeTab === "governance"}>
            {isManager && (
              <SettingsGovernance workspaceId={workspace.id} csrf={csrf} />
            )}
          </RetainedPanel>
          <RetainedPanel active={activeTab === "developer"}>
            {isManager && (
              <DeveloperTools workspaceId={workspace.id} csrf={csrf} />
            )}
          </RetainedPanel>
          <RetainedPanel active={activeTab === "automation"}>
            {isManager && (
              <AutomationSettings workspaceId={workspace.id} csrf={csrf} />
            )}
          </RetainedPanel>
          {!isManager &&
            ["governance", "developer", "automation"].includes(activeTab) && (
              <Notice>
                Your current role does not allow workspace administration.
                Select another settings section.
              </Notice>
            )}
        </div>
      </div>
    </section>
  );
}
