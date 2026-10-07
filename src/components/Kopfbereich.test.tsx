import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Kopfbereich } from "./Kopfbereich";

/**
 * Heute darf der Kopfbereich nichts veraendern: `contents`, keine Messung.
 * Mit Liquid Glass schreibt er seine Unterkante an die Spalte, damit der
 * Inhalt oben genug Luft bekommt. jsdom kennt kein Layout, die Zahl ist
 * deshalb null; geprueft wird, dass sie gesetzt und wieder abgeraeumt wird.
 */

afterEach(() => {
  document.documentElement.dataset.glas = "an";
});

function zeichne() {
  return render(
    <div data-testid="spalte">
      <Kopfbereich>
        <header>Kopfleiste</header>
      </Kopfbereich>
    </div>,
  );
}

describe("Kopfbereich", () => {
  it("ist heute unsichtbar und misst nichts", () => {
    const { getByTestId } = zeichne();
    const kasten = getByTestId("spalte").firstElementChild as HTMLElement;
    expect(kasten.className).toBe("contents");
    expect(kasten.dataset.lg).toBe("kopfbereich");
    expect(getByTestId("spalte").style.getPropertyValue("--lg-kopf-unterkante")).toBe("");
  });

  it("schreibt mit Liquid Glass die Unterkante an die Spalte und raeumt sie ab", () => {
    document.documentElement.dataset.glas = "liquid";
    const { getByTestId, unmount } = zeichne();
    const spalte = getByTestId("spalte");
    expect(spalte.style.getPropertyValue("--lg-kopf-unterkante")).toBe("0px");
    unmount();
    expect(spalte.style.getPropertyValue("--lg-kopf-unterkante")).toBe("");
  });
});
