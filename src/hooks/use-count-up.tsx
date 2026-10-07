import { useEffect, useRef, useState } from "react";

interface UseCountUpOptions {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}

export function useCountUp({ end, duration = 2000, prefix = "", suffix = "" }: UseCountUpOptions) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // PDF-Export: sofortiges Finalisieren, damit alle Zahlen im Snapshot
  // ihren Endwert zeigen (statt 0 oder Zwischenschritt).
  useEffect(() => {
    // Falls beim Mounten bereits ein PDF-Export läuft → sofort finalisieren.
    if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-pdf-freezing")) {
      setHasStarted(true);
      setCount(end);
    }
    const finalize = () => setCount(end);
    window.addEventListener("pdf:finalize-all", finalize);
    return () => window.removeEventListener("pdf:finalize-all", finalize);
  }, [end]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) {
          setHasStarted(true);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;

    const startTime = performance.now();
    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };

    requestAnimationFrame(step);
  }, [hasStarted, end, duration]);

  const display = `${prefix}${count.toLocaleString("de-DE")}${suffix}`;

  return { ref, display };
}
