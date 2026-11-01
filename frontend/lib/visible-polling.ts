interface VisibilitySource extends EventTarget {
  readonly visibilityState: string;
}

export function pollWhileVisible(
  refresh: (signal: AbortSignal) => Promise<void>,
  onError: (error: unknown) => void,
  visibility: VisibilitySource,
  { interval = 15_000, immediate = true } = {},
): () => void {
  let stopped = false;
  let active = false;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (!stopped && visibility.visibilityState === "visible")
      timer = setTimeout(() => void tick(), interval);
  }

  async function tick() {
    if (stopped || active || visibility.visibilityState !== "visible") return;
    active = true;
    controller = new AbortController();
    try {
      await refresh(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) onError(error);
    } finally {
      active = false;
      schedule();
    }
  }

  function visibilityChanged() {
    clearTimeout(timer);
    if (visibility.visibilityState !== "visible") controller?.abort();
    else void tick();
  }

  visibility.addEventListener("visibilitychange", visibilityChanged);
  if (immediate) void tick();
  else schedule();

  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    visibility.removeEventListener("visibilitychange", visibilityChanged);
  };
}
