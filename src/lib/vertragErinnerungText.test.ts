import { describe, it, expect } from "vitest";
import {
  gespraechNach,
  meldeSichText,
  naechsteBewerberErinnerung,
  tageWort,
} from "../../supabase/functions/_shared/vertrag-erinnerung-text";

/**
 * Die beiden Vertragserinnerungen sagen "vor vier Tagen" und "seit zehn
 * Tagen". Die Zahl steht aber nicht fest: Fällt der Versandtag auf ein
 * Wochenende, geht die Mail erst am Montag hinaus, und der Vertrag liegt dann
 * länger. Ein fest geschriebenes Zahlwort wäre in dem Fall schlicht falsch.
 *
 * Dieser Test hält die Grenzfälle fest, an denen so ein Helfer üblicherweise
 * hässlich wird: die Eins mit ihrer eigenen Beugung, die Null, eine fehlende
 * Zahl und die Stelle, ab der wieder Ziffern stehen.
 */
describe("tageWort", () => {
  it("schreibt die üblichen Abstände als Wort", () => {
    expect(tageWort(4)).toBe("vier Tagen");
    expect(tageWort(10)).toBe("zehn Tagen");
    expect(tageWort(12)).toBe("zwölf Tagen");
  });

  it("beugt die Eins mit", () => {
    expect(tageWort(1)).toBe("einem Tag");
  });

  it("nimmt ab dreizehn wieder die Ziffer", () => {
    expect(tageWort(13)).toBe("13 Tagen");
  });

  it("bleibt ohne brauchbare Zahl unbestimmt", () => {
    // Lieber vage als erfunden: Der Bewerber kann nachsehen, wann die
    // Vertragsmail kam, und eine falsche Zahl fällt ihm sofort auf.
    expect(tageWort(undefined)).toBe("einigen Tagen");
    expect(tageWort(0)).toBe("einigen Tagen");
    expect(tageWort(-3)).toBe("einigen Tagen");
    expect(tageWort(NaN)).toBe("einigen Tagen");
  });
});

/**
 * Die zweite Erinnerung kündigt an, dass sich jemand persönlich meldet. Steht
 * keine HR-Managerin fest, darf dort kein Platzhalter stehen.
 */
describe("meldeSichText", () => {
  it("nennt den Vornamen", () => {
    expect(meldeSichText("Sarah Kaiser-Thom")).toBe("meldet sich Sarah");
  });

  it("nennt niemanden, wenn niemand feststeht", () => {
    expect(meldeSichText(undefined)).toBe("melden wir uns");
    expect(meldeSichText("   ")).toBe("melden wir uns");
  });
});

/**
 * Drei Stufen an Tag 5, 7 und 14 (Christian, 30.09.2026). Immer die
 * niedrigste offene, damit niemand die Abschlussmail ohne beide Erinnerungen
 * bekommt, und Stufe 3 nicht, wenn HR nach dem Versand gesprochen hat.
 */
describe("naechsteBewerberErinnerung", () => {
  const id = (tage: number, bereits: string[] = [], gespraech = false) =>
    naechsteBewerberErinnerung(tage, bereits, gespraech)?.id ?? null;

  it("folgt den Tagen 5, 7 und 14", () => {
    expect(id(4)).toBeNull();
    expect(id(5)).toBe("e1");
    expect(id(6, ["e1"])).toBeNull();
    expect(id(7, ["e1"])).toBe("e2");
    expect(id(13, ["e1", "e2"])).toBeNull();
    expect(id(14, ["e1", "e2"])).toBe("e3");
    expect(id(20, ["e1", "e2", "e3"])).toBeNull();
  });

  it("holt eine verpasste Stufe nach, statt sie zu überspringen", () => {
    // Tag 5 und 6 am Wochenende: Montag an Tag 7 kommt zuerst Stufe 1.
    expect(id(7)).toBe("e1");
    expect(id(8, ["e1"])).toBe("e2");
    // Selbst an Tag 14 geht ohne beide Erinnerungen keine Abschlussmail.
    expect(id(14)).toBe("e1");
    expect(id(15, ["e1"])).toBe("e2");
  });

  it("schließt nicht, wenn HR nach dem Versand mit dem Bewerber gesprochen hat", () => {
    expect(id(14, ["e1", "e2"], true)).toBeNull();
    // Die beiden Erinnerungen laufen trotzdem.
    expect(id(5, [], true)).toBe("e1");
  });
});

describe("gespraechNach", () => {
  const versand = "2026-09-20T10:00:00.000Z";
  it("zählt nur erreichte Versuche nach dem Versand", () => {
    expect(gespraechNach(undefined, versand)).toBe(false);
    expect(gespraechNach([{ datum: "2026-09-25T10:00:00.000Z", ergebnis: "nicht_erreicht" }], versand)).toBe(false);
    expect(gespraechNach([{ datum: "2026-09-19T10:00:00.000Z", ergebnis: "erreicht" }], versand)).toBe(false);
    expect(gespraechNach([{ datum: "2026-09-25T10:00:00.000Z", ergebnis: "erreicht" }], versand)).toBe(true);
  });
});
