/**
 * Was ein Projekt in Investagon anbietet, und was daraus fuer das Objekt im
 * CRM folgt.
 *
 * Was eine EINHEIT "angeboten" macht, steht in `_shared/einheit-angebot.ts`:
 * online in Investagon, weder verkauft noch Entwurf. Die Anzeige im Frontend
 * liest dieselbe Datei; anbieten und reservieren koennen Partner nur solche
 * Einheiten.
 *
 * ── Objekte ohne Angebot bleiben sichtbar ───────────────────────────────────
 *
 * Christian hat am 23.09.2026 zweimal entschieden. Am Vormittag: Ein Objekt
 * ohne angebotene Einheit wird ausgeblendet. Der erste Lauf danach blendete
 * 23 Objekte aus, jedes mit dem Vermerk `meta.investagonAusblendung`. Am
 * Nachmittag die Aenderung: Solche Objekte bleiben sichtbar (gruener Punkt)
 * und stehen in der Objektuebersicht unter "Nicht verfuegbar", auch fuer
 * Partner.
 *
 * Daraus folgt dreierlei:
 *
 *   1. Der Import setzt `sichtbar = false` nie mehr wegen fehlenden Angebots.
 *   2. Objekte mit dem Vermerk blendet er wieder ein und entfernt den
 *      Vermerk (`planeRuecknahme`). Ein Objekt ohne Vermerk ist von Hand
 *      ausgeblendet und bleibt es.
 *   3. Ein NEUES Projekt ohne ein einziges Angebot legt er nicht an
 *      (`neueOhneAngebotAussortieren`). Ein Projekt, das in Investagon nie
 *      online war, gehoert nicht ins CRM. Ein vorhandenes Objekt, das offline
 *      geht, bleibt dagegen sichtbar stehen und wird weiter abgeglichen.
 *
 * Die Investagon-API kennt keine Sichtbarkeit am Projekt, nur an der Einheit.
 * Falle: Auch am Objekt steht `meta.investagonRaw.visibility`. Das ist der
 * Wert der ERSTEN Einheit, weil der Import deren Detail unter die
 * Projektdaten mischt (`projektAus` in `index.ts`). Hier wird er nicht
 * benutzt.
 */

import {
  einheitAngebot,
  type EinheitAngebot,
} from "../_shared/einheit-angebot.ts";

/** Was ein Projekt in Investagon anbietet. */
export type ProjektAngebot = "angeboten" | "nicht_angeboten" | "unbekannt";

/**
 * Mehrere Einheitenzustaende zu einem Projektzustand zusammenfassen.
 *
 * Angeboten gewinnt: Ist auch nur eine Einheit online und weder verkauft
 * noch Entwurf, bietet das Projekt etwas an. "Nicht angeboten" heisst es
 * nur, wenn JEDER Wert bekannt ist und keiner angeboten. Ein einziger
 * unbekannter Wert macht das Ganze unbekannt: Eine Luecke in den Daten soll
 * nichts verhindern.
 */
export function zusammenfassen(werte: EinheitAngebot[]): ProjektAngebot {
  if (werte.length === 0) return "unbekannt";
  if (werte.includes("angeboten")) return "angeboten";
  if (werte.includes("unbekannt")) return "unbekannt";
  return "nicht_angeboten";
}

/** Was ein Projekt anbietet, aus den Rohdaten seiner Einheiten. */
export function projektAngebot(
  einheitenRoh: (Record<string, unknown> | null | undefined)[],
): ProjektAngebot {
  return zusammenfassen(einheitenRoh.map(einheitAngebot));
}

/**
 * Neue Projekte ohne Angebot aussortieren, bevor der Abgleich beginnt.
 *
 * `imCrm` enthaelt jede Investagon-Kennung, die schon an einem Objekt steht,
 * Haupt- und Zweitkennungen. Was darin steht, wird immer abgeglichen, auch
 * ohne Angebot, damit Verkaeufe und Stammdaten nachgezogen werden. Nur ein
 * Projekt, das es im CRM noch nicht gibt und das nachweislich nichts
 * anbietet, bleibt draussen. Fehlen die Angaben, wird es angelegt wie
 * bisher.
 */
export function neueOhneAngebotAussortieren<
  P extends { slug: string; einheiten: { roh?: Record<string, unknown> }[] },
>(
  projekte: P[],
  imCrm: Set<string>,
): { behalten: P[]; nichtAngelegt: P[] } {
  const behalten: P[] = [];
  const nichtAngelegt: P[] = [];
  for (const p of projekte) {
    const neuOhneAngebot = !imCrm.has(p.slug) &&
      projektAngebot(p.einheiten.map((e) => e.roh)) === "nicht_angeboten";
    (neuOhneAngebot ? nichtAngelegt : behalten).push(p);
  }
  return { behalten, nichtAngelegt };
}

/**
 * Unter diesem Schluessel stand in `objekte.meta` der Vermerk, mit dem die
 * Fassung vom Vormittag des 23.09.2026 ein Objekt ausgeblendet hat. Neu
 * gesetzt wird er nicht mehr, nur noch zurueckgenommen.
 */
export const VERMERK_SCHLUESSEL = "investagonAusblendung";

/** Traegt dieses Objekt den Vermerk des Imports? */
export function hatVermerk(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return !!meta && meta[VERMERK_SCHLUESSEL] != null;
}

/** Das, was die Ruecknahme ueber ein Objekt wissen muss. */
export interface VermerkObjekt {
  id: string;
  titel?: string | null;
  sichtbar: boolean | null;
  meta: Record<string, unknown> | null;
}

/** Ein Schritt der Ruecknahme, fertig zum Schreiben. */
export interface Ruecknahme {
  id: string;
  titel: string;
  /** Wahr, wenn das Objekt noch ausgeblendet war und eingeblendet wird. */
  einblenden: boolean;
  /** Das `meta` ohne Vermerk, alles andere bleibt stehen. */
  meta: Record<string, unknown>;
}

/**
 * Jede Ausblendung des Imports zuruecknehmen.
 *
 * Objekte mit Vermerk werden sichtbar und verlieren den Vermerk. Ist ein
 * solches Objekt schon wieder sichtbar, etwa weil jemand es von Hand
 * eingeblendet hat, faellt nur der Vermerk weg. Objekte ohne Vermerk kommen
 * nicht vor: Wer sie ausgeblendet hat, war ein Mensch, und dabei bleibt es.
 *
 * Eine Notbremse braucht es hier nicht mehr. Sie war fuer das Ausblenden da,
 * das einen Ausfall der Gegenseite in einen leeren Vertrieb verwandelt
 * haette. Das Einblenden stellt nur den Zustand vor dem ersten Lauf wieder
 * her und betrifft ausschliesslich Objekte, die der Import selbst
 * ausgeblendet hat.
 */
export function planeRuecknahme(objekte: VermerkObjekt[]): Ruecknahme[] {
  const schritte: Ruecknahme[] = [];
  for (const o of objekte) {
    if (!hatVermerk(o.meta)) continue;
    const meta: Record<string, unknown> = { ...(o.meta || {}) };
    delete meta[VERMERK_SCHLUESSEL];
    schritte.push({
      id: o.id,
      titel: o.titel || "",
      einblenden: o.sichtbar !== true,
      meta,
    });
  }
  return schritte;
}

/** Eine Zeile fuer Bericht und Protokoll. */
export function beschreibeRuecknahme(r: Ruecknahme): string {
  return r.einblenden
    ? `"${r.titel}" wieder eingeblendet, Vermerk entfernt`
    : `"${r.titel}" war schon sichtbar, Vermerk entfernt`;
}
