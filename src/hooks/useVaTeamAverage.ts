import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Holt den anonymisierten Team-Durchschnittsfortschritt der Vertriebsakademie
 * (Prozent) sowie die Anzahl teilnehmender Nutzer.
 * Individuelle Werte werden serverseitig NICHT ausgeliefert.
 */
export function useVaTeamAverage() {
  const [avg, setAvg] = useState<number | null>(null);
  const [usersCount, setUsersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("va_team_average" as any);
        if (cancelled) return;
        if (error || !data) {
          setAvg(null);
          setUsersCount(0);
        } else {
          const row = Array.isArray(data) ? data[0] : (data as any);
          setAvg(row?.team_avg_pct ?? 0);
          setUsersCount(row?.users_count ?? 0);
        }
      } catch {
        if (!cancelled) { setAvg(null); setUsersCount(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { avg, usersCount, loading };
}
