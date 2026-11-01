"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Icon } from "../components/icon";
import { Orb } from "@/components/ui/orb";
import { TaskList } from "@/components/ui/task-list";
import {
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";

export interface DailyPlanBlockItem {
  id: string;
  planId: string;
  taskId: string | null;
  title: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  placementReason: string;
  unplacedReason: string | null;
  isPlaced: boolean;
  createdAt: string;
}

export interface DailyPlanItem {
  id: string;
  workspaceId: string;
  userId: string;
  planDate: string;
  targetHours: number;
  allocatedHours: number;
  status: "draft" | "reviewed" | "applied" | "canceled";
  version: number;
  createdAt: string;
  updatedAt: string;
  blocks?: DailyPlanBlockItem[];
}

export interface WorkloadWeatherItem {
  horizon: "day" | "week";
  totalCapacityHours: number;
  estimatedEffortHours: number;
  ratio: number;
  weather: "clear" | "tight" | "overloaded";
  missingEstimateCount: number;
  uncertainItemCount: number;
  explanation: string;
}

export default function PlanningPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [targetHours, setTargetHours] = useState(8);
  const [plan, setPlan] = useState<DailyPlanItem | null>(null);
  const [weather, setWeather] = useState<WorkloadWeatherItem | null>(null);
  const [weatherHorizon, setWeatherHorizon] = useState<"day" | "week">("day");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ plan: DailyPlanItem | null }>(
        `/workspaces/${workspaceId}/planning/daily-plan?date=${selectedDate}`,
        (v) => v as { plan: DailyPlanItem | null },
        { signal: controller.signal }
      ),
      api<{ weather: WorkloadWeatherItem }>(
        `/workspaces/${workspaceId}/planning/workload-weather?horizon=${weatherHorizon}`,
        (v) => v as { weather: WorkloadWeatherItem },
        { signal: controller.signal }
      ),
    ])
      .then(([planRes, weatherRes]) => {
        setPlan(planRes.plan);
        setWeather(weatherRes.weather);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load planning data.");
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId, selectedDate, weatherHorizon]);

  function handleGeneratePlan(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    api<{ plan: DailyPlanItem }>(
      `/workspaces/${workspaceId}/planning/daily-plan`,
      (v) => v as { plan: DailyPlanItem },
      {
        method: "POST",
        csrf,
        body: {
          date: selectedDate,
          targetHours: Number(targetHours),
        },
      }
    )
      .then((res) => {
        setPlan(res.plan);
        setNotice("Deterministic daily plan generated based on eligible task priorities.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to generate plan.");
        setBusy(false);
      });
  }

  function handleApplyPlan() {
    if (!plan) return;
    setBusy(true);
    setError("");
    api<{ plan: DailyPlanItem }>(
      `/workspaces/${workspaceId}/planning/daily-plan/apply`,
      (v) => v as { plan: DailyPlanItem },
      {
        method: "POST",
        csrf,
        body: {
          planId: plan.id,
          version: plan.version,
        },
      }
    )
      .then((res) => {
        setPlan(res.plan);
        setNotice("Daily plan blocks committed to calendar schedule.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to apply plan.");
        setBusy(false);
      });
  }

  const placedBlocks = plan?.blocks?.filter((b) => b.isPlaced) ?? [];
  const unplacedBlocks = plan?.blocks?.filter((b) => !b.isPlaced) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={headingClass}>Plan My Day & Workload Weather</h2>
          <p className={mutedClass}>
            Explainable deterministic scheduling, capacity calibration, and workload forecasting.
          </p>
        </div>
      </div>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {weather && (
        <div
          className={`${panelClass} space-y-4 border-l-4 p-5 sm:p-6 ${
            weather.weather === "clear"
              ? "border-l-emerald-500"
              : weather.weather === "tight"
                ? "border-l-amber-500"
                : "border-l-rose-500"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Workload Weather:
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${
                  weather.weather === "clear"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : weather.weather === "tight"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                }`}
              >
                {weather.weather}
              </span>
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/90 p-1 dark:border-zinc-800 dark:bg-zinc-900">
              {(["day", "week"] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setWeatherHorizon(h)}
                  className="relative rounded-lg px-3 py-1 text-xs font-medium capitalize outline-none transition-colors"
                >
                  {weatherHorizon === h && (
                    <motion.div
                      layoutId="weather-horizon-pill"
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      className="absolute inset-0 rounded-lg border border-zinc-200/90 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  )}
                  <span
                    className={`relative z-10 ${
                      weatherHorizon === h
                        ? "font-semibold text-zinc-950 dark:text-white"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    }`}
                  >
                    {h}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-zinc-700 dark:text-zinc-300">
            {weather.explanation}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span>
                Estimated Effort: {weather.estimatedEffortHours}h / Capacity: {weather.totalCapacityHours}h
              </span>
              <span>{(weather.ratio * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  weather.weather === "clear"
                    ? "bg-emerald-500"
                    : weather.weather === "tight"
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
                style={{ width: `${Math.min(weather.ratio * 100, 100)}%` }}
              />
            </div>
          </div>

          {weather.missingEstimateCount > 0 && (
            <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-900">
              Note: {weather.missingEstimateCount} eligible task(s) lack duration estimates. A 30m default allocation is assumed.
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleGeneratePlan} className={`${panelClass} space-y-4 p-5 sm:p-6`}>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Deterministic Daily Plan Generator
        </h3>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
          <Field label="Plan Date">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={`${inputClass} h-10`}
              required
            />
          </Field>
          <Field label="Target Capacity (Hours)">
            <input
              type="number"
              min={1}
              max={16}
              step={0.5}
              value={targetHours}
              onChange={(e) => setTargetHours(Number(e.target.value))}
              className={`${inputClass} h-10`}
              required
            />
          </Field>
          <div className="flex h-10 items-end">
            <Button type="submit" variant="primary" disabled={busy} className="h-10 w-full justify-center">
              <Icon name="plan" className="size-4" />
              <span>{busy ? "Calculating..." : "Generate Plan"}</span>
            </Button>
          </div>
        </div>
      </form>

      {loading ? (
        <div className={`${panelClass} flex flex-col items-center justify-center gap-3 p-12 text-center`}>
          <Orb state="solving" size={64} display={48} />
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Evaluating deterministic plan constraints...
          </p>
        </div>
      ) : !plan ? (
        <div className={`${panelClass} p-8 text-center space-y-2`}>
          <Icon name="plan" className="size-8 mx-auto text-zinc-400" />
          <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">No plan generated for {selectedDate}</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Click &quot;Generate Plan&quot; to evaluate open tasks, dependency locks, and working hours deterministically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                  plan.status === "applied"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                {plan.status}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Allocated: {plan.allocatedHours}h / Target: {plan.targetHours}h (v{plan.version})
              </span>
            </div>
            {plan.status !== "applied" && placedBlocks.length > 0 && (
              <Button type="button" variant="primary" onClick={handleApplyPlan} disabled={busy}>
                <span>Commit to Calendar</span>
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">
              Scheduled Blocks ({placedBlocks.length})
            </h4>
            {placedBlocks.length === 0 ? (
              <div className={`${panelClass} p-5 text-xs text-zinc-500 dark:text-zinc-400`}>
                No tasks placed within available capacity.
              </div>
            ) : (
              <div className="space-y-3">
                <TaskList
                  tasks={placedBlocks.map((block) => ({
                    id: block.id,
                    label: `${block.title} (${block.durationMinutes}m)`,
                    done: plan.status === "applied",
                  }))}
                  size="sm"
                  className="max-w-none"
                />
                <div className="grid gap-2">
                  {placedBlocks.map((block) => (
                    <div
                      key={block.id}
                      className="p-3 bg-white dark:bg-[#141416] rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs space-y-1 shadow-xs"
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-xs text-zinc-900 dark:text-zinc-100">{block.title}</span>
                        <span className="text-zinc-500 font-mono text-[11px]">
                          {block.startTime ? new Date(block.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                          {" - "}
                          {block.endTime ? new Date(block.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                          {" "}({block.durationMinutes}m)
                        </span>
                      </div>
                      <div className="text-zinc-500 dark:text-zinc-400 text-[11px]">{block.placementReason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {unplacedBlocks.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400">
                Unplaced Tasks ({unplacedBlocks.length})
              </h4>
              <div className="grid gap-2">
                {unplacedBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-900/40 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-medium text-amber-900 dark:text-amber-200">
                      <span>{block.title}</span>
                      <span>({block.durationMinutes}m)</span>
                    </div>
                    <div className="text-amber-700 dark:text-amber-400 text-[11px]">
                      Reason: {block.unplacedReason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

