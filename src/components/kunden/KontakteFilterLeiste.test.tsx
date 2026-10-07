import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  KONTAKTE_FILTER_STANDARD,
  KontakteFilterLeiste,
  zaehleGesetzteFilter,
  type KontakteFilterWerte,
} from "./KontakteFilterLeiste";

/**
 * Die Leiste über "Alle Kontakte", ohne die große Seite drumherum.
 *
 * Geprüft wird, was man sehen kann: dass der Filterbereich zugeklappt beginnt,
 * dass der Knopf die Zahl der gesetzten Filter trägt, dass Zähler, Chips und
 * das Zurücksetzen auch bei zugeklapptem Bereich dastehen, und dass Auswahl
 * und Suche des Vertriebspartners ein einziges Feld sind.
 */

beforeAll(() => {
  /*
   * Radix legt sein Popover mit floating-ui aus, und das misst mit einem
   * ResizeObserver. jsdom kennt beides nicht. Ein leerer Beobachter genügt:
   * Wir prüfen den Inhalt, nicht die Position. Dasselbe gilt für
   * scrollIntoView, das die Command-Liste beim Markieren aufruft.
   */
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

const STUFEN = [
  { key: "neuer_lead", label: "Neuer Lead" },
  { key: "erstgespraech", label: "Erstgespräch" },
] as const;

function zeige(werte: Partial<KontakteFilterWerte> = {}, extra: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const onZuruecksetzen = vi.fn();
  render(
    <KontakteFilterLeiste
      werte={{ ...KONTAKTE_FILTER_STANDARD, ...werte }}
      onChange={onChange}
      onZuruecksetzen={onZuruecksetzen}
      stufenOptionen={STUFEN}
      stufenCounts={{ neuer_lead: 3, erstgespraech: 1 }}
      kategorieCounts={{ alle: 7, Kontakt: 4, Neukunde: 1, Abwicklung: 1, Bestandskunde: 1 }}
      beraterListe={["Anna Meyer", "Bernd Vogl"]}
      zeigeBeraterFilter
      gezeigt={4}
      gesamt={7}
      {...extra}
    />,
  );
  return { onChange, onZuruecksetzen };
}

const knopf = () => screen.getByTestId("kontakte-filter-aufklapp");

describe("KontakteFilterLeiste, der Knopf Filter", () => {
  it("beginnt zugeklappt, Ansicht, Rolle, Stufe und Typ sind nicht zu sehen", () => {
    zeige();
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Ansicht:")).toBeNull();
    expect(screen.queryByText("Rolle:")).toBeNull();
    expect(screen.queryByText("Stufe:")).toBeNull();
    expect(screen.queryByText("Typ:")).toBeNull();
  });

  it("klappt auf Klick auf und beim zweiten Klick wieder zu", () => {
    zeige();
    fireEvent.click(knopf());
    expect(knopf()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ansicht:")).toBeInTheDocument();
    expect(screen.getByText("Rolle:")).toBeInTheDocument();
    expect(screen.getByText("Stufe:")).toBeInTheDocument();
    expect(screen.getByText("Typ:")).toBeInTheDocument();
    // Die drei Haken liegen ebenfalls hinter dem Knopf.
    expect(screen.getByText("Nur meine")).toBeInTheDocument();

    fireEvent.click(knopf());
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Ansicht:")).toBeNull();
  });

  it("trägt ohne gesetzten Filter keine Zahl", () => {
    zeige();
    expect(knopf()).toHaveAccessibleName("Filter");
  });

  it("sagt am zugeklappten Knopf, wie viele Filter gesetzt sind", () => {
    zeige({ kategorie: "Neukunde", nurMeine: true });
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    expect(knopf()).toHaveAccessibleName("Filter, 2 gesetzt");
    expect(knopf()).toHaveTextContent("2");
  });

  it("zählt mehrere Stufen als einen Filter", () => {
    expect(
      zaehleGesetzteFilter({ ...KONTAKTE_FILTER_STANDARD, stufen: ["neuer_lead", "erstgespraech"] }),
    ).toBe(1);
  });

  it("zählt Suche, Partner und Abgelegtes nicht mit, die stehen sichtbar oben", () => {
    zeige({ suche: "Meyer", berater: "Anna Meyer", abgelegte: true });
    expect(knopf()).toHaveAccessibleName("Filter");
  });
});

describe("KontakteFilterLeiste, was auch zugeklappt sichtbar bleibt", () => {
  it("nennt weiter, wie viele Kontakte von wie vielen angezeigt werden", () => {
    zeige({ kategorie: "Neukunde" });
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("kontakte-filter-zaehler")).toHaveTextContent("4 von 7 Kontakten");
  });

  it("nennt jeden versteckten Filter als Chip beim Namen", () => {
    zeige({ kategorie: "Neukunde", stufen: ["neuer_lead"], typ: "lead", ohneTermin: true });
    expect(screen.getByRole("button", { name: "Filter aufheben: Neukunde" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter aufheben: Neuer Lead" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter aufheben: Leads der Gesellschaft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter aufheben: Ohne Termin" })).toBeInTheDocument();
  });

  it("nimmt über den Chip genau diesen einen Filter zurück", () => {
    const { onChange } = zeige({ kategorie: "Neukunde", stufen: ["neuer_lead", "erstgespraech"] });
    fireEvent.click(screen.getByRole("button", { name: "Filter aufheben: Neuer Lead" }));
    expect(onChange).toHaveBeenCalledWith({ stufen: ["erstgespraech"] });
  });

  it("lässt das Zurücksetzen erreichbar, ohne den Knopf zu öffnen", () => {
    const { onZuruecksetzen } = zeige({ stufen: ["neuer_lead"] });
    expect(knopf()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Alle Filter zurücksetzen" }));
    expect(onZuruecksetzen).toHaveBeenCalled();
  });

  it("bietet das Zurücksetzen auch bei einer nur sichtbaren Einschränkung an", () => {
    zeige({ abgelegte: true });
    expect(screen.getByRole("button", { name: "Alle Filter zurücksetzen" })).toBeInTheDocument();
  });

  it("zeigt ohne jeden Filter keinen Knopf zum Zurücksetzen", () => {
    zeige();
    expect(screen.queryByRole("button", { name: "Alle Filter zurücksetzen" })).toBeNull();
  });

  it("lässt Kontaktsuche und den Haken für Verlorene und Archivierte immer stehen", () => {
    const { onChange } = zeige();
    const suche = screen.getByLabelText("Kontakte suchen");
    fireEvent.change(suche, { target: { value: "Vogl" } });
    expect(onChange).toHaveBeenCalledWith({ suche: "Vogl" });

    fireEvent.click(screen.getByLabelText("Verlorene & Archivierte"));
    expect(onChange).toHaveBeenCalledWith({ abgelegte: true });
  });
});

describe("KontakteFilterLeiste, Vertriebspartner als ein Feld", () => {
  it("führt Auswahl und Suche in einem Bedienelement zusammen", () => {
    const { onChange } = zeige();
    const feld = screen.getByTestId("kontakte-partner-auswahl");
    expect(feld).toHaveTextContent("Alle Vertriebspartner");
    // Zwei getrennte Felder gibt es nicht mehr.
    expect(screen.queryByLabelText("Vertriebspartner suchen")).toBeNull();

    fireEvent.click(feld);
    const suche = screen.getByPlaceholderText("Partner suchen...");
    fireEvent.change(suche, { target: { value: "vogl" } });

    const treffer = screen.getByRole("option", { name: /Bernd Vogl/ });
    expect(screen.queryByRole("option", { name: /Anna Meyer/ })).toBeNull();
    fireEvent.click(treffer);
    expect(onChange).toHaveBeenCalledWith({ berater: "Bernd Vogl" });
  });

  it("zeigt den gewählten Partner am Feld an", () => {
    zeige({ berater: "Anna Meyer" });
    expect(screen.getByTestId("kontakte-partner-auswahl")).toHaveTextContent("Anna Meyer");
  });

  it("erscheint gar nicht, wenn die Rolle den Partnerfilter nicht sehen darf", () => {
    zeige({}, { zeigeBeraterFilter: false });
    expect(screen.queryByTestId("kontakte-partner-auswahl")).toBeNull();
    // Die Kontaktsuche bleibt für alle Rollen.
    expect(screen.getByLabelText("Kontakte suchen")).toBeInTheDocument();
  });
});

describe("KontakteFilterLeiste, die Auswahlfelder hinter dem Knopf", () => {
  it("meldet die gewählte Ansicht an die Seite", () => {
    const { onChange } = zeige();
    fireEvent.click(knopf());
    fireEvent.click(screen.getByText("Ansicht:"));
    const fach = screen.getByText("⏰ Jetzt anrufbar");
    fireEvent.click(fach);
    expect(onChange).toHaveBeenCalledWith({ preset: "anrufbar" });
  });

  it("wählt eine Stufe an und wieder ab", () => {
    const { onChange } = zeige({ stufen: ["neuer_lead"] });
    fireEvent.click(knopf());
    fireEvent.click(screen.getByText("Stufe:"));
    const auswahl = screen.getByRole("dialog");
    fireEvent.click(within(auswahl).getByText("Erstgespräch"));
    expect(onChange).toHaveBeenCalledWith({ stufen: ["neuer_lead", "erstgespraech"] });
  });
});
