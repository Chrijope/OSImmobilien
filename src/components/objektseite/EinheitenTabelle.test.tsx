import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ObjektWohnung } from "@/lib/objekteStore";
import { EinheitenTabelle, WeitereEinheitenTabelle } from "./EinheitenTabelle";

/**
 * Die Einheitentabelle der Objektseite: Sortierung über den Spaltenkopf,
 * der Schalter „Nur freie Einheiten", die ausgegrauten verkauften Zeilen
 * mit inaktivem Knopf und die Blockbildung.
 *
 * Die Blockbildung läuft vor der gewählten Spalte: Freie zuerst, belegte
 * darunter, verkaufte ganz am Ende. Die Spalte sortiert innerhalb des Blocks.
 * Deshalb steht in den Erwartungen unten WE 10 vor WE 2 und WE 1, obwohl die
 * Wohnungsnummer anders lautete.
 */

function we(teil: Partial<ObjektWohnung> & { weNr: string }): ObjektWohnung {
  return {
    id: teil.weNr.replace(/\s/g, "-").toLowerCase(), etage: "EG", lage: "", groesse: 50, zimmer: 2,
    mieteGesamt: 600, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teil,
  };
}

const liste = [
  we({ weNr: "WE 10", groesse: 98, vkGesamt: 412000, status: "frei" }),
  we({ weNr: "WE 2", groesse: 47.3, vkGesamt: 197500, status: "reserviert" }),
  we({ weNr: "WE 1", groesse: 45, vkGesamt: 189000, status: "verkauft" }),
];

/** WE-Nummern der Tabellenzeilen in Anzeige-Reihenfolge (nur Desktop-Tabelle). */
function reihenfolge() {
  return screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
}

describe("Einheitentabelle", () => {
  it("sortiert beim Start nach WE-Nummer, natürlich, aber Freie zuerst", () => {
    render(<EinheitenTabelle wohnungen={liste} onOeffnen={() => undefined} />);
    expect(reihenfolge()).toEqual(["WE 10", "WE 2", "WE 1"]);
  });

  it("sortiert nach Klick auf den Spaltenkopf Kaufpreis, zweiter Klick dreht um", () => {
    render(<EinheitenTabelle wohnungen={liste} onOeffnen={() => undefined} />);
    const kopf = screen.getByRole("columnheader", { name: /Kaufpreis/ });
    fireEvent.click(kopf);
    expect(reihenfolge()).toEqual(["WE 10", "WE 2", "WE 1"]);
    fireEvent.click(kopf);
    expect(reihenfolge()).toEqual(["WE 10", "WE 2", "WE 1"]);
  });

  /*
   * Die Spalte sortiert innerhalb des Blocks, nicht über ihn hinweg. Mit
   * mehreren freien Einheiten wird das sichtbar: Der Preis dreht die drei
   * freien um, die belegte bleibt trotzdem unten.
   */
  it("sortiert die gewählte Spalte innerhalb der Blöcke", () => {
    const gemischt = [
      we({ weNr: "WE 1", vkGesamt: 100000, status: "frei" }),
      we({ weNr: "WE 2", vkGesamt: 300000, status: "reserviert" }),
      we({ weNr: "WE 3", vkGesamt: 200000, status: "frei" }),
      we({ weNr: "WE 4", vkGesamt: 400000, status: "frei" }),
    ];
    render(<EinheitenTabelle wohnungen={gemischt} onOeffnen={() => undefined} />);
    const kopf = screen.getByRole("columnheader", { name: /Kaufpreis/ });
    fireEvent.click(kopf);
    expect(reihenfolge()).toEqual(["WE 1", "WE 3", "WE 4", "WE 2"]);
    fireEvent.click(kopf);
    expect(reihenfolge()).toEqual(["WE 4", "WE 3", "WE 1", "WE 2"]);
  });

  /*
   * Einzige Ausnahme: Wer die Spalte „Status" anklickt, hat ausdrücklich nach
   * einer Reihenfolge nach Status gefragt. Sonst wäre der Spaltenkopf ein
   * Knopf ohne Wirkung.
   */
  it("überlässt der Spalte Status die Reihenfolge, auch rückwärts", () => {
    render(<EinheitenTabelle wohnungen={liste} onOeffnen={() => undefined} />);
    const kopf = screen.getByRole("columnheader", { name: /Status/ });
    fireEvent.click(kopf);
    expect(reihenfolge()).toEqual(["WE 10", "WE 2", "WE 1"]);
    fireEvent.click(kopf);
    expect(reihenfolge()).toEqual(["WE 1", "WE 2", "WE 10"]);
  });

  /*
   * Christians Zusatz: Der eigene Vorgang eines Vertriebspartners bleibt
   * auffindbar und steht am Anfang des belegten Blocks.
   */
  it("holt den eigenen Vorgang an den Anfang des belegten Blocks", () => {
    const gemischt = [
      we({ weNr: "WE 1", status: "frei" }),
      we({ weNr: "WE 2", status: "reserviert" }),
      we({ weNr: "WE 3", status: "reserviert", beraterName: "Anna Muster" }),
    ];
    render(<EinheitenTabelle wohnungen={gemischt} onOeffnen={() => undefined}
      kontext={{ rolle: "vertriebspartner", name: "Anna Muster" }} />);
    expect(reihenfolge()).toEqual(["WE 1", "WE 3", "WE 2"]);
  });

  it("lässt eine Liste unangetastet, in der alles frei ist", () => {
    const alleFrei = [we({ weNr: "WE 1" }), we({ weNr: "WE 2" }), we({ weNr: "WE 3" })];
    render(<EinheitenTabelle wohnungen={alleFrei} onOeffnen={() => undefined} />);
    expect(reihenfolge()).toEqual(["WE 1", "WE 2", "WE 3"]);
  });

  it("lässt eine Liste unangetastet, in der alles belegt ist", () => {
    const alleBelegt = [
      we({ weNr: "WE 1", status: "reserviert" }),
      we({ weNr: "WE 2", status: "reserviert" }),
      we({ weNr: "WE 3", status: "reserviert" }),
    ];
    render(<EinheitenTabelle wohnungen={alleBelegt} onOeffnen={() => undefined} />);
    expect(reihenfolge()).toEqual(["WE 1", "WE 2", "WE 3"]);
  });

  it("zeigt mit dem Schalter nur freie Einheiten", () => {
    render(<EinheitenTabelle wohnungen={liste} onOeffnen={() => undefined} />);
    fireEvent.click(screen.getByRole("switch", { name: /Nur freie Einheiten/ }));
    expect(reihenfolge()).toEqual(["WE 10"]);
  });

  /*
   * Bis zum 23.09.2026 stand hier ein gesperrter Knopf. Seitdem gibt es bei
   * verkauften und reservierten Einheiten gar keinen Knopf mehr.
   */
  it("graut verkaufte Einheiten aus und lässt sich dort nicht öffnen", () => {
    const oeffnen = vi.fn();
    render(<EinheitenTabelle wohnungen={liste} onOeffnen={oeffnen} />);
    const verkauft = screen.getByTestId("einheit-we-1");
    expect(verkauft).toHaveAttribute("data-inaktiv", "true");
    expect(verkauft.className).toContain("opacity-50");
    expect(within(verkauft).queryByRole("button", { name: /Einheit öffnen/ })).not.toBeInTheDocument();
    fireEvent.click(verkauft);
    expect(oeffnen).not.toHaveBeenCalled();

    const frei = screen.getByTestId("einheit-we-10");
    expect(frei).toHaveAttribute("data-inaktiv", "false");
    fireEvent.click(within(frei).getByRole("button", { name: /Einheit öffnen/ }));
    expect(oeffnen).toHaveBeenCalledWith(expect.objectContaining({ weNr: "WE 10" }));
  });
});

/** Die Felder der Vormerkung, die ein paralleler Umbau erst am Wohnungstyp einfuehrt. */
type Zusatz = {
  vorgemerktBis?: string;
  vorgemerktKundeId?: string;
  vorgemerktKundeName?: string;
  vorgemerktBeraterName?: string;
  reserviertVon?: string;
};
const weMit = (teil: Partial<ObjektWohnung> & Zusatz & { weNr: string }) => we(teil as ObjektWohnung);

const admin = { rolle: "admin", benutzerId: "u-admin", name: "Christian Peetz" };
const partnerin = { rolle: "vertriebspartner", benutzerId: "u-anna", name: "Anna Muster" };

describe("Einheitentabelle: öffnen nur, was frei ist (23.09.2026)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 23, 10, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bietet bei einer reservierten Einheit keinen Knopf an, auch nicht dem Admin", () => {
    const oeffnen = vi.fn();
    render(<EinheitenTabelle wohnungen={[we({ weNr: "WE 2", status: "reserviert", kundeId: "k1", kundeName: "Max Kunde" })]}
      onOeffnen={oeffnen} kontext={admin} />);
    const zeile = screen.getByTestId("einheit-we-2");
    expect(zeile).toHaveAttribute("data-oeffenbar", "false");
    expect(screen.queryAllByRole("button", { name: /Einheit öffnen/ })).toHaveLength(0);
    fireEvent.click(zeile);
    expect(oeffnen).not.toHaveBeenCalled();
  });

  it("lässt eine vorgemerkte Einheit offen, sie ist noch frei", () => {
    const oeffnen = vi.fn();
    render(<EinheitenTabelle wohnungen={[weMit({ weNr: "WE 3", vorgemerktBis: new Date(2026, 8, 23, 14, 30).toISOString() })]}
      onOeffnen={oeffnen} kontext={partnerin} />);
    const zeile = screen.getByTestId("einheit-we-3");
    expect(zeile).toHaveAttribute("data-oeffenbar", "true");
    fireEvent.click(zeile);
    expect(oeffnen).toHaveBeenCalledTimes(1);
    fireEvent.click(within(zeile).getByRole("button", { name: /Einheit öffnen/ }));
    expect(oeffnen).toHaveBeenCalledTimes(2);
  });
});

describe("Einheitentabelle: Kunde, Partner und Datum", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 23, 10, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const reserviert = () => weMit({
    weNr: "WE 2", status: "reserviert", kundeId: "k1", kundeName: "Max Kunde",
    beraterName: "Bernd Berater", reserviertAm: "2026-09-12", reserviertVon: "u-bernd",
  });

  it("zeigt dem Admin Kunde, Partner und Datum", () => {
    render(<EinheitenTabelle wohnungen={[reserviert()]} onOeffnen={() => undefined} kontext={admin} />);
    const zeile = screen.getByTestId("einheit-we-2");
    expect(within(zeile).getByText("Max Kunde")).toBeInTheDocument();
    expect(within(zeile).getByText("VP: Bernd Berater")).toBeInTheDocument();
    expect(within(zeile).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
  });

  it("zeigt einer fremden Vertriebspartnerin nur das Datum, keinen Namen", () => {
    render(<EinheitenTabelle wohnungen={[reserviert()]} onOeffnen={() => undefined} kontext={partnerin} />);
    const zeile = screen.getByTestId("einheit-we-2");
    expect(within(zeile).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
    expect(screen.queryAllByText("Max Kunde")).toHaveLength(0);
    expect(screen.queryAllByText(/Bernd Berater/)).toHaveLength(0);
  });

  it("zeigt ohne Nutzerkontext keine Namen", () => {
    render(<EinheitenTabelle wohnungen={[reserviert()]} onOeffnen={() => undefined} />);
    expect(screen.queryAllByText("Max Kunde")).toHaveLength(0);
    expect(within(screen.getByTestId("einheit-we-2")).getByText("reserviert am 12.09.2026")).toBeInTheDocument();
  });

  it("schreibt bei einer Investagon-Reservierung ohne Kunden „über Investagon“", () => {
    render(<EinheitenTabelle
      wohnungen={[we({ weNr: "WE 4", status: "reserviert", investagonId: "p4", investagonStatusText: "Notartermin",
        investagonRaw: { active: 7, visibility: 1, statusName: "Notartermin", updated: "2026-09-20T08:00:00Z" } })]}
      onOeffnen={() => undefined} kontext={admin} />);
    const zeile = screen.getByTestId("einheit-we-4");
    expect(within(zeile).getByText("über Investagon")).toBeInTheDocument();
    // `updated` ist die letzte Aenderung, kein Reservierungsdatum.
    expect(within(zeile).queryByText(/20\.09\.2026/)).not.toBeInTheDocument();
  });

  it("zeigt bei einer Vormerkung die Uhrzeit samt Kunde und Partner", () => {
    render(<EinheitenTabelle
      wohnungen={[weMit({ weNr: "WE 5", vorgemerktBis: new Date(2026, 8, 23, 14, 30).toISOString(),
        vorgemerktKundeId: "k5", vorgemerktKundeName: "Vera Vorgemerkt", vorgemerktBeraterName: "Bernd Berater" })]}
      onOeffnen={() => undefined} kontext={admin} />);
    const zeile = screen.getByTestId("einheit-we-5");
    expect(within(zeile).getByText("vorgemerkt bis 14:30")).toBeInTheDocument();
    expect(within(zeile).getByText("Vera Vorgemerkt")).toBeInTheDocument();
    expect(within(zeile).getByText("VP: Bernd Berater")).toBeInTheDocument();
  });
});

describe("Einheitentabelle: empfohlene Einheiten", () => {
  const gemischt = [
    we({ weNr: "WE 1", vkGesamt: 100000, status: "frei" }),
    we({ weNr: "WE 2", vkGesamt: 300000, status: "reserviert" }),
    we({ weNr: "WE 3", vkGesamt: 200000, status: "frei" }),
    we({ weNr: "WE 4", vkGesamt: 400000, status: "frei" }),
  ];

  it("trägt das Abzeichen nur an freien Einheiten", () => {
    render(<EinheitenTabelle wohnungen={gemischt} onOeffnen={() => undefined} empfohleneIds={new Set(["we-4", "we-2"])} />);
    expect(within(screen.getByTestId("einheit-we-4")).getByText("empfohlen")).toBeInTheDocument();
    expect(within(screen.getByTestId("einheit-we-2")).queryByText("empfohlen")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("einheit-we-1")).queryByText("empfohlen")).not.toBeInTheDocument();
  });

  it("stellt die empfohlenen oben unter die freien, auch nach einer Sortierung", () => {
    render(<EinheitenTabelle wohnungen={gemischt} onOeffnen={() => undefined} empfohleneIds={new Set(["we-4"])} />);
    expect(reihenfolge()).toEqual(["WE 4", "WE 1", "WE 3", "WE 2"]);
    fireEvent.click(screen.getByRole("columnheader", { name: /Kaufpreis/ }));
    fireEvent.click(screen.getByRole("columnheader", { name: /Kaufpreis/ }));
    expect(reihenfolge()).toEqual(["WE 4", "WE 3", "WE 1", "WE 2"]);
  });

  it("ändert ohne Empfehlung nichts an der Reihenfolge", () => {
    render(<EinheitenTabelle wohnungen={gemischt} onOeffnen={() => undefined} empfohleneIds={new Set()} />);
    expect(reihenfolge()).toEqual(["WE 1", "WE 3", "WE 4", "WE 2"]);
    expect(screen.queryAllByText("empfohlen")).toHaveLength(0);
  });
});

/*
 * Spalte Rendite seit dem 24.09.2026: Jahreskaltmiete durch Kaufpreis, wie
 * in den Kacheln, zwei Nachkommastellen, leer ohne Miete oder Kaufpreis.
 */
describe("Einheitentabelle: Spalte Rendite", () => {
  const renditeListe = [
    // 12 × 600 / 200.000 = 3,60 %
    we({ weNr: "WE 1", mieteGesamt: 600, vkGesamt: 200000 }),
    // 12 × 735 / 245.000 = 3,60 %, 12 × 850 / 250.000 = 4,08 %
    we({ weNr: "WE 2", mieteGesamt: 850, vkGesamt: 250000 }),
    we({ weNr: "WE 3", mieteGesamt: 0, vkGesamt: 180000 }),
  ];

  it("rechnet Jahreskaltmiete durch Kaufpreis und lässt sie ohne Miete leer", () => {
    render(<EinheitenTabelle wohnungen={renditeListe} onOeffnen={() => undefined} />);
    expect(screen.getByRole("columnheader", { name: /Rendite/ })).toBeInTheDocument();
    expect(screen.getByTestId("rendite-we-1")).toHaveTextContent("3,60 %");
    expect(screen.getByTestId("rendite-we-2")).toHaveTextContent("4,08 %");
    expect(screen.getByTestId("rendite-we-3")).toHaveTextContent("");
    expect(screen.getByTestId("rendite-we-1").className).toContain("tabular-nums");
    expect(screen.getByTestId("rendite-we-1").className).toContain("text-right");
  });

  it("sortiert nach Rendite, zweiter Klick dreht um", () => {
    render(<EinheitenTabelle wohnungen={renditeListe} onOeffnen={() => undefined} />);
    const kopf = screen.getByRole("columnheader", { name: /Rendite/ });
    fireEvent.click(kopf);
    expect(reihenfolge()).toEqual(["WE 3", "WE 1", "WE 2"]);
    fireEvent.click(kopf);
    expect(reihenfolge()).toEqual(["WE 2", "WE 1", "WE 3"]);
  });
});

describe("Weitere Einheiten in diesem Haus", () => {
  const haus = [
    we({ weNr: "WE 1", etage: "EG", lage: "links", zimmer: 2, groesse: 48.5, mieteGesamt: 520, vkGesamt: 169000 }),
    we({ weNr: "WE 2", etage: "1. OG", zimmer: 1.5, groesse: 62.3, mieteGesamt: 640, vkGesamt: 214000, status: "reserviert" }),
  ];

  it("zeigt dieselben Spalten wie die Wohneinheiten-Tabelle, ohne Kunde / VP", () => {
    render(<WeitereEinheitenTabelle wohnungen={haus} aktuelleId="we-1" onWechsel={() => undefined} />);
    const koepfe = screen.getAllByRole("columnheader").map((k) => k.textContent);
    expect(koepfe).toEqual(["WE-Nr.", "Etage", "Zimmer", "Fläche", "Kaufpreis", "je m²", "Kaltmiete", "Rendite", "Status"]);
  });

  it("schreibt die Werte wie die Objektseite, samt Rendite", () => {
    render(<WeitereEinheitenTabelle wohnungen={haus} aktuelleId="we-1" onWechsel={() => undefined} />);
    // Intl setzt vor „€“ ein geschütztes Leerzeichen, verglichen wird mit einem normalen.
    const zellen = within(screen.getByTestId("weitere-we-1")).getAllByRole("cell").map((c) => (c.textContent || "").replace(/\s/g, " "));
    // 169.000 / 48,5 = 3.484,5 € je m²; 12 × 520 / 169.000 = 3,69 %
    expect(zellen.slice(0, 8)).toEqual(["WE 1", "EG links", "2", "48,5 m²", "169.000 €", "3.485 €", "520 €", "3,69 %"]);
    expect(within(screen.getByTestId("weitere-we-2")).getByText("1,5")).toBeInTheDocument();
    // 12 × 640 / 214.000 = 3,59 %
    expect(screen.getByTestId("weitere-rendite-we-2")).toHaveTextContent("3,59 %");
  });

  it("hebt die aktuelle Einheit hervor und wechselt nur bei einer anderen", () => {
    const wechsel = vi.fn();
    render(<WeitereEinheitenTabelle wohnungen={haus} aktuelleId="we-1" onWechsel={wechsel} />);
    const aktuell = screen.getByTestId("weitere-we-1");
    expect(aktuell).toHaveAttribute("data-aktuell", "true");
    expect(aktuell.className).toContain("bg-accent");
    fireEvent.click(aktuell);
    expect(wechsel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("weitere-we-2"));
    expect(wechsel).toHaveBeenCalledWith(expect.objectContaining({ weNr: "WE 2" }));
  });

  it("blendet auf dem Handy Nebenspalten aus, WE-Nr., Kaufpreis, Rendite und Status bleiben", () => {
    render(<WeitereEinheitenTabelle wohnungen={haus} aktuelleId="we-1" onWechsel={() => undefined} />);
    const kopf = (name: string) => screen.getByRole("columnheader", { name });
    for (const neben of ["Etage", "Zimmer", "Fläche", "je m²", "Kaltmiete"]) expect(kopf(neben).className).toMatch(/\bhidden\b/);
    for (const haupt of ["WE-Nr.", "Kaufpreis", "Rendite", "Status"]) expect(kopf(haupt).className).not.toMatch(/\bhidden\b/);
  });
});
