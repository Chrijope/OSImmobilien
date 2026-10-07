/**
 * Der Datenzugriff der persönlichen Bewerberseite.
 *
 * Getrennt von der Seite selbst, wie `bewerberTerminStore.ts` neben dem
 * Kennenlernen: Die Seite kennt keine Datenbank, sie kennt diese vier
 * Funktionen. Die Rechenlogik liegt wiederum daneben in `bewerberSeite.ts` und
 * ist ohne Netz prüfbar.
 *
 * **Warum hier direkt auf Supabase zugegriffen wird.** Der Bewerber hat kein
 * Konto und kann `dataCache` nicht füllen; er hat nur sein Token. Gelesen wird
 * deshalb über die Datenbankfunktion `get_bewerber_seite`, geschrieben über die
 * Edge Function `bewerber-seite`, beide mit dem Token als einzigem Ausweis.
 * Direkten Tabellenzugriff hat `anon` nirgends.
 *
 * **Nichts hier wirft.** Solange die Migration nicht gelaufen ist, gibt es
 * `get_bewerber_seite` nicht. Dann kommt `null` zurück und die Seite meldet
 * einen unbekannten Link, statt mit einem technischen Fehler stehen zu
 * bleiben.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  leseStand,
  type BewerberSeiteStand,
  type PausenWahl,
  type SeitenAktion,
} from "@/lib/bewerberSeite";

/** Fehlt die Datenbankfunktion noch? Dann ist die Migration nicht gelaufen. */
function funktionFehlt(fehler: { code?: string; message?: string } | null): boolean {
  if (!fehler) return false;
  if (fehler.code === "42883" || fehler.code === "PGRST202") return true;
  return /could not find the function|does not exist|schema cache/i.test(fehler.message || "");
}

/** Den Stand eines Bewerbers zu seinem Token holen. `null` heißt unbekannt. */
export async function ladeBewerberSeite(token: string): Promise<BewerberSeiteStand | null> {
  if (!token) return null;
  const { data, error } = await supabase.rpc("get_bewerber_seite" as never, { _token: token } as never);
  if (error) {
    if (!funktionFehlt(error)) console.error("ladeBewerberSeite:", error);
    return null;
  }
  return leseStand(data);
}

/** Was der Bewerber auslösen kann, samt der beiden freien Angaben. */
export interface SeitenAktionAnfrage {
  token: string;
  aktion: SeitenAktion;
  /** Die Frage beziehungsweise der freiwillige Grund beim Ausstieg. */
  text?: string;
  /** Nur bei der Pause: eine Woche, ein Monat oder gar keine Erinnerung. */
  wahl?: PausenWahl;
}

/**
 * Eine Aktion an den Server melden.
 *
 * Gibt `true` zurück, wenn sie angekommen ist. Der Bildschirm wechselt erst
 * danach: Ein Wechsel ohne Rückmeldung wäre genau der alte Fehler, bei dem der
 * Bewerber „wir warten“ las und die Erinnerungskette weiterlief.
 */
export async function meldeBewerberSeitenAktion(anfrage: SeitenAktionAnfrage): Promise<boolean> {
  if (!anfrage.token) return false;
  try {
    const { data, error } = await supabase.functions.invoke("bewerber-seite", {
      body: {
        token: anfrage.token,
        aktion: anfrage.aktion,
        // Der Honigtopf ist auf der Seite unsichtbar und hier immer leer. Er
        // steht trotzdem im Aufruf, damit die Function nur einen Weg kennt.
        hp: "",
        ...(anfrage.text !== undefined ? { text: anfrage.text } : {}),
        ...(anfrage.wahl !== undefined ? { wahl: anfrage.wahl } : {}),
      },
    });
    if (error) throw error;
    const antwort = data as { error?: string } | null;
    if (antwort?.error) throw new Error(antwort.error);
    return true;
  } catch (e) {
    console.error("meldeBewerberSeitenAktion:", e);
    return false;
  }
}
