import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NaechsterSchritt } from "./NaechsterSchritt";

/**
 * Die Zeile ist in "Alle Kontakte" der einzige Hinweis darauf, dass bei einem
 * Kontakt ueberhaupt etwas ansteht. Faellt sie still aus, sieht die Liste
 * genauso aus wie vorher, und niemand merkt es.
 */

function kunde(felder: Record<string, unknown>) {
  return { id: "k-1", vorname: "Spiros", nachname: "Tsiepas", ...felder } as never;
}

function tageVoraus(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  return d.toISOString().slice(0, 10);
}

describe("NaechsterSchritt", () => {
  it("bleibt leer, wenn nichts geplant ist", () => {
    const { container } = render(<NaechsterSchritt kunde={kunde({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt einen Termin in der Zukunft", () => {
    const { container } = render(
      <NaechsterSchritt
        kunde={kunde({ setterTerminDatum: tageVoraus(9), setterTerminUhrzeit: "14:30" })}
      />,
    );
    expect(container.textContent).toContain("Erstgespräch");
    expect(container.textContent).toContain("14:30");
  });

  it("schreibt heute und morgen aus statt eines Datums", () => {
    render(
      <NaechsterSchritt kunde={kunde({ setterTerminDatum: tageVoraus(1), setterTerminUhrzeit: "09:00" })} />,
    );
    expect(screen.getByText(/morgen 09:00/)).toBeTruthy();
  });

  it("verschweigt Vergangenes, dafür ist die Ampel da", () => {
    const { container } = render(
      <NaechsterSchritt
        kunde={kunde({ setterTerminDatum: tageVoraus(-3), setterTerminUhrzeit: "10:00" })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("wiederholt die Wartezeit nicht, die steht in der Liste schon an der Telefonnummer", () => {
    const { container } = render(
      <NaechsterSchritt kunde={kunde({ verstecktBis: tageVoraus(4) })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
