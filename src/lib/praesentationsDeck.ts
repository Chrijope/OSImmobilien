/**
 * Das Präsentationsdeck für das Bewerbergespräch: 22 Folien, ein Programm.
 *
 *   Teil 1, Kennenlernen (Folie 1 bis 7): handelt nur vom Bewerber. Die
 *     Folien kommen aus dem Erstgesprächsskript (erstgespraechFolien.ts).
 *     Folie 7 ist zugleich die Überleitung zu Teil 2.
 *   Teil 2, Präsentation über uns (Folie 8 bis 22): die bestehende
 *     Closing-Präsentation in ihrer Dramaturgie. Folie 8 ist der Auftakt und
 *     zugleich das Deckblatt, wenn Teil 1 am Telefon lief (Einstieg teil=2).
 *
 * Diese Datei ist die gemeinsame Wahrheit für Präsentation und Moderation:
 * Reihenfolge, Ids, Kopfzeilentitel, Phase, der zugehörige Skript-Abschnitt
 * und die Felder, die die Moderation zu jeder Folie zeigt. Die Präsentation
 * (ClosingPraesentationEntwurf.tsx) rendert entlang dieser Liste, die
 * Moderationsansicht liest dieselbe Liste. Ids sind stabil, Indizes nicht:
 * Alles, was auf eine Folie zeigt, zeigt über die Id.
 *
 * Zwei Einstiegswege (deckFuerEinstieg): ohne Parameter oder mit teil=1 das
 * ganze Deck ab Folie 1, mit teil=2 nur Teil 2 ab Folie 8 mit eigenem Zähler.
 * Der Bewerber sieht nie eine Weiche: Ob Teil 2 direkt folgt oder später,
 * entscheidet die HR-Managerin am Zwischenstopp (ZWISCHENSTOPP).
 */

import { ASSESSMENT_STATIONEN } from "./assessmentSkript";
import { CLOSING_DIREKT_ABSCHNITTE } from "./closingDirektSkript";
import { CLOSING_KENNZAHLEN_GEPFLEGT } from "./closingPraesentationZahlen";
import { ERSTGESPRAECH_FOLIEN } from "./erstgespraechFolien";
import { PARTNERSTIMMEN } from "./partnerstimmen";

export type DeckTeil = 1 | 2;

/** Zugehöriger Skript-Abschnitt: Station in Teil 1, Folie in Teil 2. */
export type DeckSkript =
  | { art: "station"; key: string }
  | { art: "closing"; folieId: string };

/**
 * Sprechtext aus Teil 1, der im Deck-Modus erst auf einer Teil-2-Folie
 * gesprochen wird (Station 6 und der Verdienst-Block von Station 7). Am
 * Telefon bleiben sie, wo sie sind.
 */
export type DeckErgaenzung = {
  stationKey: string;
  /** Indizes in station.sprechtexte */
  sprechtexte?: number[];
  /** Key eines Blocks in station.bloecke */
  block?: string;
};

export type DeckFolie = {
  id: string;
  teil: DeckTeil;
  /** Titel in der Kopfzeile der Präsentation */
  titel: string;
  /** Drehbuch-Phase, in der Kopfzeile mit Teil-Präfix (nur beim ganzen Deck) */
  phase: string;
  skript: DeckSkript;
  /**
   * Felder, die die Moderation zu dieser Folie zeigt: Keys aus
   * AssessmentAntworten (Teil 1) oder ClosingDirektNotizen (Teil 2).
   * Spezialblöcke wie Paketwahl oder Entscheidung stehen am Abschnitt selbst
   * (ClosingDirektAbschnitt.spezial), nicht hier.
   */
  felder: string[];
  /** Zusätzlich die Vertiefungsfelder des gewählten Pfads (nur Profil-Folie) */
  pfadVertiefung?: boolean;
  ergaenzung?: DeckErgaenzung;
  /** Die Folie erscheint nur, wenn die Daten dazu gepflegt sind */
  bedingung?: "partnerstimmen" | "kennzahlen";
};

/** Feld-Keys einer Station, wahlweise nur eines Blocks. */
function stationsFelder(key: string, block?: string): string[] {
  const s = ASSESSMENT_STATIONEN.find((st) => st.key === key);
  if (!s) return [];
  if (block) return (s.bloecke ?? []).find((b) => b.key === block)?.felder?.map((f) => f.key) ?? [];
  return [
    ...(s.felder ?? []).map((f) => f.key),
    ...(s.bloecke ?? []).flatMap((b) => (b.felder ?? []).map((f) => f.key)),
  ];
}

/** Notizfelder aller Closing-Abschnitte zu einer Folie. */
function closingFelder(folieId: string): string[] {
  return CLOSING_DIREKT_ABSCHNITTE
    .filter((a) => a.folieId === folieId)
    .flatMap((a) => (a.felder ?? []).map((f) => f.key));
}

/**
 * Teil 1 kommt aus dem Erstgesprächsskript, in Stationsreihenfolge. Die
 * Profil-Folie zeigt in der Moderation die Pfadwahl plus die Vertiefung des
 * gewählten Pfads; die Machbarkeits-Folie nur den Block Formales, denn die
 * Provision aus dem Block Verdienst gehört im Deck zu Folie Zwei Wege.
 */
const TEIL_1: DeckFolie[] = ERSTGESPRAECH_FOLIEN.map((f) => {
  const profil = f.stationKey === "profil";
  const machbarkeit = f.stationKey === "konditionen";
  return {
    id: f.id,
    teil: 1,
    titel: f.folie.kopfzeile,
    phase: "Kennenlernen",
    skript: { art: "station", key: f.stationKey },
    felder: profil ? ["pfade"] : stationsFelder(f.stationKey, machbarkeit ? "formales" : undefined),
    ...(profil ? { pfadVertiefung: true } : {}),
  };
});

type Teil2Eintrag = Pick<DeckFolie, "id" | "titel" | "phase"> &
  Partial<Pick<DeckFolie, "ergaenzung" | "bedingung">>;

/**
 * Teil 2 in der Dramaturgie des Drehbuchs: Identifikation, Vision, System,
 * Warum OS Immobilien, wirtschaftliche Chance, Entscheidung. Die Ids sind die
 * folieIds aus closingDirektSkript.ts. Nicht umsortieren ohne Grund.
 */
const TEIL_2_EINTRAEGE: Teil2Eintrag[] = [
  { id: "cover", titel: "Persönliches Gespräch", phase: "Identifikation" },
  { id: "chaos", titel: "Chaos gegen System", phase: "Identifikation" },
  { id: "vision", titel: "Du machst Vertrieb, wir den Rest", phase: "Vision" },
  { id: "werte", titel: "Wofür wir stehen", phase: "Vision" },
  {
    id: "system", titel: "Das OS Immobilien System", phase: "System",
    // Sprechtext 3 von Station 6 ("du bekommst ein komplettes System") passt
    // hierher, dazu die Notiz Reaktion der Station.
    ergaenzung: { stationKey: "werWirSind", sprechtexte: [2] },
  },
  {
    id: "objekte-standorte", titel: "Produkte und Standorte", phase: "System",
    // Sprechtexte 1 und 2 von Station 6: wer wir sind, Zielgruppe, Objekte.
    ergaenzung: { stationKey: "werWirSind", sprechtexte: [0, 1] },
  },
  { id: "dealprozess", titel: "Vom Kunden zur Provision", phase: "System" },
  { id: "partnerstimmen", titel: "Partnerstimmen", phase: "Warum OS Immobilien", bedingung: "partnerstimmen" },
  { id: "zahlen", titel: "OS Immobilien in Zahlen", phase: "Warum OS Immobilien", bedingung: "kennzahlen" },
  { id: "echter-fall", titel: "Ein echter Deal", phase: "Wirtschaftliche Chance" },
  { id: "rechner", titel: "Deine Zahlen", phase: "Wirtschaftliche Chance" },
  {
    id: "zwei-wege", titel: "Zwei Wege, ein Satz", phase: "Wirtschaftliche Chance",
    // Der Verdienst-Block von Station 7 (4 Prozent, Beispielrechnung).
    ergaenzung: { stationKey: "konditionen", block: "verdienst" },
  },
  { id: "preis", titel: "Was es kostet", phase: "Wirtschaftliche Chance" },
  { id: "selbstcheck", titel: "Passt das zu dir?", phase: "Deine Entscheidung" },
  { id: "start", titel: "Dein Start", phase: "Deine Entscheidung" },
  { id: "abschluss", titel: "Dein nächster Schritt", phase: "Deine Entscheidung" },
];

const TEIL_2: DeckFolie[] = TEIL_2_EINTRAEGE.map((e) => ({
  ...e,
  teil: 2,
  skript: { art: "closing", folieId: e.id },
  felder: [
    ...closingFelder(e.id),
    ...(e.ergaenzung ? stationsFelder(e.ergaenzung.stationKey, e.ergaenzung.block) : []),
  ],
}));

/** Alle Folien samt der bedingten, in Reihenfolge. */
export const PRAESENTATIONS_DECK: DeckFolie[] = [...TEIL_1, ...TEIL_2];

/** Id der ersten Folie von Teil 2, der Einstiegspunkt bei teil=2. */
export const TEIL_2_START_ID = "cover";

/**
 * Der Zwischenstopp nach der letzten Teil-1-Folie: Einschätzung (Punkt 9)
 * und der Schalter "Teil 2 jetzt direkt anschließen". Keine Folie, nur in
 * der Moderation sichtbar. Bei Schalter aus folgen die Terminfelder aus
 * Punkt 10 (Termin buchen), Teil 2 läuft dann später mit teil=2.
 */
export const ZWISCHENSTOPP = {
  nachFolieId: "einwaende",
  einschaetzung: { art: "station", key: "einschaetzung" } as DeckSkript,
  terminbuchung: { art: "station", key: "naechsterSchritt" } as DeckSkript,
  felder: [...stationsFelder("einschaetzung"), "empfehlungOverride"],
} as const;

function istSichtbar(f: DeckFolie): boolean {
  if (f.bedingung === "partnerstimmen") return PARTNERSTIMMEN.length > 0;
  if (f.bedingung === "kennzahlen") return CLOSING_KENNZAHLEN_GEPFLEGT.length > 0;
  return true;
}

/** Das Deck ohne die Folien, deren Daten nicht gepflegt sind. */
export function aktivesDeck(): DeckFolie[] {
  return PRAESENTATIONS_DECK.filter(istSichtbar);
}

/**
 * Liest den URL-Parameter teil. Alles außer "2" ist das ganze Deck; ein
 * fehlender oder unbekannter Wert darf die Präsentation nie leer lassen.
 */
export function leseTeil(wert: string | null | undefined): DeckTeil {
  return (wert ?? "").trim() === "2" ? 2 : 1;
}

/**
 * Die Folien für einen Einstiegsweg: teil=1 das ganze Deck ab Folie 1,
 * teil=2 nur Teil 2 ab Folie 8. Bei teil=2 sind die Teil-1-Folien nicht im
 * Deck, also auch nicht per Zurück erreichbar, und der Zähler beginnt bei 1.
 */
export function deckFuerEinstieg(teil: DeckTeil): DeckFolie[] {
  const alle = aktivesDeck();
  return teil === 2 ? alle.filter((f) => f.teil === 2) : alle;
}

export function getDeckFolie(id: string): DeckFolie | null {
  return PRAESENTATIONS_DECK.find((f) => f.id === id) ?? null;
}

/**
 * Ein Schritt der Moderationsansicht: entweder eine Folie des Decks oder der
 * Zwischenstopp, der keine Folie hat.
 */
export type ModerationsSchritt =
  | { art: "folie"; folie: DeckFolie }
  | { art: "zwischenstopp" };

/**
 * Die Schritte der Moderation für einen Einstiegsweg.
 *
 * teil=1: die Teil-1-Folien, nach der Folie "einwaende" der Zwischenstopp
 * (Einschätzung und Schalter). Ist der Schalter "Teil 2 jetzt direkt
 * anschließen" gesetzt, folgen die Teil-2-Folien; sonst endet die Moderation
 * am Zwischenstopp, Teil 2 läuft später mit teil=2.
 * teil=2: nur die Teil-2-Folien, ohne Zwischenstopp, denn Teil 1 lief am
 * Telefon und die Einschätzung steht bereits.
 */
export function baueModerationsSchritte(teil: DeckTeil, teil2Direkt: boolean): ModerationsSchritt[] {
  const folien = deckFuerEinstieg(teil);
  if (teil === 2) return folien.map((folie) => ({ art: "folie", folie }));
  const schritte: ModerationsSchritt[] = [];
  for (const folie of folien) {
    if (folie.teil === 2 && !teil2Direkt) break;
    schritte.push({ art: "folie", folie });
    if (folie.id === ZWISCHENSTOPP.nachFolieId) schritte.push({ art: "zwischenstopp" });
  }
  return schritte;
}

/**
 * Die Folie, die die Präsentation zu einem Moderationsschritt zeigt. Am
 * Zwischenstopp bleibt sie auf der letzten Teil-1-Folie stehen, der
 * Bewerber sieht von der Einschätzung nichts.
 */
export function sichtbareFolieId(schritt: ModerationsSchritt): string {
  return schritt.art === "folie" ? schritt.folie.id : ZWISCHENSTOPP.nachFolieId;
}
