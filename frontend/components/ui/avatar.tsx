"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ImageLoadingStatus = "idle" | "loading" | "loaded" | "error";

interface AvatarContextValue {
  status: ImageLoadingStatus;
  setStatus: React.Dispatch<React.SetStateAction<ImageLoadingStatus>>;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

export const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const [status, setStatus] = React.useState<ImageLoadingStatus>("idle");

  return (
    <AvatarContext.Provider value={{ status, setStatus }}>
      <div
        ref={ref}
        className={cn(
          "relative flex size-10 shrink-0 overflow-hidden rounded-full",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AvatarContext.Provider>
  );
});
Avatar.displayName = "Avatar";

export const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, src, alt = "", onLoad, onError, ...props }, ref) => {
  const context = React.useContext(AvatarContext);

  React.useEffect(() => {
    if (!src) {
      context?.setStatus("error");
    } else {
      context?.setStatus("loading");
    }
  }, [src, context]);

  const handleLoad = React.useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      context?.setStatus("loaded");
      onLoad?.(event);
    },
    [context, onLoad],
  );

  const handleError = React.useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      context?.setStatus("error");
      onError?.(event);
    },
    [context, onError],
  );

  if (!src || context?.status === "error") {
    return null;
  }

  return React.createElement("img", {
    ref,
    src,
    alt,
    onLoad: handleLoad,
    onError: handleError,
    className: cn("aspect-square size-full object-cover", className),
    ...props,
  });
});
AvatarImage.displayName = "AvatarImage";

export const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(AvatarContext);

  if (context?.status === "loaded") {
    return null;
  }

  return (
    <span
      ref={ref}
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
});
AvatarFallback.displayName = "AvatarFallback";
