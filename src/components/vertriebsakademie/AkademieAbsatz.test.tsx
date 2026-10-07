import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Wie in BegriffsText.test: eine kleine, feste Liste, damit der Test nicht an
// der Redaktion der echten Begriffsliste hängt.
vi.mock("@/lib/akademieBegriffe", () => ({
  AKADEMIE_BEGRIFFE: [
    {
      begriff: "Tilgung",
      erklaerung: "Der Teil der Rate, der die Schuld verkleinert.",
    },
    {
      begriff: "Zinsbindung",
      erklaerung: "Die Zeit, für die der Sollzins fest steht.",
    },
  ],
}));

import { AkademieAbsatz } from "./AkademieAbsatz";
import { findeBegriffe } from "@/lib/akademieBegriffeErkennung";
import { AKADEMIE_BEGRIFFE } from "@/lib/akademieBegriffe";
import { ABSATZ_SCHWELLE } from "@/lib/akademieAbsatzKuerzung";

/**
 * Ein Absatz über der Schwelle. „Tilgung" steht bewusst ganz vorne und
 * „Zinsbindung" ganz hinten, damit der Test beide Seiten des Schnitts prüft.
 */
const langerAbsatz =
  "Die Tilgung ist der Teil deiner monatlichen Rate, mit dem du den Kredit tatsächlich zurückzahlst. " +
  "Sie wächst mit jedem Jahr, weil der Zinsanteil sinkt und die Rate gleich bleibt. " +
  "Das ist der Grund, warum die letzten Jahre einer Finanzierung so viel schneller gehen als die ersten. " +
  "Genau deshalb lohnt es sich, dem Kunden den Verlauf einmal in Ruhe aufzuzeichnen, statt ihn nur zu behaupten. " +
  "Wer den Verlauf einmal gesehen hat, fragt im Termin nicht mehr danach, sondern rechnet von selbst weiter. " +
  "Die Zinsbindung dagegen sagt nur, wie lange der vereinbarte Zinssatz gilt, und nichts über das Tempo. " +
  "Beides zusammen entscheidet über die Restschuld am Ende, und genau darüber stolpert dein Kunde als Erstes.";

const kurzerAbsatz = "Die Tilgung verkleinert die Schuld.";

function zeige(text: string) {
  const segmente = findeBegriffe(text, AKADEMIE_BEGRIFFE);
  return render(
    <MemoryRouter>
      <AkademieAbsatz segmente={segmente} />
    </MemoryRouter>,
  );
}

describe("AkademieAbsatz", () => {
  it("der Testabsatz liegt wirklich über der Schwelle", () => {
    expect(langerAbsatz.length).toBeGreaterThan(ABSATZ_SCHWELLE);
    expect(kurzerAbsatz.length).toBeLessThan(ABSATZ_SCHWELLE);
  });

  it("zeigt einen kurzen Absatz vollständig und ohne Knopf", () => {
    const { container } = zeige(kurzerAbsatz);
    expect(container.textContent).toBe(kurzerAbsatz);
    expect(screen.queryByRole("button", { name: "Weiterlesen" })).toBeNull();
  });

  it("zeigt von einem langen Absatz zuerst nur den Anfang", () => {
    const { container } = zeige(langerAbsatz);
    const sichtbar = container.textContent ?? "";
    expect(sichtbar.length).toBeLessThan(langerAbsatz.length);
    expect(sichtbar).toContain("Die Tilgung ist der Teil deiner monatlichen Rate");
    expect(sichtbar).not.toContain("nimmt der Frage die Schärfe");
    expect(screen.getByRole("button", { name: "Weiterlesen" })).toBeInTheDocument();
  });

  it("zeigt nach dem Klick den vollständigen Absatz, Zeichen für Zeichen", () => {
    const { container } = zeige(langerAbsatz);
    fireEvent.click(screen.getByRole("button", { name: "Weiterlesen" }));
    expect(container.textContent).toBe(langerAbsatz + " Weniger");
    // und wieder zu
    fireEvent.click(screen.getByRole("button", { name: "Weniger" }));
    expect(container.textContent).not.toBe(langerAbsatz + " Weniger");
  });

  it("meldet den Zustand an Hilfsmittel", () => {
    zeige(langerAbsatz);
    const knopf = screen.getByRole("button", { name: "Weiterlesen" });
    expect(knopf).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(knopf);
    expect(screen.getByRole("button", { name: "Weniger" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Kürzung und Begriffserkennung stören einander nicht", () => {
  it("der Begriff im sichtbaren Anfang bleibt anklickbar", () => {
    zeige(langerAbsatz);
    const marke = screen.getByRole("button", { name: /Begriff erklären: Tilgung/ });
    fireEvent.click(marke);
    expect(screen.getByText("Der Teil der Rate, der die Schuld verkleinert.")).toBeInTheDocument();
  });

  it("ein Begriff aus dem verborgenen Teil erscheint erst nach dem Aufklappen", () => {
    zeige(langerAbsatz);
    expect(screen.queryByRole("button", { name: /Begriff erklären: Zinsbindung/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Weiterlesen" }));
    expect(screen.getByRole("button", { name: /Begriff erklären: Zinsbindung/ })).toBeInTheDocument();
  });

  it("markiert jeden Begriff auch nach dem Aufklappen nur einmal", () => {
    zeige(langerAbsatz);
    fireEvent.click(screen.getByRole("button", { name: "Weiterlesen" }));
    expect(screen.getAllByRole("button", { name: /Begriff erklären: Tilgung/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Begriff erklären: Zinsbindung/ })).toHaveLength(1);
  });

  it("setzt die Markierung nicht mitten in ein Wort", () => {
    zeige(langerAbsatz);
    const marke = screen.getByRole("button", { name: /Begriff erklären: Tilgung/ });
    expect(marke.textContent).toBe("Tilgung");
  });
});
