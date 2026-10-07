import { supabase } from "@/integrations/supabase/client";
import { cacheReload } from "./dataCache";

/**
 * Die Freigabe einer Unterlage für Kunden umschalten (Dokumenten-Ampel).
 *
 * Geschrieben wird ausschließlich über die Datenbankfunktion
 * `setze_kunden_freigabe` (Migration 20260923170000). Sie lässt nur zu, wer
 * `darf_dokument_freigeben` besteht (Admin, Inhaber und die eingestellten
 * Rollen, siehe `dokumentFreigabeRollen.ts`), und ein Auslöser schützt die
 * Spalten gegen jeden anderen Weg. Ein ausgeblendeter Schalter wäre keine
 * Zugriffskontrolle.
 */

export type FreigabeTabelle = "objekt_dokumente" | "wohnungs_dokumente";

export const FREIGABE_MIGRATION = "20260923170000_dokument_kundenfreigabe";

export type FreigabeErgebnis =
  | { ok: true; kundenFreigabe: "frei" | "gesperrt" | null; geschwaerzt: boolean }
  | { ok: false; grund: "migration_fehlt" | "keine_berechtigung" | "nicht_gefunden" | "fehler"; text: string };

/** Fehlt die Datenbankfunktion? PostgREST meldet das mit `PGRST202`, Postgres mit `42883`. */
function funktionFehlt(fehler: { code?: unknown; message?: unknown }): boolean {
  if (fehler.code === "PGRST202" || fehler.code === "42883") return true;
  return typeof fehler.message === "string" && /could not find the function|function .* does not exist/i.test(fehler.message);
}

const TEXTE = {
  migration_fehlt: `Die Freigabe lässt sich noch nicht speichern, die Migration ${FREIGABE_MIGRATION} ist noch nicht ausgeführt.`,
  keine_berechtigung: "Deine Rolle darf die Freigabe für Kunden nicht umschalten. Das legen Admin und Inhaber in der Nutzerverwaltung unter „Rollen & Berechtigungen“ fest.",
  nicht_gefunden: "Diese Unterlage gibt es nicht mehr. Lade die Seite bitte neu.",
  fehler: "Die Freigabe ließ sich gerade nicht speichern. Versuch es bitte gleich noch einmal.",
} as const;

/**
 * Freigabe und Schwärzung einer Unterlage setzen.
 *
 * `freigabe` null heißt: zurück zur Grundregel der Ampel. Danach wird die
 * Tabelle im Zwischenspeicher neu geladen, damit alle Seiten dasselbe zeigen.
 * Wirft nie, jeder Fehler kommt als Ergebnis mit einem Satz für den Nutzer.
 */
export async function setzeKundenFreigabe(
  tabelle: FreigabeTabelle,
  id: string,
  freigabe: "frei" | "gesperrt" | null,
  geschwaerzt: boolean,
): Promise<FreigabeErgebnis> {
  try {
    // Die Funktion steht noch nicht in den erzeugten Typen, sie kommt mit der Migration.
    const { data, error } = await supabase.rpc("setze_kunden_freigabe" as never, {
      p_tabelle: tabelle,
      p_id: id,
      p_freigabe: freigabe,
      p_geschwaerzt: geschwaerzt,
    } as never);
    if (error) {
      const grund = funktionFehlt(error) ? "migration_fehlt" : "fehler";
      if (grund === "fehler") console.error("[dokumentFreigabe] setze_kunden_freigabe:", error.message);
      return { ok: false, grund, text: TEXTE[grund] };
    }
    const antwort = (data ?? {}) as { ok?: unknown; grund?: unknown; kunden_freigabe?: unknown; geschwaerzt?: unknown };
    if (antwort.ok !== true) {
      const grund = antwort.grund === "keine_berechtigung" || antwort.grund === "nicht_gefunden" ? antwort.grund : "fehler";
      return { ok: false, grund, text: TEXTE[grund] };
    }
    try {
      await cacheReload(tabelle);
    } catch (e) {
      // Gespeichert ist es trotzdem, nur die Anzeige anderer Seiten hinkt nach.
      console.warn("[dokumentFreigabe] Zwischenspeicher nicht neu geladen:", e);
    }
    const kundenFreigabe = antwort.kunden_freigabe === "frei" || antwort.kunden_freigabe === "gesperrt" ? antwort.kunden_freigabe : null;
    return { ok: true, kundenFreigabe, geschwaerzt: antwort.geschwaerzt === true };
  } catch (e) {
    console.error("[dokumentFreigabe] setze_kunden_freigabe:", e);
    return { ok: false, grund: "fehler", text: TEXTE.fehler };
  }
}
