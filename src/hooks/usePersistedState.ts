import { useEffect, useRef, useState } from "react";

/**
 * useState mit Persistierung in localStorage.
 * Wert wird unter `key` gespeichert und beim Mount wiederhergestellt.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / serialization issues */
    }
  }, [key, value]);
  return [value, setValue] as const;
}