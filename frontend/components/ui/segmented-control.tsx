"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { useUiMotion } from "../../lib/use-ui-motion";

export function SegmentedControl<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  name: string;
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const reduced = useUiMotion();
  return (
    <fieldset
      disabled={disabled}
      className="grid min-w-0 gap-2 disabled:opacity-60"
    >
      <legend className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </legend>
      <div className="flex min-h-10 items-stretch gap-1 rounded-xl border border-zinc-200 bg-zinc-100/70 p-1 dark:border-zinc-800 dark:bg-zinc-950/60">
        {options.map((option) => (
          <label
            key={option.value}
            className="relative flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2 text-center text-xs has-focus-visible:ring-2 has-focus-visible:ring-zinc-400 has-disabled:cursor-not-allowed"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            {value === option.value && (
              <motion.span
                layoutId={`${id}-selection`}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 34, mass: 0.8 }
                }
                className="absolute inset-0 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            )}
            <span
              className={`relative min-w-0 ${value === option.value ? "font-medium text-zinc-950 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"}`}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
