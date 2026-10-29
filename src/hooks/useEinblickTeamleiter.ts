import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveVersion } from "@/hooks/useLiveData";
import { teamleiterKarte } from "@/lib/partnerstruktur";

/**
 * Teamleiter je Nutzer für die Bildreihe „Wer hat Einblick“ (29.10.2026).
 *
 * Aus dem Zwischenspeicher `user_settings` kommt die eigene Struktur nach
 * unten. Die Kette nach oben liefert `meine_teamkette()` (Migration
 * 20261029120000), nur als Kennungen; die Einstellungen der Upline mit ihren
 * Sätzen bleiben verborgen. Fehlt die Funktion noch, bleibt es beim Zwischenspeicher.
 */
export function useEinblickTeamleiter(selbstId: string | null | undefined): Map<string, string> {
  const version = useLiveVersion(["user_settings"]);
  const [kette, setKette] = useState<string[]>([]);
  useEffect(() => {
    if (!selbstId) return;
    let aktiv = true;
    void (supabase as unknown as { rpc: (f: string) => PromiseLike<{ data: unknown; error: unknown }> })
      .rpc("meine_teamkette")
      .then(({ data, error }) => {
        if (!aktiv || error || !Array.isArray(data)) return;
        setKette((data as { ebene: number; leiter_id: string }[]).sort((a, b) => a.ebene - b.ebene).map((z) => z.leiter_id));
      });
    return () => { aktiv = false; };
  }, [selbstId]);
  return useMemo(() => {
    const karte = teamleiterKarte();
    [selbstId, ...kette].forEach((id, i) => {
      const leiter = kette[i];
      if (id && leiter && !karte.has(id)) karte.set(id, leiter);
    });
    return karte;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, kette, selbstId]);
}
