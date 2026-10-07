import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AbwaegungVerteilung {
  wegId: string;
  anzahl: number;
}

/**
 * Anonyme Verteilung eines Abwägungsfalls im Team.
 *
 * Die Datenbankfunktion gibt nichts zurück, solange weniger als die geforderte
 * Zahl an Antworten vorliegt. Bei einem kleinen Team ließe sich sonst aus zwei
 * Antworten zurückrechnen, wer wie entschieden hat.
 */
export function useAbwaegungVerteilung(
  kapitelSlug: string,
  fallId: string,
  aktiv: boolean,
  mindestAntworten = 8,
) {
  const [verteilung, setVerteilung] = useState<AbwaegungVerteilung[] | null>(null);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    if (!aktiv) return;
    let abgebrochen = false;
    setLaedt(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("va_abwaegung_verteilung" as never, {
          p_kapitel_slug: kapitelSlug,
          p_fall_id: fallId,
          p_mindest: mindestAntworten,
        } as never);
        if (abgebrochen) return;
        if (error || !Array.isArray(data)) {
          setVerteilung(null);
        } else {
          setVerteilung(
            (data as { weg_id: string; anzahl: number }[]).map((r) => ({
              wegId: r.weg_id,
              anzahl: Number(r.anzahl),
            })),
          );
        }
      } catch {
        if (!abgebrochen) setVerteilung(null);
      } finally {
        if (!abgebrochen) setLaedt(false);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [kapitelSlug, fallId, aktiv, mindestAntworten]);

  const gesamt = (verteilung ?? []).reduce((n, v) => n + v.anzahl, 0);
  return { verteilung, gesamt, laedt };
}
