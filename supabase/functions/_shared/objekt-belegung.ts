/**
 * Vormerkung und Reservierung eines ganzen Hauses (Globalobjekt): die Regeln
 * an einer Stelle.
 *
 * Entscheidung vom 10.09.2026: Beim Globalobjekt wird nur das Haus reserviert,
 * seine Einheiten nie einzeln. Christians Regeln vom 23.09.2026 gelten fuer das
 * Haus genauso wie fuer eine Einheit (siehe `einheit-vormerkung.ts`):
 *
 *   1. Beim Absenden der Reservierungsvereinbarung wird das Haus 60 Minuten
 *      fuer genau diesen Kunden vorgemerkt.
 *   2. Danach ist es wieder frei, bis eine unterschriebene Vereinbarung
 *      vorliegt. Die Vormerkung erlischt allein ueber den Zeitstempel.
 *   3. Die erste Unterschrift gewinnt, auch gegen eine laufende Vormerkung
 *      eines anderen Partners.
 *   4. Ist das Haus bei der Unterschrift schon an einen anderen Kunden
 *      reserviert, gibt es keine Reservierung, sondern Glocke und Vermerk.
 *
 * Massgeblich ist die Datenbank: `vormerke_objekt` und
 * `reserviere_objekt_nach_unterschrift` aus der Migration
 * `20260923152000_globalobjekt_reservierung.sql` entscheiden in EINEM Schritt.
 *
 * Anders als bei der Einheit gibt es hier bewusst KEINEN Rueckfallweg ohne
 * Migration. Ohne die Spalten an `objekte` kann niemand das Haus festhalten,
 * obwohl der Vertrag genau das verspricht. Deshalb laesst schon der Browser
 * ohne Migration keine Reservierung eines Globalobjekts hinaus; kommt trotzdem
 * eine Unterschrift an, meldet dieser Helfer einen Fehler, statt so zu tun,
 * als sei reserviert worden.
 *
 * Nur reine Funktionen und ein lose getypter Datenbankzugriff, keine Deno-
 * oder Browser-API. Der Browser liest die Datei ueber einen relativen Pfad.
 */
import { funktionFehlt, vormerkungAktiv, vormerkungFuerAnderen } from "./einheit-vormerkung.ts";

/** Die Belegung des Hauses, wie sie in `objekte.belegung` steht. */
export type HausBelegung = "frei" | "reserviert" | "verkauft";

/** Der Stand eines Hauses, soweit er fuer diese Regeln zaehlt. */
export interface HausStand {
  belegung?: string | null;
  kundeId?: string | null;
  vorgemerktBis?: string | null;
  vorgemerktKundeId?: string | null;
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

/**
 * Die Belegung aus der Spalte lesen. Alles Unbekannte und ein leeres Feld
 * gelten als frei; die Datenbank laesst ohnehin nur die drei Werte zu.
 */
export function hausBelegungLesen(wert: unknown): HausBelegung {
  const w = text(wert).toLowerCase();
  if (w === "reserviert" || w === "verkauft") return w;
  return "frei";
}

/** Ist das Haus reserviert oder verkauft? */
export function hausBelegt(stand: Pick<HausStand, "belegung" | "kundeId">): boolean {
  return hausBelegungLesen(stand.belegung) !== "frei" || text(stand.kundeId) !== "";
}

/** Laeuft am Haus eine Vormerkung fuer jemand anderen als diesen Kunden? */
export function hausFremdVorgemerkt(stand: HausStand, kontaktId?: string | null, jetzt: Date = new Date()): boolean {
  return vormerkungFuerAnderen(
    { vorgemerktBis: stand.vorgemerktBis, vorgemerktKundeId: stand.vorgemerktKundeId },
    kontaktId,
    jetzt,
  );
}

/** Ist das Haus gerade fuer genau diesen Kunden vorgemerkt? */
export function hausFuerKundeVorgemerkt(stand: HausStand, kontaktId?: string | null, jetzt: Date = new Date()): boolean {
  return !!text(kontaktId)
    && vormerkungAktiv({ vorgemerktBis: stand.vorgemerktBis }, jetzt)
    && !hausFremdVorgemerkt(stand, kontaktId, jetzt);
}

export type HausVormerkEntscheidung =
  | { moeglich: true }
  | { moeglich: false; grund: "vergeben" | "vorgemerkt_von_anderem"; bis?: string };

/**
 * Darf das Haus fuer diesen Kunden vorgemerkt werden?
 *
 * Dieselbe Bedingung wie im WHERE von `vormerke_objekt`: frei, ohne Kunden,
 * und entweder ohne laufende Vormerkung oder schon fuer genau diesen Kunden
 * vorgemerkt (dann wird verlaengert, etwa beim zweiten Versandversuch).
 */
export function hausVormerkenMoeglich(
  stand: HausStand,
  kontaktId: string,
  jetzt: Date = new Date(),
): HausVormerkEntscheidung {
  if (hausBelegt(stand)) return { moeglich: false, grund: "vergeben" };
  if (hausFremdVorgemerkt(stand, kontaktId, jetzt)) {
    return { moeglich: false, grund: "vorgemerkt_von_anderem", bis: text(stand.vorgemerktBis) };
  }
  return { moeglich: true };
}

/**
 * Darf das Haus nach der Unterschrift fuer diesen Kunden reserviert werden?
 *
 * Die Vormerkung spielt hier bewusst KEINE Rolle (Regel 3). Entscheidend ist
 * allein, ob das Haus frei ist oder schon diesem Kunden gehoert.
 */
export function hausReservierungNachUnterschrift(
  stand: Pick<HausStand, "belegung" | "kundeId">,
  kontaktId: string,
): "frei" | "schon_fuer_diesen_kunden" | "vergeben" {
  const belegung = hausBelegungLesen(stand.belegung);
  const kunde = text(stand.kundeId);
  if (belegung === "frei" && !kunde) return "frei";
  if (belegung === "reserviert" && kunde && kunde === text(kontaktId)) return "schon_fuer_diesen_kunden";
  return "vergeben";
}

/* ────────────────────────────────────────────────────────────────────────
 * Reservieren nach der Unterschrift, fuer die Edge Functions
 * ──────────────────────────────────────────────────────────────────────── */

type Antwort<T = unknown> = { data: T; error: unknown };

/** Vom Supabase-Client wird hier nur `rpc` gebraucht. */
export interface ObjektDatenzugriff {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<Antwort>;
}

export interface HausReservierAuftrag {
  objektId: string;
  kontaktId: string;
  kundeName: string;
  /** Zeitpunkt der Unterschrift als ISO-Text. */
  reserviertAm: string;
  /** Wer die Vereinbarung verschickt hat, ersatzweise der zustaendige Partner. */
  reserviertVon?: string | null;
}

export interface HausReservierErgebnis {
  ergebnis: "reserviert" | "vergeben" | "kein_globalobjekt" | "nicht_gefunden" | "fehler";
  /** Stand des Hauses, wenn es vergeben war. */
  belegung?: string | null;
  kundeId?: string | null;
  kundeName?: string | null;
  /** Technischer Grund bei "fehler", fuer das Protokoll. */
  fehler?: string;
  /** Wahr, wenn die Datenbankfunktion fehlt (Migration nicht gelaufen). */
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

/** Die Antwort von `reserviere_objekt_nach_unterschrift` lesen. Unbekanntes ist ein Fehler. */
export function hausErgebnisAusRpc(data: unknown): HausReservierErgebnis {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const e = String(d.ergebnis ?? "");
  if (e === "reserviert" || e === "vergeben" || e === "kein_globalobjekt" || e === "nicht_gefunden") {
    return {
      ergebnis: e,
      belegung: (d.belegung as string | null | undefined) ?? null,
      kundeId: (d.kunde_id as string | null | undefined) ?? null,
      kundeName: (d.kunde_name as string | null | undefined) ?? null,
    };
  }
  return { ergebnis: "fehler", fehler: `Unerwartete Antwort: ${JSON.stringify(data)}` };
}

/**
 * Das Haus nach der letzten Unterschrift reservieren, aber nur, wenn es frei
 * ist oder schon diesem Kunden gehoert.
 *
 * Einziger Weg ist die Datenbankfunktion `reserviere_objekt_nach_unterschrift`.
 * Fehlt sie, kommt `fehler` mit `ohneMigration` zurueck; ein Rueckfall auf ein
 * Update gibt es nicht, weil es ohne Migration die Spalten gar nicht gibt.
 *
 * Wirft nicht. Was schiefging, steht im Ergebnis.
 */
export async function reserviereObjektNachUnterschrift(
  db: ObjektDatenzugriff,
  auftrag: HausReservierAuftrag,
): Promise<HausReservierErgebnis> {
  const { objektId, kontaktId, kundeName, reserviertAm, reserviertVon } = auftrag;
  try {
    const { data, error } = await db.rpc("reserviere_objekt_nach_unterschrift", {
      p_objekt_id: objektId,
      p_kontakt_id: kontaktId,
      p_kunde_name: kundeName,
      p_belegung_am: reserviertAm,
      p_belegung_von: reserviertVon || null,
    });
    if (!error) return hausErgebnisAusRpc(data);
    if (funktionFehlt(error)) {
      return {
        ergebnis: "fehler",
        ohneMigration: true,
        fehler: "reserviere_objekt_nach_unterschrift fehlt, die Migration 20260923152000_globalobjekt_reservierung.sql ist noch nicht gelaufen",
      };
    }
    return { ergebnis: "fehler", fehler: fehlerText(error) };
  } catch (e) {
    return { ergebnis: "fehler", fehler: fehlerText(e) };
  }
}
