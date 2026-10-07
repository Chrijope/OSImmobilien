import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DESIGN_SPEICHER_SCHLUESSEL,
  LIQUID_GLASS_STANDARD,
  bestimmeDesign,
  designAusAdresse,
  ohneLiquidGlasInKopie,
  wendeDesignAn,
} from "./designSchalter";

/**
 * Der Schalter fuer Liquid Glass. Wichtig ist vor allem das, was NICHT
 * passieren darf: Ohne `?design=liquid` bleibt alles, wie es ist, und ein
 * gesperrter Speicher haelt die Seite nicht auf.
 */

function setzeAdresse(suche: string) {
  window.history.replaceState(null, "", `/${suche}`);
}

/*
 * In dieser Testumgebung gibt es keinen `localStorage` (siehe auch
 * `GlobaleSuche.test.tsx`). Ein kleiner Speicher im Arbeitsspeicher genuegt.
 */
function baueSpeicher(werfen = false): Storage {
  const daten = new Map<string, string>();
  const pruefe = () => {
    if (werfen) throw new Error("gesperrt");
  };
  return {
    get length() {
      return daten.size;
    },
    clear: () => daten.clear(),
    key: (i: number) => [...daten.keys()][i] ?? null,
    getItem: (k: string) => (pruefe(), daten.get(k) ?? null),
    setItem: (k: string, v: string) => (pruefe(), void daten.set(k, v)),
    removeItem: (k: string) => void daten.delete(k),
  };
}
function nimmSpeicher(speicher: Storage) {
  Object.defineProperty(window, "localStorage", { configurable: true, writable: true, value: speicher });
}

beforeEach(() => {
  nimmSpeicher(baueSpeicher());
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.dataset.glas = "an";
  document.querySelectorAll(".lg-grund").forEach((el) => el.remove());
  setzeAdresse("");
});

describe("Der Standard", () => {
  it("ist seit Christians Freigabe am 23.09.2026 an", () => {
    /*
      Die eine Zeile fuer die Umstellung. Sie stand bis zum 23.09.2026 auf
      `false`, damit ausser Christian niemand einen halben Stand sieht. Er hat
      sie an diesem Tag umgelegt: Liquid Glass gilt jetzt fuer alle, die keinen
      eigenen Wunsch gemerkt haben. Wer `?design=heute` aufgerufen hat, behaelt
      das bisherige Aussehen.
    */
    expect(LIQUID_GLASS_STANDARD).toBe(true);
  });
});

describe("designAusAdresse", () => {
  it("erkennt beide Werte und sonst nichts", () => {
    expect(designAusAdresse("?design=liquid")).toBe("liquid");
    expect(designAusAdresse("?x=1&design=heute")).toBe("heute");
    expect(designAusAdresse("?design=LIQUID")).toBeNull();
    expect(designAusAdresse("?design=")).toBeNull();
    expect(designAusAdresse("")).toBeNull();
  });
});

describe("bestimmeDesign", () => {
  it("nimmt zuerst die Adresse, dann das Gemerkte, dann den Standard", () => {
    expect(bestimmeDesign("heute", "liquid", true)).toBe("heute");
    expect(bestimmeDesign(null, "liquid", false)).toBe("liquid");
    expect(bestimmeDesign(null, "heute", true)).toBe("heute");
    expect(bestimmeDesign(null, null, false)).toBe("heute");
    expect(bestimmeDesign(null, null, true)).toBe("liquid");
  });

  it("uebergeht Unsinn im Speicher", () => {
    expect(bestimmeDesign(null, "blau", false)).toBe("heute");
  });
});

describe("wendeDesignAn", () => {
  it("nimmt ohne Wunsch den Standard, seit dem 23.09.2026 also Liquid Glass", () => {
    expect(wendeDesignAn()).toBe("liquid");
    expect(document.documentElement.dataset.glas).toBe("liquid");
    expect(document.querySelector(".lg-grund")).not.toBeNull();
  });

  it("laesst mit gemerktem heute alles beim Alten, trotz Standard", () => {
    window.localStorage.setItem(DESIGN_SPEICHER_SCHLUESSEL, "heute");
    expect(wendeDesignAn()).toBe("heute");
    expect(document.documentElement.dataset.glas).toBe("an");
    expect(document.querySelector(".lg-grund")).toBeNull();
  });

  it("schaltet mit ?design=liquid ein, legt den Grund an und merkt es sich", () => {
    setzeAdresse("?design=liquid");
    expect(wendeDesignAn()).toBe("liquid");
    expect(document.documentElement.dataset.glas).toBe("liquid");
    expect(document.querySelectorAll(".lg-grund .lg-grund-wolken")).toHaveLength(1);
    expect(document.querySelector(".lg-grund")?.getAttribute("aria-hidden")).toBe("true");
    expect(window.localStorage.getItem(DESIGN_SPEICHER_SCHLUESSEL)).toBe("liquid");

    // Beim naechsten Aufruf ohne Zusatz gilt das Gemerkte, und der Grund
    // wird nicht doppelt angelegt.
    setzeAdresse("");
    expect(wendeDesignAn()).toBe("liquid");
    expect(document.querySelectorAll(".lg-grund")).toHaveLength(1);
  });

  it("schaltet mit ?design=heute wieder aus", () => {
    window.localStorage.setItem(DESIGN_SPEICHER_SCHLUESSEL, "liquid");
    setzeAdresse("?design=heute");
    expect(wendeDesignAn()).toBe("heute");
    expect(document.documentElement.dataset.glas).toBe("an");
    expect(window.localStorage.getItem(DESIGN_SPEICHER_SCHLUESSEL)).toBe("heute");
  });

  it("startet auch, wenn der Speicher wirft oder fehlt", () => {
    // Ohne lesbaren Speicher gibt es keinen gemerkten Wunsch, also der Standard.
    nimmSpeicher(baueSpeicher(true));
    expect(wendeDesignAn()).toBe("liquid");
    setzeAdresse("?design=heute");
    expect(wendeDesignAn()).toBe("heute");

    nimmSpeicher(undefined as unknown as Storage);
    setzeAdresse("");
    expect(wendeDesignAn()).toBe("liquid");
    setzeAdresse("?design=liquid");
    expect(wendeDesignAn()).toBe("liquid");
  });
});

describe("ohneLiquidGlasInKopie", () => {
  it("setzt in der Kopie fuer den Export das heutige Aussehen", () => {
    const kopie = document.implementation.createHTMLDocument("kopie");
    kopie.documentElement.dataset.glas = "liquid";
    const grund = kopie.createElement("div");
    grund.className = "lg-grund";
    kopie.body.appendChild(grund);

    ohneLiquidGlasInKopie(kopie);

    expect(kopie.documentElement.dataset.glas).toBe("an");
    expect(kopie.querySelector(".lg-grund")).toBeNull();
  });
});
