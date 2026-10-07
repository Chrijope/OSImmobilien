/**
 * Die Strecke von aussen: durchklicken und sehen, was ankommt.
 *
 * Reduzierte Bewegung ist hier eingeschaltet. Damit ueberspringt das
 * Rechen-Vollbild seine dreieinhalb Sekunden und der Test muss keine Uhr
 * stellen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AfaStrecke from "./AfaStrecke";

// Recharts misst den Container aus, den es in jsdom nicht gibt.
vi.mock("recharts", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("recharts")),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const weiter = () => fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // Reduzierte Bewegung: das Rechen-Vollbild meldet sich sofort fertig.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Die AfA-Strecke", () => {
  it("laesst ohne Gebaeudeart und Baujahr nicht weiter", () => {
    render(<AfaStrecke />);
    expect(screen.getByRole("heading", { name: "Was für ein Objekt ist es?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Bestandsimmobilie/ }));
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Baujahr"), { target: { value: "1985" } });
    expect(screen.getByRole("button", { name: "Weiter" })).not.toBeDisabled();
  });

  it("zeigt beim Bestand sieben Schritte, darunter Sanierung und Modernisierung", () => {
    render(<AfaStrecke vorbelegung={{ kaufpreis: 300000, baujahr: 1985 }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Bestandsimmobilie/ }));
    expect(screen.getByText("Schritt 1 von 7")).toBeTruthy();
    weiter(); // Kaufpreis
    weiter(); // Lage
    weiter(); // Grundstück
    expect(screen.getByRole("heading", { name: /Grundstück/ })).toBeTruthy();
    weiter(); // Sanierung
    expect(screen.getByRole("heading", { name: "Wurde saniert?" })).toBeTruthy();
    expect(screen.getByLabelText("Kernsanierung")).toBeTruthy();
    weiter(); // Modernisierung
    expect(screen.getByRole("heading", { name: "Was wurde am Gebäude modernisiert?" })).toBeTruthy();
  });

  it("zeigt die acht Modernisierungselemente erst nach dem Schalter", () => {
    render(<AfaStrecke vorbelegung={{ kaufpreis: 300000, baujahr: 1985 }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Bestandsimmobilie/ }));
    weiter();
    weiter();
    weiter();
    weiter(); // Sanierung
    weiter(); // Modernisierung
    // Ohne den Schalter steht dort eine einzige Frage, keine acht Auswahlfelder.
    expect(screen.queryByText("Dacherneuerung inkl. Wärmedämmung")).toBeNull();
    fireEvent.click(screen.getByLabelText("Modernisierung"));
    expect(screen.getByText("Dacherneuerung inkl. Wärmedämmung")).toBeTruthy();
    expect(screen.getByText("Heizungsanlage")).toBeTruthy();
    expect(screen.getByText("Grundrissgestaltung")).toBeTruthy();
  });

  it("laesst die Modernisierungsfrage weg, wo sie nichts aendern wuerde", () => {
    // Ein junges Bestandsgebaeude liegt unter jeder Schwelle der Tabelle 3.
    const jung = new Date().getFullYear() - 4;
    render(<AfaStrecke vorbelegung={{ kaufpreis: 300000, baujahr: jung }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Bestandsimmobilie/ }));
    expect(screen.getByText("Schritt 1 von 6")).toBeTruthy();
    weiter();
    weiter();
    weiter();
    weiter(); // Sanierung
    weiter(); // Gutachten, die Modernisierung entfaellt
    expect(screen.getByRole("heading", { name: /Gutachten zur Restnutzungsdauer/ })).toBeTruthy();
  });

  it("laesst beim Neubau Sanierung und Modernisierung ganz weg", () => {
    render(<AfaStrecke vorbelegung={{ kaufpreis: 400000, baujahr: 2024 }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Neubau/ }));
    expect(screen.getByText("Schritt 1 von 5")).toBeTruthy();
    weiter(); // Kaufpreis
    weiter(); // Lage
    weiter(); // Grundstück
    weiter(); // Gutachten
    // Nach dem Grundstück kommt direkt das Gutachten, nicht die Sanierung.
    expect(screen.getByRole("heading", { name: /Gutachten zur Restnutzungsdauer/ })).toBeTruthy();
  });

  it("fuehrt die Anschrift mit und leitet das Bundesland aus der PLZ ab", () => {
    render(<AfaStrecke vorbelegung={{ kaufpreis: 300000, baujahr: 1985 }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Bestandsimmobilie/ }));
    weiter(); // Kaufpreis
    weiter(); // Lage
    fireEvent.change(screen.getByLabelText("PLZ"), { target: { value: "90402" } });
    fireEvent.change(screen.getByLabelText("Ort"), { target: { value: "Nürnberg" } });
    expect(screen.getByText(/Aus der PLZ 90402 ermittelt/)).toBeTruthy();
    expect(screen.getByLabelText("Ort")).toHaveValue("Nürnberg");
  });

  it("fuehrt bis zum Ergebnis und weist dort die Abschreibung aus", () => {
    render(<AfaStrecke vorbelegung={{ kaufpreis: 400000, baujahr: 2024, wohnflaeche: 80 }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Neubau/ }));
    weiter(); // Kaufpreis
    weiter(); // Lage
    weiter(); // Grundstück
    weiter(); // Gutachten
    fireEvent.click(screen.getByRole("button", { name: "Abschreibung berechnen" }));
    // Neubau ab 2023: drei Prozent gesetzlich, das schlaegt die Modellrechnung.
    expect(screen.getByText("Dein Ergebnis")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Abschreibung im Jahr/ })).toBeTruthy();
    expect(screen.getByText("3,00 %")).toBeTruthy();
  });

  it("behaelt eine Angabe beim Zurueckgehen", () => {
    render(<AfaStrecke />);
    fireEvent.click(screen.getByRole("button", { name: /^Bestandsimmobilie/ }));
    fireEvent.change(screen.getByLabelText("Baujahr"), { target: { value: "1972" } });
    weiter();
    fireEvent.click(screen.getByRole("button", { name: "Eine Frage zurück" }));
    expect(screen.getByLabelText("Baujahr")).toHaveValue(1972);
  });
});
