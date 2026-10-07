/**
 * Welche Zeile in `objekt_exposes` ein Versand nimmt und was der Vermerk
 * danach hineinschreibt.
 *
 * Getrennt von `index.ts` und ohne Deno-Importe, damit Vitest die Regeln mit
 * einer Attrappe der Datenbank prüfen kann (`src/lib/kundenlinkZeile.test.ts`).
 *
 * Die Regeln (Christian, 23.09.2026):
 *   - Objektübersicht: GENAU EINE lebende Zeile je Kunde, Investment und
 *     Objekt. `wohnung_id` bleibt leer, die Zeile gehört zum ganzen Haus; die
 *     Wohnung, aus der gesendet wird, steht in `einstieg_wohnung_id`. Erneut
 *     senden, auch aus einer anderen Wohnung, nimmt dieselbe Zeile, setzt
 *     nur den Einstieg neu und verlängert die Frist.
 *   - Exposé: wie bisher eine Zeile je Einheit (oder ganzes Objekt).
 *   - Zurückziehen ist endgültig: Eine zurückgezogene Zeile wird nie wieder
 *     genommen, wer danach sendet, bekommt eine neue mit neuem Schlüssel.
 */

import type { VersandAuftrag } from "./auftrag.ts";

export interface KundenlinkZeile {
  id: string;
  token: string;
  /**
   * Nur mit der Spalte `wohnung_auswahl` gelesen: der Stand der Zeile, gegen
   * den `auswahlSpeichern` sperrt, und die bisherige Auswahl (`null` für
   * alle freien). Fehlen beide, gibt es die Spalte nicht.
   */
  aktualisiertAm?: string;
  wohnungAuswahl?: string[] | null;
}

/** Die bisherige Auswahl aus der Zeile: eine Liste oder `null` für alle freien. */
function auswahlAusZeile(wert: unknown): string[] | null {
  return Array.isArray(wert) ? wert.map(String) : null;
}

/** Das Ergebnis eines Aufrufs, so lose wie nötig. */
interface Antwort {
  data: unknown;
  error: unknown;
}

/**
 * So viel vom Supabase-Client, wie diese Datei braucht. `index.ts` reicht den
 * echten Client herein, der Test eine Attrappe.
 */
export interface ZeilenAbfrage extends PromiseLike<Antwort> {
  eq: (feld: string, wert: unknown) => ZeilenAbfrage;
  is: (feld: string, wert: null) => ZeilenAbfrage;
  not: (feld: string, operator: string, wert: unknown) => ZeilenAbfrage;
  order: (feld: string, optionen: { ascending: boolean }) => ZeilenAbfrage;
  limit: (anzahl: number) => ZeilenAbfrage;
  select: (spalten: string) => ZeilenAbfrage;
  single: () => PromiseLike<Antwort>;
}
export interface ZeilenClient {
  from: (tabelle: string) => {
    select: (spalten: string) => ZeilenAbfrage;
    insert: (werte: Record<string, unknown>) => ZeilenAbfrage;
    update: (werte: Record<string, unknown>) => ZeilenAbfrage;
  };
}

/**
 * Die Zeile, die dieser Auftrag wiederverwendet.
 *
 * Exposé: bereits gesendet, gleiche Einheit, nicht zurückgezogen. Nur
 * gesendete, damit die intern gespeicherten Exposés (Annahmen aus der
 * Vorschau) unangetastet bleiben.
 *
 * Objektübersicht: die eine nicht zurückgezogene Zeile zu Kunde, Investment
 * und Objekt, egal aus welcher Wohnung sie kam. Auch eine noch nicht als
 * gesendet vermerkte: Solche Zeilen legt nur `send-kunden-expose` an, und der
 * eindeutige Index der Migration 20260923171000 ließe keine zweite zu.
 *
 * `mitArt`: Die Spalte `art` gibt es (Migration 20260923171000). Ohne sie
 * gibt es nur Exposés, dann entfällt der Filter.
 */
export async function vorhandeneZeile(db: ZeilenClient, a: VersandAuftrag, mitArt: boolean, mitAuswahl = false): Promise<KundenlinkZeile | null> {
  let abfrage = db
    .from("objekt_exposes")
    .select(mitAuswahl ? "id, token, aktualisiert_am, wohnung_auswahl" : "id, token")
    .eq("objekt_id", a.objektId)
    .eq("kontakt_id", a.kontaktId)
    .eq("investment_id", a.investmentId)
    .is("zurueckgezogen_am", null);
  if (mitArt) abfrage = abfrage.eq("art", a.art);
  if (a.art === "expose") {
    abfrage = abfrage.not("gesendet_am", "is", null);
    abfrage = a.wohnungId ? abfrage.eq("wohnung_id", a.wohnungId) : abfrage.is("wohnung_id", null);
  }
  const reihenfolge = a.art === "expose" ? "gesendet_am" : "erstellt_am";
  const { data, error } = await abfrage.order(reihenfolge, { ascending: false }).limit(1);
  if (error) throw error;
  const zeile = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!zeile) return null;
  return {
    id: String(zeile.id),
    token: String(zeile.token),
    ...(mitAuswahl ? { aktualisiertAm: String(zeile.aktualisiert_am ?? ""), wohnungAuswahl: auswahlAusZeile(zeile.wohnung_auswahl) } : {}),
  };
}

export interface ZeileEingabe {
  /** Wer sendet. Steht als Ersteller in einer neuen Zeile. */
  erstelltVon: string;
  gueltigBis: Date;
  mitArt: boolean;
  /** Die Spalte `wohnung_auswahl` gibt es (Migration 20261005100000). */
  mitAuswahl?: boolean;
}

/**
 * Vorhandene Zeile nehmen oder neu anlegen. `neu` heißt: eben entstanden.
 * Scheitert danach die Mail, entfernt `index.ts` genau so eine Zeile wieder.
 *
 * Eine vorhandene Zeile bekommt hier noch keine neue Frist und keinen neuen
 * Einstieg; das erledigt `versandVermerk`, erst nach einer gelungenen Mail.
 */
export async function zeileFuerVersand(
  db: ZeilenClient,
  a: VersandAuftrag,
  e: ZeileEingabe,
): Promise<{ zeile: KundenlinkZeile; neu: boolean }> {
  const vorhanden = await vorhandeneZeile(db, a, e.mitArt, e.mitAuswahl);
  if (vorhanden) return { zeile: vorhanden, neu: false };

  const uebersicht = a.art === "objektuebersicht";
  const { data, error } = await db
    .from("objekt_exposes")
    .insert({
      objekt_id: a.objektId,
      // Die Objektübersicht gehört zum ganzen Haus, die Wohnung ist nur der Einstieg.
      wohnung_id: uebersicht ? null : a.wohnungId,
      kontakt_id: a.kontaktId,
      investment_id: a.investmentId,
      erstellt_von: e.erstelltVon,
      // Neutrale Annahmen: Der Link rechnet mit Standardwerten, nie mit der Selbstauskunft.
      annahmen: {},
      annahmen_gesperrt: false,
      gueltig_bis: e.gueltigBis.toISOString(),
      ...(e.mitArt ? { art: a.art, einstieg_wohnung_id: uebersicht ? a.wohnungId : null } : {}),
      // Schon beim Anlegen, damit die Zeile nie ohne Einschränkung dasteht.
      ...(e.mitAuswahl && uebersicht && a.wohnungAuswahl ? { wohnung_auswahl: a.wohnungAuswahl } : {}),
    })
    .select("id, token")
    .single();
  if (error) {
    // Zwei Klicks zugleich: Der eindeutige Index ließ nur eine Zeile zu. Die nehmen wir.
    const doppelt = uebersicht && (error as { code?: unknown }).code === "23505";
    const andere = doppelt ? await vorhandeneZeile(db, a, e.mitArt, e.mitAuswahl) : null;
    if (!andere) throw error;
    return { zeile: andere, neu: false };
  }
  const z = (data ?? {}) as { id?: unknown; token?: unknown };
  return {
    zeile: { id: String(z.id), token: String(z.token), ...(e.mitAuswahl ? { wohnungAuswahl: uebersicht ? a.wohnungAuswahl ?? null : null } : {}) },
    neu: true,
  };
}

/**
 * Die neue Wohnungsauswahl einer schon bestehenden Objektübersicht speichern,
 * VOR der Mail (Prüfung Codex, 05.10.2026): Scheitert das Speichern, geht
 * keine Mail hinaus. Gesperrt gegen gleichzeitige Sendungen über
 * `aktualisiert_am` (pflegt der Auslöser `objekt_exposes_touch` bei jeder
 * Änderung): Hat jemand die Zeile seit dem Lesen geändert, trifft das Update
 * nichts, und die Antwort ist `geaendert`.
 *
 * `unveraendert`: nichts zu tun, weil der Auftrag keine Auswahl nennt oder
 * sie gleich ist. `zurueck` stellt die bisherige wieder her, falls danach die
 * Mail scheitert; so bleibt nie eine breitere Freigabe zurück.
 */
export async function auswahlSpeichern(
  db: ZeilenClient,
  zeile: KundenlinkZeile,
  neueAuswahl: string[] | null | undefined,
): Promise<"unveraendert" | "gespeichert" | "geaendert"> {
  if (neueAuswahl === undefined || zeile.wohnungAuswahl === undefined) return "unveraendert";
  if (JSON.stringify(neueAuswahl) === JSON.stringify(zeile.wohnungAuswahl)) return "unveraendert";
  const { data, error } = await db
    .from("objekt_exposes")
    .update({ wohnung_auswahl: neueAuswahl })
    .eq("id", zeile.id)
    .eq("aktualisiert_am", zeile.aktualisiertAm)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length === 1 ? "gespeichert" : "geaendert";
}

/**
 * Was nach dem Versand in die Zeile kommt: gesendet am und von, Weg, neue
 * Frist, und bei der Objektübersicht der Einstieg. So öffnet ein aus
 * Wohnung 9 erneut gesendeter Link danach bei Wohnung 9, und er bleibt
 * derselbe.
 *
 * Die Wohnungsauswahl steht hier bewusst nicht: Sie ist dann schon
 * gespeichert (`auswahlSpeichern`, beim Anlegen in `zeileFuerVersand`).
 */
export function versandVermerk(
  a: VersandAuftrag,
  e: { jetzt: Date; gueltigBis: Date; gesendetVon: string },
): Record<string, unknown> {
  const uebersicht = a.art === "objektuebersicht";
  return {
    gesendet_am: e.jetzt.toISOString(),
    gesendet_von: e.gesendetVon,
    versandweg: a.modus,
    gueltig_bis: e.gueltigBis.toISOString(),
    ...(uebersicht ? { einstieg_wohnung_id: a.wohnungId } : {}),
  };
}
