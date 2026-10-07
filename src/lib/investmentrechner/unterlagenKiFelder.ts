/**
 * KI-Auslesung der Rechnerfelder aus Objektunterlagen.
 *
 * Dieses Modul ist rein: Es kennt die Felder des Investmentrechners, die sich
 * aus Unterlagen (Exposé, Preisliste, Teilungserklärung, Mietvertrag,
 * Wirtschaftsplan) belegen lassen, bereitet die Unterlagen für die Anfrage
 * vor und bildet die Antwort der Edge Function `investmentrechner-unterlagen`
 * auf Übernahmevorschläge ab. Der eigentliche Aufruf steht in
 * unterlagenKiAufruf.ts, damit dieses Modul ohne Supabase testbar bleibt.
 *
 * Grundsatz wie in objektVorbelegung.ts: Ein falsch belegtes Feld ist
 * schlimmer als eine Lücke. Deshalb wird jeder Wert auf Typ und Plausibilität
 * geprüft, und nichts wird ohne Klick übernommen.
 */

import { standardEingabe, type InvestmentEingabe } from "./rechenkern";
import type { Herkunft, Herkunftseintrag } from "./herkunft";
import { formatEuro, formatProzent } from "./formatierer";
import { parseDeutscheZahl, type UnterlagenDokument } from "./unterlagenAuslesen";

/** Wie sicher sich die KI bei einem Wert ist. */
export type Sicherheit = "hoch" | "mittel" | "niedrig";

/** Ein Feld in der Antwort der Edge Function. */
export interface KiFeldwert {
  wert: number | string;
  /** Dateiname und Seite, so wie die KI es angibt. */
  quelle: string;
  sicherheit: Sicherheit;
}

/** Antwort der Edge Function, bevor sie geprüft wurde. */
export interface KiAntwort {
  ausleseVersion?: number;
  felder: Partial<Record<AuslesbaresFeld, KiFeldwert>>;
  hinweise: string[];
}

/** Einheit eines Feldes, bestimmt Anzeige und Prüfung. */
export type Feldeinheit = "euro" | "quadratmeter" | "prozent" | "jahr" | "anzahl" | "text";

export interface Feldbeschreibung {
  feld: AuslesbaresFeld;
  /** Beschriftung wortgleich mit dem Eingabefeld im Rechner. */
  label: string;
  einheit: Feldeinheit;
  /** Zulässiger Bereich, außerhalb wird der Wert verworfen. */
  min?: number;
  max?: number;
}

/** Die Rechnerfelder, die aus Unterlagen kommen können. Kundenfelder bewusst nicht. */
export type AuslesbaresFeld =
  | "address"
  | "propertyType"
  | "area"
  | "rooms"
  | "constructionYear"
  | "purchasePrice"
  | "furniturePrice"
  | "transferTaxRate"
  | "notaryRate"
  | "landRegisterRate"
  | "otherPurchaseCostRate"
  | "equity"
  | "seniorInterestRate"
  | "seniorRepaymentRate"
  | "monthlyColdRent"
  | "monthlyOperatingCosts"
  | "buildingShare"
  | "buildingDepreciationRate"
  | "specialDepreciationRate"
  | "rehabExpense";

const AKTUELLES_JAHR = new Date().getFullYear();

/**
 * Reihenfolge wie im Rechner: Objekt, Kaufnebenkosten, Finanzierung, Miete,
 * Steuer. Die Übernahmeliste zeigt die Felder in dieser Reihenfolge.
 */
export const AUSLESBARE_FELDER: readonly Feldbeschreibung[] = [
  { feld: "address", label: "Adresse", einheit: "text" },
  { feld: "propertyType", label: "Objekttyp", einheit: "text" },
  { feld: "area", label: "Wohnfläche", einheit: "quadratmeter", min: 5, max: 2000 },
  { feld: "rooms", label: "Zimmer", einheit: "anzahl", min: 0.5, max: 30 },
  { feld: "constructionYear", label: "Baujahr", einheit: "jahr", min: 1800, max: AKTUELLES_JAHR + 5 },
  { feld: "purchasePrice", label: "Kaufpreis", einheit: "euro", min: 1000, max: 50_000_000 },
  { feld: "furniturePrice", label: "davon Möbel/Inventar", einheit: "euro", min: 0, max: 1_000_000 },
  { feld: "transferTaxRate", label: "Grunderwerbsteuer", einheit: "prozent", min: 0, max: 10 },
  { feld: "notaryRate", label: "Notar", einheit: "prozent", min: 0, max: 5 },
  { feld: "landRegisterRate", label: "Grundbuch", einheit: "prozent", min: 0, max: 5 },
  { feld: "otherPurchaseCostRate", label: "Sonstige KNK", einheit: "prozent", min: 0, max: 20 },
  { feld: "equity", label: "Eigenkapital", einheit: "euro", min: 0, max: 50_000_000 },
  { feld: "seniorInterestRate", label: "Sollzins p. a.", einheit: "prozent", min: 0, max: 15 },
  { feld: "seniorRepaymentRate", label: "Anfängliche Tilgung", einheit: "prozent", min: 0, max: 20 },
  { feld: "monthlyColdRent", label: "Kaltmiete p. M.", einheit: "euro", min: 1, max: 100_000 },
  { feld: "monthlyOperatingCosts", label: "Nicht umlagefähige Kosten p. M.", einheit: "euro", min: 0, max: 50_000 },
  { feld: "buildingShare", label: "Gebäudeanteil", einheit: "prozent", min: 1, max: 100 },
  { feld: "buildingDepreciationRate", label: "AfA p. a.", einheit: "prozent", min: 0.5, max: 10 },
  { feld: "specialDepreciationRate", label: "Sonder-AfA p. a.", einheit: "prozent", min: 0, max: 10 },
  { feld: "rehabExpense", label: "davon Erhaltungsaufwand", einheit: "euro", min: 0, max: 10_000_000 },
];

/** Die drei Sätze, die sonst aus der Bundeslandauswahl kommen. */
export const KNK_FELDER: readonly AuslesbaresFeld[] = ["transferTaxRate", "notaryRate", "landRegisterRate"];

/** Ein Dokument, so wie es an die Edge Function geht: Text je Seite. */
export interface AnfrageDokument {
  name: string;
  kategorie: string;
  seiten: string[];
  /** Nur für Unterlagen ohne Textebene (Scans), als data-URL ohne Präfix. */
  pdfBase64?: string;
  /** Aus der Objektablage, siehe `UnterlagenDokument.ablage`. */
  url?: string;
  ebene?: "objekt" | "einheit";
  rot?: boolean;
  investagonKategorie?: string;
}

export type Abgleich = "leer" | "bestaetigt" | "abweichend";

/**
 * Steht im Feld schon ein Wert?
 *
 * Belegt ist, was eine Herkunft hat: aus den Einheitsdaten, aus der
 * Selbstauskunft, aus einer früheren Übernahme oder von Hand eingetragen,
 * auch wenn der Wert 0 oder die Voreinstellung ist, etwa ein gepflegter
 * Gebäudeanteil von 80 Prozent (LOTSE-R4-003). Ohne Herkunft gilt wie bisher:
 * 0, leerer Text und die Voreinstellung des Rechners sind leer.
 */
export function feldBelegt(feld: AuslesbaresFeld, wert: number | string, herkunft?: Herkunftseintrag): boolean {
  if (herkunft) return true;
  if (typeof wert === "string") return wert.trim() !== "";
  return Number.isFinite(wert) && wert !== 0 && wert !== standardEingabe[feld];
}

/**
 * Nennen hinterlegter Wert und Unterlage dasselbe? Beträge auf ganze Euro
 * gerundet, Flächen auf einen halben Quadratmeter genau, Texte ohne Groß- und
 * Kleinschreibung und Leerzeichen am Rand.
 */
export function stimmtUeberein(einheit: Feldeinheit, hinterlegt: number | string, ausgelesen: number | string): boolean {
  if (typeof hinterlegt === "string" || typeof ausgelesen === "string") {
    return String(hinterlegt).trim().toLowerCase() === String(ausgelesen).trim().toLowerCase();
  }
  if (einheit === "euro") return Math.round(hinterlegt) === Math.round(ausgelesen);
  if (einheit === "quadratmeter") return Math.abs(hinterlegt - ausgelesen) <= 0.5;
  return Math.abs(hinterlegt - ausgelesen) < 1e-9;
}

/** Ein Vorschlag in der Übernahmeliste. */
export interface Uebernahmevorschlag {
  feld: AuslesbaresFeld;
  label: string;
  einheit: Feldeinheit;
  /** Geprüfter Wert, so wie er in die Eingabe geschrieben würde. */
  wert: number | string;
  /** Der Wert, der heute im Rechner steht. */
  aktuell: number | string;
  quelle: string;
  sicherheit: Sicherheit;
  /** Der Wert steht schon so im Rechner, eine Übernahme ändert nichts. */
  unveraendert: boolean;
  /**
   * Abgleich mit dem, was schon im Rechner steht (Christians Vorgabe vom
   * 28.09.2026): Die hinterlegten Einheitsdaten sind die Grundlage, die
   * Unterlagen die Gegenprobe.
   *   „leer“        Feld leer oder Voreinstellung: vorausgewählt, wenn sicher.
   *   „bestaetigt“  Unterlage bestätigt den Wert: nur kennzeichnen.
   *   „abweichend“  Unterlage nennt etwas anderes: nie vorausgewählt, deutlich
   *                 zeigen, der Nutzer entscheidet.
   */
  abgleich: Abgleich;
  /** Beim Öffnen automatisch übernommen, lässt sich per Klick zurücknehmen. */
  automatisch?: boolean;
  /** Häkchen vorbelegt: hohe Sicherheit und ein anderer Wert als heute. */
  vorausgewaehlt: boolean;
}

/** Mehr Text je Dokument schickt der Rechner nicht, die Function kappt zusätzlich. */
export const MAX_ZEICHEN_JE_DOKUMENT = 60_000;

/**
 * Seiten eines Dokuments. Neue Uploads bringen sie fertig mit; ältere
 * Zustände haben nur den Gesamttext, in dem jede Zeile eine Seite ist, so
 * fügt pdfTextAuslesen sie zusammen.
 */
export function dokumentSeiten(dokument: Pick<UnterlagenDokument, "seiten" | "text">): string[] {
  const seiten = dokument.seiten ?? dokument.text.split("\n");
  return seiten.map((seite) => seite.trim());
}

/**
 * Die lesbaren Unterlagen für die Anfrage vorbereiten. Unterlagen ohne
 * Text (Scans) kommen hier ohne Seiten heraus; ob sie als PDF mitgehen,
 * entscheidet der Aufruf, weil er die Datei dafür lesen muss.
 */
export function anfrageDokument(dokument: UnterlagenDokument): AnfrageDokument | null {
  if (dokument.status === "reading" || dokument.status === "error") return null;
  let budget = MAX_ZEICHEN_JE_DOKUMENT;
  const seiten: string[] = [];
  for (const seite of dokumentSeiten(dokument)) {
    if (budget <= 0) break;
    const stueck = seite.slice(0, budget);
    budget -= stueck.length;
    seiten.push(stueck);
  }
  const ablage = dokument.ablage;
  return {
    name: dokument.name,
    kategorie: dokument.category,
    seiten,
    ...(ablage
      ? { url: ablage.url, ebene: ablage.ebene, rot: ablage.rot, ...(ablage.investagonKategorie ? { investagonKategorie: ablage.investagonKategorie } : {}) }
      : {}),
  };
}

export function anfrageDokumente(documents: readonly UnterlagenDokument[]): AnfrageDokument[] {
  return documents.map(anfrageDokument).filter((dokument): dokument is AnfrageDokument => dokument !== null);
}

/** Hat ein vorbereitetes Dokument überhaupt Text? Sonst hilft nur die PDF selbst. */
export function hatText(dokument: AnfrageDokument): boolean {
  return dokument.seiten.some((seite) => seite.length > 0);
}

/** Gibt es mindestens eine Unterlage, die sich auslesen lässt? */
export function unterlagenAuslesbar(documents: readonly UnterlagenDokument[]): boolean {
  return documents.some(
    (dokument) =>
      dokument.status === "done" || (dokument.status === "manual" && dokument.datei !== undefined),
  );
}

const SICHERHEITEN: readonly Sicherheit[] = ["hoch", "mittel", "niedrig"];

function alsSicherheit(wert: unknown): Sicherheit {
  return typeof wert === "string" && (SICHERHEITEN as readonly string[]).includes(wert)
    ? (wert as Sicherheit)
    : "niedrig";
}

/**
 * Einen Zahlenwert aus der Antwort prüfen. Zahlen werden genommen wie sie
 * sind, Texte wie „241.500,00 €" über parseDeutscheZahl. Alles außerhalb des
 * zulässigen Bereichs wird verworfen, null bedeutet: kein brauchbarer Wert.
 */
export function zahlPruefen(beschreibung: Feldbeschreibung, roh: unknown): number | null {
  let zahl: number;
  if (typeof roh === "number") zahl = roh;
  else if (typeof roh === "string" && roh.trim()) zahl = parseDeutscheZahl(roh);
  else return null;
  if (!Number.isFinite(zahl)) return null;
  // Ein Gebäudeanteil als Bruchteil („0,8") ist eindeutig ein Prozentsatz.
  if (beschreibung.feld === "buildingShare" && zahl > 0 && zahl <= 1) zahl *= 100;
  if (beschreibung.einheit === "jahr" || beschreibung.einheit === "anzahl") {
    // Baujahr und Zimmer sind ganz oder halb, alles Feinere ist Rauschen.
    zahl = beschreibung.einheit === "jahr" ? Math.round(zahl) : Math.round(zahl * 2) / 2;
  } else {
    zahl = Math.round(zahl * 100) / 100;
  }
  if (beschreibung.min !== undefined && zahl < beschreibung.min) return null;
  if (beschreibung.max !== undefined && zahl > beschreibung.max) return null;
  return zahl;
}

function textPruefen(roh: unknown): string | null {
  if (typeof roh !== "string") return null;
  const text = roh.replace(/\s+/g, " ").trim();
  return text.length >= 2 && text.length <= 200 ? text : null;
}

/** Ein Wert für die Anzeige, mit Einheit und deutschem Zahlenformat. */
export function vorschlagswertFormatiert(einheit: Feldeinheit, wert: number | string): string {
  if (typeof wert === "string") return wert || "leer";
  switch (einheit) {
    case "euro":
      return formatEuro(wert);
    case "prozent":
      return formatProzent(wert / 100);
    case "quadratmeter":
      return `${wert.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²`;
    case "jahr":
      return wert > 0 ? String(wert) : "leer";
    case "anzahl":
      return wert.toLocaleString("de-DE", { maximumFractionDigits: 1 });
    default:
      return String(wert);
  }
}

/**
 * Die Antwort der Edge Function in geprüfte Übernahmevorschläge abbilden.
 *
 * Unbekannte Felder, fehlende oder unplausible Werte fallen weg. Die
 * Reihenfolge folgt AUSLESBARE_FELDER, nicht der Antwort.
 */
export function kiAntwortInVorschlaege(antwort: unknown, aktuell: InvestmentEingabe, herkunft?: Herkunft): Uebernahmevorschlag[] {
  const felder =
    antwort && typeof antwort === "object" && "felder" in antwort
      ? (antwort as { felder: unknown }).felder
      : null;
  if (!felder || typeof felder !== "object") return [];
  const roh = felder as Record<string, unknown>;
  const vorschlaege: Uebernahmevorschlag[] = [];
  for (const beschreibung of AUSLESBARE_FELDER) {
    const eintrag = roh[beschreibung.feld];
    if (!eintrag || typeof eintrag !== "object") continue;
    const { wert: rohwert, quelle, sicherheit } = eintrag as Partial<KiFeldwert>;
    const wert = beschreibung.einheit === "text" ? textPruefen(rohwert) : zahlPruefen(beschreibung, rohwert);
    if (wert === null) continue;
    const heutigerWert = aktuell[beschreibung.feld];
    const abgleich: Abgleich = !feldBelegt(beschreibung.feld, heutigerWert, herkunft?.[beschreibung.feld])
      ? "leer"
      : stimmtUeberein(beschreibung.einheit, heutigerWert, wert) ? "bestaetigt" : "abweichend";
    const unveraendert = heutigerWert === wert || abgleich === "bestaetigt";
    const gesichert = alsSicherheit(sicherheit);
    vorschlaege.push({
      feld: beschreibung.feld,
      label: beschreibung.label,
      einheit: beschreibung.einheit,
      wert,
      aktuell: heutigerWert,
      quelle: typeof quelle === "string" ? quelle.trim().slice(0, 200) : "",
      sicherheit: gesichert,
      unveraendert,
      abgleich,
      // Nur ein leeres Feld wird vorbelegt. Eine Abweichung entscheidet der Nutzer.
      vorausgewaehlt: gesichert === "hoch" && abgleich === "leer" && !unveraendert,
    });
  }
  return vorschlaege;
}

/**
 * Die Übernahmeliste für beide Wege, manuell und automatisch.
 *
 * Wie `kiAntwortInVorschlaege`, dazu: Ein Feld, das beim Öffnen automatisch
 * übernommen wurde und noch diesen Wert trägt, erscheint als „automatisch
 * übernommen“ mit Zurücknehmen, nicht als Bestätigung. Nennt eine neue
 * Auslesung dafür einen anderen Wert, bleibt die Automatik-Zeile mit
 * Zurücknehmen stehen, und die Abweichung kommt als eigene Zeile dazu
 * (LOTSE-R7-004).
 */
export function abgleichListe(antwort: unknown, aktuell: InvestmentEingabe, herkunft: Herkunft = {}): Uebernahmevorschlag[] {
  return kiAntwortInVorschlaege(antwort, aktuell, herkunft).flatMap((v) => {
    if (!herkunft[v.feld]?.automatisch) return [v];
    if (v.abgleich === "bestaetigt") return [{ ...v, automatisch: true, vorausgewaehlt: false }];
    return [...automatikZeilen(aktuell, { [v.feld]: herkunft[v.feld] }), v];
  });
}

/**
 * Zeilen für automatisch übernommene Werte, allein aus der Herkunft und dem
 * aktuellen Wert (LOTSE-R6-004). So steht „Zurücknehmen“ auch in einer
 * geladenen Berechnung oder ohne neue Auslesung da.
 */
export function automatikZeilen(aktuell: InvestmentEingabe, herkunft: Herkunft = {}): Uebernahmevorschlag[] {
  return AUSLESBARE_FELDER.flatMap((b) => {
    const eintrag = herkunft[b.feld];
    if (!eintrag?.automatisch) return [];
    const wert = aktuell[b.feld];
    return [{
      feld: b.feld, label: b.label, einheit: b.einheit, wert, aktuell: wert,
      quelle: eintrag.text.replace(/^Aus /, ""), sicherheit: "hoch" as const,
      unveraendert: true, abgleich: "bestaetigt" as const, automatisch: true, vorausgewaehlt: false,
    }];
  });
}

/** Nur leere Felder, nur sichere Werte mit Quelle, nie Kundenangaben: Das darf der automatische Weg selbst setzen. */
export const PERSOENLICHE_FELDER = new Set<AuslesbaresFeld>(["equity", "seniorInterestRate", "seniorRepaymentRate"]);
export function automatischUebernehmbar(v: Uebernahmevorschlag): boolean {
  return !PERSOENLICHE_FELDER.has(v.feld) && v.abgleich === "leer" && !v.unveraendert && v.sicherheit === "hoch" && !!v.quelle;
}

/**
 * Ab dieser Version der Edge Function meldet die KI den Gesamtkaufpreis
 * samt Möbeln und die Möbel als „davon“. Bis Version 2 fragte sie den
 * Kaufpreis ohne Möbel ab.
 */
export const AUSLESE_VERSION_GESAMTKAUFPREIS = 3;

/**
 * Eine Antwort der alten Edge Function auf den Gesamtkaufpreis umrechnen.
 *
 * Seit dem 25.09.2026 ist der Kaufpreis im Rechner der Gesamtkaufpreis,
 * Möbel sind ein Anteil darin. Solange die neue Function noch nicht
 * ausgerollt ist, liefert die alte den Kaufpreis ohne Möbel. Ohne diese
 * Umrechnung stünde dann ein um die Möbel zu kleiner Kaufpreis im Feld. Nennt
 * die alte Antwort beide Beträge, wird der Kaufpreis um die Möbel ergänzt;
 * nennt sie keine Möbel, bleibt er, wie er ist. Neue Antworten bleiben
 * unberührt.
 */
export function kiAntwortAufGesamtkaufpreis(antwort: KiAntwort): KiAntwort {
  if (!antwort || typeof antwort !== "object" || !antwort.felder) return antwort;
  if ((antwort.ausleseVersion ?? 0) >= AUSLESE_VERSION_GESAMTKAUFPREIS) return antwort;
  const kaufpreis = antwort.felder.purchasePrice;
  const moebel = antwort.felder.furniturePrice;
  if (!kaufpreis || !moebel) return antwort;
  const preis = zahlPruefen(AUSLESBARE_FELDER.find((f) => f.feld === "purchasePrice")!, kaufpreis.wert);
  const moebelBetrag = zahlPruefen(AUSLESBARE_FELDER.find((f) => f.feld === "furniturePrice")!, moebel.wert);
  if (preis === null || moebelBetrag === null) return antwort;
  return {
    ...antwort,
    felder: {
      ...antwort.felder,
      purchasePrice: {
        ...kaufpreis,
        wert: preis + moebelBetrag,
        quelle: [kaufpreis.quelle, `plus Möbel ${formatEuro(moebelBetrag)}`].filter(Boolean).join(", "),
      },
    },
  };
}

/** Hinweise der KI als saubere Textliste, ohne Leerzeilen und Ausreißer. */
export function kiHinweise(antwort: unknown): string[] {
  const hinweise =
    antwort && typeof antwort === "object" && "hinweise" in antwort
      ? (antwort as { hinweise: unknown }).hinweise
      : null;
  if (!Array.isArray(hinweise)) return [];
  return hinweise
    .filter((eintrag): eintrag is string => typeof eintrag === "string")
    .map((eintrag) => eintrag.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Die ausgewählten Vorschläge in eine Änderung der Eingabe übersetzen.
 * Nur was ausgewählt ist, wird geschrieben.
 */
export function uebernahmeAnwenden(
  vorschlaege: readonly Uebernahmevorschlag[],
  ausgewaehlt: ReadonlySet<AuslesbaresFeld>,
): Partial<InvestmentEingabe> {
  const aenderung: Partial<InvestmentEingabe> = {};
  for (const vorschlag of vorschlaege) {
    // Eine Automatik-Zeile trägt den aktuellen Wert, sie ist nie ein Vorschlag zum Übernehmen.
    if (!ausgewaehlt.has(vorschlag.feld) || vorschlag.automatisch) continue;
    // Der Typ des Feldes und der des geprüften Werts passen zusammen, weil
    // die Prüfung nach der Einheit aus AUSLESBARE_FELDER entscheidet.
    (aenderung as Record<string, number | string>)[vorschlag.feld] = vorschlag.wert;
  }
  return aenderung;
}

/** Wird einer der drei Kaufnebenkostensätze übernommen? Dann gilt der manuelle Weg. */
export function enthaeltKnkSaetze(aenderung: Partial<InvestmentEingabe>): boolean {
  return KNK_FELDER.some((feld) => feld in aenderung);
}
