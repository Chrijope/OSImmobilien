import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Rauchtest des Startfahrplan-PDFs: jsPDF wird durch eine Attrappe ersetzt,
 * die alle Zeichenaufrufe schluckt und die gesetzten Texte einsammelt.
 * Geprueft wird, dass die Erzeugung nicht wirft, dass das Deckblatt im
 * Hausmuster gezeichnet wird, dass alle sieben Abschnitte vorhanden sind und
 * dass die Kernzahlen des Ein-Wege-Modells (kein laufendes Entgelt, Leadpaket
 * 2.500 Euro, Einzel-Lead 150 Euro, 4 % Provision) stimmen. Bauweise wie in
 * ablaufplanPdf.test.ts.
 */
const { texte, deckblaetter } = vi.hoisted(() => ({
  texte: [] as string[],
  deckblaetter: [] as Record<string, string | undefined>[],
}));

vi.mock("jspdf", () => {
  class GState { constructor(_: unknown) {} }
  class JsPdfAttrappe {
    private seiten = 1;
    addFileToVFS() {}
    addFont() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setGState() {}
    rect() {}
    roundedRect() {}
    ellipse() {}
    circle() {}
    line() {}
    text(t: string | string[]) {
      if (Array.isArray(t)) texte.push(...t.map(String));
      else texte.push(String(t));
    }
    addImage() {}
    addPage() { this.seiten += 1; }
    setPage() {}
    getNumberOfPages() { return this.seiten; }
    getTextWidth(s: string) { return String(s).length * 1.5; }
    splitTextToSize(s: string) { return [String(s)]; }
    output() { return new Blob(["pdf"]); }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});

// Das Deckblatt wird weiterhin echt gezeichnet, seine Angaben werden
// zusaetzlich mitgeschrieben. So laesst sich pruefen, dass der Startfahrplan
// das Hausdeckblatt ueberhaupt benutzt und mit welchen Angaben.
vi.mock("./pdfBranding", async (original) => {
  const echt = await original<typeof import("./pdfBranding")>();
  return {
    ...echt,
    addCoverPage: (doc: Parameters<typeof echt.addCoverPage>[0], icon: string | null, angaben: Parameters<typeof echt.addCoverPage>[2]) => {
      deckblaetter.push({ ...angaben });
      return echt.addCoverPage(doc, icon, angaben);
    },
  };
});

// Der Erzeuger importiert den Supabase-Client (fuer den Upload-Helfer).
// Attrappe verhindert echten Netz-/Env-Zugriff im Test.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), createSignedUrl: vi.fn() }) } },
}));

import { buildPaketUebersichtPdf } from "@/lib/paketUebersichtPdf";

beforeEach(() => { texte.length = 0; deckblaetter.length = 0; });

describe("buildPaketUebersichtPdf (Startfahrplan)", () => {
  it("erzeugt das PDF ohne Fehler und enthaelt die Kernzahlen des Ein-Wege-Modells", async () => {
    const blob = await buildPaketUebersichtPdf({ empfaengerName: "Max Muster" });
    expect(blob).toBeInstanceOf(Blob);

    const alles = texte.join("\n");
    // Provision 4 %, kein laufendes Entgelt: Die Servicevereinbarung mit 150
    // Euro im Monat ist seit dem 07.09.2026 entfallen.
    expect(alles).toMatch(/4\s?%/);
    expect(alles).not.toMatch(/Servicevereinbarung|Serviceentgelt|Mindestlaufzeit, danach/);
    expect(alles).toContain("keine Monatsgebühr und keine Mindestlaufzeit");
    // Leadpaket 2.500 Euro = 20 Leads, Einzel-Leads 150 Euro
    expect(alles).toContain("2.500");
    expect(alles).toContain("20 qualifizierte Leads");
    expect(alles).toContain("150");
    // Beispielrechnung: 300.000 Euro Kaufpreis, 12.000 Euro je Abschluss
    expect(alles).toContain("300.000");
    expect(alles).toContain("12.000");
    // Persoenliche Anrede
    expect(alles).toContain("Hallo Max,");
  });

  it("benutzt das Hausdeckblatt mit Kennung, Titel und Empfaenger", async () => {
    await buildPaketUebersichtPdf({ empfaengerName: "Max Muster" });
    expect(deckblaetter).toHaveLength(1);
    const dbl = deckblaetter[0];
    expect(dbl.kennung).toBe("Für Vertriebspartner");
    expect(dbl.titel).toBe("Dein Startfahrplan");
    expect(dbl.untertitel).toContain("OS Immobilien auf einen Blick");
    expect(dbl.empfaenger).toBe("Max Muster");
    expect(dbl.datum).toBeTruthy();
  });

  it("enthaelt alle sieben Abschnitte des Startfahrplans", async () => {
    await buildPaketUebersichtPdf();
    const alles = texte.join("\n");
    for (const titel of [
      "Wer wir sind",
      "Unsere Immobilientypen und Standorte",
      "Wie die Zusammenarbeit aussieht",
      "Wie ein Deal abläuft",
      "Deine Konditionen",
      "Dein eigener Leadkanal (optional)",
      "So geht es weiter",
    ]) {
      expect(alles).toContain(titel);
    }
  });

  it("nennt Immobilientypen, Standorte, Dealablauf und naechste Schritte", async () => {
    await buildPaketUebersichtPdf();
    const alles = texte.join("\n");
    // Assetklassen
    expect(alles).toContain("Sanierter Bestand");
    expect(alles).toContain("Neubau KfW 40 QNG");
    expect(alles).toContain("WG- und Co-Living-Konzepte");
    // Standorte
    expect(alles).toContain("München und Umland");
    expect(alles).toContain("Augsburg");
    expect(alles).toContain("Nürnberg");
    // Tabelle der Zusammenarbeit
    expect(alles).toContain("WAS DU VON UNS BEKOMMST");
    expect(alles).toContain("WAS ES DIR SPART");
    // Zeitleiste und Abschlusssatz aus ablaufplan.ts
    expect(alles).toContain("Neuer Lead");
    expect(alles).toContain("Kaufpreisfälligkeit");
    expect(alles).toContain(
      "Die erste Provision fließt nach Kaufpreisfälligkeit, meist 8 bis 10 Wochen nach dem Erstkontakt mit dem Kunden.",
    );
    // Naechste Schritte
    expect(alles).toContain("Persönliches Gespräch");
    expect(alles).toContain("Onboarding-Termin");
    expect(alles).toContain("os@os-immobilien.com");
  });

  it("zeigt den uebergebenen Ansprechpartner statt der Standard-Kontaktdaten", async () => {
    await buildPaketUebersichtPdf({
      berater: { name: "Sarah Kaiser-Thom", email: "s.kaiser-thom@os-immobilien.com", telefon: "+49 151 1234567" },
    });
    const alles = texte.join("\n");
    expect(alles).toContain("Sarah Kaiser-Thom");
    expect(alles).toContain("s.kaiser-thom@os-immobilien.com");
    expect(alles).toContain("+49 151 1234567");
    // Die frueher fest verdrahteten Kontaktdaten duerfen nicht mehr auftauchen.
    expect(alles).not.toContain("os@os-immobilien.com");
    expect(alles).not.toContain("+49 30 863289210");
  });

  it("laesst fehlende Kontaktangaben des Ansprechpartners weg", async () => {
    await buildPaketUebersichtPdf({ berater: { name: "Sarah Kaiser-Thom" } });
    const alles = texte.join("\n");
    expect(alles).toContain("Sarah Kaiser-Thom");
    // Keine fremden Kontaktdaten als Lueckenfueller.
    expect(alles).not.toContain("os@os-immobilien.com");
    expect(alles).not.toContain("+49 30 863289210");
  });

  it("faellt ohne Ansprechpartner auf den Standardkontakt zurueck", async () => {
    await buildPaketUebersichtPdf();
    const alles = texte.join("\n");
    expect(alles).toContain("Christian Peetz");
    expect(alles).toContain("os@os-immobilien.com");
    expect(alles).toContain("+49 30 863289210");
  });

  it("enthaelt den Vier-Pakete-Vergleich nicht mehr", async () => {
    await buildPaketUebersichtPdf();
    const alles = texte.join("\n");
    expect(alles).not.toContain("vier Startmöglichkeiten");
    expect(alles).not.toContain("Lead Partner");
    expect(alles).not.toContain("Lizenzpartner");
    expect(alles).not.toContain("Setup-Investition");
    expect(alles).not.toContain("Team Lead");
  });
});
