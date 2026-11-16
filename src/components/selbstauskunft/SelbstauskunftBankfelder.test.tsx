import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

/**
 * Felder für die Baufi24-Finanzierungsanfrage (16.11.2026): Geburtsland ist
 * Pflicht, das Ende der Probezeit nur bei laufender Probezeit, der Rest ist
 * freiwillig und erscheint an der passenden Stelle.
 */

const { toastSpy, auswahlSpy } = vi.hoisted(() => ({ toastSpy: vi.fn(), auswahlSpy: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));
vi.mock("@/lib/confirm", () => ({
  auswahlDialog: auswahlSpy,
  hinweisDialog: vi.fn(async () => {}),
  confirmDialog: vi.fn(async () => false),
}));
vi.mock("@/integrations/supabase/client", () => {
  const kette = {
    select: () => kette,
    eq: () => kette,
    order: () => kette,
    maybeSingle: async () => ({ data: null, error: null }),
    limit: async () => ({ data: [], error: null }),
  };
  return {
    supabase: {
      from: () => kette,
      rpc: async () => ({ data: null, error: null }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      functions: { invoke: async () => ({ data: null, error: null }) },
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  };
});
vi.mock("@/lib/kundenStore", () => ({ getKontaktById: () => null }));
vi.mock("@/lib/investmentsStore", () => ({
  getSaData: () => null,
  setSaData: async () => {},
  getSaDataZurVorbelegung: () => null,
  getInvestmentsByKontakt: () => [],
  setInvestmentMetaFields: async () => {},
  getSaKundeStandAm: () => null,
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => true }));

import { SelbstauskunftForm } from "./SelbstauskunftForm";

const kontakt = {
  id: "k1", vorname: "Jane", nachname: "Doe", email: "jane@example.test", telefon: "+49 151 1234567",
  strasse: "", hausnummer: "", plz: "", ort: "", anrede: "Frau", geburtstag: "", person2: null,
} as never;

/** Besteht die Prüfungen der Schritte 0 bis 2 (erfundene Testperson). */
const grundStand = {
  wuenscheZiele: ["vermoegen"],
  vorname: "Jane", nachname: "Doe", geburtsdatum: "01.02.1985",
  strasse: "Musterweg", hausnummer: "1", plz: "80331", ort: "München",
  telefon: "+49 151 1234567", email: "jane@example.test",
  wohnhaftSeit: "Mehr als 5 Jahre", familienstand: "Verheiratet", geburtsland: "Deutschland",
  steuerklasse: "4", kirchensteuer: "nein",
  beschaeftigungsart: "angestellt",
  anstellung: { branche: "IT", firma: "Acme", berufsbezeichnung: "Engineer", angestelltSeit: "01.01.2015", probezeit: "nein" },
  einkommen: { netto: "3.000", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
  bruttoJahr: "60.000",
  mietart: "Zur Miete", mieteWarm: "900", lebenshaltungskosten: "800",
  mahnverfahren: "nein", schufaBekannt: "nein",
};

function speicherErsatz() {
  const inhalt = new Map<string, string>();
  return {
    getItem: (k: string) => (inhalt.has(k) ? inhalt.get(k)! : null),
    setItem: (k: string, v: string) => { inhalt.set(k, String(v)); },
    removeItem: (k: string) => { inhalt.delete(k); },
    clear: () => { inhalt.clear(); },
    key: (i: number) => Array.from(inhalt.keys())[i] ?? null,
    get length() { return inhalt.size; },
  } as unknown as Storage;
}

const titel = () => screen.getByTestId("form-progress-titel").textContent;
/*
 * Knöpfe direkt in der Knopfleiste suchen. `getByRole` rechnet auf dem großen
 * Formular den ganzen Barrierebaum durch und brauchte dafür Sekunden.
 */
const knopf = (text: string) => {
  const b = Array.from(document.querySelectorAll(".sa-knopfleiste button")).find((el) => el.textContent?.trim() === text);
  if (!b) throw new Error(`Kein Knopf „${text}“`);
  return b;
};
const weiter = () => fireEvent.click(knopf("Weiter"));
const bisSchritt = (n: number) => { for (let i = 0; i < n; i++) weiter(); };

/** Das Eingabefeld unter einer Beschriftung, das `nr`-te bei mehreren. */
function feldUnter(beschriftung: string, nr = 0): HTMLInputElement {
  const labels = screen.getAllByText(beschriftung).filter((el) => el.closest("label"));
  const input = labels[nr]?.closest("label")?.parentElement?.querySelector("input");
  if (!input) throw new Error(`Kein Feld unter „${beschriftung}“`);
  return input as HTMLInputElement;
}
const tippe = (beschriftung: string, wert: string) => fireEvent.change(feldUnter(beschriftung), { target: { value: wert } });
const markierte = () => document.querySelectorAll("[data-sa-fehler]").length;

describe("Selbstauskunft: Bankfelder für die Finanzierungsanfrage", { timeout: 20000 }, () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: speicherErsatz(), configurable: true, writable: true });
    toastSpy.mockReset();
    auswahlSpy.mockReset();
    cleanup();
  });

  it("ohne Geburtsland geht es nicht weiter, mit schon", () => {
    const stand = { ...grundStand, geburtsland: "" };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(1);
    expect(titel()).toBe("Persönliche Angaben");
    weiter();
    expect(titel()).toBe("Persönliche Angaben");
    expect(markierte()).toBeGreaterThan(0);
    tippe("Geburtsland", "Deutschland");
    weiter();
    expect(titel()).toBe("Einnahmen");
  });

  it("laufende Probezeit verlangt ihr Ende; neue Felder stehen im Schritt Einnahmen", () => {
    const stand = { ...grundStand, anstellung: { ...grundStand.anstellung, probezeit: "ja" } };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(2);
    expect(titel()).toBe("Einnahmen");
    for (const text of ["Art der Anstellung", "Probezeit endet am", "Variable Bezüge (netto)", "Voraussichtlicher Rentenbeginn", "Rentenanspruch gesetzlich (monatlich)"]) {
      expect(screen.getAllByText(text).length, text).toBeGreaterThan(0);
    }
    // Ein alter Freitext in der Branche bleibt sichtbar, bis ein Listenwert gewählt wird.
    expect(screen.getAllByText("IT").length).toBeGreaterThan(0);
    weiter();
    expect(titel()).toBe("Einnahmen");
  });

  it("ohne Probezeit geht es weiter, und unter Ausgaben steht die Frage nach der Miete", () => {
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={grundStand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(3);
    expect(titel()).toBe("Ausgaben");
    expect(screen.getByText("Miete entfällt nach dem Kauf")).toBeTruthy();
  });
});
