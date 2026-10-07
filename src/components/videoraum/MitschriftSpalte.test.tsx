import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type { MitschriftLauf, MitschriftStatus } from "@/lib/mitschrift";

/**
 * Die Mitschriftspalte.
 *
 * Zwei Dinge sind hier abgesichert: Ohne bestaetigte Zustimmung startet nichts,
 * und ein Fehlschlag der Spracherkennung muss verstaendlich dastehen, statt
 * das Gespraech mitzureissen. Die Modelldateien liegen auf dem Server noch
 * nicht, dieser Fall ist also der normale.
 */

const starteMitschrift = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mitschrift", async () => {
  const echt = await vi.importActual<typeof import("@/lib/mitschrift")>("@/lib/mitschrift");
  return { ...echt, starteMitschrift };
});
vi.mock("@/lib/videoraumStore", () => ({ sendeMitschriftHinweis: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { MitschriftSpalte } from "./MitschriftSpalte";

/** Ein Lauf, der nie zustande kommt: genau der Fall ohne Modelldateien. */
function gescheiterterLauf(meldung: string) {
  return async (optionen: { aufStatus?: (s: MitschriftStatus, m?: string) => void }) => {
    optionen.aufStatus?.("modell_laedt");
    optionen.aufStatus?.("fehler", meldung);
    const lauf: MitschriftLauf = {
      stoppen: async () => [],
      abbrechen: () => { /* nichts */ },
      zeilen: () => [],
      dauerSekunden: () => 0,
      istAktiv: () => false,
    };
    return lauf;
  };
}

function zeichne() {
  const stream = { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
  render(
    <MitschriftSpalte
      lokalerStream={stream}
      gegenstellen={[{ name: "Martina Brandl", stream }]}
      eigenerName="Christian"
      token="raum-token"
      aufFertig={() => { /* nichts */ }}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom kennt scrollIntoView nicht, die Spalte ruft es beim Anfuegen von Zeilen.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("MitschriftSpalte", () => {
  it("startet nicht ohne bestätigte Zustimmung", () => {
    zeichne();
    const knopf = screen.getByRole("button", { name: /Mitschrift starten/ }) as HTMLButtonElement;
    expect(knopf.disabled).toBe(true);
    fireEvent.click(knopf);
    expect(starteMitschrift).not.toHaveBeenCalled();
  });

  it("meldet den Fehlschlag verständlich und lässt das Gespräch in Ruhe", async () => {
    const meldung = "Die Spracherkennung ist auf diesem Server noch nicht hinterlegt.";
    starteMitschrift.mockImplementation(gescheiterterLauf(meldung));
    zeichne();

    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mitschrift starten/ }));
    });

    expect(screen.getByText(meldung)).toBeTruthy();
    // Der Knopf steht wieder auf "starten", nicht auf "beenden": Es läuft
    // nichts, was man beenden könnte.
    expect(screen.getByRole("button", { name: /Mitschrift starten/ })).toBeTruthy();
  });

  it("lässt sich nach dem Beenden noch einmal starten", async () => {
    // Wer versehentlich beendet hatte, bekam im selben Gespräch keine zweite
    // Mitschrift mehr. Die erste ist zu dem Zeitpunkt längst gespeichert.
    let melde: ((s: MitschriftStatus, m?: string) => void) | undefined;
    let aktiv = true;
    starteMitschrift.mockImplementation(async (optionen: { aufStatus?: (s: MitschriftStatus) => void }) => {
      melde = optionen.aufStatus;
      melde?.("laeuft");
      return {
        stoppen: async () => { aktiv = false; return []; },
        abbrechen: () => { aktiv = false; },
        zeilen: () => [],
        dauerSekunden: () => 12,
        istAktiv: () => aktiv,
      } as MitschriftLauf;
    });

    zeichne();
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mitschrift starten/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mitschrift beenden/ }));
    });

    const nochmal = screen.getByRole("button", { name: /Mitschrift starten/ }) as HTMLButtonElement;
    expect(nochmal.disabled).toBe(false);
  });

  it("speichert beim Auflegen ueber den gereichten Stopper, aber nur einmal", async () => {
    // Wer auflegt, ohne vorher auf "Mitschrift beenden" zu klicken, verlor
    // das Transkript. Die Seite bekommt deshalb den Stopper in die Hand und
    // ruft ihn beim Auflegen. Ein zweiter Aufruf (Knopf plus Auflegen) darf
    // nicht zu einer zweiten Ablage fuehren.
    const zeilen = [{ zeitpunkt: 1, sprecher: "Christian", text: "Hallo" }];
    let aktiv = true;
    starteMitschrift.mockImplementation(async (optionen: { aufStatus?: (s: MitschriftStatus) => void }) => {
      optionen.aufStatus?.("laeuft");
      return {
        stoppen: async () => { aktiv = false; return zeilen; },
        abbrechen: () => { aktiv = false; },
        zeilen: () => zeilen,
        dauerSekunden: () => 42,
        istAktiv: () => aktiv,
      } as MitschriftLauf;
    });

    const aufFertig = vi.fn();
    let stopper: (() => Promise<void>) | null = null;
    const stream = { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    render(
      <MitschriftSpalte
        lokalerStream={stream}
        gegenstellen={[{ name: "Martina Brandl", stream }]}
        eigenerName="Christian"
        token="raum-token"
        aufFertig={aufFertig}
        registriereBeenden={(s) => { stopper = s; }}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mitschrift starten/ }));
    });

    await act(async () => { await stopper?.(); });
    expect(aufFertig).toHaveBeenCalledTimes(1);
    expect(aufFertig).toHaveBeenCalledWith(zeilen, 42, expect.any(String));

    // Der zweite Aufruf trifft keinen laufenden Lauf mehr und bleibt folgenlos.
    await act(async () => { await stopper?.(); });
    expect(aufFertig).toHaveBeenCalledTimes(1);
  });
});
