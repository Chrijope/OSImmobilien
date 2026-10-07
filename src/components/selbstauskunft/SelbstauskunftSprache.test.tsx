import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/**
 * Die Selbstauskunft in der Kundensprache (Plan Kundensprache, Etappe 4).
 *
 * Ohne `sprache` bleibt das Formular genau wie bisher deutsch. Mit
 * `sprache="en"` sieht der Kunde alles auf Englisch, gespeichert und an den
 * Server geschickt wird aber weiter der deutsche Stand: „Verheiratet“, nicht
 * „Married“, und „2.500“, nicht „2,500“.
 */

const rpcAufrufe: { name: string; args: Record<string, unknown> }[] = [];

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
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
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcAufrufe.push({ name, args });
        return { data: null, error: null };
      },
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

// Der QR-Code zeichnet nur Pfade; für den Test genügt der Link, den er trägt.
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

import { EMPTY_PERSON, SelbstauskunftForm } from "./SelbstauskunftForm";
import { SA_EINWILLIGUNG, SA_ERKLAERUNG, SA_SCHUFA_KLAUSEL } from "@/lib/selbstauskunftSprache";
import { DEUTSCHES_ORIGINAL_ZEIGEN, VORRANGKLAUSEL } from "@/lib/zweisprachig";

const kontakt = {
  id: "k1", vorname: "Jane", nachname: "Doe", email: "jane@example.test", telefon: "+49 151 1234567",
  strasse: "", hausnummer: "", plz: "", ort: "", anrede: "Frau", geburtstag: "", person2: null,
} as never;

/** Ein Stand, der die Prüfungen aller Schritte besteht, damit man bis zum Abschluss kommt. */
const vollerStand = {
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
const weiter = (text: string) => fireEvent.click(screen.getAllByRole("button", { name: text }).at(-1)!);

/** Das Eingabefeld unter einer Beschriftung (Field verbindet sie nicht per htmlFor). */
function feldUnter(beschriftung: string): HTMLInputElement {
  const label = screen.getAllByText(beschriftung).find((el) => el.closest("label"));
  const input = label?.closest("label")?.parentElement?.querySelector("input");
  if (!input) throw new Error(`Kein Feld unter „${beschriftung}“`);
  return input as HTMLInputElement;
}

/** Der zuletzt an den Server geschickte Stand des Kunden. */
function letzterStand(): Record<string, unknown> | undefined {
  const aufrufe = rpcAufrufe.filter((a) => a.name === "update_sa_fill_token_data");
  return aufrufe.at(-1)?.args._data as Record<string, unknown> | undefined;
}

// Das Formular ist groß; der Weg durch alle acht Schritte dauert im vollen Lauf
// mehrere Sekunden. Die großzügige Grenze verhindert Fehlalarme.
describe("Selbstauskunft in der Kundensprache", { timeout: 20000 }, () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: speicherErsatz(), configurable: true, writable: true });
    rpcAufrufe.length = 0;
    cleanup();
  });

  it("ohne Prop deutsch wie bisher", () => {
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} />);
    expect(titel()).toBe("Wünsche & Ziele");
    expect(screen.getByText("Selbstauskunft")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Weiter" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Vermögensaufbau und Werte schaffen")).toBeTruthy();
  });

  it("auf Englisch: Schrittnamen, Knöpfe und Ziele englisch", () => {
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} sprache="en" customerMode saToken="abc" />);
    expect(titel()).toBe("Goals and objectives");
    expect(screen.getByText("Self-disclosure")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Next" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Save progress")).toBeTruthy();
    expect(screen.getByText("Building wealth and creating value")).toBeTruthy();
    expect(screen.getByText("💡 Note")).toBeTruthy();
    expect(screen.queryByText("Weiter")).toBeNull();
  });

  it("zeigt „Married“, schickt aber „Verheiratet“ an den Server", async () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={vollerStand}
        sprache="en" customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    weiter("Next");
    expect(titel()).toBe("Personal details");
    expect(screen.getByText("Married")).toBeTruthy();
    expect(screen.queryByText("Verheiratet")).toBeNull();
    expect(screen.getByText("More than 5 years")).toBeTruthy();

    // Gespeichert wird erst nach einer Änderung des Kunden (28.09.2026).
    fireEvent.change(feldUnter("Street"), { target: { value: "Musterweg 2" } });
    await waitFor(() => expect(letzterStand()?.familienstand).toBe("Verheiratet"), { timeout: 3000 });
    expect(letzterStand()?.wohnhaftSeit).toBe("Mehr als 5 Jahre");
  });

  it("Betrag englisch getippt: „2,500“ steht im Feld, „2.500“ geht an den Server", async () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={vollerStand}
        sprache="en" customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    weiter("Next");
    weiter("Next");
    expect(titel()).toBe("Income");

    // Der vorhandene Wert „60.000“ erscheint englisch.
    const brutto = feldUnter("Annual gross income (total)");
    expect(brutto.value).toBe("60,000");

    fireEvent.change(brutto, { target: { value: "2,500" } });
    expect(feldUnter("Annual gross income (total)").value).toBe("2,500");
    await waitFor(() => expect(letzterStand()?.bruttoJahr).toBe("2.500"), { timeout: 3000 });

    fireEvent.change(feldUnter("Net salary"), { target: { value: "3,250.50" } });
    await waitFor(() => expect((letzterStand()?.einkommen as { netto: string }).netto).toBe("3.250,50"), { timeout: 3000 });
    expect(feldUnter("Net salary").value).toBe("3,250.50");
  });

  it("auf Deutsch bleibt die Betragseingabe wie bisher", () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={vollerStand}
        customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    weiter("Weiter");
    weiter("Weiter");
    const brutto = feldUnter("Jahresbrutto (gesamt)");
    expect(brutto.value).toBe("60.000");
    fireEvent.change(brutto, { target: { value: "2500,5" } });
    expect(feldUnter("Jahresbrutto (gesamt)").value).toBe("2.500,5");
  });

  it("Abschluss auf Englisch: Erklärung zweisprachig, Einwilligung englisch, QR-Link mit lang=en", () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={vollerStand}
        sprache="en" customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    for (let i = 0; i < 7; i++) weiter("Next");
    expect(titel()).toBe("Completion");

    const kasten = screen.getByTestId("sa-erklaerung-en");
    expect(kasten.textContent).toContain("Declaration");
    expect(kasten.textContent).toContain(SA_ERKLAERUNG.en);
    expect(kasten.textContent).toContain(SA_SCHUFA_KLAUSEL.en);
    expect(kasten.textContent).toContain(VORRANGKLAUSEL.en);
    expect(kasten.textContent).toContain(VORRANGKLAUSEL.de);
    // Der deutsche Wortlaut liegt aufklappbar darunter.
    expect(kasten.textContent).toContain(SA_ERKLAERUNG.de);
    expect(screen.getAllByText(DEUTSCHES_ORIGINAL_ZEIGEN).length).toBe(3);

    const einwilligung = document.querySelector('label[for="confirm-sa"]');
    expect(einwilligung?.textContent).toBe(SA_EINWILLIGUNG.en);

    const qr = screen.getByTestId("qr").getAttribute("data-value") || "";
    expect(qr).toContain("lang=en");
    expect(qr).toContain(`label=${encodeURIComponent("Signature Person 1")}`);
    expect(screen.getByRole("button", { name: /Sign and submit/ })).toBeTruthy();
  });

  it("Abschluss auf Deutsch: Einwilligung zeichengleich, kein Erklärungskasten, QR-Link ohne lang", () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={vollerStand}
        customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    for (let i = 0; i < 7; i++) weiter("Weiter");
    expect(titel()).toBe("Abschluss");
    expect(screen.queryByTestId("sa-erklaerung-en")).toBeNull();
    expect(screen.queryByText(DEUTSCHES_ORIGINAL_ZEIGEN)).toBeNull();
    const einwilligung = document.querySelector('label[for="confirm-sa"]');
    expect(einwilligung?.textContent).toBe(
      "Ich bestätige die Richtigkeit und Vollständigkeit meiner Angaben in der Selbstauskunft. "
        + "Ich bin damit einverstanden, dass meine Unterschrift elektronisch erfasst, gespeichert und "
        + "zur Dokumentation der Selbstauskunft verwendet wird. (EES gemäß eIDAS-Verordnung)",
    );
    expect(einwilligung?.textContent).toBe(SA_EINWILLIGUNG.de);
    const qr = screen.getByTestId("qr").getAttribute("data-value") || "";
    expect(qr).not.toContain("lang=");
    expect(qr).toContain(`label=${encodeURIComponent("Unterschrift Person 1")}`);
  });

  it("Korrektur auf Englisch: Erklärungskasten über dem Knopf", () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={vollerStand}
        sprache="en" korrekturMode onKorrekturSave={() => {}} />,
    );
    for (let i = 0; i < 7; i++) weiter("Next");
    expect(screen.getByTestId("sa-erklaerung-en")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Apply corrections/ })).toBeTruthy();
  });
});

describe("Selbstauskunft, zu versteuerndes Jahreseinkommen (05.10.2026)", { timeout: 20000 }, () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: speicherErsatz(), configurable: true, writable: true });
    rpcAufrufe.length = 0;
    cleanup();
  });

  it("auf Englisch: Feld, Fundstelle und Hinweis bei Verheirateten, gespeichert deutsch", async () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt} prefillSaData={vollerStand}
        sprache="en" customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    weiter("Next");
    weiter("Next");
    expect(titel()).toBe("Income");
    expect(screen.getByText(/If you are assessed jointly, please enter the joint taxable income/)).toBeTruthy();
    expect(screen.getAllByText(/most recent income tax assessment notice/).length).toBeGreaterThan(0);
    fireEvent.change(feldUnter("Taxable annual income"), { target: { value: "71,500" } });
    await waitFor(() => expect(letzterStand()?.zvEJahr).toBe("71.500"), { timeout: 3000 });
  });

  it("auf Deutsch ledig: Feld ohne Hinweis zur Zusammenveranlagung", () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt}
        prefillSaData={{ ...vollerStand, familienstand: "Ledig", steuerklasse: "1" }}
        customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    weiter("Weiter");
    weiter("Weiter");
    expect(feldUnter("Zu versteuerndes Jahreseinkommen")).toBeTruthy();
    expect(screen.getAllByText(/Zeile „zu versteuerndes Einkommen“/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Bei Zusammenveranlagung/)).toBeNull();
  });

  it("verheiratet mit Person 2: ein gemeinsames Feld, Person 2 verweist auf Person 1", () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt}
        prefillSaData={{
          ...vollerStand,
          person2: true,
          person2Data: { ...EMPTY_PERSON, vorname: "John", nachname: "Doe", geburtsdatum: "03.04.1984", familienstand: "Verheiratet", steuerklasse: "4", kirchensteuer: "nein", beschaeftigungsart: "hausfrau" },
        }}
        customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    weiter("Weiter");
    weiter("Weiter");
    expect(screen.getByText("Bei Zusammenveranlagung tragen Sie bitte das gemeinsame zu versteuernde Einkommen laut Steuerbescheid ein.")).toBeTruthy();
    expect(screen.getByText("Zu versteuerndes Jahreseinkommen: gemeinsam mit Person 1 angegeben.")).toBeTruthy();
    expect(screen.getAllByText("Zu versteuerndes Jahreseinkommen").length).toBe(1);
  });
});

describe("Selbstauskunft, zvE beim Wechsel des Familienstands (05.10.2026)", { timeout: 20000 }, () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: speicherErsatz(), configurable: true, writable: true });
    // Radix Select braucht im jsdom diese beiden Browserfunktionen.
    Element.prototype.scrollIntoView = () => {};
    Element.prototype.hasPointerCapture = () => false;
    rpcAufrufe.length = 0;
    cleanup();
  });

  /** Den Familienstand von Person 1 über die Auswahl ändern. */
  function familienstandWaehlen(von: string, nach: string) {
    const ausloeser = screen.getAllByRole("combobox").find((el) => el.textContent === von);
    if (!ausloeser) throw new Error(`Keine Auswahl mit „${von}“`);
    fireEvent.keyDown(ausloeser, { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: nach }));
  }

  it("Ledig zu Verheiratet leert das persönliche zvE von Person 1 und Person 2", async () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt}
        prefillSaData={{
          ...vollerStand,
          familienstand: "Ledig",
          zvEJahr: "48.000",
          person2: true,
          person2Data: { ...EMPTY_PERSON, vorname: "John", nachname: "Doe", zvEJahr: "31.000" },
        }}
        customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    weiter("Weiter");
    expect(titel()).toBe("Persönliche Angaben");
    familienstandWaehlen("Ledig", "Verheiratet");
    await waitFor(() => expect(letzterStand()?.familienstand).toBe("Verheiratet"), { timeout: 3000 });
    expect(letzterStand()?.zvEJahr).toBe("");
    expect((letzterStand()?.person2Data as { zvEJahr?: string }).zvEJahr).toBe("");
  });

  it("ein Wechsel ohne Bedeutungswechsel behält das zvE", async () => {
    render(
      <SelbstauskunftForm kundeId="k1" investmentId="i1" prefillKontakt={kontakt}
        prefillSaData={{ ...vollerStand, familienstand: "Ledig", zvEJahr: "48.000" }}
        customerMode saToken="abc" onHinweisSchritt={() => {}} />,
    );
    weiter("Weiter");
    familienstandWaehlen("Ledig", "Geschieden");
    await waitFor(() => expect(letzterStand()?.familienstand).toBe("Geschieden"), { timeout: 3000 });
    expect(letzterStand()?.zvEJahr).toBe("48.000");
  });
});
