/**
 * Finanzierungsangebot im Investmentrechner (16.11.2026).
 *
 * Der Vertriebspartner zieht das Angebot, das er dem Kunden vorstellen will,
 * in den Schritt Finanzierung. Der Text wird wie bei den Objektunterlagen im
 * Browser mit pdf.js gelesen und hier mit festen Mustern ausgewertet. Es geht
 * nichts an einen Server oder eine KI: Das Angebot nennt Kunde und Anschrift.
 *
 * Die Muster folgen dem Konditionsangebot der Vermittler auf Europace-Basis
 * (etwa Baufi24): Übersicht mit einer Zeile je Darlehen (Bank, Betrag,
 * Sollzinsbindung, Sollzins, Effektivzins), darunter die Details mit
 * Tilgungssatz, Rate und Restschuld. pdf.js liefert den Text ohne Zeilen,
 * deshalb wird alles auf einfache Leerzeichen eingedampft.
 *
 * Das Modul ist rein: keine Seiteneffekte, kein Datenzugriff.
 */

import type { InvestmentEingabe } from "./rechenkern";

export interface AngebotDarlehen {
  /** Bank und Art, etwa „Hanseatic Bank AVD Nachrangdarlehen“. */
  name: string;
  betrag: number;
  /** Sollzinsbindung in Jahren, Monatsangaben umgerechnet (60 Monate = 5). */
  zinsbindungJahre: number;
  /** Prozent, 4.66 = 4,66 %. */
  sollzins: number;
  effektivzins: number;
  /** Anfängliche Tilgung in Prozent; fehlt sie, aus der Rate zurückgerechnet. */
  tilgung: number;
  /** Monatsrate laut Angebot, 0 = nicht genannt. */
  rate: number;
  /** Restschuld am Ende der Sollzinsbindung laut Angebot, 0 = nicht genannt. */
  restschuld: number;
  nachrang: boolean;
}

export interface Finanzierungsangebot {
  datum: string;
  gueltigBis: string;
  kaufpreis: number;
  notarGrundbuch: number;
  grunderwerbsteuer: number;
  finanzierungsbedarf: number;
  gesamtrate: number;
  darlehen: AngebotDarlehen[];
  /** Was nicht eindeutig war oder nicht übernommen wird. */
  hinweise: string[];
}

const BETRAG = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`;
const PROZENT = String.raw`(\d{1,2},\d{1,3})\s*%`;

/** „130.050,00“ → 130050, „4,66“ → 4.66. */
export function deutscheZahl(text: string): number {
  const zahl = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(zahl) ? zahl : 0;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

function finde(text: string, muster: RegExp): number {
  const treffer = text.match(muster);
  return treffer ? deutscheZahl(treffer[1]) : 0;
}

/** Text aller Seiten mit einfachen Leerzeichen, so wie pdf.js ihn liefert. */
function eindampfen(seiten: readonly string[]): string {
  return seiten.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Die Darlehenszeilen der Übersicht: je Zeile Name, Betrag, Sollzinsbindung,
 * Sollzins und Effektivzins. Der Name steht vor den Zahlen; was hinter der
 * letzten Zeile bis „Summe“ steht (etwa „Nachrangdarlehen“), gehört noch zum
 * letzten Darlehen, so wie der Name dort umbricht.
 */
function uebersichtZeilen(text: string): Omit<AngebotDarlehen, "tilgung" | "rate" | "restschuld">[] {
  const start = text.search(/Ihre Finanzierungsbausteine/i);
  if (start < 0) return [];
  const ende = text.indexOf("Summe", start);
  let abschnitt = text.slice(start, ende > start ? ende : undefined);
  // Kopfzeile der Tabelle abschneiden, sonst landet sie im ersten Namen.
  abschnitt = abschnitt.replace(/^.*?\(PAngV\)/i, "");
  const zeile = new RegExp(String.raw`${BETRAG}\s*EUR\s+(\d{1,3})\s*(Jahre|Monate)\s+${PROZENT}\s+${PROZENT}`, "gi");
  const zeilen: Omit<AngebotDarlehen, "tilgung" | "rate" | "restschuld">[] = [];
  let vorher = 0;
  for (const treffer of abschnitt.matchAll(zeile)) {
    const index = treffer.index ?? 0;
    const name = abschnitt.slice(vorher, index).replace(/\(Details[^)]*\)/i, "").trim();
    const dauer = Number(treffer[2]);
    zeilen.push({
      name,
      betrag: deutscheZahl(treffer[1]),
      zinsbindungJahre: treffer[3].toLowerCase().startsWith("monat") ? Math.round((dauer / 12) * 100) / 100 : dauer,
      sollzins: deutscheZahl(treffer[4]),
      effektivzins: deutscheZahl(treffer[5]),
      nachrang: false,
    });
    vorher = index + treffer[0].length;
  }
  const rest = abschnitt.slice(vorher).trim();
  if (zeilen.length > 0 && rest) zeilen[zeilen.length - 1].name = `${zeilen[zeilen.length - 1].name} ${rest}`.trim();
  for (const z of zeilen) z.nachrang = /nachrang/i.test(z.name);
  return zeilen;
}

/** Werte einer Detailzeile in Spaltenreihenfolge, etwa „Rate 667,59 EUR 216,97 EUR“. */
function detailWerte(text: string, beschriftung: RegExp, wert: string, anzahl: number, fenster = 260): number[] {
  const treffer = text.match(beschriftung);
  if (!treffer || treffer.index === undefined) return [];
  const ausschnitt = text.slice(treffer.index + treffer[0].length, treffer.index + treffer[0].length + fenster);
  return [...ausschnitt.matchAll(new RegExp(wert, "g"))].slice(0, anzahl).map((t) => deutscheZahl(t[1]));
}

/**
 * Ein Finanzierungsangebot aus dem Text seiner Seiten lesen. Gibt `null`
 * zurück, wenn keine Darlehenszeile zu erkennen ist.
 */
export function angebotAuslesen(seiten: readonly string[]): Finanzierungsangebot | null {
  const text = eindampfen(seiten);
  const zeilen = uebersichtZeilen(text);
  if (zeilen.length === 0) return null;
  const n = zeilen.length;
  const details = text.slice(Math.max(0, text.search(/Finanzierungsbausteine:\s*Details/i)));
  const tilgungen = detailWerte(details, /Tilgungssatz(?: bzw\. Sparrate)?/i, PROZENT, n);
  const raten = detailWerte(details, /\bRate\b/, String.raw`${BETRAG}\s*EUR`, n);
  const restschulden = detailWerte(details, /Restschuld am Ende der/i, String.raw`${BETRAG}\s*EUR`, n);
  const hinweise: string[] = [];
  const darlehen: AngebotDarlehen[] = zeilen.map((z, i) => {
    const rate = raten[i] ?? 0;
    let tilgung = tilgungen[i] ?? 0;
    if (!tilgung && rate > 0 && z.betrag > 0) {
      // Annuität: Rate × 12 / Betrag = Sollzins + anfängliche Tilgung.
      tilgung = r2((rate * 12 * 100) / z.betrag - z.sollzins);
      hinweise.push(`Tilgung von ${z.name || `Darlehen ${i + 1}`} aus der Rate zurückgerechnet.`);
    }
    return { ...z, tilgung, rate, restschuld: restschulden[i] ?? 0 };
  });
  const banken = darlehen.filter((d) => !d.nachrang);
  const nachraenge = darlehen.filter((d) => d.nachrang);
  if (banken.length === 0) hinweise.push("Kein Bankdarlehen erkannt, nur ein Nachrangdarlehen.");
  if (banken.length > 1) hinweise.push("Mehr als ein Bankdarlehen: übernommen wird nur das erste.");
  if (nachraenge.length > 1) hinweise.push("Mehr als ein Nachrangdarlehen: übernommen wird nur das erste.");
  return {
    datum: text.match(/Datum:\s*(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? "",
    gueltigBis: text.match(/gültig bis:?\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1] ?? "",
    kaufpreis: finde(text, new RegExp(String.raw`Kaufpreis des Objekts\s*${BETRAG}`, "i")),
    notarGrundbuch: finde(text, new RegExp(String.raw`Notar und Grundbuch\w*\s*\+?\s*${BETRAG}`, "i")),
    grunderwerbsteuer: finde(text, new RegExp(String.raw`Grunderwerbsteuer\s*\+?\s*${BETRAG}`, "i")),
    finanzierungsbedarf: finde(text, new RegExp(String.raw`Finanzierungsbedarf\s*${BETRAG}`, "i")),
    gesamtrate: finde(text, new RegExp(String.raw`Gesamtrate[^\d]{0,80}${BETRAG}`, "i")),
    darlehen,
    hinweise,
  };
}

/** Kurzname der Bank für Hinweise, etwa „Sparda Berlin“. */
export function bankName(darlehen: AngebotDarlehen): string {
  return darlehen.name.replace(/\b(AVD|Nachrangdarlehen|Teildarlehen)\b/gi, "").replace(/\s+/g, " ").trim() || "Bank";
}

/**
 * Was der Rechner übernimmt: Sollzins, Tilgung und Zinsbindung des
 * Bankdarlehens in die Kalkulationsbasis, die Beträge und der Nachrang in
 * „Darlehen laut Angebot“ (`ausfuehrlich`, dort Zins und Tilgung als Anteil).
 * Kaufpreis und Kaufnebenkosten werden nur abgeglichen, nicht überschrieben.
 */
export function angebotAlsEingabe(
  angebot: Finanzierungsangebot,
  bisher: InvestmentEingabe["ausfuehrlich"],
): Partial<InvestmentEingabe> {
  const bank = angebot.darlehen.find((d) => !d.nachrang);
  const nachrang = angebot.darlehen.find((d) => d.nachrang);
  const ausfuehrlich = { ...(bisher ?? {}) };
  delete ausfuehrlich.bankBetrag;
  delete ausfuehrlich.nachrangBetrag;
  delete ausfuehrlich.nachrangZins;
  delete ausfuehrlich.nachrangTilgung;
  if (bank) ausfuehrlich.bankBetrag = bank.betrag;
  if (nachrang) {
    ausfuehrlich.nachrangBetrag = nachrang.betrag;
    if (nachrang.sollzins > 0) ausfuehrlich.nachrangZins = nachrang.sollzins / 100;
    if (nachrang.tilgung > 0) ausfuehrlich.nachrangTilgung = nachrang.tilgung / 100;
  }
  return {
    ...(bank
      ? {
          seniorInterestRate: bank.sollzins,
          ...(bank.tilgung > 0 ? { seniorRepaymentRate: bank.tilgung } : {}),
          ...(bank.zinsbindungJahre > 0 ? { seniorFixedRateYears: Math.round(bank.zinsbindungJahre) } : {}),
        }
      : {}),
    ...(nachrang && nachrang.zinsbindungJahre > 0 ? { juniorFixedRateYears: Math.round(nachrang.zinsbindungJahre) } : {}),
    ausfuehrlich,
  };
}
