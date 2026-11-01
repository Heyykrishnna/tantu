"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type CandyButtonVariant =
  | "emerald"
  | "ruby"
  | "amber"
  | "violet"
  | "azure"
  | "obsidian"
  | "pearl";

export type CandyButtonSize = "sm" | "default" | "lg" | "icon";

export interface CandyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  as?: React.ElementType;
  href?: string;
  target?: string;
  rel?: string;
  variant?: CandyButtonVariant;
  size?: CandyButtonSize;
  color?: string;
  glow?: boolean;
  glassSheen?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<CandyButtonVariant, string> = {
  emerald:
    "bg-emerald-600 dark:bg-emerald-700 text-white shadow-xs hover:bg-emerald-500",
  ruby: "bg-rose-600 dark:bg-rose-700 text-white shadow-xs hover:bg-rose-500",
  amber:
    "bg-amber-600 dark:bg-amber-700 text-white shadow-xs hover:bg-amber-500",
  violet:
    "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 shadow-xs hover:bg-zinc-700",
  azure: "bg-sky-600 dark:bg-sky-700 text-white shadow-xs hover:bg-sky-500",
  obsidian:
    "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border border-zinc-800 dark:border-zinc-200 shadow-xs hover:bg-zinc-800 dark:hover:bg-white",
  pearl:
    "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 shadow-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/80",
};

const sizeStyles: Record<CandyButtonSize, string> = {
  sm: "h-8 px-3.5 text-xs rounded-lg gap-1.5 [&_svg]:size-3.5",
  default: "h-10 px-5 text-sm rounded-xl gap-2 [&_svg]:size-4",
  lg: "h-12 px-7 text-base rounded-2xl gap-2.5 [&_svg]:size-5",
  icon: "size-10 p-0 rounded-xl gap-0 [&_svg]:size-4",
};

export const CandyButton = React.forwardRef<HTMLElement, CandyButtonProps>(
  (
    {
      as,
      className,
      children,
      variant = "emerald",
      size = "default",
      color,
      glow = false,
      glassSheen,
      leftIcon,
      rightIcon,
      style,
      disabled,
      ...props
    },
    ref,
  ) => {
    void glassSheen;
    const isCustom = Boolean(color);

    const customStyle: React.CSSProperties = isCustom
      ? {
          backgroundColor: color,
          boxShadow: glow ? `0px 4px 20px -6px ${color}` : undefined,
          color: "#ffffff",
          ...style,
        }
      : (style ?? {});

    const commonClass = cn(
      "relative inline-flex items-center justify-center font-medium leading-none tracking-[0.01em] select-none overflow-hidden cursor-pointer transition-all duration-200 ease-out active:scale-[0.98] active:brightness-95 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
      !isCustom && variantStyles[variant],
      sizeStyles[size],
      className,
    );

    const innerContent = (
      <>
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {leftIcon && <span className="shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="shrink-0">{rightIcon}</span>}
        </span>
      </>
    );

    if (as === "a" || props.href) {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={props.href}
          target={props.target}
          rel={props.rel}
          style={customStyle}
          className={commonClass}
          aria-disabled={disabled}
          role="button"
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {innerContent}
        </a>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        disabled={disabled}
        style={customStyle}
        className={commonClass}
        {...props}
      >
        {innerContent}
      </button>
    );
  },
);

CandyButton.displayName = "CandyButton";

export default CandyButton;
