import { describe, it, expect, vi } from "vitest";
import { kachelMenueEintraege, menueRegie } from "./Kachel";

/**
 * Das Dreipunktmenue an einer Gastkachel: Wortlaut und Wirkung.
 *
 * Geprueft wird die Rechnung dahinter, nicht das Aufklappen. Das hat einen
 * gemessenen Grund: Ein geoeffnetes Radix-Menue laesst in jsdom etwas zurueck,
 * das den Abbau jedes folgenden Tests um Sekunden verlangsamt. Ein Lauf mit
 * drei geoeffneten Menues brauchte siebenundneunzig Sekunden, wovon keine
 * halbe im Test selbst lag. Im Browser baut sich dasselbe Menue in
 * Millisekunden auf.
 *
 * Wo das Menue ueberhaupt steht und wo nicht, prueft `Gespraech.test.tsx`.
 */

describe("kachelMenueEintraege", () => {
  const regie = (zusatz: Partial<Parameters<typeof kachelMenueEintraege>[0]> = {}) => ({
    tonAn: true,
    teilenErlaubt: false,
    aufStumm: vi.fn(),
    aufTeilen: vi.fn(),
    ...zusatz,
  });

  it("sagt, was der Klick tut, nicht wie der Stand ist", () => {
    const eintraege = kachelMenueEintraege(regie());
    expect(eintraege.map((e) => e.text)).toEqual(["Stummschalten", "Teilen freigeben"]);

    const erteilt = kachelMenueEintraege(regie({ teilenErlaubt: true }));
    expect(erteilt[1].text).toBe("Teilen sperren");
  });

  it("laesst den Ton-Eintrag ruhen, wenn der Gast schon stumm ist", () => {
    /*
     * Aufheben kann der Gastgeber die Stummschaltung nicht: Ein fremdes
     * Mikrofon laesst sich von aussen nicht einschalten, es gibt dafuer auch
     * keinen Regiebefehl. Ein Knopf, der nichts taete, waere schlimmer als der
     * ruhende Hinweis.
     */
    const eintraege = kachelMenueEintraege(regie({ tonAn: false }));
    expect(eintraege[0].text).toBe("Ist stumm");
    expect(eintraege[0].gesperrt).toBe(true);
    // Das Teilen laesst sich trotzdem freigeben.
    expect(eintraege[1].gesperrt).toBe(false);
  });

  it("sperrt beides, solange keine Leitung steht", () => {
    const eintraege = kachelMenueEintraege(regie({ gesperrt: true }));
    expect(eintraege.map((e) => e.gesperrt)).toEqual([true, true]);
  });

  it("ruft die hineingereichten Funktionen, keine eigenen", () => {
    const r = regie({ teilenErlaubt: true });
    const eintraege = kachelMenueEintraege(r);
    eintraege[0].wirkung();
    eintraege[1].wirkung();
    expect(r.aufStumm).toHaveBeenCalledTimes(1);
    expect(r.aufTeilen).toHaveBeenCalledTimes(1);
  });
});

describe("menueRegie", () => {
  it("trifft genau den Gast, zu dessen Kachel das Menue gehoert", () => {
    // Bei drei Gaesten im Raum ist das die Stelle, an der man den Falschen
    // erwischen koennte.
    const gastRegie = {
      stand: vi.fn(() => ({ tonAn: true, teilenErlaubt: false })),
      aufStumm: vi.fn(),
      aufTeilen: vi.fn(),
    };

    const regie = menueRegie("gast-b", gastRegie);
    regie?.aufStumm();
    regie?.aufTeilen();

    expect(gastRegie.aufStumm).toHaveBeenCalledWith("gast-b");
    expect(gastRegie.aufTeilen).toHaveBeenCalledWith("gast-b");
    expect(gastRegie.stand).toHaveBeenCalledWith("gast-b");
  });

  it("nimmt den Stand aus derselben Quelle wie die Knoepfe in der Spalte", () => {
    const regie = menueRegie("gast-b", {
      stand: () => ({ tonAn: false, teilenErlaubt: true }),
      aufStumm: vi.fn(),
      aufTeilen: vi.fn(),
      gesperrt: true,
    });
    expect(regie).toMatchObject({ tonAn: false, teilenErlaubt: true, gesperrt: true });
  });

  it("gibt ohne Gastregie nichts heraus, also kein Menue beim Gast", () => {
    expect(menueRegie("gast-b", undefined)).toBeUndefined();
  });
});
