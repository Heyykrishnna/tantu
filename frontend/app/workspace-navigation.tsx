import Link from "next/link";
import type { FormEvent } from "react";
import type { User, Workspace } from "../lib/api";
import { Icon } from "../components/icon";
import { Brand, Button, Field, inputClass } from "../components/ui";

export type WorkspaceView =
  | "tasks"
  | "pages"
  | "capture"
  | "promises"
  | "decisions"
  | "graph"
  | "planning"
  | "kits"
  | "meetings"
  | "integrations"
  | "enterprise"
  | "projects"
  | "calendar"
  | "mail"
  | "collections"
  | "rules"
  | "activity"
  | "settings"
  | "operations";

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
    <div className="flex h-full flex-col bg-[#edf0f8] text-[#677287] dark:bg-[#151516] dark:text-[#a4a4ad]">
      <div className="flex h-16.25 shrink-0 items-center justify-between px-5">
        <Link
          href="/"
          aria-label="tantu home"
          className="inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
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
            className="size-4 text-[#8991a2] dark:text-[#74747d]"
          />
        )}
      </div>
      <div className="px-3.5 pb-5 pt-1">
        <label className="relative block rounded-xl border border-[#dfe3ed] bg-white px-3.5 py-2.5 shadow-xs dark:border-[#2c2c2f] dark:bg-[#202021] dark:shadow-none">
          <span className="mb-0.5 block text-[10px] tracking-wide text-[#6b7589] dark:text-[#9999a3]">
            WORKSPACE
          </span>
          <select
            aria-label="Switch workspace"
            value={workspaceId}
            onChange={(event) => onNavigate("tasks", event.target.value)}
            className="w-full cursor-pointer appearance-none bg-transparent pr-5 text-[12px] font-medium text-[#344056] outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-[#ededf2] dark:scheme-dark"
          >
            <option value="" disabled>
              Select workspace
            </option>
            {workspaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          <Icon
            name="down"
            className="pointer-events-none absolute right-3 top-7 size-3.5"
          />
        </label>
        <button
          onClick={onSearch}
          className="mt-3 flex h-9 w-full items-center gap-2 rounded-lg border border-[#dfe3ed] bg-white px-2.5 text-left text-[11px] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-[#303033] dark:bg-[#1b1b1d] dark:shadow-none"
        >
          <Icon name="search" className="size-3.5" />
          <span className="flex-1">Search or jump to…</span>
          <kbd className="rounded border border-[#e5e7ef] px-1 text-[9px] dark:border-[#36363a]">
            ⌘ K
          </kbd>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5">
        <p className="mb-2 px-3 text-[10px] font-medium tracking-[0.08em] text-[#69758b] dark:text-[#8b8b96]">
          WORKSPACE
        </p>
        <nav aria-label="Workspace navigation" className="grid gap-1">
          {(
            [
              ["capture", "Capture"],
              ["tasks", "Tasks"],
              ["promises", "Promises"],
              ["planning", "Plan My Day"],
              ["decisions", "Decisions"],
              ["graph", "Context Graph"],
              ["pages", "Pages"],
              ["collections", "Collections"],
              ["kits", "Workspace Kits"],
              ["meetings", "Meeting Briefs"],
              ["projects", "Projects"],
              ["calendar", "Calendar"],
              ["mail", "Mail"],
              ["activity", "Activity"],
            ] as const
          ).map(([target, label]) => (
            <button
              key={target}
              onClick={() => onNavigate(target)}
              aria-current={view === target ? "page" : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-lg px-3 text-left text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none ${view === target ? "bg-white font-medium text-[#424b73] shadow-xs dark:bg-[#2c2c30] dark:text-[#eeeef4] dark:shadow-none" : "hover:bg-white/60 hover:text-[#35405b] dark:hover:bg-[#222225] dark:hover:text-[#dddde5]"}`}
            >
              <Icon
                name={
                  target === "promises"
                    ? "promise"
                    : target === "projects"
                      ? "folder"
                      : target === "collections"
                        ? "layers"
                        : target === "decisions"
                          ? "decision"
                          : target === "graph"
                            ? "network"
                            : target === "planning"
                              ? "plan"
                              : target === "kits"
                                ? "kit"
                                : target === "meetings"
                                  ? "brain"
                                  : target
                }
              />
              {label}
              {view === target && (
                <span
                  aria-hidden="true"
                  className="ml-auto size-1.5 rounded-full bg-[#9490e8]"
                />
              )}
            </button>
          ))}
        </nav>
        <p className="mb-2 mt-7 px-3 text-[10px] font-medium tracking-[0.08em] text-[#69758b] dark:text-[#8b8b96]">
          MANAGE
        </p>
        <nav aria-label="Workspace management" className="grid gap-1">
          {(
            [
              ["integrations", "Integrations & APIs"],
              ["enterprise", "Enterprise & Governance"],
              ["rules", "Automation Rules"],
              ["settings", "Workspace settings"],
              ...(manager ? [["operations", "Operations"] as const] : []),
            ] as const
          ).map(([target, label]) => (
            <button
              key={target}
              onClick={() => onNavigate(target)}
              aria-current={view === target ? "page" : undefined}
              className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${view === target ? "bg-white font-medium text-[#424b73] shadow-xs dark:bg-[#2c2c30] dark:text-[#eeeef4] dark:shadow-none" : "hover:bg-white/60 dark:hover:bg-[#222225] dark:hover:text-[#dddde5]"}`}
            >
              <Icon
                name={
                  target === "rules"
                    ? "zap"
                    : target === "integrations"
                      ? "external"
                      : target === "enterprise"
                        ? "shield"
                        : target
                }
              />
              {label}
            </button>
          ))}
        </nav>
        <details className="mt-4 rounded-lg px-3 py-2 text-[11px] open:bg-white/50 dark:open:bg-[#202023]">
          <summary className="cursor-pointer rounded py-1 outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            New workspace
          </summary>
          <form onSubmit={onCreateWorkspace} className="grid gap-3 py-3">
            <Field label="Workspace name">
              <input
                name="name"
                required
                maxLength={100}
                className={inputClass}
              />
            </Field>
            <Button type="submit" size="sm" disabled={busy}>
              <Icon name="plus" className="size-3.5" />
              Create workspace
            </Button>
          </form>
        </details>
      </div>
      <div className="mx-4 mb-4 mt-10 rounded-xl border border-[#dfe3ed] bg-white/65 p-3 dark:border-[#2d2d30] dark:bg-[#1d1d1f]">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-[#59637a] dark:text-[#c3c1da]">
          <Icon name="shield" className="size-4 text-[#9390d4]" />
          Private by default
        </div>
        <p className="text-[10px] leading-relaxed text-[#6b7589] dark:text-[#85858f]">
          Your ideas stay yours. Share them with intention.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 border-t border-[#dce1ec] px-4 py-3.5 dark:border-[#29292c]">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-violet-300/25 bg-[#e0e0f3] text-[11px] font-medium text-[#6c64a7] dark:bg-[#2b2a42] dark:text-[#b0a9ee]"
        >
          {user.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[#3b475e] dark:text-[#d5d5dd]">
            {user.name}
          </p>
          <p className="truncate text-[10px] text-[#6b768c] dark:text-[#8c8c97]">
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
