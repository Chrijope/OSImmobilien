import { getEigeneSaData } from "@/lib/investmentsStore";
import { berechneImmobilienvermoegen } from "@/lib/immobilienvermoegen";

export function parseFinanzNum(value: any): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

/**
 * Einnahmen aus einer Selbstauskunft, für alte (Flachfelder) und neue Form
 * (einkommen-Objekt). Einzige Quelle; das Kundenprofil hatte lange eine
 * identische lokale Kopie (extractFinanzEinkuenfte), die jetzt hierher zeigt.
 */
export function extractEinkuenfte(data: any) {
  const income = data?.einkommen;
  return {
    gehalt: income ? parseFinanzNum(income.netto) : parseFinanzNum(data?.gehalt),
    selbstaendig: income ? parseFinanzNum(income.gewerbe) : parseFinanzNum(data?.selbstaendig),
    renten: income ? parseFinanzNum(income.rente) : parseFinanzNum(data?.renten),
    mieteinnahmen: income ? parseFinanzNum(income.miet) : parseFinanzNum(data?.mieteinnahmen),
    zinsen: income ? parseFinanzNum(income.zinsen) : parseFinanzNum(data?.zinsen),
    sonstige: income ? parseFinanzNum(income.sonstige) : parseFinanzNum(data?.sonstigeEinkuenfte),
    kindergeld: income ? parseFinanzNum(income.kindergeld) : parseFinanzNum(data?.kindergeld),
  };
}

export type Kreditart = "hypothek" | "auto" | "privat" | "sonstige";

/**
 * Einen Kredit seiner Art zuordnen.
 *
 * Die Art ist im Formular ein Freitextfeld, der Kunde tippt hin, was er will.
 * Deshalb wird geraten, und deshalb landet ein Kredit mit der Bezeichnung "VW"
 * unter Sonstige: Kein Stichwort passt.
 *
 * Diese Funktion ist die einzige Stelle, an der geraten wird. Vorher gab es
 * vier Kopien, und eine davon, die im Selbstauskunfts-PDF, hatte eine kuerzere
 * Stichwortliste. Dieselbe Selbstauskunft zeigte damit in der Kundenakte
 * andere Zahlen als im PDF, das zur Bank geht. Ein Bausparvertrag stand hier
 * unter Hypothek und dort unter Sonstige, eine Kreditkarte hier unter Sonstige
 * und dort unter Privat.
 *
 * Neuere Selbstauskuenfte tragen zusaetzlich ein Auswahlfeld `kategorie`. Ist
 * es gesetzt, wird nicht mehr geraten, sondern die Wahl des Kunden genommen.
 */
/**
 * Die Auswahl, die der Kunde im Formular trifft.
 *
 * Feiner als die vier Kategorien, weil ein Kunde "Bauspardarlehen" wiederfindet
 * und "Hypothek" nicht unbedingt. Fuer die Rechnung wird auf die vier
 * zusammengefasst, denn genauer wertet auch die Bank nicht aus.
 *
 * Die Reihenfolge ist die der Haeufigkeit, nicht das Alphabet. Was die meisten
 * brauchen, steht oben.
 */
export const KREDIT_AUSWAHL: { wert: string; label: string; kategorie: Kreditart }[] = [
  { wert: "immobilienkredit", label: "Immobilienkredit / Baufinanzierung", kategorie: "hypothek" },
  { wert: "bauspardarlehen", label: "Bauspardarlehen", kategorie: "hypothek" },
  { wert: "kfz_finanzierung", label: "KFZ-Finanzierung", kategorie: "auto" },
  { wert: "kfz_leasing", label: "Leasing (Fahrzeug)", kategorie: "auto" },
  { wert: "ratenkredit", label: "Raten- oder Konsumentenkredit", kategorie: "privat" },
  { wert: "dispo", label: "Dispositionskredit", kategorie: "privat" },
  { wert: "kreditkarte", label: "Kreditkartenkredit", kategorie: "privat" },
  { wert: "privatdarlehen", label: "Privatdarlehen von Familie oder Freunden", kategorie: "sonstige" },
  { wert: "studienkredit", label: "Studienkredit oder BAföG", kategorie: "sonstige" },
  { wert: "sonstiges", label: "Sonstiges", kategorie: "sonstige" },
];

/** Das Etikett zu einer Auswahl, fuer PDF und Kundenakte. */
export function kreditAuswahlLabel(kategorie?: string): string {
  return KREDIT_AUSWAHL.find((k) => k.wert === (kategorie || "").trim())?.label || "";
}

export function kreditArt(art?: string, kategorie?: string): Kreditart {
  /*
   * Hat der Kunde gewaehlt, wird nicht geraten. Das ist der Normalfall bei
   * allem, was nach dem 26.08.2026 ausgefuellt wurde.
   */
  const gewaehlt = (kategorie || "").trim();
  const treffer = KREDIT_AUSWAHL.find((k) => k.wert === gewaehlt);
  if (treffer) return treffer.kategorie;
  // Aeltere Selbstauskuenfte tragen die vier Kategorien direkt.
  if (gewaehlt === "hypothek" || gewaehlt === "auto" || gewaehlt === "privat" || gewaehlt === "sonstige") {
    return gewaehlt;
  }

  /*
   * Nur noch fuer Altdaten ohne Auswahl. Bewusst schlank gehalten: Jede
   * weitere Marke oder Bausparkasse hier waere ein Rennen ohne Ziel, morgen
   * traegt jemand einen anderen Namen ein. Genau dafuer gibt es die Auswahl.
   */
  const a = (art || "").toLowerCase();
  if (/hypothek|immobil|eigenheim|bauspar|baufinanz|haus|wohnung|grundstück/.test(a)) return "hypothek";
  if (/auto|kfz|leasing|fahrzeug|motorrad/.test(a)) return "auto";
  if (/privat|verbraucher|konsum|raten|disp|kreditkarte/.test(a)) return "privat";
  return "sonstige";
}

/**
 * Die Summe der Versicherungsbeitraege, ohne doppelt zu zaehlen.
 *
 * Das Formular fragt sie zweimal ab: einmal als Sammelbetrag und einmal
 * aufgeschluesselt nach Berufsunfaehigkeit, Riester, sonstiger Altersvorsorge
 * und weiteren Versicherungen. Gemeint ist dasselbe Geld. Wer beides ausfuellt,
 * haette sonst die doppelten Ausgaben, und der Finanzierungsrahmen faellt zu
 * niedrig aus.
 *
 * Die Aufschluesselung gewinnt, weil sie genauer ist und weil die Bank sie
 * ohnehin sehen will.
 */
export function versicherungenGesamt(data: any): number {
  const einzeln =
    parseFinanzNum(data?.versBU) +
    parseFinanzNum(data?.versRiester) +
    parseFinanzNum(data?.versAV) +
    parseFinanzNum(data?.versWeitere);
  return einzeln > 0 ? einzeln : parseFinanzNum(data?.versicherungsbeitraege);
}

/**
 * Ausgaben aus einer Selbstauskunft.
 *
 * Die Semantik folgt der Fassung aus dem Kundenprofil (extractFinanzAusgaben
 * in KundenDetail.tsx), die kanonisch ist. Vorher gab es drei verschiedene
 * Extraktionen (Kundenprofil, diese Lib, Portal-Startseite), die bei
 * Unterhalt, Nebenkosten und KFZ-Kosten unterschiedlich rechneten; derselbe
 * Kunde bekam dadurch je nach Seite einen anderen Finanzierungsrahmen.
 *
 * Regeln: Unterhalt zählt IMMER (auch bei alter SA-Form, dort ist es das
 * einzige Feld dafür). Nebenkosten und KFZ-Kosten gibt es erst seit der neuen
 * SA-Form mit einkommen-Objekt; bei Altdaten wären gleichnamige Felder etwas
 * anderes und bleiben deshalb außen vor.
 */
export function extractAusgaben(data: any) {
  const hasIncomeObject = !!data?.einkommen;
  const income = data?.einkommen;
  const kredite = data?.kredite || [];
  const buckets = { hypothek: 0, auto: 0, privat: 0, sonstige: 0 };
  for (const k of kredite) buckets[kreditArt(k?.art, k?.kategorie)] += parseFinanzNum(k?.rate);
  const buergschaften = data?.buergschaften || [];
  const buergschaftSumme = buergschaften.reduce((acc: number, b: any) => acc + parseFinanzNum(b?.betrag), 0);
  return {
    miete: hasIncomeObject ? parseFinanzNum(data?.mieteWarm) : parseFinanzNum(data?.miete),
    // Die Bankpauschale greift hier, nicht im Formular. Siehe bankLebenshaltung.
    lebenshaltung: bankLebenshaltung(
      hasIncomeObject ? parseFinanzNum(data?.lebenshaltungskosten) : parseFinanzNum(data?.lebenshaltung),
      hasIncomeObject ? parseFinanzNum(income?.netto) : parseFinanzNum(data?.gehalt),
    ),
    privateKV: parseFinanzNum(data?.privateKV),
    zinsTilgung: hasIncomeObject ? buckets.hypothek : parseFinanzNum(data?.zinsTilgung),
    autokredite: hasIncomeObject ? buckets.auto : parseFinanzNum(data?.autokredite),
    privatkredite: hasIncomeObject ? buckets.privat : parseFinanzNum(data?.privatkredite),
    sonstigeKredite: hasIncomeObject ? buckets.sonstige : parseFinanzNum(data?.sonstigeKredite),
    // Unterhalt zaehlt immer, so wie im Kundenprofil. Vorher wurde er hier
    // bei der neuen SA-Form auf null gesetzt und fehlte im Portal-Rahmen.
    unterhalt: parseFinanzNum(data?.unterhalt),
    buergschaften: hasIncomeObject ? buergschaftSumme : 0,
    /*
     * Versicherungen: entweder die Aufschluesselung oder das Sammelfeld, nie
     * beides. Das Formular hat ein Sammelfeld "Versicherungsbeitraege" und
     * daneben vier Einzelfelder. Wer beides ausfuellt, haette sonst die
     * doppelten Ausgaben.
     */
    versicherungen: hasIncomeObject ? versicherungenGesamt(data) : 0,
    // Nebenkosten und KFZ-Kosten gibt es nur in der neuen SA-Form. Vorher
    // wurden sie hier auch bei Altdaten gelesen und die Seiten wichen ab.
    nebenkosten: hasIncomeObject ? parseFinanzNum(data?.nebenkosten) : 0,
    kfzKosten: hasIncomeObject ? parseFinanzNum(data?.kfzKosten) : 0,
    sonstige: parseFinanzNum(data?.sonstigeAusgaben),
  };
}

/**
 * Was eine Bank mindestens als Lebenshaltung ansetzt: 30 Prozent des
 * Nettoeinkommens, mindestens aber 800 Euro.
 *
 * Diese Regel stand früher im Selbstauskunftsformular und hob die Eingabe des
 * Kunden still an. Das war falsch am Platz: Die Selbstauskunft geht zur Bank,
 * und die rechnet ihre Pauschale selbst. Wer vorher schon kürzt, erzeugt einen
 * Abschlag auf einen Abschlag, und der Kunde sieht schlechter aus, als er ist.
 *
 * Für den Finanzierungsrahmen gilt das Gegenteil: Der soll ungefähr das zeigen,
 * was der Kunde am Ende von der Bank bekommt. Trägt jemand 300 Euro
 * Lebenshaltung ein, ist ein Rahmen auf dieser Grundlage eine Zahl, die keine
 * Bank je bestätigt. Deshalb wirkt die Pauschale hier und nur hier.
 */
export const BANK_LEBENSHALTUNG_ANTEIL = 0.3;
export const BANK_LEBENSHALTUNG_MINDEST = 800;

export function bankLebenshaltung(eingetragen: number, nettoEinkommen: number): number {
  /*
   * Ueber einen Haushalt, zu dem nichts eingetragen ist, gibt es nichts zu
   * sagen. Ohne diese Zeile bekam jede leere Selbstauskunft 800 Euro Ausgaben
   * angedichtet, bei zwei Personen 1600, und die Ueberschussrechnung stand im
   * Minus, obwohl der Kunde noch gar nichts angegeben hatte.
   */
  if (eingetragen <= 0 && nettoEinkommen <= 0) return 0;
  const pauschale = nettoEinkommen > 0
    ? Math.max(Math.round(nettoEinkommen * BANK_LEBENSHALTUNG_ANTEIL), BANK_LEBENSHALTUNG_MINDEST)
    : BANK_LEBENSHALTUNG_MINDEST;
  return Math.max(eingetragen, pauschale);
}

/*
 * Die Rahmenformel liegt seit dem 26.09.2026 in
 * `supabase/functions/_shared/rahmen-formel.ts`, weil auch der Server sie
 * braucht (Handbuch-Konfigurator in `submit-lead`). Hier wird sie nur
 * weitergereicht, damit alle bisherigen Importe unveraendert bleiben.
 */
import { rahmenAusUeberschuss } from "../../supabase/functions/_shared/rahmen-formel.ts";
export { RAHMEN_PUFFER, RAHMEN_ANNUITAET, rahmenAusUeberschuss } from "../../supabase/functions/_shared/rahmen-formel.ts";

export function calculateFinanzierbarkeitFromSaData(saData: any) {
  if (!saData) return null;
  const einkuenfte = extractEinkuenfte(saData);
  const ausgaben = extractAusgaben(saData);
  let sumEink = Object.values(einkuenfte).reduce((s, v) => s + v, 0);
  let sumAusg = Object.values(ausgaben).reduce((s, v) => s + v, 0);

  // Person 2 nur, wenn die Selbstauskunft sie führt, wie in getBruttoFromSA
  // und leadScore. Ein liegengebliebener Entwurf zählte sonst mit, obwohl
  // PDF und Bankformular ihn nicht zeigen.
  const p2 = saData.person2 ? saData.person2Data : null;
  let sumEinkP2 = 0;
  let sumAusgP2 = 0;
  if (p2) {
    const e2 = extractEinkuenfte(p2);
    const a2 = extractAusgaben(p2);
    sumEinkP2 = Object.values(e2).reduce((s, v) => s + v, 0);
    sumAusgP2 = Object.values(a2).reduce((s, v) => s + v, 0);
    sumEink += sumEinkP2;
    sumAusg += sumAusgP2;
  }

  const ek = (saData.vermoegenswerte || []).reduce((s: number, i: any) => s + parseFinanzNum(i.betrag), 0)
    + (p2?.vermoegenswerte || []).reduce((s: number, i: any) => s + parseFinanzNum(i.betrag), 0);

  const ueberschuss = sumEink - sumAusg;
  const rahmen = rahmenAusUeberschuss(ueberschuss, ek);

  // Das Nettoimmobilienvermögen geht BEWUSST NICHT in `ek` und damit nicht in
  // den Finanzierungsrahmen ein. Die Kaufnebenkosten von rund zehn bis zwölf
  // Prozent müssen bar aufgebracht werden, und eine Bestandsimmobilie kann man
  // zum Notartermin nicht mitbringen. Würde sie hier mitzählen, gälte jemand
  // als finanzierbar, der beim Notar nicht zahlen kann, und das fiele erst ganz
  // am Ende auf, wenn alles investiert ist.
  //
  // Als Hinweis gehört es trotzdem hierher: Eine schuldenfreie Immobilie lässt
  // sich beleihen. Das ist aber ein eigener Vorgang mit Bewertung und
  // Grundbuch, den der Berater mit der Bank klären muss, kein Automatismus.
  const immoVermoegen = berechneImmobilienvermoegen(saData);
  const immobilienHinweis =
    immoVermoegen.netto > 0
      ? `Der Kunde besitzt Immobilien im Nettowert von ${immoVermoegen.netto.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} (Verkehrswert abzüglich Restschuld). Das ist im Eigenkapital oben NICHT enthalten, weil es nicht liquide ist. Eine Beleihung als Eigenkapitalersatz ist möglich, muss aber separat mit der Bank geklärt werden.`
      : null;

  return {
    empfRahmen: rahmen.empfRahmen,
    /*
     * Spanne um den empfohlenen Rahmen, wie sie das Kundenprofil bei der
     * Objektauswahl anzeigt (80 bis 120 Prozent des tragbaren Darlehens,
     * jeweils plus Eigenkapital). Stand vorher nur in der lokalen Kopie in
     * KundenDetail.tsx, die durch diese Lib ersetzt ist.
     */
    minRahmen: Math.round(rahmen.maxDarlehen * 0.8 + ek),
    maxRahmen: Math.round(rahmen.maxDarlehen * 1.2 + ek),
    hasPerson2: sumEinkP2 > 0 || sumAusgP2 > 0,
    eigenkapital: ek,
    ueberschuss,
    sumEink,
    sumAusg,
    maxDarlehen: rahmen.maxDarlehen,
    /** Nettoimmobilienvermögen, rein informativ. Nicht Teil des Rahmens. */
    immobilienNetto: immoVermoegen.netto,
    /** Fertig formulierter Hinweis für den Berater, sonst null. */
    immobilienHinweis,
  };
}

/**
 * Die Selbstauskunft EINES Investments, ohne jeden Rückfall.
 *
 * Vorher hiess die Funktion `findSaDataForKontakt` und suchte kontaktweit:
 * erst die neueste Selbstauskunft ueber alle Investments, dann einen Entwurf
 * im Browserspeicher. Damit rechnete die Finanzierbarkeit eines Investments
 * mit den Zahlen eines anderen. Seit dem 10.09.2026 steht jedes Investment
 * fuer sich, und ohne Investment wird gar nichts gezeigt (Regel in
 * saQuelle.ts).
 */
export function findSaDataForInvestment(investmentId: string | null | undefined): any | null {
  if (!investmentId) return null;
  return getEigeneSaData(investmentId);
}

/** "Positiv" / "Negativ" aus der Selbstauskunft eines Investments, sonst null. */
export function getFinanzierbarkeitLabelFuerInvestment(investmentId: string | null | undefined): "Positiv" | "Negativ" | null {
  const sa = findSaDataForInvestment(investmentId);
  if (!sa) return null;
  const calc = calculateFinanzierbarkeitFromSaData(sa);
  if (!calc) return null;
  return calc.empfRahmen > 0 ? "Positiv" : "Negativ";
}