import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEAD_PAKET_RECHNUNG_ANZEIGENAME,
  LEAD_PAKET_RECHNUNG_AUGENBRAUE,
  LEAD_PAKET_RECHNUNG_BLOCK,
  LEAD_PAKET_RECHNUNG_SCHRITTE,
  LEAD_PAKET_RECHNUNG_TITEL,
  LEAD_PAKET_RECHNUNG_ZEILE_BETRAG,
  LEAD_PAKET_RECHNUNG_ZEILE_LEADS,
  LEAD_PAKET_BEZAHLT_ANZEIGENAME,
  LEAD_PAKET_BEZAHLT_AUGENBRAUE,
  LEAD_PAKET_BEZAHLT_BLOCK,
  LEAD_PAKET_BEZAHLT_TITEL,
  VORSCHAU_LEAD_PAKET,
  leadPaketBezahltBetreff,
  leadPaketBezahltDaten,
  leadPaketBezahltText,
  leadPaketBezahltVorschau,
  leadPaketRechnungBetreff,
  leadPaketRechnungDaten,
  leadPaketRechnungLeads,
  leadPaketRechnungText,
  leadPaketRechnungVorschau,
  type LeadPaketRechnungEingabe,
} from "../../supabase/functions/_shared/lead-paket-rechnung-mail";
import { formatiereLeadPaketBetrag, gebuchtesLeadPaket } from "../../supabase/functions/_shared/lead-paket";
import { LEAD_PAKET_ANZAHL, LEAD_PAKET_PREIS, formatPreis } from "@/lib/lizenzPakete";

/**
 * Die interne Mail „Rechnung über das Lead-Paket erstellen" an Christian.
 *
 * Bis zum 23.09.2026 kam sie nach jedem vollständig unterschriebenen
 * Handelsvertretervertrag und bat um eine Rechnung über die Onboardinggebühr.
 * Jetzt kommt sie nur noch, wenn der Vertrag ein Lead-Paket enthält, und nennt
 * das Lead-Paket samt Betrag aus dem Vertrag.
 *
 * Die Vorlage selbst lädt React über `npm:` und ist für Vitest unerreichbar.
 * Geprüft werden deshalb das gemeinsame Modul, aus dem Vorlage und beide
 * Versandwege lesen, und der sichtbare Quelltext der Vorlage.
 */

const WURZEL = join(__dirname, "..", "..");
const lies = (...teile: string[]) => readFileSync(join(WURZEL, ...teile), "utf8");

/** Nur der Teil einer Quelle, aus dem sichtbarer Text oder Verhalten wird. */
const ohneKommentare = (quelle: string): string =>
  quelle.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const VORLAGE_SICHTBAR = ohneKommentare(
  lies("supabase", "functions", "_shared", "transactional-email-templates", "vertrag-unterschrieben-rechnung.tsx"),
);
const FOLGEMAIL_SICHTBAR = ohneKommentare(
  lies("supabase", "functions", "_shared", "transactional-email-templates", "rechnung-bezahlt-nutzer-anlegen.tsx"),
);
const RECHNUNGS_TAB = ohneKommentare(lies("src", "components", "bewerbung", "RechnungsTab.tsx"));
const FINALIZE = ohneKommentare(lies("supabase", "functions", "finalize-vertrag", "index.ts"));
const VERTRAGS_TAB = ohneKommentare(lies("src", "components", "bewerbung", "VertragsTab.tsx"));

const eingabe = (leadPaket: unknown): LeadPaketRechnungEingabe => ({
  bewerberName: "Max Mustermann",
  bewerberEmail: "max@example.com",
  bewerberTelefon: "+49 170 1234567",
  rechnungsAdresse: "Musterstraße 12",
  ort: "80331 München",
  leadPaket,
  signedAt: "23.09.2026, 10:00:00",
  bewerberLink: "https://osimmobilien.netlify.app/bewerberprozess?bewerber=beispiel",
});

describe("Rechnungsmail: sie kommt nur mit Lead-Paket", () => {
  it("kommt, wenn der Vertrag das Lead-Paket enthält", () => {
    const daten = leadPaketRechnungDaten(eingabe({ betrag: LEAD_PAKET_PREIS, anzahl: LEAD_PAKET_ANZAHL }));
    expect(daten).not.toBeNull();
    expect(daten?.leadPaketBetragFormatiert).toBe(formatPreis(LEAD_PAKET_PREIS));
    expect(daten?.leadAnzahl).toBe(LEAD_PAKET_ANZAHL);
    expect(daten?.bewerberName).toBe("Max Mustermann");
  });

  it("kommt nicht ohne Lead-Paket", () => {
    expect(leadPaketRechnungDaten(eingabe(undefined))).toBeNull();
    expect(leadPaketRechnungDaten(eingabe(null))).toBeNull();
    expect(leadPaketRechnungDaten(eingabe({}))).toBeNull();
  });

  it("kommt nicht bei einem leeren oder unbrauchbaren Lead-Paket", () => {
    for (const roh of [
      { betrag: 0, anzahl: 0 },
      { betrag: LEAD_PAKET_PREIS, anzahl: 0 },
      { betrag: 0, anzahl: LEAD_PAKET_ANZAHL },
      { betrag: -LEAD_PAKET_PREIS, anzahl: LEAD_PAKET_ANZAHL },
      { betrag: LEAD_PAKET_PREIS },
      { betrag: String(LEAD_PAKET_PREIS), anzahl: String(LEAD_PAKET_ANZAHL) },
      { betrag: Number.NaN, anzahl: LEAD_PAKET_ANZAHL },
      "Lead-Paket 2.500 Euro",
      true,
    ]) {
      expect(gebuchtesLeadPaket(roh), JSON.stringify(roh)).toBeNull();
      expect(leadPaketRechnungDaten(eingabe(roh)), JSON.stringify(roh)).toBeNull();
    }
  });

  it("nennt einen individuell vereinbarten Betrag so, wie er im Vertrag steht", () => {
    const daten = leadPaketRechnungDaten(eingabe({ betrag: 3000, anzahl: 24 }));
    expect(daten?.leadPaketBetragFormatiert).toBe(formatPreis(3000));
    expect(daten?.leadAnzahl).toBe(24);
  });
});

describe("Rechnungsmail: der Text nennt das Lead-Paket statt der Onboardinggebühr", () => {
  const wer = "Max Mustermann";
  const daten = leadPaketRechnungDaten(eingabe({ betrag: LEAD_PAKET_PREIS, anzahl: LEAD_PAKET_ANZAHL }))!;

  /** Die Mail als ein durchgehender Text, so wie Christian sie liest. */
  const GANZ = [
    leadPaketRechnungBetreff(wer),
    leadPaketRechnungBetreff(),
    LEAD_PAKET_RECHNUNG_AUGENBRAUE,
    LEAD_PAKET_RECHNUNG_TITEL,
    leadPaketRechnungVorschau(wer),
    leadPaketRechnungText(wer),
    LEAD_PAKET_RECHNUNG_BLOCK,
    LEAD_PAKET_RECHNUNG_ZEILE_BETRAG,
    daten.leadPaketBetragFormatiert,
    LEAD_PAKET_RECHNUNG_ZEILE_LEADS,
    leadPaketRechnungLeads(daten.leadAnzahl),
    ...LEAD_PAKET_RECHNUNG_SCHRITTE,
    LEAD_PAKET_RECHNUNG_ANZEIGENAME,
  ].join(" ");

  it("Betreff und Kopfzeile nennen die Rechnung über das Lead-Paket", () => {
    expect(leadPaketRechnungBetreff(wer)).toBe(
      "Max Mustermann hat unterschrieben, Rechnung über das Lead-Paket erstellen",
    );
    expect(leadPaketRechnungBetreff()).toContain("Rechnung über das Lead-Paket");
    expect(LEAD_PAKET_RECHNUNG_AUGENBRAUE).toContain("Lead-Paket");
    expect(LEAD_PAKET_RECHNUNG_ANZEIGENAME).toContain("Lead-Paket");
  });

  it("bittet um die Rechnung über das Lead-Paket in Lexware", () => {
    expect(leadPaketRechnungText(wer)).toBe(
      "Max Mustermann hat den Handelsvertretervertrag und alle Anlagen vollständig unterschrieben. " +
        "Bitte erstelle die Rechnung über das Lead-Paket in Lexware.",
    );
  });

  it("weist die Lead-Paket-Gebühr mit 2.500 Euro aus", () => {
    expect(LEAD_PAKET_RECHNUNG_BLOCK).toBe("Lead-Paket-Gebühr");
    expect(LEAD_PAKET_RECHNUNG_ZEILE_BETRAG).toBe("Lead-Paket-Gebühr netto");
    expect(daten.leadPaketBetragFormatiert).toMatch(/^2\.500\s€$/);
  });

  it("sagt an keiner Stelle Onboarding", () => {
    expect(GANZ).not.toMatch(/onboarding/i);
    expect(VORLAGE_SICHTBAR).not.toMatch(/onboarding/i);
  });

  it("duzt und kommt ohne Gedankenstriche aus", () => {
    expect(GANZ).toContain("Bitte erstelle");
    expect(GANZ).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre)\b/);
    expect(GANZ).not.toMatch(/[–—]/);
  });
});

describe("Rechnungsmail: der Betrag steht an einer Stelle", () => {
  it("die Vorlage schreibt keinen Betrag fest in den Text", () => {
    expect(VORLAGE_SICHTBAR).not.toMatch(/2\.?500/);
    expect(VORLAGE_SICHTBAR).toContain("leadPaketBetragFormatiert");
    expect(VORLAGE_SICHTBAR).not.toContain("paketPreisFormatiert");
  });

  it("die Vorschau rechnet mit dem Listenpreis aus lizenzPakete.ts", () => {
    expect(VORSCHAU_LEAD_PAKET).toEqual({ betrag: LEAD_PAKET_PREIS, anzahl: LEAD_PAKET_ANZAHL });
  });

  it("schreibt Beträge genauso wie formatPreis", () => {
    for (const betrag of [LEAD_PAKET_PREIS, 2600, 3000, 12500]) {
      expect(formatiereLeadPaketBetrag(betrag)).toBe(formatPreis(betrag));
    }
  });
});

describe("Rechnungsmail: beide Versandwege fragen vorher nach dem Lead-Paket", () => {
  const pruefe = (name: string, quelle: string) => {
    const regel = quelle.indexOf("leadPaketRechnungDaten(");
    const schranke = quelle.indexOf("if (templateData)");
    const aufrufe = [...quelle.matchAll(/templateName:\s*"vertrag-unterschrieben-rechnung"/g)];

    expect(regel, `${name}: fragt die Regel nicht ab`).toBeGreaterThan(-1);
    expect(schranke, `${name}: verschickt ohne Bedingung`).toBeGreaterThan(regel);
    expect(aufrufe.length, `${name}: Versand nicht gefunden`).toBeGreaterThan(0);
    for (const a of aufrufe) {
      expect(a.index ?? -1, `${name}: ein Versand liegt vor der Bedingung`).toBeGreaterThan(schranke);
    }
    expect(quelle).not.toContain("paketPreisFormatiert");
  };

  it("finalize-vertrag, nach der digitalen Gegenzeichnung", () => {
    pruefe("finalize-vertrag", FINALIZE);
  });

  it("VertragsTab, beim Hochladen des unterschriebenen Vertrags", () => {
    pruefe("VertragsTab", VERTRAGS_TAB);
  });
});

describe("Folgemail: die Zahlung für das Lead-Paket ist eingegangen", () => {
  const wer = "Julian Meyer";
  const daten = leadPaketBezahltDaten({
    bewerberName: wer,
    leadPaket: { betrag: LEAD_PAKET_PREIS, anzahl: LEAD_PAKET_ANZAHL },
    karriereStufe: "vertriebspartner",
    bewerberLink: "https://osimmobilien.netlify.app/bewerberprozess?bewerber=beispiel",
  })!;

  const GANZ = [
    leadPaketBezahltBetreff(wer),
    leadPaketBezahltBetreff(),
    LEAD_PAKET_BEZAHLT_AUGENBRAUE,
    LEAD_PAKET_BEZAHLT_TITEL,
    leadPaketBezahltVorschau(wer),
    leadPaketBezahltVorschau(),
    leadPaketBezahltText(wer),
    leadPaketBezahltText(),
    LEAD_PAKET_BEZAHLT_BLOCK,
    LEAD_PAKET_BEZAHLT_ANZEIGENAME,
  ].join(" ");

  it("nennt die Zahlung für das Lead-Paket", () => {
    expect(LEAD_PAKET_BEZAHLT_TITEL).toBe("Die Zahlung für das Lead-Paket ist eingegangen");
    expect(leadPaketBezahltText(wer)).toMatch(/^die Zahlung für das Lead-Paket von Julian Meyer ist eingegangen\./);
    expect(leadPaketBezahltBetreff(wer)).toBe("Julian Meyer: Lead-Paket bezahlt, Nutzer anlegen");
  });

  it("sagt an keiner Stelle Onboarding und hat keine Gedankenstriche", () => {
    expect(GANZ).not.toMatch(/onboarding/i);
    expect(FOLGEMAIL_SICHTBAR).not.toMatch(/onboarding/i);
    expect(GANZ).not.toMatch(/[–—]/);
  });

  it("zeigt den Betrag aus dem Vertrag und kommt ohne Lead-Paket gar nicht zustande", () => {
    expect(daten.leadPaketBetragFormatiert).toBe(formatPreis(LEAD_PAKET_PREIS));
    expect(daten.leadAnzahl).toBe(LEAD_PAKET_ANZAHL);
    expect(daten.karriereStufe).toBe("vertriebspartner");
    expect(
      leadPaketBezahltDaten({ bewerberName: wer, leadPaket: undefined, bewerberLink: "x" }),
    ).toBeNull();
  });

  it("die Vorlage schreibt keinen Betrag fest und erwartet die Felder, die der RechnungsTab liefert", () => {
    expect(FOLGEMAIL_SICHTBAR).not.toMatch(/2\.?500|1\.490/);
    for (const feld of ["leadPaketBetragFormatiert", "leadAnzahl", "karriereStufe", "bewerberLink"]) {
      expect(FOLGEMAIL_SICHTBAR, feld).toContain(feld);
    }
    expect(RECHNUNGS_TAB).toContain("leadPaketBezahltDaten(");
  });
});
