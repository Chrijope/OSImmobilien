import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FeldetikettKontext, Zahlenfeld } from "./Felder";

const feld = (markierung?: "objekt" | "selbstauskunft") => (
  <Zahlenfeld label="Kaufpreis" value={1} onChange={() => undefined} markierung={markierung} />
);

describe("Feldetikett", () => {
  it("zeigt die Herkunft nur in der Investmentkalkulation Plus", () => {
    const ohne = render(<TooltipProvider>{feld("objekt")}</TooltipProvider>);
    expect(ohne.queryByTestId("feldetikett")).toBeNull();
    ohne.unmount();

    const plus = render(
      <TooltipProvider>
        <FeldetikettKontext.Provider value>
          {feld("objekt")}
          {feld("selbstauskunft")}
          {feld()}
        </FeldetikettKontext.Provider>
      </TooltipProvider>,
    );
    expect(plus.getAllByTestId("feldetikett").map((e) => e.textContent)).toEqual(["Objekt", "Kunden-SA", "Manuell"]);
    plus.unmount();
  });
});
