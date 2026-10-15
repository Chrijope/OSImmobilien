import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

const settingsRows: any[] = [];
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (tabelle: string) => (tabelle === "user_settings" ? settingsRows : []),
}));

const { DeineProvisionKarte } = await import("./DeineProvisionKarte");

beforeEach(() => {
  settingsRows.length = 0;
});

describe("Karte „Dein Provisionssatz“", () => {
  it("zeigt bei einem Satz von 10 „10 %“ und keine Stufe", () => {
    settingsRows.push({ user_id: "u-1", einstellungen: { custom_provision_rate_setter: 10, custom_provision_rate_eigen: 10, karriere_override: "manager" } });
    render(<DeineProvisionKarte userId="u-1" />);
    const text = screen.getByTestId("dein-provisionssatz").textContent ?? "";
    expect(text).toContain("Du erhältst 10 % Provision auf das vermittelte Kapitalanlagevolumen.");
    expect(text).not.toMatch(/Karriere|Staffel|Team Lead|4,5 %/);
  });

  it("nennt getrennte Sätze für Lead und Eigen", () => {
    settingsRows.push({ user_id: "u-1", einstellungen: { custom_provision_rate_setter: 8, custom_provision_rate_eigen: 12 } });
    render(<DeineProvisionKarte userId="u-1" partnerName="Partner A" />);
    expect(screen.getByTestId("dein-provisionssatz").textContent).toContain("Provisionssatz von Partner A: Lead 8 % · Eigen 12 %");
  });

  it("ohne Satz: Hinweis statt Zahl", () => {
    settingsRows.push({ user_id: "u-1", einstellungen: { karriere_override: "vertriebsfirma" } });
    render(<DeineProvisionKarte userId="u-1" />);
    expect(screen.getByTestId("dein-provisionssatz").textContent).toContain(
      "Für dich ist noch kein Provisionssatz hinterlegt. Bitte wende dich an die Geschäftsleitung.",
    );
  });

  it("bei „Alle Partner“ die Aufforderung zur Auswahl", () => {
    render(<DeineProvisionKarte userId="u-1" alle />);
    expect(screen.getByTestId("dein-provisionssatz").textContent).toContain("Wähle einen Partner, um seinen Provisionssatz zu sehen.");
  });
});

describe("Seiten ohne Karriereplan und Staffel", () => {
  for (const datei of ["src/pages/Auswertungen.tsx", "src/pages/Abrechnungen.tsx", "src/pages/Provisionsabrechnung.tsx", "src/pages/Zielplanung.tsx"]) {
    it(`${datei} zeigt weder Karriereplan noch Staffel noch Karrierestufe`, () => {
      const quelle = readFileSync(datei, "utf8");
      expect(quelle).not.toMatch(/KARRIERE_STUFEN|getKarriereStufe\(|Karriereplan &|Provisionsstaffel \(|🚀 Karrierestufen/);
    });
  }

  it("Auswertungen und Abrechnungen setzen die Karte ein", () => {
    expect(readFileSync("src/pages/Auswertungen.tsx", "utf8")).toContain("<DeineProvisionKarte");
    expect(readFileSync("src/pages/Abrechnungen.tsx", "utf8")).toContain("<DeineProvisionKarte");
  });
});
