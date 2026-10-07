import { describe, it, expect, vi, afterEach } from "vitest";
import {
  kannSchweben, oeffneSchwebendesFenster, schliesseSchwebendesFenster, uebertrageStile,
} from "./schwebendesFenster";

/**
 * Das schwebende Fenster gibt es nur in Chrome. Safari und Firefox kennen die
 * Technik nicht, und dort muss alles genau so bleiben wie bisher: kein
 * Fenster, kein Fehler, kein Hinweis. Deshalb steht die Verfuegbarkeitsfrage
 * hier abgesichert.
 */

/** Ein Fenster, wie der Browser es liefern wuerde. */
function bauFakeFenster() {
  const dok = document.implementation.createHTMLDocument("Test");
  return {
    document: dok,
    closed: false,
    close() { this.closed = true; },
    addEventListener: vi.fn(),
  } as unknown as Window & { closed: boolean };
}

function setzeSchnittstelle(wert: unknown) {
  Object.defineProperty(window, "documentPictureInPicture", {
    value: wert,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).documentPictureInPicture;
  vi.restoreAllMocks();
});

describe("kannSchweben", () => {
  it("sagt nein, wo der Browser die Technik nicht kennt", () => {
    expect(kannSchweben()).toBe(false);
  });

  it("sagt nein, wenn es den Namen zwar gibt, aber keine Funktion dahinter", () => {
    setzeSchnittstelle({});
    expect(kannSchweben()).toBe(false);
  });

  it("sagt ja, sobald `requestWindow` da ist", () => {
    setzeSchnittstelle({ requestWindow: () => Promise.resolve(bauFakeFenster()), window: null });
    expect(kannSchweben()).toBe(true);
  });
});

describe("oeffneSchwebendesFenster", () => {
  it("gibt null zurück, wo der Browser es nicht kann, und wirft nicht", async () => {
    await expect(oeffneSchwebendesFenster()).resolves.toBeNull();
  });

  it("gibt null zurück, wenn der Browser ablehnt, etwa ohne Nutzergeste", async () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    setzeSchnittstelle({
      requestWindow: () => Promise.reject(new Error("NotAllowedError")),
      window: null,
    });
    await expect(oeffneSchwebendesFenster()).resolves.toBeNull();
    // Nur in der Konsole, nicht vor dem Nutzer.
    expect(warnung).toHaveBeenCalled();
  });

  it("öffnet das Fenster und nimmt die Stilvorlage mit", async () => {
    const fenster = bauFakeFenster();
    setzeSchnittstelle({ requestWindow: () => Promise.resolve(fenster), window: null });

    const stil = document.createElement("style");
    stil.textContent = ".kachel { color: red; }";
    document.head.appendChild(stil);

    const ergebnis = await oeffneSchwebendesFenster();
    expect(ergebnis).toBe(fenster);
    // Ohne die Vorlage wirkt im neuen Dokument keine einzige Klasse.
    expect(fenster.document.head.querySelectorAll("style").length).toBeGreaterThan(1);
    expect(fenster.document.head.textContent).toContain("color: red");
    expect(fenster.document.title).toContain("MORE Immo");

    stil.remove();
  });

  it("liefert das schon offene Fenster, statt ein zweites zu verlangen", async () => {
    const offen = bauFakeFenster();
    const verlangt = vi.fn();
    setzeSchnittstelle({ requestWindow: verlangt, window: offen });
    await expect(oeffneSchwebendesFenster()).resolves.toBe(offen);
    expect(verlangt).not.toHaveBeenCalled();
  });
});

describe("uebertrageStile", () => {
  it("verlinkt ein Blatt fremder Herkunft, dessen Regeln gesperrt sind", () => {
    const ziel = document.implementation.createHTMLDocument("Ziel");
    const gesperrt = {
      get cssRules(): CSSRuleList { throw new Error("SecurityError"); },
      href: "https://fonts.example/schrift.css",
      media: { mediaText: "" },
    } as unknown as CSSStyleSheet;
    const quelle = {
      styleSheets: [gesperrt] as unknown as StyleSheetList,
      head: document.implementation.createHTMLDocument("Quelle").head,
    } as unknown as Document;

    uebertrageStile(ziel, quelle);
    const verweis = ziel.head.querySelector("link");
    expect(verweis?.getAttribute("href")).toBe("https://fonts.example/schrift.css");
  });
});

describe("schliesseSchwebendesFenster", () => {
  it("macht ein offenes Fenster zu", () => {
    const fenster = bauFakeFenster();
    schliesseSchwebendesFenster(fenster);
    expect(fenster.closed).toBe(true);
  });

  it("verträgt null und ein bereits geschlossenes Fenster", () => {
    expect(() => schliesseSchwebendesFenster(null)).not.toThrow();
    const fenster = bauFakeFenster();
    fenster.close();
    expect(() => schliesseSchwebendesFenster(fenster)).not.toThrow();
  });
});
