import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ObjektdatenKarte } from "./ObjektdatenKarte";
import type { BefundRoh } from "../../../supabase/functions/_shared/nachtpruefung-objektdaten.ts";

const GERMERING = "8b6c91f5-33e7-44be-b503-a0ae0eaf5a2e";
const DELITZSCH = "b934913c-1c2c-4337-98c9-31d3106bf46b";

const befunde: BefundRoh[] = [
  {
    pruefung: "objektdaten_titel_plz",
    bereich: "OBJ",
    schwere: "warnung",
    anzahl: 1,
    meldung: "PLZ im Titel weicht vom Feld ab: 1 Objekt von 91, davon 1 neu seit dem letzten Lauf.",
    beispiele: [
      {
        objekt_id: GERMERING,
        titel: "13. Landsbergerstraße 22a, 82210 Germering",
        quelle: "investagon",
        detail: "Titel nennt PLZ 82210, im Feld steht 82110",
        aktion: "In Investagon korrigieren. Eine Änderung im CRM überschreibt der nächste Abgleich.",
        neu: true,
      },
    ],
  },
  {
    pruefung: "objektdaten_unterlagen",
    bereich: "FIN",
    schwere: "warnung",
    anzahl: 1,
    meldung: "Pflichtunterlagen für die Bank fehlen: 1 Objekt von 91, keines neu seit dem letzten Lauf.",
    beispiele: [
      {
        objekt_id: DELITZSCH,
        titel: "Bismarckstraße 39, 0409 Delitzsch",
        quelle: "crm",
        detail: "Es fehlt: Energieausweis",
        aktion: "Im CRM am Objekt hochladen.",
        neu: false,
      },
    ],
  },
  {
    pruefung: "objektdaten_ruecklage",
    bereich: "FIN",
    schwere: "hinweis",
    anzahl: 80,
    meldung: "Rücklage fehlt: bei 80 von 91 Objekten, davon 78 aus Investagon.",
    beispiele: [],
  },
  // Eine alte Prüfung mit Namen darf in dieser Karte nicht auftauchen.
  { pruefung: "kontakt_ohne_zustaendigen", bereich: null, schwere: "warnung", anzahl: 1, meldung: "x", beispiele: [{ name: "Erika Beispiel" }] },
];

function zeige(liste: BefundRoh[] = befunde) {
  return render(
    <MemoryRouter>
      <ObjektdatenKarte befunde={liste} />
    </MemoryRouter>,
  );
}

describe("ObjektdatenKarte", () => {
  it("zeigt je Objekt einen Eintrag, ohne Personen", () => {
    zeige();
    expect(screen.getByText("13. Landsbergerstraße 22a, 82210 Germering")).toBeInTheDocument();
    expect(screen.getByText("Bismarckstraße 39, 0409 Delitzsch")).toBeInTheDocument();
    expect(screen.getByText(/Rücklage fehlt: bei 80 von 91 Objekten/)).toBeInTheDocument();
    expect(screen.queryByText(/Erika/)).not.toBeInTheDocument();
  });

  it("führt aufgeklappt zur Objektseite und nennt, was zu tun ist", () => {
    zeige();
    fireEvent.click(screen.getByText("13. Landsbergerstraße 22a, 82210 Germering"));
    expect(screen.getByText("Titel nennt PLZ 82210, im Feld steht 82110")).toBeInTheDocument();
    expect(screen.getByText(/In Investagon korrigieren/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Zur Objektseite/ })).toHaveAttribute("href", `/objekte/${GERMERING}`);
  });

  it("filtert nach Bereich", () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /^FIN:/ }));
    expect(screen.queryByText("13. Landsbergerstraße 22a, 82210 Germering")).not.toBeInTheDocument();
    expect(screen.getByText("Bismarckstraße 39, 0409 Delitzsch")).toBeInTheDocument();
  });

  it("bleibt ohne Objektbefunde ganz weg", () => {
    const { container } = zeige([befunde[3]]);
    expect(container).toBeEmptyDOMElement();
  });
});
