import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plan Kundensprache, Etappe 5: die übrigen Kunden-PDFs auf Englisch.
 *
 * Investment-Analyse (D14), Wohnungsexposé (D12),
 * Checkliste Bonitätsunterlagen (D18) und Aftersales-Dokument (D17) tragen auf
 * Englisch englische Überschriften und bleiben ohne Sprache deutsch. Die
 * Anlage V bleibt immer deutsch (Entscheidung 8), sie hat gar keinen
 * Sprachparameter.
 *
 * jsPDF ist eine Attrappe, die jeden Aufruf schluckt und nur die gesetzten
 * Texte samt Deckblattangaben einsammelt.
 */
const mitschnitt = vi.hoisted(() => ({ texte: [] as string[], gespeichert: [] as string[] }));

vi.mock("jspdf", () => {
  class GState { constructor(_: unknown) {} }
  class JsPdfAttrappe {
    private seiten = 1;
    constructor() {
      // Alles, was hier nicht steht, ist ein Zeichenaufruf ohne Wirkung.
      return new Proxy(this, {
        get(ziel, name) {
          if (name in ziel) return (ziel as Record<string | symbol, unknown>)[name];
          // Kein `then`: sonst hielte `await` die Attrappe für ein Versprechen und wartete ewig.
          if (name === "then") return undefined;
          return () => ziel;
        },
      });
    }
    text(t: string | string[]) { for (const z of Array.isArray(t) ? t : [t]) mitschnitt.texte.push(String(z)); return this; }
    addPage() { this.seiten += 1; return this; }
    getNumberOfPages() { return this.seiten; }
    getTextWidth(s: string) { return String(s).length * 1.5; }
    splitTextToSize(s: string) { return [String(s)]; }
    getImageProperties() { return { width: 3, height: 2 }; }
    save(name: string) { mitschnitt.gespeichert.push(name); }
    output() { return new Blob(["pdf"], { type: "application/pdf" }); }
    roundedRect() { return undefined; }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});
vi.stubGlobal("fetch", () => Promise.reject(new Error("kein Netz im Test")));

import { ANALYSE_TEXTE_DE, ANALYSE_TEXTE_EN, generateInvestmentAnalysePdf, type InvestmentPdfData } from "@/lib/investmentAnalysePdf";
import { BANK_DOKUMENTE_EN, checklisteBonitaetEnglisch, generateChecklisteBonitaetPDF } from "@/lib/unterlagenPdfContent";
import { buildBankpruefungBaseDocs } from "@/lib/bankpruefungDocs";
import { generateAftersalesBeratungPDF } from "@/lib/aftersalesBeratungPdf";
import { AFTERSALES_TEXTE } from "../../supabase/functions/_shared/aftersales-beratung-texte.ts";
import { erzeugeAnlageVPdf } from "@/lib/anlageVPdf";
import { baueAnlageVAufstellung, type AnlageVInvestment } from "@/lib/anlageVExport";

const GEDANKENSTRICH = /[–—]/;
const alle = () => mitschnitt.texte.join("\n").replace(/[  ]/g, " ");

/** Alle Blätter eines Textobjekts mit Pfad; Funktionen mit Beispielwerten. */
function blaetter(wert: unknown, pfad = ""): Array<[string, string]> {
  if (typeof wert === "string") return [[pfad, wert]];
  if (typeof wert === "function") {
    const probe = new Proxy({}, { get: () => "x" });
    const f = wert as (...a: unknown[]) => unknown;
    const ergebnis = f.length === 1 && pfad.endsWith("absaetze") ? f(probe) : f(3, 4);
    return blaetter(ergebnis, pfad);
  }
  if (Array.isArray(wert)) return wert.flatMap((w, i) => blaetter(w, `${pfad}[${i}]`));
  if (wert && typeof wert === "object") return Object.entries(wert).flatMap(([k, v]) => blaetter(v, pfad ? `${pfad}.${k}` : k));
  return [];
}

function pruefeTextpaar(de: unknown, en: unknown) {
  const d = blaetter(de);
  const e = blaetter(en);
  expect(e.map(([p]) => p)).toEqual(d.map(([p]) => p));
  for (const [pfad, text] of e) expect(GEDANKENSTRICH.test(text), pfad).toBe(false);
}

beforeEach(() => {
  mitschnitt.texte.length = 0;
  mitschnitt.gespeichert.length = 0;
});

describe("Investment-Analyse", () => {
  const zeile = {
    jahr: 1, afa: 4000, zinsen: 8000, tilgung: 3000, hausgeldNu: 600, abzuegeSumme: 12600, steuerlichesErgebnis: -2000,
    steuerersparnis: 800, miete: 10800, cashflowBrutto: -1200, cashflowNetto: -400, eigenbelastungVorSteuer: 100,
    eigenbelastungNachSteuer: 33, tilgungKumuliert: 3000, wertsteigerungJahr: 5000, vermoegenAufbau: 8000,
    vermoegenKumuliert: 8000, restschuld: 197000, immobilienWert: 255000, renditeNachSteuer: 3,
  };
  const daten: InvestmentPdfData = {
    objektTitel: "Haus am Park", weNr: "7", modus: "wohnung", kaufpreis: 250000, mieteMonat: 900, groesse: 60, nkPct: 10,
    hausgeldMonat: 300, hausgeldUmlagefaehig: 200, hausgeldNichtUmlagefaehig: 100, eigenkapital: 0, sanierungskosten: 0,
    sanierungAnteil: 0, grundAnteilPct: 20, gebaeudeAnteilPct: 80, gebaeudeWert: 200000, afaModell: "linear", afaSatz: 2,
    effektiverAfaSatz: 2, restnutzungsdauer: 50, afaJahr: 4000, afaGesamt: 4000,
    tranchen: [{ bezeichnung: "Bank", betrag: 200000, zinssatz: 4, tilgung: 1.5 }],
    gesamtDarlehen: 200000, gewichteterZins: 4, gewichteteTilgung: 1.5, monatsrate: 916, steuersatz: 42,
    mietSteigerung: 2, wertSteigerung: 2, betrachtungszeitraum: 10, berechnung: [zeile], totalSteuerersparnis: 800,
    totalCashflow: -400, avgRendite: 3,
  };

  it("hat deckungsgleiche Texte ohne Gedankenstriche", () => pruefeTextpaar(ANALYSE_TEXTE_DE, ANALYSE_TEXTE_EN));

  it("schreibt auf Englisch englische Überschriften", async () => {
    await generateInvestmentAnalysePdf({ ...daten, sprache: "en" });
    const text = alle();
    for (const t of ["INVESTMENT ANALYSIS", "Basic data", "Tax parameters", "Detailed annual overview", "Page 1", "€250,000"]) {
      expect(text, t).toContain(t);
    }
    expect(text).not.toContain("Basisdaten");
  });

  it("bleibt ohne Sprache deutsch", async () => {
    await generateInvestmentAnalysePdf(daten);
    expect(alle()).toContain("Basisdaten");
    expect(alle()).toContain("Seite 1");
  });
});

describe("Checkliste Bonitätsunterlagen", () => {
  it("kennt jeden Dokumentnamen der Bankprüfung auf Englisch", () => {
    const namen = new Set<string>();
    for (const art of ["angestellt", "beamter", "selbstaendig"]) {
      for (const d of buildBankpruefungBaseDocs({ beschaeftigungsart: art, person: 1, variant: "admin", privateKV: 100 })) namen.add(d.name);
    }
    for (const name of namen) expect(BANK_DOKUMENTE_EN[name], name).toBeTruthy();
  });

  it("schreibt auf Englisch nur englische Positionen", async () => {
    const konfig = checklisteBonitaetEnglisch();
    expect(konfig.deckblatt?.sprache).toBe("en");
    const texte = konfig.blocks.map((b) => ("text" in b ? String(b.text) : "")).join("\n");
    expect(texte).toContain("Wage tax certificate for the previous year");
    expect(texte).not.toMatch(/Arbeitsvertrag|falls vorhanden|Gehaltsabrechnungen/);
    await generateChecklisteBonitaetPDF("en");
    expect(alle()).toContain("For everyone");
    expect(mitschnitt.gespeichert[0]).toBe("MOREImmo_Checklist_credit_check_documents.pdf");
  });

  it("bleibt ohne Sprache deutsch", async () => {
    await generateChecklisteBonitaetPDF();
    expect(alle()).toContain("Für alle");
    expect(mitschnitt.gespeichert[0]).toBe("MOREImmo_Checkliste_Bonitaetsunterlagen.pdf");
  });
});

describe("Aftersales-Beratungsdokument", () => {
  const daten = { kundeName: "Jane Doe", vpName: "Max Muster", leistungen: { mieterwechsel: true } };

  it("hat eine Textquelle für Browser und Server, deckungsgleich und im Sie", () => {
    pruefeTextpaar(AFTERSALES_TEXTE.de, AFTERSALES_TEXTE.en);
    const deutsch = blaetter(AFTERSALES_TEXTE.de).map(([, t]) => t).join(" ");
    expect(deutsch).toContain("die Sie hierzu laufend betreut");
    expect(deutsch).not.toMatch(/\bdich\b|\bdu\b|\bdein/i);
  });

  it("schreibt auf Englisch englische Abschnitte", async () => {
    await generateAftersalesBeratungPDF(daten, undefined, "en");
    const text = alle();
    for (const t of ["1. Contracting parties", "2. Agreed after-sales services", "3. Contact schedule", "6. Signatures", "Pending"]) {
      expect(text, t).toContain(t);
    }
    expect(text).not.toContain("Vertragspartner");
  });

  it("bleibt ohne Sprache deutsch", async () => {
    await generateAftersalesBeratungPDF(daten);
    expect(alle()).toContain("1. Vertragspartner");
    expect(alle()).toContain("3. Kontakt-Rhythmus");
  });
});

describe("Anlage V", () => {
  const inv: AnlageVInvestment = {
    id: "t1", bezeichnung: "Testwohnung", kaufpreis: 300000, kaufdatum: "2024-05-15", baujahr: 1990, nebenkosten: 30000,
    darlehenssumme: 250000, offene_tilgung: 240000, zinssatz: 4, monatliche_rate: 1200, mieteinnahmen_kalt: 1000,
    hausgeld: 300, ruecklagen: 50, dokumente: [], meta: { erste_miete: "2024-06-01" }, gebaeude_anteil_prozent: 80,
    umlagen_monat: 200, grundsteuer_jahr: 400, versicherung_jahr: 300, verwaltungskosten_jahr: 350, hausgeld_nicht_umlage_monat: 90,
  };

  it("bleibt deutsch und hat keinen Sprachparameter (Entscheidung 8)", async () => {
    // Nur die Aufstellung, keine Sprache: Der Empfänger ist ein deutscher Steuerberater.
    expect(erzeugeAnlageVPdf.length).toBe(1);
    await erzeugeAnlageVPdf(baueAnlageVAufstellung(inv, { jahr: 2026, herkunft: "eigen" }));
    const text = alle();
    expect(text).toContain("Aufstellung zur Vorbereitung der Anlage V");
    expect(text).not.toMatch(/\b(Prepared for|Page \d|Income from letting)\b/);
  });
});
