/**
 * Das persönliche Immobilienhandbuch, Seite für Seite.
 *
 * Vorlage ist Teil B der Strategie „Handbuch-Funnel für OS Immobilien“ vom
 * 26.09.2026 (handbuch.py). Die Texte sind von dort übernommen, mit diesen
 * bewussten Abweichungen:
 *
 *   - Alle Stellen zu § 34c und § 34i GewO fehlen. Christian baut sie selbst
 *     ein (Auftrag vom 26.09.2026).
 *   - Platzhalter ohne belegte Zahl sind weggelassen statt mit „[Zahl]“
 *     gezeigt: die Anzahl freier Wohnungen im Rahmen, die Löschfrist, die
 *     Fotos. Die Seite sagt dann weniger, aber nichts Unbelegtes.
 *   - „Wo unsere Wohnungen liegen“ nennt nur, was belegt ist: Schwerpunkt
 *     Bayern (47 von 91 Objekteinträgen am 26.09.2026), dazu ausgewählte
 *     Wohnungen in ganz Deutschland. Die Städteliste der Vorlage ist nicht
 *     belegt und fehlt deshalb.
 *   - Kapitel 9 für das Ziel „Erst einmal verstehen“ war in der Vorlage leer;
 *     hier steht ein kurzes Glossar.
 *
 * ENGLISCH (seit dem 26.09.2026): Jeder Text steht als Paar `tx(deutsch,
 * englisch)` direkt nebeneinander, damit beide Fassungen zusammen gepflegt
 * werden. Welche gilt, entscheidet `baueHandbuch` über `angaben.sprache`
 * (siehe `inSprache` in `diagramme.ts`). Englisch nach dem Glossar
 * `kundenspracheGlossar.ts`: Berater heißt „your contact“, nie „advisor“.
 *
 * GEMEINSAM VERANLAGT (seit dem 26.09.2026): Ist der Schalter bei Frage 3
 * gesetzt, gilt das Jahresbrutto als gemeinsames Einkommen des Paares, und
 * alle Steuerzahlen rechnen mit dem Splittingtarif des Rechenkerns.
 *
 * Alle Zahlen kommen aus `modell.ts`, also aus dem Rechenkern des
 * Investmentrechners.
 */
import type { Block, Handbuch, HandbuchSeite } from "./bausteine";
import {
  aufbauSprache,
  eur,
  euro,
  inSprache,
  linien,
  rahmenSpanne,
  ring,
  saeulenGruppen,
  tx,
  waagerecht,
  wasserfall,
  type Zeichnung,
} from "./diagramme";
import {
  annahmenText,
  BRUTTO_REIHENFOLGE,
  handbuchAuswertung,
  kaufkraftVerlauf,
  portfolioVerlauf,
  rechneModell,
  steuerTabelle,
  vermoegensVerlauf,
  wartenWerte,
  type HandbuchAuswertung,
} from "./modell";
import { antwortTextIn } from "./fragenSprache";
import {
  AUSGANG_TEXT,
  ermittleAusgang,
  type HandbuchAntworten,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import type { Sprache } from "../../../supabase/functions/_shared/kunden-sprache.ts";

export interface HandbuchPartner {
  name: string;
  email?: string;
  telefon?: string;
  buchungslink?: string;
}

export interface HandbuchAngaben {
  antworten: HandbuchAntworten;
  vorname: string;
  nachname: string;
  /** Erstellungsdatum als Text, etwa „26.09.2026“. */
  datum: string;
  /** Der persönliche Link zur Selbstauskunft, oder null. */
  saLink: string | null;
  /**
   * Ohne Link, weil der Link per E-Mail kommt (bekannte Adresse), nicht weil
   * die Selbstauskunft schon vorliegt. Ändert nur den Ersatztext.
   */
  saPerMail?: boolean;
  partner?: HandbuchPartner | null;
  /** Sprache des Handbuchs. Ohne Angabe Deutsch. */
  sprache?: Sprache;
}

const betrag = euro;
const prozent = (n: number) =>
  aufbauSprache() === "en"
    ? `${n.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
    : `${n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`;
/** „rund 42 %“, englisch „about 42%“. */
const rund = (n: number) => tx(`rund ${n} %`, `about ${n}%`);
const antwort = (s: Parameters<typeof antwortTextIn>[0], id: string) => antwortTextIn(s, id);

// ─── Diagramme mit Handbuch-Zahlen ───────────────────────────────────────

const KURZ_BRUTTO: Record<string, [string, string]> = {
  unter_50: ["unter 50 T€", "under €50k"],
  "50_80": ["50 bis 80 T€", "€50k to 80k"],
  "80_120": ["80 bis 120 T€", "€80k to 120k"],
  ueber_120: ["über 120 T€", "over €120k"],
};

export function diagrammSteuerNachEinkommen(kaufpreis: number, hervor?: number, schmal = false, gemeinsam = false): Zeichnung {
  const tabelle = steuerTabelle(kaufpreis, gemeinsam);
  return saeulenGruppen({
    gruppen: tabelle.map((z) => ({
      bezeichnung: schmal ? tx(...KURZ_BRUTTO[z.brutto]) : antwort("brutto", z.brutto),
      werte: [z.vor, z.nach],
    })),
    serienNamen: [tx("Eigenaufwand vor Steuer", "Your contribution before tax"), tx("Eigenaufwand nach Steuer", "Your contribution after tax")],
    farben: ["akzentHell", "akzent"],
    breite: schmal ? 400 : 660,
    hoehe: schmal ? 300 : 270,
    hervor,
    beschreibung: tx(
      `Monatlicher Eigenaufwand im ersten Jahr vor und nach Steuer je Einkommen, Modellwohnung ${betrag(kaufpreis)}.`,
      `Your monthly contribution in the first year before and after tax by income, model flat ${betrag(kaufpreis)}.`,
    ),
  });
}

export function diagrammVermoegen(kaufpreis: number, zve: number, breite = 660, hoehe = 290, gemeinsam = false): Zeichnung {
  const v = vermoegensVerlauf(rechneModell(kaufpreis, { zve, gemeinsam }));
  const letzte = v.vermoegen.length - 1;
  return linien({
    serien: [
      { name: tx("Wert der Wohnung", "Value of the flat"), werte: v.wert, farbe: "tinte", breite: 2.4 },
      { name: tx("Restschuld", "Remaining debt"), werte: v.restschuld, farbe: "rot", breite: 2.2, gestrichelt: true },
      { name: tx("Ihr Vermögen in der Wohnung", "Your equity in the flat"), werte: v.vermoegen, farbe: "akzent", breite: 3.2 },
    ],
    xs: v.jahre,
    breite,
    hoehe,
    xFormat: (x) => (x ? tx(`Jahr ${x}`, `Year ${x}`) : tx("Kauf", "Purchase")),
    flaecheIndex: 2,
    markierungen: [
      { index: letzte, wert: v.vermoegen[letzte], text: betrag(v.vermoegen[letzte]), farbe: "akzent", lage: "ul" },
      { index: 10, wert: v.vermoegen[10], text: betrag(v.vermoegen[10]), farbe: "akzent", lage: "or" },
    ],
    beschreibung: tx(
      `Wert, Restschuld und Vermögen der Modellwohnung über 30 Jahre, nach 30 Jahren rund ${betrag(v.vermoegen[letzte])}.`,
      `Value, remaining debt and equity of the model flat over 30 years, about ${betrag(v.vermoegen[letzte])} after 30 years.`,
    ),
  });
}

export function diagrammWarten(kaufpreis: number, zve: number, breite = 660, gemeinsam = false): Zeichnung {
  const w = wartenWerte(zve, kaufpreis, gemeinsam);
  const farben = ["akzent", "akzentHell", "grau"] as const;
  return waagerecht({
    // Schmal ohne die Jahreszahl in Klammern, sonst läuft die Beschriftung
    // über den linken Rand.
    zeilen: w.map((x, i) => ({
      bezeichnung: breite < 500 ? x.bezeichnung : `${x.bezeichnung} (${x.jahre} ${tx("Jahre", "years")})`,
      wert: x.vermoegen,
      farbe: farben[i],
    })),
    breite,
    zeilenhoehe: 46,
    bezeichnungBreite: breite < 500 ? 150 : 230,
    beschreibung: tx("Vermögen in der Wohnung am Ziel in 25 Jahren, je nach Startjahr.", "Equity in the flat at the 25-year goal, depending on the year you start."),
  });
}

function diagrammKaufkraft(): Zeichnung {
  const k = kaufkraftVerlauf();
  return linien({
    serien: [
      { name: tx("Kontostand (2 % Zins)", "Account balance (2% interest)"), werte: k.konto, farbe: "tinte", breite: 2.4 },
      { name: tx("Kaufkraft in heutigem Geld (2,5 % Inflation)", "Purchasing power in today's money (2.5% inflation)"), werte: k.kaufkraft, farbe: "akzent", breite: 3 },
    ],
    xs: k.jahre,
    breite: 660,
    hoehe: 250,
    ymin: 40000,
    ymax: 62000,
    xBeschriftungJede: 2,
    xFormat: (x) => (x ? tx(`Jahr ${x}`, `Year ${x}`) : tx("Heute", "Today")),
    markierungen: [
      { index: 10, wert: k.konto[10], text: betrag(k.konto[10]), farbe: "tinte", lage: "ol" },
      { index: 10, wert: k.kaufkraft[10], text: betrag(k.kaufkraft[10]), farbe: "akzent", lage: "ul" },
    ],
    beschreibung: tx("Kontostand und Kaufkraft von 50.000 € über zehn Jahre.", "Account balance and purchasing power of €50,000 over ten years."),
  });
}

export function diagrammHaushalt(breite = 660, hoehe = 270): Zeichnung {
  return wasserfall(
    [
      { bezeichnung: tx("Netto-|einkommen", "Net|income"), betrag: 4200, art: "start" },
      { bezeichnung: tx("Miete,|Wohnen", "Rent,|housing"), betrag: -1250, art: "minus" },
      { bezeichnung: tx("Lebens-|haltung", "Living|costs"), betrag: -1260, art: "minus" },
      { bezeichnung: tx("Auto, Ver-|sicherungen", "Car,|insurance"), betrag: -390, art: "minus" },
      { bezeichnung: tx("laufende|Kredite", "Existing|loans"), betrag: -200, art: "minus" },
      { bezeichnung: tx("Überschuss", "Surplus"), betrag: 0, art: "summe" },
      { bezeichnung: tx("75 % der|neuen Miete", "75% of|new rent"), betrag: 712, art: "plus" },
      { bezeichnung: tx("verfügbar für|die Rate", "Available|for the loan"), betrag: 0, art: "summe" },
    ],
    breite,
    hoehe,
    tx("Haushaltsrechnung einer Bank als Schema mit Beispielwerten je Monat.", "A bank's household calculation as a diagram with example monthly figures."),
  );
}

function diagrammNebenkosten(kaufpreis: number): Zeichnung {
  return ring({
    teile: [
      { bezeichnung: `${tx("Grunderwerbsteuer 3,5 %", "Transfer tax 3.5%")}: ${betrag(kaufpreis * 0.035)}`, wert: kaufpreis * 0.035, farbe: "akzent" },
      { bezeichnung: `${tx("Notar 1,0 %", "Notary 1.0%")}: ${betrag(kaufpreis * 0.01)}`, wert: kaufpreis * 0.01, farbe: "tinte" },
      { bezeichnung: `${tx("Grundbuch 0,5 %", "Land register 0.5%")}: ${betrag(kaufpreis * 0.005)}`, wert: kaufpreis * 0.005, farbe: "akzentHell" },
    ],
    mitteOben: betrag(kaufpreis * 0.05),
    mitteUnten: tx("5,0 % in Bayern", "5.0% in Bavaria"),
    breite: 440,
    hoehe: 190,
    beschreibung: tx(
      `Kaufnebenkosten in Bayern für ${betrag(kaufpreis)}: zusammen ${betrag(kaufpreis * 0.05)}.`,
      `Incidental purchase costs in Bavaria for ${betrag(kaufpreis)}: ${betrag(kaufpreis * 0.05)} in total.`,
    ),
  });
}

function diagrammAfa(kaufpreis: number): Zeichnung {
  const e = rechneModell(kaufpreis, { jahre: 1 });
  const gebaeude = e.depreciationBasis;
  const boden = e.kaufpreisGesamt + e.purchaseCosts - gebaeude;
  return waagerecht({
    zeilen: [
      { bezeichnung: tx("Gebäude inkl. Nebenkosten", "Building incl. purchase costs"), wert: gebaeude, farbe: "akzent" },
      { bezeichnung: tx("Grund und Boden", "Land"), wert: boden, farbe: "grau" },
      { bezeichnung: tx("AfA im Jahr (2 % des Gebäudes)", "Depreciation per year (2% of building)"), wert: gebaeude * 0.02, farbe: "tinte" },
    ],
    breite: 660,
    zeilenhoehe: 50,
    bezeichnungBreite: 240,
    maxWert: kaufpreis * 1.08,
    beschreibung: tx(
      "Aufteilung von Kaufpreis und Nebenkosten in Gebäude und Boden, dazu die jährliche Abschreibung.",
      "Split of purchase price and purchase costs into building and land, plus the annual depreciation.",
    ),
  });
}

function diagrammVermietungsergebnis(a: HandbuchAuswertung): Zeichnung {
  const j = a.ergebnis.years[0];
  return wasserfall(
    [
      { bezeichnung: tx("Kaltmiete", "Net cold rent"), betrag: j.effectiveRent, art: "start" },
      { bezeichnung: tx("nicht umlage-|fähige Kosten", "Non-recover-|able costs"), betrag: -j.operatingCosts, art: "minus" },
      { bezeichnung: tx("Zinsen", "Interest"), betrag: -j.interest, art: "minus" },
      { bezeichnung: tx("AfA", "Depreciation"), betrag: -j.buildingDepreciation, art: "minus" },
      { bezeichnung: tx("Finanzierungs-|nebenkosten", "Financing|costs"), betrag: -j.financingCostDeduction, art: "minus" },
      { bezeichnung: tx("Ergebnis|Vermietung", "Letting|result"), betrag: 0, art: "summe" },
    ],
    660,
    290,
    tx("Einkünfte aus Vermietung der Modellwohnung im ersten Jahr, Position für Position.", "Rental income of the model flat in the first year, item by item."),
  );
}

// ─── Seiten ──────────────────────────────────────────────────────────────

function inhaltListe(): Array<{ nr: string; titel: string; seitenId: string }> {
  return [
    { nr: "1", titel: tx("Warum die Wohnung zum Schluss kommt", "Why the flat comes last"), seitenId: "kapitel-1" },
    { nr: "2", titel: tx("So arbeitet OS Immobilien", "How OS Immobilien works"), seitenId: "kapitel-2" },
    { nr: "3", titel: tx("Geld, das still an Wert verliert", "Money that quietly loses value"), seitenId: "kapitel-3" },
    { nr: "4", titel: tx("Wie eine Bank entscheidet", "How a bank decides"), seitenId: "kapitel-4" },
    { nr: "5", titel: tx("Ihr Rahmen", "Your budget"), seitenId: "kapitel-5" },
    { nr: "6", titel: tx("Was das Finanzamt mitträgt", "What the tax office contributes"), seitenId: "kapitel-6" },
    { nr: "7", titel: tx("Eine Wohnung, jede Zahl offen", "One flat, every figure disclosed"), seitenId: "kapitel-7" },
    { nr: "8", titel: tx("Vermögen und der Preis des Wartens", "Wealth and the price of waiting"), seitenId: "kapitel-8" },
    { nr: "9", titel: tx("Ihr Schwerpunkt", "Your focus"), seitenId: "kapitel-9" },
    { nr: "10", titel: tx("Kosten beim Kauf", "Costs of buying"), seitenId: "kapitel-10" },
    { nr: "11", titel: tx("Vom Ja bis zum Notar", "From yes to the notary"), seitenId: "kapitel-11" },
    { nr: "12", titel: tx("Ihre Unterlagen", "Your documents"), seitenId: "kapitel-12" },
    { nr: "13", titel: tx("Chancen und Risiken, ehrlich gerechnet", "Opportunities and risks, honestly calculated"), seitenId: "kapitel-13" },
    { nr: "14", titel: tx("Häufige Fragen", "Frequently asked questions"), seitenId: "kapitel-14" },
    { nr: "", titel: tx("Ihr nächster Schritt: die Selbstauskunft", "Your next step: the self-disclosure"), seitenId: "naechster-schritt" },
  ];
}

/** Die Kapitel mit eigenen Zahlen. Steht so auch auf der Landingpage. */
export const PERSOENLICHE_KAPITEL = "5, 6, 7, 9, 11 und 12";

/** Titel der Kapitelliste, für die Vorschau auf der Landingpage. */
export function kapitelListe(sprache: Sprache = "de"): Array<{ nr: string; titel: string }> {
  return inSprache(sprache, () => inhaltListe().filter((k) => k.nr).map((k) => ({ nr: k.nr, titel: k.titel })));
}

/** Die deutsche Kapitelliste, wie bisher. */
export const KAPITEL_LISTE = kapitelListe("de");

/** „Kapitel 5“, englisch „Chapter 5“. */
const kapitel = (nr: number | string) => tx(`Kapitel ${nr}`, `Chapter ${nr}`);

function beruftHinweis(a: HandbuchAntworten): string {
  switch (a.beruf) {
    case "angestellt":
      return tx(
        "Als Angestellte oder Angestellter zählen für die Bank vor allem ein unbefristeter Vertrag und eine abgeschlossene Probezeit. Ihr Nettogehalt belegen Sie mit den letzten drei Gehaltsnachweisen.",
        "As an employee, what matters most to the bank is a permanent contract and a completed probation period. You prove your net salary with your last three payslips.",
      );
    case "beamter":
      return tx(
        "Viele Banken werten ein Beamtenverhältnis auf Lebenszeit als besonders sicheres Einkommen. Belegt wird es mit den Bezügemitteilungen.",
        "Many banks treat lifetime civil servant status (Beamter auf Lebenszeit) as a particularly secure income. You prove it with your salary statements.",
      );
    case "selbststaendig":
      return tx(
        "Bei Selbstständigen schaut die Bank auf die letzten drei Jahre. Entscheidend ist der Durchschnitt, nicht das beste Jahr. Rechnen Sie damit, dass die Bank vorsichtiger rechnet als bei Angestellten.",
        "For the self-employed, the bank looks at the last three years. What counts is the average, not the best year. Expect the bank to calculate more cautiously than for employees.",
      );
    default:
      return tx(
        "Wenn Ihr Einkommen aus Rente, Kapital oder anderen Quellen kommt, klärt Ihr Berater mit Ihnen, wie die Bank es ansetzt.",
        "If your income comes from a pension, investments or other sources, your contact will clarify with you how the bank counts it.",
      );
  }
}

function zeitplan(start: HandbuchAntworten["start"]): [string, string] {
  switch (start) {
    case "sofort":
      return [
        tx("Diese Woche", "This week"),
        tx(
          "Selbstauskunft ausfüllen. Ihr Berater meldet sich und stellt Ihnen passende Wohnungen vor. Passt eine, reservieren Sie sie.",
          "Complete the self-disclosure. Your contact gets in touch and presents suitable flats. If one fits, you reserve it.",
        ),
      ];
    case "drei_monate":
      return [
        tx("In den nächsten Wochen", "Over the next few weeks"),
        tx(
          "Selbstauskunft ausfüllen und Unterlagen aus Kapitel 12 sammeln. Dann Objektvorstellung. Bis zum Notar vergehen nach der Reservierung erfahrungsgemäß einige Wochen, damit passt Ihr Zeitplan von drei Monaten.",
          "Complete the self-disclosure and collect the documents from chapter 12. Then the property presentation. After the reservation it usually takes a few weeks until the notary appointment, so your three-month timeline fits.",
        ),
      ];
    case "spaeter":
      return [
        tx("Bis zu Ihrem Start", "Until you start"),
        tx(
          "Lesen Sie in Ruhe und sammeln Sie schon die Unterlagen aus Kapitel 12. Etwa drei Monate vor Ihrem Wunschtermin füllen Sie die Selbstauskunft aus, dann bleibt genug Zeit für Objektvorstellung, Bank und Notar.",
          "Read at your own pace and start collecting the documents from chapter 12. About three months before your preferred date, complete the self-disclosure. That leaves enough time for the property presentation, the bank and the notary.",
        ),
      ];
    default:
      return [
        tx("Ohne Zeitdruck", "No time pressure"),
        tx(
          "Nehmen Sie sich Zeit für das Handbuch. Wenn Sie wissen wollen, wo Sie genau stehen, ist die Selbstauskunft der nächste Schritt. Sie verpflichtet Sie zu nichts.",
          "Take your time with the handbook. If you want to know exactly where you stand, the self-disclosure is the next step. It does not commit you to anything.",
        ),
      ];
  }
}

function unterlagenAlle(): Array<{ text: string; optional?: boolean }> {
  return [
    { text: tx("Selbstauskunft", "Self-disclosure (Selbstauskunft)") },
    { text: tx("Personalausweis", "ID card or passport") },
    { text: tx("Schufa-Bonitätsauskunft", "Schufa credit report") },
    { text: tx("Eigener Mietvertrag oder Bestätigung, dass Sie mietfrei wohnen", "Your own rental agreement or confirmation that you live rent-free") },
    { text: tx("Eigenkapitalnachweis", "Proof of equity") },
    { text: tx("Kontoauszüge der letzten drei Monate", "Bank statements for the last three months") },
    { text: tx("Nachweis private Krankenversicherung", "Proof of private health insurance"), optional: true },
  ];
}

function unterlagenBeruf(beruf: HandbuchAntworten["beruf"]): [string, Array<{ text: string; optional?: boolean }>] {
  switch (beruf) {
    case "angestellt":
      return [
        tx("Angestellte", "employees"),
        [
          { text: tx("Letzter, vorletzter und vorvorletzter Gehaltsnachweis", "Your last three payslips") },
          { text: tx("Gehaltsnachweis Dezember des Vorjahres", "Payslip for December of the previous year") },
          { text: tx("Lohnsteuerbescheinigung des Vorjahres", "Annual wage tax statement for the previous year") },
          { text: tx("Letzter Steuerbescheid oder Erklärung, dass keiner vorliegt", "Latest tax assessment, or a statement that there is none") },
          { text: tx("Arbeitsvertrag", "Employment contract") },
          { text: tx("Renteninformation", "Pension statement (Renteninformation)") },
        ],
      ];
    case "beamter":
      return [
        tx("Beamte", "civil servants"),
        [
          { text: tx("Die letzten drei Bezügemitteilungen", "Your last three salary statements") },
          { text: tx("Lohnsteuerbescheinigung", "Annual wage tax statement") },
          { text: tx("Steuerbescheid oder Erklärung, dass keiner vorliegt", "Tax assessment, or a statement that there is none") },
          { text: tx("Ernennungsurkunde", "Certificate of appointment"), optional: true },
          { text: tx("Besoldungsbescheide der letzten drei Monate", "Pay notices for the last three months") },
          { text: tx("Versorgungsauskunft", "Pension entitlement statement") },
        ],
      ];
    case "selbststaendig":
      return [
        tx("Selbstständige und Freiberufler", "the self-employed and freelancers"),
        [
          { text: tx("Steuerbescheide der letzten drei Jahre", "Tax assessments for the last three years") },
          { text: tx("Steuererklärungen der letzten drei Jahre", "Tax returns for the last three years") },
          { text: tx("Bilanz oder BWA der letzten drei Jahre", "Balance sheet or management accounts (BWA) for the last three years") },
          { text: tx("Geschäftskontoauszüge der letzten drei Monate", "Business bank statements for the last three months") },
          { text: tx("Summen- und Saldenliste des laufenden Jahres", "Trial balance for the current year") },
          { text: tx("Handelsregisterauszug", "Commercial register extract"), optional: true },
        ],
      ];
    default:
      return [
        tx("weitere Einkommensarten", "other types of income"),
        [
          { text: tx("Nachweise zu Ihrem Einkommen, zum Beispiel Rentenbescheid", "Proof of your income, for example a pension notice") },
          { text: tx("Ihr Berater stimmt die Liste mit Ihnen und der Bank ab", "Your contact agrees the list with you and the bank") },
        ],
      ];
  }
}

function schwerpunkt(ang: HandbuchAngaben, a: HandbuchAuswertung): { titel: string; bloecke: Block[] } {
  const ziel = ang.antworten.ziel;
  if (ziel === "steuer") {
    const j = a.ergebnis.years[0];
    return {
      titel: tx("Steuer im Detail", "Tax in detail"),
      bloecke: [
        {
          typ: "lead",
          text: tx(
            "Sie haben als Ziel „Steuerlast senken“ gewählt. Deshalb zeigen wir Ihnen hier genau, wie die Steuerwirkung entsteht.",
            "You chose “Lower my tax bill” as your goal. So here we show you exactly how the tax effect comes about.",
          ),
        },
        {
          typ: "grafik",
          titel: tx("Ihr erstes Jahr, Position für Position", "Your first year, item by item"),
          untertitel: tx("Einkünfte aus Vermietung der Modellwohnung, Jahreswerte", "Rental income of the model flat, annual figures"),
          zeichnung: diagrammVermietungsergebnis(a),
        },
        {
          typ: "absatz",
          text: tx(
            `Das Ergebnis aus Vermietung ist im ersten Jahr ${betrag(j.taxableResult)}. Um diesen Betrag sinkt Ihr zu versteuerndes Einkommen. Bei Ihrem Steuersatz ergibt das eine Steuerwirkung von rund ${betrag(j.taxEffect)} im Jahr, rund ${betrag(j.taxEffect / 12)} im Monat.`,
            `The letting result in the first year is ${betrag(j.taxableResult)}. Your taxable income falls by this amount. At your tax rate, that gives a tax effect of about ${betrag(j.taxEffect)} a year, about ${betrag(j.taxEffect / 12)} a month.`,
          ),
        },
        { typ: "h2", text: tx("Drei Dinge, die Steuersparer oft übersehen", "Three things tax savers often overlook") },
        {
          typ: "karten",
          spalten: 3,
          karten: [
            {
              titel: tx("Die Wirkung sinkt", "The effect decreases"),
              text: tx(
                "Mit jeder Tilgung sinken die Zinsen, und die Miete steigt. Die Steuerwirkung ist im ersten Jahr am größten.",
                "With every repayment the interest falls and the rent rises. The tax effect is largest in the first year.",
              ),
            },
            {
              titel: tx("Die Rücklage zählt später", "The reserve counts later"),
              text: tx(
                "Sie mindert Ihre Steuer erst, wenn die Gemeinschaft das Geld ausgibt.",
                "It only reduces your tax once the owners' association spends the money.",
              ),
            },
            {
              titel: tx("Das Geld kommt verzögert", "The money arrives later"),
              text: tx(
                "Die Erstattung kommt mit dem Steuerbescheid. Ob ein Freibetrag im Lohnsteuerabzug sinnvoll ist, klären Sie mit Ihrem Steuerberater.",
                "The refund comes with your tax assessment. Whether a tax allowance in your payroll tax makes sense is something to clarify with your tax adviser.",
              ),
            },
          ],
        },
      ],
    };
  }
  if (ziel === "vermoegen") {
    const p = portfolioVerlauf(a.zve, a.kaufpreis, a.gemeinsam);
    const ende = p.jahre.length - 1;
    const zeichnung = linien({
      serien: [
        { name: tx("1 Wohnung", "1 flat"), werte: p.eine, farbe: "akzentHell", breite: 2.4 },
        { name: tx("2 Wohnungen (zweite in Jahr 3)", "2 flats (second in year 3)"), werte: p.zwei, farbe: "akzent", breite: 2.6 },
        { name: tx("3 Wohnungen (dritte in Jahr 6)", "3 flats (third in year 6)"), werte: p.drei, farbe: "tinte", breite: 3 },
      ],
      xs: p.jahre,
      breite: 660,
      hoehe: 280,
      xFormat: (x) => (x ? tx(`Jahr ${x}`, `Year ${x}`) : "Start"),
      markierungen: [
        { index: ende, wert: p.drei[ende], text: betrag(p.drei[ende]), farbe: "tinte", lage: "ol" },
        { index: ende, wert: p.eine[ende], text: betrag(p.eine[ende]), farbe: "akzent", lage: "ol" },
      ],
      beschreibung: tx("Vermögen in einer bis drei Modellwohnungen über 25 Jahre.", "Equity in one to three model flats over 25 years."),
    });
    return {
      titel: tx("Von der ersten Wohnung zum Bestand", "From the first flat to a portfolio"),
      bloecke: [
        {
          typ: "lead",
          text: tx(
            "Sie haben als Ziel „Vermögen aufbauen“ gewählt. Deshalb zeigen wir Ihnen, wie aus einer Wohnung ein kleiner Bestand werden kann.",
            "You chose “Build wealth” as your goal. So we show you how one flat can grow into a small portfolio.",
          ),
        },
        {
          typ: "grafik",
          titel: tx("Vermögen in den Wohnungen, eine bis drei Modellwohnungen", "Equity in the flats, one to three model flats"),
          untertitel: tx(
            "zweite Wohnung nach drei, dritte nach sechs Jahren, Annahmen wie in Kapitel 7",
            "second flat after three years, third after six, assumptions as in chapter 7",
          ),
          zeichnung,
        },
        {
          typ: "absatz",
          text: tx(
            `Nach 25 Jahren stehen im Modell mit einer Wohnung rund ${betrag(p.eine[ende])} Vermögen in der Wohnung, mit drei Wohnungen rund ${betrag(p.drei[ende])}. Jede weitere Wohnung braucht ihre eigene Prüfung durch die Bank, ihr eigenes Eigenkapital für die Nebenkosten und muss in Ihren Rahmen passen.`,
            `After 25 years, the model shows about ${betrag(p.eine[ende])} of equity with one flat and about ${betrag(p.drei[ende])} with three. Every further flat needs its own assessment by the bank, its own equity for the purchase costs, and it has to fit your budget.`,
          ),
        },
        { typ: "h2", text: tx("So wächst ein Bestand vernünftig", "How a portfolio grows sensibly") },
        {
          typ: "karten",
          spalten: 3,
          karten: [
            {
              titel: tx("Erst eine Wohnung", "One flat first"),
              text: tx(
                "Die erste Wohnung zeigt Ihnen im ersten Steuerjahr, ob die Rechnung für Sie hält.",
                "In its first tax year, the first flat shows you whether the calculation holds for you.",
              ),
            },
            {
              titel: tx("Dann der Überschuss", "Then the surplus"),
              text: tx(
                "Steigende Mieten und sinkende Zinsen verbessern mit der Zeit Ihren Überschuss für die Bank.",
                "Rising rents and falling interest improve your surplus in the bank's eyes over time.",
              ),
            },
            {
              titel: tx("Dann die nächste", "Then the next one"),
              text: tx(
                "Nach dem ersten Steuerbescheid sprechen wir mit Ihnen über eine zweite Wohnung, nicht vorher.",
                "After your first tax assessment we talk with you about a second flat, not before.",
              ),
            },
          ],
        },
      ],
    };
  }
  if (ziel === "alter") {
    const e = rechneModell(a.kaufpreis, { zve: a.zve, jahre: 30, gemeinsam: a.gemeinsam });
    const js = e.years;
    const j30 = js[js.length - 1];
    const zeichnung = linien({
      serien: [
        { name: tx("Monatlich vor Steuer", "Monthly before tax"), werte: js.map((j) => j.cashflowBeforeTax / 12), farbe: "akzentHell", breite: 2.4 },
        { name: tx("Monatlich nach Steuer", "Monthly after tax"), werte: js.map((j) => j.cashflowAfterTax / 12), farbe: "akzent", breite: 3 },
      ],
      xs: js.map((j) => j.index + 1),
      breite: 660,
      hoehe: 260,
      xFormat: (x) => tx(`Jahr ${x}`, `Year ${x}`),
      yFormat: (v) => betrag(v),
      beschreibung: tx(
        "Monatlicher Überschuss oder Zuschuss der Modellwohnung vor und nach Steuer über 30 Jahre.",
        "Monthly surplus or top-up of the model flat before and after tax over 30 years.",
      ),
    });
    return {
      titel: tx("Ihre Wohnung im Ruhestand", "Your flat in retirement"),
      bloecke: [
        {
          typ: "lead",
          text: tx(
            "Sie haben als Ziel „Fürs Alter vorsorgen“ gewählt. Deshalb zeigen wir Ihnen, was die Wohnung über die Jahre leistet.",
            "You chose “Provide for retirement” as your goal. So we show you what the flat achieves over the years.",
          ),
        },
        {
          typ: "grafik",
          titel: tx("Was die Wohnung Ihnen im Monat bringt oder kostet, über 30 Jahre", "What the flat earns or costs you each month, over 30 years"),
          untertitel: tx("vor und nach Steuer, Annahmen wie in Kapitel 7", "before and after tax, assumptions as in chapter 7"),
          zeichnung,
        },
        {
          typ: "absatz",
          text: tx(
            `Vor Steuer wird aus dem monatlichen Zuschuss mit steigender Miete nach einigen Jahren ein Überschuss. Nach Steuer bleibt der Betrag über lange Zeit ungefähr gleich, weil dann auf den Überschuss Steuern anfallen. Nach 30 Jahren ist die Restschuld im Modell auf rund ${betrag(j30.remainingDebt)} gesunken, die Wohnung ist im Modell rund ${betrag(j30.propertyValue)} wert.`,
            `Before tax, the monthly top-up turns into a surplus after a few years as the rent rises. After tax, the amount stays roughly the same for a long time, because the surplus is then taxed. After 30 years, the model's remaining debt has fallen to about ${betrag(j30.remainingDebt)} and the flat is worth about ${betrag(j30.propertyValue)}.`,
          ),
        },
        { typ: "h2", text: tx("Was das für Ihren Ruhestand heißt", "What this means for your retirement") },
        {
          typ: "karten",
          spalten: 3,
          karten: [
            {
              titel: tx("Eine Ergänzung", "A supplement"),
              text: tx("Eine Wohnung ergänzt die gesetzliche Rente. Sie ersetzt sie nicht.", "A flat supplements the state pension. It does not replace it."),
            },
            {
              titel: tx("Schuldenfrei planen", "Plan to be debt-free"),
              text: tx(
                "Mit Sondertilgungen oder höherer Tilgung können Sie die Wohnung bis zum Ruhestand weiter entschulden.",
                "With special repayments or a higher repayment rate you can pay down more of the flat before you retire.",
              ),
            },
            {
              titel: tx("Früh beginnen", "Start early"),
              text: tx(
                "Je mehr Jahre bis zum Ruhestand bleiben, desto mehr trägt die Tilgung. Siehe Preis des Wartens in Kapitel 8.",
                "The more years you have until retirement, the more the repayment contributes. See the price of waiting in chapter 8.",
              ),
            },
          ],
        },
      ],
    };
  }
  // „Erst einmal verstehen“: die wichtigsten Begriffe.
  const begriffe: Array<[string, string]> = [
    [
      tx("Abschreibung (AfA)", "Depreciation (AfA)"),
      tx(
        "Der Wertverlust des Gebäudes, den Sie jedes Jahr als Kosten ansetzen, ohne dass Geld fließt. Bei Baujahren von 1925 bis 2022 meist 2 % im Jahr.",
        "The loss in value of the building, which you claim as a cost every year without any money changing hands. Usually 2% a year for buildings from 1925 to 2022.",
      ),
    ],
    [
      tx("Annuität", "Annuity"),
      tx(
        "Die gleichbleibende Rate aus Zins und Tilgung. Mit der Zeit wird der Zinsanteil kleiner und der Tilgungsanteil größer.",
        "The constant instalment of interest and repayment. Over time the interest share gets smaller and the repayment share larger.",
      ),
    ],
    [
      tx("Bruttomietrendite", "Gross rental yield"),
      tx(
        "Jahreskaltmiete geteilt durch Kaufpreis. Eine erste Orientierung, aber ohne Kosten gerechnet.",
        "Annual net cold rent divided by the purchase price. A first indication, but calculated without costs.",
      ),
    ],
    [tx("Eigenkapital", "Equity"), tx("Ihr eigenes Geld im Kauf. Meist deckt es die Kaufnebenkosten.", "Your own money in the purchase. It usually covers the incidental purchase costs.")],
    [
      tx("Grenzsteuersatz", "Marginal tax rate"),
      tx(
        "Der Steuersatz auf jeden zusätzlichen Euro Einkommen. Er bestimmt, wie stark ein Verlust aus Vermietung Ihre Steuer senkt.",
        "The tax rate on every additional euro of income. It determines how much a letting loss reduces your tax.",
      ),
    ],
    [
      tx("Hausgeld", "Service charge (Hausgeld)"),
      tx(
        "Die monatliche Zahlung an die Eigentümergemeinschaft. Ein Teil davon lässt sich auf den Mieter umlegen.",
        "The monthly payment to the owners' association. Part of it can be passed on to the tenant.",
      ),
    ],
    [
      tx("Instandhaltungsrücklage", "Maintenance reserve"),
      tx("Das gemeinsame Sparkonto der Eigentümer für Reparaturen am Gebäude.", "The owners' joint savings account for repairs to the building."),
    ],
    [
      tx("Kaufnebenkosten", "Incidental purchase costs"),
      tx("Grunderwerbsteuer, Notar und Grundbuch. In Bayern rund 5 % des Kaufpreises.", "Real estate transfer tax, notary and land register. In Bavaria about 5% of the purchase price."),
    ],
    [tx("Restschuld", "Remaining debt"), tx("Der Teil des Darlehens, der noch offen ist.", "The part of the loan still outstanding.")],
    [
      tx("Sondertilgung", "Special repayment"),
      tx(
        "Eine zusätzliche Zahlung auf das Darlehen, meist einmal im Jahr bis zu einem vereinbarten Betrag.",
        "An additional payment on the loan, usually once a year up to an agreed amount.",
      ),
    ],
    [tx("Tilgung", "Repayment"), tx("Der Teil der Rate, der die Schuld verringert. Er ist Ihr Vermögensaufbau.", "The part of the instalment that reduces the debt. It is how you build wealth.")],
    [
      tx("Werbungskosten", "Deductible expenses"),
      tx(
        "Kosten, die Sie von den Mieteinnahmen abziehen dürfen, etwa Zinsen und nicht umlagefähige Kosten.",
        "Costs you may deduct from your rental income, such as interest and non-recoverable costs.",
      ),
    ],
    [
      tx("Zinsbindung", "Fixed-interest period"),
      tx("Der Zeitraum, für den der Zins fest vereinbart ist. Danach wird neu verhandelt.", "The period for which the interest rate is fixed. After that it is renegotiated."),
    ],
  ];
  return {
    titel: tx("Die wichtigsten Begriffe", "The key terms"),
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Sie möchten erst einmal verstehen, wie es geht. Hier stehen die Begriffe, die Ihnen in diesem Handbuch und im Gespräch mit Bank und Berater am häufigsten begegnen.",
          "You would like to understand how it works first. Here are the terms you will come across most often in this handbook and in conversations with the bank and your contact.",
        ),
      },
      {
        typ: "tabelle",
        kopf: [tx("Begriff", "Term"), tx("Was er bedeutet", "What it means")],
        zeilen: begriffe.map(([b, e]) => ({ zellen: [b, e] })),
      },
    ],
  };
}

/** Das Handbuch zu den Antworten, fertig zum Zeichnen. In der Sprache aus `angaben.sprache`. */
export function baueHandbuch(ang: HandbuchAngaben): Handbuch {
  const sprache: Sprache = ang.sprache === "en" ? "en" : "de";
  return inSprache(sprache, () => baue(ang, sprache));
}

function baue(ang: HandbuchAngaben, sprache: Sprache): Handbuch {
  const A = ang.antworten;
  const a = handbuchAuswertung(A);
  const r = a.rahmen;
  const j1 = a.jahr1;
  const e = a.ergebnis;
  const gs = a.grenzsatz;
  const kp = a.kaufpreis;
  const w = a.wohnung;
  const gem = a.gemeinsam;
  const name = `${ang.vorname} ${ang.nachname}`.trim();
  const ausgang = ermittleAusgang(A);
  const seiten: HandbuchSeite[] = [];
  const bruttoText = antwort("brutto", A.brutto);

  // Inhalt und Angaben
  seiten.push({
    id: "inhalt",
    kapitel: tx("Inhalt", "Contents"),
    titel: tx("Was Sie erwartet", "What to expect"),
    personalisiert: "alle sechs Antworten und daraus gerechnete Werte",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          `Dieses Handbuch ist für Sie erstellt, auf Grundlage Ihrer sechs Antworten. Die Kapitel mit Ihren eigenen Zahlen sind ${PERSOENLICHE_KAPITEL}.`,
          "This handbook has been prepared for you, based on your six answers. The chapters with your own figures are 5, 6, 7, 9, 11 and 12.",
        ),
      },
      { typ: "inhalt", eintraege: inhaltListe() },
      {
        typ: "angaben",
        titel: tx("Ihre Angaben auf einen Blick", "Your details at a glance"),
        paare: [
          [tx("Ziel", "Goal"), antwort("ziel", A.ziel)],
          [tx("Beruf", "Occupation"), antwort("beruf", A.beruf)],
          [tx("Jahresbrutto", "Gross annual income"), bruttoText + (gem ? tx(", gemeinsam veranlagt", ", assessed jointly") : "")],
          [tx("Überschuss im Monat", "Monthly surplus"), antwort("ueberschuss", A.ueberschuss)],
          [tx("Eigenkapital", "Equity"), antwort("eigenkapital", A.eigenkapital)],
          [tx("Start", "Start"), antwort("start", A.start)],
          [tx("Modell-Grenzsteuersatz", "Model marginal tax rate"), rund(gs) + (gem ? tx(" (Splittingtarif)", " (joint assessment)") : "")],
          [tx("Rahmen (Modell)", "Budget (model)"), tx(`${eur(r.von)} bis ${eur(r.bis)} €`, `${betrag(r.von)} to ${betrag(r.bis)}`)],
        ],
        hinweis: tx(
          "Gerechnet wird vorsichtig mit der Untergrenze Ihrer Antworten. Nach der Selbstauskunft rechnen wir mit Ihren genauen Zahlen.",
          "We calculate cautiously with the lower limit of your answers. After the self-disclosure we use your exact figures.",
        ),
      },
    ],
  });

  // Kapitel 1
  seiten.push({
    id: "kapitel-1",
    kapitel: kapitel(1),
    titel: tx("Warum die Wohnung zum Schluss kommt", "Why the flat comes last"),
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Die meisten beginnen mit einem Exposé. Sie besichtigen, rechnen, verlieben sich in eine Wohnung und gehen dann zur Bank. Wenn es dort hakt, war die ganze Mühe umsonst.",
          "Most people start with a property listing. They view it, do the maths, fall in love with a flat and only then go to the bank. If it falls through there, all the effort was wasted.",
        ),
      },
      {
        typ: "absatz",
        text: tx(
          "Wir drehen die Reihenfolge um. Erst klären wir, was die Wohnung für Sie leisten soll und was Ihr Steuersatz beiträgt. Dann rechnen wir, was eine Bank Ihnen voraussichtlich zutraut. Erst danach schauen wir auf konkrete Wohnungen, und zwar nur auf solche, die zu beidem passen.",
          "We reverse the order. First we clarify what the flat should do for you and what your tax rate contributes. Then we calculate what a bank is likely to lend you. Only after that do we look at specific flats, and only at those that fit both.",
        ),
      },
      {
        typ: "weg",
        schritte: [
          { titel: tx("Sie", "You"), text: tx("Ihre Ziele und was die Steuer beiträgt. Kapitel 3, 6 bis 9.", "Your goals and what tax contributes. Chapters 3 and 6 to 9.") },
          { titel: tx("Die Bank", "The bank"), text: tx("Ihr Rahmen aus Überschuss und Eigenkapital. Kapitel 4 und 5.", "Your budget from surplus and equity. Chapters 4 and 5.") },
          { titel: tx("Das Objekt", "The property"), text: tx("Passende, geprüfte Wohnungen. Kapitel 2, 10 und 11.", "Suitable, vetted flats. Chapters 2, 10 and 11.") },
        ],
      },
      { typ: "h2", text: tx("Die Steuer ist der Rabatt, nicht das Produkt", "Tax is the discount, not the product") },
      {
        typ: "absatz",
        text: tx(
          "Eine vermietete Wohnung lohnt sich nicht, weil sie Steuern spart. Sie lohnt sich, wenn sie gut vermietet ist, in einer Lage steht, die auch in zwanzig Jahren gefragt ist, und wenn die Finanzierung zu Ihrem Leben passt. Die Steuer macht den Weg leichter; wie viel sie beiträgt, zeigt Kapitel 6 mit Ihrem Steuersatz.",
          "A rented flat is not worthwhile because it saves tax. It is worthwhile when it is well let, in a location that will still be in demand in twenty years, and when the financing fits your life. Tax makes the path easier; chapter 6 shows how much it contributes at your tax rate.",
        ),
      },
      { typ: "h2", text: tx("Drei, die mitbezahlen", "Three who help pay") },
      {
        typ: "karten",
        spalten: 3,
        karten: [
          { symbol: "bank", titel: tx("Die Bank", "The bank"), text: tx("finanziert in der Regel den Kaufpreis. Die Nebenkosten bringen Sie selbst mit.", "usually finances the purchase price. You bring the purchase costs yourself.") },
          { symbol: "person", titel: tx("Der Mieter", "The tenant"), text: tx("zahlt jeden Monat die Miete. Sie trägt den größten Teil der Rate.", "pays rent every month. It covers the largest part of the instalment.") },
          { symbol: "prozent", titel: tx("Das Finanzamt", "The tax office"), text: tx("erstattet über Abschreibung und Zinsen einen Teil Ihres Aufwands.", "refunds part of your costs through depreciation and interest.") },
        ],
      },
      {
        typ: "vergleich",
        links: {
          titel: tx("Der übliche Weg", "The usual way"),
          punkte: [
            tx("Exposé im Portal gefunden", "Found a listing online"),
            tx("Besichtigt und verliebt", "Viewed it and fell in love"),
            tx("Termin bei der Bank", "Appointment at the bank"),
            tx("Rahmen passt nicht, alles von vorn", "Budget does not fit, back to square one"),
          ],
        },
        rechts: {
          titel: tx("Unser Weg", "Our way"),
          punkte: [
            tx("Ziele und Steuersatz geklärt", "Goals and tax rate clarified"),
            tx("Rahmen berechnet", "Budget calculated"),
            tx("Nur passende, geprüfte Wohnungen", "Only suitable, vetted flats"),
            tx("Bank kennt die Wohnung schon", "The bank already knows the flat"),
          ],
        },
      },
      {
        typ: "kasten",
        ton: "dich",
        titel: tx("So lesen Sie dieses Handbuch", "How to read this handbook"),
        text: tx(
          "Jedes Kapitel endet mit dem, was es für Sie bedeutet. Alle Zahlen sind Modellrechnungen mit offengelegten Annahmen, gerechnet wie in unserem Investmentrechner. Sie sind keine Zusage. Die verbindliche Rechnung machen wir, wenn Sie eine konkrete Wohnung vor sich haben.",
          "Every chapter ends with what it means for you. All figures are model calculations with disclosed assumptions, calculated as in our investment calculator. They are not a commitment. We do the binding calculation once you have a specific flat in front of you.",
        ),
      },
    ],
  });

  // Kapitel 2
  seiten.push({
    id: "kapitel-2",
    kapitel: kapitel(2),
    titel: tx("So arbeitet OS Immobilien", "How OS Immobilien works"),
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Wir sind Kapitalanlagevermittler, kein Makler. Unser Grundsatz: Nicht das Produkt steht zuerst, sondern Sie. Erst Ihre Ziele, dann die passende Immobilie.",
          "We are an investment property intermediary, not an estate agent. Our principle: you come first, not the product. Your goals first, then the right property.",
        ),
      },
      {
        typ: "prozess",
        schritte: [
          { symbol: "person", titel: tx("Erstgespräch", "First meeting"), text: tx("Ziele, Lage, Fragen", "Goals, situation, questions") },
          { symbol: "diagramm", titel: tx("Beratung", "Consultation"), text: tx("Konzepte und Rechnung", "Concepts and calculation") },
          { symbol: "stift", titel: tx("Selbstauskunft", "Self-disclosure"), text: tx("Ihr genauer Rahmen", "Your exact budget") },
          { symbol: "haus", titel: tx("Objektvorstellung", "Property presentation"), text: tx("Nur passende Wohnungen", "Only suitable flats") },
          { symbol: "bank", titel: tx("Finanzierung", "Financing"), text: tx("Reservierung und Bank", "Reservation and bank") },
          { symbol: "schluessel", titel: tx("Notar und danach", "Notary and after"), text: tx("Übergabe und Betreuung", "Handover and support") },
        ],
      },
      {
        typ: "absatz",
        text: tx(
          "Sie haben einen festen Immobilienberater. Er begleitet Sie vom ersten Gespräch bis zum Notar und darüber hinaus. Die Selbstauskunft verpflichtet Sie zu nichts; sie macht nur aus einer Schätzung eine belastbare Rechnung.",
          "You have one fixed contact person at OS Immobilien. They accompany you from the first conversation to the notary and beyond. The self-disclosure does not commit you to anything; it simply turns an estimate into a reliable calculation.",
        ),
      },
      { typ: "h2", text: tx("Drei Konzepte", "Three concepts") },
      {
        typ: "karten",
        spalten: 3,
        karten: [
          {
            symbol: "haus",
            titel: tx("Sanierter Bestand", "Renovated existing buildings"),
            text: tx(
              "Gewachsene Lagen, bereits vermietet. Wir prüfen Rücklage, Beschlüsse der Eigentümer und anstehende Maßnahmen.",
              "Established locations, already let. We check the reserve, the owners' resolutions and upcoming works.",
            ),
          },
          {
            symbol: "blitz",
            titel: tx("Neubau KfW 40 QNG", "New build KfW 40 QNG"),
            text: tx(
              "Energieeffizient gebaut. Eigene Abschreibungsregeln, oft geringerer Instandhaltungsbedarf in den ersten Jahren.",
              "Built to be energy efficient. Separate depreciation rules, often lower maintenance needs in the first years.",
            ),
          },
          {
            symbol: "person",
            titel: tx("WG und Co-Living", "Shared flats and co-living"),
            text: tx("Zimmerweise vermietet. Höhere Miete je Quadratmeter, dafür mehr Verwaltung.", "Let room by room. Higher rent per square metre, but more management."),
          },
        ],
      },
      { typ: "h2", text: tx("Wo unsere Wohnungen liegen", "Where our flats are") },
      {
        typ: "absatz",
        text: tx(
          "Unser Schwerpunkt ist Bayern. Dazu kommen ausgewählte Wohnungen in ganz Deutschland, wenn Lage und Rechnung stimmen.",
          "Our focus is Bavaria. We add selected flats across Germany when the location and the numbers are right.",
        ),
      },
      { typ: "h2", text: tx("Was Sie OS Immobilien kostet", "What OS Immobilien costs you") },
      {
        typ: "absatz",
        text: tx(
          "Wir vermitteln im Auftrag des Verkäufers. Für Sie fällt keine Maklerprovision an, sofern im Exposé nichts anderes ausgewiesen ist.",
          "We act on behalf of the seller. You pay no agent's commission unless the property listing states otherwise.",
        ),
      },
      {
        typ: "kasten",
        ton: "gut",
        titel: tx("Ihr Kundenportal", "Your customer portal"),
        text: tx(
          "Nach dem Start bekommen Sie Zugang zu Ihrem Kundenportal: Übersicht, Ihr Ordner mit allen Unterlagen, Ihre Investments, ein Steuerbereich, Empfehlungen und ein Chat mit Ihrem Berater.",
          "Once you get started, you receive access to your customer portal: an overview, your folder with all documents, your investments, a tax section, referrals and a chat with your contact.",
        ),
      },
    ],
  });

  seiten.push({
    id: "kapitel-2b",
    kapitel: kapitel(2),
    titel: tx("Wie wir Wohnungen auswählen und finanzieren", "How we select and finance flats"),
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Wir zeigen Ihnen weniger Wohnungen, als wir haben. Jede Wohnung läuft durch fünf Filter, vom einfachen zum aufwendigen.",
          "We show you fewer flats than we have. Every flat passes through five filters, from simple to thorough.",
        ),
      },
      {
        typ: "trichter",
        stufen: [
          { titel: tx("Hartfilter", "Basic filter"), text: tx("Preis, Lage und Art passen grundsätzlich zu Ihnen.", "Price, location and type fit you in principle.") },
          { titel: tx("Standort", "Location"), text: tx("Die Mikrolage zählt mehr als die Stadt. Die Miete muss zum Mietspiegel passen.", "The immediate neighbourhood counts more than the city. The rent has to match the local rent index.") },
          {
            titel: tx("Objekt und Gemeinschaft", "Building and owners"),
            text: tx("Beschlüsse der Eigentümer, Rücklage, Heizung und Gebäudeenergiegesetz.", "Owners' resolutions, reserve, heating and the Building Energy Act."),
          },
          { titel: tx("Rechnung", "Calculation"), text: tx("Netto statt brutto: nach allen Kosten, nicht nur Miete durch Kaufpreis.", "Net rather than gross: after all costs, not just rent divided by price.") },
          { titel: tx("Verfügbarkeit", "Availability"), text: tx("Am Tag Ihres Termins noch frei und für Sie vorgemerkt.", "Still available on the day of your appointment and held for you.") },
        ],
      },
      {
        typ: "absatz",
        text: tx(
          "Typische Gründe, warum eine Wohnung bei uns herausfällt: Die Miete ist zu optimistisch angesetzt. Vor einer anstehenden Maßnahme ist zu wenig Rücklage da. Oder der Quadratmeterpreis passt nicht zu dem, was sich später beim Wiederverkauf erzielen lässt.",
          "Typical reasons why a flat drops out: the rent is set too optimistically, there is too little reserve ahead of upcoming works, or the price per square metre does not match what a later resale could achieve.",
        ),
      },
      { typ: "h2", text: tx("Drei Wege zur Finanzierung", "Three routes to financing") },
      {
        typ: "karten",
        spalten: 3,
        karten: [
          { symbol: "person", titel: tx("Ihr eigener Berater", "Your own adviser"), text: tx("Wenn Sie schon jemanden haben, arbeiten wir gern mit ihm zusammen.", "If you already have someone, we are happy to work with them.") },
          { symbol: "bank", titel: tx("Ihre Hausbank", "Your own bank"), text: tx("Sie können jederzeit bei Ihrer Bank anfragen, auch parallel.", "You can ask your bank at any time, in parallel too.") },
          {
            symbol: "schild",
            titel: tx("Unser Finanzierungspartner", "Our financing partner"),
            text: tx("Er kennt unsere Wohnungen schon und hat die Unterlagen vorliegen.", "They already know our flats and have the documents."),
          },
        ],
      },
      { typ: "h2", text: tx("Warum der Finanzierungspartner oft schneller ist", "Why the financing partner is often faster") },
      {
        typ: "liste",
        punkte: [
          tx("Die Objekte sind dort bereits eingewertet.", "The properties have already been valued there."),
          tx("Die Objektunterlagen liegen schon vor, Rückfragen entfallen.", "The property documents are already available, so there are no follow-up questions."),
          tx("Sie haben einen Ansprechpartner für alle Fragen zur Bank.", "You have one contact for all questions about the bank."),
        ],
      },
      {
        typ: "absatz",
        text: tx(
          "Das sind Tatsachen über den Ablauf, kein Versprechen über den Zins. Welcher Weg für Sie der beste ist, entscheiden Sie. Zeiten nennen wir Ihnen immer als Spanne, nie als festen Termin.",
          "These are facts about the process, not a promise about the interest rate. You decide which route is best for you. We always give you timings as a range, never as a fixed date.",
        ),
      },
      {
        typ: "kasten",
        ton: "dich",
        titel: tx("Das heißt für Sie", "What this means for you"),
        text: tx(
          "Sie sehen nur Wohnungen, die unsere Prüfung bestanden haben und zu Ihrem Rahmen passen. Und Sie sind bei der Bank frei.",
          "You only see flats that have passed our checks and fit your budget. And you are free to choose your bank.",
        ),
      },
    ],
  });

  // Kapitel 3
  const k = kaufkraftVerlauf();
  seiten.push({
    id: "kapitel-3",
    kapitel: kapitel(3),
    titel: tx("Geld, das still an Wert verliert", "Money that quietly loses value"),
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "50.000 € auf dem Tagesgeld sehen nach zehn Jahren größer aus. Kaufen können Sie sich davon trotzdem weniger.",
          "€50,000 in a savings account looks bigger after ten years. But you can still buy less with it.",
        ),
      },
      {
        typ: "grafik",
        titel: tx("Kontostand und Kaufkraft von 50.000 € über zehn Jahre", "Balance and purchasing power of €50,000 over ten years"),
        untertitel: tx("2 % Zins im Jahr, 2,5 % Inflation im Jahr, ohne Steuer auf Zinsen", "2% interest a year, 2.5% inflation a year, before tax on interest"),
        zeichnung: diagrammKaufkraft(),
      },
      {
        typ: "absatz",
        text: tx(
          `Nach zehn Jahren stehen im Modell rund ${betrag(k.konto[10])} auf dem Konto. In heutigem Geld sind das rund ${betrag(k.kaufkraft[10])}, also etwa ${betrag(50000 - k.kaufkraft[10])} weniger Kaufkraft als am Anfang. Das ist allein noch kein Argument für eine Immobilie. Es zeigt nur, dass Nichtstun auch eine Entscheidung ist, die etwas kostet.`,
          `After ten years, the model shows about ${betrag(k.konto[10])} in the account. In today's money that is about ${betrag(k.kaufkraft[10])}, so about ${betrag(50000 - k.kaufkraft[10])} less purchasing power than at the start. On its own that is no argument for property. It simply shows that doing nothing is also a decision, and it has a cost.`,
        ),
      },
      { typ: "h2", text: tx("Was eine vermietete Wohnung anders macht", "What a rented flat does differently") },
      {
        typ: "karten",
        spalten: 2,
        karten: [
          {
            titel: tx("Sachwert", "Real asset"),
            text: tx(
              "Die Wohnung ist ein realer Gegenstand. Mieten und Preise haben sich in der Vergangenheit mit der Inflation bewegt, eine Garantie dafür gibt es nicht.",
              "The flat is a real asset. In the past, rents and prices have moved with inflation, but there is no guarantee of that.",
            ),
          },
          {
            titel: tx("Fremdes Geld", "Borrowed money"),
            text: tx(
              "Für ein Aktiendepot leiht Ihnen keine Bank mehrere hunderttausend Euro, für eine vermietete Wohnung schon.",
              "No bank will lend you several hundred thousand euros for a share portfolio, but it will for a rented flat.",
            ),
          },
          {
            titel: tx("Tilgung", "Repayment"),
            text: tx("Mit jeder Rate gehört Ihnen ein größerer Teil der Wohnung. Diese Tilgung ist Vermögensaufbau.", "With every instalment you own a bigger share of the flat. This repayment builds your wealth."),
          },
          {
            titel: tx("Hebel in beide Richtungen", "Leverage works both ways"),
            text: tx(
              "Der Hebel trägt, solange die Wohnung mehr erwirtschaftet, als der Kredit kostet. Er wirkt auch umgekehrt.",
              "Leverage works as long as the flat earns more than the loan costs. It also works the other way round.",
            ),
          },
        ],
      },
      {
        typ: "kasten",
        ton: "acht",
        titel: tx("Ehrlich gesagt", "To be honest"),
        text: tx(
          "Eine Wohnung ist nicht schnell verfügbar. Wer das Geld in den nächsten Jahren braucht, sollte es nicht in eine Wohnung stecken. Eine Immobilie ergänzt Tagesgeld und Wertpapiere, sie ersetzt sie nicht.",
          "A flat is not quickly available as cash. If you need the money in the next few years, do not put it into a flat. Property complements savings and securities, it does not replace them.",
        ),
      },
    ],
  });

  // Kapitel 4
  seiten.push({
    id: "kapitel-4",
    kapitel: kapitel(4),
    titel: tx("Wie eine Bank entscheidet", "How a bank decides"),
    personalisiert: "Beruf",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Eine Bank prüft vier Dinge. Wer sie kennt, weiß vorher, wo er steht, und erlebt beim Termin keine Überraschung.",
          "A bank checks four things. If you know them, you know where you stand beforehand and there are no surprises at the appointment.",
        ),
      },
      {
        typ: "karten",
        spalten: 2,
        karten: [
          {
            symbol: "person",
            titel: tx("1 Bonität", "1 Creditworthiness"),
            text: tx(
              "Zahlen Sie zuverlässig? Die Bank holt eine Schufa-Auskunft ein, aber erst, wenn Sie zustimmen.",
              "Do you pay reliably? The bank requests a Schufa credit report, but only once you agree.",
            ),
          },
          {
            symbol: "euro",
            titel: tx("2 Haushaltsrechnung", "2 Household calculation"),
            text: tx("Was bleibt nach allen Ausgaben übrig, und reicht das für die neue Rate?", "What is left after all expenses, and is it enough for the new instalment?"),
          },
          {
            symbol: "schluessel",
            titel: tx("3 Eigenkapital", "3 Equity"),
            text: tx("Die Nebenkosten des Kaufs kommen in der Regel aus eigenen Mitteln.", "The purchase costs are usually paid from your own funds."),
          },
          {
            symbol: "haus",
            titel: tx("4 Die Wohnung", "4 The flat"),
            text: tx("Die Bank bewertet die Wohnung selbst. Lage, Zustand und Miete zählen.", "The bank values the flat itself. Location, condition and rent count."),
          },
        ],
      },
      {
        typ: "grafik",
        titel: tx("Die Haushaltsrechnung als Schema", "The household calculation as a diagram"),
        untertitel: tx("Beispielhaushalt, Werte je Monat", "Example household, monthly figures"),
        zeichnung: diagrammHaushalt(),
      },
      {
        typ: "fussnote",
        text: tx(
          "Beispielwerte. Viele Banken setzen Lebenshaltung pauschal an und rechnen rund 75 % der künftigen Kaltmiete als Einnahme. Jede Bank hat eigene Pauschalen.",
          "Example figures. Many banks use a flat rate for living costs and count about 75% of the future net cold rent as income. Each bank has its own flat rates.",
        ),
      },
      {
        typ: "absatz",
        text: tx(
          "Wichtig ist die Zahl ganz rechts: Das ist der Betrag, der für die neue Rate zur Verfügung steht. Nicht Ihr Gehalt entscheidet, sondern was nach allem übrig bleibt.",
          "The figure on the far right is what matters: it is the amount available for the new instalment. It is not your salary that decides, but what is left after everything else.",
        ),
      },
      {
        typ: "kasten",
        ton: "dich",
        titel: tx(`Das heißt für Sie als ${antwort("beruf", A.beruf)}`, `What this means for you: ${antwort("beruf", A.beruf)}`),
        text: beruftHinweis(A),
      },
    ],
  });

  // Kapitel 5
  const knkRahmen = r.empf * 0.05;
  const ekKasten: Block =
    r.eigenkapital >= knkRahmen && r.eigenkapital > 0
      ? {
          typ: "kasten",
          ton: "ok",
          titel: tx("Eigenkapital", "Equity"),
          text: tx(
            `Mit ${betrag(r.eigenkapital)} deckt Ihr Eigenkapital die Kaufnebenkosten einer Wohnung in Ihrem Rahmen. In Bayern sind das bei ${betrag(r.empf)} rund ${betrag(knkRahmen)} (5,0 %). In anderen Bundesländern liegen die Nebenkosten höher, siehe Kapitel 10.`,
            `At ${betrag(r.eigenkapital)}, your equity covers the incidental purchase costs of a flat within your budget. In Bavaria, at ${betrag(r.empf)}, these are about ${betrag(knkRahmen)} (5.0%). In other federal states the costs are higher, see chapter 10.`,
          ),
        }
      : {
          typ: "kasten",
          ton: "acht",
          titel: tx("Eigenkapital", "Equity"),
          text:
            r.eigenkapital > 0
              ? tx(
                  `Mit ${betrag(r.eigenkapital)} Eigenkapital wird es für die Nebenkosten knapp. Für eine Wohnung um ${betrag(r.empf)} liegen sie in Bayern bei rund ${betrag(knkRahmen)}, in anderen Bundesländern bis rund ${betrag(r.empf * 0.08)}. Wie Sie den fehlenden Betrag aufbauen, bespricht Ihr Berater mit Ihnen.`,
                  `With ${betrag(r.eigenkapital)} of equity, the purchase costs will be tight. For a flat around ${betrag(r.empf)}, they are about ${betrag(knkRahmen)} in Bavaria and up to about ${betrag(r.empf * 0.08)} in other federal states. Your contact will discuss with you how to build up the missing amount.`,
                )
              : tx(
                  `Bei Eigenkapital unter 10.000 € rechnen wir vorsichtig mit 0 €. Für eine Wohnung um ${betrag(r.empf)} liegen die Nebenkosten in Bayern bei rund ${betrag(knkRahmen)}, in anderen Bundesländern bis rund ${betrag(r.empf * 0.08)}. Schon ein Betrag in dieser Höhe würde reichen. Wie Sie ihn aufbauen, bespricht Ihr Berater mit Ihnen.`,
                  `With equity under €10,000 we calculate cautiously with €0. For a flat around ${betrag(r.empf)}, the purchase costs are about ${betrag(knkRahmen)} in Bavaria and up to about ${betrag(r.empf * 0.08)} in other federal states. An amount of that size would already be enough. Your contact will discuss with you how to build it up.`,
                ),
        };
  const ausgangKasten: Block[] =
    ausgang === "noch_nicht"
      ? [
          {
            typ: "kasten",
            ton: "acht",
            titel: tx("Ehrlich gesagt", "To be honest"),
            text: tx(
              "Mit Ihren heutigen Angaben passt eine vermietete Wohnung noch nicht. Das ist kein Nein für immer. Wenn Überschuss und Eigenkapital wachsen, rechnet dieselbe Formel neu, und dieses Kapitel zeigt Ihnen, an welchen Stellschrauben es liegt.",
              "Based on your details today, a rented flat is not a fit yet. That is not a no forever. When your surplus and equity grow, the same formula recalculates, and this chapter shows you which levers matter.",
            ),
          },
        ]
      : [];
  seiten.push({
    id: "kapitel-5",
    kapitel: kapitel(5),
    titel: tx("Ihr Rahmen", "Your budget"),
    personalisiert: "Überschuss und Eigenkapital",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Aus Ihrem monatlichen Überschuss und Ihrem Eigenkapital ergibt sich, in welcher Preisspanne eine Wohnung für Sie realistisch ist.",
          "Your monthly surplus and your equity determine the price range in which a flat is realistic for you.",
        ),
      },
      {
        typ: "tabelle",
        titel: tx("Ihr Rahmen als Modellrechnung", "Your budget as a model calculation"),
        rechtsAb: 1,
        zeilen: [
          { zellen: [tx("Überschuss im Monat (vorsichtig: Untergrenze Ihrer Antwort)", "Monthly surplus (cautious: lower limit of your answer)"), betrag(r.ueberschuss)] },
          { zellen: [tx("davon für die Rate eingeplant (80 %, der Rest ist Puffer)", "of which planned for the instalment (80%, the rest is a buffer)"), betrag(r.tragbareRate)] },
          { zellen: [tx("daraus mögliches Darlehen (Rate von 6 % im Jahr für Zins und Tilgung)", "resulting possible loan (instalment of 6% a year for interest and repayment)"), betrag(r.maxDarlehen)] },
          { zellen: [tx("plus Ihr Eigenkapital (Untergrenze Ihrer Antwort)", "plus your equity (lower limit of your answer)"), betrag(r.eigenkapital)] },
          { zellen: [tx("Empfohlener Rahmen", "Recommended budget"), betrag(r.empf)], summe: true },
        ],
      },
      { typ: "grafik", zeichnung: rahmenSpanne(r, 660, 120) },
      {
        typ: "fussnote",
        text: tx(
          `Spanne ${eur(r.von)} bis ${eur(r.bis)} €: 80 bis 120 % des Darlehens plus Eigenkapital. Dieselbe Formel nutzen wir nach Ihrer Selbstauskunft, dann mit Ihren genauen Zahlen.`,
          `Range ${betrag(r.von)} to ${betrag(r.bis)}: 80 to 120% of the loan plus equity. We use the same formula after your self-disclosure, then with your exact figures.`,
        ),
      },
      ekKasten,
      ...ausgangKasten,
      { typ: "h2", text: tx("Warum wir so vorsichtig rechnen", "Why we calculate so cautiously") },
      {
        typ: "absatz",
        text: tx(
          "Wir planen nur 80 % Ihres Überschusses für die Rate ein, damit Luft für Unvorhergesehenes bleibt. Und wir rechnen mit einer Rate von 6 % im Jahr, obwohl Zins und Tilgung heute oft darunter liegen. Die Miete der neuen Wohnung lassen wir in dieser Rechnung ganz weg. In Wirklichkeit trägt sie einen großen Teil der Rate, siehe Kapitel 7. Der Rahmen ist deshalb eher vorsichtig.",
          "We only plan 80% of your surplus for the instalment, so there is room for the unexpected. And we calculate with an instalment of 6% a year, even though interest and repayment are often lower today. We leave the rent of the new flat out of this calculation entirely. In reality it covers a large part of the instalment, see chapter 7. So the budget is on the cautious side.",
        ),
      },
      {
        typ: "fussnote",
        text: tx(
          "Keine Finanzierungszusage. Eine Zusage gibt nur eine Bank nach Prüfung von Ihnen und der Wohnung.",
          "Not a financing commitment. Only a bank can give a commitment after assessing you and the flat.",
        ),
      },
    ],
  });

  // Kapitel 6
  const steuerDich = gem
    ? tx(
        `Sie werden gemeinsam veranlagt. Deshalb behandeln wir Ihr Jahresbrutto von ${bruttoText} als Ihr gemeinsames Einkommen und rechnen mit dem Splittingtarif. Ihr gemeinsamer Grenzsteuersatz liegt im Modell bei rund ${gs} %. Von jedem Euro Verlust aus der Vermietung trägt das Finanzamt also rund ${gs} Cent, dazu kommt der Solidaritätszuschlag, wo er anfällt.`,
        `You are assessed jointly. So we treat your gross annual income of ${bruttoText} as your joint income as a couple and calculate with the splitting tariff. In the model, your joint marginal tax rate is about ${gs}%. So the tax office bears about ${gs} cents of every euro of letting loss, plus the solidarity surcharge where it applies.`,
      )
    : tx(
        `Mit Ihrem Jahresbrutto von ${bruttoText} liegt Ihr Grenzsteuersatz im Modell bei rund ${gs} %. Von jedem Euro Verlust aus der Vermietung trägt das Finanzamt also rund ${gs} Cent, dazu kommt der Solidaritätszuschlag, wo er anfällt.`,
        `With your gross annual income of ${bruttoText}, your marginal tax rate in the model is about ${gs}%. So the tax office bears about ${gs} cents of every euro of letting loss, plus the solidarity surcharge where it applies.`,
      );
  seiten.push({
    id: "kapitel-6",
    kapitel: kapitel(6),
    titel: tx("Was das Finanzamt mitträgt", "What the tax office contributes"),
    personalisiert: "Jahresbrutto",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Mieteinnahmen müssen Sie versteuern. Aber viele Kosten der Wohnung dürfen Sie davon abziehen. Bleibt unter dem Strich ein Minus, sinkt Ihre Steuer auf das übrige Einkommen.",
          "You have to pay tax on rental income. But you may deduct many of the flat's costs from it. If the bottom line is a loss, your tax on your other income goes down.",
        ),
      },
      {
        typ: "karten",
        spalten: 3,
        karten: [
          {
            symbol: "haus",
            titel: tx("Abschreibung (AfA)", "Depreciation (AfA)"),
            text: tx(
              "Das Gebäude nutzt sich ab. Sie setzen jedes Jahr einen festen Anteil als Kosten an, ohne dass Geld fließt.",
              "The building wears out. Every year you claim a fixed share as a cost without any money changing hands.",
            ),
          },
          {
            symbol: "prozent",
            titel: tx("Zinsen", "Interest"),
            text: tx("Die Zinsen des Darlehens sind Werbungskosten. Die Tilgung ist es nicht, sie ist Ihr Vermögen.", "The loan interest is a deductible expense. The repayment is not, it is your wealth."),
          },
          {
            symbol: "dokument",
            titel: tx("Laufende Kosten", "Running costs"),
            text: tx(
              "Nicht umlagefähiges Hausgeld, Verwaltung und im ersten Jahr die Finanzierungsnebenkosten.",
              "Non-recoverable service charge, management and, in the first year, the financing costs.",
            ),
          },
        ],
      },
      { typ: "h2", text: tx("Wie die Abschreibung entsteht", "How depreciation works") },
      {
        typ: "grafik",
        titel: tx("Modellwohnung: Kaufpreis plus Nebenkosten, aufgeteilt", "Model flat: purchase price plus costs, split up"),
        untertitel: tx("Gebäudeanteil 80 %, Nebenkosten anteilig, AfA 2 % im Jahr", "Building share 80%, costs pro rata, depreciation 2% a year"),
        zeichnung: diagrammAfa(kp),
      },
      {
        typ: "absatz",
        text: tx(
          "Nur das Gebäude wird abgeschrieben, nicht der Grund und Boden. Wie hoch der Satz ist, hängt vom Baujahr ab: 2,5 % vor 1925, 2 % von 1925 bis 2022 und 3 % ab 2023. Für neue Wohnungen gibt es unter Bedingungen höhere Sätze in den ersten Jahren.",
          "Only the building is depreciated, not the land. The rate depends on the year of construction: 2.5% before 1925, 2% from 1925 to 2022 and 3% from 2023. New flats can qualify for higher rates in the first years under certain conditions.",
        ),
      },
      {
        typ: "kasten",
        ton: "acht",
        titel: tx("Rücklage", "Maintenance reserve"),
        text: tx(
          "Die monatliche Zuführung zur Instandhaltungsrücklage zahlen Sie, aber Sie können sie nicht sofort absetzen. Steuerlich zählt sie erst, wenn die Gemeinschaft das Geld für eine Maßnahme ausgibt. Wir rechnen deshalb ohne sie.",
          "You pay the monthly contribution to the maintenance reserve, but you cannot deduct it straight away. For tax purposes it only counts when the owners' association spends the money on works. So we calculate without it.",
        ),
      },
      { typ: "kasten", ton: "dich", titel: tx("Das heißt für Sie", "What this means for you"), text: steuerDich },
      {
        typ: "fussnote",
        text: tx(
          "Die steuerliche Wirkung hängt von Ihrer persönlichen Situation ab. Die verbindliche Beurteilung gehört zu Ihrem Steuerberater.",
          "The tax effect depends on your personal situation. The binding assessment is a matter for your tax adviser.",
        ),
      },
    ],
  });

  const tabelle = steuerTabelle(kp, gem);
  const hervorIndex = BRUTTO_REIHENFOLGE.indexOf(A.brutto);
  seiten.push({
    id: "kapitel-6b",
    kapitel: kapitel(6),
    titel: tx("Ihre Steuerwirkung im Vergleich", "Your tax effect compared"),
    personalisiert: "hervorgehobene Säule und Zeile, Kaufpreis nach Ihrem Rahmen",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Dieselbe Wohnung kostet Sie je nach Steuersatz unterschiedlich viel. Hier der monatliche Eigenaufwand im ersten Jahr für die Modellwohnung aus Kapitel 7.",
          "The same flat costs you a different amount depending on your tax rate. Here is your monthly contribution in the first year for the model flat from chapter 7.",
        ),
      },
      { typ: "grafik", zeichnung: diagrammSteuerNachEinkommen(kp, hervorIndex, false, gem) },
      {
        typ: "tabelle",
        kopf: [
          tx("Jahresbrutto", "Gross annual income"),
          tx("Grenzsteuersatz", "Marginal tax rate"),
          tx("vor Steuer", "before tax"),
          tx("Steuerwirkung", "tax effect"),
          tx("nach Steuer", "after tax"),
        ],
        rechtsAb: 1,
        zeilen: tabelle.map((z, i) => ({
          zellen: [antwort("brutto", z.brutto), rund(z.grenzsatz), betrag(z.vor), `+${betrag(z.wirkung)}`, betrag(z.nach)],
          hervor: i === hervorIndex,
          toene: [undefined, undefined, undefined, "plus", undefined],
        })),
      },
      {
        typ: "fussnote",
        text: gem
          ? tx(
              "Eigenaufwand je Monat im ersten Jahr: Miete minus Kosten, Rücklage, Zins und Tilgung, vor und nach Steuer. Grenzsteuersatz der Einkommensteuer im Modell mit dem Splittingtarif, das Jahresbrutto gilt als gemeinsames Einkommen (kinderlos, ohne Kirchensteuer), vom Brutto zum zu versteuernden Einkommen wie in unserem Steuerrechner.",
              "Monthly contribution in the first year: rent minus costs, reserve, interest and repayment, before and after tax. Marginal income tax rate in the model with the splitting tariff; the gross annual income counts as your joint income (no children, no church tax), converted from gross to taxable income as in our tax calculator.",
            )
          : tx(
              "Eigenaufwand je Monat im ersten Jahr: Miete minus Kosten, Rücklage, Zins und Tilgung, vor und nach Steuer. Grenzsteuersatz der Einkommensteuer im Modell (Grundtarif, kinderlos, ohne Kirchensteuer), das Einkommen vom Brutto zum zu versteuernden Einkommen wie in unserem Steuerrechner. Im Bereich um 80.000 € Brutto wirkt die Gleitzone des Solidaritätszuschlags, deshalb ist die Wirkung dort etwas höher als darüber.",
              "Monthly contribution in the first year: rent minus costs, reserve, interest and repayment, before and after tax. Marginal income tax rate in the model (basic tariff, no children, no church tax), converted from gross to taxable income as in our tax calculator. Around €80,000 gross, the phase-in zone of the solidarity surcharge applies, so the effect there is slightly higher than above it.",
            ),
      },
      { typ: "h2", text: tx("Was sich über die Jahre ändert", "What changes over the years") },
      {
        typ: "absatz",
        text: tx(
          "Die Steuerwirkung ist im ersten Jahr am größten. Mit jedem Jahr sinken die Zinsen, weil Sie tilgen, und die Miete steigt. Irgendwann wird aus dem steuerlichen Minus ein Plus, und dann zahlen Sie auf den Überschuss Steuern. Unsere Rechnung zeigt das ehrlich: Der monatliche Eigenaufwand bleibt dadurch über viele Jahre ungefähr gleich, obwohl die Miete steigt.",
          "The tax effect is largest in the first year. Every year the interest falls because you repay, and the rent rises. At some point the tax loss turns into a profit, and then you pay tax on the surplus. Our calculation shows this honestly: your monthly contribution stays roughly the same for many years, even though the rent rises.",
        ),
      },
      {
        typ: "kasten",
        ton: "gut",
        titel: tx("Genauer rechnen", "Calculate more precisely"),
        text: tx(
          "Mit unserem Steuerrechner rechnen Sie Ihren eigenen Effekt mit Steuerklasse, Kindern und Kirchensteuer. Ihr Berater zeigt ihn Ihnen gern.",
          "With our tax calculator you can work out your own effect with tax class, children and church tax. Your contact will be happy to show you.",
        ),
      },
    ],
  });

  // Kapitel 7
  const summeEigenaufwand = e.years.reduce((s, j) => s + -j.cashflowAfterTax, 0);
  seiten.push({
    id: "kapitel-7",
    kapitel: kapitel(7),
    titel: tx("Eine Wohnung, jede Zahl offen", "One flat, every figure disclosed"),
    personalisiert: "Kaufpreis nach Ihrem Rahmen, Ihr Steuersatz",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          `Die Modellwohnung in Ihrem Rahmen: Bestand in Bayern, Baujahr 1965, ${w.flaeche} m², Kaufpreis ${betrag(kp)}, vermietet für ${betrag(w.kaltmiete)} kalt im Monat.`,
          `The model flat within your budget: an existing building in Bavaria, built in 1965, ${w.flaeche} m², purchase price ${betrag(kp)}, let for ${betrag(w.kaltmiete)} net cold rent a month.`,
        ),
      },
      {
        typ: "zweispaltig",
        links: [
          {
            typ: "tabelle",
            titel: tx("Erstes Jahr, je Monat", "First year, per month"),
            rechtsAb: 1,
            zeilen: [
              { zellen: [tx("Kaltmiete", "Net cold rent"), `+${betrag(j1.miete)}`], toene: [undefined, "plus"] },
              { zellen: [tx("Nicht umlagefähige Kosten", "Non-recoverable costs"), betrag(-j1.kosten)], toene: [undefined, "minus"] },
              { zellen: [tx("Rücklage", "Maintenance reserve"), betrag(-j1.ruecklage)], toene: [undefined, "minus"] },
              { zellen: [tx("Zins 4,0 %", "Interest 4.0%"), betrag(-j1.zins)], toene: [undefined, "minus"] },
              { zellen: [tx("Tilgung 1,5 %", "Repayment 1.5%"), betrag(-j1.tilgung)], toene: [undefined, "minus"] },
              { zellen: [tx("vor Steuer", "before tax"), betrag(j1.vorSteuer)], summe: true },
              { zellen: [tx(`Steuerwirkung bei rund ${gs} %`, `Tax effect at about ${gs}%`), `+${betrag(j1.steuerwirkung)}`], toene: [undefined, "plus"] },
              { zellen: [tx("nach Steuer", "after tax"), betrag(j1.nachSteuer)], summe: true },
            ],
          },
        ],
        rechts: [
          {
            typ: "tabelle",
            titel: tx("Einmalig beim Kauf", "One-off at purchase"),
            rechtsAb: 1,
            zeilen: [
              { zellen: [tx("Kaufpreis, finanziert", "Purchase price, financed"), betrag(kp)] },
              { zellen: [tx("Grunderwerbsteuer 3,5 %", "Transfer tax 3.5%"), betrag(kp * 0.035)] },
              { zellen: [tx("Notar 1,0 % und Grundbuch 0,5 %", "Notary 1.0% and land register 0.5%"), betrag(kp * 0.015)] },
              { zellen: [tx("Finanzierungsnebenkosten 0,2 %", "Financing costs 0.2%"), betrag(e.finanzierungsnebenkosten)] },
              { zellen: [tx("aus Eigenkapital", "from equity"), betrag(e.purchaseCosts + e.finanzierungsnebenkosten)], summe: true },
            ],
          },
          {
            typ: "tabelle",
            titel: tx("Steuerlich im ersten Jahr", "For tax purposes in the first year"),
            rechtsAb: 1,
            zeilen: [
              { zellen: [tx("Einkünfte aus Vermietung", "Income from letting"), betrag(j1.vermietungsergebnisJahr)], toene: [undefined, "minus"] },
              { zellen: [tx("davon Abschreibung", "of which depreciation"), betrag(j1.afaJahr)] },
            ],
          },
        ],
      },
      {
        typ: "zahlen",
        werte: [
          { wert: betrag(-j1.nachSteuer), text: tx("zahlen Sie im ersten Jahr im Monat selbst", "is what you pay yourself each month in the first year") },
          { wert: betrag(j1.tilgung), text: tx("fließen im selben Monat als Tilgung in Ihr Vermögen", "goes into your wealth as repayment in the same month") },
          { wert: betrag(e.years[9].propertyEquity), text: tx("Vermögen in der Wohnung nach zehn Jahren", "equity in the flat after ten years") },
        ],
      },
      { typ: "h2", text: tx("Was die Rechnung annimmt", "What the calculation assumes") },
      {
        typ: "fussnote",
        text: tx(
          `${annahmenText(kp)} Leerstand 0 %. Die Finanzierungsnebenkosten zählen im ersten Jahr als Werbungskosten. Über 30 Jahre summiert sich Ihr Eigenaufwand nach Steuer im Modell auf rund ${betrag(summeEigenaufwand)}, gleichmäßig verteilt rund ${betrag(summeEigenaufwand / 360)} im Monat.`,
          `${annahmenText(kp)} Vacancy 0%. The financing costs count as deductible expenses in the first year. Over 30 years, your contribution after tax adds up to about ${betrag(summeEigenaufwand)} in the model, about ${betrag(summeEigenaufwand / 360)} a month spread evenly.`,
        ),
      },
      {
        typ: "kasten",
        ton: "dich",
        titel: tx("Das heißt für Sie", "What this means for you"),
        text: tx(
          `Die Rate von ${betrag(e.monthlyDebtService)} zahlen nicht Sie allein. Die Miete trägt den größten Teil, das Finanzamt einen weiteren. Was bleibt, ist Ihr monatlicher Beitrag, und ein großer Teil davon landet als Tilgung in Ihrem Vermögen.`,
          `You do not pay the instalment of ${betrag(e.monthlyDebtService)} on your own. The rent covers the largest part, the tax office another. What remains is your monthly contribution, and a large part of it ends up in your wealth as repayment.`,
        ),
      },
    ],
  });

  // Kapitel 8
  const ohneWert = rechneModell(kp, { zve: a.zve, wertsteigerung: 0, gemeinsam: gem });
  seiten.push({
    id: "kapitel-8",
    kapitel: kapitel(8),
    titel: tx("Vermögen und der Preis des Wartens", "Wealth and the price of waiting"),
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Über die Jahre sinkt die Restschuld, und der Wert der Wohnung entwickelt sich. Die Differenz ist Ihr Vermögen in der Wohnung.",
          "Over the years the remaining debt falls and the value of the flat develops. The difference is your equity in the flat.",
        ),
      },
      {
        typ: "grafik",
        titel: tx("Wert, Restschuld und Vermögen über 30 Jahre", "Value, remaining debt and equity over 30 years"),
        untertitel: tx("Modellwohnung aus Kapitel 7, Wert plus 1,5 % im Jahr", "Model flat from chapter 7, value plus 1.5% a year"),
        zeichnung: diagrammVermoegen(kp, a.zve, 660, 290, gem),
      },
      { typ: "h2", text: tx("Der Preis des Wartens", "The price of waiting") },
      {
        typ: "absatz",
        text: tx(
          "Dieselbe Wohnung, dasselbe Ziel in 25 Jahren. Wer später startet, hat weniger Jahre für Tilgung und Wertentwicklung.",
          "The same flat, the same goal in 25 years. If you start later, you have fewer years for repayment and growth in value.",
        ),
      },
      { typ: "grafik", zeichnung: diagrammWarten(kp, a.zve, 660, gem) },
      {
        typ: "fussnote",
        text: tx(
          `Vereinfachung: gleiche Wohnung zu heutigem Preis und heutigen Konditionen. Wertsteigerung ist nicht garantiert. Mit einer Wertsteigerung von 0 % stünden nach 30 Jahren im Modell immer noch rund ${betrag(ohneWert.years[ohneWert.years.length - 1].propertyEquity)} Vermögen in der Wohnung, allein durch die Tilgung.`,
          `Simplification: the same flat at today's price and today's terms. An increase in value is not guaranteed. With 0% increase in value, the model would still show about ${betrag(ohneWert.years[ohneWert.years.length - 1].propertyEquity)} of equity in the flat after 30 years, from repayment alone.`,
        ),
      },
      {
        typ: "kasten",
        ton: "acht",
        titel: tx("Kein Grund zur Eile", "No reason to rush"),
        text: tx(
          "Das ist kein Grund, übereilt zu kaufen. Ein Nein zur falschen Wohnung ist uns lieber als ein Ja, das Sie in zwei Jahren bereuen. Es ist aber ein Grund, die Frage nicht jahrelang offen zu lassen.",
          "That is no reason to buy in a hurry. We would rather hear no to the wrong flat than a yes you regret in two years. But it is a reason not to leave the question open for years.",
        ),
      },
    ],
  });

  // Kapitel 9
  const sp = schwerpunkt(ang, a);
  seiten.push({
    id: "kapitel-9",
    kapitel: kapitel(9),
    titel: `${tx("Ihr Schwerpunkt", "Your focus")}: ${sp.titel}`,
    personalisiert: "Ziel, ganze Seite wechselt",
    bloecke: [
      ...sp.bloecke,
      {
        typ: "fussnote",
        text: tx(
          "Modellrechnung, keine Zusage. Die steuerliche Beurteilung gehört zu Ihrem Steuerberater.",
          "Model calculation, not a commitment. The tax assessment is a matter for your tax adviser.",
        ),
      },
    ],
  });

  // Kapitel 10
  const laender: Array<[string, string, number]> = [
    ["Bayern", "Bavaria", 3.5],
    ["Baden-Württemberg", "Baden-Württemberg", 5.0],
    ["Rheinland-Pfalz", "Rhineland-Palatinate", 5.0],
    ["Sachsen-Anhalt", "Saxony-Anhalt", 5.0],
    ["Sachsen", "Saxony", 5.5],
    ["Berlin", "Berlin", 6.0],
    ["Mecklenburg-Vorpommern", "Mecklenburg-Western Pomerania", 6.0],
    ["Brandenburg", "Brandenburg", 6.5],
    ["Nordrhein-Westfalen", "North Rhine-Westphalia", 6.5],
  ];
  const ekText = antwort("eigenkapital", A.eigenkapital);
  const ekCheck =
    r.eigenkapital >= r.empf * 0.08
      ? tx(
          `Ihr Eigenkapital (${ekText}, gerechnet mit ${betrag(r.eigenkapital)}) deckt die Nebenkosten einer Wohnung für ${betrag(r.empf)} in allen Bundesländern der Tabelle.`,
          `Your equity (${ekText}, calculated as ${betrag(r.eigenkapital)}) covers the purchase costs of a flat for ${betrag(r.empf)} in all the federal states in the table.`,
        )
      : r.eigenkapital >= r.empf * 0.05
        ? tx(
            `Ihr Eigenkapital (${ekText}, gerechnet mit ${betrag(r.eigenkapital)}) deckt die Nebenkosten einer Wohnung für ${betrag(r.empf)} in Bayern, aber nicht in jedem Bundesland.`,
            `Your equity (${ekText}, calculated as ${betrag(r.eigenkapital)}) covers the purchase costs of a flat for ${betrag(r.empf)} in Bavaria, but not in every federal state.`,
          )
        : tx(
            `Mit Eigenkapital ${ekText} rechnen wir vorsichtig mit ${betrag(r.eigenkapital)}. Für die Nebenkosten einer Wohnung um ${betrag(r.empf)} brauchen Sie je nach Land ${betrag(r.empf * 0.05)} bis ${betrag(r.empf * 0.08)}.`,
            `With equity of ${ekText} we calculate cautiously with ${betrag(r.eigenkapital)}. For the purchase costs of a flat around ${betrag(r.empf)} you need ${betrag(r.empf * 0.05)} to ${betrag(r.empf * 0.08)}, depending on the state.`,
          );
  seiten.push({
    id: "kapitel-10",
    kapitel: kapitel(10),
    titel: tx("Kosten beim Kauf", "Costs of buying"),
    personalisiert: "Eigenkapital und Rahmen",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Zum Kaufpreis kommen die Kaufnebenkosten. Die Bank finanziert sie in der Regel nicht mit, deshalb brauchen Sie dafür Eigenkapital.",
          "The incidental purchase costs come on top of the purchase price. The bank usually does not finance them, so you need equity for them.",
        ),
      },
      {
        typ: "zweispaltig",
        links: [{ typ: "grafik", zeichnung: diagrammNebenkosten(kp) }],
        rechts: [
          {
            typ: "absatz",
            text: tx(
              `In Bayern rund 5,0 % des Kaufpreises, für die Modellwohnung aus Kapitel 7 also ${betrag(kp * 0.05)}: 3,5 % Grunderwerbsteuer, rund 1,0 % Notar und 0,5 % Grundbuch.`,
              `In Bavaria about 5.0% of the purchase price, so ${betrag(kp * 0.05)} for the model flat from chapter 7: 3.5% real estate transfer tax, about 1.0% notary and 0.5% land register.`,
            ),
          },
          {
            typ: "absatz",
            text: tx(
              "Eine Maklerprovision fällt für Sie bei uns nicht an, sofern im Exposé nichts anderes ausgewiesen ist.",
              "With us you pay no agent's commission unless the property listing states otherwise.",
            ),
          },
        ],
      },
      { typ: "h2", text: tx("Je nach Bundesland", "By federal state") },
      {
        typ: "tabelle",
        kopf: [
          tx("Bundesland", "Federal state"),
          tx("Grunderwerbsteuer", "Transfer tax"),
          tx("mit Notar und Grundbuch", "with notary and land register"),
          tx(`bei ${betrag(r.empf)}`, `at ${betrag(r.empf)}`),
        ],
        rechtsAb: 1,
        zeilen: laender.map(([de, en, g]) => ({ zellen: [tx(de, en), prozent(g), prozent(g + 1.5), betrag((r.empf * (g + 1.5)) / 100)] })),
      },
      {
        typ: "fussnote",
        text: tx(
          "Länder, in denen unser Angebot derzeit Wohnungen enthält. Notar und Grundbuch mit 1,5 % angesetzt, wie in unserem Investmentrechner; der tatsächliche Betrag richtet sich nach der Gebührenordnung.",
          "States in which our current offer includes flats. Notary and land register estimated at 1.5%, as in our investment calculator; the actual amount follows the official fee schedule.",
        ),
      },
      { typ: "kasten", ton: "dich", titel: tx("Das heißt für Sie", "What this means for you"), text: ekCheck },
      { typ: "h2", text: tx("Laufende Kosten", "Running costs") },
      {
        typ: "absatz",
        text: tx(
          "Jeden Monat zahlen Sie Hausgeld an die Eigentümergemeinschaft. Den umlagefähigen Teil holen Sie sich über die Nebenkosten vom Mieter zurück. Bei Ihnen bleiben der nicht umlagefähige Teil, die Zuführung zur Rücklage und die Kosten der Mietverwaltung, wenn Sie eine beauftragen.",
          "Every month you pay a service charge (Hausgeld) to the owners' association. You recover the recoverable part from the tenant through the utility costs. You bear the non-recoverable part, the contribution to the reserve and the cost of a letting agent if you appoint one.",
        ),
      },
    ],
  });

  // Kapitel 11
  const [zeitTitel, zeitText] = zeitplan(A.start);
  seiten.push({
    id: "kapitel-11",
    kapitel: kapitel(11),
    titel: tx("Vom Ja bis zum Notar", "From yes to the notary"),
    personalisiert: "Startzeitpunkt",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Klare Schritte in klarer Reihenfolge. Sie zahlen den Kaufpreis erst, wenn der Notar die Fälligkeit mitteilt.",
          "Clear steps in a clear order. You only pay the purchase price once the notary confirms it is due.",
        ),
      },
      {
        typ: "zeitstrahl",
        eintraege: [
          {
            symbol: "stift",
            marke: tx("Tag 0", "Day 0"),
            titel: tx("Reservierung", "Reservation"),
            text: tx(
              "Die Wohnung ist ab Ihrer Unterschrift bis zum Notartermin für Sie vorgemerkt. Bis zur Beurkundung bleiben beide Seiten frei.",
              "From your signature, the flat is held for you until the notary appointment. Both sides remain free until the deed is notarised.",
            ),
          },
          {
            symbol: "dokument",
            marke: tx("Woche 1", "Week 1"),
            titel: tx("Unterlagen", "Documents"),
            text: tx(
              "Selbstauskunft, Ausweis und Einkommensnachweise gehen an die Bank. Je vollständiger, desto schneller.",
              "Self-disclosure, ID and proof of income go to the bank. The more complete, the faster.",
            ),
          },
          {
            symbol: "bank",
            marke: tx("2 bis 6 Wochen", "2 to 6 weeks"),
            titel: tx("Finanzierung", "Financing"),
            text: tx("Die Bank prüft Sie und die Wohnung und gibt die Zusage.", "The bank assesses you and the flat and gives its commitment."),
          },
          {
            symbol: "brief",
            marke: tx("14 Tage vorher", "14 days before"),
            titel: tx("Vertragsentwurf", "Draft contract"),
            text: tx(
              "Sie bekommen den Entwurf des Kaufvertrags in der Regel zwei Wochen vor dem Termin, damit Sie ihn in Ruhe lesen können.",
              "You usually receive the draft purchase contract two weeks before the appointment, so you can read it at your own pace.",
            ),
          },
          {
            symbol: "schluessel",
            marke: tx("60 bis 90 Minuten", "60 to 90 minutes"),
            titel: tx("Notartermin", "Notary appointment"),
            text: tx(
              "Der Notar liest den Vertrag vollständig vor. Im selben Termin wird die Grundschuld für die Bank bestellt.",
              "The notary reads the entire contract aloud. The land charge for the bank is registered at the same appointment.",
            ),
          },
          {
            symbol: "euro",
            marke: tx("nach Mitteilung", "after notification"),
            titel: tx("Fälligkeit", "Payment due"),
            text: tx(
              "Gezahlt wird erst nach der Fälligkeitsmitteilung des Notars, meist innerhalb von 10 bis 14 Tagen.",
              "You only pay after the notary's notice that payment is due, usually within 10 to 14 days.",
            ),
          },
          {
            symbol: "haus",
            marke: tx("danach", "afterwards"),
            titel: tx("Übergabe", "Handover"),
            text: tx(
              "Ab dem Stichtag im Vertrag gehört Ihnen die Miete, nicht erst mit dem Grundbucheintrag.",
              "From the cut-off date in the contract, the rent is yours, not only once you are entered in the land register.",
            ),
          },
        ],
      },
      {
        typ: "fussnote",
        text: tx(
          "Zeitangaben sind Erfahrungswerte und keine Zusage. Die Dauer hängt vor allem an Bank und Unterlagen.",
          "Timings are based on experience and are not a commitment. The duration depends mainly on the bank and the documents.",
        ),
      },
      {
        typ: "kasten",
        ton: "dich",
        titel: tx(`Ihr Zeitplan: ${antwort("start", A.start)}`, `Your timeline: ${antwort("start", A.start)}`),
        text: `${zeitTitel}: ${zeitText}`,
      },
    ],
  });

  seiten.push({
    id: "kapitel-11b",
    kapitel: kapitel(11),
    titel: tx("Der Notartermin und die Zeit danach", "The notary appointment and afterwards"),
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Beim Notar wird es verbindlich. Deshalb lohnt es sich, den Vertragsentwurf vorher mit sechs Fragen zu lesen.",
          "At the notary it becomes binding. So it is worth reading the draft contract beforehand with six questions in mind.",
        ),
      },
      {
        typ: "karten",
        spalten: 2,
        karten: [
          { titel: tx("1 Kaufgegenstand", "1 Subject of purchase"), text: tx("Stimmen Wohnung, Keller, Stellplatz und Miteigentumsanteil?", "Are the flat, cellar, parking space and co-ownership share correct?") },
          { titel: tx("2 Fälligkeit", "2 Payment due"), text: tx("Wann und unter welchen Bedingungen wird der Kaufpreis fällig?", "When and under which conditions does the purchase price become due?") },
          { titel: tx("3 Nutzen und Lasten", "3 Benefits and burdens"), text: tx("Ab welchem Tag gehört Ihnen die Miete, ab wann tragen Sie die Kosten?", "From which day is the rent yours, and from when do you bear the costs?") },
          {
            titel: tx("4 Mietverhältnis und Kaution", "4 Tenancy and deposit"),
            text: tx("Geht der Mietvertrag mit allen Rechten über, und was passiert mit der Kaution?", "Does the tenancy transfer with all rights, and what happens to the deposit?"),
          },
          { titel: tx("5 Sondernutzungsrechte", "5 Exclusive use rights"), text: tx("Garten, Terrasse, Stellplatz: Was dürfen Sie allein nutzen?", "Garden, terrace, parking space: what may you use exclusively?") },
          { titel: tx("6 Gewährleistung", "6 Warranty"), text: tx("Was ist ausgeschlossen, was sichert der Verkäufer zu?", "What is excluded, and what does the seller guarantee?") },
        ],
      },
      {
        typ: "kasten",
        ton: "acht",
        titel: tx("Gut zu wissen", "Good to know"),
        text: tx(
          "Nehmen Sie Ihren gültigen Ausweis im Original mit. Nach der Beurkundung gibt es kein Widerrufsrecht. Fragen stellen Sie deshalb vorher, Ihr Berater hilft Ihnen dabei.",
          "Bring your valid original ID. There is no right of withdrawal after notarisation. So ask your questions beforehand, your contact will help you.",
        ),
      },
      { typ: "h2", text: tx("Nach dem Notar lassen wir Sie nicht allein", "We do not leave you alone after the notary") },
      {
        typ: "zeitstrahl",
        eintraege: [
          { symbol: "dokument", marke: tx("Woche 1", "Week 1"), titel: tx("Objektordner", "Property folder"), text: tx("Sie bekommen alle Unterlagen zur Wohnung gesammelt.", "You receive all documents on the flat in one place.") },
          {
            symbol: "euro",
            marke: tx("nach der ersten Miete", "after the first rent"),
            titel: tx("Cashflow-Check", "Cash flow check"),
            text: tx("Wir prüfen gemeinsam, ob Miete und Kosten wie geplant laufen.", "Together we check whether rent and costs are running as planned."),
          },
          {
            symbol: "kalender",
            marke: tx("im Frühjahr", "in spring"),
            titel: tx("Hausgeldabrechnung", "Service charge statement"),
            text: tx("Wir gehen die erste Abrechnung der Gemeinschaft mit Ihnen durch.", "We go through the owners' association's first statement with you."),
          },
          {
            symbol: "prozent",
            marke: tx("nach dem Steuerbescheid", "after the tax assessment"),
            titel: tx("Erstes Steuerjahr", "First tax year"),
            text: tx("Hat die Rechnung gehalten? Danach sprechen wir über den nächsten Schritt.", "Did the calculation hold? Then we talk about the next step."),
          },
        ],
      },
      {
        typ: "absatz",
        text: tx(
          "Für die Vermietung gibt es verschiedene Wege: die Verwaltung der Gemeinschaft, eine eigene Mietverwaltung für Ihre Wohnung oder einen Mietpool. Ihr Berater zeigt Ihnen, was jeweils Rendite gegen Aufwand bedeutet.",
          "There are different ways to handle the letting: the owners' association's management, your own letting agent for your flat, or a rental pool. Your contact shows you what each means in terms of return and effort.",
        ),
      },
    ],
  });

  // Kapitel 12
  const [berufTitel, berufListe] = unterlagenBeruf(A.beruf);
  seiten.push({
    id: "kapitel-12",
    kapitel: kapitel(12),
    titel: tx("Ihre Unterlagen", "Your documents"),
    personalisiert: "Beruf",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Die meiste Zeit bis zum Notar geht verloren, weil Unterlagen fehlen. Wer sie früh beisammen hat, spart Wochen.",
          "Most time before the notary is lost because documents are missing. If you gather them early, you save weeks.",
        ),
      },
      {
        typ: "zweispaltig",
        links: [{ typ: "checkliste", titel: tx("Für alle", "For everyone"), punkte: unterlagenAlle() }],
        rechts: [{ typ: "checkliste", titel: tx(`Für ${berufTitel}`, `For ${berufTitel}`), punkte: berufListe }],
      },
      {
        typ: "kasten",
        ton: "dich",
        titel: tx("Tipp", "Tip"),
        text: tx(
          "Sie können Unterlagen schon früh in Ihren Ordner im Kundenportal laden. Dort sieht Ihr Berater, was fehlt, und Sie müssen nichts per E-Mail verschicken.",
          "You can upload documents to your folder in the customer portal early on. Your contact sees there what is missing, and you do not need to send anything by email.",
        ),
      },
      {
        typ: "portal",
        titel: tx("So sieht es in Ihrem Ordner im Kundenportal aus", "This is how your folder in the customer portal looks"),
        zeilen: [
          { text: tx("Selbstauskunft", "Self-disclosure"), status: tx("liegt vor", "received"), ton: "g" },
          { text: tx("Personalausweis", "ID card"), status: tx("fehlt noch", "still missing"), ton: "y" },
          { text: tx("Einkommensnachweise", "Proof of income"), status: tx("2 von 3", "2 of 3"), ton: "y" },
          { text: tx("Eigenkapitalnachweis", "Proof of equity"), status: tx("offen", "open"), ton: "r" },
        ],
        hinweis: tx(
          "Beispielansicht. Ihr Berater sieht denselben Stand und erinnert Sie, wenn etwas fehlt.",
          "Example view. Your contact sees the same status and reminds you when something is missing.",
        ),
      },
      { typ: "h2", text: tx("Warum die Bank so viel wissen will", "Why the bank wants to know so much") },
      {
        typ: "absatz",
        text: tx(
          "Die Bank muss prüfen, ob Sie die Rate auch dann tragen können, wenn einmal etwas schiefgeht. Das ist lästig, schützt aber auch Sie. Ihre Unterlagen gehen nur an die Bank, die Sie für die Finanzierung auswählen.",
          "The bank has to check whether you can afford the instalment even if something goes wrong. That is tedious, but it also protects you. Your documents only go to the bank you choose for the financing.",
        ),
      },
      {
        typ: "kasten",
        ton: "gut",
        titel: tx("Datenschutz", "Data protection"),
        text: tx(
          "Ihre Selbstauskunft wird verschlüsselt übertragen und liegt geschützt in Ihrer Akte. Ihre Unterlagen laden Sie später im geschützten Kundenportal hoch, statt sie per E-Mail zu verschicken.",
          "Your self-disclosure is transmitted in encrypted form and stored securely in your file. Later, you upload your documents in the protected customer portal instead of sending them by email.",
        ),
      },
    ],
  });

  // Kapitel 13
  const rest10 = e.years[9].remainingDebt;
  seiten.push({
    id: "kapitel-13",
    kapitel: kapitel(13),
    titel: tx("Chancen und Risiken, ehrlich gerechnet", "Opportunities and risks, honestly calculated"),
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Chancen und Risiken bekommen bei uns gleich viel Platz. Ein Nein zur falschen Wohnung ist uns lieber als ein Ja, das Sie später bereuen.",
          "With us, opportunities and risks get equal space. We would rather hear no to the wrong flat than a yes you regret later.",
        ),
      },
      {
        typ: "tabelle",
        kopf: [tx("Risiko", "Risk"), tx("Was passieren kann", "What can happen"), tx("Was Sie tun können", "What you can do")],
        zeilen: [
          {
            zellen: [
              tx("Leerstand", "Vacancy"),
              tx(
                `Ein Monat ohne Mieter kostet in der Modellwohnung ${betrag(w.kaltmiete)} Miete, das Hausgeld läuft weiter.`,
                `A month without a tenant costs ${betrag(w.kaltmiete)} of rent in the model flat, and the service charge continues.`,
              ),
              tx("Rücklage auf Ihrem Konto, Mieterauswahl über die Verwaltung.", "A reserve in your account, tenant selection through the management."),
            ],
          },
          {
            zellen: [
              tx("Mieter zahlt nicht", "Tenant does not pay"),
              tx("Selten, aber möglich. Bis zur Klärung tragen Sie die Rate allein.", "Rare, but possible. Until it is resolved, you carry the instalment alone."),
              tx("Puffer beziffern, sorgfältige Mieterauswahl, gegebenenfalls Versicherung.", "Quantify a buffer, select tenants carefully, take out insurance if appropriate."),
            ],
          },
          {
            zellen: [
              tx("Sonderumlage", "Special levy"),
              tx(
                "Beschließt die Gemeinschaft eine größere Maßnahme, kann eine Umlage kommen: selten, aber dann oft vierstellig.",
                "If the owners' association decides on major works, a special levy may follow: rare, but then often four figures.",
              ),
              tx("Vor dem Kauf Rücklage und Beschlüsse prüfen. Das machen wir für Sie.", "Check the reserve and resolutions before buying. We do that for you."),
            ],
          },
          {
            zellen: [
              tx("Zinsen nach der Bindung", "Interest after the fixed period"),
              tx(
                `Nach zehn Jahren ist die Restschuld im Modell ${betrag(rest10)}. Ein Anschlusszins von 6 % statt 4 % hieße rund ${betrag((rest10 * 0.02) / 12)} mehr Zins im Monat.`,
                `After ten years the remaining debt in the model is ${betrag(rest10)}. A follow-up rate of 6% instead of 4% would mean about ${betrag((rest10 * 0.02) / 12)} more interest a month.`,
              ),
              tx(
                "Längere Zinsbindung, jährliche Sondertilgung, Kündigungsrecht nach zehn Jahren (§ 489 BGB).",
                "A longer fixed-interest period, annual special repayments, the right to terminate after ten years (Section 489 BGB).",
              ),
            ],
          },
          {
            zellen: [
              tx("Miete steigt langsamer", "Rent rises more slowly"),
              tx(
                "Erhöhungen sind an Vergleichsmiete und Kappungsgrenze gebunden: höchstens 20 %, in angespannten Märkten 15 % in drei Jahren.",
                "Increases are tied to the local comparable rent and a cap: at most 20%, or 15% in tight markets, within three years.",
              ),
              tx("Mit vorsichtigen Annahmen rechnen, wie hier mit 2 % im Jahr.", "Calculate with cautious assumptions, as here with 2% a year."),
            ],
          },
          {
            zellen: [
              tx("Wert entwickelt sich nicht", "Value does not grow"),
              tx("Eine Wertsteigerung ist nicht garantiert.", "An increase in value is not guaranteed."),
              tx("Auch mit 0 % Wertsteigerung baut die Tilgung Vermögen auf, siehe Kapitel 8.", "Even with 0% increase in value, repayment builds wealth, see chapter 8."),
            ],
          },
          {
            zellen: [
              tx("Verkauf vor zehn Jahren", "Selling within ten years"),
              tx(
                "Ein Gewinn wäre dann in der Regel steuerpflichtig. Ein früher Verkauf ist deshalb ungünstig.",
                "A profit would then usually be taxable. An early sale is therefore unfavourable.",
              ),
              tx("Nur mit Geld kaufen, das Sie langfristig anlegen können.", "Only buy with money you can invest for the long term."),
            ],
          },
        ],
      },
      { typ: "h2", text: tx("Die Chancen", "The opportunities") },
      {
        typ: "karten",
        spalten: 2,
        karten: [
          {
            titel: tx("Tilgung als Sparplan", "Repayment as a savings plan"),
            text: tx(
              `Jeden Monat gehört Ihnen mehr von Ihrer Wohnung, im Modell zu Beginn ${betrag(j1.tilgung)} im Monat.`,
              `Every month you own more of your flat, in the model ${betrag(j1.tilgung)} a month at the start.`,
            ),
          },
          {
            titel: tx("Miete wächst mit", "Rent grows too"),
            text: tx("Steigt die Miete, steigt Ihr Überschuss, während die Rate gleich bleibt.", "If the rent rises, your surplus rises while the instalment stays the same."),
          },
          {
            titel: tx("Das Finanzamt trägt mit", "The tax office contributes"),
            text: tx("Vor allem in den ersten Jahren, abhängig von Ihrem Steuersatz.", "Especially in the first years, depending on your tax rate."),
          },
          {
            titel: tx("Wertentwicklung", "Growth in value"),
            text: tx("Möglich, aber nicht garantiert. Sie ist die Zugabe, nicht die Grundlage.", "Possible, but not guaranteed. It is the bonus, not the basis."),
          },
        ],
      },
    ],
  });

  // Kapitel 14
  seiten.push({
    id: "kapitel-14",
    kapitel: kapitel(14),
    titel: tx("Häufige Fragen", "Frequently asked questions"),
    bloecke: [
      {
        typ: "zweispaltig",
        links: faqBloecke([
          [
            tx("Ist mein Rahmen eine Finanzierungszusage?", "Is my budget a financing commitment?"),
            tx(
              "Nein. Er ist eine Modellrechnung. Eine Zusage gibt nur eine Bank, nachdem sie Sie und die Wohnung geprüft hat.",
              "No. It is a model calculation. Only a bank can give a commitment, after assessing you and the flat.",
            ),
          ],
          [
            tx("Fragen Sie bei der Schufa an?", "Do you run a Schufa credit check?"),
            tx(
              "Nein. Eine Schufa-Auskunft holt erst die finanzierende Bank ein, und nur mit Ihrer Zustimmung.",
              "No. Only the financing bank requests a Schufa report, and only with your consent.",
            ),
          ],
          [
            tx("Wer sieht meine Angaben?", "Who sees my details?"),
            tx(
              "OS Immobilien und der Immobilienberater, der Sie betreut. An eine Bank gehen Ihre Daten erst, wenn Sie sich für eine Finanzierung entscheiden.",
              "OS Immobilien and your contact person who looks after you. Your data only goes to a bank once you decide on a financing.",
            ),
          ],
          [
            tx("Was kostet mich OS Immobilien?", "What does OS Immobilien cost me?"),
            tx(
              "Wir vermitteln im Auftrag des Verkäufers. Für Sie fällt keine Maklerprovision an, sofern im Exposé nichts anderes ausgewiesen ist.",
              "We act on behalf of the seller. You pay no agent's commission unless the property listing states otherwise.",
            ),
          ],
          [
            tx("Kann ich über meine Hausbank finanzieren?", "Can I finance through my own bank?"),
            tx(
              "Ja. Sie können über Ihren eigenen Berater, Ihre Hausbank oder unseren Finanzierungspartner finanzieren, auch parallel anfragen.",
              "Yes. You can finance through your own adviser, your own bank or our financing partner, and ask in parallel.",
            ),
          ],
          [
            tx("Wie lange dauert es bis zum Notar?", "How long does it take until the notary appointment?"),
            tx(
              "Das hängt vor allem an Bank und Unterlagen. Als Erfahrungswert braucht die Finanzierung zwei bis sechs Wochen, den Vertragsentwurf bekommen Sie in der Regel zwei Wochen vor dem Termin.",
              "That depends mainly on the bank and the documents. In our experience the financing takes two to six weeks, and you usually receive the draft contract two weeks before the appointment.",
            ),
          ],
        ]),
        rechts: faqBloecke([
          [
            tx("Können wir auch zu zweit kaufen?", "Can we buy as a couple?"),
            tx(
              "Ja. Die Selbstauskunft lässt sich für zwei Personen ausfüllen, die Bank rechnet dann mit Ihrem gemeinsamen Haushalt.",
              "Yes. The self-disclosure can be completed for two people, and the bank then calculates with your joint household.",
            ),
          ],
          [
            tx("Kann ich von einer Reservierung zurücktreten?", "Can I withdraw from a reservation?"),
            tx(
              "Die Reservierung merkt die Wohnung bis zum Notartermin für Sie vor. Bis zur Beurkundung bleiben beide Seiten frei. Die Einzelheiten stehen in der Reservierungsvereinbarung.",
              "The reservation holds the flat for you until the notary appointment. Both sides remain free until notarisation. The details are in the reservation agreement.",
            ),
          ],
          [
            tx("Ab wann gehört mir die Miete?", "From when is the rent mine?"),
            tx(
              "Ab dem Stichtag, der im Kaufvertrag für Nutzen und Lasten steht, nicht erst mit der Eintragung im Grundbuch.",
              "From the cut-off date for benefits and burdens in the purchase contract, not only once you are entered in the land register.",
            ),
          ],
          [
            tx("Wer kümmert sich um die Vermietung?", "Who takes care of the letting?"),
            tx(
              "Das entscheiden Sie: die Verwaltung der Gemeinschaft, eine eigene Mietverwaltung oder ein Mietpool. Ihr Berater zeigt Ihnen die Unterschiede.",
              "You decide: the owners' association's management, your own letting agent or a rental pool. Your contact shows you the differences.",
            ),
          ],
          [
            tx("Ersetzt das Handbuch meinen Steuerberater?", "Does the handbook replace my tax adviser?"),
            tx(
              "Nein. Es zeigt Ihnen die Mechanik. Die verbindliche Beurteilung Ihrer Steuer gehört zu Ihrem Steuerberater. Gern setzen wir uns gemeinsam mit ihm an die Zahlen.",
              "No. It shows you the mechanics. The binding assessment of your tax is a matter for your tax adviser. We are happy to go through the figures together with them.",
            ),
          ],
          [
            tx("Was passiert mit meinen Daten, wenn ich nicht weitermache?", "What happens to my data if I do not continue?"),
            tx(
              "Sie können jederzeit verlangen, dass wir Ihre Angaben löschen, zum Beispiel per Mail an os@os-immobilien.com.",
              "You can ask us to delete your details at any time, for example by email to os@os-immobilien.com.",
            ),
          ],
        ]),
      },
      {
        typ: "kasten",
        ton: "dich",
        titel: tx("Ihre Frage ist nicht dabei?", "Your question is not here?"),
        text: tx(
          "Dann stellen Sie sie Ihrem Berater im ersten Gespräch. Es gibt keine dummen Fragen, nur teure Annahmen.",
          "Then ask your contact in the first conversation. There are no silly questions, only expensive assumptions.",
        ),
      },
    ],
  });

  // Nächster Schritt
  const schrittText =
    ausgang === "passt"
      ? tx(
          "Ihre Angaben passen zu unseren Wohnungen. Mit der Selbstauskunft rechnen wir Ihren Rahmen genau, und Ihr Berater kann Ihnen direkt passende Wohnungen vorstellen.",
          "Your details fit our flats. With the self-disclosure we calculate your budget precisely, and your contact can present suitable flats straight away.",
        )
      : ausgang === "vielleicht"
        ? tx(
            "Ihre Angaben passen knapp. Mit der Selbstauskunft sehen wir genau, was geht, und Ihr Berater sagt Ihnen ehrlich, ob jetzt der richtige Zeitpunkt ist oder was Sie vorher noch aufbauen sollten.",
            "Your details are a close fit. With the self-disclosure we see exactly what is possible, and your contact tells you honestly whether now is the right time or what you should build up first.",
          )
        : tx(
            "Noch passt es nicht, und das ist in Ordnung. Wenn sich Ihre Lage ändert, ist die Selbstauskunft der erste Schritt.",
            "It is not a fit yet, and that is fine. When your situation changes, the self-disclosure is the first step.",
          );
  const partner = ang.partner;
  const sprechenText = partner?.buchungslink
    ? tx(`Dann buchen Sie einen Termin mit ${partner.name}: ${partner.buchungslink}`, `Then book an appointment with ${partner.name}: ${partner.buchungslink}`)
    : partner?.name
      ? tx(
          `Dann melden Sie sich bei ${partner.name}${partner.email ? ` unter ${partner.email}` : ""}${partner.telefon ? ` oder ${partner.telefon}` : ""}.`,
          `Then get in touch with ${partner.name}${partner.email ? ` at ${partner.email}` : ""}${partner.telefon ? ` or ${partner.telefon}` : ""}.`,
        )
      : tx("Dann antworten Sie einfach auf die E-Mail mit Ihrem Handbuch, wir melden uns bei Ihnen.", "Then simply reply to the email with your handbook and we will get back to you.");
  seiten.push({
    id: "naechster-schritt",
    kapitel: tx("Ihr nächster Schritt", "Your next step"),
    titel: tx("Die Selbstauskunft", "The self-disclosure"),
    personalisiert: "Ausgang, persönlicher Link und QR-Code",
    bloecke: [
      {
        typ: "lead",
        text: tx(
          "Aus der Schätzung wird eine belastbare Rechnung. Die Selbstauskunft verpflichtet Sie zu nichts.",
          "The estimate becomes a reliable calculation. The self-disclosure (Selbstauskunft) does not commit you to anything.",
        ),
      },
      {
        typ: "naechsterSchritt",
        fuer: name,
        titel: tx("Jetzt Selbstauskunft ausfüllen", "Complete your self-disclosure now"),
        text: schrittText,
        knopf: tx("Selbstauskunft ausfüllen", "Complete self-disclosure"),
        link: ang.saLink,
        ersatz: ang.saPerMail
          ? tx(
              "Ihren persönlichen Link zur Selbstauskunft senden wir Ihnen per E-Mail. Sollte keine ankommen, meldet sich Ihr Berater bei Ihnen.",
              "We will send you your personal link to the self-disclosure by email. If none arrives, your contact will get in touch with you.",
            )
          : tx("Ihre Selbstauskunft liegt uns schon vor. Ihr Berater meldet sich bei Ihnen.", "We already have your self-disclosure. Your contact will get in touch with you."),
      },
      { typ: "h2", text: tx("So läuft es ab", "How it works") },
      {
        typ: "karten",
        spalten: 3,
        karten: [
          {
            titel: tx("1 Ausfüllen", "1 Fill in"),
            text: tx(
              "Acht kurze Abschnitte: Ziele, Person, Einnahmen, Ausgaben, Vermögen, Verbindlichkeiten, Sonstiges, Abschluss. Einiges ist aus Ihren Antworten schon vorbelegt. Am Ende unterschreiben Sie digital.",
              "Eight short sections: goals, personal details, income, expenses, assets, liabilities, other, completion. Some of it is already pre-filled from your answers. At the end you sign digitally.",
            ),
          },
          {
            titel: tx("2 Rahmen genau", "2 Exact budget"),
            text: tx(
              "Wir rechnen Ihren Rahmen mit Ihren echten Zahlen und legen die Selbstauskunft sicher in Ihrer Akte ab.",
              "We calculate your budget with your real figures and store the self-disclosure securely in your file.",
            ),
          },
          {
            titel: tx("3 Wohnungen sehen", "3 See flats"),
            text: tx("Ihr Immobilienberater meldet sich und stellt Ihnen passende Wohnungen vor.", "Your contact gets in touch and presents suitable flats to you."),
          },
        ],
      },
      {
        typ: "zweispaltig",
        links: [
          {
            typ: "kasten",
            ton: "gut",
            titel: tx("Was Sie brauchen", "What you need"),
            text: tx(
              "Ihre Einkommensnachweise zur Hand, Ihre Steuer-ID und Ihre Bankverbindung, dazu etwas Ruhe. Zwischenspeichern ist möglich.",
              "Your proof of income to hand, your tax ID and your bank details, and a little time. You can save and continue later.",
            ),
          },
        ],
        rechts: [{ typ: "kasten", ton: "gut", titel: tx("Lieber erst sprechen?", "Rather talk first?"), text: sprechenText }],
      },
      {
        typ: "kasten",
        ton: "dich",
        titel: tx("Ihre Daten", "Your data"),
        text: tx(
          "Ihre Angaben sehen nur OS Immobilien und Ihr Berater. An eine Bank gehen sie erst, wenn Sie sich für eine Finanzierung entscheiden und zustimmen.",
          "Only OS Immobilien and your contact see your details. They only go to a bank once you decide on a financing and consent.",
        ),
      },
    ],
  });

  // Hinweise
  seiten.push({
    id: "hinweise",
    kapitel: tx("Hinweise", "Notes"),
    titel: tx("Annahmen und Hinweise", "Assumptions and notes"),
    bloecke: [
      { typ: "h2", text: tx("Alle Annahmen der Modellrechnungen", "All assumptions of the model calculations") },
      {
        typ: "fussnote",
        text: tx(
          `${annahmenText(kp)} Gerechnet wie im OS Immobilien-Investmentrechner: Kaufnebenkosten auf den gesamten Kaufpreis, Gebäudeanteil einschließlich anteiliger Nebenkosten als Grundlage der Abschreibung, Finanzierungsnebenkosten 0,2 % des Darlehens im ersten Jahr als Werbungskosten, Rücklage im Cashflow, aber nicht steuerlich abgezogen, Steuer nach der Differenzmethode, jedes Jahr als volles Jahr.`,
          `${annahmenText(kp)} Calculated as in the OS Immobilien investment calculator: purchase costs on the full purchase price, building share including pro rata purchase costs as the basis for depreciation, financing costs of 0.2% of the loan as deductible expenses in the first year, reserve included in the cash flow but not deducted for tax, tax by the difference method, each year as a full year.`,
        ),
      },
      {
        typ: "fussnote",
        text: gem
          ? tx(
              "Gemeinsame Veranlagung: Ihr Jahresbrutto gilt als Ihr gemeinsames Einkommen. Das zu versteuernde Einkommen entsteht daraus mit denselben Abzügen für Sozialversicherung wie in unserem Steuerrechner, der Grenzsteuersatz mit dem Splittingtarif 2026, kinderlos, ohne Kirchensteuer. Ihr Rahmen: 80 % Ihres Überschusses als Rate, Annuität 6 % im Jahr, plus Eigenkapital; gerechnet mit der Untergrenze Ihrer Antworten.",
              "Joint assessment: your gross annual income counts as your joint income as a couple. Taxable income is derived from it with the same social security deductions as in our tax calculator, and the marginal tax rate with the 2026 splitting tariff, no children, no church tax. Your budget: 80% of your surplus as the instalment, annuity of 6% a year, plus equity; calculated with the lower limit of your answers.",
            )
          : tx(
              "Ihr Grenzsteuersatz ist aus Ihrer Antwort zum Jahresbrutto geschätzt: Grundtarif 2026, kinderlos, ohne Kirchensteuer, Abzüge für Sozialversicherung wie in unserem Steuerrechner. Ihr Rahmen: 80 % Ihres Überschusses als Rate, Annuität 6 % im Jahr, plus Eigenkapital; gerechnet mit der Untergrenze Ihrer Antworten.",
              "Your marginal tax rate is estimated from your answer on gross annual income: 2026 basic tariff, no children, no church tax, social security deductions as in our tax calculator. Your budget: 80% of your surplus as the instalment, annuity of 6% a year, plus equity; calculated with the lower limit of your answers.",
            ),
      },
      { typ: "h2", text: tx("Wichtige Hinweise", "Important notes") },
      {
        typ: "fussnote",
        text: tx(
          "Alle Zahlen in diesem Handbuch sind Modellrechnungen mit offengelegten Annahmen. Sie sind keine Zusage und kein garantiertes Ergebnis. Wertsteigerungen und Mietentwicklungen sind nicht garantiert. Die steuerliche Wirkung hängt von Ihrer persönlichen Situation ab; dieses Handbuch ersetzt keine Steuer-, Rechts- oder Anlageberatung. Es ist kein Angebot und keine Aufforderung zum Erwerb einer Immobilie oder eines Finanzprodukts. Ein Finanzierungsrahmen ist keine Finanzierungszusage.",
          "All figures in this handbook are model calculations with disclosed assumptions. They are not a commitment and not a guaranteed result. Increases in value and rent developments are not guaranteed. The tax effect depends on your personal situation; this handbook does not replace tax, legal or investment advice. It is neither an offer nor a solicitation to buy a property or a financial product. A financing budget is not a financing commitment.",
        ),
      },
      {
        typ: "absatz",
        text: tx(
          "OS Immobilien Holding GmbH, Am Ostbahnhof 1, 15749 Mittenwalde. Kontakt: os@os-immobilien.com. Impressum und Datenschutz: osimmobilien.netlify.app/impressum und osimmobilien.netlify.app/datenschutz.",
          "OS Immobilien Holding GmbH, Am Ostbahnhof 1, 15749 Mittenwalde, Germany. Contact: os@os-immobilien.com. Legal notice and privacy policy: osimmobilien.netlify.app/impressum and osimmobilien.netlify.app/datenschutz.",
        ),
      },
    ],
  });

  return {
    sprache,
    titel: tx("Ihr persönliches Immobilienhandbuch", "Your personal property handbook"),
    untertitel: tx(
      "Wie die Bank rechnet, was die Steuer beiträgt, welcher Rahmen zu Ihnen passt und wie es bis zum Notar weitergeht.",
      "How the bank calculates, what tax contributes, which budget suits you and how it continues to the notary.",
    ),
    erstelltFuer: name,
    datum: ang.datum,
    seiten,
  };
}

function faqBloecke(paare: Array<[string, string]>): Block[] {
  return paare.flatMap(([f, antwort]) => [
    { typ: "h2" as const, text: f },
    { typ: "absatz" as const, text: antwort },
  ]);
}

/** Der Ausgang als Text für Oberfläche und Mail. */
export { AUSGANG_TEXT };
