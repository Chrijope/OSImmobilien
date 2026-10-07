import { describe, it, expect, vi, afterEach } from "vitest";
import {
  kennungAusText,
  eigeneKennung,
  istNeueFassung,
  kennungenAusText,
  ladeKennungenVomServer,
  merkeAusgeblendet,
  istAusgeblendet,
  hebeAusblendenAuf,
} from "./versionspruefung";

/**
 * Warum das hier abgesichert ist: Ein Vertriebspartner konnte vier Tage lang
 * nichts speichern, weil sein Tab mit einem alten Programmstand lief. Der
 * Hinweis darauf darf zwei Fehler nicht machen. Er darf nicht fehlen, wenn
 * wirklich eine neue Fassung bereitliegt, und er darf erst recht nicht
 * grundlos erscheinen. Ein falscher Hinweis kostet den Nutzer seine
 * ungespeicherten Eingaben, denn er wird klicken.
 */

/** Eine Antwort, wie `fetch` sie liefern wuerde. */
function antwort(html: string, ok = true) {
  return { ok, text: async () => html } as Response;
}

const SEITE = (kennung: string) =>
  `<!doctype html><html><head><script type="module" crossorigin src="/assets/index-${kennung}.js"></script></head><body><div id="root"></div></body></html>`;

afterEach(() => {
  vi.restoreAllMocks();
  try { sessionStorage.clear(); } catch { /* egal */ }
});

describe("kennungAusText", () => {
  it("liest die Kennung aus dem gebauten Dateinamen", () => {
    // Die beiden Werte stammen aus dem Betrieb, vor und nach einem Publish.
    expect(kennungAusText(SEITE("CN1gPhdz"))).toBe("CN1gPhdz");
    expect(kennungAusText("/assets/index-jRKpUThU.js")).toBe("jRKpUThU");
  });

  it("sammelt alle Kennungen, nicht nur die erste", () => {
    // Die Stylesheet-Zeile darf nicht mitgezaehlt werden, sie endet auf .css.
    const html = '<link rel="modulepreload" href="/assets/index-S6OnyksF.js">'
      + '<script src="/assets/index-CuHSyqqR.js"></script>'
      + '<link rel="stylesheet" href="/assets/index-jSrGWtBC.css">';
    expect(kennungenAusText(html)).toEqual(["S6OnyksF", "CuHSyqqR"]);
  });

  it("gibt null, wo das Muster nicht vorkommt", () => {
    // So sieht die Seite im Entwicklungsbetrieb aus.
    expect(kennungAusText('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
    expect(kennungAusText("")).toBeNull();
    expect(kennungAusText(null)).toBeNull();
  });
});

describe("eigeneKennung", () => {
  it("findet die laufende Kennung im Script-Tag", () => {
    const dok = new DOMParser().parseFromString(SEITE("CN1gPhdz"), "text/html");
    expect(eigeneKennung(dok)).toBe("CN1gPhdz");
  });

  it("gibt im Entwicklungsbetrieb null zurueck", () => {
    const dok = new DOMParser().parseFromString(
      '<html><head><script type="module" src="/src/main.tsx"></script></head><body></body></html>',
      "text/html",
    );
    expect(eigeneKennung(dok)).toBeNull();
  });
});

describe("istNeueFassung", () => {
  it("sagt nein bei gleicher Kennung", () => {
    expect(istNeueFassung("CN1gPhdz", ["CN1gPhdz"])).toBe(false);
  });

  it("sagt ja bei anderer Kennung", () => {
    expect(istNeueFassung("CN1gPhdz", ["jRKpUThU"])).toBe(true);
  });

  it("sagt nein, solange die eigene Kennung noch dabei ist", () => {
    // Der Build legt mehr als eine Datei namens assets/index-….js an. Steht
    // die eigene noch in der Antwort, ist nichts neu.
    expect(istNeueFassung("CN1gPhdz", ["S6OnyksF", "CN1gPhdz"])).toBe(false);
  });

  it("sagt nein, solange eine der beiden Angaben fehlt", () => {
    expect(istNeueFassung(null, ["jRKpUThU"])).toBe(false);
    expect(istNeueFassung("CN1gPhdz", null)).toBe(false);
    expect(istNeueFassung("CN1gPhdz", [])).toBe(false);
    expect(istNeueFassung(null, null)).toBe(false);
  });
});

describe("ladeKennungenVomServer", () => {
  it("fragt ohne Zwischenspeicher", async () => {
    const holen = vi.fn(async () => antwort(SEITE("jRKpUThU"))) as unknown as typeof fetch;
    expect(await ladeKennungenVomServer(holen)).toEqual(["jRKpUThU"]);
    expect(holen).toHaveBeenCalledWith("/", { cache: "reload" });
  });

  it("schweigt, wenn die Abfrage fehlschlaegt", async () => {
    const konsole = vi.spyOn(console, "error").mockImplementation(() => { /* still */ });
    const holen = vi.fn(async () => { throw new Error("Netz weg"); }) as unknown as typeof fetch;

    // Kein Hinweis und kein Laerm in der Konsole.
    expect(await ladeKennungenVomServer(holen)).toBeNull();
    expect(istNeueFassung("CN1gPhdz", await ladeKennungenVomServer(holen))).toBe(false);
    expect(konsole).not.toHaveBeenCalled();
  });

  it("schweigt bei einer Fehlerseite des Servers", async () => {
    const holen = vi.fn(async () => antwort("<h1>502</h1>", false)) as unknown as typeof fetch;
    expect(await ladeKennungenVomServer(holen)).toBeNull();
  });

  it("schweigt, wenn die Antwort das Muster nicht enthaelt", async () => {
    const holen = vi.fn(async () => antwort("<html><body>Wartung</body></html>")) as unknown as typeof fetch;
    expect(await ladeKennungenVomServer(holen)).toBeNull();
    expect(istNeueFassung("CN1gPhdz", null)).toBe(false);
  });
});

describe("Wegklicken", () => {
  it("merkt sich das Ausblenden und nimmt es wieder zurueck", () => {
    expect(istAusgeblendet()).toBe(false);
    merkeAusgeblendet();
    expect(istAusgeblendet()).toBe(true);
    hebeAusblendenAuf();
    expect(istAusgeblendet()).toBe(false);
  });

  it("kommt ohne Seitenspeicher zurecht", () => {
    // In einem privaten Fenster wirft schon der Zugriff auf den Speicher.
    const echt = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() { throw new Error("gesperrt"); },
    });

    try {
      expect(() => merkeAusgeblendet()).not.toThrow();
      expect(istAusgeblendet()).toBe(false);
      expect(() => hebeAusblendenAuf()).not.toThrow();
    } finally {
      if (echt) Object.defineProperty(window, "sessionStorage", echt);
    }
  });
});
