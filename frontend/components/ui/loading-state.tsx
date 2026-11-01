"use client";

import { Orb } from "./orb";
import { cn } from "../../lib/utils";

export function LoadingState({
  label = "Loading workspace view…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 p-6 text-center dark:border-zinc-800",
        className,
      )}
    >
      <Orb
        state="solving"
        interactive={false}
        theme="auto"
        size={64}
        display={40}
      />
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
    </div>
  );
}
