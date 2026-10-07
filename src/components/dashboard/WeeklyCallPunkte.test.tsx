import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { WeeklyCallPunkt } from "@/lib/weeklyCallStore";

/**
 * Sichtbarkeit der Punkte fuer den Weekly Sales Call.
 *
 * Am 26.08.2026 bewusst umgestellt: Vorher sah jeder nur seine eigenen Punkte,
 * jetzt sieht jeder Teilnehmer alle. Ohne Namen bleibt es trotzdem, und
 * loeschen darf weiterhin nur, wer den Punkt eingetragen hat.
 *
 * Der Test haelt genau diese drei Zusagen fest, damit sie nicht versehentlich
 * wieder auseinanderlaufen.
 */

const ladePunkte = vi.hoisted(() => vi.fn());
const loeschePunkt = vi.hoisted(() => vi.fn());
const ladeTermine = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/confirm", () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "ich", role: "vertriebspartner" } }),
}));
vi.mock("@/lib/weeklyCallStore", async () => {
  const echt = await vi.importActual<typeof import("@/lib/weeklyCallStore")>(
    "@/lib/weeklyCallStore",
  );
  return {
    ...echt,
    ladePunkte,
    loeschePunkt,
    ladeTermine,
    ladeProtokoll: vi.fn(async () => null),
  };
});

import { WeeklyCallPunkte } from "./WeeklyCallPunkte";

/** Ein Punkt, wie ihn die Datenbankfunktion liefert: ohne Verfasser. */
function punkt(id: string, text: string, vonMir: boolean): WeeklyCallPunkt {
  return {
    id,
    text,
    callTermin: "2026-08-31",
    vonMir,
    besprochen: false,
    erstelltAm: "2026-08-26T10:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ladePunkte.mockResolvedValue([
    punkt("a", "Mein eigener Punkt", true),
    punkt("b", "Punkt von jemand anderem", false),
  ]);
});

describe("Punkte fuer den Weekly Sales Call", () => {
  it("zeigt auch fremde Punkte", async () => {
    render(<WeeklyCallPunkte runde="vertriebspartner" />);
    expect(await screen.findByText("Punkt von jemand anderem")).toBeInTheDocument();
    expect(screen.getByText("Mein eigener Punkt")).toBeInTheDocument();
  });

  it("kennzeichnet nur den eigenen Punkt, nennt aber keinen Namen", async () => {
    render(<WeeklyCallPunkte runde="vertriebspartner" />);
    await screen.findByText("Punkt von jemand anderem");
    expect(screen.getAllByText("von mir")).toHaveLength(1);
  });

  it("bietet Aendern und Loeschen nur am eigenen Punkt an", async () => {
    render(<WeeklyCallPunkte runde="vertriebspartner" />);
    await screen.findByText("Punkt von jemand anderem");
    await waitFor(() => {
      expect(screen.getAllByTitle("Löschen")).toHaveLength(1);
      expect(screen.getAllByTitle("Ändern")).toHaveLength(1);
    });
  });

  it("zeigt einem Vertriebspartner keinen Abhaken-Knopf", async () => {
    render(<WeeklyCallPunkte runde="vertriebspartner" />);
    await screen.findByText("Punkt von jemand anderem");
    expect(
      screen.queryByTitle("Im Call besprochen, wandert zu den früheren Calls"),
    ).toBeNull();
  });
});

describe("Punkte je Call getrennt", () => {
  it("laedt nur die Punkte des eigenen Calls und beschriftet ihn mit Uhrzeit", async () => {
    render(<WeeklyCallPunkte runde="vertriebspartner" />);
    await screen.findByText("Punkt von jemand anderem");
    expect(ladePunkte).toHaveBeenCalledWith(expect.any(String), "vertriebspartner");
    expect(screen.getByText(/19:30 Uhr, Vertriebspartner/)).toBeInTheDocument();
  });

  it("fragt fuer den 19:00-Call ausdruecklich dessen Punkte ab", async () => {
    render(<WeeklyCallPunkte runde="lead_berater" />);
    await screen.findByText("Punkt von jemand anderem");
    expect(ladePunkte).toHaveBeenCalledWith(expect.any(String), "lead_berater");
    expect(ladePunkte).not.toHaveBeenCalledWith(expect.any(String), "vertriebspartner");
    expect(screen.getByText(/19:00 Uhr, Lead-Berater/)).toBeInTheDocument();
  });
});

describe("Ohne Migration", () => {
  it("zeigt einen ruhigen Hinweis statt Liste und Eingabe, ohne Technik", async () => {
    ladePunkte.mockResolvedValue(null);
    render(<WeeklyCallPunkte runde="vertriebspartner" />);
    expect(await screen.findByText("Die Punkte für den Call sind gleich wieder da.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Was möchtest du/)).toBeNull();
    expect(screen.queryByText(/Migration/)).toBeNull();
  });
});
