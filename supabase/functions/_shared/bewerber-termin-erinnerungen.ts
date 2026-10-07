/**
 * Wann vor einem Bewerbertermin erinnert wird, und wann nicht.
 *
 * ## Zwei Abläufe, zwei Staffeln
 *
 * Im bestehenden Bewerbungsmanagement ist der Termin ein Telefonat, und es
 * wird 48, 6 und 1 Stunde vorher erinnert. Das läuft so und bleibt so.
 *
 * Im neuen Bewerberprozess ist der Termin ein persönliches Gespräch als
 * Videocall, und es wird 24, 6 und 1 Stunde vorher erinnert. Das ist keine
 * Kosmetik: 48 Stunden vorher weiß niemand mehr, worum es ging, und die Mail
 * des alten Ablaufs kündigt einen Anruf an, den niemand führt.
 *
 * Unterschieden wird an `meta.prozess`, demselben Kennzeichen, an dem auch die
 * beiden Listen hängen (siehe `src/lib/bewerberprozessZuordnung.ts`).
 *
 * ## Der Fehler, der hier behoben ist
 *
 * Abgelehnte Bewerber bekamen weiterhin Terminerinnerungen. Der Grund war
 * schlicht: Der Lauf las Datum und Uhrzeit aus dem Meta-Feld und fragte nie
 * nach dem Status. Wer abgesagt oder abgelehnt wurde, behielt seinen alten
 * Termin im Meta-Feld, und die Erinnerung lief weiter. Das ist genau der Fall,
 * vor dem der Kommentar in `kennenlernen-erinnerungen.ts` warnt.
 *
 * ## Warum als eigene Datei
 *
 * Weil eine Edge Function sich nicht testen lässt und diese Datei schon. Die
 * Regel „ein abgelehnter Bewerber bekommt nichts" gehört in eine Zeile, die
 * ein Test lesen kann. Gelesen wird sie von
 * `src/lib/bewerberTerminErinnerungen.test.ts`.
 */

/** Eine Stufe der Staffel. */
export type ErinnerungStufe = {
  /** Merker im Meta-Feld, damit dieselbe Stufe nicht zweimal hinausgeht. */
  label: string;
  /** Wie viele Stunden vor dem Termin. */
  stunden: number;
  /** Wie es in der Mail steht: „in 24 Stunden". */
  vorText: string;
  /**
   * Nennt diese Stufe zusätzlich die Uhrzeit in Ziffern?
   *
   * Nur die letzte. „In einer Stunde" zwingt sonst jeden zum Rechnen, und wer
   * die Mail zwanzig Minuten später öffnet, rechnet falsch. Bei 24 Stunden
   * wäre eine Uhrzeit ohne Datum dagegen irreführend, sie meint ja morgen.
   */
  mitUhrzeit?: boolean;
};

/**
 * Der neue Bewerberprozess: 24 Stunden, 6 Stunden und 1 Stunde vorher.
 *
 * Christians Punkt P9 vom 07.09.2026. Vorher fehlte die mittlere Stufe, und
 * zwischen „morgen um diese Zeit" und „in einer Stunde" liegt der ganze
 * Arbeitstag, an dem der Termin wieder aus dem Kopf fällt. Sechs Stunden gibt
 * es im bestehenden Bewerbungsmanagement schon, der Abstand ist also erprobt.
 */
export const STUFEN_VIDEOCALL: ErinnerungStufe[] = [
  { label: "24h", stunden: 24, vorText: "in 24 Stunden" },
  { label: "6h", stunden: 6, vorText: "in 6 Stunden" },
  { label: "1h", stunden: 1, vorText: "in 1 Stunde", mitUhrzeit: true },
];

/** Das bestehende Bewerbungsmanagement, unverändert. */
export const STUFEN_TELEFON: ErinnerungStufe[] = [
  { label: "48h", stunden: 48, vorText: "in 48 Stunden" },
  { label: "6h", stunden: 6, vorText: "in 6 Stunden" },
  { label: "1h", stunden: 1, vorText: "in 1 Stunde" },
];

/** Das Kennzeichen des neuen Ablaufs in `bewerbungen.meta`. */
export const PROZESS_NEU = "neu";

/** Läuft dieser Bewerber im neuen Ablauf? */
export function istNeuerProzess(meta?: Record<string, unknown> | null): boolean {
  return (meta?.prozess ?? "") === PROZESS_NEU;
}

/** Welche Staffel für diesen Bewerber gilt. */
export function stufenFuer(meta?: Record<string, unknown> | null): ErinnerungStufe[] {
  return istNeuerProzess(meta) ? STUFEN_VIDEOCALL : STUFEN_TELEFON;
}

/** Welche Vorlage für diesen Bewerber gilt. */
export function vorlageFuer(meta?: Record<string, unknown> | null): string {
  return istNeuerProzess(meta) ? "bewerber-videocall-erinnerung" : "bewerber-erstgespraech-erinnerung";
}

/**
 * Stufen, bei denen keine Terminerinnerung mehr hinausgeht.
 *
 * `KeinInteresse` und `Abgelehnt` sind die beiden, um die es geht. Beide
 * bedeuten: Der Prozess ist zu Ende. Ein alter Termin, der im Meta-Feld stehen
 * geblieben ist, darf daran nichts ändern.
 */
export const KEINE_ERINNERUNG_STATUS = ["KeinInteresse", "Abgelehnt"];

/** Warum die Erinnerung ausbleibt. `null` heißt: sie ist erlaubt. */
export type TerminStoppGrund = "kein_interesse" | "abgelehnt" | "kein_termin" | "vergangen";

export const TERMIN_STOPP_TEXTE: Record<TerminStoppGrund, string> = {
  kein_interesse: "Es steht auf „Kein Interesse“.",
  abgelehnt: "Der Bewerber ist abgelehnt.",
  kein_termin: "Es steht kein Termin.",
  vergangen: "Der Termin liegt in der Vergangenheit.",
};

export type TerminStand = {
  /** Pipelinestufe des Bewerbers. */
  bewerberStatus?: string | null;
  /** Steht überhaupt ein Termin? */
  hatTermin: boolean;
  /** Stunden bis zum Termin. Negativ, wenn er vorbei ist. */
  stundenBis: number;
};

export function terminStoppGrund(stand: TerminStand): TerminStoppGrund | null {
  const status = stand.bewerberStatus || "";
  if (status === "KeinInteresse") return "kein_interesse";
  if (status === "Abgelehnt") return "abgelehnt";
  if (!stand.hatTermin) return "kein_termin";
  if (stand.stundenBis <= 0) return "vergangen";
  return null;
}

/**
 * Welche Stufe jetzt fällig ist, oder `null`.
 *
 * Ein Fenster von einer Stunde um jeden Wert herum, wie bisher: Der Lauf kommt
 * alle zehn Minuten, und ein exakter Vergleich träfe nie.
 */
export function faelligeStufe(
  stand: TerminStand,
  stufen: ErinnerungStufe[],
  bereitsGesendet: readonly string[],
): ErinnerungStufe | null {
  if (terminStoppGrund(stand)) return null;
  for (const stufe of stufen) {
    if (bereitsGesendet.includes(stufe.label)) continue;
    if (stand.stundenBis < stufe.stunden - 0.5) continue;
    if (stand.stundenBis > stufe.stunden + 0.5) continue;
    return stufe;
  }
  return null;
}
