/**
 * Der Handbuch-Funnel: sechs Fragen, drei Ausgänge, ein Rahmen.
 *
 * Grundlage ist die Strategie „Handbuch-Funnel für OS Immobilien“ vom 26.09.2026,
 * Teil A, Kapitel 3. Diese Datei ist die einzige Stelle, an der die Fragen,
 * ihre Antworten und die Regeln für den Ausgang stehen. Sie wird gelesen von
 *
 *   - der öffentlichen Landingpage (Konfigurator im Browser),
 *   - `submit-lead`, das den Ausgang und den Rahmen selbst nachrechnet, statt
 *     der Zahl aus dem Browser zu glauben,
 *   - dem Handbuch (online und als PDF).
 *
 * Reine Datei, nur mit einem relativen Import der Rahmenformel, damit Vitest
 * und Deno sie lesen können.
 *
 * WARUM DIE UNTERGRENZE
 *
 * Gerechnet wird mit der Untergrenze der gewählten Spanne. Wer „500 bis
 * 1.000 €“ wählt, bekommt einen Rahmen für 500 €. Das ist die vorsichtige
 * Lesart, und nach der Selbstauskunft rechnet dieselbe Formel mit den genauen
 * Zahlen (`calculateFinanzierbarkeitFromSaData`).
 */
import { rahmenAusUeberschuss, rahmenSpanne } from "./rahmen-formel.ts";

export type FrageSchluessel = "ziel" | "beruf" | "brutto" | "ueberschuss" | "eigenkapital" | "start";

export type ZielId = "vermoegen" | "alter" | "steuer" | "verstehen";
export type BerufId = "angestellt" | "beamter" | "selbststaendig" | "anderes";
export type BruttoId = "unter_50" | "50_80" | "80_120" | "ueber_120";
export type UeberschussId = "unter_500" | "500_1000" | "1000_1500" | "ueber_1500" | "unbekannt";
export type EigenkapitalId = "unter_10" | "10_30" | "30_60" | "ueber_60";
export type StartId = "sofort" | "drei_monate" | "spaeter" | "informieren";

export interface HandbuchAntworten {
  ziel: ZielId;
  beruf: BerufId;
  brutto: BruttoId;
  ueberschuss: UeberschussId;
  eigenkapital: EigenkapitalId;
  start: StartId;
  /**
   * Schalter bei Frage 3. Seit dem 26.09.2026 wirksam: Das Jahresbrutto gilt
   * dann als gemeinsames Einkommen, und Steuersatz und Steuerwirkung rechnen
   * mit dem Splittingtarif des Rechenkerns (`lib/handbuch/modell.ts`). Der
   * Rahmen hängt nicht daran, er rechnet nur mit Überschuss und Eigenkapital;
   * der Server rechnet keine Steuer, nur Rahmen und Ausgang.
   */
  gemeinsamVeranlagt?: boolean;
}

export interface Antwortmoeglichkeit<T extends string = string> {
  id: T;
  text: string;
  /** Rechenwert der Untergrenze, wo es einen gibt. */
  wert?: number;
}

export interface Frage {
  nr: number;
  schluessel: FrageSchluessel;
  frage: string;
  /** Der eine Satz „Warum wir fragen“ unter der Frage. */
  warum: string;
  antworten: Antwortmoeglichkeit[];
}

/**
 * Rechenwert für „Weiß ich nicht genau“ bei Frage 4: die unterste Spanne, die
 * einen Rahmen ergibt. „unter 500 €“ rechnet mit 0 € und ergäbe keinen.
 */
export const UEBERSCHUSS_WENN_UNBEKANNT = 500;

/** Die kurze Rechenhilfe unter Frage 4, aufklappbar. */
export const UEBERSCHUSS_RECHENHILFE = [
  "Nehmen Sie Ihr monatliches Nettoeinkommen.",
  "Ziehen Sie Miete oder Hausrate, Nebenkosten, Lebensmittel, Versicherungen, Auto und laufende Raten ab.",
  "Was danach im Durchschnitt übrig bleibt, ist Ihr Überschuss. Sparraten, die Sie behalten wollen, zählen Sie nicht mit.",
];

export const FRAGEN: Frage[] = [
  {
    nr: 1,
    schluessel: "ziel",
    frage: "Was soll Ihre Wohnung für Sie leisten?",
    warum: "Danach setzen wir die Schwerpunkte in Ihrem Handbuch.",
    antworten: [
      { id: "vermoegen", text: "Vermögen aufbauen" },
      { id: "alter", text: "Fürs Alter vorsorgen" },
      { id: "steuer", text: "Steuerlast senken" },
      { id: "verstehen", text: "Erst einmal verstehen, wie es geht" },
    ],
  },
  {
    nr: 2,
    schluessel: "beruf",
    frage: "Was beschreibt Sie beruflich am besten?",
    warum: "Banken prüfen jede Berufsgruppe anders. Davon hängt ab, welche Unterlagen Sie später brauchen.",
    antworten: [
      { id: "angestellt", text: "Angestellt" },
      { id: "beamter", text: "Beamter oder Beamtin" },
      { id: "selbststaendig", text: "Selbstständig oder freiberuflich" },
      { id: "anderes", text: "Etwas anderes" },
    ],
  },
  {
    nr: 3,
    schluessel: "brutto",
    frage: "Wie hoch ist Ihr Jahresbrutto ungefähr?",
    warum: "Je höher Ihr Steuersatz, desto mehr trägt das Finanzamt mit.",
    antworten: [
      // Stellvertretendes Brutto je Spanne für die Steuerrechnung, siehe
      // BRUTTO_STELLVERTRETER. `wert` ist hier bewusst die Untergrenze.
      { id: "unter_50", text: "unter 50.000 €", wert: 0 },
      { id: "50_80", text: "50.000 bis 80.000 €", wert: 50000 },
      { id: "80_120", text: "80.000 bis 120.000 €", wert: 80000 },
      { id: "ueber_120", text: "über 120.000 €", wert: 120000 },
    ],
  },
  {
    nr: 4,
    schluessel: "ueberschuss",
    frage: "Was bleibt Ihnen im Monat nach allen Fixkosten und Raten?",
    warum: "Für die Bank zählt nicht Ihr Gehalt, sondern was am Monatsende übrig bleibt.",
    antworten: [
      { id: "unter_500", text: "unter 500 €", wert: 0 },
      { id: "500_1000", text: "500 bis 1.000 €", wert: 500 },
      { id: "1000_1500", text: "1.000 bis 1.500 €", wert: 1000 },
      { id: "ueber_1500", text: "über 1.500 €", wert: 1500 },
      // Seit dem 26.09.2026 (Westmont-Analyse, Punkt 3): Wer es nicht genau
      // weiss, bricht sonst hier ab. Gerechnet wird vorsichtig mit der
      // untersten Stufe, die ueberhaupt einen Rahmen ergibt (500 €), und der
      // Ausgang wird nie besser als „vielleicht“, siehe `ermittleAusgang`.
      { id: "unbekannt", text: "Weiß ich nicht genau", wert: UEBERSCHUSS_WENN_UNBEKANNT },
    ],
  },
  {
    nr: 5,
    schluessel: "eigenkapital",
    frage: "Wie viel Eigenkapital könnten Sie einsetzen?",
    warum: "Die Kaufnebenkosten zahlen Sie in der Regel aus eigenen Mitteln.",
    antworten: [
      { id: "unter_10", text: "unter 10.000 €", wert: 0 },
      { id: "10_30", text: "10.000 bis 30.000 €", wert: 10000 },
      { id: "30_60", text: "30.000 bis 60.000 €", wert: 30000 },
      { id: "ueber_60", text: "über 60.000 €", wert: 60000 },
    ],
  },
  {
    nr: 6,
    schluessel: "start",
    frage: "Wann möchten Sie starten?",
    warum: "Damit wir wissen, ob Sie bald Wohnungen sehen wollen oder erst in Ruhe lesen möchten.",
    antworten: [
      { id: "sofort", text: "So bald wie möglich" },
      { id: "drei_monate", text: "In den nächsten drei Monaten" },
      { id: "spaeter", text: "Später in diesem oder im nächsten Jahr" },
      { id: "informieren", text: "Ich informiere mich erst" },
    ],
  },
];

/**
 * Stellvertretendes Jahresbrutto je Spanne für die Steuerrechnung im Handbuch
 * (Strategie, inhalt.py BRUTTO_WERT). Nicht die Untergrenze: Für den
 * Steuersatz ist ein typischer Wert der Spanne aussagekräftiger, und er liegt
 * bei allen vier Spannen im Inneren.
 */
export const BRUTTO_STELLVERTRETER: Record<BruttoId, number> = {
  unter_50: 42000,
  "50_80": 65000,
  "80_120": 100000,
  ueber_120: 140000,
};

/** Mindestwerte für den Ausgang „passt“ (Strategie 3.3). */
export const MINDEST_UEBERSCHUSS = 500;
export const MINDEST_EIGENKAPITAL = 10000;

export type Ausgang = "passt" | "vielleicht" | "noch_nicht";

export const AUSGANG_TEXT: Record<Ausgang, string> = {
  passt: "passt",
  vielleicht: "passt vielleicht",
  noch_nicht: "passt noch nicht",
};

function frageZu(schluessel: FrageSchluessel): Frage {
  const f = FRAGEN.find((x) => x.schluessel === schluessel);
  if (!f) throw new Error(`Unbekannte Frage ${schluessel}`);
  return f;
}

/** Der Text der gewählten Antwort, etwa „500 bis 1.000 €“. */
export function antwortText(schluessel: FrageSchluessel, id: string): string {
  return frageZu(schluessel).antworten.find((a) => a.id === id)?.text ?? "";
}

function rechenwert(schluessel: FrageSchluessel, id: string): number {
  return frageZu(schluessel).antworten.find((a) => a.id === id)?.wert ?? 0;
}

/**
 * Prüft Antworten von außen, etwa aus dem Rumpf von `submit-lead`.
 *
 * Nur die sechs bekannten Schlüssel mit ihren bekannten Werten, sonst `null`.
 * Wer die Anfrage von Hand baut, bekommt damit keinen Freitext in die
 * Datenbank und keinen erfundenen Ausgang.
 */
export function pruefeAntworten(roh: unknown): HandbuchAntworten | null {
  if (!roh || typeof roh !== "object") return null;
  const o = roh as Record<string, unknown>;
  const ergebnis: Record<string, unknown> = {};
  for (const frage of FRAGEN) {
    const wert = o[frage.schluessel];
    if (typeof wert !== "string" || !frage.antworten.some((a) => a.id === wert)) return null;
    ergebnis[frage.schluessel] = wert;
  }
  if (o.gemeinsamVeranlagt === true) ergebnis.gemeinsamVeranlagt = true;
  return ergebnis as unknown as HandbuchAntworten;
}

export interface HandbuchRahmen {
  /** Überschuss im Monat, Untergrenze der Antwort. */
  ueberschuss: number;
  /** Eigenkapital, Untergrenze der Antwort. */
  eigenkapital: number;
  tragbareRate: number;
  maxDarlehen: number;
  /** Empfohlener Rahmen. */
  empf: number;
  von: number;
  bis: number;
}

/** Der Rahmen aus Überschuss und Eigenkapital, mit derselben Formel wie nach der Selbstauskunft. */
export function handbuchRahmen(a: Pick<HandbuchAntworten, "ueberschuss" | "eigenkapital">): HandbuchRahmen {
  const ueberschuss = rechenwert("ueberschuss", a.ueberschuss);
  const eigenkapital = rechenwert("eigenkapital", a.eigenkapital);
  const r = rahmenAusUeberschuss(ueberschuss, eigenkapital);
  const spanne = rahmenSpanne(r.maxDarlehen, eigenkapital);
  return {
    ueberschuss,
    eigenkapital,
    tragbareRate: r.tragbareRate,
    maxDarlehen: r.maxDarlehen,
    empf: r.empfRahmen,
    von: spanne.von,
    bis: spanne.bis,
  };
}

/**
 * Der Ausgang nach Strategie 3.3.
 *
 *   passt        Überschuss ab 500 € und Eigenkapital ab 10.000 €
 *   vielleicht   einer der beiden Werte darunter
 *   noch_nicht   beide darunter, oder kein regelmäßiges Einkommen
 *
 * „Kein regelmäßiges Einkommen“ ist wie im Entwurf (inhalt.py, auswertung)
 * die Kombination „Etwas anderes“ beim Beruf mit einem Überschuss unter
 * 500 €. Die Grenzen schließen niemanden aus, sie steuern nur, wer zuerst
 * angerufen wird. Jeder bekommt sein Handbuch.
 */
export function ermittleAusgang(a: Pick<HandbuchAntworten, "beruf" | "ueberschuss" | "eigenkapital">): Ausgang {
  const ueberschuss = rechenwert("ueberschuss", a.ueberschuss);
  const eigenkapital = rechenwert("eigenkapital", a.eigenkapital);
  let knapp = 0;
  if (ueberschuss < MINDEST_UEBERSCHUSS) knapp += 1;
  if (eigenkapital < MINDEST_EIGENKAPITAL) knapp += 1;
  if (a.beruf === "anderes" && ueberschuss < MINDEST_UEBERSCHUSS) knapp = 2;
  // „Weiß ich nicht genau“: gerechnet wie 500 €, aber allein wegen dieser
  // Antwort nie „passt“. Ohne bekannten Überschuss kann niemand sagen, dass es
  // sicher passt.
  if (a.ueberschuss === "unbekannt" && knapp === 0) knapp = 1;
  if (knapp === 0) return "passt";
  if (knapp === 1) return "vielleicht";
  return "noch_nicht";
}

/** Hat der Besucher bei Frage 4 „Weiß ich nicht genau“ gewählt? */
export function ueberschussUnbekannt(a: Pick<HandbuchAntworten, "ueberschuss">): boolean {
  return a.ueberschuss === "unbekannt";
}

/** Grobe Dringlichkeit für den Vertrieb, wie `leadQuality` beim Steuerrechner. */
export function leadQualitaet(a: HandbuchAntworten): "hoch" | "mittel" | "niedrig" {
  const ausgang = ermittleAusgang(a);
  if (ausgang === "noch_nicht") return "niedrig";
  if (ausgang === "passt" && (a.start === "sofort" || a.start === "drei_monate")) return "hoch";
  return "mittel";
}

function tausend(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * „158.000 bis 222.000 €“. Ohne tragbares Darlehen (Überschuss unter 500 €)
 * sind beide Enden gleich, dann steht nur der eine Betrag da statt
 * „10.000 bis 10.000 €“. Die Formel bleibt dieselbe, nur die Schreibweise.
 */
export function rahmenText(r: Pick<HandbuchRahmen, "von" | "bis">): string {
  if (r.von === r.bis) return `${tausend(r.von)} €`;
  return `${tausend(r.von)} bis ${tausend(r.bis)} €`;
}

/**
 * Die Felder, die am Kontakt landen (Strategie 3.2, Spalte „Feld im CRM“).
 * Klartext statt Kennung, damit sie im Kundenprofil ohne Übersetzung lesbar
 * sind.
 */
export function crmFelder(a: HandbuchAntworten): {
  qualZiel: string;
  qualBeruflicheSituation: string;
  qualEinkommen: string;
  qualEigenkapital: string;
  finanzierbarkeit: string;
} {
  const r = handbuchRahmen(a);
  const ausgang = ermittleAusgang(a);
  return {
    qualZiel: antwortText("ziel", a.ziel),
    qualBeruflicheSituation: antwortText("beruf", a.beruf),
    qualEinkommen: antwortText("brutto", a.brutto),
    qualEigenkapital: antwortText("eigenkapital", a.eigenkapital),
    finanzierbarkeit: `Handbuch: ${AUSGANG_TEXT[ausgang]}, Rahmen ${rahmenText(r)}`,
  };
}

/**
 * Die Notiz am Kontakt, damit der Partner vor dem ersten Anruf lesen kann,
 * was der Interessent angegeben hat. Deutsch, sie geht ins CRM.
 */
export function leadNotiz(a: HandbuchAntworten): string {
  const r = handbuchRahmen(a);
  const ausgang = ermittleAusgang(a);
  const zeilen = [
    "Handbuch-Seite, Antworten im Konfigurator:",
    `Ziel: ${antwortText("ziel", a.ziel)}`,
    `Beruf: ${antwortText("beruf", a.beruf)}`,
    `Jahresbrutto: ${antwortText("brutto", a.brutto)}${a.gemeinsamVeranlagt ? " (gemeinsam veranlagt)" : ""}`,
    `Überschuss im Monat: ${antwortText("ueberschuss", a.ueberschuss)}${a.ueberschuss === "unbekannt" ? ` (gerechnet vorsichtig mit ${tausend(UEBERSCHUSS_WENN_UNBEKANNT)} €)` : ""}`,
    `Eigenkapital: ${antwortText("eigenkapital", a.eigenkapital)}`,
    `Start: ${antwortText("start", a.start)}`,
    `Ausgang: ${AUSGANG_TEXT[ausgang]}. Rahmen als Modellrechnung ${rahmenText(r)}, empfohlen ${tausend(r.empf)} €.`,
  ];
  return zeilen.join("\n");
}

/**
 * Vorbelegung der Selbstauskunft aus den Antworten.
 *
 * Nur, was sich eindeutig übertragen lässt. Die Selbstauskunft kennt heute
 * nur „angestellt“ und „selbstaendig“; Beamte werden deshalb als angestellt
 * vorbelegt und können das im Formular ändern. Ziele werden auf die Liste
 * der Selbstauskunft abgebildet (`src/lib/anlageZiele.ts`).
 */
export function saVorbelegung(a: HandbuchAntworten): Record<string, unknown> {
  const beschaeftigung: Record<BerufId, string> = {
    angestellt: "angestellt",
    beamter: "angestellt",
    selbststaendig: "selbstaendig",
    anderes: "",
  };
  const ziel: Record<ZielId, string | null> = {
    vermoegen: "vermoegen",
    alter: "rente",
    steuer: "steuer",
    verstehen: null,
  };
  const vorbelegung: Record<string, unknown> = {};
  if (beschaeftigung[a.beruf]) vorbelegung.beschaeftigungsart = beschaeftigung[a.beruf];
  const z = ziel[a.ziel];
  if (z) vorbelegung.wuenscheZiele = [z];
  return vorbelegung;
}

/**
 * Ist das eine plausible Telefonnummer? Seit dem 26.09.2026 ist die
 * Handynummer auf der Handbuch-Seite Pflicht (der Berater ruft nach dem
 * Handbuch einmal kurz an). Einfach gehalten: deutsche Schreibweisen wie
 * „0151 2345678“ und „(089) 12 34 56“, internationale mit „+“ oder „00“,
 * zusammen 7 bis 15 Ziffern. Keine Prüfung auf Mobilfunkvorwahlen, sonst
 * scheitert jede ausländische Nummer.
 */
export function istPlausibleTelefonnummer(wert: unknown): boolean {
  if (typeof wert !== "string") return false;
  const kompakt = wert.trim().replace(/[\s()\-/.]/g, "");
  return /^(\+|00)?\d{7,15}$/.test(kompakt);
}

/** Gültigkeit des Handbuch-Links und des Selbstauskunft-Links in Tagen. */
export const HANDBUCH_GUELTIG_TAGE = 30;

/**
 * Die Quelle am Kontakt, seit dem 26.09.2026 „Konfigurator“ (vorher
 * „Handbuch-Seite“). Gilt für den Konfigurator und die offene Selbstauskunft
 * der Handbuch-Seite. Ältere Kontakte tragen noch die alte Bezeichnung,
 * deshalb prüft `istKonfiguratorQuelle` beide.
 */
export const HANDBUCH_QUELLE = "Konfigurator";
export const HANDBUCH_QUELLE_ALT = "Handbuch-Seite";

export function istKonfiguratorQuelle(quelle: unknown): boolean {
  const q = typeof quelle === "string" ? quelle.trim() : "";
  return q === HANDBUCH_QUELLE || q === HANDBUCH_QUELLE_ALT;
}


/** Zufallstoken aus 32 Bytes, als 64 Hexzeichen. */
export function neuesHandbuchToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sieht die Zeichenkette wie ein solches Token aus? */
export function istHandbuchToken(wert: unknown): wert is string {
  return typeof wert === "string" && /^[0-9a-f]{64}$/.test(wert);
}

/**
 * Die Adresse fuer die Bremse der Handbuch-Seite: klein, ohne „+Zusatz“, bei
 * Gmail ohne Punkte. So zaehlt name+1@gmail.com wie name@gmail.com.
 */
export function bremsAdresse(email: string): string {
  const [lokal = "", domain = ""] = email.trim().toLowerCase().split("@");
  let teil = lokal.split("+")[0];
  const d = domain === "googlemail.com" ? "gmail.com" : domain;
  if (d === "gmail.com") teil = teil.replace(/\./g, "");
  return `${teil}@${d}`;
}
