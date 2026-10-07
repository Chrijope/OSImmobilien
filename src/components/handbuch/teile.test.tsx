import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anteilig, Hochzaehlen } from "./teile";

describe("anteilig", () => {
  it("rundet Zwischenwerte und endet exakt", () => {
    expect(anteilig(158_400, 0.5)).toBe(79_000);
    expect(anteilig(126_012, 0.5, 100)).toBe(63_000);
    expect(anteilig(126_012, 1, 100)).toBe(126_012);
  });
});

describe("Hochzaehlen", () => {
  let melde: ((eintraege: Partial<IntersectionObserverEntry>[]) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    melde = null;
    // Ein Beobachter, der sich wie im Browser sofort einmal meldet (nicht sichtbar).
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
          melde = cb;
        }
        observe() {
          melde?.([{ isIntersecting: false }]);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    // Die Zahl liegt beim Laden weit unter dem Sichtfeld.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 5000 } as DOMRect);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("wartet, solange der Beobachter arbeitet, und zählt beim Hereinscrollen bis zum exakten Wert", () => {
    render(<Hochzaehlen text={(a) => String(anteilig(126_012, a, 100))} />);
    // Früher sprang das Sicherheitsnetz nach 2,5 s auf den Endwert, noch bevor
    // jemand die Zahl sehen konnte. Jetzt wartet sie auf das Hereinscrollen.
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText("0")).toBeTruthy();

    act(() => melde?.([{ isIntersecting: true }]));
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByText("126012")).toBeTruthy();
  });
});
