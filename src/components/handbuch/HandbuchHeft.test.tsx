import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SeitenSpracheProvider } from "@/components/SeitenSprache";
import { HandbuchHeft } from "@/components/handbuch/HandbuchHeft";
import { kapitelListe } from "@/lib/handbuch/inhalt";

function zeige(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <SeitenSpracheProvider>
        <HandbuchHeft kapitelAnzahl={kapitelListe("de").length} />
      </SeitenSpracheProvider>
    </MemoryRouter>,
  );
}

describe("HandbuchHeft", () => {
  it("zeigt Heft, Seiten, Kacheln und Notiz deutsch in der Sie-Form", () => {
    const { container } = zeige("/handbuch?lang=de");
    const bild = screen.getByRole("img", { name: /Immobilienhandbuch als gebundenes Heft/ });
    // Deckblatt plus drei Innenseiten, alle als Teil des einen Bildes.
    expect(bild.querySelectorAll("img")).toHaveLength(4);
    expect(screen.getByText("14 Kapitel")).toBeInTheDocument();
    expect(screen.getByText("Mit Ihren eigenen Zahlen")).toBeInTheDocument();
    expect(screen.getByText("Ihr kostenloses Immobilienhandbuch")).toBeInTheDocument();
    expect(screen.getByText("Beispielwerte")).toBeInTheDocument();
    // Nie die Klasse des Ergebnis-Handbuchs verwenden.
    expect(container.querySelector(".hb-buch")).toBeNull();
  });

  it("beschriftet englisch, wenn die Seite englisch läuft", () => {
    zeige("/handbuch?lang=en");
    expect(screen.getByRole("img", { name: /property handbook as a bound booklet/ })).toBeInTheDocument();
    expect(screen.getByText("14 chapters")).toBeInTheDocument();
    expect(screen.getByText("Sample figures")).toBeInTheDocument();
  });
});
