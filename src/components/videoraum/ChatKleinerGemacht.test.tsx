import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, within, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

/**
 * Der Chat, waehrend das Gespraech kleingemacht ist.
 *
 * Christian am 18.09.2026 auf die Frage, ob er das braucht: „JA". Gemeint war
 * der Fall, dass er im CRM etwas fuer den Kunden sucht, waehrend der Kunde
 * schreibt. Die Gespraechsansicht ist dann abgebaut, und ohne diese Kette
 * merkte er gar nichts davon.
 *
 * Geprueft wird die ganze Kette in einem Lauf: Der Gast schreibt in seiner
 * Ansicht, der Gastgeber steht mit der Leiste im CRM, die Zahl faellt auf, der
 * Chat unter der Leiste zeigt den vollstaendigen Verlauf. Ersetzt ist nur der
 * Bote, siehe `Nebenfenster.test.tsx`.
 */

const zustand = vi.hoisted(() => ({
  aktiv: {
    raumId: "raum-1", token: "abc", titel: "Beratungsgespräch",
    gegenName: "Martina Brandl", startZeit: Date.now(),
  },
  minimiert: true,
  zustand: "verbunden" as string,
  gegenstellen: [] as Array<{ kennung: string; name: string; stream: MediaStream | null; zustand: string }>,
  staende: {} as Record<string, { tonAn: boolean; bildAn: boolean }>,
  tonAn: true,
  bildAn: true,
  lautsprecherId: null as string | null,
  lokalerStream: null as MediaStream | null,
  roheKamera: () => null as MediaStream | null,
  spiegeln: true,
  hintergrund: { art: "aus" } as { art: "aus" | "weich" | "bild" },
  schwebenMoeglich: false,
  schwebeFenster: null as Window | null,
  verbindung: null as unknown,
  oeffneSchwebend: vi.fn(),
  beende: vi.fn(),
  oeffne: vi.fn(),
  wechsleTon: vi.fn(),
  wechsleBild: vi.fn(),
}));

vi.mock("@/contexts/VideoraumContext", () => ({ useVideoraum: () => zustand }));

import { Gespraech } from "./Gespraech";
import { VideoraumLeiste } from "./VideoraumLeiste";
import { SchwebendeKacheln } from "./SchwebendeKacheln";
import { setzeChatZurueck } from "@/lib/videoraumChat";
import {
  istBekannterBefehl, nachrichtFuerMich,
  type Gegenstelle, type RegieBefehl, type Verbindung,
} from "@/lib/videoraumVerbindung";

beforeAll(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});

/** Derselbe Signalweg wie im Pruefstand nebenan. */
function baueRaum() {
  const melder = new Map<string, Set<(befehl: RegieBefehl, von: string) => void>>();

  return (kennung: string, name: string): Verbindung => {
    melder.set(kennung, new Set());
    return {
      eigeneKennung: kennung,
      eigenerName: name,
      setzeSpur: vi.fn(),
      teileBildschirm: vi.fn().mockResolvedValue(false),
      beobachteTeilen: () => () => { /* nichts */ },
      sendeRegie: (befehl, an) => {
        const nutzlast: unknown = JSON.parse(JSON.stringify(befehl));
        for (const [ziel, menge] of melder) {
          if (ziel === kennung) continue;
          if (!nachrichtFuerMich(an, ziel)) continue;
          if (!istBekannterBefehl(nutzlast)) continue;
          for (const m of [...menge]) m(nutzlast, kennung);
        }
      },
      beobachteRegie: (m) => {
        melder.get(kennung)?.add(m);
        return () => { melder.get(kennung)?.delete(m); };
      },
      beenden: vi.fn(),
    };
  };
}

const gegenstelle = (kennung: string, name: string): Gegenstelle => ({
  kennung, name, stream: null, zustand: "verbunden",
});

/**
 * Beide Seiten. Beim Gastgeber laesst sich umschalten zwischen Vollbild und
 * kleingemacht, genau wie im CRM: Im Vollbild steht die Gespraechsansicht, und
 * sobald er kleiner macht, ist sie weg und die Leiste da.
 */
function zeichneBeide() {
  const seite = baueRaum();
  const gastgeber = seite("gastgeber-1", "Christian Peetz");
  const gast = seite("gast-1", "Martina Brandl");
  zustand.verbindung = gastgeber;

  const Bild = ({ klein }: { klein: boolean }) => (
    <MemoryRouter initialEntries={["/kontakte"]}>
      <div data-seite="gastgeber">
        {klein ? (
          <VideoraumLeiste />
        ) : (
          <Gespraech
            lokalerStream={null}
            gegenstellen={[gegenstelle("gast-1", "Martina Brandl")]}
            zustand="verbunden"
            gegenName="Martina Brandl"
            verbindung={gastgeber}
            aufBeenden={() => { /* egal */ }}
            titel="Beratungsgespräch"
            istGastgeber
          />
        )}
      </div>
      <div data-seite="gast">
        <Gespraech
          lokalerStream={null}
          gegenstellen={[gegenstelle("gastgeber-1", "Christian Peetz")]}
          zustand="verbunden"
          gegenName="Christian Peetz"
          verbindung={gast}
          aufBeenden={() => { /* egal */ }}
          titel="Beratungsgespräch"
        />
      </div>
    </MemoryRouter>
  );

  const { rerender } = render(<Bild klein={false} />);
  const kasten = (seite: "gastgeber" | "gast") =>
    document.querySelector(`[data-seite="${seite}"]`) as HTMLElement;

  return {
    gastgeber: () => kasten("gastgeber"),
    gast: () => kasten("gast"),
    /** Kleiner machen und wieder gross, wie der Knopf im Gespraech. */
    setzeKlein: (klein: boolean) => { rerender(<Bild klein={klein} />); },
  };
}

function schreibe(kasten: HTMLElement, text: string) {
  fireEvent.change(within(kasten).getByLabelText("Nachricht an alle im Raum"), {
    target: { value: text },
  });
  fireEvent.click(within(kasten).getByLabelText("Nachricht senden"));
}

beforeEach(() => {
  setzeChatZurueck();
  zustand.minimiert = true;
  zustand.schwebeFenster = null;
  zustand.verbindung = null;
});
afterEach(() => { cleanup(); setzeChatZurueck(); });

describe("Chat, waehrend das Gespraech kleingemacht ist", () => {
  it("laesst die Zahl an der Leiste auffallen", () => {
    const raum = zeichneBeide();
    fireEvent.click(within(raum.gast()).getByLabelText("Chat"));

    raum.setzeKlein(true);
    schreibe(raum.gast(), "Kannst du mir den Grundriss zeigen?");

    const knopf = raum.gastgeber().querySelector('[data-pruefung="leisten-chat-knopf"]') as HTMLElement;
    expect(within(knopf).getByText("1")).toBeInTheDocument();
    expect(within(knopf).getByLabelText("1 ungelesene Nachricht")).toBeInTheDocument();
  });

  it("zaehlt weiter, solange niemand hinsieht", () => {
    const raum = zeichneBeide();
    fireEvent.click(within(raum.gast()).getByLabelText("Chat"));
    raum.setzeKlein(true);

    schreibe(raum.gast(), "Eins");
    schreibe(raum.gast(), "Zwei");
    schreibe(raum.gast(), "Drei");

    const knopf = raum.gastgeber().querySelector('[data-pruefung="leisten-chat-knopf"]') as HTMLElement;
    expect(within(knopf).getByText("3")).toBeInTheDocument();
  });

  it("zeigt unter der Leiste den vollstaendigen Verlauf und setzt die Zahl zurueck", () => {
    const raum = zeichneBeide();
    fireEvent.click(within(raum.gast()).getByLabelText("Chat"));

    // Noch im Vollbild geschrieben, vom Gastgeber selbst, danach zugeklappt.
    fireEvent.click(within(raum.gastgeber()).getByLabelText("Chat"));
    schreibe(raum.gastgeber(), "Einen Moment, ich suche es raus");
    fireEvent.click(within(raum.gastgeber()).getByLabelText("Chat"));

    // Kleiner machen, der Gast schreibt weiter.
    raum.setzeKlein(true);
    schreibe(raum.gast(), "Kein Stress");

    const leiste = raum.gastgeber();
    fireEvent.click(within(leiste).getByLabelText("Chat öffnen"));

    const verlauf = leiste.querySelector('[data-pruefung="leisten-chat"]') as HTMLElement;
    expect(within(verlauf).getByText("Einen Moment, ich suche es raus")).toBeInTheDocument();
    expect(within(verlauf).getByText("Kein Stress")).toBeInTheDocument();
    // Aufgeklappt gilt gelesen, die Zahl ist weg.
    expect(leiste.querySelector('[data-pruefung="ungelesene-zahl"]')).toBeNull();
  });

  it("laesst sich unter der Leiste auch beantworten, ohne zurueck ins Vollbild", () => {
    // Genau dafuer ist der Chat dort und nicht nur ein Zaehler: Wer zurueck
    // muesste, verloere die Seite, auf der er gerade etwas sucht.
    const raum = zeichneBeide();
    fireEvent.click(within(raum.gast()).getByLabelText("Chat"));
    raum.setzeKlein(true);

    fireEvent.click(within(raum.gastgeber()).getByLabelText("Chat öffnen"));
    schreibe(raum.gastgeber(), "Kommt gleich");

    expect(within(raum.gast()).getByText("Kommt gleich")).toBeInTheDocument();
    expect(zustand.oeffne).not.toHaveBeenCalled();
  });

  it("nimmt den offenen Chat mit, wenn das Gespraech kleiner wird", () => {
    // Sonst zaehlte danach alles als ungelesen, was er gerade noch gelesen hat.
    const raum = zeichneBeide();
    fireEvent.click(within(raum.gastgeber()).getByLabelText("Chat"));
    raum.setzeKlein(true);

    expect(raum.gastgeber().querySelector('[data-pruefung="leisten-chat"]')).not.toBeNull();
  });

  it("und wieder zurueck ins Vollbild, ohne dass etwas fehlt", () => {
    const raum = zeichneBeide();
    fireEvent.click(within(raum.gast()).getByLabelText("Chat"));
    raum.setzeKlein(true);
    schreibe(raum.gast(), "Bin noch dran");
    fireEvent.click(within(raum.gastgeber()).getByLabelText("Chat öffnen"));

    raum.setzeKlein(false);
    const gespraech = raum.gastgeber();
    const flaeche = gespraech.querySelector('[data-pruefung="nebenfenster"]') as HTMLElement;
    expect(flaeche.dataset.reiter).toBe("chat");
    expect(within(flaeche).getByText("Bin noch dran")).toBeInTheDocument();
    expect(gespraech.querySelector('[data-pruefung="ungelesene-zahl"]')).toBeNull();
  });
});

describe("Die Leiste bleibt flach", () => {
  it("behaelt ihre Zeilenhoehe, ob der Chat offen ist oder nicht", () => {
    // `LeistenBereich` misst die Hoehe und setzt die Seitenleiste entsprechend
    // tiefer. Waere der Chat ein Kind im Fluss, rutschte der ganze
    // Seiteninhalt um seine Hoehe nach unten.
    const raum = zeichneBeide();
    raum.setzeKlein(true);
    const leiste = raum.gastgeber();

    const zeileVorher = leiste.querySelector('[data-pruefung="leisten-zeile"]') as HTMLElement;
    const platzhalterVorher = (leiste.querySelector('[data-pruefung="leisten-platzhalter"]') as HTMLElement).innerHTML;
    expect(zeileVorher.className).toContain("h-11");

    fireEvent.click(within(leiste).getByLabelText("Chat öffnen"));

    const zeileNachher = leiste.querySelector('[data-pruefung="leisten-zeile"]') as HTMLElement;
    const platzhalterNachher = (leiste.querySelector('[data-pruefung="leisten-platzhalter"]') as HTMLElement).innerHTML;
    expect(zeileNachher.className).toBe(zeileVorher.className);
    expect(platzhalterNachher).toBe(platzhalterVorher);

    // Der Chat haengt absolut darunter und zaehlt fuer die Hoehe nicht mit.
    const chat = leiste.querySelector('[data-pruefung="leisten-chat"]') as HTMLElement;
    expect(chat.className).toContain("absolute");
    expect(chat.className).toContain("top-full");
  });

  it("legt auch die Zahl absolut ueber den Knopf, statt ihn breiter zu machen", () => {
    const raum = zeichneBeide();
    fireEvent.click(within(raum.gast()).getByLabelText("Chat"));
    raum.setzeKlein(true);
    schreibe(raum.gast(), "Hallo");

    const zahl = raum.gastgeber().querySelector('[data-pruefung="ungelesene-zahl"]') as HTMLElement;
    expect(zahl.className).toContain("absolute");
  });
});

describe("Das schwebende Fenster auf dem Schreibtisch", () => {
  /** Ein Fenster, wie der Browser es liefert. */
  function bauFenster(): Window {
    const dok = document.implementation.createHTMLDocument("Schwebend");
    return { document: dok, closed: false, close: () => { /* egal */ } } as unknown as Window;
  }

  it("zeigt die Zahl und bringt den Chat im Hauptfenster nach vorn", () => {
    const seite = baueRaum();
    const gastgeber = seite("gastgeber-1", "Christian Peetz");
    const gast = seite("gast-1", "Martina Brandl");
    zustand.verbindung = gastgeber;
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;

    render(
      <MemoryRouter initialEntries={["/kontakte"]}>
        <SchwebendeKacheln />
        <div data-seite="gastgeber"><VideoraumLeiste /></div>
      </MemoryRouter>,
    );

    // Der Gast schreibt, an der Ansicht vorbei: Er sitzt in einem anderen
    // Browser, hier gibt es ihn nur als Gegenstelle.
    act(() => {
      gast.sendeRegie({ art: "chat", id: "m1", name: "Martina Brandl", text: "Hallo?", zeit: Date.now() });
    });

    /*
      Gelesen wird im fremden Dokument mit den einfachen Mitteln des Browsers.
      Die Helfer der Testbibliothek erkennen Elemente aus einem Dokument ohne
      eigenes Fenster nicht als solche, und genau so eines liefert
      `createHTMLDocument`.
    */
    const knopf = fenster.document.querySelector('[data-pruefung="schwebend-chat-knopf"]') as HTMLElement;
    expect(knopf).not.toBeNull();
    const zahl = knopf.querySelector('[data-pruefung="ungelesene-zahl"]');
    expect(zahl?.textContent).toBe("1");
    expect(zahl?.getAttribute("aria-label")).toBe("1 ungelesene Nachricht");

    // Der Klick klappt den Chat dort auf, wo im Hauptfenster gerade Platz ist,
    // also unter der Leiste. Ein Seitenwechsel findet nicht statt.
    const fokus = vi.spyOn(window, "focus").mockImplementation(() => { /* egal */ });
    // Ein gewoehnliches Klickereignis: Die Helfer der Testbibliothek finden zu
    // einem Knoten aus diesem Dokument kein Fenster.
    act(() => { knopf.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(document.querySelector('[data-pruefung="leisten-chat"]')).not.toBeNull();
    expect(fokus).toHaveBeenCalled();
    expect(zustand.oeffne).not.toHaveBeenCalled();
    fokus.mockRestore();
  });

  it("baut keinen zweiten Chat in das kleine Fenster", () => {
    // Bewusst so: Das Fenster ist ein paar hundert Pixel gross, seine Aufgabe
    // sind die Gesichter, und nur Chrome kann es ueberhaupt.
    const seite = baueRaum();
    zustand.verbindung = seite("gastgeber-1", "Christian Peetz");
    const fenster = bauFenster();
    zustand.schwebeFenster = fenster;

    render(
      <MemoryRouter initialEntries={["/kontakte"]}>
        <SchwebendeKacheln />
      </MemoryRouter>,
    );

    expect(fenster.document.querySelector('[data-pruefung="chat-eingabe"]')).toBeNull();
    expect(fenster.document.querySelector('[data-pruefung="chat-verlauf"]')).toBeNull();
  });
});
