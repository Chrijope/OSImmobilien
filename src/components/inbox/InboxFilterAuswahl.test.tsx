/**
 * Der Waechter ueber der Inbox-Filterauswahl.
 *
 * Die sieben Filter lagen frueher offen als Knopfleiste in der Zeile, jeder war
 * ohne Klick sichtbar. Im Auswahlmenue sieht man sie erst nach dem Oeffnen, ein
 * vergessener Eintrag faellt dort niemandem auf. Deshalb wird hier geprueft,
 * dass wirklich alle Filter im Menue stehen und dass die Adresse `?art=...` aus
 * dem Dashboard weiterhin auf einen echten Filter zeigt.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { ART_ZU_FILTER, FILTER_MAP, FILTER_NAMEN, InboxFilterAuswahl } from "./InboxFilterAuswahl";

// Radix arbeitet mit Zeigerereignissen, die jsdom nicht kennt. Ohne diese
// Attrappen wirft schon das Oeffnen des Menues.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function Aufbau({ start = "Alle" }: { start?: string }) {
  const [wert, setWert] = useState(start);
  return <InboxFilterAuswahl wert={wert} onWert={setWert} />;
}

function feld() {
  return screen.getByRole("combobox", { name: "Filter" });
}

/** Ueber die Tastatur, weil jsdom keine echten Zeigerereignisse liefert. */
function menueOeffnen() {
  fireEvent.keyDown(feld(), { key: "Enter" });
}

describe("Inbox-Filterauswahl", () => {
  it("zeigt den gewaehlten Filter, ohne dass man das Menue oeffnen muss", () => {
    render(<Aufbau start="Aufgaben" />);
    expect(feld()).toHaveTextContent("Aufgaben");
  });

  it("stellt alle sieben Filter im Menue bereit", () => {
    render(<Aufbau />);
    menueOeffnen();

    for (const name of FILTER_NAMEN) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("option")).toHaveLength(Object.keys(FILTER_MAP).length);
  });

  it("meldet die Auswahl nach aussen", () => {
    render(<Aufbau />);
    menueOeffnen();
    fireEvent.click(screen.getByRole("option", { name: "Anrufe & Termine" }));

    expect(feld()).toHaveTextContent("Anrufe & Termine");
  });

  it("uebernimmt jede Art aus der Adresse als vorhandenen Filter", () => {
    // Das Dashboard springt mit /inbox?art=aufgabe hierher. Zeigt die Zuordnung
    // auf einen Namen, den es im Menue nicht gibt, bliebe die Liste ungefiltert.
    for (const [art, name] of Object.entries(ART_ZU_FILTER)) {
      expect(FILTER_NAMEN, `Art ${art}`).toContain(name);
    }
    // Die drei Sprungziele aus dem Dashboard namentlich, damit ein Umbenennen
    // dort hier auffaellt und nicht erst beim Klick auf die Kachel.
    expect(ART_ZU_FILTER.follow_up).toBe("Follow-Ups");
    expect(ART_ZU_FILTER.aufgabe).toBe("Aufgaben");
    expect(ART_ZU_FILTER.termine).toBe("Anrufe & Termine");
  });
});
