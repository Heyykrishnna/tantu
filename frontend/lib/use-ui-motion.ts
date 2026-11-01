"use client";

import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-reduce-motion"],
  });
  media.addEventListener("change", listener);
  document.addEventListener("visibilitychange", listener);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", listener);
    document.removeEventListener("visibilitychange", listener);
  };
}

function reduced() {
  return (
    document.documentElement.dataset.reduceMotion === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function paused() {
  return reduced() || document.visibilityState === "hidden";
}
function serverSnapshot() {
  return false;
}

export function useUiMotion() {
  return useSyncExternalStore(subscribe, reduced, serverSnapshot);
}
export function useDecorativeMotionPaused() {
  return useSyncExternalStore(subscribe, paused, serverSnapshot);
}
