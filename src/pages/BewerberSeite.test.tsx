import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * Die persönliche Bewerberseite, als Bildschirm.
 *
 * Geprüft wird das, was die Seite ausmacht und was man beim Umbauen am
 * leichtesten kaputt macht: dass sie in jedem Zustand dieselben drei Fragen
 * beantwortet, dass „wer am Zug ist" aus dem Vorgang kommt und nicht aus der
 * Pipelinestufe, und dass Pause, Ausstieg und der Widerspruch gegen den Anruf
 * beim Server ankommen statt nur den Bildschirm umzuschalten.
 *
 * Die Rechenlogik selbst steht in `src/lib/bewerberSeite.test.ts`.
 */

const TOKEN = "a".repeat(64);

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useParams: () => ({ token: TOKEN }) };
});

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke } },
}));

import { MemoryRouter } from "react-router-dom";
import BewerberSeite from "./BewerberSeite";

let antwort: Record<string, unknown> | null = null;

function stand(rest: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vorname: "Jonas",
    beworben_am: "2026-09-08T09:00:00.000Z",
    beendet: false,
    beendet_durch: "",
    zugesagt: false,
    kennenlernen: { token: "b".repeat(64), status: "offen", angefangen: false, gesendet_am: "2026-09-08T09:05:00.000Z" },
    termin: { datum: "", uhrzeit: "", berater: "", gefuehrt_am: "" },
    entscheidung: {},
    start: {},
    pause: {},
    frage: {},
    anruf_widersprochen: false,
    ...rest,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  antwort = stand();
  rpc.mockImplementation(() => Promise.resolve({ data: antwort, error: null }));
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

async function oeffne() {
  await act(async () => {
    render(<MemoryRouter><BewerberSeite /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}

describe("Was die Seite in jedem Zustand beantwortet", () => {
  it("begruesst mit Namen und zeigt die vier Stationen mit ihrem Stand", async () => {
    await oeffne();
    expect(screen.getByRole("heading", { name: /Hallo Jonas, hier steht dein Stand/ })).toBeInTheDocument();
    expect(screen.getByText("Deine Bewerbung ist angekommen")).toBeInTheDocument();
    expect(screen.getByText("Dein Kennenlernen")).toBeInTheDocument();
    expect(screen.getByText("Dein Videocall")).toBeInTheDocument();
    expect(screen.getByText("Deine Entscheidung")).toBeInTheDocument();
    // Was ist erledigt, wer ist am Zug, was kann ich als Naechstes tun.
    expect(screen.getAllByText("erledigt").length).toBeGreaterThan(0);
    expect(screen.getByText("du bist dran")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kennenlernen beginnen/ })).toBeInTheDocument();
  });

  it("zeigt weder Bewertung noch Pipelinestufe", async () => {
    await oeffne();
    expect(document.body.textContent).not.toMatch(/Punkte|Score|Pipeline|Eingang\b/);
  });

  it("meldet einen unbekannten Link, statt technisch zu scheitern", async () => {
    antwort = null;
    await oeffne();
    expect(screen.getByRole("heading", { name: /Diesen Link kennen wir nicht/ })).toBeInTheDocument();
  });
});

describe("Wer am Zug ist, kommt aus dem Vorgang", () => {
  it("zeigt MOREImmo als am Zug, obwohl der Bewerber formal im Eingang steht", async () => {
    antwort = stand({
      frage: {
        gestelltAm: "2026-09-18T09:00:00.000Z",
        text: "Welchen Umfang braucht die Erlaubnis?",
        bisAm: "2026-09-22T09:00:00.000Z",
      },
    });
    await oeffne();
    expect(screen.getByText("Wer gerade am Zug ist")).toBeInTheDocument();
    expect(screen.getByText(/Du musst nichts tun und nichts nachfassen/)).toBeInTheDocument();
  });

  it("zeigt den Kasten nicht, solange der Bewerber selbst dran ist", async () => {
    await oeffne();
    expect(screen.queryByText("Wer gerade am Zug ist")).not.toBeInTheDocument();
  });
});

describe("Pause, Ausstieg und der Widerspruch gegen den Anruf", () => {
  it("meldet die Pause an den Server", async () => {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Pause wählen/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Erinnere mich in einer Woche/ }));
    });
    expect(invoke).toHaveBeenCalledWith(
      "bewerber-seite",
      expect.objectContaining({ body: expect.objectContaining({ aktion: "pause", wahl: "woche" }) }),
    );
  });

  it("macht den sechsten Stopp erreichbar, ohne den Bewerber auf Kein Interesse zu setzen", async () => {
    await oeffne();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Bitte nicht anrufen/ }));
    });
    expect(invoke).toHaveBeenCalledWith(
      "bewerber-seite",
      expect.objectContaining({ body: expect.objectContaining({ aktion: "kein_anruf" }) }),
    );
    // Der Knopf setzt ausdruecklich keinen Ausstieg.
    const aufrufe = invoke.mock.calls.map((c) => (c[1] as { body: { aktion: string } }).body.aktion);
    expect(aufrufe).not.toContain("ausstieg");
  });

  it("zeigt den Widerspruch danach als vermerkt und nicht als Absage", async () => {
    antwort = stand({ anruf_widersprochen: true });
    await oeffne();
    expect(screen.getByText(/Ist vermerkt/)).toBeInTheDocument();
    expect(screen.getByText(/An deiner Bewerbung ändert das nichts/)).toBeInTheDocument();
  });

  it("beendet erst nach dem zweiten Klick und meldet den Ausstieg", async () => {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Kein Interesse mehr/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Bewerbung beenden$/ }));
    });
    expect(invoke).toHaveBeenCalledWith(
      "bewerber-seite",
      expect.objectContaining({ body: expect.objectContaining({ aktion: "ausstieg" }) }),
    );
  });

  it("sagt es, wenn der Server nicht antwortet, statt etwas zu versprechen", async () => {
    invoke.mockRejectedValueOnce(new Error("Netz weg"));
    await oeffne();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Bitte nicht anrufen/ }));
    });
    expect(screen.getByText(/Das hat leider nicht geklappt/)).toBeInTheDocument();
  });
});

describe("Die weiteren Zustaende", () => {
  it("Zustand 3 nennt Datum und Uhrzeit des Videocalls", async () => {
    antwort = stand({ termin: { datum: "2026-09-24", uhrzeit: "16:30", berater: "Sarah Kaiser-Thom" } });
    await oeffne();
    expect(screen.getByRole("heading", { name: /24\.09\.2026 um 16:30 Uhr/ })).toBeInTheDocument();
  });

  it("Zustand 4 verspricht ohne Freigabe keine Zusammenfassung", async () => {
    antwort = stand({ termin: { datum: "2026-09-18", gefuehrt_am: "2026-09-18T14:30:00.000Z" } });
    await oeffne();
    expect(screen.getByRole("heading", { name: /Jetzt entscheidest du, ohne Frist/ })).toBeInTheDocument();
    expect(screen.getByText(/sobald sie sie durchgesehen hat/)).toBeInTheDocument();
  });

  it("Zustand 5 nennt Voraussetzungen mit Verantwortlichen statt Kalenderwochen", async () => {
    antwort = stand({ zugesagt: true, start: { vertrag_unterschrieben_am: "2026-09-15T10:00:00.000Z" } });
    await oeffne();
    expect(screen.getByRole("heading", { name: /Dein Vertrag ist unterschrieben/ })).toBeInTheDocument();
    expect(screen.getByText("Zugang einrichten")).toBeInTheDocument();
    expect(screen.getByText("Fachliche Freigabe")).toBeInTheDocument();
    expect(screen.getByText(/Lernen ja, eigene Kundenberatung noch nicht/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Kalenderwoche/);
  });

  it("trennt den selbst gewaehlten Ausstieg von der Absage durch MOREImmo", async () => {
    antwort = stand({ beendet: true, beendet_durch: "bewerber" });
    await oeffne();
    expect(screen.getByRole("heading", { name: /Danke für deine Offenheit/ })).toBeInTheDocument();

    antwort = stand({ beendet: true, beendet_durch: "moreimmo" });
    await oeffne();
    expect(screen.getAllByRole("heading", { name: /Deine Bewerbung ist abgeschlossen/ }).length)
      .toBeGreaterThan(0);
  });
});
