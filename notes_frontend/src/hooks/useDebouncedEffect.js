import { useEffect } from "react";

// PUBLIC_INTERFACE
export function useDebouncedEffect(effect, deps, delayMs) {
  /**
   * Runs the provided effect after a debounce delay when deps change.
   * Intended for autosave behaviors.
   */
  useEffect(() => {
    const handle = setTimeout(() => {
      effect();
    }, delayMs);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delayMs]);
}
