"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { useUiMotion } from "../../lib/use-ui-motion";

export default function MotionBoundary({ children }: { children: ReactNode }) {
  const reduced = useUiMotion();
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}
