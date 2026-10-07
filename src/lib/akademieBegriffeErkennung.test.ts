import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findeBegriffe, neuerMarkierer, type BegriffsSegment } from "./akademieBegriffeErkennung";
import { type AkademieBegriff } from "./akademieBegriffe";

/** Kleine Testliste. Die echte Liste schreibt die Redaktion. */
const BEGRIFFE: AkademieBegriff[] = [
  { begriff: "Bonität", erklaerung: "Wie sicher jemand seinen Kredit bedienen kann." },
  { begriff: "Grundbuch", erklaerung: "Das amtliche Verzeichnis der Eigentumsverhältnisse." },
  { begriff: "AfA", erklaerung: "Absetzung für Abnutzung, die jährliche Abschreibung." },
  { begriff: "Sonder-AfA", erklaerung: "Zusätzliche Abschreibung nach § 7b EStG." },
  {
    begriff: "Tilgung",
    schreibweisen: ["Tilgungen", "getilgt"],
    erklaerung: "Der Teil der Rate, der die Schuld verkleinert.",
  },
];

/** Nur die markierten Stücke, für kurze Erwartungen. */
function markiert(segmente: BegriffsSegment[]): string[] {
  return segmente.filter((s) => s.typ === "begriff").map((s) => s.text);
}

/** Der Text muss aus den Segmenten wieder lückenlos zusammensetzbar sein. */
function zusammengesetzt(segmente: BegriffsSegment[]): string {
  return segmente.map((s) => s.text).join("");
}

describe("Begriffserkennung", () => {
  it("läuft mit leerer Liste fehlerfrei und lässt den Text unverändert", () => {
    // Die Mechanik muss auch dann tragen, wenn die Redaktion noch nichts
    // eingetragen hat.
    const s = findeBegriffe("Die Bonität entscheidet.", []);
    expect(markiert(s)).toEqual([]);
    expect(zusammengesetzt(s)).toBe("Die Bonität entscheidet.");
  });

  // Falle 1
  it("markiert einen Begriff nicht innerhalb eines längeren Wortes", () => {
    const s = findeBegriffe("Die Bonitätsprüfung der Bank braucht Zeit.", BEGRIFFE);
    expect(markiert(s)).toEqual([]);
    expect(zusammengesetzt(s)).toBe("Die Bonitätsprüfung der Bank braucht Zeit.");
  });

  it("markiert denselben Begriff, wenn er allein steht", () => {
    const s = findeBegriffe("Die Bonität entscheidet über die Zinsen.", BEGRIFFE);
    expect(markiert(s)).toEqual(["Bonität"]);
  });

  it("prüft die Wortgrenze auf Buchstaben, auch bei Umlauten am Wortende", () => {
    // Mit `\b` würde „Bonität" schon vor dem „ä" enden und in
    // „Bonitätsauskunft" fälschlich anspringen.
    expect(markiert(findeBegriffe("Grundbuchamt und Grundbuchauszug", BEGRIFFE))).toEqual([]);
    expect(markiert(findeBegriffe("Ein Blick ins Grundbuch genügt.", BEGRIFFE))).toEqual(["Grundbuch"]);
  });

  // Falle 2
  it("nimmt die längste Übereinstimmung, damit AfA nicht die Sonder-AfA frisst", () => {
    const s = findeBegriffe("Die Sonder-AfA kommt zusätzlich.", BEGRIFFE);
    expect(markiert(s)).toEqual(["Sonder-AfA"]);
    expect(zusammengesetzt(s)).toBe("Die Sonder-AfA kommt zusätzlich.");
  });

  it("findet den kurzen Begriff weiterhin, wenn er allein steht", () => {
    expect(markiert(findeBegriffe("Die AfA senkt die Steuerlast.", BEGRIFFE))).toEqual(["AfA"]);
  });

  // Falle 3
  it("trifft Beugungen über das Feld schreibweisen", () => {
    expect(markiert(findeBegriffe("Zwei Tilgungen im Jahr sind möglich.", BEGRIFFE))).toEqual(["Tilgungen"]);
    expect(markiert(findeBegriffe("Der Kredit wird getilgt.", BEGRIFFE))).toEqual(["getilgt"]);
  });

  it("führt jede Schreibweise auf denselben Eintrag zurück", () => {
    const s = findeBegriffe("Tilgungen", BEGRIFFE);
    const treffer = s.find((x) => x.typ === "begriff");
    expect(treffer && treffer.typ === "begriff" && treffer.begriff.begriff).toBe("Tilgung");
  });

  // Falle 5
  it("markiert je Abschnitt nur die erste Nennung, auch über mehrere Textblöcke", () => {
    const m = neuerMarkierer(BEGRIFFE);
    const ersterAbsatz = m.markiere("Die Bonität zählt.");
    const zweiterAbsatz = m.markiere("Ohne Bonität keine Finanzierung, die Bonität bleibt entscheidend.");
    expect(markiert(ersterAbsatz)).toEqual(["Bonität"]);
    expect(markiert(zweiterAbsatz)).toEqual([]);
    expect(zusammengesetzt(zweiterAbsatz)).toBe(
      "Ohne Bonität keine Finanzierung, die Bonität bleibt entscheidend.",
    );
  });

  it("markiert innerhalb eines Textes nur das erste Vorkommen", () => {
    const s = findeBegriffe("Grundbuch hier, Grundbuch dort.", BEGRIFFE);
    expect(markiert(s)).toEqual(["Grundbuch"]);
  });

  it("ein neuer Abschnitt beginnt mit leerer Merkliste", () => {
    const a = neuerMarkierer(BEGRIFFE);
    a.markiere("Die Bonität zählt.");
    const b = neuerMarkierer(BEGRIFFE);
    expect(markiert(b.markiere("Die Bonität zählt."))).toEqual(["Bonität"]);
  });

  it("erhält Groß- und Kleinschreibung des Originals", () => {
    const s = findeBegriffe("bonität klein geschrieben", BEGRIFFE);
    expect(markiert(s)).toEqual(["bonität"]);
  });

  it("mehrere verschiedene Begriffe in einem Satz", () => {
    const s = findeBegriffe("Tilgung, Bonität und Grundbuch gehören zusammen.", BEGRIFFE);
    expect(markiert(s)).toEqual(["Tilgung", "Bonität", "Grundbuch"]);
    expect(zusammengesetzt(s)).toBe("Tilgung, Bonität und Grundbuch gehören zusammen.");
  });
});

// Falle 4: Skripte werden wörtlich gesprochen und dürfen keine Erklärknöpfe
// tragen. Das ist strukturell gelöst — Skripte rendern in `CopyBlock`,
// Lehrtexte in `SectionBlock`. Diese Prüfung hält die Struktur fest, damit sie
// nicht versehentlich aufgeweicht wird.
describe("Skripte bleiben frei von Begriffsmarkierungen", () => {
  const quelle = readFileSync(
    resolve(process.cwd(), "src/pages/vertriebsakademie/VertriebsakademieKapitel.tsx"),
    "utf8",
  );

  function funktion(name: string): string {
    const start = quelle.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const naechste = quelle.indexOf("\nfunction ", start + 1);
    return quelle.slice(start, naechste === -1 ? undefined : naechste);
  }

  it("CopyBlock rendert keinen BegriffsText", () => {
    expect(funktion("CopyBlock")).not.toContain("BegriffsText");
  });

  it("CopyBlock kopiert den Rohtext, nicht das gerenderte Gebilde", () => {
    const block = funktion("CopyBlock");
    expect(block).toContain("navigator.clipboard.writeText(rendered)");
    expect(block).toContain("const rendered = applyPlaceholders(skript.text");
  });

  it("SectionBlock rendert den Lehrtext über BegriffsText", () => {
    const block = funktion("SectionBlock");
    expect(block).toContain("useAbschnittsBegriffe");
    expect(block).toContain("segmente={begriffe.absaetze[i]}");
    expect(block).toContain("segmente={begriffe.bullets[i]}");
    expect(block).toContain("segmente={begriffe.profiTipp}");
    expect(block).toContain("segmente={begriffe.quereinsteigerHinweis}");
  });
});
