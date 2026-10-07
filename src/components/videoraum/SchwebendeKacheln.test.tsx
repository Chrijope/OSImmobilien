import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Die Kacheln im schwebenden Fenster.
 *
 * Geprueft wird hier, was sich ohne Browser pruefen laesst: dass ohne Fenster
 * nichts gezeichnet wird, dass die Bilder im fremden Dokument landen und
 * dieselben Stroeme bekommen, und dass die Knoepfe wirken. Ob dort wirklich
 * Bilder laufen und die Stilvorlage greift, laesst sich nur im Browser messen.
 */

beforeAll(() => {
  // jsdom kann keine Videowiedergabe, `play()` meldet dort "not implemented".
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});

const strom = (kennzeichen: string) => ({ kennzeichen }) as unknown as MediaStream;

const zustand = vi.hoisted(() => ({
  aktiv: { raumId: "raum-1", token: "abc", titel: "Beratung", gegenName: "Martina Brandl", startZeit: Date.now() },
  schwebeFenster: null as Window | null,
  gegenstellen: [] as Array<{ kennung: string; name: string; stream: MediaStream | null; zustand: string }>,
  staende: {} as Record<string, { tonAn: boolean; bildAn: boolean }>,
  tonAn: true,
  bildAn: true,
  lokalerStream: null as MediaStream | null,
  roheKamera: vi.fn(() => null as MediaStream | null),
  spiegeln: true,
  hintergrund: { art: "aus" } as { art: "aus" | "weich" | "bild" },
  wechsleTon: vi.fn(),
  wechsleBild: vi.fn(),
  beende: vi.fn(),
  oeffne: vi.fn(),
}));

vi.mock("@/contexts/VideoraumContext", () => ({
  useVideoraum: () => zustand,
}));

import { SchwebendeKacheln } from "./SchwebendeKacheln";

/** Ein Fenster, wie der Browser es fuer das schwebende Fenster liefert. */
function bauFenster(): Window {
  const dok = document.implementation.createHTMLDocument("Schwebend");
  return { document: dok, closed: false, close: () => {} } as unknown as Window;
}

function zeichne() {
  return render(
    <MemoryRouter initialEntries={["/kontakte"]}>
      <SchwebendeKacheln />
    </MemoryRouter>,
  );
}

describe("SchwebendeKacheln", () => {
  beforeEach(() => {
    zustand.schwebeFenster = null;
    zustand.gegenstellen = [];
    zustand.staende = {};
    zustand.tonAn = true;
    zustand.bildAn = true;
    zustand.lokalerStream = strom("kamera");
    zustand.roheKamera.mockReturnValue(null);
    zustand.spiegeln = true;
    zustand.hintergrund = { art: "aus" };
    zustand.beende.mockClear();
    zustand.oeffne.mockClear();
    zustand.wechsleTon.mockClear();
  });

  it("zeichnet nichts, solange kein Fenster offen ist", () => {
    const { container } = zeichne();
    expect(container).toBeEmptyDOMElement();
  });

  it("zeichnet die Kacheln in das andere Dokument, nicht in die Seite", () => {
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;
    zustand.gegenstellen = [
      { kennung: "gast-a", name: "Martina Brandl", stream: strom("gast"), zustand: "verbunden" },
    ];
    const { container } = zeichne();

    expect(container).toBeEmptyDOMElement();
    const kacheln = fenster.document.body.querySelectorAll("[data-pruefung='kleine-kachel']");
    // Das Gegenüber und man selbst.
    expect(kacheln.length).toBe(2);
    expect(fenster.document.body.textContent).toContain("Martina Brandl");
    expect(fenster.document.body.textContent).toContain("Du");
  });

  it("gibt den Video-Elementen dieselben Ströme, statt Elemente zu verschieben", () => {
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;
    zustand.gegenstellen = [
      { kennung: "gast-a", name: "Martina Brandl", stream: strom("gast"), zustand: "verbunden" },
    ];
    zeichne();

    const videos = fenster.document.body.querySelectorAll("video");
    expect(videos.length).toBe(2);
    expect(videos[0].srcObject).toHaveProperty("kennzeichen", "gast");
    expect(videos[1].srcObject).toHaveProperty("kennzeichen", "kamera");
    // Die Elemente gehören dem anderen Dokument.
    expect(videos[0].ownerDocument).toBe(fenster.document);
  });

  it("nimmt während des Teilens die rohe Kamera für das eigene Bild", () => {
    // Sonst stünde dort das Standbild der ruhenden Leinwand.
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;
    zustand.roheKamera.mockReturnValue(strom("rohe-kamera"));
    zeichne();
    const eigenes = fenster.document.body.querySelector("video");
    expect(eigenes?.srcObject).toHaveProperty("kennzeichen", "rohe-kamera");
  });

  it("spiegelt das eigene Bild nicht, solange ein Hintergrundbild läuft", () => {
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;
    zustand.hintergrund = { art: "bild" };
    zeichne();
    expect(fenster.document.body.querySelector("video")?.className).not.toContain("-scale-x-100");
  });

  it("zeigt das Stummzeichen der Gegenstelle", () => {
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;
    zustand.gegenstellen = [
      { kennung: "gast-a", name: "Martina Brandl", stream: strom("gast"), zustand: "verbunden" },
    ];
    zustand.staende = { "gast-a": { tonAn: false, bildAn: true } };
    zeichne();
    expect(fenster.document.body.querySelector("[data-pruefung='ton-aus']")).toBeTruthy();
  });

  it("stellt bei zweien zwei Kacheln hin, eine davon mit dem Fuß „Du“", () => {
    /*
     * Christian am 18.09.2026: „im schwebenden fenster wird aber nur vom kunde
     * das bild angezeigt, da muss auch das eigene vom gastgeber angezeigt
     * werden." Die eigene Kachel war vorhanden, ihr Strom kam aber erst mit
     * dem ersten Takt des Nachsehens. Jetzt faellt sie beim Zeichnen auf den
     * lokalen Strom zurueck.
     */
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;
    zustand.gegenstellen = [
      { kennung: "gast-a", name: "Martina Brandl", stream: strom("gast"), zustand: "verbunden" },
    ];
    zeichne();

    const fuesse = [...fenster.document.body.querySelectorAll("[data-pruefung='kachel-fuss']")];
    expect(fuesse.map((f) => f.textContent)).toEqual(["Martina Brandl", "Du"]);
    // Und mit Bild, nicht mit „Warte auf Du…".
    const videos = fenster.document.body.querySelectorAll("video");
    expect(videos[1].srcObject).toHaveProperty("kennzeichen", "kamera");
    // Alle Kacheln stumm, sonst liefe die Stimme doppelt.
    expect([...videos].every((v) => v.muted)).toBe(true);
  });

  it("nimmt für die eigene Kachel den eigenen Ton, nicht die Meldungen der anderen", () => {
    // Sich selbst meldet man niemandem. Ein fehlender Eintrag in der Tabelle
    // darf nicht als „stumm" gelesen werden.
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;
    zustand.tonAn = true;
    zustand.bildAn = true;
    zustand.gegenstellen = [
      { kennung: "gast-a", name: "Martina Brandl", stream: strom("gast"), zustand: "verbunden" },
    ];
    zustand.staende = { "gast-a": { tonAn: false, bildAn: false } };
    zeichne();

    const kacheln = [...fenster.document.body.querySelectorAll("[data-pruefung='kleine-kachel']")];
    const eigene = kacheln[1];
    expect(eigene.querySelector("[data-pruefung='ton-aus']")).toBeNull();
    expect(eigene.querySelector("[data-pruefung='kamera-aus']")).toBeNull();
    // Beim Gegenueber stimmt dieselbe Meldung dagegen sehr wohl.
    expect(kacheln[0].querySelector("[data-pruefung='ton-aus']")).toBeTruthy();
  });

  it("legt auf und holt zurück ins Gespräch", () => {
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;
    zeichne();

    /*
     * Der Klick von Hand: Das andere Dokument haengt im Test an keinem
     * Fenster, und die Testbibliothek sucht sich ihr Ereignis sonst dort.
     */
    const klick = (label: string) => {
      const knopf = fenster.document.body.querySelector(`[aria-label="${label}"]`);
      act(() => { knopf?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    };

    klick("Auflegen");
    expect(zustand.beende).toHaveBeenCalledTimes(1);

    klick("Mikrofon ausschalten");
    expect(zustand.wechsleTon).toHaveBeenCalledTimes(1);
  });
});
