import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Der Fortschritt hängt an localStorage und Supabase. Für die Anzeige zählt
// nur, was `berechneSerie` liefert, also wird genau diese Stelle gesetzt.
const stand = vi.hoisted(() => ({ tage: [] as string[], heute: "2026-09-07" }));

vi.mock("@/lib/vertriebsakademieProgress", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/vertriebsakademieProgress")>();
  return { ...echt, useVaSerie: () => echt.berechneSerie(stand.tage, stand.heute) };
});

import { AkademieSerie, AkademieSerieKompakt } from "./AkademieSerie";

beforeEach(() => {
  stand.tage = [];
  stand.heute = "2026-09-07";
});

describe("Serie auf der Übersicht", () => {
  it("sagt ohne Serie, wodurch ein Tag zählt", () => {
    render(<AkademieSerie />);
    expect(screen.getByText("Noch keine Serie")).toBeInTheDocument();
    expect(
      screen.getByText(/Ein Tag zählt, sobald du eine Aufgabe richtig gelöst hast/),
    ).toBeInTheDocument();
  });

  it("zeigt die laufende Serie mit richtiger Ein- und Mehrzahl", () => {
    stand.tage = ["2026-09-07"];
    const { rerender } = render(<AkademieSerie />);
    expect(screen.getByText("Serie: 1 Tag in Folge")).toBeInTheDocument();

    stand.tage = ["2026-09-05", "2026-09-06", "2026-09-07"];
    rerender(<AkademieSerie />);
    expect(screen.getByText("Serie: 3 Tage in Folge")).toBeInTheDocument();
  });

  it("hält die Serie am Leben, wenn heute noch nichts gelöst wurde", () => {
    stand.tage = ["2026-09-05", "2026-09-06"];
    render(<AkademieSerie />);
    expect(screen.getByText("Serie: 2 Tage in Folge")).toBeInTheDocument();
    // Kein Druck, kein Countdown, nur der Hinweis, wodurch der Tag zählt.
    expect(
      screen.getByText(/Ein Tag zählt, sobald du eine Aufgabe richtig gelöst hast/),
    ).toBeInTheDocument();
  });

  it("nennt die längste Serie erst, wenn sie über der laufenden liegt", () => {
    stand.tage = ["2026-09-07"];
    const { rerender } = render(<AkademieSerie />);
    expect(screen.queryByText(/längste Serie/)).toBeNull();

    stand.tage = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-09-07"];
    rerender(<AkademieSerie />);
    expect(screen.getByText(/Deine längste Serie: 4 Tage/)).toBeInTheDocument();
  });
});

describe("Serie auf der Kapitelseite", () => {
  it("bleibt still, solange keine Serie läuft", () => {
    const { container } = render(<AkademieSerieKompakt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt eine laufende Serie in einer Zeile", () => {
    stand.tage = ["2026-09-06", "2026-09-07"];
    render(<AkademieSerieKompakt />);
    expect(screen.getByText("2 Tage in Folge")).toBeInTheDocument();
  });
});
