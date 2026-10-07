import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEITEN_SPRACHE_SPEICHER,
  ermittleSeitenSprache,
  leseGemerkteSeitenSprache,
  merkeSeitenSprache,
  mitSeitenSprache,
  spracheAusBrowser,
} from "@/lib/seitenSprache";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/*
 * Sprache der anonymen Seiten (Plan Kundensprache, Etappe 6):
 * `?lang=` vor gemerkter Wahl vor Browsersprache vor Deutsch.
 */

describe("ermittleSeitenSprache: Reihenfolge", () => {
  it("?lang= hat Vorrang vor der Browsersprache", () => {
    expect(ermittleSeitenSprache({ parameter: "de", browser: ["en-GB"] })).toBe("de");
    expect(ermittleSeitenSprache({ parameter: "en", browser: ["de-DE"] })).toBe("en");
  });

  it("?lang= hat Vorrang vor der gemerkten Wahl", () => {
    expect(ermittleSeitenSprache({ parameter: "en", gemerkt: "de", browser: ["de-DE"] })).toBe("en");
    expect(ermittleSeitenSprache({ parameter: "de", gemerkt: "en", browser: ["en-US"] })).toBe("de");
  });

  it("die gemerkte Wahl hat Vorrang vor der Browsersprache", () => {
    expect(ermittleSeitenSprache({ gemerkt: "de", browser: ["en-US"] })).toBe("de");
    expect(ermittleSeitenSprache({ gemerkt: "en", browser: ["de-DE"] })).toBe("en");
  });

  it("die Browsersprache hat Vorrang vor Deutsch", () => {
    expect(ermittleSeitenSprache({ browser: ["en-US", "de"] })).toBe("en");
    expect(ermittleSeitenSprache({ browser: ["en"] })).toBe("en");
  });

  it("ohne Angaben gilt Deutsch", () => {
    expect(ermittleSeitenSprache({})).toBe("de");
    expect(ermittleSeitenSprache({ parameter: null, gemerkt: null, browser: [] })).toBe("de");
  });

  it("ein unbekannter Parameter zählt nicht, dann entscheidet die nächste Quelle", () => {
    expect(ermittleSeitenSprache({ parameter: "fr", browser: ["en-GB"] })).toBe("en");
    expect(ermittleSeitenSprache({ parameter: "", browser: ["de-DE"] })).toBe("de");
    expect(ermittleSeitenSprache({ parameter: "EN" })).toBe("en");
  });
});

describe("spracheAusBrowser: nur klar Englisch", () => {
  it("Englisch nur, wenn die erste Sprache Englisch ist", () => {
    expect(spracheAusBrowser(["en-GB", "de-DE"])).toBe("en");
    expect(spracheAusBrowser(["de-DE", "en-US"])).toBeNull();
  });

  it("andere Sprachen ergeben keine Wahl, die Seite fällt auf Deutsch zurück", () => {
    expect(spracheAusBrowser(["fr-FR", "en-US"])).toBeNull();
    expect(spracheAusBrowser(["de"])).toBeNull();
    expect(spracheAusBrowser([])).toBeNull();
    expect(spracheAusBrowser(undefined)).toBeNull();
    expect(ermittleSeitenSprache({ browser: ["fr-FR", "en-US"] })).toBe("de");
  });
});

/** In dieser Testumgebung gibt es keinen `localStorage`, deshalb ein schlichter Ersatz. */
function speicherErsatz() {
  const werte = new Map<string, string>();
  const speicher = {
    getItem: (k: string) => werte.get(k) ?? null,
    setItem: (k: string, v: string) => void werte.set(k, String(v)),
    removeItem: (k: string) => void werte.delete(k),
  };
  vi.stubGlobal("localStorage", speicher);
  return speicher;
}

describe("gemerkte Wahl", () => {
  let speicher: ReturnType<typeof speicherErsatz>;
  beforeEach(() => { speicher = speicherErsatz(); });
  afterEach(() => vi.unstubAllGlobals());

  it("wird unter einem eigenen Schlüssel gemerkt, nicht unter dem des Portals", () => {
    merkeSeitenSprache("en");
    expect(speicher.getItem(SEITEN_SPRACHE_SPEICHER)).toBe("en");
    expect(speicher.getItem("moreimmo-crm-lang")).toBeNull();
    expect(leseGemerkteSeitenSprache()).toBe("en");
  });

  it("ohne Eintrag gibt es keine gemerkte Wahl", () => {
    expect(leseGemerkteSeitenSprache()).toBeNull();
  });

  it("ein fehlender Speicher bricht nichts", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(leseGemerkteSeitenSprache()).toBeNull();
    expect(() => merkeSeitenSprache("en")).not.toThrow();
  });
});

describe("mitSeitenSprache: Verweise behalten die Sprache", () => {
  it("hängt lang=en an, Deutsch bleibt ohne Parameter", () => {
    expect(mitSeitenSprache("/datenschutz", "en")).toBe("/datenschutz?lang=en");
    expect(mitSeitenSprache("/steuer?utm_source=ig", "en")).toBe("/steuer?utm_source=ig&lang=en");
    expect(mitSeitenSprache("/steuer#rechner", "en")).toBe("/steuer?lang=en#rechner");
    expect(mitSeitenSprache("/datenschutz", "de")).toBe("/datenschutz");
    expect(mitSeitenSprache("/steuer?lang=en", "en")).toBe("/steuer?lang=en");
  });
});

describe("Prüfhelfer für Textdateien", () => {
  it("meldet fehlende, leere und abweichende Einträge sowie Gedankenstriche", () => {
    const befunde = pruefeTexteVollstaendig({
      de: { a: "Hallo", b: "Welt", c: (n: number) => `${n} Tage`, d: ["x", "y"], e: "Eins – zwei" },
      en: { a: "Hello", b: "", c: () => "days", d: ["x"], f: "extra", e: "One, two" },
    });
    expect(befunde).toEqual(
      expect.arrayContaining([
        "EN leer: b",
        "Funktion mit 1 gegen 0 Werten: c",
        "EN fehlt: d[1]",
        "DE fehlt: f",
        expect.stringContaining("Gedankenstrich im Deutschen: e"),
      ]),
    );
  });

  it("ein vollständiges Paar ergibt keine Befunde", () => {
    expect(pruefeTexteVollstaendig({ de: { a: "Hallo", n: (x: number) => `${x}` }, en: { a: "Hello", n: (x: number) => `${x}` } })).toEqual([]);
    expect(gleicheTexte({ de: { a: "OS Immobilien", b: "Hallo" }, en: { a: "OS Immobilien", b: "Hello" } })).toEqual(["a"]);
  });
});
