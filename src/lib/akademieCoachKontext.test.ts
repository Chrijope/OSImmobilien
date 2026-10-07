import { describe, it, expect } from "vitest";
import { buildKapitelContext } from "./akademieCoachKontext";
import { VERTRIEBSAKADEMIE_KAPITEL, type AkademieKapitel } from "@/lib/vertriebsakademieContent";

/** Die Edge Function `ki-assistant` schneidet den Kontext bei 8.000 Zeichen ab. */
const SERVER_GRENZE = 8000;

const BEISPIEL: AkademieKapitel = {
  slug: "test",
  nummer: "9",
  titel: "Testkapitel",
  kicker: "Test",
  teaser: "Test",
  ziel: "Alles prüfen",
  icon: "book",
  sections: [
    {
      id: "a",
      ueberschrift: "Erster Abschnitt",
      absaetze: ["Ein Absatz."],
      bullets: ["Ein Punkt."],
      profiTipp: "Ein Profi-Tipp.",
      quereinsteigerHinweis: "Ein Hinweis für Quereinsteiger.",
      goldNugget: { titel: "Nugget", text: "Der Nugget-Text." },
      skripte: [{ titel: "Opener", text: "Guten Tag, kurze Frage.", warum: "Weil es öffnet." }],
      einwaende: [{ einwand: "Zu teuer", antwort: "Verglichen womit?", warum: "Weil es umkehrt." }],
      checkliste: ["Erster Haken"],
      visuals: [{ kpis: [{ label: "Quote", wert: "30 %" }] }],
      aufgaben: [
        {
          id: "q1",
          typ: "quiz",
          titel: "Kurzquiz",
          fragen: [
            { frage: "Was zählt?", optionen: ["Nichts", "Haltung"], korrekt: 1, aufloesung: "Haltung zählt." },
          ],
        },
      ],
    },
  ],
};

describe("Kapitelkontext für den Coach", () => {
  it("enthält die früher fehlenden Teile des Kapitels", () => {
    const text = buildKapitelContext(BEISPIEL);
    expect(text).toContain("Guten Tag, kurze Frage.");   // Skript
    expect(text).toContain("Weil es öffnet.");           // warum des Skripts
    expect(text).toContain("Der Nugget-Text.");          // Gold-Nugget
    expect(text).toContain("Ein Hinweis für Quereinsteiger."); // Quereinsteiger
    expect(text).toContain("Quote = 30 %");              // Visual
    expect(text).toContain("Haltung zählt.");            // Aufgabe
    expect(text).toContain("Erster Haken");              // Checkliste
    expect(text).toContain("Weil es umkehrt.");          // warum des Einwands
  });

  it("gibt für ein fehlendes Kapitel eine leere Zeichenkette", () => {
    expect(buildKapitelContext(undefined)).toBe("");
  });

  it("bleibt für jedes echte Kapitel unter der Grenze der Edge Function", () => {
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
      expect(buildKapitelContext(kap).length).toBeLessThanOrEqual(SERVER_GRENZE);
    }
  });

  it("nennt jeden Abschnitt, auch wenn gekürzt werden muss", () => {
    // Vorher wurde am Ende abgeschnitten, die späteren Abschnitte eines
    // langen Kapitels kannte der Coach gar nicht.
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
      const text = buildKapitelContext(kap);
      for (const sec of kap.sections) {
        expect(text, `${kap.slug} / ${sec.ueberschrift}`).toContain(`### ${sec.ueberschrift}`);
      }
    }
  });
});
