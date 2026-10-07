import { describe, it, expect } from "vitest";
import { metaScore as imCrm, type MetaAngaben } from "@/lib/bewerberMetaScore";
import {
  metaScore as inDerMail,
  META_TABELLEN,
} from "../../supabase/functions/_shared/bewerber-meta-score";

/**
 * Die Vorabeinschätzung aus den Bewerbungsfragen steht zweimal im Projekt.
 *
 * Maßgeblich ist `src/lib/bewerberMetaScore.ts`. Die zweite Fassung liegt
 * unter `supabase/functions/_shared/`, weil die interne Meldung an HR aus
 * einer Edge Function kommt und die in Deno läuft: Sie kann `src` nicht
 * erreichen.
 *
 * Zwei Fassungen derselben Rechnung laufen auseinander, und bemerkt wird es
 * erst, wenn in der Mail eine andere Zahl steht als in der Bewerberliste.
 * Genau dieses Auseinanderlaufen fängt dieser Test: Er rechnet beide Fassungen
 * über jede einzelne Antwortmöglichkeit und über zusammengesetzte Fälle gegen
 * dieselbe Erwartung.
 */

/** Jede Antwort, die eine der vier Tabellen kennt, als einzelner Fall. */
const EINZELFAELLE: MetaAngaben[] = Object.entries(META_TABELLEN).flatMap(
  ([feld, tabelle]) =>
    Object.keys(tabelle).map((antwort) => ({ [feld]: antwort }) as MetaAngaben),
);

/** Fälle, die sich aus mehreren Antworten zusammensetzen. */
const KOMBINATIONEN: MetaAngaben[] = [
  {},
  { immobilienErfahrung: "", vertriebsbereich: "   " },
  { immobilienErfahrung: "ja" },
  { immobilienErfahrung: "Ja" },
  { immobilienErfahrung: "  ja  " },
  { immobilienErfahrung: "vielleicht" },
  { vertriebsbereich: "Gastronomie" },
  { vertriebserfahrung: "3-5 Jahre" },
  { vertriebserfahrung: "3–5 Jahre" },
  { stundenProWoche: "10-20 Stunden" },
  { stundenProWoche: "10–20 Stunden" },
  {
    immobilienErfahrung: "ja",
    vertriebsbereich: "Immobilienvertrieb",
    vertriebserfahrung: "Mehr als 5 Jahre",
    stundenProWoche: "30+ Stunden",
  },
  {
    immobilienErfahrung: "nein",
    vertriebsbereich: "Sonstiges",
    vertriebserfahrung: "Keine",
    stundenProWoche: "Unter 10 Stunden",
  },
  {
    immobilienErfahrung: "ja",
    vertriebsbereich: "B2C-Vertrieb",
    stundenProWoche: "20–30 Stunden",
  },
  {
    vertriebsbereich: "Finanzdienstleistungen",
    vertriebserfahrung: "3–5 Jahre",
  },
];

const ALLE = [...EINZELFAELLE, ...KOMBINATIONEN];

describe("Die Vorabeinschätzung in der Mail", () => {
  it("prüft überhaupt genug Fälle", () => {
    // Sicherung gegen einen Test, der aus Versehen nichts prüft: vier Felder
    // mit zusammen mindestens vierzehn benannten Antworten.
    expect(Object.keys(META_TABELLEN)).toHaveLength(4);
    expect(EINZELFAELLE.length).toBeGreaterThanOrEqual(14);
  });

  it.each(ALLE.map((fall) => [JSON.stringify(fall), fall] as const))(
    "rechnet %s in der Mail genauso wie im CRM",
    (_name, fall) => {
      const crm = imCrm(fall);
      const mail = inDerMail(fall);

      if (crm === null) {
        expect(mail).toBeNull();
        return;
      }

      expect(mail).not.toBeNull();
      // Zahl, Einstufung und die ganze Aufschlüsselung, Posten für Posten.
      // Wer eine Punktzahl nur an einer der beiden Stellen ändert, scheitert
      // hier und nicht erst im Postfach der HR-Managerin.
      expect(mail).toEqual(crm);
    },
  );
});
