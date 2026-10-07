/**
 * Die Anzeigesprache des Portals (Plan Kundensprache, Etappe 1).
 *
 *   - Die Browsersprache zählt nicht mehr, nur `?lang=` und die gemerkte Wahl.
 *   - Bei jeder neuen Anmeldung gilt die Profilsprache.
 *   - Der Umschalter gilt danach bis zur nächsten Anmeldung.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In dieser Testumgebung gibt es keinen localStorage. Eine kleine Attrappe,
// früh genug angelegt, damit auch i18next ihn beim Start findet.
vi.hoisted(() => {
  const speicher = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
      removeItem: (k: string) => { speicher.delete(k); },
      clear: () => speicher.clear(),
      key: (i: number) => [...speicher.keys()][i] ?? null,
      get length() { return speicher.size; },
    },
  });
});
import { renderHook } from "@testing-library/react";
import i18n from "@/i18n";
import {
  PROFILSPRACHE_ANMELDUNG_SCHLUESSEL,
  portalLocale,
  portalSprache,
  setzeAnzeigeSprache,
  uebernimmProfilsprache,
  useHtmlLang,
} from "./portalSprache";

const EN = { kundenSprache: "en", kundenSpracheGesetztAm: "2026-09-25T10:00:00Z" };

beforeEach(async () => {
  window.localStorage.removeItem(PROFILSPRACHE_ANMELDUNG_SCHLUESSEL);
  await i18n.changeLanguage("de");
});
afterEach(async () => {
  window.localStorage.removeItem(PROFILSPRACHE_ANMELDUNG_SCHLUESSEL);
  await i18n.changeLanguage("de");
  document.documentElement.lang = "de";
});

describe("Spracherkennung", () => {
  it("liest nur ?lang= und die gemerkte Wahl, nie die Browsersprache", () => {
    const erkennung = (i18n.options as { detection?: { order?: string[]; lookupQuerystring?: string } }).detection;
    expect(erkennung?.order).toEqual(["querystring", "localStorage"]);
    expect(erkennung?.lookupQuerystring).toBe("lang");
  });
});

describe("Profilsprache bei der Anmeldung", () => {
  it("stellt nach einer neuen Anmeldung auf die Profilsprache", () => {
    expect(uebernimmProfilsprache(EN, "nutzer-1|2026-09-25T10:00:00Z")).toBe("en");
    expect(portalSprache()).toBe("en");
    expect(portalLocale()).toBe("en-GB");
  });

  it("der Umschalter gilt bis zur nächsten Anmeldung, auch nach dem Neuladen", () => {
    uebernimmProfilsprache(EN, "nutzer-1|anmeldung-1");
    setzeAnzeigeSprache("de"); // Kunde schaltet oben auf Deutsch
    // Neuladen: dieselbe Anmeldung, die Wahl des Kunden bleibt
    expect(uebernimmProfilsprache(EN, "nutzer-1|anmeldung-1")).toBe("en");
    expect(portalSprache()).toBe("de");
    // Neue Anmeldung: wieder die Profilsprache
    uebernimmProfilsprache(EN, "nutzer-1|anmeldung-2");
    expect(portalSprache()).toBe("en");
  });

  it("ohne Eintrag im Profil gilt Deutsch, auch wenn der Browser zuletzt Englisch zeigte", () => {
    setzeAnzeigeSprache("en");
    expect(uebernimmProfilsprache({}, "nutzer-2|anmeldung-1")).toBe("de");
    expect(portalSprache()).toBe("de");
  });
});

describe("<html lang>", () => {
  it("folgt der Anzeigesprache und steht beim Verlassen wieder auf de", async () => {
    const { unmount } = renderHook(() => useHtmlLang());
    expect(document.documentElement.lang).toBe("de");
    await i18n.changeLanguage("en");
    expect(document.documentElement.lang).toBe("en");
    unmount();
    expect(document.documentElement.lang).toBe("de");
  });
});
