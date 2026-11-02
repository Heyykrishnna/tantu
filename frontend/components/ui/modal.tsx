"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { CandyButton } from "./candy-button";
import { usePanelVisible } from "./retained-panel";
import { useUiMotion } from "../../lib/use-ui-motion";
import { cn } from "../../lib/utils";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  busy = false,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  busy?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  const busyRef = useRef(busy);
  const titleId = useId();
  const descriptionId = useId();
  const visible = usePanelVisible();
  const reduced = useUiMotion();
  const active = open && visible;
  useEffect(() => {
    close.current = onClose;
    busyRef.current = busy;
  }, [onClose, busy]);
  useEffect(() => {
    const element = dialog.current;
    if (!element || !active) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    if (!element.open) element.showModal();
    document.body.style.overflow = "hidden";
    const initial = element.querySelector<HTMLElement>(
      'input:not([type="hidden"]), [role="combobox"], textarea, button[type="submit"]',
    );
    initial?.focus();
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!busyRef.current) close.current();
    };
    const closed = () => close.current();
    element.addEventListener("cancel", cancel);
    element.addEventListener("close", closed);
    return () => {
      element.removeEventListener("cancel", cancel);
      element.removeEventListener("close", closed);
      if (element.open) element.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [active]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={busy}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.target === event.currentTarget &&
          !busy &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          onClose();
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-xl overflow-visible border-0 bg-transparent p-0 text-zinc-900 backdrop:bg-zinc-950/45 backdrop:backdrop-blur-sm dark:text-zinc-100",
        className,
      )}
    >
      {active && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 380, damping: 34 }
          }
          className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-[#141416]"
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 sm:px-6 dark:border-zinc-800">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="font-[family-name:var(--font-poppins)] text-base font-semibold tracking-tight"
              >
                {title}
              </h2>
              {description && (
                <p
                  id={descriptionId}
                  className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"
                >
                  {description}
                </p>
              )}
            </div>
            <CandyButton
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Close ${title}`}
              onClick={onClose}
              className="size-8 shrink-0 rounded-lg"
            >
              <X className="size-4" />
            </CandyButton>
          </header>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
            {children}
          </div>
        </motion.div>
      )}
    </dialog>
  );
}
