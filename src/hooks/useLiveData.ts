import { useState, useEffect, useCallback, useRef } from "react";
import { cacheGet, onCacheChange } from "@/lib/dataCache";

/**
 * React hook that provides live-updating data from the cache.
 * Re-renders automatically when the specified table(s) change via Realtime.
 * 
 * @param table - Table name or array of table names to watch
 * @param filter - Optional filter function to narrow results
 * @returns Live data array that updates automatically
 */
export function useLiveData<T = any>(
  table: string,
  filter?: (row: T) => boolean
): T[] {
  const [version, setVersion] = useState(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    const unsub = onCacheChange((changedTable, _event, _row) => {
      if (changedTable === table) {
        setVersion(v => v + 1);
      }
    });
    return unsub;
  }, [table]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = cacheGet<T>(table);
  return filterRef.current ? data.filter(filterRef.current) : data;
}

/**
 * Watch multiple tables and trigger re-render when any changes.
 * Returns a version counter; use it in dependency arrays.
 */
export function useLiveVersion(tables: string[]): number {
  const [version, setVersion] = useState(0);
  // Ohne Liste hat der Hook vorher die ganze Seite mit einem TypeError
  // abgeschossen. Eine fehlende Angabe darf höchstens bedeuten, dass nicht
  // aktualisiert wird, nicht dass nichts mehr lädt.
  const liste = Array.isArray(tables) ? tables : [];

  useEffect(() => {
    const unsub = onCacheChange((changedTable) => {
      if (liste.includes(changedTable)) {
        setVersion(v => v + 1);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste.join(",")]);

  return version;
}

/**
 * Hook that provides a single row by ID with live updates.
 */
export function useLiveRow<T = any>(table: string, id: string | undefined): T | undefined {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const unsub = onCacheChange((changedTable, _event, row) => {
      if (changedTable === table && row?.id === id) {
        setVersion(v => v + 1);
      }
    });
    return unsub;
  }, [table, id]);

  if (!id) return undefined;
  const data = cacheGet<T>(table);
  return data.find((r: any) => r.id === id);
}
