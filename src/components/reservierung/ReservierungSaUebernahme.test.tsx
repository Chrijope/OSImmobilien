import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * IBAN und Familienstand kommen aus der Selbstauskunft des Investments.
 *
 * Beides stand schon im Formular, lief aber bis zum 29.09.2026 ins Leere:
 * `getInvestmentsByKontakt` lieferte das Investment ohne `meta`, und die
 * Selbstauskunft liegt genau dort. Die übrigen Tests hängen `meta` von Hand an
 * ihre Attrappe und sahen den Fehler deshalb nicht.
 *
 * Hier läuft der echte `investmentsStore`; nachgebildet ist nur der
 * Zwischenspeicher darunter, mit einer Zeile, wie sie aus der Datenbank kommt.
 */

const zeilen = vi.hoisted(() => ({ investments: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (t: string) => (t === "investments" ? zeilen.investments : []),
  cacheInsert: () => {},
  cacheUpdate: () => {},
  cacheDelete: () => {},
  cacheSet: () => {},
  onCacheChange: () => () => {},
}));

const kontakt = {
  id: "k-1",
  vorname: "Anna", nachname: "Beispiel",
  email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München",
  geburtstag: "01.01.1980",
  person2: { vorname: "Ben", nachname: "Beispiel", email: "ben@beispiel.test" },
};

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: <T,>(_k: string, fallback: T) => fallback,
  setUserSetting: () => {},
}));
vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_k: string, fallback: unknown) => fallback,
  localSet: () => {},
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === kontakt.id ? kontakt : null),
  updateKontakt: () => {},
}));
vi.mock("@/lib/objekteStore", () => ({
  reserveWohnung: async () => {},
  getObjektById: () => undefined,
  getWohnungKurz: () => null,
}));
vi.mock("@/lib/notificationStore", () => ({ addDocNotification: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async () => ({ data: null, error: null }) }, rpc: async () => ({ data: null, error: null }) },
}));

const { ReservierungsForm } = await import("@/components/reservierung/ReservierungsForm");
const { getInvestmentsByKontakt } = await import("@/lib/investmentsStore");

function zeile(saData: Record<string, unknown> | undefined) {
  return {
    id: "inv-1",
    kunde_id: "k-1",
    erstellt_am: "2026-09-01T08:00:00.000Z",
    meta: { nummer: 1, pipelineStufe: "objektauswahl", ...(saData ? { saData } : {}) },
  };
}

function zeigeFormular() {
  return render(
    <MemoryRouter>
      <ReservierungsForm kundeId="k-1" investmentId="inv-1" />
    </MemoryRouter>,
  );
}

const ibanFelder = () =>
  screen.queryAllByPlaceholderText("DE00 0000 0000 0000 0000 00") as HTMLInputElement[];

// Ein Entwurf aus dem vorigen Fall darf die Vorbefüllung nicht überdecken.
beforeEach(() => {
  globalThis.localStorage?.clear?.();
  globalThis.sessionStorage?.clear?.();
});

describe("Selbstauskunft im Reservierungsformular, Investment in echter Form", () => {
  it("das Investment aus dem Store trägt die Selbstauskunft im Meta", () => {
    zeilen.investments = [zeile({ familienstand: "verheiratet" })];
    const [inv] = getInvestmentsByKontakt("k-1");
    expect((inv.meta?.saData as Record<string, unknown>)?.familienstand).toBe("verheiratet");
  });

  it("übernimmt die IBAN beider Käufer aus der Selbstauskunft", () => {
    zeilen.investments = [zeile({
      bankkonten: [{ iban: "DE02120300000000202051" }],
      person2Data: { bankkonten: [{ iban: "DE02500105170137075030" }] },
    })];
    zeigeFormular();
    const werte = ibanFelder().map((f) => f.value.replace(/\s/g, ""));
    expect(werte).toContain("DE02120300000000202051");
    expect(werte).toContain("DE02500105170137075030");
  });

  it("lässt die IBAN leer, wenn die Selbstauskunft keine nennt", () => {
    zeilen.investments = [zeile({ bankkonten: [] })];
    zeigeFormular();
    expect(ibanFelder().every((f) => f.value === "")).toBe(true);
  });

  it("fragt den Güterstand, wenn die Selbstauskunft beide als verheiratet führt", () => {
    zeilen.investments = [zeile({ familienstand: "verheiratet", person2Data: { familienstand: "verheiratet" } })];
    zeigeFormular();
    expect(screen.getByText("Güterstand")).toBeTruthy();
  });

  it("fragt keinen Güterstand ohne Familienstand in der Selbstauskunft", () => {
    zeilen.investments = [zeile(undefined)];
    zeigeFormular();
    expect(screen.queryByText("Güterstand")).toBeNull();
  });

  it("kennt keinen Investagon-Blanko-Modus mehr", () => {
    zeilen.investments = [zeile(undefined)];
    zeigeFormular();
    expect(screen.queryByText(/Investagon/)).toBeNull();
  });
});
