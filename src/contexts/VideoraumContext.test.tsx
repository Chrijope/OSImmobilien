import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

/*
 * Faellt die Videocall-Freigabe weg (etwa durch einen Rollenwechsel weg von
 * admin), muessen Medien, Signalisierung und das schwebende Fenster enden.
 * Ein Start, der gerade laeuft, darf danach nicht mehr abschliessen.
 */
const stand = vi.hoisted(() => ({
  freigabe: { darf: true, laedt: false },
  verbindungFreigeben: null as null | ((v: unknown) => void),
  spurStopp: vi.fn(),
  verbindungBeenden: vi.fn(),
}));

vi.mock("@/hooks/useVideocallFreigabe", () => ({ useVideocallFreigabe: () => stand.freigabe }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) } },
}));
vi.mock("@/lib/videoraumStore", () => ({
  beendeTeilnehmerImRaum: vi.fn(async () => undefined),
  setzeRaumStatus: vi.fn(async () => undefined),
}));
vi.mock("@/lib/videocallEinstellungen", () => ({
  ladeVideocallProfilSicher: async () => ({
    beitrittStumm: false, beitrittOhneKamera: false, spiegeln: true, hintergrund: { art: "aus" },
  }),
  speichereVideocallProfil: vi.fn(),
}));
vi.mock("@/lib/videocallHintergrund", () => ({
  erstelleHintergrundRegie: () => ({ beenden: vi.fn(), setzeKameraAn: vi.fn(), aktiv: () => false }),
}));
vi.mock("@/lib/videocallHintergrundStore", () => ({ hintergrundBildUrl: vi.fn() }));
vi.mock("@/lib/videocallGeraete", () => ({ wechsleEingabeGeraet: vi.fn(), holeEinzelSpur: vi.fn() }));
vi.mock("@/lib/schwebendesFenster", () => ({
  kannSchweben: () => false, oeffneSchwebendesFenster: vi.fn(), schliesseSchwebendesFenster: vi.fn(),
}));
vi.mock("@/lib/videoraumVerbindung", () => ({
  holeMedien: async () => ({ stream: { getTracks: () => [{ stop: stand.spurStopp }] } }),
  setzeSpurZustand: vi.fn(),
  // Die Verbindung kommt erst, wenn der Test sie freigibt.
  starteVerbindung: () => new Promise((fertig) => { stand.verbindungFreigeben = fertig; }),
}));

const { VideoraumProvider, useVideoraum } = await import("./VideoraumContext");

const verbindung = () => ({
  beenden: stand.verbindungBeenden,
  setzeSpur: vi.fn(),
  beobachteTeilen: vi.fn(),
  beobachteRegie: undefined,
});

let wert: ReturnType<typeof useVideoraum>;
function Sonde() {
  wert = useVideoraum();
  return null;
}
const zeichne = () => render(<VideoraumProvider><Sonde /></VideoraumProvider>);
const gespraech = { raumId: "r1", token: "t1", titel: "Test", gegenName: "Gast" };

/** Bis `starteVerbindung` erreicht ist, laufen zwei awaits. */
async function bisZurVerbindung() {
  for (let i = 0; i < 10 && !stand.verbindungFreigeben; i++) await Promise.resolve();
}

describe("Videoraum, Freigabe entzogen", () => {
  beforeEach(() => {
    stand.freigabe = { darf: true, laedt: false };
    stand.verbindungFreigeben = null;
    stand.spurStopp.mockClear();
    stand.verbindungBeenden.mockClear();
  });

  it("beendet ein laufendes Gespraech mit Medien und Signalisierung", async () => {
    const ansicht = zeichne();
    let start!: Promise<boolean>;
    await act(async () => {
      start = wert.starte(gespraech);
      await bisZurVerbindung();
      stand.verbindungFreigeben!(verbindung());
      await start;
    });
    expect(await start).toBe(true);
    expect(wert.aktiv?.raumId).toBe("r1");

    stand.freigabe = { darf: false, laedt: false };
    await act(async () => { ansicht.rerender(<VideoraumProvider><Sonde /></VideoraumProvider>); });

    expect(stand.verbindungBeenden).toHaveBeenCalled();
    expect(stand.spurStopp).toHaveBeenCalled();
    expect(wert.aktiv).toBeNull();
    expect(wert.lokalerStream).toBeNull();
  });

  it("laesst einen laufenden Start nach dem Entzug nicht mehr abschliessen", async () => {
    const ansicht = zeichne();
    let start!: Promise<boolean>;
    await act(async () => {
      start = wert.starte(gespraech);
      await bisZurVerbindung();
    });

    // Rollenwechsel, waehrend die Verbindung noch aufgebaut wird.
    stand.freigabe = { darf: false, laedt: false };
    await act(async () => { ansicht.rerender(<VideoraumProvider><Sonde /></VideoraumProvider>); });

    await act(async () => {
      stand.verbindungFreigeben!(verbindung());
      await start;
    });

    expect(await start).toBe(false);
    expect(stand.verbindungBeenden).toHaveBeenCalled();
    expect(stand.spurStopp).toHaveBeenCalled();
    expect(wert.aktiv).toBeNull();
    expect(wert.verbindung).toBeNull();
  });

  it("startet ohne Freigabe gar nicht erst", async () => {
    stand.freigabe = { darf: false, laedt: false };
    zeichne();
    let ergebnis!: boolean;
    await act(async () => { ergebnis = await wert.starte(gespraech); });
    expect(ergebnis).toBe(false);
    expect(stand.verbindungFreigeben).toBeNull();
  });
});
