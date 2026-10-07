/**
 * Die Strecke des kurzen Steuerrechners.
 *
 * Vier Dinge haelt dieser Test fest:
 *   1  Die vier Schritte laufen vorwaerts und rueckwaerts, und die Eingaben
 *      bleiben beim Zurueckgehen stehen.
 *   2  Ohne Pflichthaken geht kein Lead raus, und die Meldung sagt, was fehlt.
 *   3  Das Ergebnis erscheint erst, NACHDEM der Lead angekommen ist. Es ist
 *      die Gegenleistung fuer die Kontaktdaten, nicht der Vorschuss.
 *   4  Die drei fachlichen Warnungen stehen auf der Ergebnisseite. Sie sind
 *      Pflicht und kein Schmuck, deshalb haelt ein Test sie fest.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const sendeExpatsLead = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ ok: true, kontaktId: "kontakt-1" })),
);

vi.mock("@/lib/expatsRechnerLead", async () => {
  const echt = await vi.importActual<typeof import("@/lib/expatsRechnerLead")>(
    "@/lib/expatsRechnerLead",
  );
  return { ...echt, sendeExpatsLead };
});
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: { name: "Test Admin", role: "admin" },
    authUser: { id: "user-1", email: "admin@example.com" },
  }),
}));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ExpatsRechner from "./ExpatsRechner";
import { LEAD_EINWILLIGUNG_FEHLT_EN } from "@/lib/leadEinwilligung";

/** Fuellt Schritt eins bis drei aus und landet im Kontaktformular. */
function bisZumKontakt() {
  fireEvent.click(screen.getByRole("button", { name: "€50,000" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "€100,000" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: /Single/ }));
}

function fuelleKontakt() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Jane" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Doe" } });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "jane@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+49 170 1234567" } });
}

describe("ExpatsRechner: die Strecke", () => {
  beforeEach(() => {
    sendeExpatsLead.mockClear();
  });

  it("fuehrt durch vier Schritte und behaelt die Eingaben beim Zurueckgehen", () => {
    render(<ExpatsRechner />);
    expect(screen.getByText(/Step 1 of 4/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "€25,000" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Step 2 of 4/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(/Step 1 of 4/)).toBeTruthy();
    // Der gewaehlte Betrag steht noch im Feld.
    expect((screen.getByLabelText("Or your own amount") as HTMLInputElement).value).toBe("25,000");
  });

  it("laesst niemanden ohne Betrag weiter", () => {
    render(<ExpatsRechner />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Please enter the capital/)).toBeTruthy();
    expect(screen.getByText(/Step 1 of 4/)).toBeTruthy();
  });

  it("schickt ohne Pflichthaken keinen Lead und sagt, was fehlt", async () => {
    render(<ExpatsRechner />);
    bisZumKontakt();
    fuelleKontakt();
    fireEvent.click(screen.getByRole("button", { name: "Show my result" }));
    await waitFor(() => expect(screen.getByText(LEAD_EINWILLIGUNG_FEHLT_EN)).toBeTruthy());
    expect(sendeExpatsLead).not.toHaveBeenCalled();
  });

  it("zeigt das Ergebnis erst nach dem Lead und nennt die drei Warnungen", async () => {
    render(<ExpatsRechner />);
    bisZumKontakt();
    fuelleKontakt();
    fireEvent.click(screen.getByLabelText(/I agree that OS Immobilien/));
    fireEvent.click(screen.getByRole("button", { name: "Show my result" }));

    await waitFor(() => expect(sendeExpatsLead).toHaveBeenCalledTimes(1));
    // Die Angaben gehen unveraendert an den Lead.
    const [lead, eingabe] = sendeExpatsLead.mock.calls[0] as [
      { vorname: string; einwilligung?: boolean },
      { eigenkapital: number; jahresbrutto: number; verheiratet: boolean },
    ];
    expect(lead.vorname).toBe("Jane");
    expect(lead.einwilligung).toBe(true);
    expect(eingabe).toMatchObject({ eigenkapital: 50000, jahresbrutto: 100000, verheiratet: false });

    // 50.000 mal 13 = 650.000, und im ersten Jahr 29.972 Euro Ersparnis,
    // beides von Hand nachgerechnet in `expatsRechner.test.ts`.
    // Der Betrag steht mehrfach auf der Seite, in der Ueberschrift und als
    // Kennzahl, deshalb die Mehrzahlform der Abfrage.
    await waitFor(() => expect(screen.getAllByText("€650,000").length).toBeGreaterThan(0));
    expect(screen.getAllByText("€29,972").length).toBeGreaterThan(0);

    // Die drei Pflichthinweise.
    expect(screen.getByText(/This is an estimate, not tax advice/)).toBeTruthy();
    expect(screen.getByText(/is not the standard rate/)).toBeTruthy();
    expect(screen.getByText(/comes from the bank/)).toBeTruthy();
  });

  it("zeigt auf der Ergebnisseite auch die unbequemen Zahlen", async () => {
    render(<ExpatsRechner />);
    bisZumKontakt();
    fuelleKontakt();
    fireEvent.click(screen.getByLabelText(/I agree that OS Immobilien/));
    fireEvent.click(screen.getByRole("button", { name: "Show my result" }));
    await waitFor(() => expect(sendeExpatsLead).toHaveBeenCalledTimes(1));

    /*
     * Diese vier Angaben sind der Grund fuer diesen Test. Eine Anzeigenseite
     * hat immer den Zug, das Unangenehme wegzulassen. Hier haelt ein Test
     * fest, dass es dasteht:
     *
     *   1  die nicht umlagefaehigen Kosten als eigene Zeile, 271 Euro im
     *      Monat bei diesem Fall (0,5 Prozent von 650.000, geteilt durch 12),
     *   2  die monatliche Zuzahlung vor Steuer, 533 Euro,
     *   3  der Dauerzustand ab Jahr 2, minus 24 Euro, also schlechter als der
     *      Zehnjahresschnitt von plus 125 Euro,
     *   4  der Vermoegensaufbau ohne jede unterstellte Wertsteigerung.
     */
    await waitFor(() => expect(screen.getByText(/Costs you cannot pass on/)).toBeTruthy());
    expect(screen.getAllByText("−€271").length).toBeGreaterThan(0);
    expect(screen.getByText("Out of your own pocket, before tax")).toBeTruthy();
    expect(screen.getAllByText("−€583").length).toBeGreaterThan(0);
    expect(screen.getByText(/From year two, without the one off deduction/)).toBeTruthy();
    expect(screen.getAllByText("−€74").length).toBeGreaterThan(0);
    // 18,009 Prozent von 600.000 Euro Darlehen, siehe expatsRechner.test.ts.
    expect(screen.getAllByText("€108,055").length).toBeGreaterThan(0);
    expect(screen.getByText(/No price growth assumed/)).toBeTruthy();
  });
});
