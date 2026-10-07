import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/**
 * Kredite in der Selbstauskunft (28.09.2026).
 *
 * Geprüft wird der Weg durch das Formular: Weiter bleibt im Schritt Ausgaben
 * stehen, bis die Kreditdetails vollständig sind; eine alte, unvollständige
 * Selbstauskunft lädt ohne Fehler; und in Schritt Vermögenswerte kommt die
 * Frage nach dem Kredit, wenn eine Immobilie ohne Immobilienkredit angegeben
 * ist.
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

import { SelbstauskunftForm, EMPTY_PERSON } from "./SelbstauskunftForm";

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
  wohnhaftSeit: "Mehr als 5 Jahre", familienstand: "Verheiratet",
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
const knopfMitText = (text: string) => screen.getByText(text).closest("button")!;
const weiter = () => fireEvent.click(knopf("Weiter"));
const zurueck = () => fireEvent.click(knopf("Zurück"));
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

describe("Kredite: Pflicht je Kreditart und Gegenprüfung", { timeout: 20000 }, () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: speicherErsatz(), configurable: true, writable: true });
    toastSpy.mockReset();
    auswahlSpy.mockReset();
    cleanup();
  });

  it("Weiter bleibt bei unvollständigen Kreditdetails stehen und nennt die fehlenden Angaben", () => {
    const stand = {
      ...grundStand,
      kredite: [{ art: "Hausbank", kategorie: "ratenkredit", rate: "200", restschuld: "5.000", laufzeitEnde: "01.01.2030" }],
    };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(3);
    expect(titel()).toBe("Ausgaben");
    // Die Bank-Ergänzung ist beim Ratenkredit sichtbar, die Zinsart nicht.
    expect(screen.getByText("Bank-Ergänzung: Kredit-Details")).toBeTruthy();
    expect(screen.queryByText("Zins fest oder variabel")).toBeNull();

    weiter();
    expect(titel()).toBe("Ausgaben");
    expect(markierte()).toBeGreaterThan(0);
    const hinweis = toastSpy.mock.calls.at(-1)?.[0];
    expect(hinweis.title).toBe("Pflichtfelder ausfüllen");
    expect(hinweis.description).toContain("Bei Kredit 1 fehlen noch:");
    expect(hinweis.description).toContain("Bank / Darlehensgeber");
    expect(hinweis.description).toContain("Restschuld per");
    expect(hinweis.description).not.toContain("Zinssatz");

    tippe("Restschuld per", "01.09.2026");
    tippe("Bank / Darlehensgeber", "Hausbank eG");
    tippe("Ursprungskredit", "10.000");
    tippe("Vertragsbeginn", "01.01.2023");
    tippe("Verwendungszweck", "Küche");
    weiter();
    expect(titel()).toBe("Vermögenswerte");
  });

  it("über die Fortschrittsleiste lässt sich die Pflicht nicht überspringen", () => {
    const stand = { ...grundStand, kredite: [{ art: "", kategorie: "kfz_leasing", rate: "300", restschuld: "", laufzeitEnde: "" }] };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(3);
    fireEvent.click(knopfMitText("Sonstige Angaben"));
    expect(titel()).toBe("Ausgaben");
  });

  it("eine alte, unvollständige Selbstauskunft lädt und zeigt ihre Werte ohne Fehlermarken", () => {
    const alt = {
      ...grundStand,
      abgeschlossen: true,
      kredite: [{ art: "VW Bank", rate: "250", restschuld: "12000", laufzeitEnde: "01.01.2028", zinssatz: "4.5" }],
      immobilien: [{ eigentuemer: "Jane Doe", art: "ETW", adresse: "Musterweg 1", baujahr: "1990", grundstueckM2: "", wohnflaecheM2: "60", nutzung: "fremd", marktwert: "300000", kaltmieteIst: "700", kaltmieteZukunft: "" }],
    };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={alt} korrekturMode onKorrekturSave={() => {}} onHinweisSchritt={() => {}} />);
    bisSchritt(3);
    expect(titel()).toBe("Ausgaben");
    expect(screen.getByDisplayValue("VW Bank")).toBeTruthy();
    expect(screen.getByDisplayValue("4.5")).toBeTruthy();
    expect(markierte()).toBe(0);
    // Erst beim nächsten Weiter greift die Pflicht: Die Art fehlt.
    weiter();
    expect(titel()).toBe("Ausgaben");
    expect(toastSpy.mock.calls.at(-1)?.[0].description).toContain("Art des Kredits");
  });

  it("Immobilie ohne Kredit, Antwort „Nein, schuldenfrei“: weiter, gemerkt, keine zweite Frage", async () => {
    auswahlSpy.mockResolvedValue("schuldenfrei");
    const stand = { ...grundStand, vermoegenswerte: [{ art: "Immobilien", institut: "", betrag: "" }] };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(4);
    expect(titel()).toBe("Vermögenswerte");
    weiter();
    await waitFor(() => expect(titel()).toBe("Verbindlichkeiten"));
    expect(auswahlSpy).toHaveBeenCalledTimes(1);
    const frage = auswahlSpy.mock.calls[0][0];
    expect(frage.title).toBe("Wird die Immobilie noch abbezahlt?");
    expect(frage.optionen.map((o: { text: string }) => o.text)).toEqual(["Nein, schuldenfrei", "Ja, Kredit eintragen"]);

    zurueck();
    weiter();
    await waitFor(() => expect(titel()).toBe("Verbindlichkeiten"));
    expect(auswahlSpy).toHaveBeenCalledTimes(1);
  });

  it("Immobilie ohne Kredit, Antwort „Ja, Kredit eintragen“: zurück zu Ausgaben mit neuem Immobilienkredit", async () => {
    auswahlSpy.mockResolvedValue("kredit");
    const stand = {
      ...grundStand,
      immobilien: [{ eigentuemer: "Jane Doe", art: "ETW", adresse: "Musterweg 1", baujahr: "1990", grundstueckM2: "0", wohnflaecheM2: "60", nutzung: "eigen", marktwert: "300000", kaltmieteIst: "0", kaltmieteZukunft: "" }],
    };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(4);
    weiter();
    await waitFor(() => expect(titel()).toBe("Ausgaben"));
    // Neuer Eintrag mit den Feldern des Immobilienkredits, der Immobilie schon zugeordnet.
    expect(screen.getByText("Zins fest oder variabel")).toBeTruthy();
    expect(screen.getByText("Sondertilgungsrecht")).toBeTruthy();
    expect(screen.getByText("Immobilie 1: Musterweg 1")).toBeTruthy();
    // Ohne die Kreditdetails geht es nicht weiter.
    weiter();
    expect(titel()).toBe("Ausgaben");
    expect(toastSpy.mock.calls.at(-1)?.[0].description).toContain("Zins fest oder variabel");
  });

  it("Dialog ohne Wahl geschlossen: auf Vermögenswerte bleiben, nichts merken", async () => {
    auswahlSpy.mockResolvedValue(null);
    const stand = { ...grundStand, vermoegenswerte: [{ art: "Immobilien", institut: "", betrag: "" }] };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(4);
    weiter();
    await waitFor(() => expect(auswahlSpy).toHaveBeenCalledTimes(1));
    expect(titel()).toBe("Vermögenswerte");
    weiter();
    await waitFor(() => expect(auswahlSpy).toHaveBeenCalledTimes(2));
  });

  it("Immobilienkredit ohne erfasste Immobilie: Hinweis mit Weg zu den Vermögenswerten statt unerfüllbarem Feld", () => {
    const stand = { ...grundStand, kredite: [{ art: "", kategorie: "immobilienkredit", rate: "900", restschuld: "", laufzeitEnde: "" }] };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(3);
    expect(screen.queryByText("Gehört zu Immobilie")).toBeNull();
    fireEvent.click(knopfMitText("Zu den Vermögenswerten"));
    expect(titel()).toBe("Vermögenswerte");
    // Ohne Immobilie geht es auch hier nicht weiter.
    weiter();
    expect(titel()).toBe("Vermögenswerte");
    expect(screen.getByText("Für einen Immobilienkredit fehlt die belastete Immobilie. Bitte legen Sie sie hier an.")).toBeTruthy();
  });

  it("Person 2 hat eigene Bank-Ergänzung, eigenen Immobilienblock und fragt den Kreditnehmer ab", () => {
    const stand = {
      ...grundStand,
      person2: true,
      person2Data: {
        ...EMPTY_PERSON,
        vorname: "John", nachname: "Doe", geburtsdatum: "01.01.1984", familienstand: "Verheiratet",
        steuerklasse: "4", kirchensteuer: "nein", beschaeftigungsart: "angestellt", bruttoJahr: "50.000",
        anstellung: { branche: "IT", firma: "Acme", berufsbezeichnung: "Engineer", angestelltSeit: "01.01.2016", probezeit: "nein" },
        einkommen: { netto: "2.500", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
        mietart: "Zur Miete", mieteWarm: "0",
        kredite: [{ art: "", kategorie: "dispo", rate: "", restschuld: "", laufzeitEnde: "" }],
        vermoegenswerte: [], buergschaften: [], bankkonten: [],
      },
    };
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} prefillSaData={stand} customerMode saToken="abc" onHinweisSchritt={() => {}} />);
    bisSchritt(3);
    expect(titel()).toBe("Ausgaben");
    expect(screen.getByText("Bank-Ergänzung: Kredit-Details Person 2")).toBeTruthy();
    expect(screen.getByText("Kreditnehmer")).toBeTruthy();
    weiter();
    expect(titel()).toBe("Ausgaben");
    expect(toastSpy.mock.calls.at(-1)?.[0].description).toContain("von Person 2");
  });
});
