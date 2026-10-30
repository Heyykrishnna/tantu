import type { ButtonHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "min-w-0 w-full rounded-lg border border-[#dfe3ec] bg-white px-3 py-2.5 text-[12px] font-normal text-[#30394a] shadow-xs outline-none transition-colors placeholder:text-[#6f7789] focus:border-[#8b87dd] focus:ring-3 focus:ring-violet-500/10 disabled:cursor-not-allowed disabled:opacity-55 dark:border-[#363638] dark:bg-[#202021] dark:text-[#e8e8ec] dark:placeholder:text-[#85858c] dark:focus:border-[#9290ed] dark:scheme-dark motion-reduce:transition-none";
export const panelClass =
  "min-w-0 rounded-xl border border-[#dfe3ed] bg-white shadow-xs dark:border-[#303032] dark:bg-[#1e1e1f] dark:shadow-none";
export const mutedClass = "text-[#737d90] dark:text-[#a0a0a7]";
export const headingClass =
  "font-heading font-medium tracking-[-0.035em] text-[#283346] dark:text-[#eeeeF0]";

const variants = {
  primary:
    "border-transparent bg-[#6662ce] text-white hover:bg-[#5753bd] dark:bg-[#9694f5] dark:text-[#171626] dark:hover:bg-[#aaa8ff]",
  secondary:
    "border-[#dfe3ec] bg-white text-[#414b5d] shadow-xs hover:bg-[#f2f3f9] dark:border-[#363638] dark:bg-[#252526] dark:text-[#d9d9df] dark:shadow-none dark:hover:bg-[#303032]",
  ghost:
    "border-transparent bg-transparent text-[#737d90] hover:bg-[#e9ecf4] hover:text-[#30394a] dark:text-[#aaaab1] dark:hover:bg-[#2c2c2e] dark:hover:text-white",
  danger:
    "border-[#f0d9dc] bg-transparent text-[#b64255] hover:bg-[#fff0f2] dark:border-[#5d353d] dark:text-[#ef9b9f] dark:hover:bg-[#352328]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: "md" | "sm" | "icon";
}) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border text-[12px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-violet-400/50 disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none ${size === "icon" ? "size-8" : size === "sm" ? "min-h-8 px-2.5 py-1.5" : "min-h-9 px-3.5 py-2"} ${variants[variant]} ${className}`}
      {...props}
    />
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
    <label className="grid min-w-0 gap-2 text-[12px] font-medium text-[#4f596b] dark:text-[#c8c8cf]">
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
      className={`rounded-lg border px-3.5 py-3 text-[12px] leading-relaxed wrap-anywhere empty:hidden ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/8 dark:text-rose-200" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/8 dark:text-emerald-200" : "border-[#e0e2f2] bg-[#f1f2fa] text-[#656586] dark:border-[#41405c] dark:bg-[#2b293b] dark:text-[#c6c3e8]"}`}
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
        className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-violet-400/20 bg-[#e8e7fb] text-[#6760ca] dark:bg-[#303047] dark:text-[#b2abff]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-5.5">
          <path
            d="M6 7.5h12M10 4.5v11a4 4 0 0 0 4 4h3M14 4.5V15"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="font-heading text-[19px] font-semibold tracking-[-0.06em] text-[#293248] dark:text-[#f2f1f7]">
          tantu<span className="text-[#9a94d4]">.</span>
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
  tone?: "neutral" | "green" | "violet" | "amber";
}) {
  const palettes = {
    neutral:
      "border-[#e1e4ec] bg-[#f6f7fa] text-[#687286] dark:border-[#3a3a3c] dark:bg-[#272728] dark:text-[#b3b3ba]",
    green:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/15 dark:bg-emerald-400/10 dark:text-emerald-300",
    violet:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/15 dark:bg-violet-400/12 dark:text-violet-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/15 dark:bg-amber-400/10 dark:text-amber-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${palettes[tone]}`}
    >
      {children}
    </span>
  );
}
