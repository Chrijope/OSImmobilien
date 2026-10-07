import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import { calculateFinanzierbarkeitFromSaData } from "@/lib/finanzierbarkeitUtils";

/*
 * Finanzierungsrahmen im Portal wie im Kundenprofil (Entscheidung Christian,
 * 24.09.2026): minimal, empfohlen, maximal aus derselben Berechnung
 * (calculateFinanzierbarkeitFromSaData), ohne eigene Rechnung im Portal.
 */

const sa = vi.hoisted(() => ({
  gehalt: "4000",
  lebenshaltung: "1000",
  vermoegenswerte: [{ betrag: "30000" }],
}));

vi.mock("@/lib/finanzierbarkeitUtils", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/finanzierbarkeitUtils")>();
  return { ...echt, findSaDataForInvestment: (id: string | null | undefined) => (id ? sa : null) };
});
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));

const { default: KundeFinanzierbarkeitCard } = await import("./KundeFinanzierbarkeitCard");
const { EmpfehlungsRecommendationCard } = await import("./EmpfehlungsRecommendationCard");

beforeAll(async () => {
  await i18n.changeLanguage("de");
});

const euro = (v: number) => `${Math.round(v).toLocaleString("de-DE")} €`;

describe("KundeFinanzierbarkeitCard", () => {
  it("zeigt minimal, empfohlen und maximal aus der Berechnung des Kundenprofils", () => {
    const calc = calculateFinanzierbarkeitFromSaData(sa)!;
    expect(calc.empfRahmen).toBeGreaterThan(0);
    render(<KundeFinanzierbarkeitCard investmentId="inv-1" saSigned />);
    const spanne = screen.getByTestId("finanzierungsrahmen-spanne");
    const text = spanne.textContent || "";
    // Reihenfolge wie im Kundenprofil: Min., Empfehlung, Max.
    expect(text.indexOf("Minimal")).toBeLessThan(text.indexOf("Empfohlen"));
    expect(text.indexOf("Empfohlen")).toBeLessThan(text.indexOf("Maximal"));
    expect(text).toContain(euro(calc.minRahmen));
    expect(text).toContain(euro(calc.empfRahmen));
    expect(text).toContain(euro(calc.maxRahmen));
  });

  it("zeigt auf Englisch die Beträge als €… und englische Beschriftungen", async () => {
    const calc = calculateFinanzierbarkeitFromSaData(sa)!;
    await i18n.changeLanguage("en");
    try {
      render(<KundeFinanzierbarkeitCard investmentId="inv-1" saSigned />);
      const text = screen.getByTestId("finanzierungsrahmen-spanne").textContent || "";
      expect(text).toContain("Recommended");
      expect(text).toContain(`€${Math.round(calc.empfRahmen).toLocaleString("en-GB")}`);
      expect(text).not.toMatch(/\d €/);
    } finally {
      await i18n.changeLanguage("de");
    }
  });

  it("zeigt ohne unterschriebene Selbstauskunft keinen Rahmen, nur einen Hinweis", () => {
    render(<KundeFinanzierbarkeitCard investmentId="inv-1" saSigned={false} />);
    expect(screen.queryByTestId("finanzierungsrahmen-spanne")).toBeNull();
    expect(screen.getByText(/sobald deine Selbstauskunft für diesen Kauf ausgefüllt und unterschrieben ist/)).toBeTruthy();
  });
});

describe("EmpfehlungsRecommendationCard", () => {
  it("nennt keinen eigenen Spielraum mehr", () => {
    const { container } = render(
      <MemoryRouter>
        <EmpfehlungsRecommendationCard invMeta={{ saSigned: true, kaufpreis: 368000 }} kontaktMeta={{}} saData={{ ...sa, gehalt: "20000" }} />
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(/Spielraum/);
    expect(container.textContent).not.toMatch(/€/);
  });
});
