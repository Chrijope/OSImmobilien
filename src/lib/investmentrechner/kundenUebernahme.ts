/**
 * Die Zahlen des Kunden in den Investmentrechner übernehmen.
 *
 * Wird im Rechner ein Kunde gewählt, sollen Jahresbrutto, Steuerklasse
 * beziehungsweise Veranlagung und das zu versteuernde Einkommen nicht noch
 * einmal abgetippt werden. Woher diese Werte kommen, entscheidet nicht dieses
 * Modul: Das tut `loadKundenkontext` in src/lib/kundenkontextHelper.ts. Hier
 * wird nur
 * übersetzt, welches Feld des Rechners welchen Wert bekommt und welcher Satz
 * darunter steht.
 *
 * Drei Grundsätze, wie in objektVorbelegung.ts:
 *
 *   1. Ohne Selbstauskunft wird nichts übernommen. Aus dem Kontakt geraten
 *      Zahlen wären eine Berechnung, die richtig aussieht und falsch ist.
 *      Maßgeblich ist deshalb `kontext.ausSelbstauskunft`, nicht die Felder
 *      daneben, die einen Rückfall auf die erfassten Einkünfte haben.
 *   2. Nichts geschieht ohne Zustimmung. Dieses Modul liefert nur den
 *      Vorschlag samt Aufzählung, geschrieben wird er erst nach der Rückfrage.
 *   3. Erst das Investment, dann die Frage. Eine Selbstauskunft gehört zu
 *      einem Investment, also gibt es die Frage erst, wenn feststeht, um
 *      welches es geht. Dafür sorgt `kundenschritt`.
 *
 * Die Ableitung selbst ist rein und ohne Datenzugriff, damit sie sich prüfen
 * lässt. Nur `kundenUebernahmeFuer` liest den Kunden aus dem Zwischenspeicher.
 */

import { formatStand, loadKundenkontext, type Kundenkontext } from "@/lib/kundenkontextHelper";
import { cacheGet } from "@/lib/dataCache";
import { eigeneSaDataFuerInvestmentRow, type InvestmentZeileMitSa } from "@/lib/saQuelle";
import { formatEuro } from "./formatierer";
import { setzeHerkunft, type Herkunft, type Herkunftseintrag } from "./herkunft";
import type { InvestmentEingabe, Steuerklasse } from "./rechenkern";

/** Ein Posten in der Rückfrage: Feldname, Wert und woher genau er stammt. */
export interface UebernahmePosten {
  /** Beschriftung wortgleich mit dem Eingabefeld im Rechner. */
  feld: string;
  wert: string;
  /** Kurze Einordnung, wenn der Wert nicht wörtlich in der Selbstauskunft steht. */
  hinweis?: string;
}

export interface KundenUebernahme {
  /** Was in die Eingabe geschrieben würde. Leer heißt: nichts zu übernehmen. */
  aenderung: Partial<InvestmentEingabe>;
  /** Die Felder, deren Herkunft danach auf „selbstauskunft" steht. */
  felder: (keyof InvestmentEingabe)[];
  /** Für die Rückfrage, in der Reihenfolge des Rechners. */
  posten: UebernahmePosten[];
  /** Der Satz, der klein unter jedem übernommenen Feld steht. */
  hinweis: Herkunftseintrag;
  /** Für diesen Kunden liegt keine Selbstauskunft vor. */
  ohneSelbstauskunft: boolean;
}

const LEERE_UEBERNAHME: KundenUebernahme = {
  aenderung: {},
  felder: [],
  posten: [],
  hinweis: { quelle: "selbstauskunft", text: "" },
  ohneSelbstauskunft: true,
};

const ROEMISCH: readonly Steuerklasse[] = ["I", "II", "III", "IV", "V", "VI"];

/**
 * Die Steuerklasse aus der Selbstauskunft, falls dort eine steht.
 *
 * Das PDF-Formular schreibt sie als einzelne Ziffer (saPdfFormular.ts), von
 * Hand eingetragen steht dort auch schon einmal „III". Beides wird erkannt,
 * alles andere ergibt `undefined`, und dann bleibt das Feld im Rechner
 * unberührt.
 */
export function steuerklasseAusSa(sa: unknown): Steuerklasse | undefined {
  if (!sa || typeof sa !== "object") return undefined;
  const wurzel = sa as Record<string, unknown>;
  const person1 = wurzel.person1 && typeof wurzel.person1 === "object" ? (wurzel.person1 as Record<string, unknown>) : {};
  const roh = person1.steuerklasse ?? wurzel.steuerklasse;
  if (typeof roh === "number") return ROEMISCH[roh - 1];
  if (typeof roh !== "string") return undefined;
  const text = roh.trim().toUpperCase();
  if (!text) return undefined;
  const ziffer = Number(text);
  if (Number.isInteger(ziffer) && ziffer >= 1 && ziffer <= 6) return ROEMISCH[ziffer - 1];
  return (ROEMISCH as readonly string[]).includes(text) ? (text as Steuerklasse) : undefined;
}

/**
 * Der Vorschlag für einen Kunden, aus seinem Kundenkontext und der in der
 * Selbstauskunft gefundenen Steuerklasse.
 */
export function kundenUebernahmeAus(
  kontext: Kundenkontext | null,
  steuerklasse: Steuerklasse | undefined,
): KundenUebernahme {
  if (!kontext) return LEERE_UEBERNAHME;
  /*
   * Ausschließlich der belegbare Teil des Kundenkontexts. `bruttoJahrHaushalt`
   * eine Ebene höher hat einen Rückfall auf die am Kontakt erfassten
   * Monatseinkünfte mal zwölf. Genau daher kamen die 467.777 Euro Jahresbrutto,
   * die im Rechner als „Aus der Selbstauskunft“ ausgewiesen wurden, obwohl in
   * der Selbstauskunft nichts dergleichen stand.
   */
  const sa = kontext.ausSelbstauskunft;
  if (!sa) return { ...LEERE_UEBERNAHME, ohneSelbstauskunft: true };

  const stand = formatStand(kontext.saDatum);
  const hinweis: Herkunftseintrag = {
    quelle: "selbstauskunft",
    text: stand ? `Aus der Selbstauskunft vom ${stand}` : "Aus der Selbstauskunft",
    stand: kontext.saDatum,
  };

  const aenderung: Partial<InvestmentEingabe> = {};
  const felder: (keyof InvestmentEingabe)[] = [];
  const posten: UebernahmePosten[] = [];

  if (sa.bruttoJahrHaushalt > 0) {
    aenderung.annualGrossIncome = Math.round(sa.bruttoJahrHaushalt);
    felder.push("annualGrossIncome");
    posten.push({
      feld: "Jahresbrutto Kunde",
      wert: formatEuro(sa.bruttoJahrHaushalt),
      // Auch die zweite Person zählt nur, wenn die Selbstauskunft eine führt.
      hinweis: sa.anzahlPersonen === 2 ? "Summe beider Personen" : undefined,
    });
  }

  if (steuerklasse) {
    aenderung.taxClass = steuerklasse;
    felder.push("taxClass");
    posten.push({ feld: "Steuerklasse", wert: steuerklasse });
  }

  // Die Veranlagung kommt immer mit. Sie hängt am Familienstand und nicht an
  // der Steuerklasse, und sie ist die Angabe, die das Ergebnis tatsächlich
  // verändert: Bei Splitting rechnet der Kern nach § 32a Abs. 5 EStG.
  aenderung.jointAssessment = sa.verheiratet;
  felder.push("jointAssessment");
  posten.push({
    feld: "Veranlagung / Einkommensteuertarif",
    wert: sa.verheiratet ? "Splittingtabelle · Zusammenveranlagung" : "Grundtabelle · Einzelveranlagung",
    hinweis: steuerklasse ? undefined : "Aus dem Familienstand, die Selbstauskunft nennt keine Steuerklasse",
  });

  // Eine eingetragene 0 wird übernommen, nur die Schätzung braucht ein Brutto.
  if (sa.zvE > 0 || sa.zvEAngegeben) {
    aenderung.taxableIncomeCustomer = Math.round(sa.zvE);
    felder.push("taxableIncomeCustomer");
    posten.push({
      feld: "zvE Kunde",
      wert: formatEuro(sa.zvE),
      hinweis: !sa.zvEAngegeben
        ? "Geschätzt aus dem Jahresbrutto, bitte gegen den Steuerbescheid prüfen"
        : sa.verheiratet
          ? "Gemeinsames zvE laut Selbstauskunft, gerechnet mit Splittingtarif"
          : sa.anzahlPersonen === 2
            ? "zvE von Person 1 laut Selbstauskunft, ohne Zusammenveranlagung wird getrennt besteuert"
            : "Laut Selbstauskunft",
    });
    /*
     * Das gemeinsame zvE enthält den Partner schon. Der Rechner addiert bei
     * Splitting das Partnerfeld dazu, ein dort stehender Wert zählte doppelt.
     */
    if (sa.zvEAngegeben && sa.verheiratet) {
      aenderung.taxableIncomeSpouse = 0;
      felder.push("taxableIncomeSpouse");
      posten.push({ feld: "zvE Ehe-/Lebenspartner", wert: formatEuro(0), hinweis: "Im gemeinsamen zvE enthalten" });
    }
  }

  return { aenderung, felder, posten, hinweis, ohneSelbstauskunft: false };
}

/**
 * Die Selbstauskunft eines Kunden, so wie `loadKundenkontext` sie liest.
 *
 * Bewusst dieselben beiden Schlüssel und dieselbe Reihenfolge: Sonst könnte
 * die Steuerklasse aus einer anderen Selbstauskunft stammen als das
 * Einkommen daneben.
 */
/*
 * Dieselbe Quelle wie der Kundenkontext: ausschließlich die Selbstauskunft
 * des betrachteten Investments.
 *
 * Sie am Kontakt allein zu suchen war der eine Fehler, an dem der Rechner in
 * der Suche "Selbstauskunft" anzeigte und darunter behauptete, es liege keine
 * vor: Eine Selbstauskunft gehört zu einem Investment. Sie ersatzweise aus
 * einem anderen Investment zu holen war der zweite: Der Rechner hätte dann
 * eine Steuerklasse übernommen, die zu einem anderen Vorgang gehört.
 */
export function selbstauskunftAus(kundeId: string, investmentId?: string | null): unknown {
  if (!investmentId) return null;
  const zeilen = ((cacheGet("investments") || []) as InvestmentZeileMitSa[])
    .filter((r) => (r as { kunde_id?: string }).kunde_id === kundeId);
  return eigeneSaDataFuerInvestmentRow(zeilen.find((r) => r.id === investmentId) ?? null);
}

/** Der Vorschlag für einen Kunden aus dem Zwischenspeicher. */
export function kundenUebernahmeFuer(
  kundeId: string | null | undefined,
  /** Das gewählte Investment, damit dessen eigene Selbstauskunft gewinnt. */
  investmentId?: string | null,
): KundenUebernahme {
  if (!kundeId) return LEERE_UEBERNAHME;
  const kontext = loadKundenkontext(kundeId, investmentId);
  if (!kontext) return LEERE_UEBERNAHME;
  return kundenUebernahmeAus(kontext, steuerklasseAusSa(selbstauskunftAus(kundeId, investmentId)));
}

/**
 * Was der Rechner nach der Wahl von Kunde und Investment anzeigt.
 *
 *   still              nichts zu sagen, etwa ohne Kunde oder ohne Investments
 *   investmentWaehlen  der Kunde steht, das Investment fehlt noch
 *   ohneSelbstauskunft ein kurzer Satz, keine Frage
 *   frage              die Rückfrage samt Aufstellung
 */
export type Kundenschritt =
  | { art: "still" }
  | { art: "investmentWaehlen" }
  | { art: "ohneSelbstauskunft" }
  | { art: "frage"; uebernahme: KundenUebernahme };

/**
 * Der nächste Schritt, rein und ohne Datenzugriff, damit die Reihenfolge
 * prüfbar ist.
 *
 * Vorher fragte der Rechner sofort nach der Kundenwahl. Bei einem Kunden mit
 * mehreren Investments bezog sich die Frage dann auf die neueste
 * Selbstauskunft und nicht auf die des gemeinten Investments.
 *
 * @param investmentId     das gewählte Investment, `null` solange keines gewählt ist
 * @param anzahlInvestments wie viele der Kunde überhaupt hat
 * @param uebernahme       der Vorschlag zum gewählten Investment, sonst `null`
 */
export function kundenschritt(
  investmentId: string | null | undefined,
  anzahlInvestments: number,
  uebernahme: KundenUebernahme | null,
): Kundenschritt {
  // Ohne Investment gibt es keine Frage. Hat der Kunde gar keines, sagt das
  // schon die Investmentauswahl selbst, dann bleibt es hier still.
  if (!investmentId) return anzahlInvestments > 0 ? { art: "investmentWaehlen" } : { art: "still" };
  if (!uebernahme || uebernahme.ohneSelbstauskunft) return { art: "ohneSelbstauskunft" };
  return { art: "frage", uebernahme };
}

/** Die Herkunft der übernommenen Felder eintragen. */
export function herkunftMitUebernahme(bisher: Herkunft, uebernahme: KundenUebernahme): Herkunft {
  return setzeHerkunft(bisher, uebernahme.felder, uebernahme.hinweis);
}
