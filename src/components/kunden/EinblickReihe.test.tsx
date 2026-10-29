import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EinblickReihe } from "@/components/kunden/EinblickReihe";
import type { EinblickPerson } from "@/lib/kundenEinblick";

const p = (id: string, name: string, zustaendig = false): EinblickPerson => ({ id, name, rolle: "Backoffice", zustaendig });

describe("EinblickReihe", () => {
  it("zeigt höchstens fünf Kreise, den Rest als +N, den Zuständigen mit Ring", () => {
    const personen = [p("a", "Vera Partner", true), p("b", "Bodo B"), p("c", "Carl C"), p("d", "Dora D"), p("e", "Emil E"), p("f", "Fred F"), p("g", "Gina G")];
    const { container } = render(<TooltipProvider><EinblickReihe personen={personen} /></TooltipProvider>);
    const reihe = container.querySelector('[data-pruefung="kunden-einblick"]')!;
    expect(reihe.querySelectorAll(".rounded-full.h-5").length).toBe(5);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("VP").closest(".ring-1")).not.toBeNull();
  });

  it("entfällt ohne Personen", () => {
    const { container } = render(<EinblickReihe personen={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
