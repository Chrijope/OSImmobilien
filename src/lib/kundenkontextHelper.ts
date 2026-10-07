/**
 * Hilfsfunktionen für die kundenbezogene Vorbelegung der Rechner
 * (Investmentrechner, MORE Lotse).
 *
 * Quelle der Selbstauskunft ist `eigeneSaDataFuerInvestmentRow` aus
 * `saQuelle.ts`, also ausschließlich die SA des betrachteten Investments.
 * Ohne gewähltes Investment gibt es keine Selbstauskunft und damit auch
 * keinen belegbaren Block.
 *
 * Vorher stand hier nur `kontakt.meta.selbstauskunft`. Das war die falsche
 * Stelle: Eine Selbstauskunft gehört zu einem Investment und wird dort in
 * `meta.saData` abgelegt, ein Kunde mit zwei Investments hat zwei davon. Am
 * Kontakt liegt sie nur bei Altbeständen. Der Rechner zeigte deshalb in der
 * Kundensuche die Marke "Selbstauskunft" und einen Satz darunter, es liege
 * keine vor. Beide lasen dieselbe Person an verschiedenen Orten.
 *
 * Einen Rückfall auf die am Kontakt gespeicherten Einkünfte und Ausgaben gibt
 * es seit dem 10.09.2026 nicht mehr (Entscheidung Christian): Zahlen sind
 * immer investmentbezogen, nie kontaktbezogen. Ohne eigene Selbstauskunft des
 * gewählten Investments bleiben alle Geldwerte deshalb bei null, und die
 * aufrufende Oberfläche sagt, dass zuerst ein Investment mit Selbstauskunft
 * gebraucht wird. Was belegbar aus der Selbstauskunft stammt, steht zusätzlich
 * getrennt in `ausSelbstauskunft`, damit der Investmentrechner die Herkunft
 * jedes übernommenen Feldes benennen kann.
 */
import { getKontaktById } from "@/lib/kundenStore";
import { cacheGet } from "@/lib/dataCache";
import { eigeneSaDataFuerInvestmentRow, type InvestmentZeileMitSa } from "@/lib/saQuelle";
import {
  getBruttoFromSA,
  getVerheiratetFromSA,
  suggestSteuersatz,
  zvEFuerRechnungAusSA,
} from "@/lib/steuerHelper";

/**
 * Nur das, was wirklich in der Selbstauskunft steht.
 *
 * Die Felder im `Kundenkontext` darüber sind inzwischen dieselbe Quelle, nur
 * bereits mit Vorgaben aufgefüllt (Steuersatz 42 Prozent, solange nichts
 * bekannt ist). Für den Investmentrechner taugen sie deshalb nicht: Der
 * schreibt unter jedes übernommene Feld „Aus der Selbstauskunft vom …“, und
 * dieser Satz muss stimmen. Deshalb dieser eigene Block, der leer bleibt,
 * solange keine Selbstauskunft vorliegt.
 */
export interface AusSelbstauskunft {
  bruttoJahrHaushalt: number;       // € summiert beider Personen, 0 ohne Angabe
  zvE: number;                       // € laut SA, sonst geschätzt aus deren Brutto
  /** true: `zvE` steht so in der SA (Steuerbescheid), false: aus dem Brutto geschätzt. */
  zvEAngegeben: boolean;
  verheiratet: boolean;             // aus dem Familienstand der SA
  anzahlPersonen: 1 | 2;            // führt die SA eine zweite Person?
  liquideMittel: number;            // € aus dem Vermögensteil der SA
}

export interface Kundenkontext {
  kundeId: string;
  kundeName: string;
  grenzsteuersatz: number;          // %, z. B. 42
  zvE: number;                       // € geschätztes zu versteuerndes Einkommen p.a.
  verheiratet: boolean;             // Splittingtarif
  anzahlPersonen: 1 | 2;            // Anzahl Käufer aus SA
  liquideMittel: number;            // € verfügbares Eigenkapital
  bruttoJahrHaushalt: number;       // € summiert beider Personen
  saDatum?: string;                 // ISO – Stand der SA
  saVerfuegbar: boolean;            // true wenn echte SA vorhanden
  saAlterTageBis?: number;          // Tage seit SA-Stand
  /** Was belegbar aus der Selbstauskunft stammt, sonst `null`. */
  ausSelbstauskunft: AusSelbstauskunft | null;
}

/**
 * Ein Betrag aus dem Kontakt als Zahl.
 *
 * Beträge stehen dort mal als Zahl, mal als Text in deutscher Schreibweise
 * („3.248,15“). Vorher wurde nur das Komma ersetzt und der Tausenderpunkt
 * blieb stehen: `parseFloat("3.248.15")` ergab 3,248 statt 3248,15, also ein
 * Tausendstel des Betrags. Deshalb wird jetzt zuerst entschieden, welches
 * Zeichen das Dezimaltrennzeichen ist, und erst dann gerechnet.
 */
function num(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const roh = v.replace(/[^\d,.-]/g, "");
  if (!roh) return 0;
  const letzterPunkt = roh.lastIndexOf(".");
  const letztesKomma = roh.lastIndexOf(",");
  let normiert: string;
  if (letztesKomma > letzterPunkt) {
    // Deutsch: Punkte trennen Tausender, das Komma ist das Dezimalzeichen.
    normiert = roh.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(roh)) {
    // Nur Punkte, und jede Gruppe hat genau drei Stellen: auch Tausendertrenner.
    normiert = roh.replace(/\./g, "");
  } else {
    // Englisch oder blanke Zahl: Kommas sind Tausendertrenner.
    normiert = roh.replace(/,/g, "");
  }
  const n = parseFloat(normiert);
  return isFinite(n) ? n : 0;
}

/** Liquide Mittel aus einem Vermögensteil, egal ob als Summe oder Einzelposten. */
function liquideMittelAus(vermoegen: unknown): number {
  const vm = (vermoegen || {}) as Record<string, unknown>;
  return (
    num(vm.liquideMittel) ||
    num(vm.tagesgeld) + num(vm.sparbuch) + num(vm.giro) + num(vm.depot) ||
    0
  );
}

/** Synchron: liest Kontakt aus dem dataCache und leitet alle Werte ab. */
export function loadKundenkontext(
  kundeId: string | undefined | null,
  /** Das betrachtete Investment. Ohne Angabe gibt es keine Selbstauskunft. */
  investmentId?: string | null,
): Kundenkontext | null {
  if (!kundeId) return null;
  const kontakt: any = getKontaktById(kundeId);
  if (!kontakt) return null;

  const meta = kontakt.meta || {};
  /*
   * Die maßgebliche Selbstauskunft: ausschließlich die des betrachteten
   * Investments. Ohne `investmentId` gibt es keine.
   *
   * Vorher fiel die Auswahl hier auf die neueste Selbstauskunft über alle
   * Investments zurück, zuletzt sogar auf eine am Kontakt gespeicherte. Der
   * Rechner belegte damit ein Investment mit den Zahlen eines anderen. Jedes
   * Investment steht für sich (Regel in saQuelle.ts).
   */
  const investmentZeilen = ((cacheGet("investments") || []) as InvestmentZeileMitSa[])
    .filter((r) => (r as { kunde_id?: string }).kunde_id === kundeId);
  const betrachtet = investmentId
    ? investmentZeilen.find((r) => r.id === investmentId) ?? null
    : null;
  const sa = eigeneSaDataFuerInvestmentRow(betrachtet);

  // 1) SA-basierter Steuersatz (Helper kennt Splitting & Stufen)
  let grenzsteuersatz = 42;
  let bruttoJahrHaushalt = 0;
  let verheiratet = false;

  /*
   * Ohne eigene Selbstauskunft des Investments bleibt es bei null und beim
   * Vorgabesatz. Der frühere Rückfall auf `kontakt.einkuenfte` ist entfallen:
   * Diese Zahlen gehörten dem Kontakt und nicht dem Vorgang, hatten kein
   * Datum und stammten womöglich aus einem ganz anderen Kauf.
   */
  // Ein in der SA angegebenes zvE geht der Schätzung aus dem Brutto vor.
  const zvEAusSa = sa ? zvEFuerRechnungAusSA(sa) : null;
  if (sa) {
    bruttoJahrHaushalt = getBruttoFromSA(sa);
    verheiratet = getVerheiratetFromSA(sa);
    grenzsteuersatz = suggestSteuersatz(sa, 42);
  }

  // 2) Liquides Vermögen (Eigenkapital-Vorschlag), ebenfalls nur aus der SA
  const liquideMittel = liquideMittelAus(sa?.vermoegen);

  // 3) Anzahl Käufer
  const anzahlPersonen: 1 | 2 = kontakt.person2 || sa?.person2 ? 2 : 1;

  /*
   * 4) SA-Stand. Zuerst das Datum der Selbstauskunft dieses Investments, denn
   * genau deren Zahlen stehen oben. Die Kontaktfelder sind nur noch der
   * Rückfall für Altbestände und werden gar nicht erst gelesen, wenn eine
   * eigene Selbstauskunft mit Datum vorliegt.
   */
  const saDatum: string | undefined =
    (typeof sa?.abgeschlossenAm === "string" ? sa.abgeschlossenAm : undefined) ||
    meta.selbstauskunftSignedAt || meta.saSignedAt || meta.selbstauskunftStand || undefined;
  let saAlterTageBis: number | undefined;
  if (saDatum) {
    const d = new Date(saDatum).getTime();
    if (isFinite(d)) saAlterTageBis = Math.floor((Date.now() - d) / 86_400_000);
  }

  const kundeName = `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim();

  const zvE = zvEAusSa?.zvE ?? 0;

  /*
   * Der belegbare Teil. Er entsteht nur aus `sa` und trägt keine Vorgaben,
   * damit der Investmentrechner unter jedes übernommene Feld schreiben kann,
   * woher der Wert stammt.
   */
  const ausSelbstauskunft: AusSelbstauskunft | null = sa
    ? {
        bruttoJahrHaushalt,
        zvE,
        zvEAngegeben: !!zvEAusSa?.angegeben,
        verheiratet: getVerheiratetFromSA(sa),
        anzahlPersonen: sa.person2 ? 2 : 1,
        liquideMittel: liquideMittelAus(sa.vermoegen),
      }
    : null;

  return {
    kundeId,
    kundeName,
    grenzsteuersatz,
    zvE,
    verheiratet,
    anzahlPersonen,
    liquideMittel,
    bruttoJahrHaushalt,
    saDatum,
    saVerfuegbar: !!sa,
    saAlterTageBis,
    ausSelbstauskunft,
  };
}

/**
 * Effektiver Steuersatz inkl. optionalem Soli (5,5 % auf ESt) und
 * Kirchensteuer (8 oder 9 % auf ESt).
 */
export function effectiveTaxRate(
  grenzsteuersatzP: number,
  opts?: { soli?: boolean; kirchensteuer?: boolean; kistSatz?: 8 | 9 },
): number {
  let mult = 1;
  if (opts?.soli) mult += 0.055;
  if (opts?.kirchensteuer) mult += (opts.kistSatz ?? 9) / 100;
  return Math.round(grenzsteuersatzP * mult * 100) / 100;
}

/** Formatiert ein TT.MM.JJJJ-Datum, leer wenn ungültig. */
export function formatStand(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}