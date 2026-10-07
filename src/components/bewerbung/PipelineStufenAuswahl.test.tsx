/**
 * Der Wächter über der Pipelineanzeige im Bewerberarbeitsplatz.
 *
 * Auf dem Handy war die Kachelreihe der Grund für die Beschwerde: dreizehn
 * Stufen in einem Raster mit zwei Spalten, also sieben Reihen, bevor überhaupt
 * ein Bewerber zu sehen war. Seitdem gibt es dort ein Auswahlfeld.
 *
 * Geprüft wird deshalb genau die Trennung: Das Auswahlfeld gehört dem Handy
 * (`sm:hidden`), die Kacheln gehören dem Rechner (`hidden sm:flex`). jsdom
 * rechnet keine Medienabfragen aus, also steht hier die Klasse selbst im Test.
 * Das ist Absicht: Fiele das `hidden` weg, stünden auf dem Handy wieder beide
 * Darstellungen untereinander, und das war der Fehler.
 *
 * Geprüft wird außerdem, dass im Auswahlfeld wirklich jede Stufe mit ihrer
 * Anzahl steht. Eine vergessene Stufe fällt in einem geschlossenen Menü
 * niemandem auf.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PipelineStufenAuswahl, type PipelineStufeEintrag } from "./PipelineStufenAuswahl";

// Radix arbeitet mit Zeigerereignissen, die jsdom nicht kennt. Ohne diese
// Attrappen wirft schon das Oeffnen des Menues.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const STUFEN: PipelineStufeEintrag[] = [
  { wert: "alle", label: "Alle", anzahl: 240, farbe: "bg-foreground/70" },
  { wert: "Eingang", label: "Eingang", anzahl: 203, farbe: "bg-blue-500" },
  { wert: "Erstgespraech", label: "Videocall", anzahl: 12, farbe: "bg-yellow-500" },
  { wert: "Abgelehnt", label: "Abgelehnt", anzahl: 25, farbe: "bg-red-500" },
];

function Aufbau({ start = "alle", onWaehlen }: { start?: string; onWaehlen?: (w: string) => void }) {
  const [wert, setWert] = useState(start);
  return (
    <PipelineStufenAuswahl
      stufen={STUFEN}
      aktiv={wert}
      onWaehlen={w => {
        setWert(w);
        onWaehlen?.(w);
      }}
    />
  );
}

/** Ueber die Tastatur, weil jsdom keine echten Zeigerereignisse liefert. */
function menueOeffnen() {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Pipelinestufe" }), { key: "Enter" });
}

describe("PipelineStufenAuswahl", () => {
  it("zeigt auf dem Handy das Auswahlfeld und nicht die Kacheln", () => {
    render(<Aufbau />);

    // Das Auswahlfeld ist da und verschwindet erst ab der Breite `sm`.
    const auswahl = screen.getByTestId("pipeline-auswahl");
    expect(auswahl).toHaveClass("sm:hidden");
    expect(screen.getByRole("combobox", { name: "Pipelinestufe" })).toBeInTheDocument();

    // Die Kacheln sind auf dem Handy ausgeblendet und kommen erst ab `sm`.
    const kacheln = screen.getByTestId("pipeline-kacheln");
    expect(kacheln).toHaveClass("hidden");
    expect(kacheln).toHaveClass("sm:flex");
  });

  it("nennt im geschlossenen Feld die aktive Stufe mit ihrer Anzahl", () => {
    render(<Aufbau start="Eingang" />);

    const feld = screen.getByRole("combobox", { name: "Pipelinestufe" });
    expect(feld).toHaveTextContent("Eingang");
    expect(feld).toHaveTextContent("(203)");
  });

  it("stellt jede Stufe mit ihrer Anzahl im Menue bereit", () => {
    render(<Aufbau />);
    menueOeffnen();

    for (const stufe of STUFEN) {
      expect(screen.getByRole("option", { name: `${stufe.label} (${stufe.anzahl})` })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("option")).toHaveLength(STUFEN.length);
  });

  it("meldet die im Menue gewaehlte Stufe nach aussen", () => {
    const gewaehlt = vi.fn();
    render(<Aufbau onWaehlen={gewaehlt} />);
    menueOeffnen();
    fireEvent.click(screen.getByRole("option", { name: "Videocall (12)" }));

    expect(gewaehlt).toHaveBeenCalledWith("Erstgespraech");
  });

  it("behaelt die Farbe jeder Stufe als Punkt, damit sie nicht verlorengeht", () => {
    render(<Aufbau />);
    menueOeffnen();

    const eintrag = screen.getByRole("option", { name: "Eingang (203)" });
    expect(eintrag.querySelector(".bg-blue-500")).not.toBeNull();
  });

  it("laesst die Kacheln auf dem Rechner unveraendert klickbar", () => {
    const gewaehlt = vi.fn();
    render(<Aufbau onWaehlen={gewaehlt} />);

    const kacheln = screen.getByTestId("pipeline-kacheln");
    const abgelehnt = Array.from(kacheln.children).find(el => el.textContent?.includes("Abgelehnt"));
    fireEvent.click(abgelehnt as Element);

    expect(gewaehlt).toHaveBeenCalledWith("Abgelehnt");
  });
});
