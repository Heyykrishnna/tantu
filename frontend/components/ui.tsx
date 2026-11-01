import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  CandyButton,
  type CandyButtonVariant,
  type CandyButtonSize,
} from "@/components/ui/candy-button";

export { CandyButton };

export const inputClass =
  "min-w-0 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px] font-normal text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-[#141416] dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)] dark:hover:border-zinc-700 dark:focus:border-zinc-400 dark:focus:ring-zinc-500/25 dark:scheme-dark motion-reduce:transition-none [[data-density=compact]_&]:py-1.5 [[data-reduce-motion=true]_&]:transition-none";
export const panelClass =
  "min-w-0 rounded-xl border border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] transition-all dark:border-zinc-800/80 dark:bg-[#141416] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)]";
export const mutedClass = "text-zinc-500 dark:text-zinc-400";
export const headingClass =
  "font-[family-name:var(--font-poppins)] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100";

const candyVariantMap: Record<string, CandyButtonVariant> = {
  primary: "obsidian",
  secondary: "pearl",
  danger: "ruby",
  ghost: "ghost",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm" | "icon";
}) {
  const candySize: CandyButtonSize =
    size === "icon" ? "icon" : size === "sm" ? "sm" : "default";

  return (
    <CandyButton
      type={type}
      variant={candyVariantMap[variant] ?? "obsidian"}
      size={candySize}
      className={`text-[12px] font-medium ${className}`}
      {...props}
    >
      {children}
    </CandyButton>
  );
}

export function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
      {label}
      {children}
    </label>
  );
}

export function Notice({
  children,
  tone = "neutral",
  role = "status",
}: {
  children: ReactNode;
  tone?: "neutral" | "error" | "success";
  role?: "status" | "alert";
}) {
  return (
    <p
      role={role}
      className={`rounded-lg border px-3.5 py-2.5 text-[12px] leading-relaxed wrap-anywhere shadow-xs empty:hidden ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300"}`}
    >
      {children}
    </p>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-300 bg-zinc-900 text-white shadow-xs dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-950"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <path
            d="M6 7.5h12M10 4.5v11a4 4 0 0 0 4 4h3M14 4.5V15"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="font-[family-name:var(--font-poppins)] text-[18px] font-semibold tracking-[-0.04em] text-zinc-900 dark:text-zinc-100">
          tantu<span className="text-zinc-400 dark:text-zinc-500">.</span>
        </span>
      )}
    </>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "violet" | "amber" | "blue";
}) {
  const palettes = {
    neutral:
      "border-zinc-200 bg-zinc-100/70 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300",
    green:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300",
    violet:
      "border-zinc-200 bg-zinc-100/70 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300",
    blue: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/50 dark:bg-sky-950/40 dark:text-sky-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap shadow-xs ${palettes[tone]}`}
    >
      {children}
    </span>
  );
}
