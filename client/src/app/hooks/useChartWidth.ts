import { useEffect, useRef, useState } from "react";

/**
 * Measures a container div's width via ResizeObserver and returns
 * [ref, width]. The chart is only rendered when width > 0, so
 * Recharts never sees the zero-width initial pass that triggers
 * the internal duplicate-key warning inside Surface.
 */
export function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set initial size synchronously before paint
    setWidth(el.getBoundingClientRect().width);

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}
