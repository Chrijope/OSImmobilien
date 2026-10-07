/**
 * Vormerkung und Reservierung einer Einheit: die Regeln an einer Stelle.
 *
 * Christians Regeln vom 23.09.2026:
 *
 *   1. Wer fuer einen Kunden die Reservierungsvereinbarung zur Unterschrift
 *      absendet, merkt die Einheit fuer 60 Minuten vor, fuer genau diesen
 *      Kunden. Waehrenddessen kann niemand sonst fuer diese Einheit eine
 *      Vereinbarung absenden.
 *   2. Nach 60 Minuten ohne Unterschrift erlischt die Vormerkung von selbst.
 *      Das geht ueber den Zeitstempel `vorgemerkt_bis`, ohne Zeitplan-Job.
 *   3. Die Einheit bleibt frei, bis eine unterschriebene Vereinbarung
 *      vorliegt. Kommt die Unterschrift des ersten Kunden spaeter an und ist
 *      die Einheit dann noch nicht an einen anderen Kunden reserviert, wird sie
 *      fuer ihn reserviert, auch wenn gerade ein anderer sie vorgemerkt hat.
 *      Die erste Unterschrift gewinnt.
 *   4. Ist sie inzwischen an einen anderen Kunden reserviert, gibt es keine
 *      Reservierung, sondern eine Glocke und einen Vermerk.
 *   5. `status = 'reserviert'` samt Kunde wird erst mit der Unterschrift
 *      gesetzt. Waehrend der Vormerkung bleibt die Einheit `frei`.
 *
 * Massgeblich ist die Datenbank: `vormerke_einheit` und
 * `reserviere_einheit_nach_unterschrift` aus der Migration
 * `20260923150000_reservierung_vormerkung.sql` entscheiden in EINEM Schritt.
 * Diese Datei beschreibt dieselben Regeln fuer zwei Zwecke: die Anzeige im
 * Browser (wer darf den Knopf sehen, was steht daneben) und den Rueckfallweg
 * der Edge Functions, solange die Migration noch nicht gelaufen ist.
 *
 * Nur reine Funktionen und ein lose getypter Datenbankzugriff, keine Deno-
 * oder Browser-API. Der Browser liest die Datei ueber einen relativen Pfad,
 * genau wie `einheit-angebot.ts`.
 */

/** Wie lange eine Vormerkung haelt. Dieselbe Zahl steht in der Migration. */
export const VORMERKUNG_MINUTEN = 60;

/**
 * Status, unter denen eine Einheit belegt ist.
 *
 * "gesetzt" ist ein Altwert, den der Browser wie "reserviert" liest. Alles
 * andere (frei, verfuegbar, leer, gar nichts) gilt als frei, genau wie in
 * `dbRowToWohnung` im objekteStore.
 */
const BELEGT = new Set(["reserviert", "gesetzt", "verkauft"]);

/** Der Stand einer Einheit, soweit er fuer diese Regeln zaehlt. */
export interface EinheitStand {
  status?: string | null;
  kundeId?: string | null;
  vorgemerktBis?: string | null;
  vorgemerktKundeId?: string | null;
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

/** Ist die Einheit reserviert, gesetzt oder verkauft? */
export function einheitBelegt(status?: string | null): boolean {
  return BELEGT.has(text(status).toLowerCase());
}

/** Haengt an der Einheit ein Kunde? Ein leerer Text zaehlt nicht. */
export function kundeGesetzt(kundeId?: string | null): boolean {
  return text(kundeId) !== "";
}

/**
 * Laeuft die Vormerkung noch?
 *
 * Abgelaufen ist sie, sobald `vorgemerkt_bis` erreicht ist. Ein kaputter oder
 * fehlender Zeitstempel heisst: keine Vormerkung. Das ist die sichere Seite,
 * denn die Datenbank entscheidet ohnehin selbst, und ein falsch angezeigtes
 * "vorgemerkt" wuerde einen Partner grundlos abweisen.
 */
export function vormerkungAktiv(stand: EinheitStand, jetzt: Date = new Date()): boolean {
  const bis = text(stand.vorgemerktBis);
  if (!bis) return false;
  const t = new Date(bis).getTime();
  if (Number.isNaN(t)) return false;
  return t > jetzt.getTime();
}

/** Ist die Einheit gerade fuer jemand anderen als diesen Kunden vorgemerkt? */
export function vormerkungFuerAnderen(
  stand: EinheitStand,
  kontaktId?: string | null,
  jetzt: Date = new Date(),
): boolean {
  if (!vormerkungAktiv(stand, jetzt)) return false;
  const fuer = text(stand.vorgemerktKundeId);
  return !fuer || fuer !== text(kontaktId);
}

export type VormerkEntscheidung =
  | { moeglich: true }
  | { moeglich: false; grund: "vergeben" | "vorgemerkt_von_anderem"; bis?: string };

/**
 * Darf diese Einheit fuer diesen Kunden vorgemerkt werden?
 *
 * Dieselbe Bedingung wie im WHERE von `vormerke_einheit`: frei, ohne Kunden,
 * und entweder ohne laufende Vormerkung oder schon fuer genau diesen Kunden
 * vorgemerkt (dann wird verlaengert, etwa beim zweiten Versandversuch).
 */
export function vormerkenMoeglich(
  stand: EinheitStand,
  kontaktId: string,
  jetzt: Date = new Date(),
): VormerkEntscheidung {
  if (einheitBelegt(stand.status) || kundeGesetzt(stand.kundeId)) {
    return { moeglich: false, grund: "vergeben" };
  }
  if (vormerkungFuerAnderen(stand, kontaktId, jetzt)) {
    return { moeglich: false, grund: "vorgemerkt_von_anderem", bis: text(stand.vorgemerktBis) };
  }
  return { moeglich: true };
}

export type ReservierEntscheidung = "frei" | "schon_fuer_diesen_kunden" | "vergeben";

/**
 * Darf die Einheit nach der Unterschrift fuer diesen Kunden reserviert werden?
 *
 * Die Vormerkung spielt hier bewusst KEINE Rolle (Regel 3): Die erste
 * Unterschrift gewinnt, auch gegen eine laufende Vormerkung eines anderen
 * Partners. Entscheidend ist allein, ob die Einheit frei ist oder schon
 * diesem Kunden gehoert.
 */
export function reservierungNachUnterschrift(
  stand: EinheitStand,
  kontaktId: string,
): ReservierEntscheidung {
  const status = text(stand.status).toLowerCase();
  const kunde = text(stand.kundeId);
  if (!einheitBelegt(status) && !kunde) return "frei";
  if ((status === "reserviert" || status === "gesetzt") && kunde && kunde === text(kontaktId)) {
    return "schon_fuer_diesen_kunden";
  }
  return "vergeben";
}

/**
 * Fehlt die aufgerufene Datenbankfunktion, weil die Migration noch nicht
 * gelaufen ist?
 *
 * PostgREST meldet das als PGRST202, Postgres selbst als 42883. Bewusst eng:
 * Eine fehlende SPALTE (42703) ist ein anderer Fehler und darf nicht still auf
 * den Rueckfallweg fuehren.
 */
export function funktionFehlt(fehler: unknown): boolean {
  if (!fehler || typeof fehler !== "object") return false;
  const code = String((fehler as { code?: unknown }).code ?? "");
  const meldung = String((fehler as { message?: unknown }).message ?? "");
  return code === "PGRST202" || code === "42883" ||
    /could not find the function|function .* does not exist/i.test(meldung);
}

/* ────────────────────────────────────────────────────────────────────────
 * Reservieren nach der Unterschrift, fuer die Edge Functions
 * ──────────────────────────────────────────────────────────────────────── */

type Antwort<T = unknown> = { data: T; error: unknown };

/** Die paar Bausteine einer Abfrage, die hier gebraucht werden. */
export interface EinheitAbfrage extends PromiseLike<Antwort> {
  select(spalten: string): EinheitAbfrage;
  update(werte: Record<string, unknown>): EinheitAbfrage;
  eq(spalte: string, wert: unknown): EinheitAbfrage;
  is(spalte: string, wert: null): EinheitAbfrage;
  maybeSingle(): PromiseLike<Antwort<Record<string, unknown> | null>>;
}

/**
 * Vom Supabase-Client wird nur `rpc` und `from` gebraucht. Beschrieben ist
 * genau das, damit die Datei frei von einer Paketangabe bleibt, die je
 * Function anders lautet. Die Functions reichen ihren Client mit
 * `as unknown as EinheitDatenzugriff` herein.
 */
export interface EinheitDatenzugriff {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<Antwort>;
  from(tabelle: string): EinheitAbfrage;
}

/** Ein Textfeld aus einer gelesenen Zeile, fehlend oder leer wird null. */
function feld(zeile: Record<string, unknown> | null | undefined, name: string): string | null {
  const wert = zeile?.[name];
  return typeof wert === "string" ? wert : null;
}

export interface ReservierAuftrag {
  wohnungId: string;
  kontaktId: string;
  kundeName: string;
  /** Zeitpunkt der Unterschrift als ISO-Text; die Spalte ist Text. */
  reserviertAm: string;
  /** Wer die Vereinbarung verschickt hat, ersatzweise der zustaendige Partner. */
  reserviertVon?: string | null;
}

export interface ReservierErgebnis {
  ergebnis: "reserviert" | "vergeben" | "globalobjekt" | "nicht_gefunden" | "fehler";
  /** Stand der Einheit, wenn sie vergeben war. */
  status?: string | null;
  kundeId?: string | null;
  kundeName?: string | null;
  /** Technischer Grund bei "fehler", fuer das Protokoll. */
  fehler?: string;
  /** Wahr, wenn der Rueckfallweg ohne die Migration gelaufen ist. */
  ohneMigration?: boolean;
}

function fehlerText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    return [o.message, o.details, o.hint, o.code].filter(Boolean).join(" | ") || "unbekannter Fehler";
  }
  return String(e);
}

function ergebnisAusRpc(data: unknown): ReservierErgebnis {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const e = String(d.ergebnis ?? "");
  if (e === "reserviert" || e === "vergeben" || e === "globalobjekt" || e === "nicht_gefunden") {
    return {
      ergebnis: e,
      status: (d.status as string | null | undefined) ?? null,
      kundeId: (d.kunde_id as string | null | undefined) ?? null,
      kundeName: (d.kunde_name as string | null | undefined) ?? null,
    };
  }
  return { ergebnis: "fehler", fehler: `Unerwartete Antwort: ${JSON.stringify(data)}` };
}

/**
 * Die Einheit nach der letzten Unterschrift reservieren, aber nur, wenn sie
 * frei ist oder schon diesem Kunden gehoert.
 *
 * Erster Weg: die Datenbankfunktion `reserviere_einheit_nach_unterschrift`.
 * Sie prueft und schreibt in einem Schritt, leert die Vormerkung und setzt
 * `reserviert_von`.
 *
 * Rueckfall, solange die Migration fehlt: lesen, nach denselben Regeln
 * entscheiden und dann nur schreiben, wenn Status und Kunde noch genau so
 * dastehen wie gelesen (bedingtes Update). Hat sich dazwischen etwas
 * geaendert, kommt keine Zeile zurueck, und die Einheit gilt als vergeben.
 * Die neuen Spalten gibt es in diesem Fall noch nicht, sie werden deshalb
 * nicht geschrieben.
 *
 * Wirft nicht. Was schiefging, steht im Ergebnis.
 */
export async function reserviereNachUnterschrift(
  db: EinheitDatenzugriff,
  auftrag: ReservierAuftrag,
): Promise<ReservierErgebnis> {
  const { wohnungId, kontaktId, kundeName, reserviertAm, reserviertVon } = auftrag;
  try {
    const { data, error } = await db.rpc("reserviere_einheit_nach_unterschrift", {
      p_wohnung_id: wohnungId,
      p_kontakt_id: kontaktId,
      p_kunde_name: kundeName,
      p_reserviert_am: reserviertAm,
      p_reserviert_von: reserviertVon || null,
    });
    if (!error) return ergebnisAusRpc(data);
    if (!funktionFehlt(error)) return { ergebnis: "fehler", fehler: fehlerText(error) };
    console.warn(
      "reserviere_einheit_nach_unterschrift fehlt, die Migration 20260923150000 ist noch nicht gelaufen. Rueckfall auf das bedingte Update.",
    );
  } catch (e) {
    return { ergebnis: "fehler", fehler: fehlerText(e) };
  }

  // ── Rueckfall ohne Migration ──
  try {
    const { data: zeile, error: lesen } = await db.from("wohnungen")
      .select("id, objekt_id, status, kunde_id, kunde_name").eq("id", wohnungId).maybeSingle();
    if (lesen) return { ergebnis: "fehler", fehler: fehlerText(lesen), ohneMigration: true };
    if (!zeile) return { ergebnis: "nicht_gefunden", ohneMigration: true };
    const status = feld(zeile, "status");
    const kundeId = feld(zeile, "kunde_id");

    const { data: objekt } = await db.from("objekte")
      .select("global_objekt").eq("id", feld(zeile, "objekt_id")).maybeSingle();
    if (objekt?.global_objekt === true) return { ergebnis: "globalobjekt", ohneMigration: true };

    if (reservierungNachUnterschrift({ status, kundeId }, kontaktId) === "vergeben") {
      return { ergebnis: "vergeben", status, kundeId, kundeName: feld(zeile, "kunde_name"), ohneMigration: true };
    }

    // Bedingt: nur, wenn Status und Kunde noch so sind wie eben gelesen.
    let schreiben = db.from("wohnungen").update({
      status: "reserviert",
      kunde_id: kontaktId,
      kunde_name: kundeName,
      reserviert_am: reserviertAm,
      gesetzt_am: null,
      gesetzt_bis: null,
    }).eq("id", wohnungId);
    schreiben = status === null ? schreiben.is("status", null) : schreiben.eq("status", status);
    schreiben = kundeId === null ? schreiben.is("kunde_id", null) : schreiben.eq("kunde_id", kundeId);
    const { data: geschrieben, error: schreibFehler } = await schreiben.select("id");
    if (schreibFehler) return { ergebnis: "fehler", fehler: fehlerText(schreibFehler), ohneMigration: true };
    if (Array.isArray(geschrieben) && geschrieben.length > 0) {
      return { ergebnis: "reserviert", ohneMigration: true };
    }

    // Dazwischen hat jemand anderes geschrieben. Neu lesen, um den Stand zu nennen.
    const { data: jetzt } = await db.from("wohnungen")
      .select("status, kunde_id, kunde_name").eq("id", wohnungId).maybeSingle();
    return {
      ergebnis: "vergeben", status: feld(jetzt, "status"), kundeId: feld(jetzt, "kunde_id"),
      kundeName: feld(jetzt, "kunde_name"), ohneMigration: true,
    };
  } catch (e) {
    return { ergebnis: "fehler", fehler: fehlerText(e), ohneMigration: true };
  }
}
