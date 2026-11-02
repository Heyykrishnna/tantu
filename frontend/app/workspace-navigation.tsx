import { Select } from "@/components/ui/select";
import Link from "next/link";
import type { FormEvent } from "react";
import { TreeView } from "../components/ui/file-tree";
import type { TreeNode } from "../components/ui/file-tree";
import { resolveView } from "../lib/navigation";
import type { User, Workspace } from "../lib/api";
import { Icon } from "../components/icon";
import { Brand, Button, Field, inputClass } from "../components/ui";

import type { WorkspaceView } from "../lib/navigation";

interface NavigationProps {
  user: User;
  workspaces: Workspace[];
  workspaceId: string;
  view: WorkspaceView;
  manager: boolean;
  busy: boolean;
  onNavigate: (target: WorkspaceView, workspaceId?: string) => void;
  onCreateWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  onSearch: () => void;
  onLogout: () => void;
  onClose?: () => void;
}

export default function WorkspaceNavigation({
  user,
  workspaces,
  workspaceId,
  view,
  manager,
  busy,
  onNavigate,
  onCreateWorkspace,
  onSearch,
  onLogout,
  onClose,
}: NavigationProps) {
  return (
    <div className="flex h-full flex-col bg-[#f8f9fa] text-zinc-600 dark:bg-[#0c0c0e] dark:text-zinc-400">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200/70 px-4 dark:border-zinc-850">
        <Link
          href="/"
          aria-label="tantu home"
          className="inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          <Brand />
        </Link>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <Icon name="close" />
          </Button>
        ) : (
          <Icon
            name="panel"
            className="size-4 text-zinc-400 dark:text-zinc-500"
          />
        )}
      </div>
      <div className="px-3.5 pb-4 pt-3">
        <label className="relative block rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-xs dark:border-zinc-800 dark:bg-[#141416]">
          <span className="mb-0.5 block text-[9px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
            WORKSPACE
          </span>
          <Select
            aria-label="Switch workspace"
            value={workspaceId}
            onChange={(event) => onNavigate(view, event.target.value)}
            className="min-h-0 w-full cursor-pointer appearance-none rounded-none border-0 bg-transparent p-0 pr-1 shadow-none text-[12px] font-medium text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-100 dark:scheme-dark"
          >
            <option value="" disabled>
              Select workspace
            </option>
            {workspaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </Select>
        </label>
        <Button
          variant="ghost"
          onClick={onSearch}
          className="mt-2.5 flex h-8.5 w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-left text-[11px] text-zinc-500 shadow-xs transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-[#141416] dark:text-zinc-400 dark:hover:border-zinc-700"
        >
          <Icon name="search" className="size-3.5 text-zinc-400" />
          <span className="flex-1">Search or jump to…</span>
          <kbd className="rounded border border-zinc-200 px-1 text-[9px] font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            ⌘ K
          </kbd>
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5">
        <nav aria-label="Workspace navigation">
          <TreeView
            label="Workspace sections"
            selectedId={view}
            defaultExpandedIds={["workspace", "manage"]}
            onNodeClick={(node) => {
              const target = resolveView(node.id);
              if (target) onNavigate(target);
            }}
            data={[
              {
                id: "workspace",
                label: "Workspace",
                children: [
                  ["capture", "Capture", "capture"],
                  ["tasks", "Tasks", "tasks"],
                  ["promises", "Promises", "promise"],
                  ["planning", "Plan My Day", "plan"],
                  ["decisions", "Decisions", "decision"],
                  ["graph", "Context Graph", "network"],
                  ["pages", "Pages", "pages"],
                  ["collections", "Collections", "layers"],
                  ["kits", "Workspace Kits", "kit"],
                  ["meetings", "Meeting Briefs", "brain"],
                  ["projects", "Projects", "folder"],
                  ["calendar", "Calendar", "calendar"],
                  ["mail", "Mail", "mail"],
                  ["activity", "Activity", "activity"],
                ].map(([id, label, icon]) => ({
                  id,
                  label,
                  href: workspaceId ? `/${id}?w=${workspaceId}` : `/${id}`,
                  icon: <Icon name={navigationIcon(icon)} className="size-4" />,
                })),
              },
              {
                id: "manage",
                label: "Manage",
                children: managementNodes(manager).map((node) => ({
                  ...node,
                  href: workspaceId
                    ? `/${node.id}?w=${workspaceId}`
                    : `/${node.id}`,
                })),
              },
            ]}
          />
        </nav>
        <details className="mt-3.5 rounded-lg border border-zinc-200/60 px-3 py-2 text-[11px] open:bg-white dark:border-zinc-800/70 dark:open:bg-[#141416]">
          <summary className="cursor-pointer list-none rounded-lg px-1 py-1.5 font-medium text-zinc-600 outline-none transition-colors hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-200">
            + New workspace
          </summary>
          <form onSubmit={onCreateWorkspace} className="grid gap-2.5 py-2.5">
            <Field label="Workspace name">
              <input
                name="name"
                required
                maxLength={100}
                placeholder="Workspace name"
                className={inputClass}
              />
            </Field>
            <Button type="submit" size="sm" variant="primary" disabled={busy}>
              <Icon name="plus" className="size-3.5" />
              Create workspace
            </Button>
          </form>
        </details>
      </div>
      <div className="mx-3.5 mb-3 mt-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-[#141416]">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
          <Icon name="shield" className="size-3.5 text-zinc-400" />
          Private by default
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Your ideas stay yours. Share them with intention.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 border-t border-zinc-200/80 px-3.5 py-3 dark:border-zinc-850">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-zinc-300 bg-zinc-200 text-[11px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          {user.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-zinc-900 dark:text-zinc-100">
            {user.name}
          </p>
          <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
            {user.email}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon name="logout" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function navigationIcon(name: string): import("../components/icon").IconName {
  switch (name) {
    case "capture":
    case "tasks":
    case "promise":
    case "plan":
    case "decision":
    case "network":
    case "pages":
    case "layers":
    case "kit":
    case "brain":
    case "folder":
    case "calendar":
    case "mail":
    case "activity":
      return name;
    default:
      return "folder";
  }
}

function managementNodes(manager: boolean): TreeNode[] {
  return [
    {
      id: "integrations",
      label: "Integrations & APIs",
      icon: <Icon name="external" />,
    },
    {
      id: "enterprise",
      label: "Enterprise & Governance",
      icon: <Icon name="shield" />,
    },
    {
      id: "discovery",
      label: "Future Discovery",
      icon: <Icon name="search" />,
    },
    { id: "rules", label: "Automation Rules", icon: <Icon name="zap" /> },
    {
      id: "settings",
      label: "Workspace settings",
      icon: <Icon name="settings" />,
    },
    ...(manager
      ? [
          {
            id: "operations",
            label: "Operations",
            icon: <Icon name="activity" />,
          },
        ]
      : []),
  ];
}
