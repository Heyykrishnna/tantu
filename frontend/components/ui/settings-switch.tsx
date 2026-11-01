"use client";

import { motion } from "motion/react";
import { useUiMotion } from "../../lib/use-ui-motion";
import { useId } from "react";

export function SettingsSwitch({
  label,
  description,
  name,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const reduced = useUiMotion();
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span
          id={id}
          className="mt-1 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"
        >
          {description}
        </span>
      </span>
      <span className="relative shrink-0">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          aria-describedby={id}
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 h-6 w-11 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className="block h-6 w-11 rounded-full border border-zinc-300 bg-zinc-200 transition-colors peer-checked:border-zinc-800 peer-checked:bg-zinc-900 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 peer-focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-800 dark:peer-checked:border-zinc-200 dark:peer-checked:bg-zinc-100 motion-reduce:transition-none"
        />
        <motion.span
          animate={{ x: checked ? 20 : 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 440, damping: 30 }
          }
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm dark:peer-checked:bg-zinc-900"
        />
      </span>
    </label>
  );
}
