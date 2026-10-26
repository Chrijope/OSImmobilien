import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

/**
 * Fehlt nach einem Deploy ein Chunk, steht eine Karte mit „Jetzt neu laden“
 * da. Neu geladen wird erst auf Klick, nie von selbst (26.10.2026).
 */

function Wirft({ meldung }: { meldung: string }): never {
  throw new Error(meldung);
}

const neuLaden = vi.fn();
const echteLocation = window.location;

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: echteLocation });
  neuLaden.mockClear();
  vi.restoreAllMocks();
});

describe("RouteErrorBoundary", () => {
  it("zeigt bei fehlendem Chunk die Karte und laedt erst auf Klick", () => {
    vi.spyOn(console, "error").mockImplementation(() => { /* erwartet */ });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...echteLocation, reload: neuLaden, replace: neuLaden, assign: neuLaden },
    });

    render(
      <RouteErrorBoundary>
        <Wirft meldung="Failed to fetch dynamically imported module: /assets/Kontakte-abc.js" />
      </RouteErrorBoundary>,
    );

    expect(screen.getByText("Neue Version verfügbar")).toBeTruthy();
    expect(neuLaden).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Jetzt neu laden" }));
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });

  it("zeigt bei anderen Fehlern die normale Fehlerkarte", () => {
    vi.spyOn(console, "error").mockImplementation(() => { /* erwartet */ });
    render(
      <RouteErrorBoundary>
        <Wirft meldung="kaputt" />
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("Inhalt konnte nicht geladen werden")).toBeTruthy();
  });
});
