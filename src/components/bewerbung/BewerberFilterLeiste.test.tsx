import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BewerberFilterLeer, BewerberFilterLeiste } from "./BewerberFilterLeiste";
import {
  FILTER_STANDARD,
  zaehleFilterwerte,
  type BewerberFilter,
  type FilterBewerber,
} from "@/lib/bewerberFilter";

/**
 * Die Leiste selbst, ohne die große Seite drumherum.
 *
 * Geprüft wird nur, was man sehen kann: die Zahl „x von y", die Chips der
 * gesetzten Filter und der Knopf zum Zurücksetzen, der nur erscheint, wenn
 * überhaupt etwas eingeschränkt ist. Was ein Filter bedeutet, prüft
 * `bewerberFilter.test.ts`.
 */

const LISTE: FilterBewerber[] = [
  { id: "1", kennenlernbogenAusgefuellt: true, einstufung: "A", eingangsmailVerschickt: true, quelle: "Website" },
  { id: "2", kennenlernbogenAusgefuellt: false, einstufung: null, eingangsmailVerschickt: false, quelle: "Zapier" },
  { id: "3", kennenlernbogenAusgefuellt: false, einstufung: null, eingangsmailVerschickt: true, quelle: "Zapier" },
];

function zeige(filter: BewerberFilter, onChange = vi.fn()) {
  render(
    <BewerberFilterLeiste
      filter={filter}
      onChange={onChange}
      zaehlung={zaehleFilterwerte(LISTE, filter)}
      quellen={["Website", "Zapier"]}
      stellen={[]}
    />,
  );
  return onChange;
}

describe("BewerberFilterLeiste", () => {
  it("zeigt ohne gesetzten Filter alle Bewerber und keinen Knopf zum Zurücksetzen", () => {
    zeige(FILTER_STANDARD);
    expect(screen.getByTestId("bewerber-filter-zaehler")).toHaveTextContent("3 von 3 Bewerbern");
    expect(screen.queryByRole("button", { name: "Filter zurücksetzen" })).toBeNull();
  });

  it("zeigt den gesetzten Filter als Chip und wie viele übrig bleiben", () => {
    zeige({ ...FILTER_STANDARD, bogen: "offen" });
    expect(screen.getByTestId("bewerber-filter-zaehler")).toHaveTextContent("2 von 3 Bewerbern");
    // Der Chip trägt den Knopf zum Aufheben, die Auswahl darüber nicht.
    expect(screen.getByRole("button", { name: "Filter aufheben: Bogen noch offen" })).toBeInTheDocument();
  });

  it("nimmt über den Chip genau diesen einen Filter zurück", () => {
    const onChange = zeige({ ...FILTER_STANDARD, bogen: "offen", quelle: "Zapier" });
    fireEvent.click(screen.getByRole("button", { name: "Filter aufheben: Bogen noch offen" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bogen: "alle", quelle: "Zapier" }));
  });

  it("setzt über den Knopf alles zurück", () => {
    const onChange = zeige({ ...FILTER_STANDARD, bogen: "offen", quelle: "Zapier" });
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(onChange).toHaveBeenCalledWith(FILTER_STANDARD);
  });

  it("bietet den Weg zurück an, wenn der Filter alles weggenommen hat", () => {
    const zurueck = vi.fn();
    render(<BewerberFilterLeer onZuruecksetzen={zurueck} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(zurueck).toHaveBeenCalled();
  });

  it("zeigt am Schreibtisch keinen Aufklappknopf, die Auswahl steht offen da", () => {
    zeige(FILTER_STANDARD);
    expect(screen.queryByTestId("bewerber-filter-aufklapp")).toBeNull();
    expect(screen.getByText("Kennenlernbogen")).toBeInTheDocument();
  });
});

/**
 * Auf dem Handy wird aus dem Kasten ein Knopf.
 *
 * Die Breite entscheidet, siehe `useIsMobile`. In jsdom ist `innerWidth`
 * standardmäßig 1024, also Schreibtisch. Hier wird sie vor dem Aufbau auf eine
 * Handybreite gesetzt und danach zurückgestellt, damit die Tests darüber
 * unberührt bleiben.
 */
describe("BewerberFilterLeiste auf dem Handy", () => {
  const breiteVorher = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 390 });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: breiteVorher });
  });

  const knopf = () => screen.getByTestId("bewerber-filter-aufklapp");

  it("beginnt eingeklappt, die sechs Filter sind nicht zu sehen", () => {
    zeige(FILTER_STANDARD);
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Kennenlernbogen")).toBeNull();
    expect(screen.queryByText("Vorabscore")).toBeNull();
  });

  it("klappt auf Tipp aus und beim zweiten Tipp wieder ein", () => {
    zeige(FILTER_STANDARD);
    fireEvent.click(knopf());
    expect(knopf()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Kennenlernbogen")).toBeInTheDocument();

    fireEvent.click(knopf());
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Kennenlernbogen")).toBeNull();
  });

  it("sagt am eingeklappten Knopf, wie viele Filter gesetzt sind", () => {
    zeige({ ...FILTER_STANDARD, bogen: "offen", quelle: "Zapier" });
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    expect(knopf()).toHaveAccessibleName("Filter, 2 gesetzt");
    expect(knopf()).toHaveTextContent("2");
  });

  it("trägt ohne gesetzten Filter keine Zahl", () => {
    zeige(FILTER_STANDARD);
    expect(knopf()).toHaveAccessibleName("Filter");
  });

  it("lässt Zähler, Chips und das Zurücksetzen auch eingeklappt stehen", () => {
    const onChange = zeige({ ...FILTER_STANDARD, bogen: "offen", quelle: "Zapier" });
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    // Der einzige Hinweis, dass die Liste kürzer ist als die Wirklichkeit.
    expect(screen.getByTestId("bewerber-filter-zaehler")).toHaveTextContent("von 3 Bewerbern");
    expect(screen.getByRole("button", { name: "Filter aufheben: Bogen noch offen" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(onChange).toHaveBeenCalledWith(FILTER_STANDARD);
  });
});
