import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Rauchtest des ERWEITERTEN Startfahrplans: jsPDF wird durch eine Attrappe
 * ersetzt, die alle Zeichenaufrufe schluckt und die gesetzten Texte
 * einsammelt. Bauweise wie in paketUebersichtPdf.test.ts.
 *
 * Geprüft wird der Spannungsbogen (alle Abschnitte), Christians zwei
 * Textkorrekturen (bei "Heute" nur "Deine Entscheidung", Schlusssatz "Wir
 * freuen uns auf die Zusammenarbeit."), die Personalisierung über das
 * Abschlusstempo aus Teil 2, der Lead-Berater-Zweig, die qualifizierte
 * Lead-Formulierung und dass Overhead, Altpakete und Tippgeber fehlen.
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
// zusätzlich mitgeschrieben (gleiches Muster wie im Bestandstest).
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

// Der Erzeuger importiert über paketUebersichtPdf den Supabase-Client.
// Attrappe verhindert echten Netz-/Env-Zugriff im Test.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), createSignedUrl: vi.fn() }) } },
}));

import { buildStartfahrplanErweitertPdf } from "@/lib/startfahrplanErweitertPdf";

beforeEach(() => { texte.length = 0; deckblaetter.length = 0; });

describe("buildStartfahrplanErweitertPdf (erweiterter Startfahrplan)", () => {
  it("erzeugt das PDF ohne Fehler und enthält alle Abschnitte des Spannungsbogens", async () => {
    const blob = await buildStartfahrplanErweitertPdf({ empfaengerName: "Max Muster" });
    expect(blob).toBeInstanceOf(Blob);

    const alles = texte.join("\n");
    for (const titel of [
      "Warum die meisten Einzelkämpfer nicht am Verkaufen scheitern",
      "Das Gegenbild: Du machst Vertrieb, wir den Rest",
      "Wofür MOREImmo steht",
      "Das System: was du bekommst und was es dir spart",
      "Echte Objekte an starken Standorten",
      "Vom Kunden zur Provision: der Deal-Prozess",
      "Die, die schon losgelegt haben",
      "Ein echter Deal, echte Zahlen",
      "Deine Zahlen aus dem Gespräch",
      "Zwei Wege, ein Satz",
      "Dein Paket: Vertriebspartner",
      "Dein eigener Leadkanal (optional)",
      "Erwartungen auf Augenhöhe",
      "Dein Start, Woche für Woche",
      "Der letzte Schritt",
    ]) {
      expect(alles).toContain(titel);
    }
    expect(alles).toContain("Hallo Max,");
  });

  it("benutzt das Hausdeckblatt mit eigener Unterzeile", async () => {
    await buildStartfahrplanErweitertPdf({ empfaengerName: "Max Muster" });
    expect(deckblaetter).toHaveLength(1);
    const dbl = deckblaetter[0];
    expect(dbl.kennung).toBe("Für Vertriebspartner");
    expect(dbl.titel).toBe("Dein Startfahrplan");
    expect(dbl.untertitel).toContain("Unser komplettes Gespräch auf einen Blick");
    expect(dbl.empfaenger).toBe("Max Muster");
  });

  it("enthält Christians Korrekturen: nur 'Deine Entscheidung' und den neuen Schlusssatz", async () => {
    await buildStartfahrplanErweitertPdf({ empfaengerName: "Max Muster" });
    const alles = texte.join("\n");
    // (a) Bei "Heute" steht keine Unterstellung einer bereits gefallenen Entscheidung.
    expect(alles).toContain("Deine Entscheidung.");
    expect(alles).not.toContain("die hast du im Gespräch schon getroffen");
    // (b) Der Schluss ist der ruhige Satz, kein vorweggenommenes Willkommen.
    expect(alles).toContain("Wir freuen uns auf die Zusammenarbeit.");
    expect(alles).not.toContain("Willkommen bei MOREImmo");
  });

  it("personalisiert das Abschlusstempo aus Teil 2 und rechnet mit dem gekennzeichneten Beispielwert", async () => {
    await buildStartfahrplanErweitertPdf({ empfaengerName: "Max Muster", abschluesseProMonat: "1 bis 2" });
    const alles = texte.join("\n");
    expect(alles).toContain("deine Annahme: 1 bis 2 Abschlüsse im Monat");
    // Kein abgefragter Kaufpreis, sondern der begründete Beispielwert.
    expect(alles).toContain("Beispielwert von 300.000");
    expect(alles).toContain("richtet sich beim echten Deal nach der Bonität");
  });

  it("fällt ohne erfasstes Abschlusstempo auf die allgemeine Beispielrechnung zurück", async () => {
    await buildStartfahrplanErweitertPdf({ empfaengerName: "Max Muster" });
    const alles = texte.join("\n");
    expect(alles).not.toContain("deine Annahme:");
    expect(alles).toContain("ein bis zwei Abschlüsse im Monat ein realistisches Ziel");
    expect(alles).toContain("Beispielwert von 300.000");
  });

  it("nennt die echten Konditionen und kennzeichnet die Rechenbeispiele", async () => {
    await buildStartfahrplanErweitertPdf();
    const alles = texte.join("\n");
    // 4 % beide Wege, 0 Euro Setup, kein laufendes Entgelt. Die 150 stehen
    // nur noch beim Einzel-Lead; die Servicevereinbarung mit ihren 12 Monaten
    // Mindestlaufzeit ist seit dem 07.09.2026 entfallen und darf nicht mehr
    // auftauchen.
    expect(alles).toMatch(/4\s?%/);
    expect(alles).toContain("150");
    expect(alles).not.toContain("12 Monate Mindestlaufzeit");
    expect(alles).not.toMatch(/Servicevereinbarung|Serviceentgelt/);
    expect(alles).toContain("keine Monatsgebühr und keine Mindestlaufzeit");
    // Echter Fall 350.000 zu 14.000, Beispielrechnung 300.000 zu 12.000, Jahr 144.000.
    expect(alles).toContain("350.000");
    expect(alles).toContain("14.000");
    expect(alles).toContain("300.000");
    expect(alles).toContain("12.000");
    expect(alles).toContain("144.000");
    // Ehrlichkeitsregel.
    expect(alles).toContain("kein Einkommensversprechen");
    expect(alles).toContain("Wir versprechen dir kein Einkommen");
  });

  it("beschreibt den Leadkanal als offenen, optionalen Zukauf ohne Qualifizierungs-Hürde", async () => {
    await buildStartfahrplanErweitertPdf();
    const alles = texte.join("\n");
    expect(alles).toContain("jederzeit qualifizierte Leads dazukaufen");
    expect(alles).toContain("2.500");
    expect(alles).toContain("20 qualifizierte Leads");
    expect(alles).toContain("dein eigenes Netzwerk reicht völlig");
    // Kein Gate im Bewerbertext: weder Königsdisziplin noch ein Folge-Call.
    expect(alles).not.toContain("Königsdisziplin");
    expect(alles).not.toContain("Folge-Call");
    expect(alles).not.toContain("vorbehalten");
    // Gestellte Leads nur als dezente Randnotiz ohne Zusage.
    expect(alles).toContain("nach Abstimmung mit der Geschäftsführung zusätzlich mit gestellten Leads");
  });

  it("druckt beim Lead-Berater den Bereitstellungs-Absatz statt des Leadkanal-Kaufs", async () => {
    await buildStartfahrplanErweitertPdf({ paketId: "lead_berater" });
    const alles = texte.join("\n");
    expect(alles).toContain("Dein Paket: Lead-Berater");
    expect(alles).toContain("Leads zur Unterstützung");
    expect(alles).toContain("ohne Anspruch auf eine bestimmte Menge");
    expect(alles).not.toContain("Dein eigener Leadkanal (optional)");
    expect(alles).not.toContain("2.500");
  });

  it("zeigt echte Partnerstimmen und den Start Woche für Woche", async () => {
    await buildStartfahrplanErweitertPdf();
    const alles = texte.join("\n");
    // Zwei Stimmen aus partnerstimmen.ts (nur echte, freigegebene).
    expect(alles).toContain("Daniel B.");
    expect(alles).toContain("Marco S.");
    // Wochenplan und Formalia.
    expect(alles).toContain("WOCHE 1");
    expect(alles).toContain("WOCHE 2");
    expect(alles).toContain("Paragraf 34c");
    // Ruhiger Abschluss: Vertrag kommt per Mail.
    expect(alles).toContain("nur noch deine Unterschrift");
    expect(alles).toContain("per Mail");
  });

  it("fällt ohne Ansprechpartner auf den Standardkontakt zurück und übernimmt sonst den übergebenen", async () => {
    await buildStartfahrplanErweitertPdf();
    let alles = texte.join("\n");
    expect(alles).toContain("Christian Peetz");
    expect(alles).toContain("c.peetz@more.immo");

    texte.length = 0;
    deckblaetter.length = 0;
    await buildStartfahrplanErweitertPdf({
      berater: { name: "Sarah Kaiser-Thom", email: "s.kaiser-thom@more.immo", telefon: "+49 151 1234567" },
    });
    alles = texte.join("\n");
    expect(alles).toContain("Sarah Kaiser-Thom");
    expect(alles).toContain("s.kaiser-thom@more.immo");
    expect(alles).not.toContain("c.peetz@more.immo");
  });

  it("Overhead-Provision, Altpakete und Tippgeber kommen nicht vor", async () => {
    await buildStartfahrplanErweitertPdf();
    const alles = texte.join("\n");
    expect(alles).not.toContain("Overhead");
    expect(alles).not.toContain("Lead Partner");
    expect(alles).not.toContain("Team Lead");
    expect(alles).not.toContain("Lizenzpartner");
    expect(alles).not.toContain("Tippgeber");
    expect(alles).not.toContain("Setup-Investition");
  });

  it("Nutzertexte enthalten keine Gedankenstriche", async () => {
    await buildStartfahrplanErweitertPdf({ empfaengerName: "Max Muster", abschluesseProMonat: "2" });
    const alles = texte.join("\n");
    expect(alles).not.toMatch(/[–—]/);
  });
});
