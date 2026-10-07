import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Die Leiste ist der Anker waehrend eines minimierten Gespraechs. Verschwindet
 * sie oder zeigt sie die falsche Dauer, merkt der Partner nicht, dass der
 * Kunde noch in der Leitung ist. Deshalb hier abgesichert.
 */

beforeAll(() => {
  // jsdom kann keine Videowiedergabe, `play()` meldet dort "not implemented".
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});

const zustand = vi.hoisted(() => ({
  aktiv: null as null | { raumId: string; token: string; titel: string; gegenName: string; startZeit: number },
  minimiert: false,
  zustand: "verbunden" as string,
  gegenstellen: [] as Array<{ kennung: string; name: string; stream: MediaStream | null; zustand: string }>,
  staende: {} as Record<string, { tonAn: boolean; bildAn: boolean }>,
  tonAn: true,
  bildAn: true,
  lautsprecherId: null as string | null,
  schwebenMoeglich: false,
  schwebeFenster: null as Window | null,
  /* Fuer die eigene Kachel in der Videoreihe, siehe `EigeneKleineKachel`. */
  verbindung: null as unknown,
  lokalerStream: null as MediaStream | null,
  roheKamera: () => null as MediaStream | null,
  spiegeln: true,
  hintergrund: { art: "aus" } as { art: "aus" | "weich" | "bild" },
  oeffneSchwebend: vi.fn(),
  beende: vi.fn(),
  oeffne: vi.fn(),
  wechsleTon: vi.fn(),
  wechsleBild: vi.fn(),
}));

const profil = vi.hoisted(() => ({
  leisteVideosOffen: false,
  speichere: vi.fn(),
}));

vi.mock("@/contexts/VideoraumContext", () => ({
  useVideoraum: () => zustand,
}));

vi.mock("@/lib/videocallEinstellungen", () => ({
  ladeVideocallProfil: () => ({ leisteVideosOffen: profil.leisteVideosOffen }),
  speichereVideocallProfil: (patch: unknown) => profil.speichere(patch),
  // Die eigene Kachel in der Reihe rechnet damit, ob gespiegelt wird.
  spiegeltVorschau: (spiegeln: boolean, art: string) => spiegeln && art !== "bild",
}));

import { VideoraumLeiste } from "./VideoraumLeiste";

/** Ein Strom, der nur zum Unterscheiden da ist. Abgespielt wird er nie. */
const strom = (kennzeichen: string) => ({ kennzeichen }) as unknown as MediaStream;

function zeichne(pfad = "/videocall/raum/raum-1") {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <VideoraumLeiste />
    </MemoryRouter>,
  );
}

const GESPRAECH = {
  raumId: "raum-1",
  token: "abc",
  titel: "Beratungsgespräch",
  gegenName: "Martina Brandl",
  startZeit: Date.now() - 5 * 60_000 - 7_000,
};

describe("VideoraumLeiste", () => {
  beforeEach(() => {
    zustand.aktiv = null;
    zustand.minimiert = false;
    zustand.zustand = "verbunden";
    zustand.gegenstellen = [];
    zustand.staende = {};
    zustand.tonAn = true;
    zustand.bildAn = true;
    zustand.schwebenMoeglich = false;
    zustand.schwebeFenster = null;
    zustand.oeffneSchwebend.mockClear();
    profil.leisteVideosOffen = false;
    profil.speichere.mockClear();
    zustand.beende.mockClear();
    zustand.oeffne.mockClear();
    zustand.wechsleTon.mockClear();
    zustand.wechsleBild.mockClear();
  });

  it("bleibt unsichtbar, solange kein Gespräch läuft", () => {
    const { container } = zeichne();
    expect(container).toBeEmptyDOMElement();
  });

  it("bleibt unsichtbar, solange das Gespräch im Vollbild läuft", () => {
    // Im Vollbild sieht man das Gespräch ohnehin, eine zweite Leiste
    // darüber wäre nur doppelt.
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = false;
    const { container } = zeichne("/videocall/raum/raum-1");
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt sich auch unminimiert, sobald eine andere Seite offen ist", () => {
    // Wer im Gespräch zurück navigiert oder einen zweiten Raum öffnet, verliert
    // das Vollbild. Ohne die Leiste liefe das Gespräch dann unsichtbar weiter.
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = false;
    zeichne("/kontakte");
    expect(screen.getByText("Martina Brandl")).toBeTruthy();
  });

  it("zeigt sich auch auf der Seite eines anderen Raums", () => {
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = false;
    zeichne("/videocall/raum/raum-2");
    expect(screen.getByText("Martina Brandl")).toBeTruthy();
  });

  it("zeigt Name und laufende Dauer, sobald minimiert", () => {
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = true;
    zeichne();
    expect(screen.getByText("Martina Brandl")).toBeTruthy();
    expect(screen.getByText("5:07")).toBeTruthy();
  });

  it("zeigt bei mehreren Gegenstellen den ersten Namen plus Anzahl", () => {
    // Alle Namen passen nicht in die Leiste. Der erste plus "+2" reicht, um zu
    // sehen, dass drei Personen in der Leitung sind.
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = true;
    zustand.gegenstellen = [
      { kennung: "gast-a", name: "Martina Brandl", stream: null, zustand: "verbunden" },
      { kennung: "gast-b", name: "Peter Huber", stream: null, zustand: "verbunden" },
      { kennung: "gast-c", name: "Lisa Maier", stream: null, zustand: "verbindet" },
    ];
    zeichne();
    expect(screen.getByText("Martina Brandl +2")).toBeTruthy();
  });

  it("zeigt Stunden mit an, wenn das Gespräch lange läuft", () => {
    zustand.aktiv = { ...GESPRAECH, startZeit: Date.now() - (2 * 3600 + 3 * 60 + 4) * 1000 };
    zustand.minimiert = true;
    zeichne();
    expect(screen.getByText("2:03:04")).toBeTruthy();
  });

  it("sagt, dass noch verbunden wird, solange die Gegenstelle fehlt", () => {
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = true;
    zustand.zustand = "verbindet";
    zeichne();
    expect(screen.getByText("Verbindet…")).toBeTruthy();
  });

  it("legt auf und holt zurück ins Vollbild", () => {
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = true;
    zeichne();

    fireEvent.click(screen.getByText("Vollbild"));
    expect(zustand.oeffne).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Auflegen"));
    expect(zustand.beende).toHaveBeenCalledTimes(1);
  });

  it("schaltet Mikrofon und Kamera um", () => {
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = true;
    zeichne();

    fireEvent.click(screen.getByLabelText("Mikrofon ausschalten"));
    expect(zustand.wechsleTon).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Kamera ausschalten"));
    expect(zustand.wechsleBild).toHaveBeenCalledTimes(1);
  });

  it("beschriftet die Schalter umgekehrt, wenn schon stumm", () => {
    zustand.aktiv = GESPRAECH;
    zustand.minimiert = true;
    zustand.tonAn = false;
    zustand.bildAn = false;
    zeichne();
    expect(screen.getByLabelText("Mikrofon einschalten")).toBeTruthy();
    expect(screen.getByLabelText("Kamera einschalten")).toBeTruthy();
  });

  /**
   * Die Videos in der Leiste.
   *
   * Eingeklappt ist der Normalfall: Wer minimiert, will Platz. Die Wahl muss
   * aber das Gespraech ueberdauern, sonst klappt Christian sie jedes Mal neu
   * auf.
   */
  describe("Videos in der Leiste", () => {
    beforeEach(() => {
      zustand.aktiv = GESPRAECH;
      zustand.minimiert = true;
      zustand.gegenstellen = [
        { kennung: "gast-a", name: "Martina Brandl", stream: null, zustand: "verbunden" },
      ];
    });

    it("bleibt eingeklappt, solange nichts anderes gespeichert ist", () => {
      const { container } = zeichne();
      expect(container.querySelector("[data-pruefung='leisten-videos']")).toBeNull();
      expect(screen.getByLabelText("Videos einblenden")).toBeTruthy();
    });

    it("klappt auf Klick auf und merkt die Wahl", () => {
      const { container } = zeichne();
      fireEvent.click(screen.getByLabelText("Videos einblenden"));
      expect(container.querySelector("[data-pruefung='leisten-videos']")).toBeTruthy();
      expect(profil.speichere).toHaveBeenCalledWith({ leisteVideosOffen: true });
      // Und wieder zu, mit derselben Wirkung in die andere Richtung.
      fireEvent.click(screen.getByLabelText("Videos ausblenden"));
      expect(container.querySelector("[data-pruefung='leisten-videos']")).toBeNull();
      expect(profil.speichere).toHaveBeenLastCalledWith({ leisteVideosOffen: false });
    });

    it("steht schon offen, wenn es zuletzt so gespeichert war", () => {
      profil.leisteVideosOffen = true;
      const { container } = zeichne();
      expect(container.querySelector("[data-pruefung='leisten-videos']")).toBeTruthy();
    });

    it("schiebt den Seiteninhalt weiter nach unten, sobald die Videos stehen", () => {
      // Der Platzhalter haelt den Inhalt frei. Waere er zu niedrig,
      // verschwaende die oberste Zeile jeder Seite hinter der Leiste.
      const platzhalter = () => container.querySelector("[data-pruefung='leisten-platzhalter']");
      const { container } = zeichne();
      // Zu: nur die Leistenhöhe. Auf: dieselben beiden Höhen wie die Leiste
      // selbst, nicht eine ausgerechnete Summe.
      expect(platzhalter()?.children.length).toBe(1);
      expect(platzhalter()?.children[0].className).toContain("h-11");
      fireEvent.click(screen.getByLabelText("Videos einblenden"));
      expect(platzhalter()?.children.length).toBe(2);
      expect(platzhalter()?.children[1].className).toContain("h-[72px]");
    });

    it("zeigt auch das eigene Bild, nicht nur das der anderen", () => {
      /*
       * Der Fehler, den Christian am 18.09.2026 gemeldet hat: In der Leiste
       * stand nur die Kachel des Gastes. Die Reihe lief ueber `gegenstellen`,
       * und darin steht man selbst nicht. In Safari wiegt das schwer, dort ist
       * diese Reihe der einzige Weg.
       */
      zustand.lokalerStream = strom("eigen");
      profil.leisteVideosOffen = true;
      const { container } = zeichne();

      const reihe = container.querySelector("[data-pruefung='leisten-videos']") as HTMLElement;
      const kacheln = reihe.querySelectorAll("[data-pruefung='kleine-kachel']");
      expect(kacheln.length).toBe(2);
      // Erst die anderen, dann man selbst, dieselbe Reihenfolge wie im
      // schwebenden Fenster.
      expect(kacheln[0].textContent).toContain("Martina Brandl");
      expect(kacheln[1].textContent).toContain("Du");
    });

    it("laesst die eigene Kachel stumm, damit die eigene Stimme nicht mitlaeuft", () => {
      zustand.lokalerStream = strom("eigen");
      profil.leisteVideosOffen = true;
      const { container } = zeichne();

      const reihe = container.querySelector("[data-pruefung='leisten-videos']") as HTMLElement;
      for (const video of reihe.querySelectorAll("video")) {
        expect(video.muted).toBe(true);
      }
      // Der Ton kommt an genau einer Stelle heraus, siehe `TonAusgabe`.
      expect(container.querySelectorAll("audio").length).toBe(1);
    });

    it("nimmt fuer die eigene Kachel den eigenen Stand, nicht die Meldungen der anderen", () => {
      // Man meldet sich nichts selbst. Der eigene Stand steht im Zusammenhang.
      zustand.lokalerStream = strom("eigen");
      zustand.bildAn = false;
      profil.leisteVideosOffen = true;
      const { container } = zeichne();

      const reihe = container.querySelector("[data-pruefung='leisten-videos']") as HTMLElement;
      expect(reihe.textContent).toContain("Deine Kamera ist aus");
    });

    it("spielt den Ton der Gegenstelle auch bei eingeklappten Videos", () => {
      // Solange das Gespraech nicht auf dem Bildschirm steht, gibt es sonst
      // keine Stelle, die den fremden Strom abspielt.
      const { container } = zeichne();
      expect(container.querySelectorAll("audio").length).toBe(1);
    });
  });

  /**
   * Der Knopf „Videos" und das schwebende Fenster.
   *
   * Christian am 18.09.2026: „nehmen aus dieser Ansicht die Möglichkeit
   * heraus, auf Videos zu klicken. denn wenn ich es verkleiner öffnet sich ja
   * automatisch an meinem bildschirm wie in zoom der einblender". Richtig,
   * solange das Fenster wirklich steht. In Safari und Firefox gibt es das
   * Fenster nicht, dort waere die Leiste sonst blind.
   */
  describe("Videos-Knopf und schwebendes Fenster", () => {
    beforeEach(() => {
      zustand.aktiv = GESPRAECH;
      zustand.minimiert = true;
      zustand.gegenstellen = [
        { kennung: "gast-a", name: "Martina Brandl", stream: null, zustand: "verbunden" },
      ];
    });

    it("faellt weg, solange das schwebende Fenster steht", () => {
      zustand.schwebenMoeglich = true;
      zustand.schwebeFenster = {} as Window;
      const { container } = zeichne();

      expect(container.querySelector("[data-pruefung='leisten-videos-knopf']")).toBeNull();
      expect(container.querySelector("[data-pruefung='leisten-videos']")).toBeNull();
    });

    it("bleibt, wo der Browser das Fenster gar nicht kann", () => {
      // Safari und Firefox. Ohne den Knopf saehe der Partner nach dem
      // Kleinermachen ueberhaupt kein Bild mehr.
      zustand.schwebenMoeglich = false;
      zustand.schwebeFenster = null;
      const { container } = zeichne();

      expect(container.querySelector("[data-pruefung='leisten-videos-knopf']")).toBeTruthy();
    });

    it("kommt zurueck, wenn der Nutzer das Fenster von Hand zumacht", () => {
      // Sonst stuende er ohne Bild da, obwohl sein Browser das Fenster kann.
      zustand.schwebenMoeglich = true;
      zustand.schwebeFenster = null;
      const { container } = zeichne();

      expect(container.querySelector("[data-pruefung='leisten-videos-knopf']")).toBeTruthy();
      // Und daneben der Weg, das Fenster wieder zu oeffnen.
      expect(screen.getByLabelText("Videos als schwebendes Fenster")).toBeTruthy();
    });

    it("haelt den Platzhalter frei, wenn die Reihe wegen des Fensters entfaellt", () => {
      // Sonst reservierte die Seite Platz fuer eine Reihe, die es nicht gibt,
      // und der ganze Inhalt stuende zu tief.
      profil.leisteVideosOffen = true;
      zustand.schwebenMoeglich = true;
      zustand.schwebeFenster = {} as Window;
      const { container } = zeichne();

      const platzhalter = container.querySelector("[data-pruefung='leisten-platzhalter']");
      expect(platzhalter?.children.length).toBe(1);
    });

    it("vergisst die gemerkte Wahl nicht, waehrend das Fenster steht", () => {
      // Wer die Reihe offen hatte, findet sie nach dem Schliessen des Fensters
      // wieder offen vor. Gespeichert wird beim Schliessen des Fensters nichts.
      profil.leisteVideosOffen = true;
      zustand.schwebenMoeglich = true;
      zustand.schwebeFenster = {} as Window;
      zeichne();
      expect(profil.speichere).not.toHaveBeenCalled();
    });
  });

  describe("schwebendes Fenster", () => {
    beforeEach(() => {
      zustand.aktiv = GESPRAECH;
      zustand.minimiert = true;
    });

    it("bietet es gar nicht an, wo der Browser es nicht kann", () => {
      // Safari und Firefox: kein toter Knopf, kein Hinweis auf etwas Fehlendes.
      zeichne();
      expect(screen.queryByLabelText("Videos als schwebendes Fenster")).toBeNull();
    });

    it("bietet es an und öffnet es auf Klick", () => {
      zustand.schwebenMoeglich = true;
      zeichne();
      fireEvent.click(screen.getByLabelText("Videos als schwebendes Fenster"));
      expect(zustand.oeffneSchwebend).toHaveBeenCalledTimes(1);
    });

    it("verschwindet, solange das Fenster schon offen ist", () => {
      zustand.schwebenMoeglich = true;
      zustand.schwebeFenster = {} as Window;
      zeichne();
      expect(screen.queryByLabelText("Videos als schwebendes Fenster")).toBeNull();
    });
  });
});
