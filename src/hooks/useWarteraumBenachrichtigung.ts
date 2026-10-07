import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hinweis im CRM, wenn jemand im Warteraum eines eigenen Videoraums wartet.
 *
 * Der Gastgeber verschickt den Raumlink oft lange vor dem Termin und arbeitet
 * bis dahin ganz woanders im CRM. Oeffnet der Kunde den Link zu frueh, sass er
 * bisher unbemerkt im Warteraum. Jetzt kommt ein Toast mit Knopf zum Raum,
 * aber nur, wenn der Gastgeber gerade NICHT auf der Raumseite ist: Dort sieht
 * er die Warteliste ohnehin.
 *
 * Bewusst leichtgewichtig: ein Realtime-Abo auf die Teilnehmertabelle (die
 * RLS laesst nur die eigenen Raeume durch) als Ausloeser, dazu ein langsamer
 * Takt als Notnagel. Je Wartendem gibt es hoechstens eine Meldung, auch wenn
 * er mehrfach neu laedt.
 */

const db = supabase as unknown as {
  from: (tabelle: string) => {
    select: (spalten: string) => {
      eq: (spalte: string, wert: string) => {
        neq: (spalte: string, wert: string) => Promise<{ data: unknown; error: unknown }>;
      };
      in: (spalte: string, werte: string[]) => {
        eq: (spalte: string, wert: string) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
};

export function useWarteraumBenachrichtigung(userRole?: string, userId?: string) {
  const { darf: freigabe } = useVideocallFreigabe();
  const navigate = useNavigate();
  const location = useLocation();

  // Der Pruefer laeuft aus Abo und Takt heraus und braucht den aktuellen
  // Pfad, nicht den vom Einhaengen. Sonst meldete er den Warteraum der
  // Seite, auf der man laengst nicht mehr ist.
  const pfadRef = useRef(location.pathname);
  pfadRef.current = location.pathname;
  // Je Wartendem hoechstens eine Meldung, solange die Sitzung lebt.
  const gemeldet = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Der Videoraum ist bisher fuer Admin und Inhaber freigegeben, alle
    // anderen koennen keine Raeume besitzen.
    // admin/inhaber sofort, einzeln Freigeschaltete sobald die Freigabe
    // geladen ist (der Hook liefert fuer sie erst false, dann true).
    if (!userId || !freigabe) return;

    let aktiv = true;
    let prueft = false;

    const pruefe = async () => {
      if (!aktiv || prueft) return;
      prueft = true;
      try {
        const { data: raeumeRoh, error: raumFehler } = await db
          .from("videoraeume")
          .select("id, titel")
          .eq("gastgeber_id", userId)
          .neq("status", "beendet");
        if (raumFehler || !aktiv) return;
        const raeume = (raeumeRoh ?? []) as Array<{ id: string; titel: string | null }>;
        if (raeume.length === 0) return;

        const { data: wartendeRoh, error: warteFehler } = await db
          .from("videoraum_teilnehmer")
          .select("id, raum_id, name")
          .in("raum_id", raeume.map((r) => r.id))
          .eq("status", "wartet");
        if (warteFehler || !aktiv) return;
        const wartende = (wartendeRoh ?? []) as Array<{ id: string; raum_id: string; name: string }>;

        for (const w of wartende) {
          if (gemeldet.current.has(w.id)) continue;
          gemeldet.current.add(w.id);
          // Auf der Raumseite zeigt die Warteliste den Gast selbst. Der
          // Eintrag gilt trotzdem als gemeldet, sonst kaeme der Toast beim
          // naechsten Seitenwechsel nachtraeglich.
          if (pfadRef.current === `/videocall/raum/${w.raum_id}`) continue;
          const raum = raeume.find((r) => r.id === w.raum_id);
          toast.info(`${w.name} wartet im Warteraum${raum?.titel ? ` von „${raum.titel}"` : ""}.`, {
            duration: 15000,
            action: {
              label: "Zum Raum",
              onClick: () => navigate(`/videocall/raum/${w.raum_id}`),
            },
          });
        }
      } finally {
        prueft = false;
      }
    };

    void pruefe();

    // Realtime als Ausloeser. Die Nutzdaten sind egal, geprueft wird immer
    // per Abfrage: Die RLS filtert dort verlaesslich auf die eigenen Raeume.
    const kanal = supabase
      .channel(`warteraum-hinweis-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videoraum_teilnehmer" },
        () => { void pruefe(); },
      )
      .subscribe();

    // Notnagel, falls Realtime klemmt. Bewusst traege, es geht nur darum,
    // dass niemand eine Viertelstunde unbemerkt wartet.
    const takt = window.setInterval(() => { void pruefe(); }, 60000);

    return () => {
      aktiv = false;
      window.clearInterval(takt);
      void supabase.removeChannel(kanal);
    };
  }, [userId, userRole, freigabe, navigate]);
}
