/**
 * Die Vorabeinschätzung aus den Bewerbungsfragen der Anzeige, für Deno.
 *
 * ## Warum es diese Datei gibt
 *
 * Maßgeblich ist `src/lib/bewerberMetaScore.ts`. Diese Datei ist die Kopie,
 * nicht die Quelle. Dasselbe Vorgehen und dieselbe Begründung wie bei
 * `bewerber-kennenlernen-ueberblick.ts`: Die interne Meldung an HR entsteht in
 * einer Edge Function, die läuft in Deno und kann `src` nicht erreichen.
 *
 * ## Was das Auseinanderlaufen verhindert
 *
 * `src/lib/metaScoreMail.test.ts` rechnet beide Fassungen gegeneinander, über
 * jede einzelne Antwortmöglichkeit und über zusammengesetzte Fälle. Wer eine
 * Punktzahl hier oder dort ändert und die zweite Stelle vergisst, bekommt
 * einen roten Test und keine stille Abweichung. Das ist der Grund, warum die
 * Punkte nirgends von Hand in eine Mailvorlage geschrieben werden: Die
 * Aufschlüsselung entsteht aus derselben Rechnung, die auch die Zahl ergibt.
 */

/** Die Angaben aus der Anzeige, auf die es ankommt. */
export type MetaAngaben = {
  /** „Hast du bereits Erfahrung im Immobilienvertrieb?" */
  immobilienErfahrung?: string;
  /** „In welchem Vertriebsbereich hast du bisher gearbeitet?" */
  vertriebsbereich?: string;
  /** „Wie viel Vertriebserfahrung bringst du mit?" */
  vertriebserfahrung?: string;
  /** „Wie viele Stunden pro Woche kannst du realistisch investieren?" */
  stundenProWoche?: string;
};

/** Ein bewertetes Merkmal, für die Aufschlüsselung. */
export type MetaPosten = {
  /** Die Frage in Kurzform. */
  frage: string;
  /** Die Antwort im Wortlaut des Bewerbers. */
  antwort: string;
  punkte: number;
  moeglich: number;
};

export type MetaScore = {
  /** 0 bis 100, bezogen auf die beantworteten Fragen. */
  wert: number;
  /** A, B oder C, nach denselben Schwellen wie der Bogen-Score. */
  stufe: "A" | "B" | "C";
  posten: MetaPosten[];
};

/** Wortgleich mit VORAB_SCHWELLE_A und VORAB_SCHWELLE_B in `src/lib/bewerberVorabScore.ts`. */
const SCHWELLE_A = 80;
const SCHWELLE_B = 60;

const norm = (wert?: string) => (wert || "").trim().toLowerCase();

const IMMOBILIEN: Record<string, number> = { ja: 30, nein: 0 };

const BEREICH: Record<string, number> = {
  "immobilienvertrieb": 25,
  "finanzdienstleistungen": 22,
  "b2c-vertrieb": 15,
  "b2b-vertrieb": 12,
  "sonstiges": 5,
};

const ERFAHRUNG: Record<string, number> = {
  "mehr als 5 jahre": 25,
  "3–5 jahre": 18,
  "3-5 jahre": 18,
};

const STUNDEN: Record<string, number> = {
  "30+ stunden": 20,
  "20–30 stunden": 15,
  "20-30 stunden": 15,
  "10–20 stunden": 8,
  "10-20 stunden": 8,
  "unter 10 stunden": 2,
};

const MERKMALE: {
  frage: string;
  feld: keyof MetaAngaben;
  tabelle: Record<string, number>;
  moeglich: number;
}[] = [
  { frage: "Immobilienvertrieb", feld: "immobilienErfahrung", tabelle: IMMOBILIEN, moeglich: 30 },
  { frage: "Vertriebsbereich", feld: "vertriebsbereich", tabelle: BEREICH, moeglich: 25 },
  { frage: "Vertriebserfahrung", feld: "vertriebserfahrung", tabelle: ERFAHRUNG, moeglich: 25 },
  { frage: "Stunden pro Woche", feld: "stundenProWoche", tabelle: STUNDEN, moeglich: 20 },
];

/** Dieselben Schwellen wie der Bogen-Score, damit A hier und A dort dasselbe meint. */
function einstufungFuer(punkte: number): "A" | "B" | "C" {
  if (punkte >= SCHWELLE_A) return "A";
  if (punkte >= SCHWELLE_B) return "B";
  return "C";
}

/**
 * Die Einschätzung zu einem Bewerber. `null`, wenn keine einzige der vier
 * Fragen beantwortet ist.
 *
 * Wortgleiches Verhalten wie `metaScore` in `src/lib/bewerberMetaScore.ts`:
 * Eine unbeantwortete Frage zählt in keiner der beiden Summen, eine Antwort
 * außerhalb der Tabelle gilt als beantwortet und bringt null Punkte.
 */
export function metaScore(angaben: MetaAngaben): MetaScore | null {
  const posten: MetaPosten[] = [];
  let erreicht = 0;
  let moeglich = 0;

  for (const m of MERKMALE) {
    const antwort = (angaben[m.feld] || "").trim();
    if (!antwort) continue;
    const punkte = m.tabelle[norm(antwort)] ?? 0;
    posten.push({ frage: m.frage, antwort, punkte, moeglich: m.moeglich });
    erreicht += punkte;
    moeglich += m.moeglich;
  }

  if (moeglich === 0) return null;

  const wert = Math.round((erreicht / moeglich) * 100);
  return { wert, stufe: einstufungFuer(wert), posten };
}

/** Alle Antwortmöglichkeiten je Feld. Nur der Wächtertest benutzt sie. */
export const META_TABELLEN: Record<keyof MetaAngaben, Record<string, number>> = {
  immobilienErfahrung: IMMOBILIEN,
  vertriebsbereich: BEREICH,
  vertriebserfahrung: ERFAHRUNG,
  stundenProWoche: STUNDEN,
};
