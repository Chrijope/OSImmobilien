/**
 * Die Strecke des oeffentlichen Steuerrechners.
 *
 * Hier stehen die Antworten des Interessenten und die Regeln darueber, nicht
 * aber die Rechnung. Gerechnet wird ausschliesslich in `steuerRechner.ts`.
 * Diese Datei uebersetzt nur die Antworten in dessen Eingaben.
 *
 * Warum eine eigene Datei und nicht alles in der Komponente: Die Reihenfolge
 * der Ansichten, die Zahl der Schritte und die Uebersetzung in den Rechenkern
 * sind pruefbare Regeln. In einer Komponente waeren sie es nicht.
 */
import { KAUFNEBENKOSTEN_HOECHSTSATZ } from "@/lib/grunderwerbsteuer";
import {
  BESCHAEFTIGUNGEN,
  BESCHAEFTIGUNG_STANDARD,
  VERANLAGUNG,
  partnerBruttoVorschlag,
  type Beschaeftigung,
  type BeschaeftigungId,
  type Hebelziel,
  type SteuerEingaben,
  type Steuerklasse,
} from "@/lib/steuerRechner";

/* ── Der Regler fuer das Einkommen ──────────────────────────────────────────
 * Er beginnt bei 40.000 Euro und endet bei 250.000. Bewusst OHNE Sperre nach
 * unten: Ein Regler, der einen Wert zulaesst und danach das Ergebnis
 * verweigert, ist eine Sackgasse. Wer weniger verdient, bekommt hier trotzdem
 * eine Antwort, nur eben eine andere Objektklasse. Genau dafuer waehlt
 * `empfohleneKlasse` unterhalb von 70.000 Euro den sanierten Bestand.
 *
 * Warum 40.000 als Anfang: Darunter traegt eine Kapitalanlage-Immobilie sich
 * rechnerisch kaum noch, der Hebel ist zu klein, und ein Ergebnis waere zwar
 * korrekt, aber nicht ehrlich verwertbar. Der Anfang des Reglers sagt das,
 * ohne jemanden vor eine verschlossene Tuer zu setzen.
 */
export const EINKOMMEN_MIN = 40000;
export const EINKOMMEN_MAX = 250000;
export const EINKOMMEN_SCHRITT = 1000;
export const EINKOMMEN_START = 85000;

/** Auf den erlaubten Bereich begrenzen. */
export function begrenzeEinkommen(wert: number): number {
  if (!Number.isFinite(wert)) return EINKOMMEN_MIN;
  return Math.min(EINKOMMEN_MAX, Math.max(EINKOMMEN_MIN, Math.round(wert)));
}

/* ── Der Startzeitpunkt ─────────────────────────────────────────────────────
 * Die letzte Frage vor dem Formular. Sie qualifiziert den Lead und senkt
 * zugleich den Abbruch, weil der Interessent schon eine kleine Vorleistung
 * erbracht hat, bevor er nach seinem Namen gefragt wird.
 */
export type StartzeitpunktId = "sofort" | "zwoelf_monate" | "irgendwann" | "neugier";

export interface Startzeitpunkt {
  id: StartzeitpunktId;
  titel: string;
  unterzeile: string;
}

export const STARTZEITPUNKTE: Startzeitpunkt[] = [
  {
    id: "sofort",
    titel: "So bald wie möglich",
    unterzeile: "Du willst das Thema jetzt angehen und suchst einen Ansprechpartner.",
  },
  {
    id: "zwoelf_monate",
    titel: "In den nächsten zwölf Monaten",
    unterzeile: "Der Entschluss steht, der Zeitpunkt noch nicht.",
  },
  {
    id: "irgendwann",
    titel: "Irgendwann",
    unterzeile: "Du sammelst Wissen und willst erst einmal verstehen, worum es geht.",
  },
  {
    id: "neugier",
    titel: "Nur aus Neugier",
    unterzeile: "Du willst die Zahl sehen, mehr zunächst nicht.",
  },
];

export function startzeitpunktTitel(id: StartzeitpunktId): string {
  return STARTZEITPUNKTE.find((s) => s.id === id)?.titel ?? "";
}

/* ── Die Antworten ──────────────────────────────────────────────────────── */

export interface SteuerAntworten {
  jahresbrutto: number;
  /**
   * Beschaeftigungsverhaeltnis. `null` heisst: noch nicht beantwortet. Es gibt
   * bewusst KEINE Vorbelegung, sonst waere die Antwort des Interessenten von
   * der Voreinstellung nicht zu unterscheiden.
   */
  beschaeftigung: BeschaeftigungId | null;
  steuerklasse: Steuerklasse;
  /** `null` heisst: der Vorschlag aus der Steuerklasse gilt unveraendert. */
  partnerBrutto: number | null;
  kinder: number;
  bundesland: string;
  kirchensteuer: boolean;
  bestehendeImmobilien: number;
  hebelziel: Hebelziel;
  startzeitpunkt: StartzeitpunktId | null;
}

export function standardAntworten(): SteuerAntworten {
  return {
    jahresbrutto: EINKOMMEN_START,
    beschaeftigung: null,
    steuerklasse: "I",
    partnerBrutto: null,
    kinder: 0,
    bundesland: "",
    kirchensteuer: false,
    bestehendeImmobilien: 0,
    hebelziel: "maximal",
    startzeitpunkt: null,
  };
}

/** Wird gemeinsam veranlagt, ist also das Einkommen des Partners noetig? */
export function brauchtPartnereinkommen(a: SteuerAntworten): boolean {
  return VERANLAGUNG[a.steuerklasse] === "splitting";
}

/** Das angesetzte Partnereinkommen, mit dem Vorschlag als Rueckfall. */
export function partnereinkommen(a: SteuerAntworten): number {
  if (!brauchtPartnereinkommen(a)) return 0;
  if (a.partnerBrutto === null) {
    return Math.round(partnerBruttoVorschlag(a.jahresbrutto, a.steuerklasse));
  }
  return Math.max(0, a.partnerBrutto);
}

/**
 * Uebersetzt die Antworten in die Eingaben des Rechenkerns.
 *
 * ZWEI BUNDESLAENDER, EIN FELD: Am Bundesland haengen zwei Dinge, und sie
 * meinen nicht dasselbe Land. Die Kirchensteuer richtet sich nach dem
 * WOHNSITZ, die Grunderwerbsteuer nach der LAGE der Immobilie. Wer in Hamburg
 * wohnt und in Magdeburg kauft, zahlt Kirchensteuer nach Hamburg und
 * Grunderwerbsteuer nach Sachsen-Anhalt. Die Strecke fragt deshalb nur noch
 * den Wohnsitz, denn nur er ist an dieser Stelle ueberhaupt bekannt, und setzt
 * die Kaufnebenkosten fest mit dem Hoechstsatz an. Auf der Seite steht, dass
 * mit dem Hoechstsatz gerechnet wird und der Einsatz je nach Lage niedriger
 * ausfaellt.
 */
export function zuEingaben(a: SteuerAntworten): SteuerEingaben {
  return {
    jahresbrutto: begrenzeEinkommen(a.jahresbrutto),
    steuerklasse: a.steuerklasse,
    partnerBrutto: partnereinkommen(a),
    kinder: a.kinder,
    kirchensteuer: a.kirchensteuer,
    bundesland: a.bundesland || undefined,
    nebenkostenProzentVorgabe: KAUFNEBENKOSTEN_HOECHSTSATZ,
    bestehendeImmobilien: a.bestehendeImmobilien,
    hebelziel: a.hebelziel,
    beschaeftigung: a.beschaeftigung ?? BESCHAEFTIGUNG_STANDARD,
  };
}

/** Die Reihenfolge der Antwortmoeglichkeiten in der Oberflaeche. */
export const BESCHAEFTIGUNG_AUSWAHL: Beschaeftigung[] = [
  BESCHAEFTIGUNGEN.angestellt,
  BESCHAEFTIGUNGEN.freiberuflich,
  BESCHAEFTIGUNGEN.selbststaendig,
  BESCHAEFTIGUNGEN.gmbh_gf,
  BESCHAEFTIGUNGEN.beamter,
];

/* ── Die Ansichten ──────────────────────────────────────────────────────── */

export type SchrittId =
  | "einkommen"
  | "beschaeftigung"
  | "steuerklasse"
  | "partner"
  | "kinder"
  | "wohnort"
  | "bestand"
  | "zeitpunkt";

/**
 * Aus welchen Ansichten besteht die Strecke, in dieser Reihenfolge?
 *
 * Die Partnerfrage erscheint nur bei Zusammenveranlagung. Sie ist keine
 * Zierde: Beim Ehegattensplitting rechnet der Kern die Steuer beider Partner
 * zusammen, ohne das zweite Gehalt waere das Ergebnis schlicht falsch.
 * Umgekehrt gilt der Grundsatz genauso: Was nicht ausgewertet wird, wird auch
 * nicht gefragt.
 */
export function schritte(a: SteuerAntworten): SchrittId[] {
  const alle: SchrittId[] = [
    "einkommen",
    "beschaeftigung",
    "steuerklasse",
    "partner",
    "kinder",
    "wohnort",
    "bestand",
    "zeitpunkt",
  ];
  return alle.filter((s) => s !== "partner" || brauchtPartnereinkommen(a));
}

/**
 * Ist die Ansicht beantwortet, darf es also weitergehen?
 *
 * Der Wohnort ist nur dann Pflicht, wenn Kirchensteuer angehakt ist. Dann
 * entscheidet er ueber 8 oder 9 Prozent und aendert das Ergebnis wirklich.
 * Ohne Kirchensteuer aendert er gar nichts mehr, seit die Kaufnebenkosten fest
 * mit dem Hoechstsatz angesetzt werden. Eine Pflichtangabe ohne Wirkung waere
 * an dieser Stelle nur eine Huerde vor dem Ergebnis.
 */
export function schrittBeantwortet(schritt: SchrittId, a: SteuerAntworten): boolean {
  if (schritt === "zeitpunkt") return a.startzeitpunkt !== null;
  if (schritt === "beschaeftigung") return a.beschaeftigung !== null;
  if (schritt === "partner") return partnereinkommen(a) >= 0;
  if (schritt === "wohnort") return !a.kirchensteuer || a.bundesland !== "";
  return true;
}
