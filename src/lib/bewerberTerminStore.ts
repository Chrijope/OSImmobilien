import { supabase } from "@/integrations/supabase/client";
import { funktionFehlt } from "./buchungStore";
import {
  leseZugang,
  type BewerberTerminVorgang,
  type BewerberTerminZugang,
} from "./bewerberTermin";

/**
 * Datenzugriff für die Terminbuchung des Bewerbers.
 *
 * Der Bewerber hat kein Konto. Er läuft ausschliesslich über die RPCs aus der
 * Migration `20260906120000_bewerber_terminbuchung.sql`, die Tabellen selbst
 * sind für `anon` gesperrt. Dasselbe Muster wie beim Kundenbuchungssystem in
 * `buchungStore.ts` und beim Videoraum.
 *
 * **Der Unterschied zur Kundenbuchung, auf den es ankommt:** `buchung_anlegen`
 * legt bei einer Buchung über einen offenen Link einen Lead an und setzt ihm
 * eine Pipelinestufe. Für einen Bewerber wäre beides falsch. Deshalb wird hier
 * `bewerber_termin_buchen` gerufen und niemals `buchung_anlegen`. Die Buchung
 * hängt am Bewerber (`buchungen.bewerbung_id`), nicht an einem Kontakt.
 *
 * Solange die Migration in Supabase nicht gelaufen ist, geben die
 * Lesefunktionen `null` beziehungsweise eine leere Liste zurück. Nichts davon
 * wirft, damit die Terminansicht darüber nicht abstürzt; sie zeigt dann nur
 * Dauer, Tagesordnung und den nächsten Schritt.
 *
 * Die Schreibfunktionen werfen dagegen bewusst weiter. Eine Buchung, die still
 * nicht stattfindet, wäre schlimmer als eine Fehlermeldung: Der Bewerber
 * glaubte sonst, er habe einen Termin.
 */

// Die Tabellen und Funktionen stehen noch nicht in den erzeugten
// Supabase-Typen, siehe videoraumStore.ts und buchungStore.ts.
const db = supabase as unknown as {
  from: (tabelle: string) => any;
};

/** Der Zeitraum, den eine Abfrage der freien Zeiten höchstens umfasst. */
export const MAX_TAGE_JE_ABFRAGE = 62;

// ---------------------------------------------------------------------------
// Der Bewerber, ohne Konto
// ---------------------------------------------------------------------------

/**
 * Mit wem, wie lange, und steht schon ein Termin?
 *
 * `null` heißt: Es gibt hier nichts anzubieten. Das ist der Fall, solange die
 * Migration nicht gelaufen ist, wenn niemand eine Terminart „Bewerbergespräch"
 * samt Wochenplan gepflegt hat, oder wenn das Token unbekannt ist.
 */
export async function ladeBewerberTerminZugang(token: string): Promise<BewerberTerminZugang | null> {
  if (!token) return null;
  const { data, error } = await supabase.rpc("bewerber_termin_zugang" as never, { _token: token } as never);
  if (error) {
    if (!funktionFehlt(error)) console.error("ladeBewerberTerminZugang:", error);
    return null;
  }
  return leseZugang(data);
}

/**
 * Die freien Startzeiten, wie die Datenbank sie sieht.
 *
 * Sie ist die maßgebliche Quelle, denn nur sie kennt die übrigen Termine der
 * Gastgeberin. Gerechnet wird dort mit der Dauer, die sich aus den Antworten
 * des Bewerbers ergibt, damit angebotene und gebuchte Zeit übereinstimmen.
 */
export async function ladeBewerberFreieZeiten(params: {
  token: string;
  vonTag: string;
  bisTag: string;
}): Promise<string[]> {
  if (!params.token) return [];
  const { data, error } = await supabase.rpc("bewerber_termin_freie_zeiten" as never, {
    _token: params.token,
    _von: params.vonTag,
    _bis: params.bisTag,
  } as never);
  if (error) {
    if (!funktionFehlt(error)) console.error("ladeBewerberFreieZeiten:", error);
    return [];
  }
  return Array.isArray(data) ? (data as string[]) : [];
}

/** Was nach einer gelungenen Buchung zurückkommt. */
export interface BewerberTerminErgebnis {
  id: string;
  startAt: string;
  endeAt: string;
  dauerMinuten: number;
  raumToken?: string;
  zeitzone?: string;
}

function leseErgebnis(data: unknown): BewerberTerminErgebnis | null {
  if (!data || typeof data !== "object") return null;
  const a = data as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.start_at !== "string") return null;
  return {
    id: a.id,
    startAt: a.start_at,
    endeAt: typeof a.ende_at === "string" ? a.ende_at : "",
    dauerMinuten: typeof a.dauer_minuten === "number" ? a.dauer_minuten : 0,
    raumToken: typeof a.raum_token === "string" ? a.raum_token : undefined,
    zeitzone: typeof a.zeitzone === "string" ? a.zeitzone : undefined,
  };
}

/**
 * Den Termin buchen.
 *
 * Ruft `bewerber_termin_buchen` und **niemals** `buchung_anlegen`: Diese eine
 * Zeile ist der Grund, warum aus einem Bewerber kein Lead wird und seine
 * Pipelinestufe unberührt bleibt.
 */
export async function bucheBewerberTermin(
  token: string,
  startISO: string,
): Promise<BewerberTerminErgebnis | null> {
  const { data, error } = await supabase.rpc("bewerber_termin_buchen" as never, {
    _token: token,
    _start: startISO,
  } as never);
  if (error) { console.error("bucheBewerberTermin:", error); throw error; }
  const ergebnis = leseErgebnis(data);
  if (ergebnis) meldeBewerberTermin(token, "gebucht");
  return ergebnis;
}

/** Den Termin auf eine andere Zeit legen. Derselbe Link, dieselbe Buchung. */
export async function verschiebeBewerberTermin(
  token: string,
  startISO: string,
): Promise<boolean> {
  const { error } = await supabase.rpc("bewerber_termin_verschieben" as never, {
    _token: token,
    _start: startISO,
  } as never);
  if (error) { console.error("verschiebeBewerberTermin:", error); throw error; }
  meldeBewerberTermin(token, "verschoben");
  return true;
}

/** Den Termin absagen. Der Videoraum wird dabei geschlossen. */
export async function sageBewerberTerminAb(token: string, grund?: string): Promise<boolean> {
  const { error } = await supabase.rpc("bewerber_termin_absagen" as never, {
    _token: token,
    _grund: grund?.trim() || null,
  } as never);
  if (error) { console.error("sageBewerberTerminAb:", error); throw error; }
  meldeBewerberTermin(token, "abgesagt");
  return true;
}

/**
 * Die Meldung an die HR-Managerin anstoßen.
 *
 * Übergeben wird ausschliesslich das Kennenlern-Token, niemals Name oder
 * Adresse aus dem Browser: sonst wäre der Aufruf ein Versandwerkzeug, mit dem
 * sich Mails an Fremde auslösen liessen. Alles Weitere holt sich die Function
 * selbst aus der Datenbank.
 *
 * Bewusst ohne `await` und ohne `throw`. Geht die Mail nicht hinaus, ist der
 * Termin trotzdem gebucht, und der Bewerber soll deswegen keine Fehlermeldung
 * sehen. Dasselbe Vorgehen wie bei `buche` in `buchungStore.ts`.
 */
export function meldeBewerberTermin(token: string, vorgang: BewerberTerminVorgang): void {
  void supabase.functions
    .invoke("send-bewerber-termin", { body: { token, vorgang } })
    .then(({ error }) => {
      if (error) console.error("send-bewerber-termin:", error);
    })
    .catch((fehler) => console.error("send-bewerber-termin:", fehler));
}

// ---------------------------------------------------------------------------
// Die Sicht des CRM
// ---------------------------------------------------------------------------

/** Eine Bewerberbuchung, wie der Bewerberprozess sie anzeigt. */
export interface BewerberBuchungZeile {
  id: string;
  bewerbungId: string;
  startAt: string;
  endeAt: string;
  dauerMinuten: number;
  /** "offen", "abgesagt" oder "wahrgenommen". */
  status: string;
  /** Wann abgesagt wurde (ISO), leer bei jedem nicht abgesagten Termin. */
  abgesagtAt: string;
  bezeichnung: string | null;
  /**
   * Der Weg in den Videoraum für den angemeldeten Mitarbeiter, also die
   * Gastgeberansicht `/videocall/raum/<Raumkennung>`. Fehlt, wenn kein Raum
   * hängt.
   *
   * Bewusst nicht der Gastlink `/raum/<Token>`: Der gehört dem Eingeladenen
   * und führt in den Warteraum. Wer aus dem Bewerberprofil heraus klickt,
   * leitet das Gespräch und gehört direkt in den Raum, in dieselbe Ansicht
   * wie über "Raum betreten" unter "Meine Gespräche". Den Gastlink zum
   * Weitergeben gibt es dort als "Kundenlink".
   */
  raumPfad: string | null;
}

/**
 * Alle Termine, die an einem Bewerber hängen, nach Bewerber geordnet.
 *
 * Gelesen wird über die Tabelle, nicht über eine RPC: Hier sitzt ein
 * angemeldeter Mitarbeiter, und die Zeilensicherheit auf `buchungen` entscheidet
 * ohnehin, was er sehen darf. Fehlt die Spalte `bewerbung_id`, weil die
 * Migration noch nicht gelaufen ist, bleibt die Liste leer.
 *
 * **Abgesagte Termine sind seit dem 16.09.2026 dabei.** Vorher filterte die
 * Abfrage sie weg, und damit war nach einer Absage nicht mehr zu sehen, dass
 * je ein Termin bestand: Die Absage räumt zusätzlich Datum und Uhrzeit in der
 * Akte, ein abgesagter Termin sah also aus wie ein nie gebuchter. Je Bewerber
 * gilt deshalb:
 *
 *   - Gibt es eine **nicht abgesagte** Buchung, ist sie die maßgebliche. Mehr
 *     als eine offene kann es nicht geben, `bewerber_termin_buchen` verweigert
 *     die zweite.
 *   - Sonst die jüngste abgesagte. Sie trägt `status: "abgesagt"`, und die
 *     Anzeige macht daraus das Abzeichen.
 *
 * Wer nur den stehenden Termin will, etwa für den Weg in den Videoraum, prüft
 * den Status. Genau das tut `useSelbstGebuchterTermin`.
 */
export async function ladeBewerberBuchungen(): Promise<Record<string, BewerberBuchungZeile>> {
  const karte: Record<string, BewerberBuchungZeile> = {};
  try {
    const { data, error } = await db
      .from("buchungen")
      .select("id, bewerbung_id, start_at, ende_at, dauer_minuten, status, abgesagt_at, bezeichnung, videoraum_id")
      .not("bewerbung_id", "is", null)
      .order("start_at", { ascending: false });
    if (error || !data) return karte;

    for (const zeile of data as Record<string, unknown>[]) {
      const bewerbungId = String(zeile.bewerbung_id || "");
      if (!bewerbungId) continue;
      const status = String(zeile.status || "");
      const vorhanden = karte[bewerbungId];
      // Absteigend nach Startzeit: Die erste Zeile je Bewerber ist die jüngste.
      // Eine nicht abgesagte verdrängt eine bereits gemerkte abgesagte, denn
      // der stehende Termin ist der, der zählt. Umgekehrt nie.
      if (vorhanden && !(vorhanden.status === "abgesagt" && status !== "abgesagt")) continue;
      const raumId = String(zeile.videoraum_id || "");
      karte[bewerbungId] = {
        id: String(zeile.id || ""),
        bewerbungId,
        startAt: String(zeile.start_at || ""),
        endeAt: String(zeile.ende_at || ""),
        dauerMinuten: Number(zeile.dauer_minuten) || 0,
        status,
        abgesagtAt: String(zeile.abgesagt_at || ""),
        bezeichnung: (zeile.bezeichnung as string) || null,
        // Die Raumkennung genügt. Das Token des Gastes wird hier nicht mehr
        // nachgeschlagen, weil aus dem CRM heraus niemand in den Warteraum
        // gehört. `videoraum_id` zeigt per Fremdschlüssel auf einen
        // vorhandenen Raum, beim Löschen wird die Spalte geleert.
        raumPfad: raumId ? `/videocall/raum/${raumId}` : null,
      };
    }
  } catch {
    // Fehlt die Spalte oder die Tabelle, bleibt die Liste leer statt eine
    // Fehlermeldung zu zeigen.
  }
  return karte;
}

/**
 * Alle Videoräume, die an den Terminen eines Bewerbers hängen, jüngster
 * zuerst. Grundlage für die Mitschrift im Reiter Videocall.
 *
 * Ohne Filter auf den Status, anders als oben: Eine Mitschrift ist das
 * Protokoll eines Gesprächs, das stattgefunden hat. Wird der Termin danach
 * verschoben oder abgesagt, bleibt das Gesprochene trotzdem lesenswert.
 */
export async function ladeBewerberRaumIds(bewerbungId: string): Promise<string[]> {
  if (!bewerbungId) return [];
  try {
    const { data, error } = await db
      .from("buchungen")
      .select("videoraum_id, start_at")
      .eq("bewerbung_id", bewerbungId)
      .order("start_at", { ascending: false });
    if (error || !data) return [];
    const ids: string[] = [];
    for (const zeile of data as Record<string, unknown>[]) {
      const raumId = String(zeile.videoraum_id || "");
      if (raumId && !ids.includes(raumId)) ids.push(raumId);
    }
    return ids;
  } catch {
    // Fehlt die Spalte, gibt es eben nichts anzuzeigen.
    return [];
  }
}
