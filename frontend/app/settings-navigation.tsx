"use client";

import { TreeView } from "../components/ui/file-tree";
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
          aria-label="Settings section"
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
        className="hidden rounded-xl border border-zinc-200/80 bg-white/70 p-2 lg:grid dark:border-zinc-800 dark:bg-zinc-950/30"
      >
        <TreeView
          label="Settings sections"
          selectedId={active}
          defaultExpandedIds={[
            "workspace-settings",
            "experience-settings",
            "admin-settings",
          ]}
          onNodeClick={(node) => {
            const selected = sections.find((section) => section.id === node.id);
            if (selected) onChange(selected.id);
          }}
          data={[
            {
              id: "workspace-settings",
              label: "Workspace",
              children: sections
                .filter((section) =>
                  [
                    "overview",
                    "general",
                    "spaces",
                    "members",
                    "permissions",
                  ].includes(section.id),
                )
                .map((section) => ({
                  id: section.id,
                  label: section.label,
                  icon: <Icon name={section.icon} className="size-4" />,
                })),
            },
            {
              id: "experience-settings",
              label: "Preferences & data",
              children: sections
                .filter((section) =>
                  [
                    "preferences",
                    "connections",
                    "ai",
                    "security",
                    "quotas",
                  ].includes(section.id),
                )
                .map((section) => ({
                  id: section.id,
                  label: section.label,
                  icon: <Icon name={section.icon} className="size-4" />,
                })),
            },
            ...(manager
              ? [
                  {
                    id: "admin-settings",
                    label: "Administration",
                    children: sections
                      .filter((section) => "manager" in section)
                      .map((section) => ({
                        id: section.id,
                        label: section.label,
                        icon: <Icon name={section.icon} className="size-4" />,
                      })),
                  },
                ]
              : []),
          ]}
        />
      </nav>
    </aside>
  );
}
