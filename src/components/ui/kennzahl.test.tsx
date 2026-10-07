/**
 * Der Baustein selbst ist klein, aber er traegt die Haken, an denen das neue
 * Design haengt. Verschwindet einer davon, sieht die Kachel im neuen Design
 * wieder aus wie im alten, ohne dass irgendetwas bricht. Genau solche
 * stillen Ausfaelle sollen diese Tests fangen.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Kennzahl } from "./kennzahl";

describe("Kennzahlkachel", () => {
  it("zeigt Beschriftung, Wert und Zusatz", () => {
    render(<Kennzahl label="Notartermine" wert="4" zusatz="nächster am 16.09." />);
    expect(screen.getByText("Notartermine")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("nächster am 16.09.")).toBeInTheDocument();
  });

  it("traegt die Haken, an denen das neue Design ansetzt", () => {
    const { container } = render(<Kennzahl label="Umsatz" wert="1.250.000 €" zusatz="mehr" ton="gut" />);
    expect(container.querySelector('[data-ui="kennzahl"]')).not.toBeNull();
    expect(container.querySelector('[data-ui="kennzahl-label"]')).not.toBeNull();
    expect(container.querySelector('[data-ui="kennzahl-wert"]')).not.toBeNull();
    expect(container.querySelector('[data-ui="kennzahl-zusatz"]')).not.toBeNull();
    // Der Ton steht am Rahmen, damit die Regel fuer den Zusatz ihn von dort
    // lesen kann, ohne dass der Zusatz selbst eine Tonklasse braucht.
    expect(container.querySelector('[data-ton="gut"]')).not.toBeNull();
  });

  it("laesst den Zusatz weg, wenn es keinen gibt", () => {
    const { container } = render(<Kennzahl label="Leads" wert="0" />);
    expect(container.querySelector('[data-ui="kennzahl-zusatz"]')).toBeNull();
  });

  it("reicht die Tarnklasse des Vorfuehrmodus an Wert und Zusatz durch", () => {
    const { container } = render(
      <Kennzahl label="Umsatz" wert="1.250.000 €" zusatz="mehr" wertClassName="vorfuehr-unscharf" zusatzClassName="vorfuehr-unscharf" />,
    );
    expect(container.querySelector('[data-ui="kennzahl-wert"]')?.className).toContain("vorfuehr-unscharf");
    expect(container.querySelector('[data-ui="kennzahl-zusatz"]')?.className).toContain("vorfuehr-unscharf");
  });

  it("faerbt den Wert im alten Design weiterhin nach dem Ton", () => {
    // Ohne den Regler bleibt die Kachel so, wie das Dashboard sie heute zeigt.
    // Das neue Design hebt die Farbe erst in der CSS-Schicht wieder auf.
    const { container } = render(<Kennzahl label="Offen" wert="7" ton="warn" />);
    expect(container.querySelector('[data-ui="kennzahl-wert"]')?.className).toContain("text-destructive");
  });
});
