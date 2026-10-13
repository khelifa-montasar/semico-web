import { useEffect, useState } from "react";

/**
 * Delays a rapidly-changing value.
 *
 * Used for the rainfall slider: it fires on every pointer step, and passing each value straight
 * into a query key would issue dozens of requests for one drag. The slider itself reads the live
 * value, so the UI stays instant while only the settled value reaches the server.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
