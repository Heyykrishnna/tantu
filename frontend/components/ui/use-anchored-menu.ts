"use client";

import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

export function useAnchoredMenu(
  open: boolean,
  trigger: RefObject<HTMLButtonElement | null>,
  optionCount: number,
) {
  const [placement, setPlacement] = useState<{
    target: HTMLElement;
    left: number;
    top: number;
    bottom: number;
    width: number;
    maxHeight: number;
    above: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const button = trigger.current;
    if (!open || !button) return;
    let frame = 0;
    let stopped = false;
    const target = button.closest("dialog") ?? document.body;
    function update() {
      if (stopped || !button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const preferredHeight = Math.min(
        300,
        Math.max(56, optionCount * 36 + 12),
      );
      const placeAbove = below < preferredHeight && above > below;
      const maxHeight = Math.max(48, Math.min(300, placeAbove ? above : below));
      const next = {
        target,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: rect.bottom + 6,
        bottom: window.innerHeight - rect.top + 6,
        width,
        maxHeight,
        above: placeAbove,
      };
      setPlacement((current) =>
        current &&
        current.target === next.target &&
        current.above === next.above &&
        current.width === next.width &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5 &&
        Math.abs(current.bottom - next.bottom) < 0.5 &&
        Math.abs(current.maxHeight - next.maxHeight) < 0.5
          ? current
          : next,
      );
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    update();
    const started = performance.now();
    function settle() {
      update();
      if (!stopped && performance.now() - started < 400)
        frame = requestAnimationFrame(settle);
    }
    frame = requestAnimationFrame(settle);
    const observer = new ResizeObserver(schedule);
    observer.observe(button);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open, trigger, optionCount]);
  return placement;
}
