"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useUiMotion } from "../../lib/use-ui-motion";

const PanelVisibility = createContext(true);

export function usePanelVisible() {
  return useContext(PanelVisibility);
}

export function RetainedPanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  const parentVisible = usePanelVisible();
  const reduced = useUiMotion();
  if (active && !visited) setVisited(true);
  if (!visited) return null;
  return (
    <PanelVisibility value={active && parentVisible}>
      <div hidden={!active} inert={!active} className="min-w-0">
        <motion.div
          initial={false}
          animate={{ opacity: active ? 1 : 0, y: active ? 0 : 4 }}
          transition={
            reduced || !active
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.16 },
                  y: { type: "spring", stiffness: 380, damping: 34 },
                }
          }
          className="min-w-0 space-y-6"
        >
          {children}
        </motion.div>
      </div>
    </PanelVisibility>
  );
}
