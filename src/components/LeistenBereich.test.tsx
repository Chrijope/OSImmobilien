import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { LeistenBereich } from "./LeistenBereich";

/**
 * Die gemessene Hoehe ist das Bindeglied zur Seitenleiste. Sie haengt auf
 * `fixed` am Fensterrand und rutscht sonst nicht mit, dann stehen Kopfzeile
 * und Seitenleiste versetzt zueinander. Genau das hat Christian am 18.09.2026
 * gesehen.
 *
 * Gemessen wird hier nichts: jsdom kennt kein Layout, jede Hoehe ist null.
 * Geprueft wird das, worauf es ankommt, naemlich dass die Eigenschaft gesetzt
 * wird, dass sie beim Abraeumen wieder verschwindet und dass ein Browser ohne
 * `ResizeObserver` nicht abstuerzt.
 */

afterEach(() => {
  document.documentElement.style.removeProperty("--leisten-hoehe");
  vi.restoreAllMocks();
});

function hoehe() {
  return document.documentElement.style.getPropertyValue("--leisten-hoehe");
}

describe("LeistenBereich", () => {
  it("schreibt die gemessene Hoehe an das Dokument", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 83.6,
    } as DOMRect);

    render(<LeistenBereich><div>Leiste</div></LeistenBereich>);

    expect(hoehe()).toBe("83.6px");
  });

  it("raeumt die Eigenschaft wieder ab", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 44,
    } as DOMRect);

    const { unmount } = render(<LeistenBereich><div>Leiste</div></LeistenBereich>);
    expect(hoehe()).toBe("44px");

    unmount();
    // Sonst bliebe die Seitenleiste tiefer stehen, obwohl oben nichts mehr ist.
    expect(hoehe()).toBe("");
  });

  it("zeigt seinen Inhalt auch ohne ResizeObserver", () => {
    const echt = window.ResizeObserver;
    // Absichtlich entfernt, wie in aelteren Browsern. `Reflect.deleteProperty`
    // statt `delete`, weil `window.ResizeObserver` nicht als optional gilt und
    // `delete` darauf ein Typfehler waere.
    Reflect.deleteProperty(window, "ResizeObserver");

    try {
      const { getByText } = render(<LeistenBereich><div>Leiste</div></LeistenBereich>);
      expect(getByText("Leiste")).toBeTruthy();
    } finally {
      window.ResizeObserver = echt;
    }
  });
});
