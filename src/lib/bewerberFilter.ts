import type { VorabEinstufung } from "./bewerberVorabScore";

/**
 * Die Filter über der Bewerberliste, als reine Rechenregeln.
 *
 * ## Warum es diese Datei gibt
 *
 * Im Eingang stehen dreistellig viele Bewerber. Die eine Frage, die dort
 * zählt, lautet: Wen rufe ich als Nächstes an? Die Suche beantwortet sie
 * nicht, denn sie sucht nach einem Namen, den man schon kennt. Gebraucht wird
 * das Gegenteil, nämlich eine Auswahl nach Merkmalen: Wer hat den
 * Kennenlernbogen ausgefüllt, wer nicht, wer ist ein A, wer kam diese Woche
 * herein, und wer hat die Eingangsmail überhaupt bekommen.
 *
 * Die Regeln stehen hier und nicht in der Seite, aus demselben Grund wie bei
 * `bewerberSpalten.ts`: `BewerberArbeitsplatz.tsx` ist knapp dreitausend
 * Zeilen lang, und was dort im JSX steht, kann kein Test lesen. Hier lässt
 * sich jede einzelne Regel prüfen, ohne React und ohne Supabase.
 *
 * ## Die Trennung der beiden Bögen
 *
 * `bewerber_formular` trägt beide Bögen in derselben Tabelle: den früheren
 * Vorabbogen und das aktuelle Kennenlernen. Für den Filter „Kennenlernbogen
 * ausgefüllt" zählt ausschließlich das Kennenlernen. Ein eingereichter
 * Vorabbogen ist ausdrücklich **nicht** ausgefüllt, sonst verschwände genau
 * der Bewerber aus der Liste der Offenen, der den neuen Bogen noch braucht.
 * Erkannt wird die Zeile in `kennenlernenLink.ts`, die Seite reicht das
 * Ergebnis hier nur noch als `kennenlernbogenAusgefuellt` herein.
 *
 * ## Alles wirkt zusammen
 *
 * Jeder gesetzte Filter verengt die Auswahl weiter, und die Suche über der
 * Liste wirkt zusätzlich. Ein Bewerber muss also jede einzelne Bedingung
 * erfüllen, nicht irgendeine.
 */

/** Kennenlernbogen: alle, ausgefüllt, noch offen. */
export type BogenFilter = "alle" | "ausgefuellt" | "offen";
/** Vorabscore: alle, eine der drei Einstufungen, oder noch kein Score. */
export type ScoreFilter = "alle" | "A" | "B" | "C" | "ohne";
/** Eingegangen am: Schnellauswahl oder ein selbst gesetzter Zeitraum. */
export type ZeitraumFilter = "alle" | "heute" | "7tage" | "30tage" | "eigen";
/** Eingangsmail: alle, verschickt, fehlt. */
export type MailFilter = "alle" | "verschickt" | "fehlt";

/** Der Wert, der in Quelle und Stelle „ohne Angabe" bedeutet. */
export const OHNE_ANGABE = "__ohne__";

export type BewerberFilter = {
  bogen: BogenFilter;
  score: ScoreFilter;
  zeitraum: ZeitraumFilter;
  /** Eigener Zeitraum, von. Tagesgenau als `JJJJ-MM-TT`, leer heißt offen. */
  von: string;
  /** Eigener Zeitraum, bis. Tagesgenau als `JJJJ-MM-TT`, leer heißt offen. */
  bis: string;
  mail: MailFilter;
  /** `alle`, ein Quellenname, oder `OHNE_ANGABE`. */
  quelle: string;
  /** `alle`, ein Stellentitel, oder `OHNE_ANGABE`. */
  stelle: string;
};

/** Nichts eingeschränkt. Dieser Zustand zeigt alle Bewerber. */
export const FILTER_STANDARD: BewerberFilter = {
  bogen: "alle",
  score: "alle",
  zeitraum: "alle",
  von: "",
  bis: "",
  mail: "alle",
  quelle: "alle",
  stelle: "alle",
};

/**
 * Die Angaben eines Bewerbers, auf die der Filter schaut.
 *
 * Bewusst ein eigener, kleiner Typ und nicht der ganze `Bewerber`: Zwei der
 * sechs Angaben stehen gar nicht am Bewerber, sondern kommen aus
 * `bewerber_formular`. Die Seite setzt die Zeile einmal zusammen, hier wird
 * nur noch verglichen.
 */
export type FilterBewerber = {
  id: string;
  /** Eingangs- beziehungsweise Erstellungsdatum, ISO. */
  erstelltAm?: string;
  /** Der aktuelle Kennenlernbogen ist eingereicht. Ein Vorabbogen zählt nicht. */
  kennenlernbogenAusgefuellt: boolean;
  /** Einstufung aus dem Vorabscore, oder nichts, solange kein Bogen vorliegt. */
  einstufung?: VorabEinstufung | null;
  /** Es ging nachweislich eine Mail mit einem Bogen hinaus. */
  eingangsmailVerschickt: boolean;
  /** Woher die Bewerbung kam, etwa Website, Zapier oder von Hand erfasst. */
  quelle?: string;
  /** Titel der beworbenen Stelle. */
  stelleTitel?: string;
};

/** Ein Tag als `JJJJ-MM-TT`, in der Zeitzone des Betrachters. */
function tagVon(datum: Date): string {
  const monat = String(datum.getMonth() + 1).padStart(2, "0");
  const tag = String(datum.getDate()).padStart(2, "0");
  return `${datum.getFullYear()}-${monat}-${tag}`;
}

/**
 * Der Tag eines ISO-Zeitpunkts, oder `null`, wenn nichts Lesbares dasteht.
 *
 * Verglichen werden Tage und keine Zeitpunkte: „heute" meint den Kalendertag
 * und nicht die letzten 24 Stunden.
 */
function tagAusIso(iso?: string | null): string | null {
  const roh = (iso || "").trim();
  if (!roh) return null;
  const datum = new Date(roh);
  return Number.isNaN(datum.getTime()) ? null : tagVon(datum);
}

/** Derselbe Tag, um `abstand` Tage nach hinten verschoben. */
function tagMinus(heute: Date, abstand: number): string {
  const verschoben = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() - abstand);
  return tagVon(verschoben);
}

/**
 * Passt das Eingangsdatum in den gewählten Zeitraum?
 *
 * Ohne lesbares Datum passt der Bewerber in keinen gesetzten Zeitraum. Das ist
 * Absicht: Ein fehlendes Datum ist keine Antwort auf „letzte sieben Tage", und
 * ein stiller Treffer wäre irreführend.
 */
function passtZeitraum(bewerber: FilterBewerber, filter: BewerberFilter, heute: Date): boolean {
  if (filter.zeitraum === "alle") return true;
  const tag = tagAusIso(bewerber.erstelltAm);
  if (!tag) return false;
  if (filter.zeitraum === "heute") return tag === tagVon(heute);
  // Sieben Tage heißt heute und die sechs davor, sonst wären es acht.
  if (filter.zeitraum === "7tage") return tag >= tagMinus(heute, 6);
  if (filter.zeitraum === "30tage") return tag >= tagMinus(heute, 29);
  const von = filter.von.trim();
  const bis = filter.bis.trim();
  if (von && tag < von) return false;
  if (bis && tag > bis) return false;
  return true;
}

/** Ein Textfeld des Bewerbers gegen eine Auswahl halten. */
function passtText(wert: string | undefined, auswahl: string): boolean {
  if (auswahl === "alle") return true;
  const roh = (wert || "").trim();
  if (auswahl === OHNE_ANGABE) return roh === "";
  return roh === auswahl;
}

/**
 * Erfüllt dieser Bewerber alle gesetzten Filter?
 *
 * `heute` steht ausdrücklich in der Liste der Angaben und wird nicht hier
 * geholt: Sonst ließe sich der Zeitraum nicht prüfen.
 */
export function passtZumFilter(
  bewerber: FilterBewerber,
  filter: BewerberFilter,
  heute: Date = new Date(),
): boolean {
  if (filter.bogen === "ausgefuellt" && !bewerber.kennenlernbogenAusgefuellt) return false;
  if (filter.bogen === "offen" && bewerber.kennenlernbogenAusgefuellt) return false;

  if (filter.score === "ohne" && bewerber.einstufung) return false;
  if (filter.score !== "alle" && filter.score !== "ohne" && bewerber.einstufung !== filter.score) {
    return false;
  }

  if (filter.mail === "verschickt" && !bewerber.eingangsmailVerschickt) return false;
  if (filter.mail === "fehlt" && bewerber.eingangsmailVerschickt) return false;

  if (!passtZeitraum(bewerber, filter, heute)) return false;
  if (!passtText(bewerber.quelle, filter.quelle)) return false;
  if (!passtText(bewerber.stelleTitel, filter.stelle)) return false;
  return true;
}

/** Schränkt gerade irgendein Filter die Liste ein? */
export function istFilterGesetzt(filter: BewerberFilter): boolean {
  return (
    filter.bogen !== "alle"
    || filter.score !== "alle"
    || filter.zeitraum !== "alle"
    || filter.mail !== "alle"
    || filter.quelle !== "alle"
    || filter.stelle !== "alle"
  );
}

/** Die Felder, die ein Chip einzeln zurücknehmen kann. */
export type FilterFeld = "bogen" | "score" | "zeitraum" | "mail" | "quelle" | "stelle";

export const BOGEN_LABELS: Record<BogenFilter, string> = {
  alle: "Kennenlernbogen: alle",
  ausgefuellt: "Bogen ausgefüllt",
  offen: "Bogen noch offen",
};

export const SCORE_LABELS: Record<ScoreFilter, string> = {
  alle: "Vorabscore: alle",
  A: "Score A",
  B: "Score B",
  C: "Score C",
  ohne: "noch kein Score",
};

export const ZEITRAUM_LABELS: Record<ZeitraumFilter, string> = {
  alle: "Eingang: alle",
  heute: "heute eingegangen",
  "7tage": "letzte 7 Tage",
  "30tage": "letzte 30 Tage",
  eigen: "eigener Zeitraum",
};

export const MAIL_LABELS: Record<MailFilter, string> = {
  alle: "Eingangsmail: alle",
  verschickt: "Eingangsmail verschickt",
  fehlt: "Eingangsmail fehlt",
};

/** Ein gesetzter Filter, wie er als Chip über der Liste steht. */
export type FilterChip = { feld: FilterFeld; text: string };

/** Ein Tag als `12.9.2026`, für die Chips. */
function tagLesbar(tag: string): string {
  const datum = new Date(`${tag}T12:00:00`);
  return Number.isNaN(datum.getTime()) ? tag : datum.toLocaleDateString("de-DE");
}

/** Was gerade eingeschränkt ist, in Worten. Leer, wenn nichts gesetzt ist. */
export function filterChips(filter: BewerberFilter): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filter.bogen !== "alle") chips.push({ feld: "bogen", text: BOGEN_LABELS[filter.bogen] });
  if (filter.score !== "alle") chips.push({ feld: "score", text: SCORE_LABELS[filter.score] });
  if (filter.zeitraum !== "alle") {
    const eigen = [
      filter.von ? `ab ${tagLesbar(filter.von)}` : "",
      filter.bis ? `bis ${tagLesbar(filter.bis)}` : "",
    ].filter(Boolean).join(" ");
    const text = filter.zeitraum === "eigen" && eigen ? eigen : ZEITRAUM_LABELS[filter.zeitraum];
    chips.push({ feld: "zeitraum", text });
  }
  if (filter.mail !== "alle") chips.push({ feld: "mail", text: MAIL_LABELS[filter.mail] });
  if (filter.quelle !== "alle") {
    chips.push({ feld: "quelle", text: filter.quelle === OHNE_ANGABE ? "Quelle fehlt" : `Quelle: ${filter.quelle}` });
  }
  if (filter.stelle !== "alle") {
    chips.push({ feld: "stelle", text: filter.stelle === OHNE_ANGABE ? "Stelle fehlt" : `Stelle: ${filter.stelle}` });
  }
  return chips;
}

/** Ein einzelnes Feld auf „alle" zurücksetzen, der Rest bleibt stehen. */
export function ohneFeld(filter: BewerberFilter, feld: FilterFeld): BewerberFilter {
  if (feld === "zeitraum") return { ...filter, zeitraum: "alle", von: "", bis: "" };
  return { ...filter, [feld]: "alle" };
}

/**
 * Die Zählungen je Filterwert.
 *
 * Gezählt wird je Feld so, als stünde genau dieses Feld auf dem jeweiligen
 * Wert und alle anderen blieben, wie sie sind. Die Zahl neben einer Auswahl
 * sagt damit voraus, was ein Klick darauf ergäbe, und nicht bloß, wie viele
 * Bewerber es insgesamt gibt.
 */
export type FilterZaehlung = {
  bogen: Record<BogenFilter, number>;
  score: Record<ScoreFilter, number>;
  zeitraum: Record<ZeitraumFilter, number>;
  mail: Record<MailFilter, number>;
  quelle: Record<string, number>;
  stelle: Record<string, number>;
  /** Wie viele Bewerber der Filter gerade zeigt. */
  gezeigt: number;
  /** Wie viele es ohne jeden Filter wären. */
  gesamt: number;
};

const BOGEN_WERTE: BogenFilter[] = ["alle", "ausgefuellt", "offen"];
const SCORE_WERTE: ScoreFilter[] = ["alle", "A", "B", "C", "ohne"];
const ZEITRAUM_WERTE: ZeitraumFilter[] = ["alle", "heute", "7tage", "30tage", "eigen"];
const MAIL_WERTE: MailFilter[] = ["alle", "verschickt", "fehlt"];

function zaehleFeld<T extends string>(
  liste: readonly FilterBewerber[],
  filter: BewerberFilter,
  heute: Date,
  feld: FilterFeld,
  werte: readonly T[],
): Record<T, number> {
  const ergebnis = {} as Record<T, number>;
  for (const wert of werte) {
    const probe = { ...filter, [feld]: wert } as BewerberFilter;
    ergebnis[wert] = liste.filter((b) => passtZumFilter(b, probe, heute)).length;
  }
  return ergebnis;
}

export function zaehleFilterwerte(
  liste: readonly FilterBewerber[],
  filter: BewerberFilter,
  heute: Date = new Date(),
): FilterZaehlung {
  const quellenWerte = ["alle", ...werteAus(liste, (b) => b.quelle)];
  const stellenWerte = ["alle", ...werteAus(liste, (b) => b.stelleTitel)];
  return {
    bogen: zaehleFeld(liste, filter, heute, "bogen", BOGEN_WERTE),
    score: zaehleFeld(liste, filter, heute, "score", SCORE_WERTE),
    zeitraum: zaehleFeld(liste, filter, heute, "zeitraum", ZEITRAUM_WERTE),
    mail: zaehleFeld(liste, filter, heute, "mail", MAIL_WERTE),
    quelle: zaehleFeld(liste, filter, heute, "quelle", quellenWerte),
    stelle: zaehleFeld(liste, filter, heute, "stelle", stellenWerte),
    gezeigt: liste.filter((b) => passtZumFilter(b, filter, heute)).length,
    gesamt: liste.length,
  };
}

/**
 * Die vorhandenen Werte eines Textfeldes, alphabetisch.
 *
 * Die Auswahl entsteht aus den Bewerbern selbst und nicht aus einer festen
 * Liste. Quelle und Stelle schreiben mehrere Wege (die Bewerbungsseite, das
 * Bewerberportal, der Zapier-Eingang und die Erfassung von Hand), eine feste
 * Liste würde daneben sofort veralten. Fehlt die Angabe bei mindestens einem
 * Bewerber, kommt `OHNE_ANGABE` ans Ende.
 */
function werteAus(
  liste: readonly FilterBewerber[],
  lies: (b: FilterBewerber) => string | undefined,
): string[] {
  const gefunden = new Set<string>();
  let fehlt = false;
  for (const b of liste) {
    const wert = (lies(b) || "").trim();
    if (wert) gefunden.add(wert);
    else fehlt = true;
  }
  const sortiert = [...gefunden].sort((a, b) => a.localeCompare(b, "de"));
  return fehlt ? [...sortiert, OHNE_ANGABE] : sortiert;
}

/** Die Quellen, die in dieser Liste wirklich vorkommen. */
export function quellenAus(liste: readonly FilterBewerber[]): string[] {
  return werteAus(liste, (b) => b.quelle);
}

/** Die Stellen, auf die sich diese Bewerber beworben haben. */
export function stellenAus(liste: readonly FilterBewerber[]): string[] {
  return werteAus(liste, (b) => b.stelleTitel);
}

/**
 * Einen gespeicherten Filter wieder einlesen.
 *
 * Gemerkt wird je Nutzer, und was dort liegt, kann von einer älteren Fassung
 * stammen. Deshalb wird jeder Wert geprüft: Was nicht mehr vorkommt, fällt
 * still auf „alle" zurück, statt die Liste leer zu filtern.
 */
export function filterAusGespeichertem(wert: unknown): BewerberFilter {
  if (!wert || typeof wert !== "object") return { ...FILTER_STANDARD };
  const roh = wert as Record<string, unknown>;
  const text = (schluessel: string) => (typeof roh[schluessel] === "string" ? (roh[schluessel] as string) : "");
  const ausListe = <T extends string>(schluessel: string, erlaubt: readonly T[], standard: T): T => {
    const gelesen = text(schluessel) as T;
    return erlaubt.includes(gelesen) ? gelesen : standard;
  };
  const zeitraum = ausListe("zeitraum", ZEITRAUM_WERTE, "alle");
  return {
    bogen: ausListe("bogen", BOGEN_WERTE, "alle"),
    score: ausListe("score", SCORE_WERTE, "alle"),
    zeitraum,
    von: zeitraum === "eigen" ? text("von") : "",
    bis: zeitraum === "eigen" ? text("bis") : "",
    mail: ausListe("mail", MAIL_WERTE, "alle"),
    quelle: text("quelle") || "alle",
    stelle: text("stelle") || "alle",
  };
}
