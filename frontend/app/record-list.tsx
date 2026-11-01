import type { CanonicalRecord } from "../lib/contracts";
import { Icon } from "../components/icon";
import { Orb } from "@/components/ui/orb";
import {
  Badge,
  Button,
  headingClass,
  mutedClass,
  panelClass,
} from "../components/ui";

export function RecordOverview({
  entries,
  kind,
  loading,
}: {
  entries: CanonicalRecord[];
  kind: "task" | "page";
  loading: boolean;
}) {
  const metrics =
    kind === "task"
      ? [
          {
            label: "Tasks in this view",
            value: entries.length,
            icon: "layers" as const,
            detail: "Loaded records",
            tone: "text-zinc-700 dark:text-zinc-300",
          },
          {
            label: "Open tasks",
            value: entries.filter((item) => item.status === "open").length,
            icon: "circle" as const,
            detail: "Ready to move forward",
            tone: "text-sky-600 dark:text-sky-400",
          },
          {
            label: "Completed",
            value: entries.filter((item) => item.status === "done").length,
            icon: "tasks" as const,
            detail: "In this view",
            tone: "text-emerald-600 dark:text-emerald-400",
          },
        ]
      : [
          {
            label: "Pages in this view",
            value: entries.length,
            icon: "pages" as const,
            detail: "Loaded records",
            tone: "text-zinc-700 dark:text-zinc-300",
          },
          {
            label: "Nested pages",
            value: entries.filter((item) => item.parentId).length,
            icon: "layers" as const,
            detail: "Ideas with context",
            tone: "text-sky-600 dark:text-sky-400",
          },
          {
            label: "Shared with workspace",
            value: entries.filter((item) => item.visibility === "workspace")
              .length,
            icon: "users" as const,
            detail: "Explicitly shared",
            tone: "text-emerald-600 dark:text-emerald-400",
          },
        ];
  return (
    <div
      aria-label="Current view summary"
      className="mb-6 grid grid-cols-3 gap-3 sm:gap-4"
    >
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={`${panelClass} flex flex-col justify-between p-3.5 sm:p-4`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p
                className={`mb-1.5 text-[10px] font-medium sm:text-[11px] ${mutedClass}`}
              >
                {metric.label}
              </p>
              <p className="text-[24px] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums sm:text-[28px] dark:text-zinc-100">
                {loading ? "—" : metric.value}
              </p>
            </div>
            <span
              className={`hidden size-8 place-items-center rounded-lg border border-zinc-200/80 bg-zinc-100/70 sm:grid dark:border-zinc-800 dark:bg-zinc-800/80 ${metric.tone}`}
            >
              <Icon name={metric.icon} className="size-4" />
            </span>
          </div>
          <p
            className={`mt-2 hidden text-[10px] sm:block ${mutedClass}`}
          >
            {metric.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function RecordList({
  entries,
  kind,
  loading,
  query,
  selectedId,
  cursor,
  busy,
  guest,
  onOpen,
  onMore,
}: {
  entries: CanonicalRecord[];
  kind: "task" | "page";
  loading: boolean;
  query: string;
  selectedId?: string;
  cursor: string | null;
  busy: boolean;
  guest: boolean;
  onOpen: (id: string) => void;
  onMore: () => void;
}) {
  return (
    <section
      aria-label={kind === "task" ? "Task list" : "Page list"}
      aria-busy={loading}
      className={`${panelClass} overflow-hidden`}
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-zinc-200 px-4 dark:border-zinc-800">
        <h2 className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
          {kind === "task" ? "All tasks" : "All pages"}
        </h2>
        <span className={`text-[10px] font-medium ${mutedClass}`}>
          {entries.length} shown
        </span>
      </div>
      {loading ? (
        <div
          role="status"
          className="flex flex-col items-center justify-center gap-3 px-5 py-20 text-center"
        >
          <Orb state="solving" size={64} display={44} />
          <p className={`text-xs font-medium ${mutedClass}`}>
            Gathering your {kind === "task" ? "tasks" : "pages"}…
          </p>
        </div>
      ) : entries.length ? (
        <>
          <div
            aria-hidden="true"
            className="grid grid-cols-[minmax(0,1fr)_90px] gap-3 border-b border-zinc-200/80 bg-zinc-50/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 lg:grid-cols-[minmax(0,1fr)_90px_100px_80px] dark:border-zinc-800/80 dark:bg-zinc-900/40 dark:text-zinc-400"
          >
            <span className={kind === "task" ? "pl-7" : "pl-8"}>
              {kind === "task" ? "Task name" : "Page name"}
            </span>
            <span className="hidden lg:block">
              {kind === "task" ? "Priority" : "Structure"}
            </span>
            <span className="hidden lg:block">
              {kind === "task" ? "Deadline" : "Version"}
            </span>
            <span>Access</span>
          </div>
          <ul className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => onOpen(entry.id)}
                  aria-pressed={selectedId === entry.id}
                  className={`grid min-h-14 w-full grid-cols-[minmax(0,1fr)_90px] items-center gap-3 px-4 py-2.5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-zinc-400 lg:grid-cols-[minmax(0,1fr)_90px_100px_80px] motion-reduce:transition-none ${selectedId === entry.id ? "border-l-2 border-l-zinc-900 bg-zinc-100 shadow-xs dark:border-l-zinc-100 dark:bg-zinc-800/85" : "hover:bg-zinc-50/80 dark:hover:bg-zinc-850/60"}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={
                        entry.kind === "page"
                          ? "text-zinc-500 dark:text-zinc-400"
                          : entry.status === "done"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-zinc-400 dark:text-zinc-500"
                      }
                    >
                      <Icon
                        name={
                          entry.kind === "page"
                            ? "pages"
                            : entry.status === "done"
                              ? "tasks"
                              : "circle"
                        }
                        className={
                          entry.kind === "page" ? "size-4" : "size-4"
                        }
                      />
                    </span>
                    <span className="min-w-0">
                      <strong
                        className={`block truncate text-[12px] font-medium ${entry.status === "done" && entry.kind === "task" ? "text-zinc-400 line-through dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"}`}
                      >
                        {entry.title}
                      </strong>
                      <span
                        className={`mt-0.5 block text-[10px] ${mutedClass}`}
                      >
                        {entry.kind === "page"
                          ? entry.parentId
                            ? "Nested page"
                            : "Top-level page"
                          : entry.status === "done"
                            ? "Complete"
                            : "Open task"}
                      </span>
                    </span>
                  </span>
                  <span className="hidden lg:block">
                    {entry.kind === "task" ? (
                      <Badge
                        tone={
                          entry.status === "done"
                            ? "green"
                            : entry.priority === "urgent" ||
                                entry.priority === "high"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {entry.priority}
                      </Badge>
                    ) : (
                      <span className={`text-[10px] ${mutedClass}`}>
                        {entry.parentId ? "Nested" : "Root"}
                      </span>
                    )}
                  </span>
                  <span
                    className={`hidden text-[10px] tabular-nums lg:block ${mutedClass}`}
                  >
                    {entry.kind === "task"
                      ? (entry.deadline ?? "No date")
                      : `v${entry.version}`}
                  </span>
                  <span
                    className={`flex items-center gap-1.5 text-[10px] ${mutedClass}`}
                  >
                    <Icon
                      name={entry.visibility === "private" ? "lock" : "users"}
                      className="size-3"
                    />
                    {entry.visibility === "private" ? "Private" : "Shared"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {cursor && (
            <div className="flex justify-center border-t border-zinc-200 p-3 dark:border-zinc-800">
              <Button size="sm" disabled={busy} onClick={onMore}>
                Load more
                <Icon name="down" className="size-3.5" />
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="px-6 py-20 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-700 shadow-xs dark:border-zinc-800 dark:bg-zinc-850 dark:text-zinc-300">
            <Icon
              name={kind === "task" ? "tasks" : "pages"}
              className="size-6"
            />
          </span>
          <h2 className={`${headingClass} mb-2 text-[17px]`}>
            {query
              ? "No matching records"
              : kind === "task"
                ? "A clear space to begin"
                : "A home for your next idea"}
          </h2>
          <p
            className={`mx-auto max-w-xs text-[12px] leading-relaxed ${mutedClass}`}
          >
            {query
              ? "Try a different title or refresh this view."
              : guest
                ? "Records shared with you will appear here."
                : `Create your first ${kind} to get started. Everything is private until you choose to share.`}
          </p>
        </div>
      )}
    </section>
  );
}
