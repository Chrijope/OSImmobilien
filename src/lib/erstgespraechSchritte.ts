/**
 * Das Schrittmodell des Reiters Erstgespräch: ein Punkt oder Abschnitt pro
 * Ansicht.
 *
 * Reihenfolge wie in der Moderation (praesentationsDeck.ts): Teil 1 in
 * Stationsreihenfolge bis Punkt 9 (Einschätzung mit dem Teil-2-Schalter),
 * danach entweder die 16 Abschnitte von Teil 2 in der Dramaturgie des Decks
 * oder, bei ausgeschaltetem Schalter, Punkt 10 (Termin buchen). Ist Teil 2
 * an, entfällt Punkt 10; die Leiste zeigt ihn durchgestrichen.
 *
 * Zustände der Leiste:
 *   erledigt    Teil 1: der Punkt wurde einmal über „Weiter" verlassen oder
 *               das Gespräch ist abgeschlossen. Teil 2: der Abschnitt ist
 *               abgehakt (closingDirekt.abgehakt).
 *   aktuell     der gerade angezeigte Schritt.
 *   angefangen  mindestens ein Feld des Schritts hat Inhalt, aber er wurde
 *               noch nicht verlassen.
 *   offen       nichts davon.
 *
 * Der aktuelle Schritt und die verlassenen Punkte liegen je Bewerber im
 * sessionStorage des Browsers, damit ein Neuladen nicht auf Punkt 1
 * zurückspringt. Bewusst nicht im Skript-Meta: Das ist Bedienzustand, keine
 * Gesprächsinformation, und die gespeicherten Felder bleiben unverändert.
 *
 * Reine Rechnerei ohne Oberfläche, damit sie sich ohne Attrappen prüfen lässt.
 */
import { ASSESSMENT_STATIONEN, type AssessmentAntworten, type AssessmentStation } from "./assessmentSkript";
import { CLOSING_DIREKT_ABSCHNITTE, type ClosingDirektAbschnitt, type ClosingDirektDaten } from "./closingDirektSkript";
import { PRAESENTATIONS_DECK } from "./praesentationsDeck";

export type ErstgespraechSchritt =
  | {
      art: "punkt";
      /** Stabile Kennung, etwa "p5" */
      id: string;
      nummer: number;
      titel: string;
      /** Kurztitel für die Leiste */
      kurz: string;
      station: AssessmentStation;
    }
  | {
      art: "abschnitt";
      /** Stabile Kennung, etwa "a-preis" */
      id: string;
      /** Laufende Nummer im Gesamtskript, 1 bis 16 */
      nummer: number;
      titel: string;
      kurz: string;
      abschnitt: ClosingDirektAbschnitt;
    };

export type SchrittZustand = "erledigt" | "aktuell" | "angefangen" | "offen" | "entfaellt";

export const TEIL_1_ANZAHL = 10;
export const TEIL_2_ANZAHL = CLOSING_DIREKT_ABSCHNITTE.length;

/** Kurztitel der zehn Punkte für die Chips der Leiste. */
const PUNKT_KURZ: Record<number, string> = {
  1: "Einstieg und Rahmen",
  2: "Deine Ausgangslage",
  3: "Profil-Einordnung",
  4: "Ziele",
  5: "Motivation",
  6: "Wer wir sind",
  7: "Konditionen",
  8: "Einwandbehandlung",
  9: "Einschätzung",
  10: "Termin buchen",
};

/** Kurztitel der 16 Abschnitte, damit sie nebeneinander in eine Reihe passen. */
const ABSCHNITT_KURZ: Record<string, string> = {
  einstieg: "Vorschlag",
  einzelkaempfer: "Einzelkampf",
  vision: "Gegenbild",
  werte: "Werte",
  system: "System",
  produkte: "Produkte",
  dealprozess: "Deal",
  partnerstimmen: "Stimmen",
  echterFall: "Echter Fall",
  rechner: "Zahlen",
  zweiWege: "Zwei Wege",
  preis: "Preis",
  erwartungen: "Erwartungen",
  start: "Start",
  entscheidung: "Entscheidung",
  gespraechsabschluss: "Abschluss",
};

/** Mittellange Titel der Abschnitte für die Liste „Wo wir stehen". */
const ABSCHNITT_MITTEL: Record<string, string> = {
  einstieg: "Direktvorschlag",
  einzelkaempfer: "Einzelkämpfer",
  vision: "Gegenbild",
  werte: "Werte",
  system: "System",
  produkte: "Produkte",
  dealprozess: "Deal-Prozess",
  partnerstimmen: "Partnerstimmen",
  echterFall: "Echter Fall",
  rechner: "Deine Zahlen",
  zweiWege: "Zwei Wege",
  preis: "Preis und Paket",
  erwartungen: "Erwartungen",
  start: "Startfahrplan",
  entscheidung: "Entscheidung",
  gespraechsabschluss: "Abschluss",
};

export function punktId(nummer: number): string {
  return `p${nummer}`;
}

export function abschnittId(key: string): string {
  return `a-${key}`;
}

function punktSchritt(station: AssessmentStation): ErstgespraechSchritt {
  return {
    art: "punkt",
    id: punktId(station.nummer),
    nummer: station.nummer,
    titel: station.titel,
    kurz: PUNKT_KURZ[station.nummer] ?? station.kurz,
    station,
  };
}

/**
 * Die 16 Abschnitte in der Reihenfolge des Decks (praesentationsDeck.ts),
 * damit Reiter und Moderation Teil 2 gleich sortieren. Abschnitte ohne
 * Folie im Deck kämen hinten dran, damit nie einer fehlt.
 */
export function teil2Abschnitte(): ClosingDirektAbschnitt[] {
  const sortiert: ClosingDirektAbschnitt[] = [];
  for (const folie of PRAESENTATIONS_DECK.filter((f) => f.teil === 2)) {
    for (const a of CLOSING_DIREKT_ABSCHNITTE) {
      if (a.folieId === folie.id && !sortiert.includes(a)) sortiert.push(a);
    }
  }
  for (const a of CLOSING_DIREKT_ABSCHNITTE) {
    if (!sortiert.includes(a)) sortiert.push(a);
  }
  return sortiert;
}

/** Alle zehn Punkte von Teil 1 als Schritte, unabhängig vom Schalter. */
export function teil1Punkte(): ErstgespraechSchritt[] {
  return [...ASSESSMENT_STATIONEN]
    .sort((a, b) => a.nummer - b.nummer)
    .map(punktSchritt);
}

/**
 * Die Schritte des Reiters: Punkt 1 bis 9, dann bei Schalter an die 16
 * Abschnitte von Teil 2, sonst Punkt 10.
 */
export function baueErstgespraechSchritte(teil2An: boolean): ErstgespraechSchritt[] {
  const punkte = teil1Punkte();
  const bis9 = punkte.filter((p) => p.nummer <= 9);
  if (!teil2An) return punkte;
  const abschnitte = teil2Abschnitte().map((abschnitt, i): ErstgespraechSchritt => ({
    art: "abschnitt",
    id: abschnittId(abschnitt.key),
    nummer: i + 1,
    titel: abschnitt.titel,
    kurz: ABSCHNITT_KURZ[abschnitt.key] ?? abschnitt.titel,
    abschnitt,
  }));
  return [...bis9, ...abschnitte];
}

/** Mittellanger Titel eines Schritts für Listen und Knöpfe. */
export function schrittBezeichnung(s: ErstgespraechSchritt): string {
  return s.art === "punkt"
    ? `Punkt ${s.nummer} · ${s.kurz}`
    : `Abschnitt ${s.nummer} · ${ABSCHNITT_MITTEL[s.abschnitt.key] ?? s.kurz}`;
}

/** Ein Antwortwert zählt, sobald tatsächlich etwas drinsteht. */
export function hatInhalt(v: unknown): boolean {
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return v > 0;
  if (Array.isArray(v)) return v.length > 0;
  return false;
}

/** Die Feld-Keys, die zu einer Station gehören, inklusive ihrer Blöcke. */
export function stationsFeldKeys(station: AssessmentStation): string[] {
  const keys = [
    ...(station.felder ?? []).map((f) => String(f.key)),
    ...(station.bloecke ?? []).flatMap((b) => (b.felder ?? []).map((f) => String(f.key))),
  ];
  // Punkt 3 hat keine festen Felder, dort zählt die Pfadwahl; Punkt 9
  // zusätzlich die Übersteuerung der Empfehlung.
  if (station.key === "profil") keys.push("pfade");
  if (station.key === "einschaetzung") keys.push("empfehlungOverride");
  return keys;
}

export type FelderQuelle = {
  assessment: AssessmentAntworten;
  closingDirekt: ClosingDirektDaten;
  closingDatum: string;
  closingUhrzeit: string;
};

/** Wie viele Felder eines Schritts sind gefüllt, und wie viele gibt es? */
export function felderStand(s: ErstgespraechSchritt, q: FelderQuelle): { erfasst: number; gesamt: number } {
  if (s.art === "abschnitt") {
    const felder = s.abschnitt.felder ?? [];
    const notizen = (q.closingDirekt.notizen ?? {}) as Record<string, unknown>;
    return { erfasst: felder.filter((f) => hatInhalt(notizen[f.key])).length, gesamt: felder.length };
  }
  if (s.station.key === "naechsterSchritt") {
    return {
      erfasst: [q.closingDatum, q.closingUhrzeit].filter((v) => v.trim() !== "").length,
      gesamt: 2,
    };
  }
  const keys = stationsFeldKeys(s.station);
  const werte = q.assessment as Record<string, unknown>;
  return { erfasst: keys.filter((k) => hatInhalt(werte[k])).length, gesamt: keys.length };
}

/** Hat der Schritt schon Inhalt? */
export function istAngefangen(s: ErstgespraechSchritt, q: FelderQuelle): boolean {
  return felderStand(s, q).erfasst > 0;
}

export type ZustandsKontext = FelderQuelle & {
  aktuelleId: string;
  /** Punkte von Teil 1, die über „Weiter" verlassen wurden (Ids) */
  verlassen: string[];
  /** Das Gespräch ist abgeschlossen: Teil 1 gilt komplett als erledigt */
  abgeschlossen: boolean;
};

/** Der Zustand eines Schritts für Leiste und Liste. */
export function schrittZustand(s: ErstgespraechSchritt, k: ZustandsKontext): SchrittZustand {
  if (s.id === k.aktuelleId) return "aktuell";
  if (s.art === "abschnitt") {
    if ((k.closingDirekt.abgehakt ?? []).includes(s.abschnitt.key)) return "erledigt";
  } else if (k.abgeschlossen || k.verlassen.includes(s.id)) {
    return "erledigt";
  }
  return istAngefangen(s, k) ? "angefangen" : "offen";
}

/** Anzahl erledigter Punkte in Teil 1 (ohne den aktuellen), für die Badges. */
export function zaehleErledigt(schritte: ErstgespraechSchritt[], k: ZustandsKontext): { teil1: number; teil2: number } {
  let teil1 = 0;
  let teil2 = 0;
  for (const s of schritte) {
    if (schrittZustand(s, k) !== "erledigt") continue;
    if (s.art === "punkt") teil1 += 1;
    else teil2 += 1;
  }
  return { teil1, teil2 };
}

// ─── Bedienzustand im Browser (sessionStorage) ───

export type SchrittMerker = {
  schrittId?: string;
  verlassen?: string[];
  /** Zeitpunkt (ISO), zu dem im Reiter zum ersten Mal weitergeblättert wurde */
  begonnenAm?: string;
};

export function erstgespraechSchrittKey(bewerberId: string): string {
  return `bewerbung_erstgespraech_schritt_${bewerberId}`;
}

export function leseSchrittMerker(bewerberId: string): SchrittMerker {
  try {
    const raw = sessionStorage.getItem(erstgespraechSchrittKey(bewerberId));
    if (!raw) return {};
    const daten = JSON.parse(raw) as SchrittMerker;
    return {
      schrittId: typeof daten.schrittId === "string" ? daten.schrittId : undefined,
      verlassen: Array.isArray(daten.verlassen) ? daten.verlassen.filter((v) => typeof v === "string") : undefined,
      begonnenAm: typeof daten.begonnenAm === "string" ? daten.begonnenAm : undefined,
    };
  } catch {
    return {};
  }
}

export function schreibeSchrittMerker(bewerberId: string, merker: SchrittMerker): void {
  try {
    sessionStorage.setItem(erstgespraechSchrittKey(bewerberId), JSON.stringify(merker));
  } catch {
    /* privater Modus oder voller Speicher: dann eben ohne Merker */
  }
}

/**
 * Der Schritt, mit dem der Reiter öffnet: der gemerkte, falls er in der
 * Liste noch vorkommt; sonst bei abgeschlossenem Gespräch der letzte Schritt,
 * sonst Punkt 1. Zeigt der Merker auf einen Teil-2-Abschnitt, aber der
 * Schalter ist aus, landet man bei Punkt 9, wo der Schalter sitzt.
 */
export function startSchrittId(
  schritte: ErstgespraechSchritt[],
  gemerkt: string | undefined,
  abgeschlossen: boolean,
): string {
  if (gemerkt && schritte.some((s) => s.id === gemerkt)) return gemerkt;
  if (gemerkt?.startsWith("a-")) return punktId(9);
  if (abgeschlossen) return schritte[schritte.length - 1].id;
  return schritte[0].id;
}
