import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Buehne } from "./Buehne";

/**
 * Der dunkle Grund der Seiten ohne Anmeldung.
 *
 * Am 21.09.2026 endete er auf der Terminseite des Kennenlerngesprächs mitten
 * auf der Seite, darunter stand ein weißer Streifen mit der Fußzeile darin.
 * Ursache war nicht die Bühne selbst, sondern ihr Platz: Sie hängt in
 * `App.tsx` unmittelbar in `<main className="flex h-screen flex-col">`. Ein
 * Flex-Kind schrumpft von sich aus bis auf seine Mindesthöhe, der Grund blieb
 * also bei einer Fensterhöhe stehen, während der Inhalt weiterwuchs.
 *
 * Deshalb hier zwei Wächter. Sie prüfen nicht, wie es aussieht, sondern dass
 * die beiden Angaben nicht wieder verschwinden.
 */

function wurzel(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <Buehne>
        <div>Inhalt</div>
      </Buehne>
    </MemoryRouter>,
  );
  return container.firstElementChild as HTMLElement;
}

describe("Die Bühne trägt den Grund über die ganze Seite", () => {
  it("schrumpft nicht, wenn sie in einer Flex-Spalte steht", () => {
    expect(wurzel().className).toContain("shrink-0");
  });

  it("nennt eine Mindesthöhe und keine feste Höhe", () => {
    // Eine feste Höhe schnitte den Grund ab, sobald der Inhalt länger ist.
    const klassen = wurzel().className;
    expect(klassen).toContain("min-h-[100dvh]");
    expect(klassen).not.toContain(" h-[100dvh]");
  });
});
