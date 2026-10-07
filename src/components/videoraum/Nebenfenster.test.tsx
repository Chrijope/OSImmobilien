import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup, act } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { Gespraech } from "./Gespraech";
import { setzeChatZurueck, CHAT_MAX_ZEICHEN, CHAT_SENDE_GRENZE } from "@/lib/videoraumChat";
import {
  istBekannterBefehl, nachrichtFuerMich,
  type Gegenstelle, type RegieBefehl, type Verbindung,
} from "@/lib/videoraumVerbindung";

/**
 * Der Pruefstand: zwei Seiten desselben Gespraechs im selben Lauf.
 *
 * Ersetzt wird nur der Bote. Die echte Supabase-Leitung laesst sich hier nicht
 * aufbauen, alles andere ist echt: dieselbe Gespraechsansicht, dieselben
 * Bausteine, dieselbe Pruefung `istBekannterBefehl` und dieselbe Adressierung
 * `nachrichtFuerMich`, die auch der Signalkanal benutzt. Auch der Umweg ueber
 * JSON wird nachgestellt, denn was durch JSON nicht durchkommt, kaeme drueben
 * nicht an.
 *
 * Damit laesst sich beantworten, was Christian wollte: „pruefe es dann auch
 * gleich, dass alles am Ende klappt". Eine echte WebRTC-Verbindung und die
 * Laufzeit im Netz bleiben aussen vor, das geht ohne Browser nicht.
 */

beforeAll(() => {
  // jsdom kann keine Videowiedergabe, siehe Gespraech.test.tsx.
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});

/** Ein Raum mit einem gemeinsamen Signalweg. */
function baueRaum() {
  const melder = new Map<string, Set<(befehl: RegieBefehl, von: string) => void>>();
  const gesendet: { von: string; befehl: RegieBefehl; an?: string }[] = [];

  /**
   * Etwas einspeisen, das unsere eigene Ansicht nie erzeugen wuerde.
   *
   * Ein fremder Browser haelt sich an keine unserer Regeln. Damit sich das
   * pruefen laesst, geht diese Nachricht an der Ansicht vorbei direkt in den
   * Signalweg, aber durch dieselbe Pruefung.
   */
  function sendeRoh(von: string, roh: unknown): void {
    for (const [ziel, menge] of melder) {
      if (ziel === von) continue;
      if (!istBekannterBefehl(roh)) continue;
      for (const m of [...menge]) m(roh, von);
    }
  }

  function seite(kennung: string, name: string): Verbindung {
    melder.set(kennung, new Set());
    return {
      eigeneKennung: kennung,
      eigenerName: name,
      setzeSpur: vi.fn(),
      teileBildschirm: vi.fn().mockResolvedValue(false),
      beobachteTeilen: () => () => { /* nichts */ },
      sendeRegie: (befehl, an) => {
        gesendet.push({ von: kennung, befehl, an });
        const nutzlast: unknown = JSON.parse(JSON.stringify(befehl));
        for (const [ziel, menge] of melder) {
          // Der echte Kanal stellt sich selbst nichts zu (`self: false`).
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
  }

  return { seite, gesendet, sendeRoh };
}

const gegenstelle = (kennung: string, name: string): Gegenstelle => ({
  kennung, name, stream: null, zustand: "verbunden",
});

/** Beide Seiten nebeneinander, jede in ihrem eigenen Kasten. */
function zeichneRaum(zusatz: { einladungsLink?: string } = {}) {
  const raum = baueRaum();
  const gastgeber = raum.seite("gastgeber-1", "Christian Peetz");
  const gast = raum.seite("gast-1", "Martina Brandl");

  render(
    <>
      <div data-seite="gastgeber">
        <Gespraech
          lokalerStream={null}
          gegenstellen={[gegenstelle("gast-1", "Martina Brandl")]}
          zustand="verbunden"
          gegenName="Martina Brandl"
          verbindung={gastgeber}
          aufBeenden={() => { /* egal */ }}
          titel="Beratungsgespräch"
          istGastgeber
          einladungsLink={zusatz.einladungsLink}
        />
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
    </>,
  );

  const kasten = (seite: "gastgeber" | "gast") =>
    document.querySelector(`[data-seite="${seite}"]`) as HTMLElement;

  return { ...raum, gastgeber: kasten("gastgeber"), gast: kasten("gast") };
}

function oeffneChat(kasten: HTMLElement) {
  fireEvent.click(within(kasten).getByLabelText("Chat"));
}

function schreibe(kasten: HTMLElement, text: string) {
  fireEvent.change(within(kasten).getByLabelText("Nachricht an alle im Raum"), {
    target: { value: text },
  });
  fireEvent.click(within(kasten).getByLabelText("Nachricht senden"));
}

beforeEach(() => { setzeChatZurueck(); });
afterEach(() => { cleanup(); setzeChatZurueck(); });

describe("Chat zwischen zwei Seiten", () => {
  it("bringt einen Beitrag des Gastgebers beim Gast an, mit Namen und Uhrzeit", () => {
    const { gastgeber, gast } = zeichneRaum();
    oeffneChat(gastgeber);
    oeffneChat(gast);

    schreibe(gastgeber, "Ich schicke dir gleich den Grundriss");

    const drueben = within(gast).getByText("Ich schicke dir gleich den Grundriss");
    expect(drueben).toBeInTheDocument();
    // Der Name des Absenders steht daran, nicht seine technische Kennung.
    expect(within(gast).getByText("Christian Peetz")).toBeInTheDocument();
    expect(within(gast).getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("geht in beide Richtungen", () => {
    const { gastgeber, gast } = zeichneRaum();
    oeffneChat(gastgeber);
    oeffneChat(gast);

    schreibe(gast, "Passt, danke");
    expect(within(gastgeber).getByText("Passt, danke")).toBeInTheDocument();
    // Beim Absender steht „Du", nicht sein eigener Name.
    expect(within(gast).getAllByText("Du").length).toBeGreaterThan(0);
  });

  it("stellt sich selbst nichts doppelt zu", () => {
    const { gastgeber } = zeichneRaum();
    oeffneChat(gastgeber);
    schreibe(gastgeber, "Hallo");
    expect(within(gastgeber).getAllByText("Hallo")).toHaveLength(1);
  });

  it("zeigt einen ungelesenen Beitrag am Knopf, solange der Chat zu ist", () => {
    // Der Gast hat den Chat gar nicht offen und soll trotzdem merken, dass
    // etwas gekommen ist.
    const { gastgeber, gast } = zeichneRaum();
    oeffneChat(gastgeber);

    schreibe(gastgeber, "Bist du noch da?");
    expect(within(gast).getByText("1")).toBeInTheDocument();

    // Aufgeklappt gilt alles als gelesen, die Zahl verschwindet.
    oeffneChat(gast);
    expect(within(gast).queryByText("1")).not.toBeInTheDocument();
  });

  it("verliert Angefangenes nicht, wenn der Chat zugeklappt wird", () => {
    const { gast } = zeichneRaum();
    oeffneChat(gast);
    fireEvent.change(within(gast).getByLabelText("Nachricht an alle im Raum"), {
      target: { value: "halb getippt" },
    });

    // Zuklappen und wieder auf.
    fireEvent.click(within(gast).getByLabelText("Chat"));
    expect(within(gast).queryByLabelText("Nachricht an alle im Raum")).not.toBeInTheDocument();
    oeffneChat(gast);

    expect(within(gast).getByLabelText("Nachricht an alle im Raum")).toHaveValue("halb getippt");
  });

  it("zeigt fremdes HTML als Text und setzt es nicht ein", () => {
    // Ein Gast ist ein Fremder ohne Konto. Was er schickt, darf nie als HTML
    // in den Baum geraten.
    const { gastgeber, gast } = zeichneRaum();
    oeffneChat(gastgeber);
    oeffneChat(gast);

    schreibe(gast, "<img src=x onerror=alert(1)>");

    const beitrag = within(gastgeber).getByText("<img src=x onerror=alert(1)>");
    expect(beitrag.querySelector("img")).toBeNull();
    expect(beitrag.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("schickt nichts ab, was nur aus Leerzeichen besteht", () => {
    const { gastgeber, gesendet } = zeichneRaum();
    oeffneChat(gastgeber);
    fireEvent.change(within(gastgeber).getByLabelText("Nachricht an alle im Raum"), {
      target: { value: "   " },
    });
    expect(within(gastgeber).getByLabelText("Nachricht senden")).toBeDisabled();
    expect(gesendet.filter((g) => g.befehl.art === "chat")).toHaveLength(0);
  });

  it("bremst, wer sehr viele Beitraege hintereinander schickt", () => {
    const { gastgeber, gesendet } = zeichneRaum();
    oeffneChat(gastgeber);
    for (let i = 0; i < CHAT_SENDE_GRENZE + 3; i += 1) schreibe(gastgeber, `Nachricht ${i}`);

    expect(gesendet.filter((g) => g.befehl.art === "chat")).toHaveLength(CHAT_SENDE_GRENZE);
    expect(within(gastgeber).getByText(/sehr viele Nachrichten/)).toBeInTheDocument();
  });

  it("verwirft, was von aussen kommt und keinen Text traegt", () => {
    // Ein fremder Browser haelt sich an keine unserer Regeln.
    const { gast, sendeRoh } = zeichneRaum();
    oeffneChat(gast);

    act(() => { sendeRoh("gastgeber-1", { art: "chat", id: "x", name: "C", text: "   " }); });
    act(() => { sendeRoh("gastgeber-1", { art: "chat", id: "y", name: "C" }); });
    act(() => { sendeRoh("gastgeber-1", { art: "unbekannt", text: "Hallo" }); });

    expect(within(gast).getByText(/Noch keine Nachricht/)).toBeInTheDocument();
  });

  it("nimmt denselben Beitrag nicht zweimal, wenn er doppelt ankommt", () => {
    const { gast, sendeRoh } = zeichneRaum();
    oeffneChat(gast);
    const roh = { art: "chat", id: "gleich", name: "Christian", text: "Hallo", zeit: Date.now() };

    act(() => { sendeRoh("gastgeber-1", roh); });
    act(() => { sendeRoh("gastgeber-1", roh); });

    expect(within(gast).getAllByText("Hallo")).toHaveLength(1);
  });

  it("kuerzt einen uebermaessig langen fremden Beitrag", () => {
    const { gast, sendeRoh } = zeichneRaum();
    oeffneChat(gast);
    act(() => {
      sendeRoh("gastgeber-1", { art: "chat", id: "lang", name: "C", text: "x".repeat(5000) });
    });

    const kasten = gast.querySelector('[data-pruefung="chat-beitrag"]') as HTMLElement;
    expect(kasten.textContent?.includes("x".repeat(CHAT_MAX_ZEICHEN))).toBe(true);
    expect(kasten.textContent?.includes("x".repeat(CHAT_MAX_ZEICHEN + 1))).toBe(false);
  });
});

describe("Teilnehmerliste", () => {
  it("zaehlt alle im Raum und nennt sie beim Namen", () => {
    const { gastgeber } = zeichneRaum();
    fireEvent.click(within(gastgeber).getByLabelText("Teilnehmer"));

    expect(within(gastgeber).getByText("Teilnehmer (2)")).toBeInTheDocument();
    expect(within(gastgeber).getByText("Christian Peetz")).toBeInTheDocument();
    expect(within(gastgeber).getByText("Martina Brandl")).toBeInTheDocument();
  });

  it("sagt, ob Mikrofon und Kamera an sind", () => {
    const { gastgeber, gast } = zeichneRaum();
    // Der Gast schaltet sein Mikrofon ab. Die Meldung geht ueber denselben
    // Signalweg wie bisher, siehe RegieBefehl "tonstand".
    fireEvent.click(within(gast).getByLabelText("Ton"));

    fireEvent.click(within(gastgeber).getByLabelText("Teilnehmer"));
    expect(within(gastgeber).getByLabelText("Martina Brandl: Mikrofon aus")).toBeInTheDocument();
    expect(within(gastgeber).getByLabelText("Martina Brandl: Kamera an")).toBeInTheDocument();
  });

  it("bekommt der Gast auch, aber ohne den Einladungslink", () => {
    const { gastgeber, gast } = zeichneRaum({ einladungsLink: "https://portal.more.immo/raum/abc" });

    fireEvent.click(within(gast).getByLabelText("Teilnehmer"));
    expect(within(gast).getByText("Teilnehmer (2)")).toBeInTheDocument();
    expect(within(gast).queryByText("Einladungslink")).not.toBeInTheDocument();

    fireEvent.click(within(gastgeber).getByLabelText("Teilnehmer"));
    expect(within(gastgeber).getByText("Einladungslink")).toBeInTheDocument();
  });
});

describe("Einladungslink kopieren", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Reflect.deleteProperty(document, "execCommand");
  });

  it("meldet den Erfolg am Knopf", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    const { gastgeber } = zeichneRaum({ einladungsLink: "https://portal.more.immo/raum/abc" });
    fireEvent.click(within(gastgeber).getByLabelText("Teilnehmer"));
    await act(async () => {
      fireEvent.click(within(gastgeber).getByText("Link kopieren"));
    });

    expect(writeText).toHaveBeenCalledWith("https://portal.more.immo/raum/abc");
    expect(within(gastgeber).getByText("Link kopiert")).toBeInTheDocument();
  });

  it("zeigt den Link zum Markieren, wenn der Browser das Kopieren nicht zulaesst", async () => {
    // Genau der Fall, der Christian am 18.09.2026 einen haengenden Browser
    // vorgetaeuscht hat: Es geschah gar nichts. Jetzt steht der Link da.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("NotAllowedError")) },
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });

    const { gastgeber } = zeichneRaum({ einladungsLink: "https://portal.more.immo/raum/abc" });
    fireEvent.click(within(gastgeber).getByLabelText("Teilnehmer"));
    await act(async () => {
      fireEvent.click(within(gastgeber).getByText("Link kopieren"));
    });

    const feld = within(gastgeber).getByLabelText("Einladungslink zum Markieren");
    expect(feld).toHaveValue("https://portal.more.immo/raum/abc");
    expect(within(gastgeber).getByText(/nicht zugelassen/)).toBeInTheDocument();
  });
});

describe("Die Leiste bleibt bedienbar", () => {
  it("laesst die alten Knoepfe unveraendert stehen", () => {
    const { gastgeber } = zeichneRaum();
    for (const label of ["Ton", "Bild", "Teilen", "Auflegen"]) {
      expect(within(gastgeber).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("zeigt immer nur eines von beiden", () => {
    const { gastgeber } = zeichneRaum();
    fireEvent.click(within(gastgeber).getByLabelText("Teilnehmer"));
    expect(within(gastgeber).getByText(/^Teilnehmer \(/)).toBeInTheDocument();

    fireEvent.click(within(gastgeber).getByLabelText("Chat"));
    expect(within(gastgeber).queryByText(/^Teilnehmer \(/)).not.toBeInTheDocument();
    expect(within(gastgeber).getByLabelText("Nachricht an alle im Raum")).toBeInTheDocument();
  });

  it("geht mit dem Kreuz wieder zu und gibt das Bild frei", () => {
    const { gastgeber } = zeichneRaum();
    fireEvent.click(within(gastgeber).getByLabelText("Chat"));
    fireEvent.click(within(gastgeber).getByLabelText("Chat schließen"));
    expect(within(gastgeber).queryByLabelText("Nachricht an alle im Raum")).not.toBeInTheDocument();
    expect(gastgeber.querySelector('[data-pruefung="nebenfenster"]')).toBeNull();
  });

  it("zeigt nur beim Gast keinen Menuepunkt weniger", () => {
    // Beide Seiten bekommen Teilnehmer und Chat, siehe Auftrag: der Gast
    // braucht den Chat genauso.
    const { gast } = zeichneRaum();
    expect(within(gast).getByLabelText("Teilnehmer")).toBeInTheDocument();
    expect(within(gast).getByLabelText("Chat")).toBeInTheDocument();
  });
});

describe("Alleine im Raum", () => {
  it("sagt es, statt eine leere Liste zu zeigen", () => {
    const raum = baueRaum();
    render(
      <Gespraech
        lokalerStream={null}
        gegenstellen={[]}
        zustand="verbunden"
        gegenName="Martina Brandl"
        verbindung={raum.seite("gastgeber-allein", "Christian Peetz")}
        aufBeenden={() => { /* egal */ }}
        titel="Beratungsgespräch"
      />,
    );
    fireEvent.click(screen.getByLabelText("Teilnehmer"));
    expect(screen.getByText("Teilnehmer (1)")).toBeInTheDocument();
    expect(screen.getByText(/niemand im Raum/)).toBeInTheDocument();
  });
});
