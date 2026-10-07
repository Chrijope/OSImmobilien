/**
 * Die Vorabeinschätzung aus den Bewerbungsfragen der Meta-Anzeige.
 *
 * ## Wozu
 *
 * Im Eingang stehen über hundert Bewerber, und bei den meisten steht in der
 * Spalte „Vorab-Score" ein Strich: Sie haben den Kennenlernbogen noch nicht
 * ausgefüllt, und nur daraus entsteht der richtige Score. Wer zuerst angerufen
 * werden sollte, war damit nicht zu erkennen.
 *
 * Beim Klick auf die Anzeige beantworten sie aber schon vier Fragen, und die
 * reichen für eine Reihenfolge. Genau das ist diese Zahl: **eine Reihenfolge,
 * kein Urteil.** Sie beantwortet „wen rufe ich zuerst an", nicht „wie gut
 * passt er".
 *
 * ## Warum sie sich vom Bogen-Score unterscheidet, und warum das in Ordnung ist
 *
 * `bewerberVorabScore.ts` gewichtet den beruflichen Hintergrund mit 8 von 100
 * Punkten, und das ausdrücklich absichtlich: Das Haus sucht beide, ein
 * Quereinsteiger soll daran nicht scheitern. Hier zählt die Herkunft mit 55 von
 * 100 weit schwerer, weil die vier Fragen der Anzeige fast nichts anderes
 * hergeben. Die beiden Zahlen messen also Verschiedenes.
 *
 * Deshalb trägt diese eine Tilde und eine gedämpfte Farbe, und deshalb
 * verschwindet sie vollständig, sobald der Bogen da ist. Zwei Zahlen
 * nebeneinander wären eine Einladung, sie zu vergleichen.
 *
 * ## Die Gewichtung
 *
 * Von Christian am 14.09.2026 festgelegt, auf Grundlage der Antworten, die in
 * den Daten tatsächlich vorkommen (219 Bewerber aus der Anzeige):
 *
 *   Immobilienvertrieb   30   Das stärkste Signal, 101 von 219 sagen ja.
 *   Vertriebsbereich     25   Immobilien und Finanzdienstleistung zuerst.
 *   Vertriebserfahrung   25   Verkaufen ist Handwerk.
 *   Stunden pro Woche    20   Entscheidet, ob jemand es tragen kann.
 *
 * **B2C steht über B2B**, obwohl B2B häufiger ist: Kapitalanlagen gehen an
 * Privatpersonen. Wer Endkunden überzeugt hat, ist näher an unserem Geschäft
 * als jemand aus dem Firmenkundenvertrieb.
 *
 * Zum Justieren reicht es, die Zahlen in den vier Tabellen zu ändern.
 */

import { einstufungFuer, type VorabEinstufung } from "./bewerberVorabScore";

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

/** Ein bewertetes Merkmal, für die Aufschlüsselung im Tooltip. */
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
  stufe: VorabEinstufung;
  posten: MetaPosten[];
};

/**
 * Die Antworten sind bei Meta feste Auswahlen, kommen hier aber als freier
 * Text an: Der Webhook reicht durch, was geliefert wird, und im CRM lässt sich
 * jedes Feld von Hand überschreiben. Verglichen wird deshalb kleingeschrieben
 * und ohne Rand, und „ja" wird auch als „Ja" erkannt.
 */
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
  // Dasselbe mit dem geraden Bindestrich: Wer die Antwort von Hand einträgt,
  // tippt selten den Halbgeviertstrich.
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

/** Die vier Merkmale mit ihrer Tabelle und der erreichbaren Höchstzahl. */
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

/**
 * Die Einschätzung zu einem Bewerber. `null`, wenn keine einzige der vier
 * Fragen beantwortet ist.
 *
 * Wie beim Bogen-Score zählt eine unbeantwortete Frage in KEINER der beiden
 * Summen. Wer drei Fragen übersprungen hat, wird dafür nicht bestraft; seine
 * Zahl bezieht sich dann eben nur auf die vierte.
 *
 * Eine Antwort, die in keiner Tabelle steht, gilt als beantwortet und bringt
 * null Punkte. Das ist Absicht: Sie IST eine Antwort, sie passt nur nicht ins
 * Profil. Sie stillschweigend zu überspringen würde die Zahl schönrechnen.
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
  // Dieselbe Einstufung wie der Bogen-Score, damit A hier und A dort dasselbe
  // Fenster meinen. Die Schwellen stehen nur an einer Stelle.
  return { wert, stufe: einstufungFuer(wert), posten };
}
