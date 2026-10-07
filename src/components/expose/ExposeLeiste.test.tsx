import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExposeLeiste } from "./ExposeLeiste";
import { springeZuAbschnitt } from "./useAktiverAbschnitt";
import { EXPOSE_ABSCHNITTE, EXPOSE_ABSCHNITTE_ANZAHL, abschnittAnker } from "@/lib/exposeInhalt";

/**
 * Die Abschnittsleiste: elf Abschnitte in fester Reihenfolge, Zähler
 * „2 / 11", Sprungmarken und der PDF-Knopf mit Ladezustand.
 */
describe("Abschnittsleiste", () => {
  it("kennt elf Abschnitte; „Nächste Schritte“ steckt seit dem 01.10.2026 im Zeitplan", () => {
    expect(EXPOSE_ABSCHNITTE_ANZAHL).toBe(11);
    expect(EXPOSE_ABSCHNITTE.map((a) => a.id)).toEqual([
      "start", "standort", "mikrolage", "objektdaten", "grundriss", "wirtschaftlichkeit",
      "verwaltung", "zeitplan", "chancen-risiken", "rechtliches", "kontakt",
    ]);
    expect(EXPOSE_ABSCHNITTE.map((a) => a.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(abschnittAnker("standort")).toBe("expose-standort");
  });

  it("zeigt den Zähler zum aktiven Abschnitt und markiert ihn", () => {
    render(<ExposeLeiste aktiv="standort" onSpringen={() => undefined} titel="Exposé · Wohnung 7" adresse="Musterstraße 12, 86150 Augsburg" />);
    expect(screen.getByTestId("leiste-zaehler")).toHaveTextContent("Abschnitt 2 / 11");
    expect(screen.getByTestId("kopf-zaehler")).toHaveTextContent("Abschnitt 2 von 11");
    expect(screen.getByTestId("leiste-standort")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("leiste-start")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Musterstraße 12, 86150 Augsburg")).toBeInTheDocument();
  });

  it("ruft die Sprungmarke des angeklickten Abschnitts auf", () => {
    const springen = vi.fn();
    render(<ExposeLeiste aktiv="start" onSpringen={springen} titel="Exposé" adresse="Adresse" />);
    fireEvent.click(screen.getByTestId("leiste-objektdaten"));
    expect(springen).toHaveBeenCalledWith("objektdaten");
    fireEvent.click(screen.getByTestId("leiste-kontakt"));
    expect(springen).toHaveBeenCalledWith("kontakt");
  });

  it("springt zum Abschnitt über seine Kennung", () => {
    const ziel = document.createElement("section");
    ziel.id = abschnittAnker("zeitplan");
    ziel.scrollIntoView = vi.fn();
    document.body.appendChild(ziel);
    springeZuAbschnitt("zeitplan");
    expect(ziel.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    ziel.remove();
    // Ohne Ziel passiert nichts, auch kein Fehler.
    expect(() => springeZuAbschnitt("kontakt")).not.toThrow();
  });

  it("hält den PDF-Knopf ohne Freigabe deaktiviert", () => {
    render(<ExposeLeiste aktiv="start" onSpringen={() => undefined} titel="Exposé" adresse="Adresse" />);
    for (const knopf of screen.getAllByRole("button", { name: /Herunterladen PDF/ })) expect(knopf).toBeDisabled();
  });

  it("löst mit Freigabe den PDF-Download aus und zeigt während der Erzeugung den Ladezustand", () => {
    const onPdf = vi.fn();
    const { rerender } = render(<ExposeLeiste aktiv="start" onSpringen={() => undefined} titel="Exposé" adresse="Adresse" pdfAktiv onPdf={onPdf} />);
    const knoepfe = screen.getAllByRole("button", { name: /Herunterladen PDF/ });
    for (const knopf of knoepfe) expect(knopf).toBeEnabled();
    fireEvent.click(knoepfe[0]);
    expect(onPdf).toHaveBeenCalledTimes(1);

    rerender(<ExposeLeiste aktiv="start" onSpringen={() => undefined} titel="Exposé" adresse="Adresse" pdfAktiv onPdf={onPdf} pdfLaeuft />);
    for (const knopf of screen.getAllByRole("button", { name: /PDF wird erstellt/ })) expect(knopf).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Herunterladen PDF/ })).not.toBeInTheDocument();
  });
});
