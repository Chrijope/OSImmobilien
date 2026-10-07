import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Rauchtest der Ablaufplan-Seite: sie rendert, alle acht Stationen sind
 * sichtbar, die Zeitnoten und die abgestimmte Gesamtdauer-Formulierung stehen
 * auf der Seite. Das Dashboard-Geruest wird durch eine Huelle ersetzt, es
 * braeuchte sonst den kompletten Nutzer- und Datenkontext.
 */
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import VertriebsakademieAblaufplan from "./VertriebsakademieAblaufplan";
import { ABLAUF_STATIONEN } from "@/lib/ablaufplan";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";

describe("VertriebsakademieAblaufplan", () => {
  it("zeigt alle acht Stationen mit ihren Zeitnoten und der Gesamtdauer", () => {
    render(
      <MemoryRouter>
        <VertriebsakademieAblaufplan />
      </MemoryRouter>,
    );

    expect(ABLAUF_STATIONEN).toHaveLength(8);
    // getAllByText, weil Stationstitel wie "Beratungsgespräch" zugleich als
    // Pipelinestufen-Badge auf der Seite stehen.
    for (const station of ABLAUF_STATIONEN) {
      expect(screen.getAllByText(station.titel).length).toBeGreaterThan(0);
    }

    // Die vorgegebenen Zeitnoten je Termin
    expect(screen.getByText("ca. 15 bis 30 Min.")).toBeInTheDocument();
    expect(screen.getByText("ca. 60 bis 90 Min.")).toBeInTheDocument();
    expect(screen.getByText("ca. 45 Min.")).toBeInTheDocument();
    expect(screen.getAllByText("ca. 1 Std.").length).toBe(2);
    expect(
      screen.getByText("zusammen mit der Finanzierungsabteilung"),
    ).toBeInTheDocument();

    // Abgestimmte Hausformulierung zur Gesamtdauer
    expect(
      screen.getByText(
        "Die erste Provision fließt nach Kaufpreisfälligkeit, meist 8 bis 10 Wochen nach dem Erstkontakt mit dem Kunden.",
      ),
    ).toBeInTheDocument();
  });

  it("ordnet nur echte Pipelinestufen zu, jede aktive Stufe genau einmal", () => {
    const bekannt = new Set<string>(PIPELINE_STUFEN.map((s) => s.key));
    const zugeordnet = ABLAUF_STATIONEN.flatMap((s) => s.stufen);

    // Keine erfundene Stufe
    for (const key of zugeordnet) {
      expect(bekannt.has(key)).toBe(true);
    }
    // Keine Stufe doppelt zugeordnet
    expect(new Set(zugeordnet).size).toBe(zugeordnet.length);
  });
});
