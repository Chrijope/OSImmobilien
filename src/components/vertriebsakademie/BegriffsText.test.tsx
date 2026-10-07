import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Die Begriffsliste selbst ist leer und wird redaktionell gefüllt. Für die
// Mechanik wird sie hier durch eine kleine Testliste ersetzt.
vi.mock("@/lib/akademieBegriffe", () => ({
  AKADEMIE_BEGRIFFE: [
    {
      begriff: "Tilgung",
      schreibweisen: ["Tilgungen"],
      erklaerung: "Der Teil der Rate, der die Schuld verkleinert.",
      imVerkauf: "Ohne Tilgung wächst kein Eigentum.",
      mehr: "/vertriebsakademie/glossar-zahlen",
    },
  ],
}));

import { BegriffsText } from "./BegriffsText";
import { findeBegriffe } from "@/lib/akademieBegriffeErkennung";
import { AKADEMIE_BEGRIFFE } from "@/lib/akademieBegriffe";

function zeige(text: string) {
  const segmente = findeBegriffe(text, AKADEMIE_BEGRIFFE);
  return render(
    <MemoryRouter>
      <p>
        <BegriffsText segmente={segmente} />
      </p>
    </MemoryRouter>,
  );
}

describe("BegriffsText", () => {
  it("zeigt den Satz unverändert und markiert den Begriff im Textfluss", () => {
    const { container } = zeige("Die Tilgung baut Vermögen auf.");
    expect(container.textContent).toBe("Die Tilgung baut Vermögen auf.");
    const marke = screen.getByRole("button", { name: /Begriff erklären: Tilgung/ });
    // Falle 6: ein Inline-Element, kein Knopf, damit das Markieren mit der
    // Maus über die Stelle hinweg nicht bricht.
    expect(marke.tagName).toBe("SPAN");
    expect(marke.className).toContain("decoration-dotted");
  });

  it("öffnet die Erklärung auf Klick", () => {
    zeige("Die Tilgung baut Vermögen auf.");
    expect(screen.queryByText("Der Teil der Rate, der die Schuld verkleinert.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Begriff erklären: Tilgung/ }));
    expect(screen.getByText("Der Teil der Rate, der die Schuld verkleinert.")).toBeInTheDocument();
    expect(screen.getByText(/Ohne Tilgung wächst kein Eigentum/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ausführlich nachlesen/ })).toHaveAttribute(
      "href",
      "/vertriebsakademie/glossar-zahlen",
    );
  });

  it("setzt kein zusätzliches Symbol in den Satz", () => {
    const { container } = zeige("Die Tilgung baut Vermögen auf.");
    expect(container.querySelector("svg")).toBeNull();
  });
});
