import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkNichtMehrGueltig } from "./LinkNichtMehrGueltig";

/** Die Ablaufseite nennt, was der Link war: Exposé oder Objektübersicht. */
describe("LinkNichtMehrGueltig", () => {
  it("spricht ohne Angabe vom Exposé, wie bisher", () => {
    render(<LinkNichtMehrGueltig />);
    expect(screen.getByTestId("link-nicht-mehr-gueltig")).toHaveTextContent("Der persönliche Link zu deinem Exposé ist abgelaufen.");
  });

  it("spricht bei der Objektübersicht von der Objektübersicht, mit dem Partner als Ausweg", () => {
    render(<LinkNichtMehrGueltig art="objektuebersicht" ansprechpartner={{ name: "Paula Partner", rolle: "Dein Ansprechpartner", email: "paula@example.com" }} />);
    const seite = screen.getByTestId("link-nicht-mehr-gueltig");
    expect(seite).toHaveTextContent("Der persönliche Link zu deiner Objektübersicht ist abgelaufen.");
    expect(seite).not.toHaveTextContent("Exposé");
    expect(screen.getByTestId("abgelaufen-email")).toHaveAttribute("href", "mailto:paula@example.com");
  });

  it("sagt bei der abgeschalteten Objektvorstellung, dass es sie nicht mehr gibt", () => {
    render(<LinkNichtMehrGueltig art="objektvorstellung" />);
    const seite = screen.getByTestId("link-nicht-mehr-gueltig");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Diese Objektvorstellung ist nicht mehr verfügbar");
    expect(seite).toHaveTextContent("Dein Ansprechpartner schickt dir gern die aktuelle Objektübersicht.");
    expect(seite).not.toHaveTextContent("abgelaufen");
    expect(screen.getByTestId("abgelaufen-email")).toHaveAttribute("href", "mailto:os@os-immobilien.com");
  });
});
