import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Seit dem 16.10.2026 ist jede Reservierung kostenfrei. Den früheren
 * Schieberegler „Kunde zahlt keine Reservierungsgebühr" gibt es nicht mehr;
 * das Formular zeigt immer den Fall ohne Gebühr: kein Gebührenabschnitt,
 * keine IBAN, und solange `WIDERRUF_ENTFAELLT_OHNE_GEBUEHR` gilt, keine
 * Widerrufsthematik. Dazu die Nummerierung: Sie darf keine Lücke haben.
 */

const kontakt = {
  id: "k-1",
  vorname: "Anna", nachname: "Beispiel",
  email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München",
  geburtstag: "1980-01-01", steuerId: "123/456/78901",
};

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: () => undefined,
  getInvestmentMetaField: (_id: string, _k: string, fallback: unknown) => fallback,
  setInvestmentMetaFields: () => {},
  updateInvestment: () => {},
  getInvestmentsByKontakt: () => [],
}));
vi.mock("@/lib/objekteStore", () => ({ getObjektById: () => undefined, reserveWohnung: async () => {} }));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_k: string, fallback: unknown) => fallback,
  setUserSetting: () => {},
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === kontakt.id ? kontakt : null),
  updateKontakt: () => {},
}));
vi.mock("@/lib/notificationStore", () => ({ addDocNotification: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async () => ({ data: null, error: null }) } },
}));

const { ReservierungsForm } = await import("@/components/reservierung/ReservierungsForm");

/** Das Formular bis zum dritten Schritt aufblättern. */
const bisAbschluss = () => {
  render(
    <MemoryRouter>
      <ReservierungsForm kundeId="k-1" />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText("Reservierung & Abschluss"));
};

const text = () => document.body.textContent || "";

/*
 * Der Entwurf liegt in den Nutzereinstellungen, die hier eine Attrappe sind
 * und immer den Ausgangswert liefern. Jeder Test beginnt deshalb von selbst
 * mit einem leeren Formular, es genügt, die Anzeige abzuräumen.
 */
beforeEach(() => {
  cleanup();
});

describe("Die Reservierung ist kostenfrei", () => {
  it("hat keinen Regler mehr", () => {
    bisAbschluss();
    expect(screen.queryByLabelText("Kunde zahlt keine Reservierungsgebühr")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("zeigt keinen Gebührenabschnitt, keine Kontoverbindung und keine Widerrufsthematik", () => {
    bisAbschluss();
    expect(text()).not.toContain("Reservierungsgebühr und Kontoverbindung");
    expect(text()).not.toContain("Kontoinhaber");
    expect(text()).not.toContain("IBAN");
    expect(text()).not.toContain("Verwendungszweck");
    expect(text()).not.toMatch(/1\.000,00 EUR|1\.500,00 EUR|3\.000,00 EUR/);
    expect(text()).not.toContain("binnen vierzehn Tagen ohne Angabe von Gründen");
    expect(text()).not.toContain("Widerrufsbelehrung");
    expect(text()).not.toContain("auflösende Bedingung");
    expect(document.getElementById("widerruf-sofort")).toBeNull();
  });

  it("zählt die Abschnitte lückenlos durch", () => {
    bisAbschluss();
    expect(text()).toContain("3. Notar und Abwicklung");
    expect(text()).toContain("4. Reservierungsvereinbarung");
    expect(text()).toContain("5. Datenschutzerklärung");
    expect(text()).not.toContain("7. ");
    expect(text()).not.toContain("8. ");
  });

  it("sagt im Vertragstext ausdrücklich, dass keine Gebühr erhoben wird", () => {
    bisAbschluss();
    expect(text()).toContain("Für diese Reservierung wird keine Reservierungsgebühr erhoben.");
  });

  it("fragt im Käuferschritt keine IBAN ab", () => {
    bisAbschluss();
    fireEvent.click(screen.getByText("Käuferdaten"));
    expect(screen.queryByText(/IBAN/)).toBeNull();
    expect(screen.queryByPlaceholderText("DE00 0000 0000 0000 0000 00")).toBeNull();
  });
});
