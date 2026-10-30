"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { Icon } from "../components/icon";
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
        `/api/v1/workspaces/${workspaceId}/planning/daily-plan?date=${selectedDate}`,
        (v) => v as { plan: DailyPlanItem | null },
        { signal: controller.signal }
      ),
      api<{ weather: WorkloadWeatherItem }>(
        `/api/v1/workspaces/${workspaceId}/planning/workload-weather?horizon=${weatherHorizon}`,
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
      `/api/v1/workspaces/${workspaceId}/planning/daily-plan`,
      (v) => v as { plan: DailyPlanItem },
      {
        method: "POST",
        csrf,
        body: JSON.stringify({
          date: selectedDate,
          targetHours: Number(targetHours),
        }),
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
      `/api/v1/workspaces/${workspaceId}/planning/daily-plan/apply`,
      (v) => v as { plan: DailyPlanItem },
      {
        method: "POST",
        csrf,
        body: JSON.stringify({
          planId: plan.id,
          version: plan.version,
        }),
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
        <div className={`${panelClass} space-y-4 border-l-4 ${
          weather.weather === "clear"
            ? "border-l-emerald-500"
            : weather.weather === "tight"
            ? "border-l-amber-500"
            : "border-l-rose-500"
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
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
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setWeatherHorizon("day")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  weatherHorizon === "day"
                    ? "bg-white dark:bg-neutral-900 font-medium shadow-xs"
                    : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setWeatherHorizon("week")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  weatherHorizon === "week"
                    ? "bg-white dark:bg-neutral-900 font-medium shadow-xs"
                    : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                Week
              </button>
            </div>
          </div>

          <div className="text-xs text-neutral-700 dark:text-neutral-300">
            {weather.explanation}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span>
                Estimated Effort: {weather.estimatedEffortHours}h / Capacity: {weather.totalCapacityHours}h
              </span>
              <span>{(weather.ratio * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
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
            <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2 rounded border border-amber-200 dark:border-amber-900">
              Note: {weather.missingEstimateCount} eligible task(s) lack duration estimates. A 30m default allocation is assumed.
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleGeneratePlan} className={`${panelClass} space-y-4`}>
        <h3 className="font-medium text-sm">Deterministic Daily Plan Generator</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Plan Date">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={inputClass}
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
              className={inputClass}
              required
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="primary" disabled={busy} className="w-full">
              <Icon name="plan" className="size-4" />
              <span>{busy ? "Calculating..." : "Generate Plan"}</span>
            </Button>
          </div>
        </div>
      </form>

      {loading ? (
        <div className="p-8 text-center text-sm text-neutral-500">Loading plan...</div>
      ) : !plan ? (
        <div className={`${panelClass} p-8 text-center space-y-2`}>
          <Icon name="plan" className="size-8 mx-auto text-neutral-400" />
          <h3 className="font-medium text-sm">No plan generated for {selectedDate}</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
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
                    : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                }`}
              >
                {plan.status}
              </span>
              <span className="text-xs text-neutral-500">
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
            <h4 className="text-xs uppercase font-bold tracking-wider text-neutral-500">
              Scheduled Blocks ({placedBlocks.length})
            </h4>
            {placedBlocks.length === 0 ? (
              <div className={`${panelClass} p-4 text-xs text-neutral-500`}>
                No tasks placed within available capacity.
              </div>
            ) : (
              <div className="space-y-2">
                {placedBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="p-3 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-sm">{block.title}</span>
                      <span className="text-neutral-500 font-mono">
                        {block.startTime ? new Date(block.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        {" - "}
                        {block.endTime ? new Date(block.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        {" "}({block.durationMinutes}m)
                      </span>
                    </div>
                    <div className="text-neutral-500 text-[11px]">{block.placementReason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {unplacedBlocks.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400">
                Unplaced Tasks ({unplacedBlocks.length})
              </h4>
              <div className="space-y-2">
                {unplacedBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/60 dark:border-amber-900/40 text-xs space-y-1"
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

