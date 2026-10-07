/**
 * Der Datenzugriff für den Ereignisverlauf eines einzelnen Bewerbers.
 *
 * Getrennt von `bewerberEreignisse.ts`: Dort wird nur gerechnet, hier wird nur
 * gefragt. So bleibt die Zusammenführung prüfbar, ohne dass ein Test eine
 * Datenbank braucht.
 *
 * Warum nicht `ladeMailOeffnungen` aus `bewerberMailTracking.ts`? Die Funktion
 * fasst die Zeilen zu einem Stand zusammen (wie viele gesendet, wie viele
 * geöffnet) und kennt `clicked_at` gar nicht. Der Verlauf braucht das
 * Gegenteil: jede Zeile einzeln, mit Öffnungs- **und** Klickzeit. Dieselbe
 * Abfrage steht seit langem im Closing (`ClosingTab.tsx`), sie ist hier nur an
 * die Stelle gerückt, an die sie nach CLAUDE.md gehört.
 *
 * Nachsichtig wie die Nachbarn: Fehlt die Tabelle, das Recht oder eine Spalte,
 * bleibt die Liste leer und der Verlauf zeigt eben nur, was am Bewerber selbst
 * steht. Eine Nebenanzeige darf die Akte nicht zerlegen.
 */
import { supabase } from "@/integrations/supabase/client";
import type { MailVerlaufZeile } from "./bewerberEreignisse";

export async function ladeMailVerlauf(bewerberId: string): Promise<MailVerlaufZeile[]> {
  if (!bewerberId) return [];
  try {
    const { data, error } = await supabase
      .from("bewerber_mail_tracking")
      .select("token, kind, paket_titel, sent_at, opened_at, clicked_at, tracked")
      .eq("bewerber_id", bewerberId)
      .order("sent_at", { ascending: false });
    if (error || !data) {
      if (error) console.error("ladeMailVerlauf:", error);
      return [];
    }
    return data as unknown as MailVerlaufZeile[];
  } catch (e) {
    console.error("ladeMailVerlauf:", e);
    return [];
  }
}
