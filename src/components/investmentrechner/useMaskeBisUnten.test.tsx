import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMaskeBisUnten } from "./useMaskeBisUnten";

/*
 * Die fixierte Eingabemaske reicht bis 16 px über den Fensterrand
 * (19.10.2026). Vorher schnitt die feste Höhe `100dvh - 7rem` das Ende der
 * Abschnitte ab, sobald die Kopfleiste über dem Inhalt schwebte.
 */
function Maske({ oben }: { oben: number }) {
  const ref = useRef<HTMLElement>(null);
  useMaskeBisUnten(ref);
  return <aside ref={(el) => {
    if (el) el.getBoundingClientRect = () => ({ top: oben } as DOMRect);
    (ref as { current: HTMLElement | null }).current = el;
  }} data-testid="maske" />;
}

const setzeFenster = (breite: number, hoehe: number) => {
  vi.stubGlobal("innerWidth", breite);
  vi.stubGlobal("innerHeight", hoehe);
};

afterEach(() => vi.unstubAllGlobals());

describe("useMaskeBisUnten", () => {
  it("rechnet die Höhe aus der Lage der Maske", () => {
    setzeFenster(1440, 900);
    const { getByTestId } = render(<Maske oben={120} />);
    expect(getByTestId("maske").style.maxHeight).toBe("764px");
  });

  it("nimmt bei einer Maske oberhalb des Fensters die volle Höhe", () => {
    setzeFenster(1440, 900);
    const { getByTestId } = render(<Maske oben={-50} />);
    expect(getByTestId("maske").style.maxHeight).toBe("884px");
  });

  it("lässt die Höhe auf schmalen Bildschirmen frei", () => {
    setzeFenster(800, 900);
    const { getByTestId } = render(<Maske oben={120} />);
    expect(getByTestId("maske").style.maxHeight).toBe("");
  });
});
