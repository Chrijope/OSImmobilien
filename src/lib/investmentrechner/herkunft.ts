/**
 * Woher ein Wert im Investmentrechner stammt.
 *
 * Der Rechner füllt Felder aus drei fremden Quellen: aus der Selbstauskunft
 * des Kunden, aus der KI-Auslesung der Objektunterlagen und aus der
 * Objektanlage. Bisher war das nur im Moment der Übernahme zu sehen. Danach
 * stand die Zahl da wie jede andere, und niemand konnte mehr sagen, ob sie
 * eingetippt oder übernommen war.
 *
 * Deshalb merkt sich der Rechner je Feld einen Eintrag mit einem fertigen
 * Satz, der klein unter dem Feld steht. Sobald jemand das Feld selbst ändert,
 * wird der Eintrag auf „eigen" gesetzt und der Satz verschwindet.
 *
 * Das Modul ist rein: keine Seiteneffekte, kein Datenzugriff.
 */

import type { InvestmentEingabe } from "./rechenkern";

/** Die vier Quellen. „eigen" heißt: von Hand eingetragen, kein Hinweis. */
export type Herkunftsquelle = "selbstauskunft" | "unterlagen" | "objekt" | "eigen";

export interface Herkunftseintrag {
  quelle: Herkunftsquelle;
  /** Der Satz unter dem Feld, etwa „Aus der Selbstauskunft vom 12.08.2026". */
  text: string;
  /** Stand der Quelle als ISO-Datum, soweit bekannt. */
  stand?: string;
  /**
   * Beim Öffnen automatisch aus den Unterlagen übernommen (seit dem
   * 28.09.2026). Die Übernahmeliste zeigt das Feld dann mit „Zurücknehmen“,
   * `vorher` ist der Wert davor.
   */
  automatisch?: boolean;
  vorher?: number | string;
}

/** Je Feld der Eingabe höchstens ein Eintrag. */
export type Herkunft = Partial<Record<keyof InvestmentEingabe, Herkunftseintrag>>;

/** Einen Eintrag für mehrere Felder setzen. Gibt eine neue Ablage zurück. */
export function setzeHerkunft(
  bisher: Herkunft,
  felder: readonly (keyof InvestmentEingabe)[],
  eintrag: Herkunftseintrag,
): Herkunft {
  if (felder.length === 0) return bisher;
  const naechste: Herkunft = { ...bisher };
  for (const feld of felder) naechste[feld] = eintrag;
  return naechste;
}

/**
 * Felder, die der Nutzer selbst geändert hat, verlieren ihren Hinweis.
 *
 * Der Eintrag wird nicht gelöscht, sondern auf „eigen" gesetzt. Beim
 * Speichern steht damit auch fest, dass ein übernommener Wert bewusst
 * überschrieben wurde, und nicht nur, dass nichts bekannt ist.
 */
export function aufEigenSetzen(bisher: Herkunft, felder: readonly (keyof InvestmentEingabe)[]): Herkunft {
  let naechste: Herkunft | null = null;
  for (const feld of felder) {
    const vorhanden = bisher[feld];
    if (vorhanden?.quelle === "eigen") continue;
    naechste = naechste ?? { ...bisher };
    naechste[feld] = { quelle: "eigen", text: "" };
  }
  return naechste ?? bisher;
}

/**
 * Die Herkunft für ein Vergleichsobjekt: Werte gelten dort als übernommen,
 * nicht als automatisch gesetzt. „Zurücknehmen“ gibt es nur beim eigenen
 * Objekt (LOTSE-R5-004).
 */
export function ohneAutomatik(bisher: Herkunft): Herkunft {
  const naechste: Herkunft = {};
  for (const [feld, eintrag] of Object.entries(bisher) as Array<[keyof InvestmentEingabe, Herkunftseintrag | undefined]>) {
    if (!eintrag) continue;
    const { automatisch: _automatisch, vorher: _vorher, ...rest } = eintrag;
    naechste[feld] = rest;
  }
  return naechste;
}

/** Der Satz unter einem Feld, oder leer, wenn keiner anzuzeigen ist. */
export function herkunftText(herkunft: Herkunft | undefined, feld: keyof InvestmentEingabe): string | undefined {
  const eintrag = herkunft?.[feld];
  if (!eintrag || eintrag.quelle === "eigen" || !eintrag.text) return undefined;
  return eintrag.text;
}

/**
 * Eine gespeicherte Herkunft prüfen, bevor sie in den Rechner geht.
 *
 * Der JSON-Stand aus der Datenbank kann alt oder fremd sein. Übernommen wird
 * nur, was ein bekanntes Feld mit bekannter Quelle und einem Text ist.
 */
export function herkunftAusJson(roh: unknown, bekannteFelder: readonly string[]): Herkunft {
  if (!roh || typeof roh !== "object") return {};
  const quellen: readonly string[] = ["selbstauskunft", "unterlagen", "objekt", "eigen"];
  const ergebnis: Herkunft = {};
  for (const [feld, wert] of Object.entries(roh as Record<string, unknown>)) {
    if (!bekannteFelder.includes(feld)) continue;
    if (!wert || typeof wert !== "object") continue;
    const { quelle, text, stand, automatisch, vorher } = wert as Record<string, unknown>;
    if (typeof quelle !== "string" || !quellen.includes(quelle)) continue;
    if (typeof text !== "string") continue;
    // Seit dem 28.09.2026 auch „automatisch“ und der Wert davor, sonst ginge
    // „Zurücknehmen“ nach Speichern und Laden verloren (LOTSE-R5-005).
    const vorherGueltig = (typeof vorher === "number" && Number.isFinite(vorher)) || (typeof vorher === "string" && vorher.length <= 300);
    ergebnis[feld as keyof InvestmentEingabe] = {
      quelle: quelle as Herkunftsquelle,
      text: text.slice(0, 300),
      stand: typeof stand === "string" ? stand : undefined,
      ...(automatisch === true && quelle === "unterlagen" ? { automatisch: true } : {}),
      ...(automatisch === true && quelle === "unterlagen" && vorherGueltig ? { vorher: vorher as number | string } : {}),
    };
  }
  return ergebnis;
}
