import { describe, it, expect } from "vitest";
import {
  GRUND_SONSTIGES,
  GRUND_TEXT_MAX,
  UEBERGABE_GRUENDE,
  findeGrund,
  grundSatz,
  grundVollstaendig,
  normalisiereGrund,
} from "./uebergabeGrund";

/**
 * Der Grund einer Lead-Uebergabe.
 *
 * Geprueft wird das, woran die Pflichtangabe haengt: Was zaehlt als
 * vollstaendig, was landet gespeichert am Kontakt, und wie liest es der
 * Kollege, der den Lead bekommt.
 */

describe("Die angebotenen Gründe", () => {
  it("haben eindeutige Schlüssel und eine Beschriftung", () => {
    const keys = UEBERGABE_GRUENDE.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const g of UEBERGABE_GRUENDE) {
      expect(g.label.trim().length).toBeGreaterThan(0);
      expect(g.hinweis.trim().length).toBeGreaterThan(0);
    }
  });

  it("decken die Fälle ab, die im Vertrieb wirklich vorkommen", () => {
    const keys = UEBERGABE_GRUENDE.map((g) => g.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "abwesenheit",
        "auslastung",
        "kein_kontakt",
        "region",
        "eignung",
        "sprache",
        "kundenwunsch",
        "ausgeschieden",
        GRUND_SONSTIGES,
      ]),
    );
  });

  it("findet einen Grund über seinen Schlüssel, auch mit Leerzeichen", () => {
    expect(findeGrund(" abwesenheit ")?.label).toBe("Urlaub oder Abwesenheit");
    expect(findeGrund("gibtesnicht")).toBeUndefined();
    expect(findeGrund(undefined)).toBeUndefined();
  });
});

describe("Wann ist der Grund vollständig?", () => {
  it("verlangt überhaupt eine Angabe", () => {
    expect(grundVollstaendig(undefined)).toBe(false);
    expect(grundVollstaendig({})).toBe(false);
    expect(grundVollstaendig({ key: "" })).toBe(false);
  });

  it("lässt bloßen Freitext ohne gewählten Grund nicht durch", () => {
    // Sonst entstünde eine zweite, unsortierbare Sammelstelle neben den
    // Vorschlägen. Wer frei schreiben will, nimmt "Sonstiges".
    expect(grundVollstaendig({ text: "passt hier besser" })).toBe(false);
  });

  it("nimmt einen angetippten Grund ohne weiteren Text", () => {
    expect(grundVollstaendig({ key: "abwesenheit" })).toBe(true);
    expect(grundVollstaendig({ key: "region" })).toBe(true);
  });

  it("verlangt bei Sonstiges eine kurze Beschreibung", () => {
    expect(grundVollstaendig({ key: GRUND_SONSTIGES })).toBe(false);
    expect(grundVollstaendig({ key: GRUND_SONSTIGES, text: "   " })).toBe(false);
    expect(grundVollstaendig({ key: GRUND_SONSTIGES, text: "Kunde ist ein Verwandter" })).toBe(true);
  });

  it("weist erfundene Schlüssel ab", () => {
    expect(grundVollstaendig({ key: "weilich" })).toBe(false);
  });
});

describe("Wie der Empfänger den Grund liest", () => {
  it("nennt den Grund allein, wenn nichts ergänzt wurde", () => {
    expect(grundSatz({ key: "auslastung" })).toBe("Auslastung");
  });

  it("hängt die Ergänzung mit Doppelpunkt an", () => {
    expect(grundSatz({ key: "abwesenheit", text: "bis 30.09. im Urlaub" })).toBe(
      "Urlaub oder Abwesenheit: bis 30.09. im Urlaub",
    );
  });

  it("gibt bei fehlendem Grund nichts zurück statt undefined", () => {
    expect(grundSatz(undefined)).toBe("");
    expect(grundSatz({})).toBe("");
  });
});

describe("Was gespeichert wird", () => {
  it("schneidet Leerzeichen weg", () => {
    expect(normalisiereGrund({ key: " region ", text: "  näher dran  " })).toEqual({
      key: "region",
      text: "näher dran",
    });
  });

  it("lässt den Schlüssel weg, wenn er unbekannt ist", () => {
    expect(normalisiereGrund({ key: "quatsch", text: "etwas" })).toEqual({ text: "etwas" });
    expect(normalisiereGrund({ key: "quatsch" })).toBeUndefined();
  });

  it("kürzt einen zu langen Freitext, statt ihn abzulehnen", () => {
    const lang = "x".repeat(GRUND_TEXT_MAX + 50);
    expect(normalisiereGrund({ key: GRUND_SONSTIGES, text: lang })?.text?.length).toBe(GRUND_TEXT_MAX);
  });
});
