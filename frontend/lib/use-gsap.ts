import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import gsap from "gsap";

export type ContextSafeFunc = <T extends (...args: never[]) => unknown>(func: T) => T;
export type ContextFunc = (
  context: gsap.Context,
  contextSafe?: ContextSafeFunc,
) => unknown;

export interface ReactRef {
  current: unknown;
}

export interface UseGSAPConfig {
  scope?: ReactRef | Element | string | null;
  dependencies?: readonly unknown[];
  revertOnUpdate?: boolean;
}

export interface UseGSAPReturn {
  context: gsap.Context;
  contextSafe: ContextSafeFunc;
}

let activeGsap = gsap;

const useIsomorphicLayoutEffect =
  typeof document !== "undefined" ? useLayoutEffect : useEffect;

const isConfig = (value: unknown): value is UseGSAPConfig =>
  Boolean(value && !Array.isArray(value) && typeof value === "object");

const emptyDependencies: readonly unknown[] = [];
const defaultConfig: UseGSAPConfig = {};

export function useGSAP(
  callbackOrConfig?: ContextFunc | UseGSAPConfig,
  dependenciesOrConfig: readonly unknown[] | UseGSAPConfig = emptyDependencies,
): UseGSAPReturn {
  let config = defaultConfig;
  let callback: ContextFunc | undefined;
  let dependencies: readonly unknown[] = emptyDependencies;

  if (isConfig(callbackOrConfig)) {
    config = callbackOrConfig;
    callback = undefined;
    dependencies = config.dependencies ?? emptyDependencies;
  } else {
    callback = callbackOrConfig;
    if (isConfig(dependenciesOrConfig)) {
      config = dependenciesOrConfig;
      dependencies = config.dependencies ?? emptyDependencies;
    } else if (Array.isArray(dependenciesOrConfig)) {
      dependencies = dependenciesOrConfig;
    }
  }

  const scopeRef = config.scope;
  const revertOnUpdate = Boolean(config.revertOnUpdate);

  const [context] = useState(() => activeGsap.context(() => { }));

  const contextSafe = useCallback<ContextSafeFunc>(
    <T extends (...args: never[]) => unknown>(func: T): T => {
      const wrapped = (context.add as (name: unknown, fn: unknown) => unknown)(
        null,
        func,
      );
      return wrapped as T;
    },
    [context],
  );

  useIsomorphicLayoutEffect(() => {
    const scopeElement =
      scopeRef && typeof scopeRef === "object" && "current" in scopeRef
        ? (scopeRef as { current: unknown }).current
        : scopeRef;
    if (callback) {
      context.add(
        callback,
        (scopeElement as Element | string | undefined) ?? undefined,
      );
    }
    return () => {
      if (revertOnUpdate || dependencies.length === 0) {
        context.revert();
      }
    };
  }, dependencies);

  useIsomorphicLayoutEffect(() => {
    return () => {
      context.revert();
    };
  }, [context]);

  return { context, contextSafe };
}

useGSAP.register = (core: typeof gsap) => {
  activeGsap = core;
};
useGSAP.headless = true;

export default useGSAP;
