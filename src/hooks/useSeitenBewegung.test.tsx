import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { useSeitenBewegung } from "./useSeitenBewegung";

function Rahmen({ pfad }: { pfad: string }) {
  const { spalteRef, hauptRef } = useSeitenBewegung(pfad);
  return (
    <div ref={spalteRef} data-testid="spalte">
      <main ref={hauptRef} data-testid="haupt" />
    </div>
  );
}

describe("useSeitenBewegung", () => {
  it("setzt data-gescrollt ab 4px und nimmt es oben wieder weg", () => {
    const { getByTestId } = render(<Rahmen pfad="/a" />);
    const haupt = getByTestId("haupt");
    const spalte = getByTestId("spalte");

    act(() => {
      haupt.scrollTop = 40;
      haupt.dispatchEvent(new Event("scroll"));
    });
    expect(spalte.hasAttribute("data-gescrollt")).toBe(true);

    act(() => {
      haupt.scrollTop = 0;
      haupt.dispatchEvent(new Event("scroll"));
    });
    expect(spalte.hasAttribute("data-gescrollt")).toBe(false);
  });

  it("übersteht einen Seitenwechsel ohne Web Animations", () => {
    const { rerender } = render(<Rahmen pfad="/a" />);
    expect(() => rerender(<Rahmen pfad="/b" />)).not.toThrow();
  });
});
