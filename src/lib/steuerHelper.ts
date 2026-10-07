/**
 * Hilfsfunktionen für die Steuerberechnung im Kundenportal.
 *
 * Der Tarif kommt aus genau einer Stelle: src/lib/einkommensteuer.ts
 * (§ 32a EStG, Jahre 2024 bis 2026). Vorher lag hier eine eigene Kopie des
 * Tarifs 2024 mit dem veralteten Grundfreibetrag 11.604 Euro. Standard ist
 * jetzt das aktuelle Steuerjahr. Ohne Soli und Kirchensteuer.
 */

import {
  aktuellesSteuerjahr,
  grenzsteuersatzProzent,
  tariflicheEst,
  zvEFuerGrenzsteuersatz,
  type Steuerjahr,
} from "@/lib/einkommensteuer";

/**
 * Grenzsteuersatz (%) für ein zu versteuerndes Jahreseinkommen nach
 * § 32a EStG. Bei Splitting (verheiratet) wird der Grenzsatz auf das halbe
 * zvE bestimmt. Rückgabe: Prozentwert mit einer Nachkommastelle (z. B. 32.4).
 */
export function estimateGrenzsteuersatz(
  zvE: number,
  verheiratet = false,
  jahr: Steuerjahr = aktuellesSteuerjahr(),
): number {
  if (!isFinite(zvE) || zvE <= 0) return 0;
  const pct = grenzsteuersatzProzent(zvE, jahr, verheiratet ? "splitting" : "grund");
  return Math.round(pct * 10) / 10;
}

/**
 * Tarifliche Einkommensteuer nach § 32a EStG, Splitting nach Abs. 5.
 * Liefert den Steuerbetrag in EUR (volle Euro, wie der amtliche Tarif).
 */
export function berechneEinkommensteuer(
  zvE: number,
  verheiratet = false,
  jahr: Steuerjahr = aktuellesSteuerjahr(),
): number {
  if (!isFinite(zvE) || zvE <= 0) return 0;
  return tariflicheEst(zvE, jahr, verheiratet ? "splitting" : "grund");
}

/**
 * Steuerersparnis nach **Differenzmethode** (§ 32a EStG exakt):
 *   Ersparnis = ESt(zvE) − ESt(zvE − minderung)
 *
 * - `minderung > 0` (z. B. Vermietungsverlust) → positive Ersparnis (Tax-Shield)
 * - `minderung < 0` (z. B. Gewinn aus V+V)     → negative Ersparnis (Mehrsteuer)
 *
 * Rechnet die effektive Durchschnittsbelastung auf die Minderung exakt aus,
 * das vermeidet die Überschätzung durch reines Multiplizieren mit dem Grenzsatz.
 *
 * Rückgabe:
 *  - ersparnis: EUR
 *  - effektiverSatzP: durchschnittlicher Steuersatz auf die Minderung in %
 */
export function berechneSteuerersparnis(
  zvE: number,
  minderung: number,
  verheiratet = false,
  jahr: Steuerjahr = aktuellesSteuerjahr(),
): { ersparnis: number; effektiverSatzP: number } {
  // zvE 0 ist eine gültige Ausgangslage: Ein Überschuss wird dann ab dem
  // ersten Euro nach Tarif besteuert (nach dem Grundfreibetrag), ein Verlust
  // spart nichts, weil die Steuer nicht unter 0 fällt.
  if (!isFinite(minderung) || minderung === 0 || !isFinite(zvE) || zvE < 0) {
    return { ersparnis: 0, effektiverSatzP: 0 };
  }
  const estVor = berechneEinkommensteuer(zvE, verheiratet, jahr);
  const estNach = berechneEinkommensteuer(Math.max(0, zvE - minderung), verheiratet, jahr);
  const ersparnis = estVor - estNach;
  const effektiverSatzP = Math.abs(minderung) > 0
    ? (ersparnis / minderung) * 100
    : 0;
  return { ersparnis, effektiverSatzP: Math.round(effektiverSatzP * 10) / 10 };
}

/**
 * Berechnet eine grobe Schätzung des zu versteuernden Einkommens
 * aus dem Brutto-Jahreseinkommen (ca. 70 % bei AN nach Sozialabgaben & Pauschalen).
 */
export function bruttoZuZvE(bruttoJahr: number): number {
  return Math.round(bruttoJahr * 0.7);
}

/**
 * Ein Betrag aus der Selbstauskunft als Zahl.
 *
 * Das Formular speichert Beträge als Text in deutscher Schreibweise
 * ("90.000,00"), ältere Bestände und Testdaten enthalten blanke Zahlen.
 * `Number("90.000,00")` ergibt NaN, deshalb wird hier ausdrücklich gelesen:
 * Punkte sind Tausendertrenner, das Komma ist das Dezimalzeichen.
 * Ein negatives Jahresbrutto gibt es nicht, es zählt als keine Angabe.
 */
function betragAusSa(wert: unknown): number {
  if (typeof wert === "number") return isFinite(wert) && wert > 0 ? wert : 0;
  if (typeof wert !== "string") return 0;
  const roh = wert.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const zahl = parseFloat(roh);
  return isFinite(zahl) && zahl > 0 ? zahl : 0;
}

/**
 * Aggregiert das Brutto-Jahreseinkommen aus der Selbstauskunft (beide Personen).
 * Sucht in invMeta.saData oder fallback in saSnapshot/kontaktMeta.
 *
 * Maßgeblich ist `bruttoJahr`, für die zweite Person `person2Data.bruttoJahr`.
 * Genau diese Schlüssel schreibt das Selbstauskunft-Formular, und nur sie
 * kommen auch aus der ausfüllbaren PDF (saPdfFormular.ts).
 *
 * Vorher stand hier ausschließlich `einkommenBruttoJahr`. Diesen Schlüssel hat
 * nie eine Stelle geschrieben, die Funktion lieferte deshalb fast immer 0 und
 * der Investmentrechner konnte kein Jahresbrutto übernehmen. Der alte Weg
 * bleibt als Rückfall stehen, damit Altbestände und die Musterdaten der Tests
 * unverändert weiterlaufen.
 *
 * Die zweite Person zählt nur, wenn die Selbstauskunft überhaupt eine zweite
 * Person führt (`person2`). Ein liegengebliebener Entwurf in `person2Data`
 * würde das Haushaltseinkommen sonst zu hoch ausweisen.
 */
export function getBruttoFromSA(saData: any): number {
  if (!saData) return 0;
  const p1 =
    betragAusSa(saData?.bruttoJahr) ||
    betragAusSa(saData?.person1?.bruttoJahr) ||
    betragAusSa(saData?.person1?.einkommenBruttoJahr) ||
    betragAusSa(saData?.einkommenBruttoJahr);
  const p2 = saData?.person2
    ? betragAusSa(saData?.person2Data?.bruttoJahr) ||
      betragAusSa(saData?.person2?.bruttoJahr) ||
      betragAusSa(saData?.person2?.einkommenBruttoJahr)
    : 0;
  return p1 + p2;
}

/**
 * Das zu versteuernde Jahreseinkommen, wie es in der Selbstauskunft steht
 * (`zvEJahr`, freiwillig, seit 05.10.2026). `null` heißt: keine Angabe, dann
 * bleibt es bei der Schätzung aus dem Brutto (`bruttoZuZvE`). Eine
 * eingetragene 0 gilt, sie ist etwa im Jahr einer Elternzeit echt.
 *
 * Gelesen wird nur Person 1. Bei Ehe oder Lebenspartnerschaft steht dort das
 * gemeinsame zvE des Steuerbescheids, das Formular führt dann für Person 2
 * kein eigenes Feld. Ohne Zusammenveranlagung wird jede Person nach der
 * Grundtabelle getrennt besteuert, die Summe zweier zvE wäre also keine
 * Steuergröße. Der Rechner rechnet für den Kunden, das ist Person 1.
 */
export function getZvEFromSA(saData: any): number | null {
  if (!saData) return null;
  const roh = istAngegeben(saData?.zvEJahr) ? saData.zvEJahr : saData?.person1?.zvEJahr;
  return istAngegeben(roh) ? betragAusSa(roh) : null;
}

/** Leer oder fehlend heißt keine Angabe; eine eingetragene 0 ist eine. */
function istAngegeben(wert: unknown): boolean {
  if (typeof wert === "number") return isFinite(wert);
  return typeof wert === "string" && /\d/.test(wert);
}

/**
 * Das zvE, mit dem eine Steuerrechnung aus der Selbstauskunft arbeitet: die
 * Angabe aus der Selbstauskunft, sonst die Schätzung aus dem Brutto. `null`,
 * wenn die Selbstauskunft weder das eine noch das andere hergibt.
 *
 * Die eine Regel für Investmentrechner, Steuer-Cockpit und Exposé-Annahmen.
 * Bei Zusammenveranlagung ist `zvE` das gemeinsame und wird mit dem
 * Splittingtarif gerechnet (`getVerheiratetFromSA`). `angegeben` sagt, ob der
 * Wert wörtlich in der Selbstauskunft steht, für die Kennzeichnung.
 */
export function zvEFuerRechnungAusSA(saData: any): { zvE: number; angegeben: boolean } | null {
  const angabe = getZvEFromSA(saData);
  if (angabe !== null) return { zvE: angabe, angegeben: true };
  const brutto = getBruttoFromSA(saData);
  return brutto > 0 ? { zvE: bruttoZuZvE(brutto), angegeben: false } : null;
}

/**
 * Splitting gibt es nur bei Ehe oder eingetragener Lebenspartnerschaft
 * (§ 26, § 32a Abs. 5 EStG). Eine zweite Person in der Selbstauskunft allein,
 * etwa ein unverheiratetes Paar, begründet kein Splitting. Deshalb zählt hier
 * ausschließlich der Familienstand.
 */
export function getVerheiratetFromSA(saData: any): boolean {
  if (!saData) return false;
  const fam = String(saData?.person1?.familienstand ?? saData?.familienstand ?? "").toLowerCase();
  return fam.includes("verheiratet") || fam.includes("lebenspartner");
}

/**
 * Liefert empfohlenen Steuersatz aus SA, oder fallback Default.
 */
export function suggestSteuersatz(saData: any, fallback = 42): number {
  const z = zvEFuerRechnungAusSA(saData);
  if (!z) return fallback;
  return estimateGrenzsteuersatz(z.zvE, getVerheiratetFromSA(saData));
}

/**
 * Liefert das kleinste zvE, bei dem der gegebene Grenzsteuersatz erreicht wird
 * (Umkehrung des Tarifs, in den 42/45-Prozent-Zonen die Zonenuntergrenze).
 *
 * Nur eine Näherung für Vorbelegungen von Reglern und Anzeigen. Für den
 * angezeigten Steuereffekt gilt: Ist nur der Satz bekannt, rechnen die
 * Kundenkarten flach mit dem Grenzsatz und kennzeichnen das Ergebnis als
 * Schätzwert, statt aus dieser Rückrechnung eine Differenzmethode zu bauen.
 */
export function reverseSteuersatzZuZvE(
  satzP: number,
  verheiratet = false,
  jahr: Steuerjahr = aktuellesSteuerjahr(),
): number {
  const zvESingle = zvEFuerGrenzsteuersatz(satzP, jahr);
  return verheiratet ? zvESingle * 2 : zvESingle;
}
