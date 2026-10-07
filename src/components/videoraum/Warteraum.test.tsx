import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Warteraum, type WarteraumDaten } from "./Warteraum";
import type { VideoraumArt } from "@/lib/videoraumStore";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

/**
 * Der Warteraum ist das erste, was der Kunde von uns sieht. Zwei Dinge sind
 * hier abgesichert: Ein Raum ohne gepflegte Agenda darf nicht leer wirken,
 * und ohne gepflegtes Beraterprofil darf die Begruessung nicht entgleisen.
 */

function daten(zusatz: Partial<WarteraumDaten> = {}): WarteraumDaten {
  return {
    art: "beratung",
    gastgeber: { name: "Christian Peetz", position: "Berater" },
    agenda: [],
    hinweis: null,
    dauerMinuten: 45,
    objekt: {},
    berechnung: [],
    naechsteSchritte: [],
    stream: null,
    medienFehler: null,
    ...zusatz,
  };
}

describe("Warteraum", () => {
  it.each([
    ["erstgespraech", "Kurz kennenlernen"],
    ["beratung", "Deine Ausgangslage"],
    ["objektvorstellung", "Das Objekt im Überblick"],
  ] as Array<[VideoraumArt, string]>)(
    "zeigt bei %s die Standardagenda, wenn am Raum keine gepflegt ist",
    (art, ersterPunkt) => {
      // Ein gebuchter Raum bringt keine eigene Agenda mit. Ohne den Rückgriff
      // stand dort nur "Ihr Ansprechpartner geht das Gespräch mit Ihnen durch".
      render(<Warteraum name="Martina Brandl" daten={daten({ art })} />);
      expect(screen.getByText(ersterPunkt)).toBeTruthy();
    },
  );

  it("lässt der gepflegten Agenda den Vortritt", () => {
    render(
      <Warteraum
        name="Martina Brandl"
        daten={daten({ agenda: [{ titel: "Nur dieser eine Punkt" }] })}
      />,
    );
    expect(screen.getByText("Nur dieser eine Punkt")).toBeTruthy();
    expect(screen.queryByText("Deine Ausgangslage")).toBeNull();
  });

  it("begrüßt mit dem Vornamen des Gastgebers", () => {
    render(<Warteraum name="Martina Brandl" daten={daten()} />);
    expect(screen.getByText(/^Christian ist gleich für dich da$/)).toBeTruthy();
    expect(screen.getByText("Willkommen, Martina.")).toBeTruthy();
  });

  it("zeigt unten den Hinweis zur Warteschlange", () => {
    // Es kann immer nur eine Person im Gespräch sein. Wer wartet, soll sehen,
    // dass er nicht vergessen wurde.
    render(
      <Warteraum
        name="Martina Brandl"
        daten={daten({ warteHinweis: "Gerade läuft noch ein Gespräch. Du bist als Nächster dran." })}
      />,
    );
    expect(screen.getByText(/als Nächster dran/)).toBeTruthy();
  });

  it("zerlegt den Platzhalter nicht, wenn kein Name am Raum hängt", () => {
    // Sonst stand da "Dein ist gleich für dich da".
    render(<Warteraum name="Martina" daten={daten({ gastgeber: { name: "" } })} />);
    expect(screen.getByText(/^Dein Ansprechpartner ist gleich für dich da$/)).toBeTruthy();
  });
});
