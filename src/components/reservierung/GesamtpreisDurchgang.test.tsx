import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Der Gesamtpreis, vom Eintippen bis auf das gedruckte Papier.
 *
 * Anlass: In einer Reservierungsvereinbarung stand „650 €“, obwohl in der
 * Objektauswahl 650.000 eingetragen waren. Ursache war das PDF, das den mit
 * Tausenderpunkten geschriebenen Betrag mit `Number` las. `Number("650.000")`
 * ist 650, `Number("1.250.000")` ist gar keine Zahl. Behoben ist das in
 * `zahlAusText`.
 *
 * Ein Test allein am Umwandler hätte das nie gefunden, denn der Fehler saß
 * zwischen den Stationen. Deshalb läuft hier der ganze Weg an einem Stück:
 *
 *   Fenster der Objektauswahl  →  Ablage am Investment
 *   →  Vorbefüllung der Reservierungsvereinbarung  →  Zeile im PDF
 *
 * Geprüft wird mit einem sechs- und einem siebenstelligen Betrag, denn die
 * beiden fielen unterschiedlich um: der eine wurde tausendfach zu klein, der
 * andere wurde „NaN €“.
 */

/* ── Die Ablage, die alle vier Stationen teilen ── */
const metaFelder: Record<string, any> = {};
const investment: Record<string, any> = {
  id: "inv-1", kontaktId: "k-1", pipelineStufe: "beratungsgespraech",
};

const kontakt = {
  id: "k-1",
  vorname: "Anna", nachname: "Beispiel",
  email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München",
  geburtstag: "01.01.1980", steuerId: "123/456/78901",
};

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (id === investment.id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: any) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, any>) => { Object.assign(metaFelder, felder); },
  updateInvestment: (_id: string, felder: Record<string, any>) => { Object.assign(investment, felder); },
  getInvestmentsByKontakt: () => [{ ...investment, meta: metaFelder }],
}));

vi.mock("@/lib/objekteStore", () => ({
  getWohnungKurz: () => null,
  getObjektById: () => undefined,
  reserveWohnung: async () => {},
}));

vi.mock("@/lib/objektBildUpload", () => ({
  ladeObjektBildHoch: async () => ({ ok: true, url: "https://example.org/bild.jpg" }),
  loescheObjektBild: async () => {},
  ERLAUBTE_BILD_FORMATE: "image/jpeg,image/png,image/webp",
}));

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_k: string, fallback: any) => fallback,
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

/*
 * Das PDF ohne jsPDF.
 *
 * Interessant ist allein, welcher Text in der Zeile „Gesamtpreis“ landet.
 * Deshalb wird die Zeichenschicht ersetzt und jede gesetzte Zeile mitgeschrieben.
 * Das prüft die echte Datei `reservierungPdf.ts`, nicht eine Nachbildung.
 */
const pdfZeilen: Array<[string, string]> = [];

vi.mock("jspdf", () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    setFont() { return this; }
    setFontSize() { return this; }
    setTextColor() { return this; }
    setDrawColor() { return this; }
    setFillColor() { return this; }
    setLineWidth() { return this; }
    text() { return this; }
    line() { return this; }
    rect() { return this; }
    roundedRect() { return this; }
    addImage() { return this; }
    addPage() { return this; }
    getNumberOfPages() { return 2; }
    setPage() { return this; }
    addFileToVFS() { return this; }
    addFont() { return this; }
    getFontList() { return {}; }
    splitTextToSize(t: string) { return [t]; }
    getTextWidth() { return 10; }
    output() { return ""; }
    save() {}
  }
  return { default: FakeDoc };
});

vi.mock("@/lib/pdfBranding", () => ({
  BRAND: { primary: [0, 0, 0], muted: [0, 0, 0], text: [0, 0, 0], light: [0, 0, 0], separator: [0, 0, 0], accent: [0, 0, 0] },
  PDF_FONT: "helvetica",
  sanitizePdfText: (s: string) => s,
  loadLogo: async () => "",
  loadIcon: async () => "",
  ensureUnicodeFont: async () => {},
  addCoverPage: () => {},
  addBrandedHeader: () => 20,
  addBrandedFooter: () => {},
  brandedSectionTitle: (_d: unknown, _t: string, y: number) => y + 6,
  brandedRow: (_d: unknown, label: string, value: string, _x: number, y: number) => {
    pdfZeilen.push([label, value]);
    return y + 5;
  },
}));

const { ObjektDatenDialog } = await import("@/components/kunden/ObjektDatenDialog");
const { ReservierungsForm } = await import("@/components/reservierung/ReservierungsForm");
const { vorhandeneObjektDaten } = await import("@/lib/objektDatenPflicht");
const { generateReservierungPDF } = await import("@/lib/reservierungPdf");

/* ── Die vier Stationen als Schritte ── */

/** Station 1: den Betrag im Fenster der Objektauswahl eintippen und speichern. */
async function trageObjektEin(preisText: string) {
  render(
    <ObjektDatenDialog offen investmentId="inv-1" onAbbrechen={() => {}} onGespeichert={() => {}} />,
  );
  const tippe = (platzhalter: string, wert: string) =>
    fireEvent.change(screen.getByPlaceholderText(platzhalter), { target: { value: wert } });
  tippe("z. B. Roonstraße 3", "Roonstraße 3");
  tippe("95028", "95028");
  tippe("Hof", "Hof");
  tippe("z. B. 6", "6");
  tippe("z. B. 189000", preisText);
  /*
    Seit dem 22.09.2026 verlangt der Dialog beim Anlegen mindestens ein Bild.
    Ohne eines bleibt der Speichern-Knopf grau, und dieser Durchgang käme über
    Station 1 nicht hinaus.
  */
  const feld = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    fireEvent.change(feld, { target: { files: [new File(["x"], "bild.jpg", { type: "image/jpeg" })] } });
  });
  fireEvent.click(screen.getByRole("button", { name: "Speichern und später ergänzen" }));
  cleanup();
}

/** Station 3: die Reservierungsvereinbarung öffnen und ihr Preisfeld ablesen. */
function preisImFormular(): string {
  render(
    <MemoryRouter>
      <ReservierungsForm kundeId="k-1" investmentId="inv-1" />
    </MemoryRouter>,
  );
  // Die IBAN ist seit dem 15.09.2026 Pflicht, ohne sie geht es nicht weiter.
  fireEvent.change(screen.getByPlaceholderText("DE00 0000 0000 0000 0000 00"), { target: { value: "DE02120300000000202051" } });
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  const feld = screen.getByPlaceholderText("z.B. 363.000") as HTMLInputElement;
  const wert = feld.value;
  cleanup();
  return wert;
}

/** Station 4: aus genau diesem Feldwert das PDF setzen und die Zeile ablesen. */
async function preisImPdf(feldWert: string): Promise<string> {
  pdfZeilen.length = 0;
  await generateReservierungPDF({ gesamtpreis: feldWert } as never);
  return pdfZeilen.find(([label]) => label === "Gesamtpreis")?.[1] ?? "";
}

beforeEach(() => {
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
  investment.pipelineStufe = "beratungsgespraech";
  pdfZeilen.length = 0;
});

describe("Sechsstellig: 650.000 bleibt 650.000", () => {
  it("steht an jeder der vier Stationen richtig", async () => {
    await trageObjektEin("650.000");

    // Station 2: die Ablage am Investment.
    expect(vorhandeneObjektDaten("inv-1").kaufpreis).toBe(650000);
    expect(metaFelder.kaufpreis).toBe(650000);

    // Station 3: das Preisfeld der Reservierungsvereinbarung.
    const imFormular = preisImFormular();
    expect(imFormular).toBe("650.000");

    // Station 4: die gedruckte Zeile. Das schmale Leerzeichen von Intl wird
    // zum gewöhnlichen, damit der Vergleich lesbar bleibt.
    const gedruckt = (await preisImPdf(imFormular)).replace(/[\u00a0\u202f]/g, " ");
    expect(gedruckt).toBe("650.000 €");
    // Der eigentliche Rückfall, der behoben wurde.
    expect(gedruckt).not.toBe("650 €");
  });
});

describe("Siebenstellig: 1.250.000 wird nicht zu NaN", () => {
  it("steht an jeder der vier Stationen richtig", async () => {
    await trageObjektEin("1.250.000");

    expect(vorhandeneObjektDaten("inv-1").kaufpreis).toBe(1250000);
    expect(metaFelder.kaufpreis).toBe(1250000);

    const imFormular = preisImFormular();
    expect(imFormular).toBe("1.250.000");

    const gedruckt = (await preisImPdf(imFormular)).replace(/[\u00a0\u202f]/g, " ");
    expect(gedruckt).toBe("1.250.000 €");
    expect(gedruckt).not.toContain("NaN");
  });
});

/*
 * Der krumme Betrag.
 *
 * Er ist die Lücke, die nach der ersten Behebung noch offen war: Gespeichert
 * wird eine Zahl, ins Feld zurück ging sie über `String`, und aus 650000.5
 * wurde so "650000.5". Die Tausenderformatierung des Feldes liest jeden Punkt
 * als Trennzeichen und machte daraus 6.500.005, also fast das Zehnfache.
 * Seit `textAusZahl` geht der Rückweg denselben Weg wie der Hinweg.
 */
describe("Krumme Beträge werden nicht zum Zehnfachen", () => {
  it("schreibt 650.000,50 zurück und nicht 6.500.005", async () => {
    await trageObjektEin("650.000,50");

    expect(vorhandeneObjektDaten("inv-1").kaufpreis).toBe(650000.5);

    const imFormular = preisImFormular();
    expect(imFormular).toBe("650.000,5");
    expect(imFormular).not.toBe("6.500.005");

    const gedruckt = (await preisImPdf(imFormular)).replace(/[\u00a0\u202f]/g, " ");
    expect(gedruckt).toBe("650.001 €");
  });
});
