import { describe, it, expect } from "vitest";
import {
  PRAESENTATIONS_DECK,
  TEIL_2_START_ID,
  ZWISCHENSTOPP,
  aktivesDeck,
  baueModerationsSchritte,
  deckFuerEinstieg,
  getDeckFolie,
  leseTeil,
  sichtbareFolieId,
} from "./praesentationsDeck";
import { ERSTGESPRAECH_FOLIEN } from "./erstgespraechFolien";
import { ASSESSMENT_STATIONEN } from "./assessmentSkript";
import { CLOSING_DIREKT_ABSCHNITTE } from "./closingDirektSkript";

const ERWARTET = [
  // Teil 1: Kennenlernen
  "einstieg", "ausgangslage", "profil", "ziele", "motivation", "machbarkeit", "einwaende",
  // Teil 2: die bestehende Dramaturgie
  "cover", "chaos", "vision", "werte", "system", "objekte-standorte", "dealprozess",
  "partnerstimmen", "echter-fall", "rechner", "zwei-wege", "preis", "selbstcheck", "start", "abschluss",
];

describe("praesentationsDeck: Aufbau", () => {
  it("das aktive Deck hat 22 Folien in der freigegebenen Reihenfolge", () => {
    const deck = aktivesDeck();
    expect(deck).toHaveLength(22);
    expect(deck.map((f) => f.id)).toEqual(ERWARTET);
  });

  it("Folie 1 bis 7 sind Teil 1, Folie 8 bis 22 Teil 2, Folie 8 ist der Einstieg für teil=2", () => {
    const deck = aktivesDeck();
    expect(deck.slice(0, 7).every((f) => f.teil === 1)).toBe(true);
    expect(deck.slice(7).every((f) => f.teil === 2)).toBe(true);
    expect(deck[7].id).toBe(TEIL_2_START_ID);
  });

  it("alle Ids sind eindeutig, auch mit den bedingten Folien", () => {
    const ids = PRAESENTATIONS_DECK.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getDeckFolie("zahlen")?.bedingung).toBe("kennzahlen");
    expect(getDeckFolie("partnerstimmen")?.bedingung).toBe("partnerstimmen");
  });

  it("Teil-1-Folien kommen aus dem Erstgesprächsskript", () => {
    const teil1 = PRAESENTATIONS_DECK.filter((f) => f.teil === 1);
    expect(teil1.map((f) => f.id)).toEqual(ERSTGESPRAECH_FOLIEN.map((f) => f.id));
    for (const f of teil1) {
      const skript = f.skript;
      expect(skript.art).toBe("station");
      if (skript.art !== "station") continue;
      const station = ASSESSMENT_STATIONEN.find((s) => s.key === skript.key);
      expect(station?.folie?.id).toBe(f.id);
      expect(f.titel).toBe(station?.folie?.kopfzeile);
      expect(f.phase).toBe("Kennenlernen");
    }
  });

  it("Station 9 und 10 haben keine Folie, sie bilden den Zwischenstopp", () => {
    const stationKeys = PRAESENTATIONS_DECK
      .map((f) => (f.skript.art === "station" ? f.skript.key : null))
      .filter(Boolean);
    expect(stationKeys).not.toContain("einschaetzung");
    expect(stationKeys).not.toContain("naechsterSchritt");
    expect(stationKeys).not.toContain("werWirSind");
    expect(ZWISCHENSTOPP.nachFolieId).toBe("einwaende");
    expect(ZWISCHENSTOPP.einschaetzung).toEqual({ art: "station", key: "einschaetzung" });
    expect(ZWISCHENSTOPP.terminbuchung).toEqual({ art: "station", key: "naechsterSchritt" });
    expect(ZWISCHENSTOPP.felder).toEqual(["gesamteindruck", "empfehlungBegruendung", "empfehlungOverride"]);
  });

  it("jede Teil-2-Folie hat einen Skript-Abschnitt über ihre folieId, und jeder Abschnitt eine Folie", () => {
    const folieIds = new Set(CLOSING_DIREKT_ABSCHNITTE.map((a) => a.folieId));
    for (const f of aktivesDeck().filter((f) => f.teil === 2)) {
      expect(f.skript).toEqual({ art: "closing", folieId: f.id });
      expect(folieIds.has(f.id)).toBe(true);
    }
    const deckIds = new Set(PRAESENTATIONS_DECK.map((f) => f.id));
    for (const a of CLOSING_DIREKT_ABSCHNITTE) {
      expect(deckIds.has(a.folieId)).toBe(true);
    }
    // Die Zahlenfolie hat bewusst keinen Abschnitt, sie ist ausgeblendet.
    expect(folieIds.has("zahlen")).toBe(false);
  });
});

describe("praesentationsDeck: Felder für die Moderation", () => {
  it("Teil 1 zeigt die Felder der Station, die Profil-Folie die Pfadwahl mit Vertiefung", () => {
    expect(getDeckFolie("einstieg")?.felder).toEqual(["ersteindruck"]);
    expect(getDeckFolie("ausgangslage")?.felder).toEqual(["beschaeftigungsart", "branche", "werdegang"]);
    expect(getDeckFolie("profil")?.felder).toEqual(["pfade"]);
    expect(getDeckFolie("profil")?.pfadVertiefung).toBe(true);
    expect(getDeckFolie("ziele")?.felder).toEqual(["ziele", "einkommensziel", "zielklarheit"]);
    expect(getDeckFolie("motivation")?.felder).toEqual(["antrieb", "zeitProWoche"]);
    expect(getDeckFolie("einwaende")?.felder).toEqual(["einwandNotiz"]);
  });

  it("die Machbarkeits-Folie zeigt nur das Formale, die Provision wandert zu Zwei Wege", () => {
    expect(getDeckFolie("machbarkeit")?.felder).toEqual(["bereitschaft34c"]);
    expect(getDeckFolie("zwei-wege")?.felder).toEqual(["wegeNotiz", "konditionenReaktion"]);
    expect(getDeckFolie("zwei-wege")?.ergaenzung).toEqual({ stationKey: "konditionen", block: "verdienst" });
  });

  it("Station 6 (Wer wir sind) wird auf System und Produkte verteilt", () => {
    expect(getDeckFolie("system")?.felder).toEqual(["systemNotiz", "vorstellungNotiz"]);
    expect(getDeckFolie("system")?.ergaenzung).toEqual({ stationKey: "werWirSind", sprechtexte: [2] });
    expect(getDeckFolie("objekte-standorte")?.felder).toEqual(["produkteNotiz", "vorstellungNotiz"]);
    expect(getDeckFolie("objekte-standorte")?.ergaenzung).toEqual({ stationKey: "werWirSind", sprechtexte: [0, 1] });
  });

  it("Teil-2-Felder sind die Notizfelder der Abschnitte, die Abschlussfolie bündelt zwei Abschnitte", () => {
    expect(getDeckFolie("rechner")?.felder).toEqual(["rechnerAbschluesse", "rechnerNotiz"]);
    expect(getDeckFolie("abschluss")?.felder).toEqual(["abschlussNotiz"]);
    expect(getDeckFolie("preis")?.felder).toEqual(["preisReaktion"]);
  });
});

describe("praesentationsDeck: Einstiegswege", () => {
  it("leseTeil kennt nur 2 als zweiten Einstieg, alles andere ist das ganze Deck", () => {
    expect(leseTeil("2")).toBe(2);
    expect(leseTeil(" 2 ")).toBe(2);
    expect(leseTeil("1")).toBe(1);
    expect(leseTeil(null)).toBe(1);
    expect(leseTeil(undefined)).toBe(1);
    expect(leseTeil("unsinn")).toBe(1);
  });

  it("teil=1 liefert alle 22 Folien ab Folie 1", () => {
    const deck = deckFuerEinstieg(1);
    expect(deck).toHaveLength(22);
    expect(deck[0].id).toBe("einstieg");
  });

  it("teil=2 liefert die 15 Folien von Teil 2 ab Folie 8, ohne Teil 1", () => {
    const deck = deckFuerEinstieg(2);
    expect(deck).toHaveLength(15);
    expect(deck[0].id).toBe(TEIL_2_START_ID);
    expect(deck.every((f) => f.teil === 2)).toBe(true);
    expect(deck.map((f) => f.id)).toEqual(ERWARTET.slice(7));
  });
});

describe("praesentationsDeck: Schritte der Moderation", () => {
  it("teil=1 ohne Schalter: sieben Folien, dann der Zwischenstopp, dann Schluss", () => {
    const schritte = baueModerationsSchritte(1, false);
    expect(schritte).toHaveLength(8);
    expect(schritte.slice(0, 7).map((s) => (s.art === "folie" ? s.folie.id : s.art))).toEqual(ERWARTET.slice(0, 7));
    expect(schritte[7]).toEqual({ art: "zwischenstopp" });
  });

  it("teil=1 mit Schalter: nach dem Zwischenstopp folgen die 15 Folien von Teil 2", () => {
    const schritte = baueModerationsSchritte(1, true);
    expect(schritte).toHaveLength(23);
    expect(schritte[7]).toEqual({ art: "zwischenstopp" });
    expect(schritte[8]).toMatchObject({ art: "folie", folie: { id: TEIL_2_START_ID } });
    expect(schritte.slice(8).map((s) => (s.art === "folie" ? s.folie.id : s.art))).toEqual(ERWARTET.slice(7));
  });

  it("teil=2 hat keinen Zwischenstopp, egal wie der Schalter steht", () => {
    for (const schalter of [false, true]) {
      const schritte = baueModerationsSchritte(2, schalter);
      expect(schritte).toHaveLength(15);
      expect(schritte.every((s) => s.art === "folie")).toBe(true);
      expect(schritte[0]).toMatchObject({ art: "folie", folie: { id: TEIL_2_START_ID } });
    }
  });

  it("am Zwischenstopp zeigt die Präsentation weiter die letzte Teil-1-Folie", () => {
    expect(sichtbareFolieId({ art: "zwischenstopp" })).toBe("einwaende");
    const cover = getDeckFolie("cover")!;
    expect(sichtbareFolieId({ art: "folie", folie: cover })).toBe("cover");
  });
});
