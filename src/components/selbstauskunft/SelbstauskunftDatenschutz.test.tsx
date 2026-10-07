import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/**
 * Datenschutz und Pflichtfragen der Selbstauskunft (29.09.2026).
 *
 *   - Nach dem Einreichen bleibt auf dem Gerät kein Entwurf zurück, weder im
 *     localStorage noch im sessionStorage, auch nicht unter alten Schlüsseln.
 *   - Über den Kundenlink liegt der Zwischenstand nur im sessionStorage.
 *   - Ohne Anmeldung wird nichts in die Nutzereinstellungen geschrieben.
 *   - Mahnverfahren und Schufa sind nicht vorbelegt; ohne Antwort geht es
 *     nicht weiter, für Person 1 und Person 2.
 */

const zustand = vi.hoisted(() => ({ nutzerId: null as string | null, testaccount: false }));
const { toastSpy, invokeSpy, setUserSettingSpy } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  invokeSpy: vi.fn(),
  setUserSettingSpy: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));
vi.mock("@/lib/confirm", () => ({
  auswahlDialog: vi.fn(async () => null),
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
      rpc: async () => ({ data: { success: true }, error: null }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      functions: { invoke: (...a: unknown[]) => invokeSpy(...a) },
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  };
});
vi.mock("@/lib/kundenStore", () => ({ getKontaktById: () => null }));
const saDataAmInvestment = vi.hoisted(() => ({ wert: null as Record<string, unknown> | null }));
vi.mock("@/lib/investmentsStore", () => ({
  getSaData: () => saDataAmInvestment.wert,
  setSaData: async () => {},
  getSaDataZurVorbelegung: () => null,
  getInvestmentsByKontakt: () => [],
  setInvestmentMetaFields: async () => {},
  getSaKundeStandAm: () => null,
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => zustand.testaccount }));
vi.mock("@/lib/currentUser", () => ({
  getCurrentUserId: () => zustand.nutzerId,
  setCurrentUserId: () => {},
  clearCurrentUserId: () => {},
}));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_: string, rueckfall: unknown) => rueckfall,
  setUserSetting: (...a: unknown[]) => setUserSettingSpy(...a),
}));
vi.mock("@/lib/aktivitaetenStore", () => ({ addAktivitaet: vi.fn() }));
vi.mock("@/lib/selbstauskunftPdfAblage", () => ({ legeSaPdfNachFormularAb: vi.fn(async () => ({ abgelegt: true })) }));
vi.mock("@/lib/kundenSprache", async (original) => ({
  ...(await original<typeof import("@/lib/kundenSprache")>()),
  stelleKundenspracheSicher: vi.fn(async () => {}),
}));

import { SelbstauskunftForm, EMPTY_DATA, EMPTY_PERSON, loescheLokalenSaEntwurf } from "./SelbstauskunftForm";

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

/** Erfundene Testperson, besteht die Prüfungen aller Schritte außer den Bonitätsfragen. */
const grundStand = {
  wuenscheZiele: ["vermoegen"],
  vorname: "Jane", nachname: "Doe", geburtsdatum: "01.02.1985",
  strasse: "Musterweg", hausnummer: "1", plz: "80331", ort: "München",
  telefon: "+49 151 1234567", email: "jane@example.test",
  wohnhaftSeit: "Mehr als 5 Jahre", familienstand: "Verheiratet",
  steuerklasse: "4", kirchensteuer: "nein",
  beschaeftigungsart: "angestellt",
  anstellung: { branche: "IT", firma: "Acme", berufsbezeichnung: "Engineer", angestelltSeit: "01.01.2015", probezeit: "nein" },
  einkommen: { netto: "3.000", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
  bruttoJahr: "60.000",
  mietart: "Zur Miete", mieteWarm: "900", lebenshaltungskosten: "800",
};
const beantwortet = { ...grundStand, mahnverfahren: "nein", schufaBekannt: "nein" };

const kontakt = {
  id: "k1", vorname: "Jane", nachname: "Doe", email: "jane@example.test", telefon: "+49 151 1234567",
  strasse: "Musterweg", hausnummer: "1", plz: "80331", ort: "München", anrede: "Frau", geburtstag: "01.02.1985", person2: null,
} as never;

const titel = () => screen.getByTestId("form-progress-titel").textContent;
const knopf = (text: string) => {
  const b = Array.from(document.querySelectorAll(".sa-knopfleiste button")).find((el) => el.textContent?.trim() === text);
  if (!b) throw new Error(`Kein Knopf „${text}“`);
  return b;
};
const weiter = () => fireEvent.click(knopf("Weiter"));
const bisSchritt = (n: number) => { for (let i = 0; i < n; i++) weiter(); };
const radio = (id: string) => fireEvent.click(document.getElementById(id)!);

/** Alle Entwurfsschlüssel dieses Kontakts, alte und neue Form, in beiden Speichern. */
const ENTWURF_SCHLUESSEL = ["mi_selbstauskunft_k1", "mi_selbstauskunft_k1_i1", "mi_sa_draft_saved_k1", "mi_sa_draft_saved_k1_i1"];
function legeAlteEntwuerfeAn() {
  for (const k of ENTWURF_SCHLUESSEL) {
    localStorage.setItem(k, "{\"geburtsdatum\":\"01.02.1985\"}");
    sessionStorage.setItem(k, "{\"geburtsdatum\":\"01.02.1985\"}");
  }
  localStorage.setItem("mi_selbstauskunft_k2_i9", "{}");
}
const nochDa = () => ENTWURF_SCHLUESSEL.filter((k) => localStorage.getItem(k) !== null || sessionStorage.getItem(k) !== null);

const echterGetContext = HTMLCanvasElement.prototype.getContext;
const echtesToDataURL = HTMLCanvasElement.prototype.toDataURL;

describe("Selbstauskunft: Datenschutz und Pflichtfragen", { timeout: 30000 }, () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: speicherErsatz(), configurable: true, writable: true });
    Object.defineProperty(globalThis, "sessionStorage", { value: speicherErsatz(), configurable: true, writable: true });
    zustand.nutzerId = null;
    zustand.testaccount = false;
    saDataAmInvestment.wert = null;
    toastSpy.mockReset();
    invokeSpy.mockReset();
    setUserSettingSpy.mockReset();
    // jsdom zeichnet nicht; für die Unterschrift genügt eine Attrappe.
    const ctx = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} };
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAAA";
    cleanup();
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = echterGetContext;
    HTMLCanvasElement.prototype.toDataURL = echtesToDataURL;
  });

  it("Kundenlink: nach dem Unterschreiben ist jeder lokale Entwurf weg, ohne Nutzereinstellungen", async () => {
    legeAlteEntwuerfeAn();
    invokeSpy.mockResolvedValue({ data: { success: true, allSigned: false }, error: null });
    const fertig = vi.fn();
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={beantwortet}
        customerMode saToken={"c".repeat(64)} onComplete={fertig} onHinweisSchritt={() => {}} />,
    );
    bisSchritt(7);
    expect(titel()).toBe("Abschluss");
    const canvas = document.querySelector("canvas")!;
    fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);
    fireEvent.click(document.getElementById("confirm-sa")!);
    fireEvent.click(screen.getByText("Unterschreiben & einreichen").closest("button")!);

    await waitFor(() => expect(fertig).toHaveBeenCalled());
    expect(invokeSpy.mock.calls[0][0]).toBe("submit-sa-signature");
    expect(nochDa()).toEqual([]);
    // Ein anderer Kontakt bleibt unberührt.
    expect(localStorage.getItem("mi_selbstauskunft_k2_i9")).toBe("{}");
    // Ohne Anmeldung kein Schreibversuch in die Nutzereinstellungen.
    expect(setUserSettingSpy).not.toHaveBeenCalled();
  });

  it("CRM-Weg: nach dem Anfordern der Unterschrift ist der lokale Entwurf weg, Nutzereinstellungen wie bisher", async () => {
    zustand.nutzerId = "berater-1";
    legeAlteEntwuerfeAn();
    // Am Investment liegt immer ein vollständiger Stand.
    saDataAmInvestment.wert = { ...JSON.parse(JSON.stringify(EMPTY_DATA)), ...beantwortet };
    invokeSpy.mockResolvedValue({ data: { results: [{ sent: true }] }, error: null });
    const fertig = vi.fn();
    render(<SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} onComplete={fertig} />);
    bisSchritt(7);
    fireEvent.click(document.getElementById("confirm-sa")!);
    fireEvent.click(screen.getByText("Unterschrift anfordern").closest("button")!);

    await waitFor(() => expect(fertig).toHaveBeenCalled());
    expect(invokeSpy.mock.calls.at(-1)?.[0]).toBe("send-signature-request");
    expect(nochDa()).toEqual([]);
    // Angemeldet: Der Entwurf geht wie bisher in die Nutzereinstellungen.
    expect(setUserSettingSpy.mock.calls.some((c) => c[0] === "sa_drafts")).toBe(true);
    // Auch das Autospeichern danach schreibt ihn nicht zurück.
    await new Promise((r) => setTimeout(r, 1800));
    expect(nochDa()).toEqual([]);
  });

  it("Kundenlink: Zwischenspeichern legt den Stand nur in den Sitzungsspeicher", async () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={beantwortet}
        customerMode saToken={"c".repeat(64)} onHinweisSchritt={() => {}} />,
    );
    fireEvent.click(screen.getByText("Zwischenspeichern").closest("button")!);
    await waitFor(() => expect(sessionStorage.getItem("mi_selbstauskunft_k1_i1")).not.toBeNull());
    expect(localStorage.getItem("mi_selbstauskunft_k1_i1")).toBeNull();
    expect(setUserSettingSpy).not.toHaveBeenCalled();
  });

  it("Mahnverfahren und Schufa sind nicht vorbelegt, ohne Antwort geht es nicht weiter", () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={grundStand}
        customerMode saToken={"c".repeat(64)} onHinweisSchritt={() => {}} />,
    );
    bisSchritt(6);
    expect(titel()).toBe("Sonstige Angaben");
    expect(document.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(0);

    weiter();
    expect(titel()).toBe("Sonstige Angaben");
    expect(document.querySelectorAll("[data-sa-fehler]").length).toBe(2);
    expect(toastSpy.mock.calls.at(-1)?.[0].title).toBe("Pflichtfelder ausfüllen");

    radio("mv-n");
    weiter();
    expect(titel()).toBe("Sonstige Angaben");
    radio("sf-n");
    weiter();
    expect(titel()).toBe("Abschluss");
  });

  it("Person 2 muss beide Fragen ebenfalls selbst beantworten", () => {
    const stand = {
      ...beantwortet,
      person2: true,
      person2Data: {
        ...EMPTY_PERSON,
        vorname: "John", nachname: "Doe", geburtsdatum: "01.01.1984", familienstand: "Verheiratet",
        steuerklasse: "4", kirchensteuer: "nein", beschaeftigungsart: "angestellt", bruttoJahr: "50.000",
        anstellung: { branche: "IT", firma: "Acme", berufsbezeichnung: "Engineer", angestelltSeit: "01.01.2016", probezeit: "nein" },
        einkommen: { netto: "2.500", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
        mietart: "Zur Miete", mieteWarm: "0",
        kredite: [], vermoegenswerte: [], buergschaften: [], bankkonten: [],
      },
    };
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={stand}
        customerMode saToken={"c".repeat(64)} onHinweisSchritt={() => {}} />,
    );
    bisSchritt(6);
    expect(titel()).toBe("Sonstige Angaben");
    weiter();
    expect(titel()).toBe("Sonstige Angaben");
    expect(document.querySelectorAll("[data-sa-fehler]").length).toBe(2);
    radio("mv-j-p2");
    radio("sf-n-p2");
    weiter();
    expect(titel()).toBe("Abschluss");
  });

  it("nurDauerhaft: löscht den localStorage, lässt den Sitzungsentwurf stehen", () => {
    localStorage.setItem("mi_selbstauskunft_k9_i9", "{}");
    sessionStorage.setItem("mi_selbstauskunft_k9_i9", "{}");
    loescheLokalenSaEntwurf("k9", "i9", true);
    expect(localStorage.getItem("mi_selbstauskunft_k9_i9")).toBeNull();
    expect(sessionStorage.getItem("mi_selbstauskunft_k9_i9")).toBe("{}");
    sessionStorage.removeItem("mi_selbstauskunft_k9_i9");
  });

  it("gesperrter Speicher: Löschen stürzt nicht ab", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("SecurityError"); },
    });
    expect(() => loescheLokalenSaEntwurf("k1", "i1")).not.toThrow();
  });
});
