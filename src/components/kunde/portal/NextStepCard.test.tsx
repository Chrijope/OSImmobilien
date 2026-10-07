import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { HERVORHEBUNG_ATTRIBUT, hervorhebungBeenden } from "@/hooks/useAbschnittHervorheben";
import { NextStepCard } from "./NextStepCard";

const scrollIntoView = vi.fn();

function Adresse() {
  const ort = useLocation();
  return <div data-testid="adresse">{ort.pathname + ort.search}</div>;
}

/** Attrappe der Detailseite: der Kasten und darunter die Phasen-Kästchen. */
function Detailseite({ stufe, mitKaestchen = true }: { stufe: string; mitKaestchen?: boolean }) {
  return (
    <MemoryRouter initialEntries={["/kunde/investments?tab=moreimmo&inv=inv-7"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <NextStepCard pipelineStufe={stufe} investmentId="inv-7" />
              {mitKaestchen && (
                <>
                  <div id="section-bonitaetsunterlagen"><h3>Bonität</h3></div>
                  <div id="section-reservierung"><h3>Reservierung</h3></div>
                </>
              )}
              <Adresse />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("NextStepCard: Knopf springt zum passenden Kästchen", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });
  beforeEach(() => {
    vi.useFakeTimers();
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    hervorhebungBeenden();
    vi.useRealTimers();
  });

  it("Bonität: scrollt zum Kästchen, rahmt es drei Sekunden und bleibt auf der Seite", () => {
    render(<Detailseite stufe="bonitaetsunterlagen" />);
    const kaestchen = document.getElementById("section-bonitaetsunterlagen")!;
    const vorher = screen.getByTestId("adresse").textContent;

    fireEvent.click(screen.getAllByText("Jetzt fortfahren")[0]);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(kaestchen).toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
    expect(document.getElementById("section-reservierung")).not.toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
    // Kein Seitenwechsel mehr: Vorher führte der Knopf in den Kundenordner.
    expect(screen.getByTestId("adresse").textContent).toBe(vorher);

    act(() => vi.advanceTimersByTime(3000));
    expect(kaestchen).not.toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
  });

  it("Selbstauskunft springt ebenfalls zu Bonität", () => {
    render(<Detailseite stufe="selbstauskunft" />);
    fireEvent.click(screen.getAllByText("Jetzt fortfahren")[0]);
    expect(document.getElementById("section-bonitaetsunterlagen")).toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
  });

  it("steht das Kästchen nicht auf der Seite, öffnet der Knopf die Detailseite mit Anker", () => {
    render(<Detailseite stufe="reservierung" mitKaestchen={false} />);
    fireEvent.click(screen.getAllByText("Jetzt fortfahren")[0]);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("adresse").textContent).toBe(
      "/kunde/investments?tab=moreimmo&inv=inv-7&highlight=reservierung",
    );
  });

  it("ohne Ziel (Kauf abgeschlossen) erscheint der Kasten gar nicht, ohne Fehler", () => {
    expect(() => render(<Detailseite stufe="abgeschlossen" />)).not.toThrow();
    expect(screen.queryByText("Jetzt fortfahren")).toBeNull();
  });

  it("ohne Investment-Kennung bleibt der bisherige Verweis", () => {
    render(
      <MemoryRouter>
        <NextStepCard pipelineStufe="bonitaetsunterlagen" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/kunde/kundenordner");
  });
});
