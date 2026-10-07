import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BelegZeile, belegQuellen, sichereUrl } from "./BelegLinks";

describe("BelegZeile", () => {
  it("verlinkt eine bekannte Quelle mit sicherem rel", () => {
    render(<BelegZeile beleg="Markt Leipzig, Einwohner: 601.866 (Destatis, Stand 12/2024)" />);
    const link = screen.getByRole("link", { name: /Destatis/ });
    expect(link).toHaveAttribute("href", "https://www-genesis.destatis.de/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("verlinkt eine wörtliche https-Adresse", () => {
    render(<BelegZeile beleg="Mietspiegel, siehe https://example.org/mietspiegel.pdf." />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.org/mietspiegel.pdf");
  });

  it("zeigt einen Beleg ohne Quelle als reinen Text", () => {
    render(<BelegZeile beleg="Teilungserklärung: „Baujahr 1912“" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/Teilungserklärung/)).toBeInTheDocument();
  });

  it("verlinkt keine unsicheren Schemata", () => {
    expect(sichereUrl("javascript:alert(1)")).toBeNull();
    expect(sichereUrl("data:text/html,x")).toBeNull();
    render(<BelegZeile beleg="javascript:alert(1) und ftp://x.de/a" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("findet Quellen nur als ganzes Wort und ohne Doppelte", () => {
    expect(belegQuellen("große Arbeitgeber laut Unternehmensregister, Bundesagentur für Arbeit; Unternehmensregister").map((q) => q.name))
      .toEqual(["Bundesagentur für Arbeit", "Unternehmensregister"]);
    expect(belegQuellen("XBBSRX")).toEqual([]);
  });
});
