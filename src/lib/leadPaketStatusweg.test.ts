import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STUFEN,
  gebuchtesLeadPaket,
  hatLeadPaket,
  stufeNachVollstaendigemVertrag,
  stufeNachZahlung,
  wartetAufLeadPaketZahlung,
} from "../../supabase/functions/_shared/lead-paket";
import {
  LEAD_PAKET_RECHNUNG_GLOCKE_TITEL,
  leadPaketGlockeZeile,
  meldungNachVertragUpload,
} from "../../supabase/functions/_shared/lead-paket-rechnung-mail";
import { LEAD_PAKET_ANZAHL, LEAD_PAKET_PREIS, formatPreis } from "@/lib/lizenzPakete";
import { PIPELINE_STUFEN } from "@/lib/bewerbungStore";

/**
 * Der Statusweg nach dem vollständig unterschriebenen Vertrag, entschieden von
 * Christian am 23.09.2026:
 *
 *   Vertrag, mit Lead-Paket  -> Rechnung -> (Zahlung bestätigt) -> Nutzer_anlegen
 *   Vertrag, ohne Lead-Paket -> Nutzer_anlegen, die Stufe Rechnung entfällt
 *
 * Die Regel steht in `supabase/functions/_shared/lead-paket.ts`. Hier wird sie
 * selbst geprüft und dazu, dass beide Versandwege (digitale Gegenzeichnung in
 * `finalize-vertrag`, Hochladen im `VertragsTab`) sie benutzen und die Glocke
 * „Rechnung erstellen" nur beim Lead-Paket läuten lassen.
 */

const WURZEL = join(__dirname, "..", "..");
const lies = (...teile: string[]) => readFileSync(join(WURZEL, ...teile), "utf8");
const ohneKommentare = (quelle: string): string =>
  quelle.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const FINALIZE = ohneKommentare(lies("supabase", "functions", "finalize-vertrag", "index.ts"));
const VERTRAGS_TAB = ohneKommentare(lies("src", "components", "bewerbung", "VertragsTab.tsx"));
const AKTIVIERUNG_TAB = ohneKommentare(lies("src", "components", "bewerbung", "AktivierungTab.tsx"));
const RECHNUNGS_TAB = ohneKommentare(lies("src", "components", "bewerbung", "RechnungsTab.tsx"));

const MIT = { betrag: LEAD_PAKET_PREIS, anzahl: LEAD_PAKET_ANZAHL };
const GEDANKENSTRICH = /[–—]/;

describe("Lead-Paket: die eine Regel", () => {
  it("erkennt ein gebuchtes Lead-Paket, auch mit individuellem Betrag", () => {
    expect(hatLeadPaket(MIT)).toBe(true);
    expect(gebuchtesLeadPaket({ betrag: 3000, anzahl: 24 })).toEqual({ betrag: 3000, anzahl: 24 });
  });

  it("verlangt Betrag UND Anzahl als positive Zahlen", () => {
    for (const roh of [
      undefined, null, {}, "Lead-Paket 2.500 Euro", true,
      { betrag: LEAD_PAKET_PREIS },
      { betrag: LEAD_PAKET_PREIS, anzahl: 0 },
      { betrag: 0, anzahl: LEAD_PAKET_ANZAHL },
      { betrag: String(LEAD_PAKET_PREIS), anzahl: String(LEAD_PAKET_ANZAHL) },
      { betrag: Number.NaN, anzahl: LEAD_PAKET_ANZAHL },
    ]) {
      expect(hatLeadPaket(roh), JSON.stringify(roh)).toBe(false);
    }
  });

  it("kennt die Stufen in derselben Reihenfolge wie der Bewerber-Store", () => {
    expect([...STUFEN]).toEqual([...PIPELINE_STUFEN]);
  });

  it("wird überall benutzt, keine Stelle prüft das Lead-Paket noch selbst", () => {
    for (const [name, quelle] of [
      ["finalize-vertrag", FINALIZE],
      ["VertragsTab", VERTRAGS_TAB],
      ["AktivierungTab", AKTIVIERUNG_TAB],
    ] as const) {
      expect(quelle, name).not.toMatch(/leadPaket\)?\.betrag\)?\s*>\s*0/);
      expect(quelle, name).toMatch(/hatLeadPaket\(/);
    }
    expect(RECHNUNGS_TAB).toMatch(/gebuchtesLeadPaket\(b\.leadPaket\)/);
  });
});

describe("Punkt 1: Status nach dem vollständig unterschriebenen Vertrag", () => {
  it("mit Lead-Paket geht es wie bisher nach Rechnung", () => {
    expect(stufeNachVollstaendigemVertrag(MIT, "Vertrag")).toBe("Rechnung");
  });

  it("ohne Lead-Paket geht es direkt nach Nutzer anlegen", () => {
    expect(stufeNachVollstaendigemVertrag(undefined, "Vertrag")).toBe("Nutzer_anlegen");
    expect(stufeNachVollstaendigemVertrag({ betrag: 0, anzahl: 0 }, "Vertrag")).toBe("Nutzer_anlegen");
  });

  it("geht nur nach vorn und holt niemanden zurück", () => {
    // Ein erneut hochgeladener Scan darf einen aktiven Partner nicht zurücksetzen.
    expect(stufeNachVollstaendigemVertrag(undefined, "Aktiv")).toBeNull();
    expect(stufeNachVollstaendigemVertrag(MIT, "Aktiv")).toBeNull();
    expect(stufeNachVollstaendigemVertrag(MIT, "Nutzer_anlegen")).toBeNull();
    expect(stufeNachVollstaendigemVertrag(undefined, "Nutzer_anlegen")).toBeNull();
    expect(stufeNachVollstaendigemVertrag(MIT, "Rechnung")).toBeNull();
  });

  it("lässt Ausgeschiedene und unbekannte Werte stehen", () => {
    for (const status of ["Abgelehnt", "KeinInteresse", "", undefined, "Onboarding"]) {
      expect(stufeNachVollstaendigemVertrag(MIT, status), String(status)).toBeNull();
      expect(stufeNachVollstaendigemVertrag(undefined, status), String(status)).toBeNull();
    }
  });

  it("finalize-vertrag liest den Status und setzt ihn über die Regel", () => {
    expect(FINALIZE).toMatch(/\.select\("[^"]*\bstatus\b[^"]*"\)/);
    expect(FINALIZE).toContain("stufeNachVollstaendigemVertrag(currentMeta.leadPaket, bewerber.status)");
    expect(FINALIZE).toContain("neueStufe ? { meta: nextMeta, status: neueStufe } : { meta: nextMeta }");
    expect(FINALIZE).not.toMatch(/status:\s*"Rechnung"/);
  });

  it("der VertragsTab setzt ihn über dieselbe Regel", () => {
    expect(VERTRAGS_TAB).toContain("stufeNachVollstaendigemVertrag(b.leadPaket, b.status)");
    expect(VERTRAGS_TAB).toContain("...(neueStufe ? { status: neueStufe } : {})");
    expect(VERTRAGS_TAB).not.toMatch(/status:\s*"Rechnung"/);
  });
});

describe("Punkt 2: Glocke und Meldung zur Rechnung nur beim Lead-Paket", () => {
  /** Der Abschnitt ab `if (mitLeadPaket) {` bis zur schließenden Klammer auf gleicher Einrückung. */
  const bedingterBlock = (quelle: string): string => {
    const start = quelle.indexOf("if (mitLeadPaket) {");
    expect(start).toBeGreaterThan(-1);
    const einrueckung = quelle.slice(quelle.lastIndexOf("\n", start) + 1, start);
    const ende = quelle.indexOf(`\n${einrueckung}}`, start);
    return quelle.slice(start, ende);
  };

  it("finalize-vertrag läutet die Rechnungsglocke nur im Lead-Paket-Zweig", () => {
    const block = bedingterBlock(FINALIZE);
    expect(block).toContain("LEAD_PAKET_RECHNUNG_GLOCKE_TITEL");
    expect(block).toContain('.from("benachrichtigungen").insert(rows)');
    expect(FINALIZE.split("LEAD_PAKET_RECHNUNG_GLOCKE_TITEL").length - 1).toBe(2); // Import und Block
    expect(FINALIZE).not.toContain("Rechnung erstellen\"");
  });

  it("der VertragsTab läutet die Rechnungsglocke nur im Lead-Paket-Zweig", () => {
    const block = bedingterBlock(VERTRAGS_TAB);
    expect(block).toContain("notifyByRole([\"hr\"]");
    expect(block).toContain("LEAD_PAKET_RECHNUNG_GLOCKE_TITEL");
    expect(VERTRAGS_TAB).not.toContain("Rechnung erstellen\"");
  });

  it("die Glocke nennt das Lead-Paket und hat keinen Gedankenstrich", () => {
    expect(LEAD_PAKET_RECHNUNG_GLOCKE_TITEL).toBe("Vertrag unterschrieben, Rechnung über das Lead-Paket erstellen");
    expect(LEAD_PAKET_RECHNUNG_GLOCKE_TITEL).not.toMatch(GEDANKENSTRICH);
    expect(leadPaketGlockeZeile(MIT)).toBe(
      `Lead-Paket: ${formatPreis(LEAD_PAKET_PREIS)} netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads.`,
    );
    expect(leadPaketGlockeZeile(undefined)).toBe("");
  });

  it("die Meldung nach dem Hochladen passt zum Weg und hat keinen Gedankenstrich", () => {
    expect(meldungNachVertragUpload("Rechnung")).toBe("Status auf Rechnung gesetzt, HR wurde informiert.");
    expect(meldungNachVertragUpload("Nutzer_anlegen")).toMatch(/Kein Lead-Paket.*direkt in Nutzer anlegen/);
    expect(meldungNachVertragUpload(null)).toMatch(/bleibt unverändert/);
    for (const stufe of ["Rechnung", "Nutzer_anlegen", null] as const) {
      expect(meldungNachVertragUpload(stufe)).not.toMatch(GEDANKENSTRICH);
    }
    expect(VERTRAGS_TAB).toContain("description: meldungNachVertragUpload(neueStufe)");
    expect(VERTRAGS_TAB).not.toContain("Backoffice wurde informiert");
  });
});

describe("Punkt 3, Vorbedingung: aus Rechnung führt nur die Zahlung heraus", () => {
  it("die Zahlung schiebt nur aus Rechnung und nur mit Lead-Paket weiter", () => {
    expect(stufeNachZahlung(MIT, "Rechnung")).toBe("Nutzer_anlegen");
    expect(stufeNachZahlung(undefined, "Rechnung")).toBeNull();
    expect(stufeNachZahlung(MIT, "Nutzer_anlegen")).toBeNull();
    expect(stufeNachZahlung(MIT, "Vertrag")).toBeNull();
    expect(stufeNachZahlung(MIT, "Aktiv")).toBeNull();
  });

  it("der Onboarding-Termin schiebt ein offenes Lead-Paket nicht aus Rechnung", () => {
    expect(wartetAufLeadPaketZahlung(MIT, "Rechnung", false)).toBe(true);
    expect(wartetAufLeadPaketZahlung(MIT, "Rechnung", true)).toBe(false);
    expect(wartetAufLeadPaketZahlung(undefined, "Rechnung", false)).toBe(false);
    expect(wartetAufLeadPaketZahlung(MIT, "Vertrag", false)).toBe(false);
    expect(AKTIVIERUNG_TAB).toContain("wartetAufLeadPaketZahlung(b.leadPaket, b.status, istBezahlt)");
  });
});
