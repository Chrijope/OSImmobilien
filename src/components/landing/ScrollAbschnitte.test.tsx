import { fireEvent, render, screen } from "@testing-library/react";
import ProcessSection from "./ProcessSection";
import SteuerlastSection from "./SteuerlastSection";

/**
 * Die beiden scrollgesteuerten Abschnitte der Microseite.
 *
 * Geprüft wird die eine Zusage, die unabhängig von der Animation gilt:
 * Ohne ein einziges Scrollereignis ist alles lesbar. Weder die Bühne noch der
 * Fortschritt dürfen darüber entscheiden, ob ein Text überhaupt ankommt.
 */

const echteMedien = window.matchMedia;

/** Setzt die Medienabfragen so, dass nur die genannten Abfragen zutreffen. */
function setzeMedien(trifftZu: (abfrage: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (abfrage: string) => ({
      matches: trifftZu(abfrage),
      media: abfrage,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: echteMedien });
});

describe("Scrollgesteuerte Abschnitte der Microseite", () => {
  it("zeigt die Ausgangslage ohne Scrollereignis vollständig", () => {
    const { container } = render(<SteuerlastSection onOpenFunnel={() => {}} />);
    expect(screen.getByText(/Steuern sind dein größter Ausgabeposten/)).toBeInTheDocument();
    expect(screen.getByText(/Deine Rentenlücke steht heute schon fest/)).toBeInTheDocument();
    expect(screen.getByText(/Sparen ist der teuerste Umweg/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Zeitachse über zehn Jahre/ })).toBeInTheDocument();
    // Ohne messbaren Scrollweg wird nichts abgedunkelt.
    expect(container.querySelector(".opacity-30")).toBeNull();
  });

  it("zeigt im Prozessabschnitt ohne Scrollereignis alle sechs Schritte samt Grafik", () => {
    const { container } = render(<ProcessSection onOpenFunnel={() => {}} />);
    expect(screen.getByText("Persönliche Ausgangsanalyse")).toBeInTheDocument();
    expect(screen.getByText("Strategischer Portfolioaufbau")).toBeInTheDocument();
    for (const kurz of ["Ausgangsanalyse", "Investmentstrategie", "Finanzierung", "Kaufbegleitung", "Vermietung", "Portfolioaufbau"]) {
      expect(screen.getAllByText(kurz).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("Ablauf, schematisch")).toHaveLength(6);
    expect(container.querySelector(".opacity-30")).toBeNull();
  });

  it("hält den Aufruf im Prozessabschnitt auch ohne Scrollsteuerung sichtbar und klickbar", () => {
    // Der Aufruf erscheint sonst erst beim letzten Schritt. Greift die
    // Scrollsteuerung nicht, muss er sofort da und bedienbar sein, sonst ist er
    // für alle verloren, die nie einen messbaren Scrollweg haben.
    const gedrueckt = vi.fn();
    render(<ProcessSection onOpenFunnel={gedrueckt} />);
    const knopf = screen.getByRole("button", { name: /Kostenlose Erstberatung vereinbaren/ });
    const kasten = knopf.parentElement!;
    expect(kasten.className).toContain("opacity-100");
    expect(kasten.className).not.toContain("pointer-events-none");
    expect(kasten).not.toHaveAttribute("aria-hidden");
    expect(knopf.tabIndex).toBe(0);
    fireEvent.click(knopf);
    expect(gedrueckt).toHaveBeenCalledTimes(1);
  });

  it("verzichtet bei reduzierter Bewegung auf Hülle und Bühne", () => {
    setzeMedien((abfrage) => abfrage.includes("prefers-reduced-motion"));
    const { container: ausgangslage } = render(<SteuerlastSection onOpenFunnel={() => {}} />);
    expect(ausgangslage.querySelector(".sticky")).toBeNull();
    expect(ausgangslage.querySelector('[class*="svh"]')).toBeNull();
    expect(screen.getByText(/Sparen ist der teuerste Umweg/)).toBeInTheDocument();

    const { container: prozess } = render(<ProcessSection onOpenFunnel={() => {}} />);
    expect(prozess.querySelector(".sticky")).toBeNull();
    expect(prozess.querySelector('[class*="svh"]')).toBeNull();
    expect(prozess.querySelectorAll(".opacity-30")).toHaveLength(0);
  });
});
