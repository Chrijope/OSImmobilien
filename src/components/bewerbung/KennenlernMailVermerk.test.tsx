import { describe, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  KennenlernMailVermerk,
  kennenlernMailAm,
  kennenlernMailStand,
  versandGescheitert,
} from "./KennenlernMailVermerk";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Der Vermerk „Mail ist raus" in der Bewerberliste.
 *
 * Zwei Wege führen zu derselben Mail, und wer nur einen davon liest, hält die
 * Hälfte der Bewerber für unversorgt: Neue bekommen sie automatisch beim
 * Anlegen, die schon Vorhandenen über den Sammelversand.
 */

const b = (over: Partial<Bewerber>): Bewerber => ({ id: "x", ...over }) as Bewerber;

/*
 * Der Tooltip braucht seinen Anbieter. In der Anwendung steht er einmal um
 * alles herum (`App.tsx`), im Test muss er mitgeliefert werden.
 */
const zeige = (element: React.ReactElement) =>
  render(<TooltipProvider>{element}</TooltipProvider>);

describe("Welches Datum gilt", () => {
  it("nimmt die automatische Eingangsmail", () => {
    expect(kennenlernMailAm(b({ kennenlernenGesendetAm: "2026-09-01T10:00:00Z" })))
      .toBe("2026-09-01T10:00:00Z");
  });

  it("nimmt die Sammelmail, wenn es nur die gibt", () => {
    expect(kennenlernMailAm(b({ klNachfassMailAm: "2026-09-12T08:00:00Z" })))
      .toBe("2026-09-12T08:00:00Z");
  });

  /*
   * Das spätere gilt: Es ist die Mail, auf die sich der noch gültige Link
   * bezieht. Das frühere Datum anzuzeigen ließe den Zugang älter aussehen als
   * er ist, und genau daran hängt die Frage, wann er abläuft.
   */
  it("nimmt das spätere, wenn beide Wege gelaufen sind", () => {
    expect(kennenlernMailAm(b({
      kennenlernenGesendetAm: "2026-08-01T10:00:00Z",
      klNachfassMailAm: "2026-09-12T08:00:00Z",
    }))).toBe("2026-09-12T08:00:00Z");
  });

  /*
   * Der Fall aus der Akte von Stefan Garving, 14.09.2026: Dort stand „Die
   * Einladung ging am 11.9. hinaus", in der Liste fehlte das Symbol. Die Akte
   * nimmt als Rückfall das Anlagedatum des Bogens, die Liste kannte ihn nicht.
   */
  it("nimmt das Anlagedatum des Bogens, wenn kein Vermerk geschrieben wurde", () => {
    expect(kennenlernMailAm(b({}), { kennenlernenAm: "2026-09-11T09:00:00Z" })).toBe("2026-09-11T09:00:00Z");
  });

  it("zeigt den Vermerk auch dann, wenn er nur vom Bogen kommt", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={b({})} bogen={{ kennenlernenAm: "2026-09-11T09:00:00Z" }} />);
    expect(screen.getByLabelText(/11\.9\.2026/)).toBeTruthy();
  });

  it("gibt null, wenn nie eine Mail hinausging", () => {
    expect(kennenlernMailAm(b({}))).toBeNull();
    expect(kennenlernMailAm(b({ kennenlernenGesendetAm: "", klNachfassMailAm: "" }), {})).toBeNull();
  });

  // Ein unlesbares Datum darf keinen Vermerk erzeugen, sonst stünde dort
  // „Invalid Date" in der Liste.
  it("übergeht ein unlesbares Datum", () => {
    expect(kennenlernMailAm(b({ kennenlernenGesendetAm: "kaputt" }))).toBeNull();
  });
});

describe("Was in der Liste steht", () => {
  it("zeigt das Symbol, wenn die Mail hinaus ist, das Datum im Zeigetext", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={b({ klNachfassMailAm: "2026-09-12T08:00:00Z" })} />);
    // Nur das Symbol, das Datum steht im Zeigetext.
    expect(screen.queryByText("12.9.2026")).toBeNull();
    expect(screen.getByLabelText(/12\.9\.2026/)).toBeTruthy();
  });

  /*
   * Ohne Mail steht dort nichts. Eine Zeile „noch keine Mail" bei jedem
   * zweiten Bewerber wäre die Tapete, die dieser Anzeige den Sinn nähme.
   */
  it("zeigt nichts an, solange keine Mail hinaus ist", () => {
    cleanup();
    const { container } = zeige(<KennenlernMailVermerk bewerber={b({})} />);
    expect(container.textContent).toBe("");
  });
});

/*
 * Drei Zustände, seit der Abfrage vom 14.09.2026: Von rund 150 Bewerbern im
 * Eingang haben elf den aktuellen Kennenlernbogen, eine Handvoll nur den alten
 * Vorabbogen, alle übrigen gar nichts. Stefan Garving und Dominik Franz
 * gehören zur mittleren Gruppe; die Karte in der Akte nannte deren Vorabbogen
 * „die Einladung" und führte damit in die Irre.
 */
describe("Welcher Bogen hinausging", () => {
  it("nennt den Kennenlernbogen, wenn es ihn gibt", () => {
    expect(kennenlernMailStand(b({}), { kennenlernenAm: "2026-09-13T10:00:00Z" }))
      .toEqual({ art: "kennenlernen", am: "2026-09-13T10:00:00Z" });
  });

  it("nennt den Vorabbogen, wenn nur der da ist", () => {
    expect(kennenlernMailStand(b({}), { vorabAm: "2026-09-11T10:00:00Z" }))
      .toEqual({ art: "vorab", am: "2026-09-11T10:00:00Z" });
  });

  // Der neue Bogen zählt, auch wenn der alte jünger wäre: Gefragt ist, ob
  // dieser Bewerber den aktuellen Bogen kennt.
  it("stellt den Kennenlernbogen über den Vorabbogen", () => {
    expect(kennenlernMailStand(b({}), {
      kennenlernenAm: "2026-09-01T10:00:00Z",
      vorabAm: "2026-09-11T10:00:00Z",
    })?.art).toBe("kennenlernen");
  });

  it("wertet die Vermerke der Bewerberzeile als Kennenlernbogen", () => {
    expect(kennenlernMailStand(b({ klNachfassMailAm: "2026-09-12T08:00:00Z" }))?.art)
      .toBe("kennenlernen");
  });

  it("gibt null, wenn gar kein Bogen hinausging", () => {
    expect(kennenlernMailStand(b({}), {})).toBeNull();
    expect(kennenlernMailStand(b({}))).toBeNull();
  });

  it("unterscheidet die beiden Zeichen im Zeigetext", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={b({})} bogen={{ vorabAm: "2026-09-11T10:00:00Z" }} />);
    expect(screen.getByLabelText(/Vorabbogen/)).toBeTruthy();
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={b({})} bogen={{ kennenlernenAm: "2026-09-13T10:00:00Z" }} />);
    expect(screen.getByLabelText(/Kennenlernbogen ist am/)).toBeTruthy();
  });
});

describe("Der Klick auf das Symbol", () => {
  /*
   * Die ganze Tabellenzeile ist klickbar und öffnet die Akte. Ohne den Stopp
   * wäre das Symbol ein Knopf, der etwas ganz anderes tut, als er verspricht:
   * Wer den Tooltip lesen will, landete in der Akte.
   */
  it("öffnet nicht die Zeile darunter", () => {
    const zeileGeklickt = vi.fn();
    cleanup();
    render(
      <TooltipProvider>
        <div onClick={zeileGeklickt}>
          <KennenlernMailVermerk bewerber={b({ klNachfassMailAm: "2026-09-12T08:00:00Z" })} />
        </div>
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByLabelText(/Kennenlernbogen/));
    expect(zeileGeklickt).not.toHaveBeenCalled();
  });
});

/*
 * Die drei Zustände am Briefsymbol, seit dem 14.09.2026.
 *
 * Der wichtigste Satz dieser Anzeige steht im Negativen: Grau heißt „Link
 * noch nicht geöffnet" und niemals „nicht gelesen". Seit dem 26.09.2026 gibt
 * es kein Zählpixel mehr, gezählt wird nur der Aufruf des Links. Wer die Mail
 * liest und nicht klickt, sieht genauso aus wie jemand, der sie nie geöffnet
 * hat, und genau davor schützt der Wortlaut.
 */
describe("Öffnung ja oder nein", () => {
  const versandt = b({ klNachfassMailAm: "2026-09-12T08:00:00Z" });

  it("bleibt grau und sagt „Link noch nicht geöffnet“, wenn nichts ankam", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={versandt} oeffnung={{ gesendet: 1, geoeffnet: 0 }} />);
    const knopf = screen.getByLabelText(/Link noch nicht geöffnet/);
    expect(knopf).toBeTruthy();
    // Und ausdrücklich nicht die falsche Aussage.
    expect(screen.queryByLabelText(/nicht gelesen/)).toBeNull();
  });

  it("wird grün, sobald der Link aufgerufen wurde", () => {
    cleanup();
    zeige(
      <KennenlernMailVermerk
        bewerber={versandt}
        oeffnung={{
          gesendet: 2,
          geoeffnet: 1,
          geoeffnetAm: "2026-09-13T09:00:00Z",
          geoeffneteMail: "1. Erinnerung an das Kennenlernen",
        }}
      />,
    );
    expect(screen.getByLabelText(/Link geöffnet am 13\.9\.2026/)).toBeTruthy();
  });

  /*
   * Ohne Trackingdaten bleibt es beim grauen Umschlag. Das ist der richtige
   * Ausgangszustand: Nichts gemessen ist nichts gemessen, auch wenn die
   * Abfrage gar nicht lief.
   */
  it("bleibt grau, wenn gar keine Messung vorliegt", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={versandt} />);
    expect(screen.getByLabelText(/Link noch nicht geöffnet/)).toBeTruthy();
  });

  /*
   * Die aus dem ausgefüllten Bogen abgeleitete Öffnung, seit dem 15.09.2026.
   *
   * Sie bekommt denselben Haken, sagt aber etwas anderes: nicht „Link
   * geöffnet am", sondern „Bogen ausgefüllt am".
   */
  it("nennt die abgeleitete Öffnung beim richtigen Namen", () => {
    cleanup();
    zeige(
      <KennenlernMailVermerk
        bewerber={versandt}
        oeffnung={{
          gesendet: 1,
          geoeffnet: 1,
          geoeffnetAm: "2026-09-13T09:00:00Z",
          quelle: "bogen",
        }}
      />,
    );
    expect(screen.getByLabelText(/Bogen ausgefüllt am 13\.9\.2026/)).toBeTruthy();
    expect(screen.queryByLabelText(/Link geöffnet am/)).toBeNull();
  });

  /*
   * Der Fall vom 16.09.2026: Der Bogen liegt ausgefüllt vor, in
   * `bewerber_mail_tracking` steht aber nichts. Vorher blieb der Umschlag
   * grau, obwohl der Bewerber den Link nur aus dieser Mail haben kann.
   */
  it("setzt den Haken allein aus dem eingereichten Bogen", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={versandt} bogenEingereichtAm="2026-09-14T09:00:00Z" />);
    expect(screen.getByLabelText(/Bogen ausgefüllt am 14\.9\.2026/)).toBeTruthy();
    expect(screen.queryByLabelText(/Link geöffnet am/)).toBeNull();
  });

  /*
   * Und der Altfall vom 16.09.2026: Der Bewerber hat nie den Kennenlernbogen
   * ausgefüllt, wohl aber den früheren Vorabbogen. Christians Vorgabe: „wenn
   * einer der beiden bogen schon ausgefüllt ist, bitte den haken anzeigen."
   */
  it("setzt den Haken auch aus dem früheren Vorabbogen", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={versandt} vorabbogenEingereichtAm="2026-08-22T09:00:00Z" />);
    expect(screen.getByLabelText(/Vorabbogen ausgefüllt am 22\.8\.2026/)).toBeTruthy();
  });

  /*
   * Der Wortlaut muss dabei ehrlich bleiben. Der Haken sitzt an der
   * Kennenlernmail, der Beleg stammt aber aus einer anderen Mail. „Nachweislich
   * geöffnet" darf dort deshalb nicht stehen.
   */
  it("behauptet beim Vorabbogen nicht, genau diese Mail sei geöffnet worden", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={versandt} vorabbogenEingereichtAm="2026-08-22T09:00:00Z" />);
    expect(screen.queryByLabelText(/Link geöffnet am/)).toBeNull();
    expect(screen.queryByLabelText(/, Bogen ausgefüllt am/)).toBeNull();
    expect(screen.getByLabelText(/früherer Vorabbogen ausgefüllt am 22\.8\.2026/)).toBeTruthy();
  });

  /*
   * Und nach dem Lauf der Migration vom 16.09.2026: Der Vermerk kommt jetzt
   * aus `bewerber_mail_tracking` und sagt nur „aus einem Bogen abgeleitet",
   * nicht aus welchem. Der Wortlaut muss trotzdem beim Vorabbogen bleiben.
   */
  it("bleibt beim Vorabbogen, auch wenn der Vermerk aus der Datenbank kommt", () => {
    cleanup();
    zeige(
      <KennenlernMailVermerk
        bewerber={versandt}
        oeffnung={{ gesendet: 1, geoeffnet: 1, geoeffnetAm: "2026-08-22T09:00:00Z", quelle: "bogen" }}
        vorabbogenEingereichtAm="2026-08-22T09:00:00Z"
      />,
    );
    expect(screen.queryByLabelText(/nachweislich geöffnet/)).toBeNull();
    expect(screen.getByLabelText(/Vorabbogen ausgefüllt am 22\.8\.2026/)).toBeTruthy();
  });

  // Liegen beide vor, gilt der Kennenlernbogen. Er gehört zu genau der Mail,
  // an der dieses Symbol hängt, und ist damit der genauere Beleg.
  it("lässt den Kennenlernbogen vor dem Vorabbogen gelten", () => {
    cleanup();
    zeige(
      <KennenlernMailVermerk
        bewerber={versandt}
        bogenEingereichtAm="2026-09-14T09:00:00Z"
        vorabbogenEingereichtAm="2026-08-22T09:00:00Z"
      />,
    );
    expect(screen.getByLabelText(/Bogen ausgefüllt am 14\.9\.2026/)).toBeTruthy();
    expect(screen.queryByLabelText(/Link geöffnet am/)).toBeNull();
  });

  // Ein gezählter Linkaufruf bleibt, was er ist, auch wenn der Bogen vorliegt.
  it("lässt den gezählten Linkaufruf vorgehen", () => {
    cleanup();
    zeige(
      <KennenlernMailVermerk
        bewerber={versandt}
        oeffnung={{ gesendet: 1, geoeffnet: 1, geoeffnetAm: "2026-09-13T09:00:00Z", quelle: "link" }}
        bogenEingereichtAm="2026-09-14T09:00:00Z"
      />,
    );
    expect(screen.getByLabelText(/Link geöffnet am 13\.9\.2026/)).toBeTruthy();
  });

  // Farbe allein sagt einer Vorlesehilfe nichts. Der Zustand muss als Satz da
  // sein, und zwar in beiden Richtungen.
  it("nennt den Zustand als Text, nicht nur als Farbe", () => {
    cleanup();
    zeige(
      <KennenlernMailVermerk
        bewerber={versandt}
        oeffnung={{ gesendet: 1, geoeffnet: 1, geoeffnetAm: "2026-09-13T09:00:00Z" }}
      />,
    );
    expect(screen.getByLabelText(/Kennenlernbogen ist am 12\.9\.2026 hinausgegangen, Link geöffnet/)).toBeTruthy();
  });
});

/*
 * Der gescheiterte Versand.
 *
 * `send-bewerber-kennenlernen` schreibt `gesendetAm` auch dann, wenn die Mail
 * nicht hinausging, etwa weil die Adresse auf der Sperrliste steht. Das
 * Kennzeichen `versandOk` daneben wurde bis zum 14.09.2026 nirgends gelesen,
 * und die Liste zeigte deshalb ein ruhiges graues Symbol für einen Bewerber,
 * der nie etwas bekommen hat.
 */
describe("Wenn der Versand scheitert", () => {
  it("erkennt den Fehlschlag am Kennzeichen", () => {
    expect(versandGescheitert(b({
      kennenlernenGesendetAm: "2026-09-12T08:00:00Z",
      kennenlernenVersandAm: "2026-09-12T08:00:00Z",
      kennenlernenVersandOk: false,
      kennenlernenVersandGrund: "Adresse steht auf der Sperrliste",
    }))).toEqual({ grund: "Adresse steht auf der Sperrliste", am: "2026-09-12T08:00:00Z" });
  });

  it("lässt einen unbekannten Stand in Ruhe", () => {
    expect(versandGescheitert(b({ kennenlernenGesendetAm: "2026-09-12T08:00:00Z" }))).toBeNull();
  });

  it("lässt einen geglückten Versand in Ruhe", () => {
    expect(versandGescheitert(b({
      kennenlernenGesendetAm: "2026-09-12T08:00:00Z",
      kennenlernenVersandOk: true,
    }))).toBeNull();
  });

  /*
   * Ein Fehlschlag verjährt: Ging danach der Sammelversand hinaus, gilt der
   * spätere Stand. Sonst bliebe ein Bewerber für immer rot, obwohl er die Mail
   * längst hat.
   */
  it("verfällt, wenn danach eine andere Mail hinausging", () => {
    expect(versandGescheitert(b({
      kennenlernenGesendetAm: "2026-08-01T08:00:00Z",
      kennenlernenVersandAm: "2026-08-01T08:00:00Z",
      kennenlernenVersandOk: false,
      klNachfassMailAm: "2026-09-12T08:00:00Z",
    }))).toBeNull();
  });

  it("zeigt den Fehlschlag statt eines ruhigen grauen Symbols", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={b({
      kennenlernenGesendetAm: "2026-09-12T08:00:00Z",
      kennenlernenVersandAm: "2026-09-12T08:00:00Z",
      kennenlernenVersandOk: false,
      kennenlernenVersandGrund: "Adresse steht auf der Sperrliste",
    })} />);
    const knopf = screen.getByLabelText(/Versand gescheitert am 12\.9\.2026/);
    expect(knopf.getAttribute("aria-label")).toMatch(/Sperrliste/);
    expect(knopf.getAttribute("aria-label")).toMatch(/nichts bekommen/);
  });

  /*
   * `submit-bewerbung` und der Zapier-Webhook vermerken einen Fehlschlag ohne
   * `gesendetAm`. Ohne diesen Fall bliebe genau der automatische Eingang, bei
   * dem niemand zusieht, in der Liste vollständig unsichtbar.
   */
  it("zeigt auch den Fehlschlag ohne Versanddatum", () => {
    cleanup();
    zeige(<KennenlernMailVermerk bewerber={b({
      kennenlernenVersandAm: "2026-09-12T08:00:00Z",
      kennenlernenVersandOk: false,
      kennenlernenVersandGrund: "Adresse steht auf der Sperrliste",
    })} />);
    expect(screen.getByLabelText(/Versand gescheitert/)).toBeTruthy();
  });
});

describe("Der ausgefuellte Bogen schlaegt den Fehlschlag, Stand 16.09.2026", () => {
  /*
   * Christian hat am 16.09.2026 gefragt, warum bei Bewerbern mit
   * ausgefuelltem Kennenlernbogen kein Haken steht. Ein Teil der Faelle lag
   * nicht am Haken selbst, sondern am roten Kreuz davor: Es geht dem Haken
   * vor, und ein Fehlschlag ohne Zeitstempel verjaehrt nie.
   *
   * Der Link zum Bogen steht nur in der Eingangsmail. Liegt der Bogen vor,
   * ist die Mail also angekommen, was auch immer der Versand gemeldet hat.
   */
  const gescheitert = {
    kennenlernenVersandOk: false,
    kennenlernenVersandGrund: "Adresse auf der Sperrliste",
  };

  it("ohne Bogen bleibt das rote Kreuz", () => {
    expect(versandGescheitert(b(gescheitert))).not.toBeNull();
  });

  it("mit eingereichtem Bogen faellt der Fehlschlag weg", () => {
    expect(versandGescheitert(b(gescheitert), null, "2026-09-14T09:00:00Z")).toBeNull();
  });

  it("ein leerer Zeitpunkt zaehlt nicht als eingereicht", () => {
    expect(versandGescheitert(b(gescheitert), null, "   ")).not.toBeNull();
    expect(versandGescheitert(b(gescheitert), null, null)).not.toBeNull();
  });
});
