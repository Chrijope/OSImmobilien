import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Überwacht die Anzahl aktiver Supabase-Realtime-Channels im Browser-Tab.
 * Loggt bei > WARN_THRESHOLD eine Warnung — hilft beim Aufspüren von
 * Channel-Leaks (vergessene `.unsubscribe()`).
 *
 * Nutzung: einmal im Root-Layout aufrufen, z. B. in `DashboardLayout`.
 */
export function useRealtimeChannelMonitor(options?: {
  intervalMs?: number;
  warnThreshold?: number;
}) {
  const intervalMs = options?.intervalMs ?? 30_000;
  const warnThreshold = options?.warnThreshold ?? 80;
  const warnedRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      try {
        const channels = supabase.getChannels?.() ?? [];
        const count = channels.length;
        if (count > warnThreshold && !warnedRef.current) {
          console.warn(
            `[realtime] Aktive Channels: ${count} (Schwelle ${warnThreshold}). ` +
              `Mögliches Leak — bitte prüfen, ob alle Listener mit .unsubscribe() ` +
              `bzw. supabase.removeChannel(ch) sauber abgemeldet werden.`,
            channels.map((c: any) => c.topic),
          );
          warnedRef.current = true;
        } else if (count <= warnThreshold * 0.6) {
          warnedRef.current = false;
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, warnThreshold]);
}