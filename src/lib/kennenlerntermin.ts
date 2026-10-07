import { supabase } from "@/integrations/supabase/client";
import { funktionFehlt, spalteFehlt } from "@/lib/buchungStore";

/**
 * Der Kennenlerntermin, den der Bewerber selbst bestätigt.
 *
 * ## Warum es diesen Weg gibt
 *
 * Vereinbart wird der Termin seit dem 21.09.2026 über Calendly, und Calendly
 * meldet uns nichts zurück. Die HR-Managerin trug Datum und Uhrzeit deshalb von
 * Hand im CRM nach.
 *
 * Christian hat diesen Schritt dem Bewerber gegeben: Er bucht auf einer Seite
 * im Hausstil, in der Calendly eingebettet ist, und trägt darunter die gebuchte
 * Zeit zur Bestätigung ein. Damit steht sie sofort im Profil, und niemand muss
 * sie abtippen.
 *
 * ## Warum hier nichts abstürzt, wenn die Migration noch nicht gelaufen ist
 *
 * Migrationen kommen über git, werden aber von Hand in Supabase ausgeführt.
 * Solange `20260921140000_kennenlerntermin_selbst_bestaetigen.sql` dort nicht
 * gelaufen ist, gibt es die beiden Datenbankfunktionen nicht. Das Lesen liefert
 * dann `null`, das Schreiben meldet es ausdrücklich, und die Seite lädt den
 * Bewerber zu einem zweiten Versuch ein. Bis zum 29.09.2026 stand dort, wir
 * notierten uns den Termin selbst. Das stimmte nicht, bei diesem Fehler wird
 * nichts gespeichert und niemand benachrichtigt.
 */

/**
 * Nur der erste Namensteil, für die Anrede auf der Terminseite.
 *
 * Die Datenbankfunktion gibt die Spalte `bewerbungen.vorname` heraus, und in
 * der steht nicht immer nur ein Vorname. Der Zapier-Webhook teilt einen
 * gelieferten Gesamtnamen zwar auf, aber nur, wenn `vorname` oder `nachname`
 * fehlen (`supabase/functions/zapier-bewerber-webhook/index.ts:150`). Schickt
 * ein Formular den vollen Namen im Vornamensfeld, landet er dort ungeteilt,
 * und die Seite grüßt mit Vor- und Nachnamen. Christian will oben nur den
 * Vornamen sehen, deshalb wird hier abgeschnitten.
 *
 * Getrennt wird ausschließlich am Leerzeichen. Ein Doppelname mit Bindestrich
 * bleibt damit ganz, denn ein Bindestrich ist kein Leerzeichen.
 */
export function ersterVorname(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || "";
}

/** Was die Seite über den Bewerber und seinen Termin weiß. */
export interface KennenlerntereminStand {
  /** Nur der erste Namensteil, für die Anrede. Siehe `ersterVorname`. */
  vorname: string;
  /** JJJJ-MM-TT, oder leer. */
  datum: string;
  /** HH:MM, oder leer. */
  uhrzeit: string;
  /** „bewerber", wenn er selbst bestätigt hat. Leer, wenn von Hand eingetragen. */
  quelle: string;
  /**
   * Die Kalenderadresse der zuständigen HR-Person, aus ihrem Profil.
   *
   * Drei Fälle, und die Seite behandelt alle drei verschieden:
   *
   *   * eine Adresse: Der Kalender wird eingebettet.
   *   * `""`: Die Datenbank kennt das Feld, es ist aber keine Adresse
   *     hinterlegt. Die Seite sagt das, statt einen leeren Rahmen zu zeigen.
   *   * `null`: Die Datenbank kennt das Feld noch nicht, weil die Migration
   *     `20260921260000_kennenlerntermin_kalender_der_hr.sql` in Supabase noch
   *     nicht gelaufen ist. Die Seite fällt dann auf die bisherige feste
   *     Adresse zurück, damit der Bewerber in der Zwischenzeit buchen kann.
   */
  kalender: string | null;
}

/** Das Ergebnis eines Bestätigungsversuchs. */
export type BestaetigungErgebnis =
  | { ok: true }
  | { ok: false; grund: string; migrationFehlt?: boolean };

function lese(daten: unknown): KennenlerntereminStand | null {
  if (!daten || typeof daten !== "object") return null;
  const d = daten as Record<string, unknown>;
  const text = (wert: unknown) => (typeof wert === "string" ? wert : "");
  return {
    // Nur der erste Namensteil, siehe `ersterVorname`.
    vorname: ersterVorname(text(d.vorname)),
    datum: text(d.datum),
    uhrzeit: text(d.uhrzeit),
    quelle: text(d.quelle),
    /*
      Fehlendes Feld und leeres Feld sind hier zwei verschiedene Aussagen,
      deshalb wird nicht auf "" vereinheitlicht. Siehe den Kommentar oben.
    */
    kalender: typeof d.kalender === "string" ? d.kalender : null,
  };
}

/**
 * Den Stand zum Token holen.
 *
 * `null` heißt: Token unbekannt, Bogen nicht eingereicht, oder die Migration
 * fehlt noch. Alle drei Fälle sehen für den Bewerber gleich aus, und das ist
 * Absicht: Ein unbekanntes Token soll nicht verraten, ob es das Token gibt.
 */
export async function ladeKennenlerntermin(token: string): Promise<KennenlerntereminStand | null> {
  if (!token) return null;
  const { data, error } = await supabase.rpc(
    "bewerber_kennenlerntermin_zugang" as never,
    { _token: token } as never,
  );
  if (error) {
    if (!funktionFehlt(error)) console.error("ladeKennenlerntermin:", error);
    return null;
  }
  return lese(data);
}

/**
 * Datum und Uhrzeit bestätigen.
 *
 * Die Datenbank prüft das Format und weist einen Termin in der Vergangenheit
 * ab. Diese Prüfungen stehen dort und nicht hier, weil die Seite ohne Anmeldung
 * erreichbar ist: Was im Browser läuft, lässt sich umgehen.
 */
export async function bestaetigeKennenlerntermin(
  token: string,
  datum: string,
  uhrzeit: string,
): Promise<BestaetigungErgebnis> {
  if (!token) return { ok: false, grund: "Dieser Link ist nicht mehr gültig." };
  if (!datum || !uhrzeit) return { ok: false, grund: "Bitte Datum und Uhrzeit angeben." };

  const { error } = await supabase.rpc(
    "bewerber_kennenlerntermin_eintragen" as never,
    { _token: token, _datum: datum, _uhrzeit: uhrzeit } as never,
  );
  if (!error) return { ok: true };

  /*
    Eine fehlende Spalte ist nie ein Grund zurueckzufallen: Die Funktion ist da,
    sie passt nur nicht zur Tabelle. Frueher lief dieser Fall in den Zweig
    darunter und wurde als "Migration noch nicht gelaufen" beschwichtigt. Genau
    so blieb am 21.09.2026 unsichtbar, dass die Schreibfunktion auf ein nicht
    vorhandenes `updated_at` schrieb.
  */
  if (spalteFehlt(error)) {
    console.error("bestaetigeKennenlerntermin: Spalte fehlt in der Datenbank", error);
    return { ok: false, grund: "Das hat gerade nicht geklappt. Versuch es bitte noch einmal." };
  }

  if (funktionFehlt(error)) {
    /*
      Zwei Fälle sehen von hier aus gleich aus, und beide sind vorübergehend
      oder dauerhaft, ohne dass der Bewerber es unterscheiden könnte:

        1. Die Migration ist noch nicht in Supabase gelaufen.
        2. Sie ist gerade gelaufen, aber PostgREST kennt die neue Funktion noch
           nicht. Sein Schema-Cache lädt sich erst nach einem Moment neu, und
           bis dahin meldet er PGRST202. Genau das ist Christian am 21.09.2026
           passiert: Er hatte die SQL soeben ausgeführt, und der erste Versuch
           lief in diese Meldung. Kurz darauf ging derselbe Aufruf durch.

      Deshalb lädt der Text zum zweiten Versuch ein, statt aufzugeben. Mehr
      verspricht er nicht: Gespeichert wird in diesem Fall nichts.

      Protokolliert wird es in jedem Fall: Ein Fehler, der nur als freundlicher
      Satz erscheint und sonst nirgends, bleibt unbemerkt.
    */
    console.error("bestaetigeKennenlerntermin: Funktion nicht erreichbar", error);
    return {
      ok: false,
      migrationFehlt: true,
      grund: "Das hat gerade nicht geklappt. Versuch es bitte gleich noch einmal.",
    };
  }

  /*
    Die Meldungen der Datenbank sind bewusst kurz und für den Bewerber lesbar.
    Alles, was wir nicht kennen, wird nicht durchgereicht: Eine technische
    Meldung auf einer öffentlichen Seite verunsichert und hilft niemandem.
  */
  const meldung = String((error as { message?: string }).message || "");
  if (/Vergangenheit/i.test(meldung)) {
    return { ok: false, grund: "Der Termin liegt in der Vergangenheit. Bitte prüf das Datum." };
  }
  if (/Zukunft/i.test(meldung)) {
    return { ok: false, grund: "Das Datum liegt zu weit in der Zukunft. Bitte prüf die Jahreszahl." };
  }
  if (/Datum und Uhrzeit/i.test(meldung)) {
    return { ok: false, grund: "Bitte Datum und Uhrzeit vollständig angeben." };
  }
  if (/Kein Zugang/i.test(meldung)) {
    return { ok: false, grund: "Dieser Link ist nicht mehr gültig." };
  }
  console.error("bestaetigeKennenlerntermin:", error);
  return { ok: false, grund: "Das hat gerade nicht geklappt. Versuch es bitte noch einmal." };
}
