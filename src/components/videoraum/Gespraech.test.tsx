import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { Gespraech } from "./Gespraech";
import { BILD_STOERUNG_MS, BILD_WARTEN_MS, bestimmeBildstand } from "./Kachel";
import type { Gegenstelle, RegieBefehl, Verbindung } from "@/lib/videoraumVerbindung";

/**
 * Die Gespraechsansicht wird von beiden Seiten benutzt. Beim Gastgeber liegt
 * der Stand aber oberhalb der Seite, damit das Gespraech einen Seitenwechsel
 * ueberlebt. Genau das war die Falle: Die Knoepfe schalteten dann die Spur ab,
 * ohne dass sich die Anzeige aenderte, und liessen sich nie wieder einschalten.
 */

/*
 * jsdom kann keine Videowiedergabe. `play()` meldet dort "not implemented" und
 * gibt nichts zurueck, das `.catch` haette. Sobald ein Test einen Strom
 * uebergibt, fiele die Ansicht darueber. Ein aufgeloestes Versprechen genuegt.
 */
beforeAll(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});

/** Ein Strom, der nur zum Unterscheiden da ist. Abgespielt wird er nie. */
const strom = (kennzeichen: string) => ({ kennzeichen }) as unknown as MediaStream;

interface Attrappe extends Verbindung {
  meldeTeilen: (an: boolean, bildschirm?: MediaStream | null) => void;
  meldeRegie: (befehl: RegieBefehl, von: string) => void;
}

function verbindungAttrappe(): Attrappe {
  const melder = new Set<(an: boolean, bildschirm: MediaStream | null) => void>();
  const regie = new Set<(befehl: RegieBefehl, von: string) => void>();
  return {
    eigeneKennung: "gastgeber-test",
    setzeSpur: vi.fn(),
    teileBildschirm: vi.fn().mockResolvedValue(false),
    beobachteTeilen: (m) => { melder.add(m); return () => { melder.delete(m); }; },
    sendeRegie: vi.fn(),
    beobachteRegie: (m) => { regie.add(m); return () => { regie.delete(m); }; },
    beenden: vi.fn(),
    meldeTeilen: (an, bildschirm = null) => { for (const m of melder) m(an, bildschirm); },
    meldeRegie: (befehl, von) => { for (const m of regie) m(befehl, von); },
  };
}

function zeichne(zusatz: Partial<React.ComponentProps<typeof Gespraech>> = {}) {
  const verbindung = verbindungAttrappe();
  render(
    <Gespraech
      lokalerStream={null}
      gegenstellen={[]}
      zustand="verbunden"
      gegenName="Martina Brandl"
      verbindung={verbindung}
      aufBeenden={() => { /* egal */ }}
      titel="Beratungsgespräch"
      {...zusatz}
    />,
  );
  return verbindung;
}

describe("Gespraech", () => {
  it("schaltet ohne Steuerung von außen die Spur selbst", () => {
    const verbindung = zeichne();
    fireEvent.click(screen.getByLabelText("Ton"));
    expect(verbindung.setzeSpur).toHaveBeenCalledWith("audio", false);
    fireEvent.click(screen.getByLabelText("Ton"));
    expect(verbindung.setzeSpur).toHaveBeenLastCalledWith("audio", true);
  });

  it("gibt das Umschalten nach außen, wenn der Stand von außen kommt", () => {
    const wechsleTon = vi.fn();
    const wechsleBild = vi.fn();
    const verbindung = zeichne({ tonAn: true, bildAn: true, wechsleTon, wechsleBild });

    fireEvent.click(screen.getByLabelText("Ton"));
    fireEvent.click(screen.getByLabelText("Bild"));

    expect(wechsleTon).toHaveBeenCalledTimes(1);
    expect(wechsleBild).toHaveBeenCalledTimes(1);
    // Sonst schaltete die Ansicht zusätzlich an der Spur und geriet mit dem
    // Stand oberhalb der Seite aus dem Takt.
    expect(verbindung.setzeSpur).not.toHaveBeenCalled();
  });

  it("nimmt den Teilen-Knopf zurück, wenn das Teilen von außen endet", () => {
    // Der Browser zeigt beim Teilen ein eigenes Banner mit "Freigabe beenden".
    // Wer dort klickt, löst bei uns keinen Klick aus, und der Knopf blieb
    // aktiv stehen, obwohl längst wieder die Kamera lief.
    const verbindung = zeichne();
    const knopf = screen.getByLabelText("Teilen");

    act(() => { verbindung.meldeTeilen(true); });
    expect(knopf.className).toContain("#88CFFF");

    act(() => { verbindung.meldeTeilen(false); });
    expect(knopf.className).not.toContain("#88CFFF");
  });

  it("sperrt das Teilen, solange der Gastgeber es nicht freigegeben hat", async () => {
    // Der Gast soll nicht ungefragt seinen Bildschirm in ein Beratungsgespräch
    // legen können. Freigegeben wird das vom Gastgeber, siehe RegieBefehl.
    const verbindung = zeichne({
      teilenGesperrt: true,
      teilenHinweis: "Dein Ansprechpartner gibt das Teilen frei.",
    });
    const knopf = screen.getByLabelText("Teilen") as HTMLButtonElement;

    expect(knopf.disabled).toBe(true);
    expect(knopf.title).toBe("Dein Ansprechpartner gibt das Teilen frei.");
    fireEvent.click(knopf);
    expect(verbindung.teileBildschirm).not.toHaveBeenCalled();
  });

  it("lässt ein laufendes Teilen beenden, auch wenn die Freigabe wegfällt", () => {
    // Sonst bliebe der Bildschirm hängen: der Knopf gesperrt, die Freigabe weg,
    // und niemand käme mehr heraus.
    const verbindung = zeichne({ teilenGesperrt: true });
    const knopf = screen.getByLabelText("Teilen") as HTMLButtonElement;

    act(() => { verbindung.meldeTeilen(true); });
    expect(knopf.disabled).toBe(false);
  });

  it("zeigt den Streifen unter der Kopfzeile", () => {
    zeichne({ banner: <span>Dein Mikrofon wurde stummgeschaltet.</span> });
    expect(screen.getByText("Dein Mikrofon wurde stummgeschaltet.")).toBeTruthy();
  });

  it("zählt ab dem übergebenen Beginn, nicht ab dem Aufbau der Ansicht", () => {
    // Nach dem Minimieren wird die Ansicht neu aufgebaut. Ohne den Beginn von
    // außen stünde dann wieder 00:00:00 da, während die Leiste weiterlief.
    zeichne({ startZeit: Date.now() - (65 * 1000 + 500) });
    expect(screen.getByText("00:01:05")).toBeTruthy();
  });

  it("wartet mit Namen, solange noch niemand da ist", () => {
    zeichne({ zustand: "verbindet" });
    expect(screen.getByText("Warte auf Martina Brandl…")).toBeTruthy();
  });

  it("zeigt bei mehreren Gegenstellen eine Kachel je Teilnehmer mit Namen", () => {
    // Drei Gäste plus Gastgeber: jede Gegenstelle bekommt ihre eigene Kachel,
    // und wessen Bild noch fehlt, steht mit Wartehinweis da.
    zeichne({
      gegenstellen: [
        { kennung: "gast-a", name: "Martina Brandl", stream: null, zustand: "verbindet" },
        { kennung: "gast-b", name: "Peter Huber", stream: null, zustand: "verbindet" },
        { kennung: "gast-c", name: "Lisa Maier", stream: null, zustand: "verbindet" },
      ],
    });
    expect(screen.getByText("Warte auf Martina Brandl…")).toBeTruthy();
    expect(screen.getByText("Warte auf Peter Huber…")).toBeTruthy();
    expect(screen.getByText("Warte auf Lisa Maier…")).toBeTruthy();
  });

  /*
   * Die Hoehe. Im CRM sitzt ueber dem Raum die Kopfzeile und daneben die
   * Seitenleiste. Eine feste Fensterhoehe war dort genau um die Kopfzeile zu
   * viel: Die Bedienleiste mit dem Auflegen stand unter dem Fensterrand und
   * war erst nach dem Scrollen zu sehen.
   */
  it("füllt in der Vorgabe das Fenster", () => {
    const { container } = render(
      <Gespraech
        lokalerStream={null}
        gegenstellen={[]}
        zustand="verbunden"
        gegenName="Martina Brandl"
        verbindung={verbindungAttrappe()}
        aufBeenden={() => { /* egal */ }}
        titel="Beratungsgespräch"
      />,
    );
    expect(container.firstElementChild?.className).toContain("h-[100dvh]");
  });

  it("füllt im CRM nur die Fläche, die der Elternteil übrig lässt", () => {
    const { container } = render(
      <Gespraech
        rahmen="flaeche"
        lokalerStream={null}
        gegenstellen={[]}
        zustand="verbunden"
        gegenName="Martina Brandl"
        verbindung={verbindungAttrappe()}
        aufBeenden={() => { /* egal */ }}
        titel="Beratungsgespräch"
      />,
    );
    const klassen = container.firstElementChild?.className ?? "";
    expect(klassen).toContain("h-full");
    expect(klassen).not.toContain("h-[100dvh]");
  });
});

/**
 * Die Anordnung der Kacheln und was sie ueber die Leute sagen.
 *
 * Christian am 18.09.2026, drei Befunde nacheinander:
 *
 *   „weder der Gastgeber noch der Gast sehen in einer kleinen Kamera ihr
 *   eigenes Bild. Das fehlt."
 *
 *   „kannst du wenn nur zwei im videoraum sind, dann in der gastgebersicht
 *   diese beide untereinander anzeigen, so dass immer das breite gesamtbild
 *   sichtbar ist, das bild soll also nie angepasst werden, sondern es muss
 *   sich das format an die ansicht anpassen und bei der gastversion genau das
 *   gleiche."
 *
 *   „auch wenn der gastgeber seine kamera ausschaltet muss es bei dem
 *   gegenueber angezeigt werden, da passiert noch nichts."
 *
 * Das erste Bild lag nicht falsch, sondern ausserhalb: Der Kasten brachte
 * `relative` mit, die Ecke reichte `absolute` nach, und im fertigen
 * Stylesheet steht `relative` hinter `absolute`. Es blieb im Fluss und
 * rutschte unter das grosse Video. Deshalb pruefen diese Tests nicht, ob
 * „absolute" unter den Klassen steht, sondern die Positionsangabe als ganze:
 * Es darf genau eine geben.
 */
describe("Gespraech, Anordnung der Kacheln", () => {
  /** Alle Positionsangaben eines Elements. Mehr als eine ist der Fehler. */
  function positionen(el: Element): string[] {
    const alle = ["static", "fixed", "absolute", "relative", "sticky"];
    return [...el.classList].filter((k) => alle.includes(k));
  }

  function eigenesBild(): HTMLElement {
    const el = document.querySelector<HTMLElement>('[data-pruefung="eigenes-bild"]');
    if (!el) throw new Error("Die Selbstansicht fehlt ganz.");
    return el;
  }

  function fremdeKacheln(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[data-pruefung="teilnehmer-kachel"]')];
  }

  const gast = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  /** In jsdom gibt es keine Spur, also wird das Format hier gesetzt. */
  function meldeFormat(video: HTMLVideoElement, breite: number, hoehe: number) {
    Object.defineProperty(video, "videoWidth", { value: breite, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: hoehe, configurable: true });
    act(() => { video.dispatchEvent(new Event("resize")); });
  }

  it("stapelt bei genau zwei im Raum beide Bilder, das Gegenueber oben", () => {
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gast-a", "Martina Brandl")] });

    expect(eigenesBild().dataset.lage).toBe("kachel");
    expect(fremdeKacheln()).toHaveLength(1);
    // Die Reihenfolge im Baum ist die Reihenfolge auf dem Schirm.
    expect(fremdeKacheln()[0].compareDocumentPosition(eigenesBild()))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("gibt beiden Kacheln das Format ihrer eigenen Spur", () => {
    // Gemessen am 18.09.2026: Der Gast am Telefon schickt 720 mal 1280, also
    // hochkant, der Gastgeber 1280 mal 720. In einer festen 4-zu-3-Kachel
    // waren von Christian nur 43 Prozent zu sehen.
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gast-a", "Martina Brandl")] });

    const fremd = fremdeKacheln()[0];
    meldeFormat(fremd.querySelector("video")!, 720, 1280);
    meldeFormat(eigenesBild().querySelector("video")!, 1280, 720);

    expect(Number(fremd.dataset.format)).toBeCloseTo(0.5625, 4);
    expect(Number(eigenesBild().dataset.format)).toBeCloseTo(1.7778, 4);
    expect(fremd.style.aspectRatio).toBe("0.5625");
  });

  it("geht mit, wenn der Gast sein Telefon dreht", () => {
    // `loadedmetadata` kommt einmal. Ohne `resize` bliebe die Kachel hochkant
    // stehen, obwohl laengst ein Querformat ankommt.
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gast-a", "Martina Brandl")] });
    const fremd = fremdeKacheln()[0];

    meldeFormat(fremd.querySelector("video")!, 720, 1280);
    expect(Number(fremd.dataset.format)).toBeCloseTo(0.5625, 4);

    meldeFormat(fremd.querySelector("video")!, 1280, 720);
    expect(Number(fremd.dataset.format)).toBeCloseTo(1.7778, 4);
  });

  it("schneidet nirgends etwas ab", () => {
    // Christians Kern: „das bild soll also nie angepasst werden". Also
    // `object-contain`, nicht `object-cover`.
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gast-a", "Martina Brandl")] });
    for (const video of document.querySelectorAll("video")) {
      expect(video.className).toContain("object-contain");
      expect(video.className).not.toContain("object-cover");
    }
  });

  it("zeigt beiden Seiten dieselbe Anordnung", () => {
    // „und bei der gastversion genau das gleiche." Den Gastgeber erkennt man
    // an der Seitenspalte mit seiner Arbeitsflaeche.
    const gegenstellen = [gast("gegen", "Martina Brandl")];
    zeichne({ lokalerStream: strom("kamera"), gegenstellen, seitenSpalte: <p>Mitschrift</p> });
    expect(eigenesBild().dataset.lage).toBe("kachel");
    expect(fremdeKacheln()).toHaveLength(1);

    cleanup();

    zeichne({ lokalerStream: strom("kamera"), gegenstellen });
    expect(eigenesBild().dataset.lage).toBe("kachel");
    expect(fremdeKacheln()).toHaveLength(1);
  });

  it("legt das eigene Bild in die Ecke, solange niemand da ist", () => {
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [] });
    const bild = eigenesBild();
    expect(bild.dataset.lage).toBe("ecke");
    // Genau eine Positionsangabe, und zwar die schwebende. Zwei waren der
    // Fehler: Die zweite hob die erste auf.
    expect(positionen(bild)).toEqual(["absolute"]);
    expect(bild.className).toContain("bottom-4");
    expect(bild.className).toContain("right-4");
  });

  it("legt die Ecke auf die grosse Flaeche und nicht darunter", () => {
    // Der Kern des alten Fehlers: Sie lag als Geschwister im Fluss hinter dem
    // grossen Bild und schob sich damit unter den Rand des Fensters.
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [] });
    expect(eigenesBild().parentElement?.className).toContain("relative");
  });

  it("schickt das eigene Bild ab drei Personen zurueck in die Ecke", () => {
    // Dort teilt das Raster den Platz schon auf, ein dritter Stapel waere zu
    // schmal zum Erkennen.
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gast-a", "A"), gast("gast-b", "B")],
    });
    expect(eigenesBild().dataset.lage).toBe("ecke");
    expect(positionen(eigenesBild())).toEqual(["absolute"]);
    expect(fremdeKacheln()).toHaveLength(2);
  });

  it("bleibt auf dem Telefon klein und waechst erst auf dem grossen Schirm", () => {
    zeichne({ lokalerStream: strom("kamera") });
    expect(eigenesBild().className).toContain("w-[128px]");
    expect(eigenesBild().className).toContain("sm:w-[196px]");
  });

  it("stellt sich waehrend des Teilens in die Reihe", () => {
    // Die Ecke laege sonst auf dem geteilten Inhalt, ausgerechnet dort, wo der
    // Kunde hinsieht. Auch hier: genau eine Positionsangabe.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gast-a", "Martina Brandl")],
    });
    expect(eigenesBild().dataset.lage).toBe("kachel");

    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });

    expect(eigenesBild().dataset.lage).toBe("reihe");
    expect(positionen(eigenesBild())).toEqual(["relative"]);

    act(() => { verbindung.meldeTeilen(false, null); });

    expect(eigenesBild().dataset.lage).toBe("kachel");
  });

  it("stellt sich auch dann in die Reihe, wenn die Gegenstelle teilt", () => {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Christian Peetz")],
    });

    act(() => { verbindung.meldeRegie({ art: "bildschirm", an: true }, "gegen"); });

    expect(eigenesBild().dataset.lage).toBe("reihe");
    expect(positionen(eigenesBild())).toEqual(["relative"]);
  });

  it("laesst die Knopfleiste ausserhalb der Videoflaeche", () => {
    // Ein Gast bedient sie mit dem Daumen. Sie darf von keiner Kachel
    // verdeckt werden.
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gast-a", "Martina Brandl")] });
    const auflegen = screen.getByLabelText("Auflegen");
    expect(fremdeKacheln()[0].contains(auflegen)).toBe(false);
    expect(eigenesBild().contains(auflegen)).toBe(false);
  });
});

/**
 * Die Beschriftung der Kacheln und die eigene Vorschau beim Teilen.
 *
 * Christian am 18.09.2026: „bei dem einen steht der name drin, beim anderen
 * nicht ... und die namenbetitelung bitte unten an den rand setzen jeweils."
 * Und: „beim anderen ist das bild eingefroren, warum?"
 */
describe("Gespraech, Beschriftung und eigene Vorschau", () => {
  const gast = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  function fuesse() { return [...document.querySelectorAll<HTMLElement>('[data-pruefung="kachel-fuss"]')]; }

  it("beschriftet jede Kachel gleich und buendig am unteren Rand", () => {
    // Vorher zweierlei gebaut: die fremde Kachel eine schwebende Pille, die
    // eigene ein angeschnittenes „Du" in der Ecke.
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gast-a", "Martina Brandl")] });

    expect(fuesse()).toHaveLength(2);
    for (const fuss of fuesse()) {
      expect(fuss.className).toContain("inset-x-0");
      expect(fuss.className).toContain("bottom-0");
      // Kuerzen statt umbrechen oder ueberlaufen.
      expect(fuss.querySelector("span")?.className).toContain("truncate");
    }
    expect(screen.getByText("Martina Brandl")).toBeTruthy();
    expect(screen.getByText("Du")).toBeTruthy();
  });

  it("gibt jeder Kachel eine eigene Positionsangabe, genau eine", () => {
    /*
      Ohne sie beziehen sich das Video und die Beschriftung darin auf die
      naechste positionierte Flaeche darueber, also auf die ganze Buehne.
      Gemessen war der Fuss einer 149 Pixel breiten Kachel dann 1305 Pixel
      breit und lief quer ueber den geteilten Bildschirm. Zwei Angaben sind
      genauso falsch, dann gewinnt im Stylesheet die spaetere.
    */
    const stellungen = (el: Element) =>
      [...el.classList].filter((k) => ["static", "fixed", "absolute", "relative", "sticky"].includes(k));

    for (const anordnung of ["gestapelt", "raster", "teilen"] as const) {
      const gegenstellen = anordnung === "raster"
        ? [gast("a", "A"), gast("b", "B")]
        : [gast("a", "Martina Brandl")];
      const verbindung = zeichne({ lokalerStream: strom("kamera"), gegenstellen });
      if (anordnung === "teilen") act(() => { verbindung.meldeTeilen(true, strom("schirm")); });

      const kacheln = document.querySelectorAll('[data-pruefung="teilnehmer-kachel"], [data-pruefung="eigenes-bild"]');
      expect(kacheln.length).toBeGreaterThan(0);
      for (const kachel of kacheln) expect(stellungen(kachel)).toHaveLength(1);
      cleanup();
    }
  });

  it("beschriftet auch die kleinen Kacheln waehrend des Teilens", () => {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gast-a", "Martina Brandl")],
    });
    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });

    expect(fuesse()).toHaveLength(2);
    for (const fuss of fuesse()) {
      expect(fuss.className).toContain("inset-x-0");
      expect(fuss.className).toContain("bottom-0");
    }
    expect(screen.getByText("Martina Brandl")).toBeTruthy();
    expect(screen.getByText("Du")).toBeTruthy();
  });

  it("greift beim Teilen auf die rohe Kamera zurueck", () => {
    // Die Leinwand des Video-Hintergrunds ruht dann mit Absicht. Ohne diesen
    // Rueckgriff stuende in der eigenen Kachel ein Standbild.
    const roh = strom("rohe-kamera");
    const verbindung = zeichne({
      lokalerStream: strom("leinwand"),
      gegenstellen: [gast("gast-a", "Martina Brandl")],
      eigeneVorschau: () => roh,
    });
    const eigenes = () => document.querySelector<HTMLElement>('[data-pruefung="eigenes-bild"]')!;
    expect(eigenes().querySelector("video")?.srcObject).toHaveProperty("kennzeichen", "leinwand");

    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });
    expect(eigenes().querySelector("video")?.srcObject).toHaveProperty("kennzeichen", "rohe-kamera");

    act(() => { verbindung.meldeTeilen(false, null); });
    expect(eigenes().querySelector("video")?.srcObject).toHaveProperty("kennzeichen", "leinwand");
  });

  it("bleibt beim lokalen Strom, wenn kein Hintergrund laeuft", () => {
    // Dann steckt die Kamera unveraendert im Stream und friert nicht ein.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gast-a", "Martina Brandl")],
      eigeneVorschau: () => null,
    });
    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });
    const eigenes = document.querySelector<HTMLElement>('[data-pruefung="eigenes-bild"]')!;
    expect(eigenes.querySelector("video")?.srcObject).toHaveProperty("kennzeichen", "kamera");
  });
});

/**
 * Ton und Kamera des Gegenuebers.
 *
 * Christian am 18.09.2026: „auch wenn der gastgeber seine kamera ausschaltet
 * muss es bei dem gegenueber angezeigt werden, da passiert noch nichts. wenn
 * der gast die kamera ausmacht, ist nur schwarz beim gastgeber." Und dazu:
 * „zudem muss in jeder kamerasicht beim gegenueber der name des jeweiligen
 * angezeigt werden und davor dann das stummschalten zeichen wenn die person
 * stummgeschalten ist."
 *
 * Vorher gab es fuer die Kamera ueberhaupt keine Meldung, und den Tonstand
 * schickte nur der Gast an den Gastgeber. Jetzt meldet beides die gemeinsame
 * Ansicht, also beide Seiten gleich.
 */
describe("Gespraech, Ton und Kamera des Gegenuebers", () => {
  const gast = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  function hinweise() { return [...document.querySelectorAll('[data-pruefung="kamera-aus"]')]; }

  it("meldet den eigenen Stand an alle, sobald jemand da ist", () => {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
    });
    // Ohne Empfaenger, also Rundruf. Gezielt waere falsch: Im Raum koennen
    // mehrere sitzen, und jeder von ihnen braucht den Stand.
    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "tonstand", an: true });
    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "bildstand", an: true });
  });

  it("meldet ihn erneut, wenn spaeter jemand dazukommt", () => {
    // Der Signalkanal merkt sich nichts. Wer spaeter kommt, bekaeme sonst nie
    // einen Stand und saehe dauerhaft den falschen Hinweis.
    const verbindung = verbindungAttrappe();
    const eigenschaften = {
      lokalerStream: strom("kamera"),
      zustand: "verbunden" as const,
      gegenName: "Martina Brandl",
      verbindung,
      aufBeenden: () => { /* egal */ },
      titel: "Beratungsgespräch",
    };
    const { rerender } = render(<Gespraech {...eigenschaften} gegenstellen={[]} />);
    (verbindung.sendeRegie as ReturnType<typeof vi.fn>).mockClear();

    rerender(<Gespraech {...eigenschaften} gegenstellen={[gast("spaet", "Peter Huber")]} />);

    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "bildstand", an: true });
  });

  it("fragt beim Einhaengen nach dem Stand der anderen", () => {
    // Melden allein genuegt nicht: Wer seine Ansicht neu aufbaut, etwa wenn
    // der Gastgeber das Gespraech kleiner und wieder gross macht, weiss danach
    // nichts mehr. Der Signalkanal merkt sich nichts.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
    });
    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "standfrage" });
  });

  it("antwortet auf eine Standfrage gezielt mit dem eigenen Stand", () => {
    // Gezielt, nicht in die Runde: Die anderen kennen ihn schon. Und auf eine
    // Antwort folgt keine neue Frage, es kann also nicht hin und her gehen.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
    });
    fireEvent.click(screen.getByLabelText("Bild"));
    (verbindung.sendeRegie as ReturnType<typeof vi.fn>).mockClear();

    act(() => { verbindung.meldeRegie({ art: "standfrage" }, "gegen"); });

    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "tonstand", an: true }, "gegen");
    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "bildstand", an: false }, "gegen");
    // Keine Gegenfrage, sonst liefe es endlos.
    expect(verbindung.sendeRegie).not.toHaveBeenCalledWith({ art: "standfrage" });
  });

  it("meldet das Umschalten von Ton und Bild", () => {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
    });
    (verbindung.sendeRegie as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.click(screen.getByLabelText("Bild"));
    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "bildstand", an: false });

    fireEvent.click(screen.getByLabelText("Ton"));
    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "tonstand", an: false });
  });

  it("zeigt in der Kachel, dass die Kamera des Gegenuebers aus ist", () => {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
    });
    expect(hinweise()).toHaveLength(0);

    act(() => { verbindung.meldeRegie({ art: "bildstand", an: false }, "gegen"); });

    expect(screen.getByText("Kamera ist aus")).toBeTruthy();
    // Der Name bleibt daneben stehen, sonst wuesste niemand, wessen Kamera.
    expect(screen.getByText("Martina Brandl")).toBeTruthy();

    act(() => { verbindung.meldeRegie({ art: "bildstand", an: true }, "gegen"); });
    expect(screen.queryByText("Kamera ist aus")).toBeNull();
  });

  it("zeigt das Stummzeichen vor dem Namen", () => {
    // „davor dann das stummschalten zeichen", also links vom Namen und in
    // derselben Beschriftung.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
    });
    act(() => { verbindung.meldeRegie({ art: "tonstand", an: false }, "gegen"); });

    const zeichen = screen.getByLabelText("Martina Brandl ist stummgeschaltet");
    const name = screen.getByText("Martina Brandl");
    expect(zeichen.parentElement).toBe(name.parentElement);
    expect(zeichen.compareDocumentPosition(name)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("zeigt beides gleichzeitig, ohne dass eines das andere verdeckt", () => {
    // Der haeufige Fall: Wer die Kamera ausmacht, macht oft auch das Mikrofon
    // aus. Der Kamerahinweis liegt in der Flaeche, das Zeichen unten am Namen.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
    });
    act(() => {
      verbindung.meldeRegie({ art: "bildstand", an: false }, "gegen");
      verbindung.meldeRegie({ art: "tonstand", an: false }, "gegen");
    });

    const flaeche = screen.getByText("Kamera ist aus");
    const fuss = screen.getByText("Martina Brandl").parentElement!;
    expect(flaeche).toBeTruthy();
    expect(screen.getByLabelText("Martina Brandl ist stummgeschaltet")).toBeTruthy();
    // Zwei getrennte Stellen in der Kachel, nicht uebereinander.
    expect(fuss.contains(flaeche)).toBe(false);
    expect(flaeche.contains(fuss)).toBe(false);
  });

  it("zeigt der eigenen Kachel die eigene ausgeschaltete Kamera", () => {
    // Wer selbst abschaltet, soll nicht ins Schwarze starren.
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gegen", "Martina Brandl")] });
    expect(screen.queryByText("Deine Kamera ist aus")).toBeNull();

    fireEvent.click(screen.getByLabelText("Bild"));

    expect(screen.getByText("Deine Kamera ist aus")).toBeTruthy();
  });

  it("nennt auch in der eigenen Kachel den Namen und das Stummzeichen", () => {
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gegen", "Martina Brandl")] });
    expect(screen.getByText("Du")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Ton"));

    expect(screen.getByLabelText("Du ist stummgeschaltet")).toBeTruthy();
  });

  it("vergisst den Stand, wenn jemand den Raum verlaesst", () => {
    // Sonst stuende bei einem spaeteren Teilnehmer mit derselben Kennung ein
    // alter Hinweis.
    const verbindung = verbindungAttrappe();
    const eigenschaften = {
      lokalerStream: strom("kamera"),
      zustand: "verbunden" as const,
      gegenName: "Martina Brandl",
      verbindung,
      aufBeenden: () => { /* egal */ },
      titel: "Beratungsgespräch",
    };
    const { rerender } = render(<Gespraech {...eigenschaften} gegenstellen={[gast("gegen", "Martina Brandl")]} />);
    act(() => { verbindung.meldeRegie({ art: "bildstand", an: false }, "gegen"); });
    expect(screen.getByText("Kamera ist aus")).toBeTruthy();

    rerender(<Gespraech {...eigenschaften} gegenstellen={[]} />);
    rerender(<Gespraech {...eigenschaften} gegenstellen={[gast("gegen", "Martina Brandl")]} />);

    expect(screen.queryByText("Kamera ist aus")).toBeNull();
  });
});

/**
 * Die Buehne waehrend des Bildschirmteilens.
 *
 * Christian am 18.09.2026: „Der Gastgeber muss auch eine Vorschau dessen
 * sehen, was er teilt. Und dann muss auch sein Bild als kleine Kachel,
 * genauso wie die des Gastes, dahin rutschen." Vorher sah er in seiner
 * eigenen Kachel weiter die Kamera und den geteilten Inhalt gar nicht. Wer
 * nicht sieht, was hinausgeht, teilt im schlimmsten Fall sein Postfach.
 */
describe("Gespraech, Bildschirmteilen", () => {
  const gast = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  function flaeche() { return document.querySelector('[data-pruefung="bildschirm-flaeche"]'); }
  function eigeneBilder() { return [...document.querySelectorAll<HTMLElement>('[data-pruefung="eigenes-bild"]')]; }

  it("zeigt dem Gastgeber eine Vorschau dessen, was er teilt", () => {
    const bildschirm = strom("bildschirm");
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gast-a", "Martina Brandl")],
      teilenBeschriftung: "Das sieht dein Kunde gerade",
    });
    expect(flaeche()).toBeNull();

    act(() => { verbindung.meldeTeilen(true, bildschirm); });

    const gross = flaeche();
    expect(gross).not.toBeNull();
    expect(screen.getByText("Das sieht dein Kunde gerade")).toBeTruthy();
    // Genau der Strom, der auch hinausgeht. Ein anderer waere schlimmer als
    // gar keiner: Er sagte dem Gastgeber etwas Falsches ueber das, was ankommt.
    expect(gross?.querySelector("video")).toHaveProperty("srcObject", bildschirm);
  });

  it("rahmt die eigene Freigabe ein und passt sie ganz hinein", () => {
    // Der Rahmen beantwortet die Frage, was gerade hinausgeht. Beschnitten
    // werden darf dabei nichts, sonst fehlt beim Kunden der untere Rand.
    const verbindung = zeichne({ lokalerStream: strom("kamera") });
    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });

    expect(flaeche()?.className).toContain("border-[#88CFFF]");
    expect(flaeche()?.querySelector("video")?.className).toContain("object-contain");
  });

  it("schiebt beim Gastgeber das eigene Bild in die Kachelreihe", () => {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gast-a", "Martina Brandl")],
    });
    // Vorher: eine eigene Kachel im Stapel unter dem Gegenueber.
    expect(eigeneBilder()).toHaveLength(1);
    expect(eigeneBilder()[0].dataset.lage).toBe("kachel");

    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });

    expect(eigeneBilder()).toHaveLength(1);
    expect(eigeneBilder()[0].dataset.lage).toBe("reihe");
  });

  it("stellt beim Gast den fremden Bildschirm groß und die Kameras klein", () => {
    // Dieselbe Regie wie beim Gastgeber, nur von der anderen Seite. Vorher
    // fuellte der Bildschirm die Flaeche beim Gast nur zufaellig, weil dort
    // eine einzige Gegenstelle stand.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gastgeber-x", "Christian Peetz"), gast("gast-b", "Peter Huber")],
    });
    expect(flaeche()).toBeNull();

    act(() => { verbindung.meldeRegie({ art: "bildschirm", an: true }, "gastgeber-x"); });

    expect(flaeche()).not.toBeNull();
    expect(screen.getByText("Bildschirm von Christian Peetz")).toBeTruthy();
    // Sein Gesicht gibt es waehrenddessen nicht: Die Videospur traegt den
    // Bildschirm. Eine zweite Kachel mit seinem Namen waere eine Luege.
    expect(eigeneBilder()[0].dataset.lage).toBe("reihe");
    expect(screen.queryByText("Christian Peetz")).toBeNull();
    expect(screen.getByText("Peter Huber")).toBeTruthy();
  });

  it("springt nach dem Beenden zurück auf die gewohnte Anordnung", () => {
    // Der haeufigste Bruch: Das Teilen endet, aber die Buehne bleibt stehen.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gast-a", "Martina Brandl")],
    });
    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });
    expect(flaeche()).not.toBeNull();

    act(() => { verbindung.meldeTeilen(false, null); });

    expect(flaeche()).toBeNull();
    expect(eigeneBilder()).toHaveLength(1);
    expect(eigeneBilder()[0].dataset.lage).toBe("kachel");
    // Und in der Ecke steht wieder die Kamera, nicht der letzte Bildschirm.
    // Sonst zeigte die Ansicht etwas, das laengst niemand mehr bekommt.
    expect(eigeneBilder()[0].querySelector("video")?.srcObject).toHaveProperty("kennzeichen", "kamera");
  });

  it("springt auch zurück, wenn die Gegenstelle das Teilen beendet", () => {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gastgeber-x", "Christian Peetz")],
    });
    act(() => { verbindung.meldeRegie({ art: "bildschirm", an: true }, "gastgeber-x"); });
    expect(flaeche()).not.toBeNull();

    act(() => { verbindung.meldeRegie({ art: "bildschirm", an: false }, "gastgeber-x"); });

    expect(flaeche()).toBeNull();
    expect(screen.getByText("Christian Peetz")).toBeTruthy();
  });
  it("behält den Wartehinweis, wenn schon vor dem ersten Gast geteilt wird", () => {
    // Der Hinweis stand bisher auf der großen Fläche. Die ist jetzt vom
    // geteilten Inhalt belegt, also rutscht er mit in die Kachelreihe.
    const verbindung = zeichne({ lokalerStream: strom("kamera"), gegenstellen: [] });
    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });
    expect(screen.getByText("Warte auf Martina Brandl…")).toBeTruthy();
  });
});

/**
 * Spiegeln der eigenen Vorschau.
 *
 * Gespiegelt wird die ganze Videoflaeche, also auch ein eingesetztes
 * Hintergrundbild samt Schrift. Christian am 18.09.2026: Sein Logo stand
 * seitenverkehrt im Bild, lesbar als „ommlE". Vorspiegeln in der Leinwand
 * geht nicht, denn dieselbe Leinwand geht an die Gegenstellen. Also setzt die
 * lokale Spiegelung aus, solange ein Hintergrundbild laeuft, und nur dann.
 */
describe("Gespraech, Spiegelung und Hintergrundbild", () => {
  const teilnehmer = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  /** Spiegelt die eigene Kachel gerade? */
  function eigenesSpiegelt(): boolean {
    const eigenes = document.querySelector<HTMLElement>('[data-pruefung="eigenes-bild"]');
    if (!eigenes) throw new Error("Die Selbstansicht fehlt ganz.");
    const video = eigenes.querySelector("video");
    if (!video) throw new Error("In der Selbstansicht steckt kein Video.");
    return video.className.includes("-scale-x-100");
  }

  it("spiegelt nicht, solange ein Hintergrundbild laeuft", () => {
    zeichne({ lokalerStream: strom("leinwand"), spiegelEigenbild: true, hintergrundArt: "bild" });
    expect(eigenesSpiegelt()).toBe(false);
  });

  it("spiegelt beim Weichzeichnen wie bisher, dort gibt es keine Schrift", () => {
    zeichne({ lokalerStream: strom("leinwand"), spiegelEigenbild: true, hintergrundArt: "weich" });
    expect(eigenesSpiegelt()).toBe(true);
  });

  it("spiegelt ohne Hintergrund wie bisher", () => {
    zeichne({ lokalerStream: strom("kamera"), spiegelEigenbild: true, hintergrundArt: "aus" });
    expect(eigenesSpiegelt()).toBe(true);
  });

  it("spiegelt nicht, wenn der Schalter aus ist", () => {
    zeichne({ lokalerStream: strom("kamera"), spiegelEigenbild: false, hintergrundArt: "aus" });
    expect(eigenesSpiegelt()).toBe(false);
  });

  it("gilt auch in der gestapelten Ansicht zu zweit", () => {
    zeichne({
      lokalerStream: strom("leinwand"),
      gegenstellen: [teilnehmer("gast-a", "Martina Brandl")],
      spiegelEigenbild: true,
      hintergrundArt: "bild",
    });
    expect(eigenesSpiegelt()).toBe(false);
  });

  it("gilt auch in der Kachelreihe waehrend des Teilens", () => {
    const roh = strom("rohe-kamera");
    const verbindung = zeichne({
      lokalerStream: strom("leinwand"),
      gegenstellen: [teilnehmer("gast-a", "Martina Brandl")],
      eigeneVorschau: () => roh,
      spiegelEigenbild: true,
      hintergrundArt: "bild",
    });
    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });
    expect(eigenesSpiegelt()).toBe(false);
  });
});

/**
 * Der Gast entscheidet selbst, ob er die Kachelreihe sieht.
 *
 * Christian am 18.09.2026: „er soll aber am Handy selbst entscheiden, ob er
 * meine Kachel einklappt oder ausgeklappt lässt." Auf einem Telefon von 375
 * Punkten Breite nehmen der geteilte Inhalt und die Reihe sich gegenseitig
 * den Platz weg.
 */
describe("Gespraech, Kachelreihe ein- und ausklappen", () => {
  const gast = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  function reihe() { return document.querySelector<HTMLElement>('[data-pruefung="kachelreihe"]'); }
  function teilend() {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gast-a", "Martina Brandl")],
    });
    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });
    return verbindung;
  }

  beforeEach(() => { sessionStorage.clear(); });

  it("zeigt die Reihe von sich aus ausgeklappt, mit einem Schalter daran", () => {
    teilend();
    expect(reihe()?.dataset.offen).toBe("true");
    expect(screen.getByLabelText("Kameras einklappen")).toBeTruthy();
    expect(document.querySelector('[data-pruefung="kachelreihe-eingeklappt"]')).toBeNull();
  });

  it("klappt auf Klick ein und sagt, wie viele Kacheln warten", () => {
    teilend();
    fireEvent.click(screen.getByLabelText("Kameras einklappen"));

    expect(reihe()?.dataset.offen).toBe("false");
    // Nicht spurlos weg: Der Streifen sagt, dass es die Kacheln gibt, und
    // der Knopf sagt, wie man sie zurueckholt. Zwei Kacheln, das eigene Bild
    // und das Gegenueber.
    expect(screen.getByText("2 Kameras sind eingeklappt")).toBeTruthy();
    expect(screen.getByLabelText("Kameras zeigen")).toBeTruthy();
  });

  it("holt sie mit dem zweiten Klick wieder zurueck", () => {
    teilend();
    fireEvent.click(screen.getByLabelText("Kameras einklappen"));
    fireEvent.click(screen.getByLabelText("Kameras zeigen"));

    expect(reihe()?.dataset.offen).toBe("true");
    expect(document.querySelector('[data-pruefung="kachelreihe-eingeklappt"]')).toBeNull();
  });

  it("laesst die Kacheln im Baum stehen, damit der Ton nicht abreisst", () => {
    /*
     * Die Stimme der Gegenstelle kommt aus ihrer Kachel. Waeren die Kacheln
     * beim Einklappen aus dem Baum genommen, waere das Gespraech stumm, und
     * niemand kaeme auf die Ursache.
     */
    teilend();
    fireEvent.click(screen.getByLabelText("Kameras einklappen"));

    const kacheln = document.querySelectorAll('[data-pruefung="teilnehmer-kachel"]');
    expect(kacheln.length).toBe(1);
    expect(kacheln[0].querySelector("video")).toHaveProperty("muted", false);
  });

  it("behaelt die Wahl ueber das Gespraech hinweg", () => {
    // Der Gast hat kein Konto. Gemerkt wird in der Sitzung, siehe
    // `videoraumKachelreihe`. Wer die Reihe einmal weggenommen hat, soll das
    // nicht bei jeder neuen Freigabe wiederholen muessen.
    teilend();
    fireEvent.click(screen.getByLabelText("Kameras einklappen"));
    cleanup();

    teilend();
    expect(reihe()?.dataset.offen).toBe("false");
    expect(screen.getByLabelText("Kameras zeigen")).toBeTruthy();
  });

  it("gibt beiden Schaltern mindestens 44 mal 44 Pixel, in festen Pixeln", () => {
    /*
     * Die Wurzelschrift steht in `index.css` auf 90 Prozent. Aus einem `h-11`
     * wuerden dort 40 Pixel, also weniger, als eine Fingerkuppe zuverlaessig
     * trifft. Deshalb feste Pixel, und deshalb dieser Test: Eine spaetere
     * Umstellung auf Tailwind-Stufen faellt hier auf.
     */
    teilend();
    const zu = screen.getByLabelText("Kameras einklappen");
    expect(zu.className).toContain("h-[44px]");
    expect(zu.className).toContain("w-[44px]");

    fireEvent.click(zu);
    const auf = screen.getByLabelText("Kameras zeigen");
    expect(auf.className).toContain("h-[44px]");
    expect(auf.className).toContain("min-w-[44px]");
  });

  it("gibt es nur waehrend des Teilens", () => {
    // Ohne Teilen gibt es keine Reihe, also auch nichts einzuklappen.
    zeichne({ lokalerStream: strom("kamera"), gegenstellen: [gast("gast-a", "Martina Brandl")] });
    expect(reihe()).toBeNull();
    expect(screen.queryByLabelText("Kameras einklappen")).toBeNull();
  });
});

/**
 * Die Buehne, wenn die Gegenstelle mit zwei Stroemen teilt.
 *
 * Christian am 18.09.2026: „der Gast soll mich beim Teilen auch noch weiter
 * sehen können." Vorher ersetzte der Bildschirm die Kameraspur, und die
 * Kachel des Teilenden verschwand samt seinem Gesicht.
 */
describe("Gespraech, Gegenstelle teilt mit zwei Stroemen", () => {
  function flaeche() { return document.querySelector('[data-pruefung="bildschirm-flaeche"]'); }

  it("zeigt den Bildschirm gross und das Gesicht weiter in der Reihe", () => {
    const gesicht = strom("gesicht");
    const schirm = strom("schirm");
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [{
        kennung: "gastgeber", name: "Christian Peetz",
        stream: gesicht, bildschirm: schirm, bildschirmErwartet: true,
        zustand: "verbunden",
      }],
    });
    act(() => { verbindung.meldeRegie({ art: "bildschirm", an: true, strom: "schirm" }, "gastgeber"); });

    expect(flaeche()?.querySelector("video")).toHaveProperty("srcObject", schirm);
    // Sein Gesicht steht weiter da, mit seinem Namen darunter.
    const kachel = document.querySelector('[data-pruefung="teilnehmer-kachel"]');
    expect(kachel?.querySelector("video")).toHaveProperty("srcObject", gesicht);
    expect(screen.getByText("Christian Peetz")).toBeTruthy();
  });

  it("stellt die grosse Flaeche stumm und laesst die Stimme in der Kachel", () => {
    // Sonst liefe dieselbe Stimme zweimal: Der Ton haengt am Alltagsstrom.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [{
        kennung: "gastgeber", name: "Christian Peetz",
        stream: strom("gesicht"), bildschirm: strom("schirm"), bildschirmErwartet: true,
        zustand: "verbunden",
      }],
    });
    act(() => { verbindung.meldeRegie({ art: "bildschirm", an: true, strom: "schirm" }, "gastgeber"); });

    expect(flaeche()?.querySelector("video")).toHaveProperty("muted", true);
    const kachel = document.querySelector('[data-pruefung="teilnehmer-kachel"]');
    expect(kachel?.querySelector("video")).toHaveProperty("muted", false);
  });

  it("laesst bei einem aelteren Stand ohne zweiten Strom alles wie bisher", () => {
    // Dort steckt der Bildschirm in derselben einen Videospur, das Gesicht
    // gibt es waehrenddessen nirgends. Die Kachel faellt wie frueher weg, und
    // die Stimme kommt aus der grossen Flaeche.
    const einziger = strom("einziger");
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [{
        kennung: "gastgeber", name: "Christian Peetz", stream: einziger, zustand: "verbunden",
      }],
    });
    act(() => { verbindung.meldeRegie({ art: "bildschirm", an: true }, "gastgeber"); });

    expect(flaeche()?.querySelector("video")).toHaveProperty("srcObject", einziger);
    expect(flaeche()?.querySelector("video")).toHaveProperty("muted", false);
    expect(document.querySelector('[data-pruefung="teilnehmer-kachel"]')).toBeNull();
  });
});

describe("Gespraech, leere Kachel erklaert sich", () => {
  /*
   * Der Anlass, gemessen in einem laufenden Gespraech mit drei Teilnehmern:
   * Die Kachel "Chris Peetz Laptop" blieb schwarz und sagte nichts. Die Spur
   * war da, `muted` stand auf true, das Video auf 0 mal 0, und in zwei
   * Sekunden kam kein einziges Bild an. Gemeldet hatte der Laptop aber
   * "Kamera an", und nur auf diese Meldung sah die Kachel. Fuer den Gastgeber
   * war damit eine abgeschaltete Kamera von einer klemmenden Leitung nicht zu
   * unterscheiden.
   */

  /** Ein Strom mit einer Spur, die sich wie eine empfangene verhaelt. */
  function stromMitSpur() {
    const spur = Object.assign(new EventTarget(), {
      kind: "video", readyState: "live", muted: false,
    });
    const stream = Object.assign(new EventTarget(), {
      id: "mit-spur", getVideoTracks: () => [spur],
    });
    return { stream: stream as unknown as MediaStream, spur };
  }

  function kachelVideo(): HTMLVideoElement {
    const el = document.querySelector<HTMLVideoElement>('[data-pruefung="teilnehmer-kachel"] video');
    if (!el) throw new Error("Die Kachel des Gegenuebers fehlt ganz.");
    return el;
  }

  /** Bilder kommen an: Format gemeldet, Spur laeuft. */
  function bilderLaufen(spur: { muted: boolean }) {
    const video = kachelVideo();
    Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });
    spur.muted = false;
    act(() => { video.dispatchEvent(new Event("resize")); });
  }

  /** Der Strom versiegt. Genau das meldet der Browser mit "mute". */
  function stromVersiegt(spur: { muted: boolean } & EventTarget) {
    spur.muted = true;
    act(() => { spur.dispatchEvent(new Event("mute")); });
  }

  function hinweis(pruefung: string) {
    return document.querySelector(`[data-pruefung="${pruefung}"]`);
  }

  /*
   * Nur die Zeitgeber stellen, nicht die Uhr der Welt. Faelscht man
   * zusaetzlich `Date`, `performance` und `requestAnimationFrame`, verrechnet
   * sich der Zeitplaner von React nach dem Zuruecksetzen: Gemessen wurde jeder
   * folgende Test im Lauf um mehrere Sekunden langsamer.
   */
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });
  /*
   * Erst abraeumen, dann die Uhr zurueckgeben. Andersherum bleiben die
   * Zeitgeber dieser Ansicht in der falschen Welt haengen: Die Ansicht laeuft
   * mit einem Sekundentakt, und wer sie erst nach `useRealTimers` abbaut,
   * loescht einen Zeitgeber, den es in der echten Uhr nie gab. Gemessen hat
   * das jeden folgenden Test im Lauf um Sekunden verlangsamt.
   */
  afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

  function mitGast(zusatz: Partial<Gegenstelle> = {}) {
    const { stream, spur } = stromMitSpur();
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [{
        kennung: "gegen", name: "Chris Peetz Laptop", stream, zustand: "verbunden", ...zusatz,
      }],
    });
    return { verbindung, spur };
  }

  it("a) sagt es, wenn das Gegenueber die Kamera ausgeschaltet meldet", () => {
    const { verbindung, spur } = mitGast();
    bilderLaufen(spur);

    act(() => { verbindung.meldeRegie({ art: "bildstand", an: false }, "gegen"); });

    expect(screen.getByText("Kamera ist aus")).toBeTruthy();
    // Und nichts von einer Stoerung: Eine ausgeschaltete Kamera ist kein
    // Fehler, sondern eine Entscheidung.
    act(() => { vi.advanceTimersByTime(30000); });
    expect(hinweis("bild-wartet")).toBeNull();
    expect(hinweis("bild-stoerung")).toBeNull();
  });

  it("b) sagt es auch, wenn 'Kamera an' gemeldet wird und trotzdem nichts ankommt", () => {
    mitGast();

    // Im ersten Augenblick steht nichts da: So sieht jeder Beitritt aus.
    expect(hinweis("bild-wartet")).toBeNull();
    expect(hinweis("kamera-aus")).toBeNull();

    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText("Warte auf das Bild…")).toBeTruthy();
    // Und nicht "Kamera ist aus": Das waere eine Behauptung ueber einen
    // fremden Schalter, von dem wir nichts wissen.
    expect(hinweis("kamera-aus")).toBeNull();

    act(() => { vi.advanceTimersByTime(7500); });
    expect(screen.getByText("Es kommt kein Bild an")).toBeTruthy();
    expect(screen.queryByText("Warte auf das Bild…")).toBeNull();
  });

  it("c) haelt sich heraus, solange Bilder laufen", () => {
    const { spur } = mitGast();
    bilderLaufen(spur);

    act(() => { vi.advanceTimersByTime(30000); });

    expect(hinweis("bild-wartet")).toBeNull();
    expect(hinweis("bild-stoerung")).toBeNull();
    expect(hinweis("kamera-aus")).toBeNull();
  });

  it("flackert nicht, wenn eine Spur kurz aussetzt", () => {
    // Ein Aussetzer beim Wechsel von WLAN auf Mobilfunk dauert einen
    // Augenblick. Wer dafuer einen Hinweis aufblitzen laesst, hat einen
    // Hinweis, den niemand mehr ernst nimmt.
    const { spur } = mitGast();
    bilderLaufen(spur);

    stromVersiegt(spur);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(hinweis("bild-wartet")).toBeNull();

    bilderLaufen(spur);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(hinweis("bild-wartet")).toBeNull();
    expect(hinweis("bild-stoerung")).toBeNull();
  });

  it("nimmt den Hinweis sofort zurueck, sobald das Bild da ist", () => {
    const { spur } = mitGast();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(hinweis("bild-wartet")).toBeTruthy();

    bilderLaufen(spur);

    expect(hinweis("bild-wartet")).toBeNull();
  });

  it("sagt einen echten Verbindungsabriss sofort, ohne zu warten", () => {
    // Das ist der einzige Fall, in dem nichts geraten werden muss: Der
    // Zustand kommt aus `RTCPeerConnection.connectionState`.
    mitGast({ zustand: "gescheitert" });

    expect(screen.getByText("Die Verbindung ist abgerissen")).toBeTruthy();
    expect(hinweis("bild-wartet")).toBeNull();
  });
});

describe("bestimmeBildstand", () => {
  const grund = { bildAnGemeldet: true, bildFliesst: false, stilleMs: null as number | null };

  it("glaubt der Meldung 'Kamera aus' vor allem anderen", () => {
    expect(bestimmeBildstand({ ...grund, bildAnGemeldet: false, stilleMs: 60000 })).toBe("aus");
    expect(bestimmeBildstand({ ...grund, bildAnGemeldet: false, zustand: "gescheitert" })).toBe("aus");
  });

  it("schweigt, solange Bilder ankommen", () => {
    expect(bestimmeBildstand({ ...grund, bildFliesst: true })).toBe("laeuft");
  });

  it("schweigt auch in den ersten Augenblicken ohne Bild", () => {
    expect(bestimmeBildstand({ ...grund, stilleMs: 0 })).toBe("laeuft");
    expect(bestimmeBildstand({ ...grund, stilleMs: BILD_WARTEN_MS - 1 })).toBe("laeuft");
  });

  it("wartet erst ruhig und wird dann deutlich", () => {
    expect(bestimmeBildstand({ ...grund, stilleMs: BILD_WARTEN_MS })).toBe("wartet");
    expect(bestimmeBildstand({ ...grund, stilleMs: BILD_STOERUNG_MS })).toBe("stoerung");
  });

  it("nennt einen bekannten Verbindungsabriss beim Namen", () => {
    expect(bestimmeBildstand({ ...grund, zustand: "getrennt" })).toBe("verbindung");
    expect(bestimmeBildstand({ ...grund, zustand: "gescheitert" })).toBe("verbindung");
    // Aber nicht, solange etwas ankommt: Dann ist die Leitung offensichtlich da.
    expect(bestimmeBildstand({ ...grund, bildFliesst: true, zustand: "getrennt" })).toBe("laeuft");
  });
});

describe("Gespraech, die eigene Kachel kennt sich selbst", () => {
  /*
   * Gemessen in der Gastgebersicht: Der Kachelfuss "Du" trug das
   * Stummzeichen, waehrend das eigene Mikrofon lief. Die eigene Kachel darf
   * ihren Stand deshalb nie aus der Meldungstabelle nehmen. Dort stehen nur
   * die Meldungen der ANDEREN, sich selbst meldet man niemandem, und ein
   * fehlender Eintrag laese sich als "stumm" lesen.
   */
  const gast = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  function eigenerFuss() {
    const el = document.querySelector('[data-pruefung="eigenes-bild"]');
    if (!el) throw new Error("Die eigene Kachel fehlt ganz.");
    return el;
  }

  it("traegt bei eigenem Ton AN kein Stummzeichen, was die anderen auch melden", () => {
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
      tonAn: true,
      bildAn: true,
      wechsleTon: () => { /* der Stand liegt oberhalb der Seite */ },
      wechsleBild: () => { /* dito */ },
    });

    act(() => { verbindung.meldeRegie({ art: "tonstand", an: false }, "gegen"); });
    act(() => { verbindung.meldeRegie({ art: "bildstand", an: false }, "gegen"); });

    expect(eigenerFuss().querySelector('[data-pruefung="ton-aus"]')).toBeNull();
    expect(eigenerFuss().querySelector('[data-pruefung="kamera-aus"]')).toBeNull();
    // Beim Gegenueber stimmt dieselbe Meldung dagegen sehr wohl.
    const fremde = document.querySelector('[data-pruefung="teilnehmer-kachel"]');
    expect(fremde?.querySelector('[data-pruefung="ton-aus"]')).toBeTruthy();
  });

  it("traegt es bei eigenem Ton AUS", () => {
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("gegen", "Martina Brandl")],
      tonAn: false,
      bildAn: false,
      wechsleTon: () => { /* siehe oben */ },
      wechsleBild: () => { /* siehe oben */ },
    });

    expect(eigenerFuss().querySelector('[data-pruefung="ton-aus"]')).toBeTruthy();
    expect(screen.getByText("Deine Kamera ist aus")).toBeTruthy();
  });
});

describe("Gespraech, Anordnung auf dem Telefon", () => {
  /*
   * Christian am 18.09.2026: „und wenn man mobil in den videoraum eingeloggt
   * ist dann bei zwei soll der bildschirm sich teilen, oben ist gastgeber und
   * unten ueber die breite ist gast, wenn drei oder 4 im videoraum sind dann
   * bitte den bildschirm 4 teilen und dann in den viertel im querformat immer
   * die videouebertragung anzeigen."
   *
   * Am Rechner aendert sich nichts, und waehrend des Bildschirmteilens auch
   * nicht. Massgeblich ist `useIsMobile`, also die Fensterbreite unter 768.
   */
  const gast = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  function breite(px: number) {
    Object.defineProperty(window, "innerWidth", { value: px, writable: true, configurable: true });
  }
  afterEach(() => { breite(1024); });

  /** Die Kacheln in der Reihenfolge, in der sie im Baum stehen. */
  function reihenfolge() {
    return [...document.querySelectorAll<HTMLElement>(
      '[data-pruefung="teilnehmer-kachel"], [data-pruefung="eigenes-bild"]',
    )].map((el) => el.dataset.pruefung === "eigenes-bild" ? "ich" : "gegenueber");
  }

  function eigenesBild() {
    return document.querySelector<HTMLElement>('[data-pruefung="eigenes-bild"]');
  }

  it("stellt zu zweit den Gastgeber oben und den Gast darunter", () => {
    breite(375);
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl")],
      istGastgeber: true,
    });

    expect(reihenfolge()).toEqual(["ich", "gegenueber"]);
  });

  it("stellt beim Gast dasselbe dar, also sein Gegenueber oben", () => {
    // Der Gastgeber steht auf beiden Seiten oben. Fuer den Gast ist das sein
    // Gegenueber, fuer den Gastgeber er selbst.
    breite(375);
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Christian Peetz")],
    });

    expect(reihenfolge()).toEqual(["gegenueber", "ich"]);
  });

  it("gibt beiden Haelften die volle Breite, statt sie auf das Bildformat zu ziehen", () => {
    /*
     * Christian zu einem Bild von der Gastseite: „warum ist das hochkannte
     * bild nicht sauber in dem hochkannt kaestchen angezeigt, das muss das
     * kaestchen ausfuellen." Auf dem Telefon nimmt die Kachel deshalb den
     * ganzen Platz ihrer Haelfte. Beschnitten wird trotzdem nichts, was frei
     * bleibt, ist der Kachelgrund.
     */
    breite(375);
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl")],
    });

    const fremde = document.querySelector<HTMLElement>('[data-pruefung="teilnehmer-kachel"]');
    expect(fremde?.dataset.lage).toBe("fuellend");
    expect(fremde?.className).toContain("w-full");
    // Kein festes Seitenverhaeltnis mehr, die Kachel richtet sich nach dem Platz.
    expect(fremde?.style.aspectRatio).toBeFalsy();
    expect(fremde?.dataset.format).toBeUndefined();
    expect(eigenesBild()?.dataset.lage).toBe("voll");
  });

  it("viertelt die Flaeche ab drei Personen und stellt das eigene Bild hinein", () => {
    breite(375);
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl"), gast("b", "Peter Huber")],
    });

    const raster = document.querySelector<HTMLElement>('[data-pruefung="raster"]');
    expect(raster?.className).toContain("grid-cols-2");
    // Zwei Gegenstellen und man selbst, das vierte Viertel bleibt frei.
    expect(reihenfolge()).toEqual(["gegenueber", "gegenueber", "ich"]);
    expect(eigenesBild()?.dataset.lage).toBe("raster");
  });

  it("fuellt bei vieren alle vier Viertel", () => {
    breite(375);
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina"), gast("b", "Peter"), gast("c", "Hermann")],
    });

    expect(reihenfolge()).toEqual(["gegenueber", "gegenueber", "gegenueber", "ich"]);
    expect(eigenesBild()?.dataset.lage).toBe("raster");
  });

  it("laesst am Rechner alles, wie es war", () => {
    breite(1024);
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl")],
      istGastgeber: true,
    });

    // Zu zweit: das Gegenueber oben, beide Kacheln im Format ihres Bildes.
    expect(reihenfolge()).toEqual(["gegenueber", "ich"]);
    expect(document.querySelector<HTMLElement>('[data-pruefung="teilnehmer-kachel"]')?.dataset.lage)
      .toBe("format");
    expect(eigenesBild()?.dataset.lage).toBe("kachel");
  });

  it("laesst am Rechner ab drei Personen das eigene Bild in der Ecke", () => {
    breite(1024);
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl"), gast("b", "Peter Huber")],
    });

    expect(eigenesBild()?.dataset.lage).toBe("ecke");
  });

  it("ruehrt das Bildschirmteilen auch auf dem Telefon nicht an", () => {
    // Geteilter Inhalt gross, Kameras als Reihe darunter, einklappbar.
    breite(375);
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl")],
      istGastgeber: true,
    });

    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });

    expect(document.querySelector('[data-pruefung="bildschirm-flaeche"]')).toBeTruthy();
    expect(document.querySelector('[data-pruefung="kachelreihe"]')).toBeTruthy();
    expect(eigenesBild()?.dataset.lage).toBe("reihe");
  });
});

/*
 * Hier wird das Menue nur gezaehlt, nicht geoeffnet.
 *
 * Ein geoeffnetes Radix-Menue laesst in jsdom etwas zurueck, das jeden
 * folgenden Test im selben Lauf bremst: Gemessen wurde ein leerer Test danach
 * mit drei Sekunden, diese Datei wuchs von vier auf mehr als zweihundert.
 * Im Browser ist davon nichts zu sehen, das Menue baut sich dort in
 * Millisekunden auf. Was das Oeffnen braucht, steht deshalb in `Kachel.test.tsx`.
 */
describe("Gespraech, Dreipunktmenue an der Gastkachel", () => {
  const gast = (kennung: string, name: string): Gegenstelle => ({
    kennung, name, stream: strom(kennung), zustand: "verbunden",
  });

  const regie = () => ({
    stand: vi.fn(() => ({ tonAn: true, teilenErlaubt: false })),
    aufStumm: vi.fn(),
    aufTeilen: vi.fn(),
  });

  function menues() {
    return [...document.querySelectorAll<HTMLElement>('[data-pruefung="kachel-menue"]')];
  }

  it("steht an jeder Gastkachel, aber nicht an der eigenen", () => {
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl"), gast("b", "Peter Huber")],
      gastRegie: regie(),
    });

    expect(menues()).toHaveLength(2);
    expect(screen.getByLabelText("Optionen für Martina Brandl")).toBeTruthy();
    // Sich selbst schaltet man mit der Knopfleiste, nicht mit einem Menue.
    expect(document.querySelector('[data-pruefung="eigenes-bild"] [data-pruefung="kachel-menue"]')).toBeNull();
  });

  it("fehlt beim Gast ganz", () => {
    // Die Gastseite reicht keine Regie herein. Ein Gast darf niemanden
    // stummschalten, und das steht hier nicht im Ausblenden, sondern im
    // Bauplan.
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl")],
    });

    expect(menues()).toHaveLength(0);
  });

  it("fehlt in der kleinen Kachelreihe waehrend des Teilens", () => {
    // Dort ist eine Kachel rund 149 Pixel breit. Die Spalte bleibt daneben.
    const verbindung = zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl")],
      gastRegie: regie(),
    });
    expect(menues()).toHaveLength(1);

    act(() => { verbindung.meldeTeilen(true, strom("bildschirm")); });

    expect(menues()).toHaveLength(0);
  });

  it("gibt dem Griff 44 mal 44 Pixel, in festen Pixeln", () => {
    // In `index.css` schlaegt unter 768 Pixeln eine Regel mit `min-height: 40px`
    // jedes `min-h-` aus Tailwind. Mit festen Pixeln kann ihr das nicht
    // passieren.
    zeichne({
      lokalerStream: strom("kamera"),
      gegenstellen: [gast("a", "Martina Brandl")],
      gastRegie: regie(),
    });

    const knopf = screen.getByLabelText("Optionen für Martina Brandl");
    expect(knopf.className).toContain("h-[44px]");
    expect(knopf.className).toContain("w-[44px]");
  });
});
