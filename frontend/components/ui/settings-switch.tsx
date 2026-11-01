"use client";

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
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="block h-6 w-11 rounded-full border border-zinc-300 bg-zinc-200 transition-colors peer-checked:border-zinc-800 peer-checked:bg-zinc-900 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 peer-focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-800 dark:peer-checked:border-zinc-200 dark:peer-checked:bg-zinc-100 motion-reduce:transition-none"
        />
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5 dark:peer-checked:bg-zinc-900 motion-reduce:transition-none [[data-reduce-motion=true]_&]:transition-none"
        />
      </span>
    </label>
  );
}
