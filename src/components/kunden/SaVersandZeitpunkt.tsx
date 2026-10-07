import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Seit wann auf die Unterschrift der Selbstauskunft gewartet wird.
 *
 * Die Angabe kommt aus `signature_requests.created_at`, nicht aus dem Merkmal
 * am Investment. Der Grund: Das Merkmal `saSignatureSentAt` wird erst seit
 * Kurzem gesetzt, bei allen vorher versendeten Selbstauskünften fehlt es.
 * Genau deshalb blieb die Zeile bei Kai Laube leer, obwohl seine Anfrage
 * längst hinausgegangen war.
 *
 * Die Tabelle dagegen führt jede Anfrage seit jeher mit Zeitstempel. Sie ist
 * damit auch die ehrlichere Quelle: Sie sagt, wann tatsächlich eine Anfrage
 * entstanden ist, und nicht, wann jemand ein Merkmal gesetzt hat.
 *
 * Bei mehreren Anfragen zählt die jüngste, denn nach einem erneuten Versand
 * wartet man seit diesem und nicht seit dem ersten.
 */
export function SaVersandZeitpunkt({
  kontaktId,
  investmentId,
  /** Aus dem Investment, als Rückfall wenn die Tabelle nichts hergibt. */
  ausMeta,
}: {
  kontaktId: string;
  investmentId: string;
  ausMeta?: string;
}) {
  const [zeitpunkt, setZeitpunkt] = useState<string | null>(ausMeta || null);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("signature_requests")
          .select("created_at")
          .eq("kontakt_id", kontaktId)
          .eq("investment_id", investmentId)
          // Nur Selbstauskünfte. In derselben Tabelle liegen auch
          // Reservierungsvereinbarungen und Verträge.
          .in("person_type", ["person1", "person2"])
          .order("created_at", { ascending: false })
          .limit(1);
        if (abgebrochen || error) return;
        const neueste = data?.[0]?.created_at;
        if (neueste) setZeitpunkt(neueste);
      } catch {
        /* Rückfall bleibt der Wert aus dem Investment. */
      }
    })();
    return () => { abgebrochen = true; };
  }, [kontaktId, investmentId]);

  if (!zeitpunkt) return null;
  const d = new Date(zeitpunkt);
  if (isNaN(d.getTime())) return null;

  const text = d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <p className="mt-0.5 text-[11px] text-muted-foreground">
      Zur Unterschrift versendet am {text} Uhr
    </p>
  );
}
