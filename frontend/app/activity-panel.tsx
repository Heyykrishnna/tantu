"use client";

import { useEffect, useState } from "react";
import { acknowledgment, api, items, record, string } from "../lib/api";
import { Icon } from "../components/icon";
import {
  Badge,
  Button,
  headingClass,
  mutedClass,
  Notice,
  panelClass,
} from "../components/ui";

interface Row {
  id: string;
  label: string;
  when: string;
  state: string;
}

export default function ActivityPanel({
  workspaceId,
  csrf,
  operations,
}: {
  workspaceId: string;
  csrf: string;
  operations: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(
      `/workspaces/${workspaceId}/${operations ? "operations" : "activity"}`,
      items((value) => {
        const data = record(value);
        return {
          id: string(data.id),
          label: string(operations ? data.name : data.type),
          when: string(data.createdAt),
          state: string(operations ? data.state : data.deliveryState),
        };
      }),
      { signal: controller.signal },
    )
      .then(setRows)
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError"))
          setMessage(
            error instanceof Error ? error.message : "Activity is unavailable.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, operations, version]);
  async function action(row: Row, action: "retry" | "cancel") {
    try {
      await api(`/workspaces/${workspaceId}/jobs/${row.id}`, acknowledgment, {
        method: "POST",
        csrf,
        body: { action },
      });
      setVersion((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed.");
    }
  }
  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={`${headingClass} mb-2 text-[25px]`}>
            {operations ? "Operations" : "Workspace activity"}
          </h1>
          <p className={`max-w-xl text-[12px] ${mutedClass}`}>
            {operations
              ? "Keep an eye on processing. Review failures and recover safely."
              : "A timeline of the changes you can access. Just the details that matter."}
          </p>
        </div>
        <Button onClick={() => setVersion((value) => value + 1)}>
          <Icon name="refresh" className="size-3.5" />
          Refresh
        </Button>
      </header>
      <Notice tone="error" role="alert">
        {message}
      </Notice>
      <div className={panelClass}>
        <div className="flex min-h-[54px] items-center justify-between gap-4 border-b border-[#e3e6ef] px-5 dark:border-[#303034]">
          <h2 className="flex items-center gap-2 text-[12px] font-medium">
            <Icon
              name={operations ? "operations" : "activity"}
              className="size-4 text-[#9991d8]"
            />
            {operations ? "Processing history" : "Recent activity"}
          </h2>
          <span className={`text-[10px] ${mutedClass}`}>
            {rows.length} events shown
          </span>
        </div>
        {loading ? (
          <p
            role="status"
            className={`flex items-center justify-center gap-2 px-6 py-20 text-[12px] ${mutedClass}`}
          >
            <Icon name="refresh" className="size-4 motion-safe:animate-spin" />
            Loading…
          </p>
        ) : rows.length ? (
          <ul className="divide-y divide-[#e8eaf2] dark:divide-[#2e2e32]">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 px-5 py-4"
              >
                <span className="grid size-8 place-items-center rounded-lg border border-[#e3e1f1] bg-[#f1f0fa] text-[#9690cd] dark:border-[#3b354c] dark:bg-[#2c2938]">
                  <Icon
                    name={operations ? "operations" : "activity"}
                    className="size-4"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-[12px] font-medium capitalize">
                    {row.label.replace(/[._-]/g, " ")}
                  </strong>
                  <span className={`mt-0.5 block text-[10px] ${mutedClass}`}>
                    {new Date(row.when).toLocaleString()}
                  </span>
                </div>
                <Badge
                  tone={
                    row.state === "completed" || row.state === "published"
                      ? "green"
                      : row.state === "failed" || row.state === "retry"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {row.state}
                </Badge>
                {operations &&
                  ["created", "active", "retry"].includes(row.state) && (
                    <Button
                      size="sm"
                      onClick={() => void action(row, "cancel")}
                    >
                      Cancel
                    </Button>
                  )}
                {operations &&
                  row.state === "failed" &&
                  row.label !== "dead-letters" && (
                    <Button size="sm" onClick={() => void action(row, "retry")}>
                      <Icon name="refresh" className="size-3.5" />
                      Retry
                    </Button>
                  )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-20 text-center">
            <span className="mx-auto mb-5 grid size-12 place-items-center rounded-xl border border-[#e3e1f1] bg-[#f3f2fb] text-[#9991d5] dark:border-[#3c354e] dark:bg-[#2b2838]">
              <Icon
                name={operations ? "operations" : "activity"}
                className="size-6"
              />
            </span>
            <h2 className={`${headingClass} mb-2 text-[18px]`}>
              A quiet beginning.
            </h2>
            <p className={`text-[12px] ${mutedClass}`}>
              Changes will appear here as you work.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
