import { render, screen } from "@testing-library/react";
import { KundenprofilAbschnitt } from "./KundenprofilAbschnitt";

function Beispiel() {
  return (
    <KundenprofilAbschnitt
      kopf={<h3 className="font-bold mb-4">Reservierung</h3>}
      kopfZusatz={<button type="button">Termin vereinbaren</button>}
    >
      <p>Inhalt der Reservierung</p>
    </KundenprofilAbschnitt>
  );
}

/*
 * Christian am 29.09.2026: Im Investment steht jeder Abschnitt immer offen,
 * fuer alle Rollen, und laesst sich nicht mehr zuklappen.
 */
it("zeigt Überschrift und Inhalt ohne Klick", () => {
  render(<Beispiel />);
  expect(screen.getByRole("heading", { name: "Reservierung" })).toBeInTheDocument();
  expect(screen.getByText("Inhalt der Reservierung")).toBeVisible();
});

it("hat keinen Klappknopf mehr", () => {
  const { container } = render(<Beispiel />);
  // Der einzige Knopf ist der Terminknopf aus dem Zusatz.
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Termin vereinbaren"]);
  expect(screen.queryByRole("button", { name: "Reservierung" })).not.toBeInTheDocument();
  expect(container.querySelector("[aria-expanded]")).toBeNull();
});

/*
 * Christian am 23.09.2026: Die Gespraechsknoepfe stehen IMMER unter der
 * Ueberschrift, nie daneben. jsdom rechnet kein Layout, geprueft wird deshalb
 * der Aufbau.
 */
it("stellt den Knopf in eine eigene Reihe unter die Überschrift", () => {
  render(<Beispiel />);
  const ueberschrift = screen.getByRole("heading", { name: "Reservierung" });
  const zusatz = screen.getByRole("button", { name: "Termin vereinbaren" });
  const reihe = zusatz.closest("[data-kopf-zusatz]") as HTMLElement;

  expect(ueberschrift.compareDocumentPosition(zusatz) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(reihe).not.toBeNull();
  expect(reihe.previousElementSibling).toBe(ueberschrift);
  // Die Reihe darf ihren Knopf umbrechen lassen, siehe kundenprofil.css.
  expect(reihe).toHaveClass("kundenprofil-kartenaktionen");
});

it("legt ohne Zusatz keine leere Reihe an", () => {
  const { container } = render(
    <KundenprofilAbschnitt kopf={<h3 className="font-bold mb-4">Notar</h3>}>
      <p>Inhalt</p>
    </KundenprofilAbschnitt>,
  );
  expect(container.querySelector("[data-kopf-zusatz]")).toBeNull();
});
