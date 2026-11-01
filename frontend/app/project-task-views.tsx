import type { CanonicalRecord } from "../lib/contracts";
import type { ViewSettings } from "./saved-views";
import { TaskCard } from "@/components/ui/task-card";
import { Badge, Button, mutedClass, panelClass } from "../components/ui";
export default function ProjectTaskViews({
  tasks,
  settings,
  onOpen,
}: {
  tasks: CanonicalRecord[];
  settings: ViewSettings;
  onOpen: (id: string) => void;
}) {
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const compare = (a: CanonicalRecord, b: CanonicalRecord) =>
    settings.sort === "deadline"
      ? (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")
      : settings.sort === "priority"
        ? rank[a.priority] - rank[b.priority]
        : a.title.localeCompare(b.title);
  const visible = [...tasks].sort(compare);
  const groups =
    settings.group === "priority"
      ? ["urgent", "high", "normal", "low"]
      : settings.group === "status" || settings.mode === "board"
        ? ["open", "done"]
        : ["All work"];
  const grouped = (group: string) =>
    groups.length === 1
      ? visible
      : visible.filter(
          (task) =>
            (settings.group === "priority" ? task.priority : task.status) ===
            group,
        );
  const title = (task: CanonicalRecord) => (
    <button
      onClick={() => onOpen(task.id)}
      className="min-w-0 truncate rounded text-left text-[12px] font-medium outline-none hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:text-zinc-100"
    >
      {task.title}
    </button>
  );
  const columns = ["status", "priority", "deadline", "estimate"].filter(
    (column) => settings.columns.includes(column),
  );
  if (!visible.length)
    return (
      <p className={`${panelClass} p-6 text-[12px]`}>
        No tasks in this view. Link an existing task below.
      </p>
    );
  if (settings.mode === "timeline") {
    const dates = visible.flatMap((task) =>
      task.deadline ? [Date.parse(task.deadline + "T00:00:00Z")] : [],
    );
    const start = Math.min(...dates);
    const end = Math.max(...dates);
    const span = Math.max(86400000, end - start);
    return (
      <div className={`${panelClass} overflow-auto p-4`}>
        <p className={`mb-3 text-[10px] ${mutedClass}`}>
          Canonical deadlines · points represent dates, not inferred work
          durations.
        </p>
        {[...visible]
          .sort((a, b) =>
            (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"),
          )
          .map((task) => (
            <div
              className="grid min-w-125 grid-cols-[210px_1fr_95px] items-center gap-4 border-t border-[#dedfeb] py-3 dark:border-[#303032]"
              key={task.id}
            >
              {title(task)}
              <svg
                viewBox="0 0 500 24"
                className="h-6 w-full"
                role="img"
                aria-label={
                  task.deadline ? `Deadline ${task.deadline}` : "No deadline"
                }
              >
                <line
                  x1={8}
                  x2={492}
                  y1={12}
                  y2={12}
                  stroke="currentColor"
                  className="text-zinc-200 dark:text-zinc-800"
                />
                {task.deadline && (
                  <circle
                    cx={
                      8 +
                      ((Date.parse(task.deadline + "T00:00:00Z") - start) /
                        span) *
                        484
                    }
                    cy={12}
                    r={5}
                    fill="currentColor"
                    className="text-zinc-900 dark:text-zinc-100"
                  />
                )}
              </svg>
              <span className={`text-[10px] ${mutedClass}`}>
                {task.deadline ?? "Unscheduled"}
              </span>
            </div>
          ))}
      </div>
    );
  }
  if (settings.mode === "table")
    return (
      <div className={`${panelClass} overflow-auto`}>
        <table className="w-full text-left text-[11px]">
          <caption className="sr-only">Project tasks</caption>
          <thead>
            <tr>
              <th className="px-4 py-3">Task</th>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 capitalize">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupRows
                key={group}
                group={group}
                tasks={grouped(group)}
                columns={columns}
                title={title}
                grouped={groups.length > 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <div
      className={
        settings.mode === "board" ? "grid gap-4 sm:grid-cols-2" : "grid gap-3"
      }
    >
      {groups.map((group) => (
        <section className={`${panelClass} p-4 sm:p-5`} key={group}>
          <h3 className="mb-3 text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 capitalize">{group}</h3>
          <div className="grid gap-3">
            {grouped(group).map((task) =>
              settings.mode === "board" ? (
                <TaskCard
                  key={task.id}
                  title={task.title}
                  priority={
                    task.priority === "urgent" || task.priority === "high"
                      ? "urgent"
                      : task.priority === "low"
                        ? "low"
                        : "moderate"
                  }
                  status={task.status === "done" ? "Done" : "Open"}
                  dueDate={task.deadline ?? undefined}
                  onOpen={() => onOpen(task.id)}
                />
              ) : (
                <article
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                  key={task.id}
                >
                  {title(task)}
                  <span className="ml-auto">
                    <Badge tone={task.status === "done" ? "green" : "neutral"}>
                      {task.status}
                    </Badge>
                  </span>
                  {settings.columns.includes("priority") && (
                    <Badge>{task.priority}</Badge>
                  )}
                  {settings.columns.includes("deadline") && (
                    <span className={`text-[10px] ${mutedClass}`}>
                      {task.deadline ?? "No deadline"}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpen(task.id)}
                  >
                    Open details
                  </Button>
                </article>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
function GroupRows({
  group,
  tasks,
  columns,
  title,
  grouped,
}: {
  group: string;
  tasks: CanonicalRecord[];
  columns: string[];
  title: (task: CanonicalRecord) => React.ReactNode;
  grouped: boolean;
}) {
  return (
    <>
      {grouped && (
        <tr>
          <th
            colSpan={columns.length + 1}
            className="bg-zinc-100/60 px-4 py-2 capitalize dark:bg-zinc-850/60"
          >
            {group}
          </th>
        </tr>
      )}
      {tasks.map((task) => (
        <tr
          className="border-t border-[#dedfeb] dark:border-[#303032]"
          key={task.id}
        >
          <td className="max-w-xs px-4 py-3">{title(task)}</td>
          {columns.map((column) => (
            <td className="px-4 py-3" key={column}>
              {column === "estimate"
                ? (task.estimateMinutes ?? "Unknown")
                : column === "deadline"
                  ? (task.deadline ?? "No deadline")
                  : column === "status"
                    ? task.status
                    : task.priority}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
