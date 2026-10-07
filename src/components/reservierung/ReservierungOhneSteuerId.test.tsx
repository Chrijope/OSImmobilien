import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Die Steuer-ID ist am 22.09.2026 aus der Reservierungsvereinbarung entfallen.
 *
 * Entscheidung des Geschäftsführers: Sie wird hier nicht mehr erhoben. Wer sie
 * braucht, ist der Notar, und dort wird sie beim Aufnahmebogen nachgereicht,
 * falls die Selbstauskunft sie nicht trägt. Dort ist sie freiwillig geblieben,
 * es wurde bewusst nichts zur Pflicht gemacht.
 *
 * Geprüft wird beides: Das Feld ist im Formular verschwunden, für beide
 * Käufer, und der Käuferschritt lässt sich ohne die Nummer abschließen. Der
 * zweite Punkt ist der wichtigere: Bliebe die Pflichtprüfung stehen, während
 * das Eingabefeld fehlt, käme niemand mehr über Schritt 1 hinaus, ohne dass
 * irgendwo zu sehen wäre, woran es liegt.
 *
 * Dass ein alter Vorgang mit gespeicherter Steuer-ID weiterhin ein sauberes
 * PDF ergibt, steht in `src/lib/reservierungPdfSteuerId.test.ts`.
 */

const kontakt = {
  id: "k-1",
  vorname: "Anna", nachname: "Beispiel",
  email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München",
  geburtstag: "1980-01-01",
  // Am Kontakt darf die Nummer weiterhin stehen. Sie darf nur nicht mehr in
  // die Reservierung wandern, und genau das prüft der dritte Test.
  steuerId: "123/456/78901",
  person2: {
    vorname: "Bernd", nachname: "Beispiel",
    email: "bernd@beispiel.test", telefon: "0170 7654321",
    geburtsdatum: "1979-02-02",
    steuerId: "987/654/32109",
  },
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

const { ReservierungsForm, validateRvStep } = await import("@/components/reservierung/ReservierungsForm");
type RvDaten = Parameters<typeof validateRvStep>[1];

const kaeuferSchritt = () => {
  render(
    <MemoryRouter>
      <ReservierungsForm kundeId="k-1" />
    </MemoryRouter>,
  );
};

const text = () => document.body.textContent || "";

beforeEach(() => {
  cleanup();
});

describe("Das Feld Steuer-ID ist aus dem Reservierungsformular verschwunden", () => {
  it("zeigt es bei Käufer 1 nicht mehr an", () => {
    kaeuferSchritt();
    // Der Käuferschritt steht beim Öffnen vorn, die übrigen Felder sind da.
    expect(screen.getByDisplayValue("Anna")).toBeTruthy();
    expect(text()).not.toContain("Steuer-ID");
  });

  it("zeigt es auch bei Käufer 2 nicht mehr an", () => {
    kaeuferSchritt();
    // Der zweite Käufer erscheint, weil der Kontakt eine zweite Person trägt.
    expect(text()).toContain("Käufer 2");
    expect(screen.getByDisplayValue("Bernd")).toBeTruthy();
    // Einmal für beide: Das Wort kommt im ganzen Schritt nicht mehr vor.
    expect(screen.queryAllByText("Steuer-ID")).toHaveLength(0);
  });

  it("trägt die Nummer des Kontakts nicht mehr in die Reservierung ein", () => {
    kaeuferSchritt();
    // Am Kontakt steht sie, im Formular darf sie nirgends auftauchen.
    expect(text()).not.toContain("123/456/78901");
    expect(text()).not.toContain("987/654/32109");
  });
});

describe("Der Käuferschritt kommt ohne die Steuer-ID durch", () => {
  /** Ein Käuferschritt, in dem alles Pflichtige steht. */
  const kaeufer = (over: Record<string, unknown>) =>
    ({
      vorname: "Erika", nachname: "Muster", geburtsdatum: "1980-01-01",
      staatsangehoerigkeit: "Deutsch", strasse: "Roonstraße", hausnummer: "3",
      plz: "83022", ort: "Rosenheim", telefon: "0800 1", email: "e@example.de",
      hatPerson2: false,
      ...over,
    }) as unknown as RvDaten;

  it("lässt Käufer 1 ohne sie weiter", () => {
    expect(validateRvStep(0, kaeufer({}), false).size).toBe(0);
  });

  it("lässt auch zwei Käufer ohne sie weiter", () => {
    const zuZweit = kaeufer({
      hatPerson2: true, p2Vorname: "Max", p2Nachname: "Muster",
      p2Geburtsdatum: "1979-02-02", p2Staatsangehoerigkeit: "Deutsch",
      p2Strasse: "Roonstraße", p2Hausnummer: "3", p2Plz: "83022",
      p2Ort: "Rosenheim", p2Telefon: "0800 2", p2Email: "m@example.de",
    });
    expect(validateRvStep(0, zuZweit, false).size).toBe(0);
  });

  it("meldet keinen Fehler mehr unter dem Namen steuerId", () => {
    // Ein leerer Käuferschritt bemängelt weiterhin alles Pflichtige, aber die
    // Steuer-ID ist nicht mehr darunter.
    const fehler = validateRvStep(0, kaeufer({ vorname: "", nachname: "" }), false);
    expect(fehler.has("vorname")).toBe(true);
    expect(fehler.has("steuerId")).toBe(false);
    expect(fehler.has("p2SteuerId")).toBe(false);
  });
});
