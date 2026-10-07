import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { RegieBefehl, Verbindung } from "@/lib/videoraumVerbindung";

/**
 * Was der Gastgeber beim Gast schaltet.
 *
 * Der Punkt dieser Tests ist die Richtung: Stummschalten muss beim Gast an
 * dessen Tonspur passieren, nicht drueben am Lautsprecher. Sonst glaubt der
 * Gast weiter, er sei zu hoeren. Und weil sich ein fremder Browser nicht
 * zwingen laesst, muss er es sehen und der Gastgeber es gemeldet bekommen,
 * wenn er sich selbst wieder einschaltet.
 */

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useParams: () => ({ token: "raum-token" }) };
});

const ladeGastAnsicht = vi.hoisted(() => vi.fn());
const frageGastStatus = vi.hoisted(() => vi.fn());
const ladeGastSitzung = vi.hoisted(() => vi.fn());
const beobachteEinlass = vi.hoisted(() => vi.fn(() => () => { /* nichts */ }));

vi.mock("@/lib/videoraumStore", async () => {
  const echt = await vi.importActual<typeof import("@/lib/videoraumStore")>("@/lib/videoraumStore");
  return {
    ...echt,
    ladeGastAnsicht,
    frageGastStatus,
    ladeGastSitzung,
    beobachteEinlass,
    betreteRaumAlsGast: vi.fn(),
    meldeGast: vi.fn(),
    beobachteMitschriftHinweis: vi.fn(() => () => { /* nichts */ }),
    frageMitschriftStand: vi.fn(),
    merkeGastSitzung: vi.fn(),
    vergissGastSitzung: vi.fn(),
  };
});

const starteVerbindung = vi.hoisted(() => vi.fn());
const holeMedien = vi.hoisted(() => vi.fn());
const setzeSpurZustand = vi.hoisted(() => vi.fn());

vi.mock("@/lib/videoraumVerbindung", () => ({
  starteVerbindung,
  holeMedien,
  setzeSpurZustand,
  kannHintergrundWeichzeichnen: () => false,
  setzeHintergrundWeichzeichnen: vi.fn(),
  istGastgeberKennung: (kennung: string) => kennung.startsWith("gastgeber-"),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { MemoryRouter } from "react-router-dom";
import VideoraumGast from "./VideoraumGast";

/** Eine Verbindung, bei der sich die Regie von außen auslösen lässt. */
function verbindungAttrappe() {
  const regie = new Set<(befehl: RegieBefehl, von: string) => void>();
  const v: Verbindung & { ruf: (befehl: RegieBefehl, von?: string) => void } = {
    eigeneKennung: "gast-test",
    setzeSpur: vi.fn(),
    teileBildschirm: vi.fn().mockResolvedValue(false),
    beobachteTeilen: vi.fn().mockReturnValue(() => { /* nichts */ }),
    sendeRegie: vi.fn(),
    beobachteRegie: (m: (befehl: RegieBefehl, von: string) => void) => {
      regie.add(m);
      return () => { regie.delete(m); };
    },
    beenden: vi.fn(),
    // Regie kommt in der Regel vom Gastgeber, deshalb dessen Kennung als Vorgabe.
    ruf: (befehl, von = "gastgeber-abc") => { for (const m of regie) m(befehl, von); },
  };
  return v;
}

function tonSpur() {
  return { kind: "audio", enabled: true, stop: vi.fn() };
}

async function zeigeGespraech() {
  const verbindung = verbindungAttrappe();
  starteVerbindung.mockResolvedValue(verbindung);
  await act(async () => {
    render(<MemoryRouter><VideoraumGast /></MemoryRouter>);
  });
  // Warteraum, Statusabfrage, Verbindungsaufbau: drei Runden Mikrotasks.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return verbindung;
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom kennt kein play(). Ohne das stolpert jede Videoflaeche.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

  ladeGastAnsicht.mockResolvedValue({
    art: "beratung",
    titel: null,
    status: "offen",
    termin_at: null,
    dauer_minuten: 45,
    agenda: [],
    hinweis: null,
    transkript_angeboten: false,
    gastgeber: { name: "Christian Peetz" },
    objekt: {},
  });
  ladeGastSitzung.mockReturnValue({ gastToken: "gast-token", teilnehmerId: "t1", name: "Martina Brandl" });
  frageGastStatus.mockResolvedValue({
    status: "eingelassen",
    raumStatus: "laufend",
    teilnehmerId: "t1",
    signalGeheimnis: "geheim",
    warteposition: 0,
    gespraechLaeuft: true,
  });
  holeMedien.mockResolvedValue({
    stream: { getTracks: () => [tonSpur()], getVideoTracks: () => [], getAudioTracks: () => [tonSpur()] },
    grund: null,
  });
});

afterEach(() => { vi.restoreAllMocks(); });

describe("Videoraum, Gast", () => {
  it("meldet dem Gastgeber beim Einhängen den eigenen Tonstand", async () => {
    // Der Signalkanal merkt sich nichts. Ohne diese Meldung wüsste der
    // Gastgeber nie, ob das Mikrofon des Gastes an ist, und bekäme auch keinen
    // Anlass, seine Freigaben nachzuschicken.
    const verbindung = await zeigeGespraech();
    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "tonstand", an: true });
  });

  it("schaltet auf „stumm“ die eigene Tonspur ab und sagt es dem Gast", async () => {
    const verbindung = await zeigeGespraech();
    await act(async () => { verbindung.ruf({ art: "stumm" }); });

    // Beim Empfänger, nicht beim Gastgeber leise gestellt.
    expect(setzeSpurZustand).toHaveBeenCalledWith(expect.anything(), "audio", false);
    expect(verbindung.setzeSpur).toHaveBeenCalledWith("audio", false);
    expect(verbindung.sendeRegie).toHaveBeenCalledWith({ art: "tonstand", an: false });
    expect(screen.getByText(/hat dein Mikrofon stummgeschaltet/)).toBeTruthy();
  });

  it("meldet zurück, wenn der Gast seine Stummschaltung wieder aufhebt", async () => {
    const verbindung = await zeigeGespraech();
    await act(async () => { verbindung.ruf({ art: "stumm" }); });

    await act(async () => { screen.getByLabelText("Ton").click(); });

    expect(verbindung.sendeRegie).toHaveBeenLastCalledWith({ art: "tonstand", an: true });
    expect(screen.queryByText(/hat dein Mikrofon stummgeschaltet/)).toBeNull();
  });

  it("gibt das Bildschirmteilen erst frei, wenn der Gastgeber es erlaubt", async () => {
    const verbindung = await zeigeGespraech();
    expect((screen.getByLabelText("Teilen") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { verbindung.ruf({ art: "teilen", erlaubt: true }); });
    expect((screen.getByLabelText("Teilen") as HTMLButtonElement).disabled).toBe(false);
  });

  it("beendet ein laufendes Teilen, wenn der Gastgeber die Freigabe zurücknimmt", async () => {
    const verbindung = await zeigeGespraech();
    await act(async () => { verbindung.ruf({ art: "teilen", erlaubt: true }); });
    await act(async () => { verbindung.ruf({ art: "teilen", erlaubt: false }); });

    expect(verbindung.teileBildschirm).toHaveBeenCalledWith(false);
  });

  it("hört nur auf die Regie des Gastgebers, nicht auf andere Gäste", async () => {
    // Im Netz hängen auch die anderen Gäste am selben Kanal. Ein Gast darf
    // weder stummschalten noch Teilen freigeben.
    const verbindung = await zeigeGespraech();
    await act(async () => { verbindung.ruf({ art: "teilen", erlaubt: true }, "gast-fremd"); });
    expect((screen.getByLabelText("Teilen") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { verbindung.ruf({ art: "stumm" }, "gast-fremd"); });
    expect(verbindung.setzeSpur).not.toHaveBeenCalledWith("audio", false);
    expect(screen.queryByText(/hat dein Mikrofon stummgeschaltet/)).toBeNull();
  });
});
