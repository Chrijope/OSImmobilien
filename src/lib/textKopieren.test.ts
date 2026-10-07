import { describe, it, expect, vi, afterEach } from "vitest";
import { kopiereText } from "@/lib/textKopieren";

/**
 * Der Anlass, Christian am 18.09.2026: Ein Klick auf „Kundenlink" hat ihm den
 * Browser haengen lassen. Die drei Faelle dahinter stehen in `textKopieren`,
 * und genau sie stehen hier auf dem Pruefstand. Wichtig ist nicht, dass das
 * Kopieren gelingt, sondern dass der Aufrufer IMMER eine Antwort bekommt und
 * damit den Link zum Markieren zeigen kann.
 */

function setzeZwischenablage(writeText: unknown): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });
}

/**
 * jsdom kennt `document.execCommand` gar nicht, deshalb wird der alte Weg hier
 * gesetzt. Genau das ist auch der Grund, warum `textKopieren` ihn erst auf
 * seine Existenz prueft: In manchen Umgebungen gibt es ihn schlicht nicht.
 */
function setzeAltenWeg(ergebnis: boolean | null): () => boolean {
  const alt = vi.fn().mockReturnValue(ergebnis === null ? undefined : ergebnis);
  Object.defineProperty(document, "execCommand", { configurable: true, value: alt });
  return alt;
}

afterEach(() => {
  setzeZwischenablage(undefined);
  Reflect.deleteProperty(document, "execCommand");
  vi.restoreAllMocks();
});

describe("kopiereText", () => {
  it("nimmt den gewoehnlichen Weg, wenn der Browser ihn zulaesst", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setzeZwischenablage(writeText);

    await expect(kopiereText("https://portal.more.immo/raum/abc")).resolves.toBe("kopiert");
    expect(writeText).toHaveBeenCalledWith("https://portal.more.immo/raum/abc");
  });

  it("gibt auf, wenn die Zwischenablage nie antwortet, statt stehenzubleiben", async () => {
    // Genau der Fall aus der Lovable-Vorschau: Chrome fragt nach der Erlaubnis,
    // das Versprechen loest weder ein noch scheitert es. Ohne Zeitgrenze
    // geschieht auf den Klick hin gar nichts, und das sah aus wie ein Haenger.
    setzeZwischenablage(() => new Promise(() => { /* antwortet nie */ }));
    setzeAltenWeg(false);

    const ergebnis = await kopiereText("https://portal.more.immo/raum/abc", 20);
    expect(ergebnis).toBe("gescheitert");
  });

  it("faellt nach einer Absage auf das Textfeld zurueck", async () => {
    setzeZwischenablage(vi.fn().mockRejectedValue(new DOMException("NotAllowedError")));
    const alt = setzeAltenWeg(true);

    await expect(kopiereText("Link")).resolves.toBe("kopiert");
    expect(alt).toHaveBeenCalledWith("copy");
  });

  it("stuerzt nicht ab, wenn es gar keine Zwischenablage gibt", async () => {
    // Kein sicherer Zusammenhang: `navigator.clipboard` ist dann `undefined`,
    // und der schlichte Zugriff darauf warf mitten im Klickbehandler.
    setzeZwischenablage(undefined);
    setzeAltenWeg(true);

    await expect(kopiereText("Link")).resolves.toBe("kopiert");
  });

  it("sagt ehrlich Bescheid, wenn beide Wege scheitern", async () => {
    setzeZwischenablage(vi.fn().mockRejectedValue(new Error("nein")));
    setzeAltenWeg(false);

    await expect(kopiereText("Link")).resolves.toBe("gescheitert");
  });

  it("kopiert keinen leeren Text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setzeZwischenablage(writeText);

    await expect(kopiereText("")).resolves.toBe("gescheitert");
    expect(writeText).not.toHaveBeenCalled();
  });
});
