import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

/*
 * Der Hook hinter der Spalte "Vorab-Score" in der Bewerberliste.
 *
 * Geprüft wird die eine Eigenschaft, an der die Spalte am 11.09.2026
 * gescheitert ist: Sie fragte nur, wenn sich die Menge der angezeigten
 * Bewerber änderte. Der Bogen wird aber nicht im CRM ausgefüllt, sondern vom
 * Bewerber in seinem eigenen Fenster, und danach ändert sich an der Menge
 * nichts mehr. Der Strich blieb deshalb stehen, obwohl der Bogen längst da war.
 */

/** Was die Datenbank beim nächsten Aufruf zurückgeben soll. */
let zeilen: { bewerbung_id: string; antworten: unknown; eingereicht_am: string; status: string }[] = [];
/** Wie oft die Tabelle abgefragt wurde. */
let abfragen = 0;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({
          eq: () => {
            abfragen += 1;
            return Promise.resolve({ data: zeilen, error: null });
          },
        }),
      }),
    }),
  },
}));

import { useVorabScores } from "./useVorabScores";
import { leereNachladeSpeicher } from "./nachladeSpeicher";

/** Ein eingereichtes Kennenlernen, stark genug für eine Zahl über null. */
const KENNENLERNEN = {
  weg: "weg1",
  hintergrund: ["immo"],
  zeitProWoche: "vollzeit",
  perspektive: "sofort_haupt",
  leadPraeferenz: "beides",
  einkommensziel: "5000_10000",
  startzeitpunkt: "sofort",
  gewerbe34c: "beides",
  verstaendnisFixum: "nein",
  verstaendnisProvision: "nein",
  wegAntwort1: "ueber_10",
  wegAntwort3: "anleger",
};

function Probe({ ids }: { ids: string[] }) {
  const { scores, kennenlernEingereichtAm, vorabEingereichtAm } = useVorabScores(ids);
  return (
    <>
      <span data-testid="score">{scores["bew-1"] ? String(scores["bew-1"].punkte) : "leer"}</span>
      <span data-testid="kennenlernen">{kennenlernEingereichtAm["bew-1"] ? "ja" : "nein"}</span>
      <span data-testid="vorab">{vorabEingereichtAm["bew-1"] ? "ja" : "nein"}</span>
    </>
  );
}

beforeEach(() => {
  zeilen = [];
  abfragen = 0;
  // Die Antworten werden ueber den Seitenwechsel hinweg gemerkt. Jeder Test
  // soll ohne die Antwort des vorigen beginnen.
  leereNachladeSpeicher();
});

describe("useVorabScores", () => {
  it("holt die Scores der angezeigten Bewerber", async () => {
    zeilen = [{ bewerbung_id: "bew-1", antworten: KENNENLERNEN, eingereicht_am: "2026-09-11T08:00:00Z", status: "eingereicht" }];
    render(<Probe ids={["bew-1"]} />);
    await waitFor(() => expect(screen.getByTestId("score")).not.toHaveTextContent("leer"));
    expect(Number(screen.getByTestId("score").textContent)).toBeGreaterThan(0);
  });

  it("fragt erneut, sobald das Fenster wieder im Vordergrund ist", async () => {
    // Erster Lauf: Der Bewerber steht in der Liste, sein Bogen fehlt noch.
    render(<Probe ids={["bew-1"]} />);
    await waitFor(() => expect(abfragen).toBe(1));
    expect(screen.getByTestId("score")).toHaveTextContent("leer");

    // Der Bewerber füllt den Bogen in seinem eigenen Fenster aus. An der Menge
    // der angezeigten Bewerber ändert sich dadurch nichts.
    zeilen = [{ bewerbung_id: "bew-1", antworten: KENNENLERNEN, eingereicht_am: "2026-09-11T08:00:00Z", status: "eingereicht" }];

    act(() => { window.dispatchEvent(new Event("focus")); });

    await waitFor(() => expect(abfragen).toBe(2));
    await waitFor(() => expect(screen.getByTestId("score")).not.toHaveTextContent("leer"));
  });

  it("erkennt den Kennenlernbogen und zählt den Vorabbogen nicht mit", async () => {
    /*
     * Beide Bögen liegen in derselben Tabelle. Der alte Vorabbogen ergibt
     * ebenfalls einen Score, gilt aber nicht als ausgefüllter Kennenlernbogen:
     * Genau dieser Bewerber braucht den neuen Bogen noch.
     */
    zeilen = [{
      bewerbung_id: "bew-1",
      antworten: { zeitProWoche: "vollzeit", hintergrund: ["immo"], perspektive: "sofort_haupt" },
      eingereicht_am: "2026-09-11T08:00:00Z",
      status: "eingereicht",
    }];
    render(<Probe ids={["bew-1"]} />);
    await waitFor(() => expect(screen.getByTestId("score")).not.toHaveTextContent("leer"));
    expect(screen.getByTestId("kennenlernen")).toHaveTextContent("nein");
    /*
     * Er zählt aber seit dem 16.09.2026 als ausgefüllter Bogen. Daran hängt
     * der Haken am Briefsymbol: Auch der Link des Vorabbogens stand
     * ausschließlich in einer Mail, der Bewerber hat also Post von uns
     * bekommen und geöffnet. Der Filter bleibt davon unberührt.
     */
    expect(screen.getByTestId("vorab")).toHaveTextContent("ja");
  });

  /*
   * Der Altfall aus dem August: eingereicht, mit Antworten des alten Katalogs,
   * ohne das Kennzeichen `bogen` und ohne gewählten `weg`. Beide Merkmale sind
   * jünger als er, und genau deshalb fehlte ihm der Haken.
   */
  it("zählt einen eingereichten Bogen ohne `bogen` und ohne `weg` als ausgefüllt", async () => {
    zeilen = [{
      bewerbung_id: "bew-1",
      antworten: { region: "Rosenheim", beschaeftigung: "angestellt" },
      eingereicht_am: "2026-08-22T08:00:00Z",
      status: "eingereicht",
    }];
    render(<Probe ids={["bew-1"]} />);
    await waitFor(() => expect(screen.getByTestId("vorab")).toHaveTextContent("ja"));
    expect(screen.getByTestId("kennenlernen")).toHaveTextContent("nein");
  });

  it("merkt sich den eingereichten Kennenlernbogen", async () => {
    zeilen = [{ bewerbung_id: "bew-1", antworten: KENNENLERNEN, eingereicht_am: "2026-09-11T08:00:00Z", status: "eingereicht" }];
    render(<Probe ids={["bew-1"]} />);
    await waitFor(() => expect(screen.getByTestId("kennenlernen")).toHaveTextContent("ja"));
  });

  it("ohne Bewerber wird nichts abgefragt", async () => {
    render(<Probe ids={[]} />);
    await waitFor(() => expect(screen.getByTestId("score")).toHaveTextContent("leer"));
    expect(abfragen).toBe(0);
  });
});
