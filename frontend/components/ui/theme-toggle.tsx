"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { useUiMotion } from "@/lib/use-ui-motion";
import { applyTheme as applyDocumentTheme } from "@/lib/theme";

export type TransitionVariant =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "hexagon"
  | "rectangle"
  | "star";

export interface ThemeToggleProps extends React.ComponentPropsWithoutRef<"button"> {
  duration?: number;
  variant?: TransitionVariant;
  fromCenter?: boolean;
  candy?: boolean;
  theme?: "light" | "dark";
  onThemeChange?: (theme: "light" | "dark") => void | Promise<void>;
}

function polygonCollapsed(point: string, vertexCount: number): string {
  const pairs = Array.from({ length: vertexCount }, () => point).join(", ");
  return `polygon(${pairs})`;
}

function getThemeTransitionClipPaths(
  variant: TransitionVariant,
  cx: number,
  cy: number,
  maxRadius: number,
  viewportWidth: number,
  viewportHeight: number,
): [string, string] {
  const toX = (x: number) => `${(x / viewportWidth) * 100}%`;
  const toY = (y: number) => `${(y / viewportHeight) * 100}%`;
  const point = (x: number, y: number) => `${toX(x)} ${toY(y)}`;
  const cxPx = Math.round(cx);
  const cyPx = Math.round(cy);
  const rPx = Math.ceil(maxRadius * 1.12);

  switch (variant) {
    case "circle":
      return [
        `circle(0px at ${cxPx}px ${cyPx}px)`,
        `circle(${rPx}px at ${cxPx}px ${cyPx}px)`,
      ];
    case "square": {
      const halfW = Math.max(cx, viewportWidth - cx);
      const halfH = Math.max(cy, viewportHeight - cy);
      const halfSide = Math.max(halfW, halfH) * 1.05;
      const end = [
        point(cx - halfSide, cy - halfSide),
        point(cx + halfSide, cy - halfSide),
        point(cx + halfSide, cy + halfSide),
        point(cx - halfSide, cy + halfSide),
      ].join(", ");
      return [polygonCollapsed(point(cx, cy), 4), `polygon(${end})`];
    }
    case "rectangle": {
      const w = Math.max(cx, viewportWidth - cx) * 1.05;
      const h = Math.max(cy, viewportHeight - cy) * 1.05;
      const end = [
        point(cx - w, cy - h),
        point(cx + w, cy - h),
        point(cx + w, cy + h),
        point(cx - w, cy + h),
      ].join(", ");
      return [polygonCollapsed(point(cx, cy), 4), `polygon(${end})`];
    }
    case "triangle": {
      const R = maxRadius * 1.5;
      const start = [point(cx, cy), point(cx, cy), point(cx, cy)].join(", ");
      const end = [
        point(cx, cy - R),
        point(cx + R * Math.cos(Math.PI / 6), cy + R * Math.sin(Math.PI / 6)),
        point(cx - R * Math.cos(Math.PI / 6), cy + R * Math.sin(Math.PI / 6)),
      ].join(", ");
      return [`polygon(${start})`, `polygon(${end})`];
    }
    case "diamond": {
      const R = maxRadius * 1.1;
      const end = [
        point(cx, cy - R),
        point(cx + R, cy),
        point(cx, cy + R),
        point(cx - R, cy),
      ].join(", ");
      return [polygonCollapsed(point(cx, cy), 4), `polygon(${end})`];
    }
    case "hexagon": {
      const R = maxRadius * 1.1;
      const verts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        verts.push(point(cx + R * Math.cos(a), cy + R * Math.sin(a)));
      }
      return [
        polygonCollapsed(point(cx, cy), 6),
        `polygon(${verts.join(", ")})`,
      ];
    }
    case "star": {
      const R = maxRadius * 1.25;
      const innerRatio = 0.42;
      const starPolygon = (radius: number) => {
        const verts: string[] = [];
        for (let i = 0; i < 5; i++) {
          const outerA = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const innerA = outerA + Math.PI / 5;
          verts.push(
            point(
              cx + radius * Math.cos(outerA),
              cy + radius * Math.sin(outerA),
            ),
          );
          verts.push(
            point(
              cx + radius * innerRatio * Math.cos(innerA),
              cy + radius * innerRatio * Math.sin(innerA),
            ),
          );
        }
        return `polygon(${verts.join(", ")})`;
      };
      const startR = Math.max(2, R * 0.025);
      return [starPolygon(startR), starPolygon(R)];
    }
    default:
      return [
        `circle(0px at ${cxPx}px ${cyPx}px)`,
        `circle(${rPx}px at ${cxPx}px ${cyPx}px)`,
      ];
  }
}

export const ThemeToggle = ({
  className,
  duration = 450,
  variant,
  fromCenter = false,
  candy = false,
  theme,
  onThemeChange,
  ...props
}: ThemeToggleProps) => {
  const reducedMotion = useUiMotion();
  const [saving, setSaving] = useState(false);
  const shape = variant ?? "circle";
  const isControlled = theme !== undefined;
  const [internalIsDark, setInternalIsDark] = useState(true);
  const [preferenceUnavailable, setPreferenceUnavailable] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const isDark = isControlled ? theme === "dark" : internalIsDark;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isTransitioningRef = useRef(false);
  const activeAnimRef = useRef<Animation | null>(null);

  const cancelAnim = useCallback(() => {
    activeAnimRef.current?.cancel();
    activeAnimRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cancelAnim();
      const root = document.documentElement;
      if (root.dataset.magicuiThemeVt !== "active") return;
      delete root.dataset.magicuiThemeVt;
      root.style.removeProperty("--magicui-theme-toggle-vt-duration");
      root.style.removeProperty("--magicui-theme-vt-clip-from");
    };
  }, [cancelAnim]);

  useEffect(() => {
    if (isControlled) return;

    const updateTheme = () => {
      setInternalIsDark(document.documentElement.dataset.theme !== "light");
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "tantu-theme") {
        applyDocumentTheme(e.newValue === "light" ? "light" : "dark");
        updateTheme();
      }
    };

    const handleThemeChange = () => {
      updateTheme();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("theme-change", handleThemeChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("theme-change", handleThemeChange);
    };
  }, [isControlled]);

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current;
    if (
      !button ||
      isTransitioningRef.current ||
      document.documentElement.dataset.magicuiThemeVt === "active"
    )
      return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let cx: number;
    let cy: number;

    if (fromCenter) {
      cx = viewportWidth / 2;
      cy = viewportHeight / 2;
    } else {
      const rect = button.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    }

    const maxRadius = Math.hypot(
      Math.max(cx, viewportWidth - cx),
      Math.max(cy, viewportHeight - cy),
    );

    const clipPath = getThemeTransitionClipPaths(
      shape,
      cx,
      cy,
      maxRadius,
      viewportWidth,
      viewportHeight,
    );

    const applyTheme = () => {
      const nextIsDark = document.documentElement.dataset.theme === "light";
      applyDocumentTheme(nextIsDark ? "dark" : "light");
      if (onThemeChange) {
        setSaving(true);
        Promise.resolve(onThemeChange(nextIsDark ? "dark" : "light"))
          .catch(() => setPreferenceUnavailable(true))
          .finally(() => setSaving(false));
      }
      if (!isControlled) setInternalIsDark(nextIsDark);
      try {
        localStorage.setItem("tantu-theme", nextIsDark ? "dark" : "light");
        setPreferenceUnavailable(false);
      } catch {
        setPreferenceUnavailable(true);
      }
      window.dispatchEvent(
        new CustomEvent("theme-change", {
          detail: { theme: nextIsDark ? "dark" : "light" },
        }),
      );
    };

    if (
      typeof document === "undefined" ||
      !("startViewTransition" in document) ||
      typeof document.startViewTransition !== "function" ||
      reducedMotion
    ) {
      applyTheme();
      return;
    }

    const canAnimatePseudo = (() => {
      try {
        const test = document.documentElement.animate(
          { opacity: [1, 1] },
          { duration: 1, pseudoElement: "::view-transition-new(root)" },
        );
        test.cancel();
        return true;
      } catch {
        return false;
      }
    })();

    if (!canAnimatePseudo) {
      try {
        document.startViewTransition(() => {
          flushSync(applyTheme);
        });
      } catch {
        applyTheme();
      }
      return;
    }

    cancelAnim();

    const root = document.documentElement;
    root.dataset.magicuiThemeVt = "active";
    root.style.setProperty(
      "--magicui-theme-toggle-vt-duration",
      `${duration}ms`,
    );
    root.style.setProperty("--magicui-theme-vt-clip-from", clipPath[0]);

    let safetyTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = undefined;
      }
      isTransitioningRef.current = false;
      setTransitioning(false);
      delete root.dataset.magicuiThemeVt;
      root.style.removeProperty("--magicui-theme-toggle-vt-duration");
      root.style.removeProperty("--magicui-theme-vt-clip-from");
      cancelAnim();
    };

    isTransitioningRef.current = true;
    setTransitioning(true);
    safetyTimer = setTimeout(cleanup, duration + 250);

    let transition: ViewTransition | undefined;
    try {
      transition = document.startViewTransition(() => {
        flushSync(applyTheme);
      });
    } catch {
      cleanup();
      applyTheme();
      return;
    }

    if (typeof transition?.finished?.finally === "function") {
      transition.finished.finally(cleanup).catch(() => {
        cleanup();
      });
    } else {
      cleanup();
    }

    const ready = transition?.ready;
    if (ready && typeof ready.then === "function") {
      ready
        .then(() => {
          const anim = document.documentElement.animate(
            {
              clipPath,
            },
            {
              duration,
              easing: shape === "star" ? "linear" : "ease-in-out",
              fill: "forwards",
              pseudoElement: "::view-transition-new(root)",
            },
          );
          activeAnimRef.current = anim;
        })
        .catch(() => {});
    }
  }, [shape, fromCenter, duration, isControlled, onThemeChange, cancelAnim, reducedMotion]);

  const candyClasses = candy
    ? "relative inline-flex items-center justify-center font-medium leading-none tracking-[0.01em] select-none overflow-hidden cursor-pointer transition-all duration-200 ease-out active:scale-[0.98] active:brightness-95 hover:brightness-105 bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-800 dark:border-zinc-200 shadow-xs"
    : "";

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={toggleTheme}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:focus-visible:ring-zinc-300",
        className,
        candyClasses,
      )}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      {...props}
      disabled={transitioning || saving || props.disabled}
      aria-busy={saving}
    >
      {preferenceUnavailable && <span role="status" className="sr-only">Theme applied for this tab. Preference synchronization is unavailable.</span>}
      <span className="relative z-10 flex items-center justify-center">
        {isDark ? (
          <Sun
            className={cn(
              "h-4 w-4 transition-transform duration-300 hover:rotate-45",
              candy
                ? "text-zinc-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                : "text-foreground",
            )}
          />
        ) : (
          <Moon
            className={cn(
              "h-4 w-4 transition-transform duration-300 hover:-rotate-12",
              candy
                ? "text-zinc-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                : "text-foreground",
            )}
          />
        )}
      </span>
    </button>
  );
};

export const AnimatedThemeToggler = ThemeToggle;
export default ThemeToggle;
