import { describe, it, expect } from "vitest";
import { VERTRIEBSAKADEMIE_KAPITEL, getKapitelBySlug } from "./vertriebsakademieContent";
import { sucheInAkademie, sucheImKapitel, akademieAusschnitt } from "./vertriebsakademieSuche";

/*
  Die Prüfung, auf die es ankommt: echte Fragen, wie ein Vertriebspartner sie
  mitten in einem Vorgang tippt. Nicht Stichwörter, sondern ganze Sätze mit
  allen Füllwörtern darin. Jede muss die richtige Stelle an die erste Position
  bringen, nicht irgendwohin in die Trefferliste. Wer an Stelle vier steht,
  wird nicht gelesen.
*/
describe("sucheInAkademie mit echten Fragen", () => {
  const faelle: [frage: string, kapitel: string, abschnitt: string][] = [
    ["Was passiert beim Notartermin?", "notar", "ablauf"],
    ["Wie erkläre ich den Leverage Effekt?", "grundlagen", "leverage"],
    ["Wie viel Grunderwerbsteuer fällt in Bayern an?", "grundlagen", "nebenkosten"],
    ["Was sage ich, wenn der Kunde den Preis pro Quadratmeter vergleicht?", "objektauswahl", "objektpraesentation"],
    ["Was kostet eine Reservierung den Kunden?", "objektauswahl", "reservierung-uebergabe"],
    ["Wie spreche ich einen Tippgeber an?", "empfehlungssystem", "tippgeber-akquise"],
    ["Was antworte ich, wenn jemand fragt, was machst du beruflich?", "pitch-und-aufhaenger", "elevator-pitch"],
    ["Was ist die Denkmal AfA?", "steuer-deep-dive", "denkmal-7i"],
    ["In welcher Reihenfolge stehen die Pipeline Stufen?", "glossar-zahlen", "pipeline-glossar"],
    ["Wie schreibe ich eine WhatsApp an einen alten Bekannten?", "leadgenerierung", "textbausteine-whatsapp"],
    ["Brauche ich eine 34c Erlaubnis?", "positionierung", "34c-erlaubnis"],
    ["Wie gehe ich mit Absagen und Durststrecken um?", "mindset", "durststrecken"],
    ["Was ist eine Ampel-Qualifizierung?", "erstgespraech", "ampel"],
  ];

  for (const [frage, kapitel, abschnitt] of faelle) {
    it(`beantwortet "${frage}" mit der richtigen Stelle`, () => {
      const treffer = sucheInAkademie(frage);
      expect(treffer.length).toBeGreaterThan(0);
      expect(`${treffer[0].kapitel.slug}/${treffer[0].abschnitt.id}`).toBe(`${kapitel}/${abschnitt}`);
    });
  }

  it("versteht Umlaute in beiden Schreibweisen", () => {
    const mit = sucheInAkademie("Wie viel Grunderwerbsteuer fällt in Bayern an?");
    const ohne = sucheInAkademie("Wie viel Grunderwerbsteuer faellt in Bayern an?");
    expect(ohne[0].abschnitt.id).toBe(mit[0].abschnitt.id);
  });

  it("findet bei leerer Frage nichts, statt alles zu zeigen", () => {
    expect(sucheInAkademie("")).toEqual([]);
    expect(sucheInAkademie("   ")).toEqual([]);
    // Eine Eingabe, die nur aus Füllwörtern besteht, ist keine Frage.
    expect(sucheInAkademie("und wie ist das")).toEqual([]);
  });

  it("sagt nichts, wenn es nichts zu sagen gibt", () => {
    expect(sucheInAkademie("Zebrastreifen Quallensuppe")).toEqual([]);
  });

  it("gibt zu jedem Treffer einen lesbaren Ausschnitt", () => {
    const treffer = sucheInAkademie("Was kostet eine Reservierung den Kunden?");
    const text = akademieAusschnitt(treffer[0], treffer[0].getroffen[0]);
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toMatch(/\*\*/);
  });
});

/*
  Der eigentliche Sinn der zweiten Suche: Sie bleibt im Kapitel. Eine
  Kapitelsuche, die Treffer aus anderen Kapiteln zeigt, ist keine Kapitelsuche,
  sondern eine zweite Gesamtsuche an der falschen Stelle.
*/
describe("sucheImKapitel bleibt im Kapitel", () => {
  it("liefert niemals Treffer aus einem anderen Kapitel", () => {
    const fragen = [
      "Was kostet eine Reservierung?",
      "Wie erkläre ich die Steuer?",
      "Was sage ich am Telefon?",
      "Kunde",
    ];
    for (const kapitel of VERTRIEBSAKADEMIE_KAPITEL) {
      for (const frage of fragen) {
        const fremde = sucheImKapitel(frage, kapitel).filter((t) => t.kapitel.slug !== kapitel.slug);
        expect(fremde, `${kapitel.slug} / ${frage}`).toEqual([]);
      }
    }
  });

  it("findet die Stelle, die im Kapitel Notar wirklich dazu steht", () => {
    const notar = getKapitelBySlug("notar")!;
    const treffer = sucheImKapitel("Was passiert beim Notartermin?", notar);
    expect(treffer[0].abschnitt.id).toBe("ablauf");
  });

  it("findet im falschen Kapitel nichts, was dort nicht steht", () => {
    const mindset = getKapitelBySlug("mindset")!;
    expect(sucheImKapitel("Grunderwerbsteuer Bayern", mindset)).toEqual([]);
  });

  it("bewertet ein Wort unabhängig davon, in welchem Kapitel gesucht wird", () => {
    /*
      Die Wortgewichte werden über die ganze Akademie bestimmt. Sonst wäre
      "Notar" im Notarkapitel ein Allerweltswort und würde dort weggewichtet,
      obwohl der Partner genau danach gefragt hat.
    */
    const notar = getKapitelBySlug("notar")!;
    const global = sucheInAkademie("Was passiert beim Notartermin?")
      .find((t) => t.kapitel.slug === "notar" && t.abschnitt.id === "ablauf");
    const lokal = sucheImKapitel("Was passiert beim Notartermin?", notar)
      .find((t) => t.abschnitt.id === "ablauf");
    expect(lokal?.punkte).toBeCloseTo(global!.punkte, 5);
  });
});

describe("Der Inhalt selbst", () => {
  it("hat in jedem Kapitel eindeutige Abschnittskennungen", () => {
    for (const k of VERTRIEBSAKADEMIE_KAPITEL) {
      const ids = (k.sections || []).map((s) => s.id);
      expect(new Set(ids).size, k.slug).toBe(ids.length);
    }
  });
});
