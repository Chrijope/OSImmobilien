import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  MAX_TEILNEHMER, MAX_GEGENSTELLEN,
  istHoeflichGegenueber, nachrichtFuerMich, istGastgeberKennung,
  darfWeitereGegenstelle, fasseZustandZusammen, ordneStroemeZu, TEILEN_KAMERA,
} from "@/lib/videoraumVerbindung";

/**
 * Die reine Logik des Verbindungsnetzes: Wer je Paar hoeflich ist, wem eine
 * Nachricht gilt und wann der Raum voll ist. Die eigentliche WebRTC-Schicht
 * laesst sich ohne echten Browser nicht testen, diese Regeln schon, und an
 * ihnen haengt, ob sich vier Teilnehmer sauber verbinden.
 */

describe("Hoeflich-Regel je Paar", () => {
  it("ist deterministisch: die lexikografisch kleinere Kennung gibt nach", () => {
    expect(istHoeflichGegenueber("gast-aaa", "gast-bbb")).toBe(true);
    expect(istHoeflichGegenueber("gast-bbb", "gast-aaa")).toBe(false);
  });

  it("sieht jedes Paar genau einen Hoeflichen", () => {
    // Waeren beide hoeflich oder beide stur, blockierte sich das Paar bei
    // gleichzeitigen Angeboten gegenseitig.
    const kennungen = ["gastgeber-x1", "gast-a2", "gast-b3"];
    for (const a of kennungen) {
      for (const b of kennungen) {
        if (a === b) continue;
        expect(istHoeflichGegenueber(a, b)).toBe(!istHoeflichGegenueber(b, a));
      }
    }
  });

  it("laesst im Paar Gast/Gastgeber wie bisher den Gast nachgeben", () => {
    // "gast-…" sortiert vor "gastgeber-…". Das ist Absicht: so bleibt das
    // Verhalten des alten Zweiergespraechs erhalten.
    expect(istHoeflichGegenueber("gast-zzzzzzzz", "gastgeber-aaaaaaaa")).toBe(true);
    expect(istHoeflichGegenueber("gastgeber-aaaaaaaa", "gast-zzzzzzzz")).toBe(false);
  });
});

describe("Adressierung", () => {
  it("gilt mir, wenn ich als Empfaenger dranstehe", () => {
    expect(nachrichtFuerMich("gast-a", "gast-a")).toBe(true);
    expect(nachrichtFuerMich("gast-b", "gast-a")).toBe(false);
  });

  it("gilt allen, wenn kein Empfaenger dransteht (Rundruf)", () => {
    expect(nachrichtFuerMich(undefined, "gast-a")).toBe(true);
    expect(nachrichtFuerMich(null, "gast-a")).toBe(true);
  });

  it("erkennt die Gastgeberkennung", () => {
    // Daran haengt beim Gast, wessen Regie zaehlt und wessen Abschied das
    // Gespraech beendet.
    expect(istGastgeberKennung("gastgeber-abc12345")).toBe(true);
    expect(istGastgeberKennung("gast-abc12345")).toBe(false);
  });
});

describe("Obergrenze", () => {
  it("erlaubt hoechstens vier Teilnehmer, also drei Gegenstellen", () => {
    expect(MAX_TEILNEHMER).toBe(4);
    expect(MAX_GEGENSTELLEN).toBe(3);
  });

  it("laesst die vierte Gegenstelle nicht mehr zu", () => {
    expect(darfWeitereGegenstelle(0)).toBe(true);
    expect(darfWeitereGegenstelle(2)).toBe(true);
    expect(darfWeitereGegenstelle(3)).toBe(false);
    expect(darfWeitereGegenstelle(7)).toBe(false);
  });
});

/**
 * Welcher der beiden empfangenen Stroeme das Gesicht traegt und welcher den
 * Bildschirm.
 *
 * Seit dem 18.09.2026 sendet, wer teilt, beides zugleich. Vorher ersetzte der
 * Bildschirm die Kameraspur, das Gegenueber sah das Gesicht nicht mehr und die
 * Kachel blieb auf dem letzten Bild stehen. Die Zuordnung ist damit die
 * empfindlichste Stelle des ganzen Umbaus: Verwechselt der Empfaenger die
 * beiden, steht das Gesicht gross und der geteilte Inhalt als Briefmarke
 * daneben.
 *
 * Nicht die Reihenfolge entscheidet und nicht die Beschriftung der Spur, denn
 * beides traegt nicht verlaesslich, sondern die Kennung aus dem Rundruf.
 */
describe("Zuordnung der empfangenen Stroeme", () => {
  // Nur die Kennung zaehlt, mehr braucht die Funktion von einem Strom nicht.
  const strom = (id: string) => ({ id }) as MediaStream;

  it("nimmt den angekuendigten Strom als Bildschirm und den anderen als Gesicht", () => {
    const alltag = strom("alltag-1");
    const bildschirm = strom("schirm-9");
    expect(ordneStroemeZu([alltag, bildschirm], "schirm-9")).toEqual({
      stream: alltag, bildschirm,
    });
  });

  it("laesst sich von der Reihenfolge nicht beirren", () => {
    // Derselbe Fall, nur umgekehrt eingetroffen. In welcher Folge die Spuren
    // ankommen, ist nicht festgelegt.
    const alltag = strom("alltag-1");
    const bildschirm = strom("schirm-9");
    expect(ordneStroemeZu([bildschirm, alltag], "schirm-9")).toEqual({
      stream: alltag, bildschirm,
    });
  });

  it("haelt ohne Ankuendigung alles fuer den Alltagsstrom", () => {
    // So verhaelt sich die Anwendung gegenueber einem aelteren Stand auf der
    // Gegenseite: Dort steckt der Bildschirm in derselben einen Videospur.
    const einziger = strom("alltag-1");
    expect(ordneStroemeZu([einziger], null)).toEqual({ stream: einziger, bildschirm: null });
  });

  it("wartet, solange der angekuendigte Strom noch nicht da ist", () => {
    // Zwischen dem Rundruf und der fertigen Aushandlung liegen ein paar
    // hundert Millisekunden. Das Gesicht darf in dieser Zeit nicht zum
    // Bildschirm erklaert werden.
    const alltag = strom("alltag-1");
    expect(ordneStroemeZu([alltag], "schirm-9")).toEqual({ stream: alltag, bildschirm: null });
  });

  it("kommt auch ganz ohne Stroeme zurecht", () => {
    expect(ordneStroemeZu([], "schirm-9")).toEqual({ stream: null, bildschirm: null });
  });
});

describe("Drossel der Kamera waehrend des Teilens", () => {
  it("bleibt deutlich unter dem, was eine Kamera sonst braucht", () => {
    // Zwei Videospuren kosten deutlich mehr als eine, und der Kunde sitzt
    // womoeglich im Mobilfunknetz. Wichtig ist dort der geteilte Inhalt.
    expect(TEILEN_KAMERA.maxBitrate).toBeLessThanOrEqual(300_000);
    expect(TEILEN_KAMERA.scaleResolutionDownBy).toBeGreaterThan(1);
    expect(TEILEN_KAMERA.maxFramerate).toBeLessThanOrEqual(24);
  });

  it("verkleinert 1280 mal 720 auf ein Bild, das die Kachel noch fuellt", () => {
    // Gemessen am 18.09.2026: Die Kachel in der Reihe ist 149 mal 112 Punkte
    // gross. Auch bei dreifacher Punktdichte bleibt das Bild breit genug.
    const breite = 1280 / TEILEN_KAMERA.scaleResolutionDownBy;
    expect(breite).toBeGreaterThanOrEqual(149 * 2);
  });
});

describe("Gesamtzustand", () => {
  it("wartet, solange niemand da ist", () => {
    expect(fasseZustandZusammen([])).toBe("verbindet");
  });

  it("gilt als verbunden, sobald ein Paar steht", () => {
    // Auch wenn ein zweites Paar noch aushandelt: das Gespraech laeuft.
    expect(fasseZustandZusammen(["verbunden", "verbindet"])).toBe("verbunden");
  });

  it("verbindet, solange noch kein Paar steht", () => {
    expect(fasseZustandZusammen(["verbindet", "bereit"])).toBe("verbindet");
  });

  it("scheitert erst, wenn nichts mehr aushandelt und nichts steht", () => {
    expect(fasseZustandZusammen(["gescheitert"])).toBe("gescheitert");
    expect(fasseZustandZusammen(["gescheitert", "verbindet"])).toBe("verbindet");
    expect(fasseZustandZusammen(["getrennt", "gescheitert"])).toBe("gescheitert");
    expect(fasseZustandZusammen(["getrennt"])).toBe("getrennt");
  });
});
