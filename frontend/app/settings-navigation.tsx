"use client";

import { Icon } from "../components/icon";
import type { IconName } from "../components/icon";

export const settingsSections = [
  { id: "overview", label: "Overview", icon: "tasks" },
  { id: "general", label: "General", icon: "settings" },
  { id: "spaces", label: "Spaces", icon: "folder" },
  { id: "members", label: "People & Roles", icon: "users" },
  { id: "permissions", label: "Permissions", icon: "shield" },
  { id: "preferences", label: "Appearance", icon: "panel" },
  { id: "connections", label: "Connected Apps", icon: "external" },
  { id: "ai", label: "AI & data controls", icon: "brain" },
  { id: "security", label: "Security & sessions", icon: "lock" },
  { id: "quotas", label: "Data & Usage", icon: "download" },
  {
    id: "governance",
    label: "Retention & Audit",
    icon: "activity",
    manager: true,
  },
  { id: "developer", label: "Developer tools", icon: "layers", manager: true },
  { id: "automation", label: "Automation", icon: "zap", manager: true },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: IconName;
  manager?: boolean;
}>;

export type SettingsSection = (typeof settingsSections)[number]["id"];

export default function SettingsNavigation({
  active,
  manager,
  onChange,
}: {
  active: string;
  manager: boolean;
  onChange: (section: SettingsSection) => void;
}) {
  const sections = settingsSections.filter(
    (section) => !("manager" in section && section.manager) || manager,
  );
  return (
    <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      <label className="grid gap-2 text-xs font-medium lg:hidden">
        Settings section
        <select
          className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          value={active}
          onChange={(event) => {
            const selected = sections.find(
              (section) => section.id === event.target.value,
            );
            if (selected) onChange(selected.id);
          }}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
      <nav
        aria-label="Workspace settings sections"
        className="hidden gap-1 lg:grid"
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-pressed={active === section.id}
            onClick={() => onChange(section.id)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${active === section.id ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"}`}
          >
            <Icon name={section.icon} className="size-4 shrink-0" />
            {section.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
