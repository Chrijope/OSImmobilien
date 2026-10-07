import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "@/i18n";

/*
 * Plan Kundensprache, Etappe 1: Die VP-Bewertung war komplett deutsch.
 * Geprüft wird mit dem echten i18n, dass das Formular in beiden Sprachen
 * die richtigen Texte zeigt. Die Spaltennamen der Tabelle bleiben dabei
 * dieselben, nur die Anzeige wechselt.
 */
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { VpBewertungFormular } = await import("./VpBewertungFormular");

const ctx = {
  kontaktId: "preview",
  vpUserId: null,
  vpName: "Erika Beispiel",
  kundeName: "Max Muster",
  bewertetVon: "u-1",
};

beforeAll(async () => {
  await i18n.changeLanguage("de");
});

afterEach(async () => {
  // Erst abbauen, dann umschalten: sonst rendert der Sprachwechsel ausserhalb von act.
  cleanup();
  await i18n.changeLanguage("de");
});

describe("VpBewertungFormular", () => {
  it("zeigt auf Deutsch die bisherigen Texte", () => {
    render(<VpBewertungFormular ctx={ctx} />);
    expect(screen.getByText("Beurteilungsbogen")).toBeInTheDocument();
    expect(screen.getByText("Wie verständlich waren die Informationen?")).toBeInTheDocument();
    expect(screen.getAllByText("Sehr gut").length).toBe(6);
    expect(screen.getByRole("button", { name: "Bewertung absenden" })).toBeInTheDocument();
  });

  it("zeigt auf Englisch englische Texte und nennt den Berater nie advisor", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<VpBewertungFormular ctx={ctx} />);
    expect(screen.getByText("Feedback form")).toBeInTheDocument();
    expect(screen.getByText("How clear was the information you received?")).toBeInTheDocument();
    expect(screen.getAllByText("Very good").length).toBe(6);
    expect(screen.getAllByRole("button", { name: "Yes" }).length).toBe(2);
    expect(screen.getByRole("button", { name: "Submit feedback" })).toBeInTheDocument();
    const text = container.textContent || "";
    expect(text).not.toMatch(/advisor/i);
    expect(text).not.toContain("Bewertung");
    expect(text).toContain("Erika Beispiel");
  });
});
