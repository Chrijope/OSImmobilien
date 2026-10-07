import { describe, it, expect } from "vitest";
import {
  ALT_CRM_LAUFZEIT_MONATE,
  ALT_CRM_MONATLICH_EUR,
  GESTELLT_ZUSATZ_KURZ,
  LEAD_EINZELPREIS,
  LEAD_PAKET_ANZAHL,
  LEAD_PAKET_PREIS,
  LEAD_PAKET_PREIS_PRO_LEAD,
  LIZENZ_PAKETE,
  PAKETE_MIT_VERTRAGSSCHALTERN,
  WAEHLBARE_LIZENZ_PAKETE,
  berechneLeadAnzahl,
  getLizenzPaket,
} from "@/lib/lizenzPakete";

/**
 * Konditionen-Fundament des Bewerbermanagement-Umbaus: einheitliche 4 %
 * Provision, kein laufendes Entgelt (seit dem 07.09.2026), optionaler Leadkauf
 * statt Setup-Paketen. Diese Tests halten die Zahlen fest, aus denen Verträge,
 * Rechner und Anzeigen abgeleitet werden.
 */

describe("Leadmodell-Konstanten", () => {
  it("Paket 2.500 Euro = 20 Leads, Einzel-Lead 150 Euro", () => {
    expect(LEAD_PAKET_PREIS).toBe(2500);
    expect(LEAD_PAKET_ANZAHL).toBe(20);
    expect(LEAD_EINZELPREIS).toBe(150);
    // 125 Euro je Lead im Paket, der Einzelpreis liegt bewusst darüber.
    expect(LEAD_PAKET_PREIS / LEAD_PAKET_ANZAHL).toBe(125);
    expect(LEAD_PAKET_PREIS_PRO_LEAD).toBe(125);
    expect(LEAD_EINZELPREIS).toBeGreaterThan(LEAD_PAKET_PREIS / LEAD_PAKET_ANZAHL);
  });
});

describe("berechneLeadAnzahl (individueller Leadpaket-Betrag)", () => {
  it("liefert beim Standardbetrag die Standardanzahl", () => {
    expect(berechneLeadAnzahl(LEAD_PAKET_PREIS)).toBe(LEAD_PAKET_ANZAHL);
  });

  it("rundet die Anzahl ab (Betrag / 125)", () => {
    expect(berechneLeadAnzahl(2600)).toBe(20); // 20,8 -> 20
    expect(berechneLeadAnzahl(2625)).toBe(21);
    expect(berechneLeadAnzahl(3000)).toBe(24);
    expect(berechneLeadAnzahl(5000)).toBe(40);
  });

  it("lehnt Beträge unter dem Mindestbetrag von 2.500 Euro ab (0 Leads)", () => {
    expect(berechneLeadAnzahl(2499)).toBe(0);
    expect(berechneLeadAnzahl(0)).toBe(0);
    expect(berechneLeadAnzahl(-100)).toBe(0);
    expect(berechneLeadAnzahl(NaN)).toBe(0);
    expect(berechneLeadAnzahl(Infinity)).toBe(0);
  });
});

/*
 * Bis zum 06.09.2026 prüfte dieser Block das Serviceentgelt von 150 Euro
 * brutto im Monat bei 12 Monaten Mindestlaufzeit. Seit dem 07.09.2026 gibt es
 * bei den aktuellen Paketen kein laufendes Entgelt mehr; die beiden Werte
 * leben nur noch als CRM-Systemgebühr der Altfassung für Bestandspartner
 * weiter. Der Test hält jetzt genau diese Trennung fest.
 */
describe("Kein laufendes Entgelt bei den aktuellen Paketen", () => {
  it("die CRM-Systemgebühr der Altfassung bleibt für Bestandspartner beziffert", () => {
    expect(ALT_CRM_MONATLICH_EUR).toBe(150);
    expect(ALT_CRM_LAUFZEIT_MONATE).toBe(12);
  });

  it("nur die drei Altpakete mit Einmalbetrag tragen sie noch", () => {
    for (const id of ["lead", "team_builder", "enterprise"] as const) {
      expect(getLizenzPaket(id)!.monatlich, id).toBe(ALT_CRM_MONATLICH_EUR);
      expect(getLizenzPaket(id)!.laufzeitMonate, id).toBe(ALT_CRM_LAUFZEIT_MONATE);
    }
    for (const id of ["junior", "lead_berater", "partner_2", "tippgeber"] as const) {
      expect(getLizenzPaket(id)!.monatlich, id).toBe(0);
      expect(getLizenzPaket(id)!.laufzeitMonate, id).toBe(0);
    }
  });

  it("die wählbaren Pakete nennen nirgends eine Servicevereinbarung oder 150 Euro im Monat", () => {
    for (const p of WAEHLBARE_LIZENZ_PAKETE) {
      const alles = [p.kurz, p.zielgruppe, ...p.features].join(" ");
      expect(alles, p.id).not.toMatch(/Servicevereinbarung|Serviceentgelt|Systemgebühr/);
      expect(alles, p.id).not.toMatch(/150\s?€\s?(brutto|\/\s?Monat)|150 Euro/);
      expect(alles, p.id).not.toMatch(/Mindestlaufzeit, danach/);
    }
  });
});

describe("Paket Vertriebspartner (junior)", () => {
  const junior = getLizenzPaket("junior")!;

  it("hat einheitlich 4 % Provision, keine Setup-Gebühr und kein laufendes Entgelt", () => {
    expect(junior.titel).toBe("Vertriebspartner");
    expect(junior.provisionssatz).toBe(4);
    expect(junior.preis).toBe(0);
    expect(junior.monatlich).toBe(0);
    expect(junior.laufzeitMonate).toBe(0);
    expect(junior.waehlbar).not.toBe(false);
  });

  it("zählt die früheren Zusatzleistungen als gestellt auf", () => {
    const zeile = junior.features.find((f) => f.startsWith(GESTELLT_ZUSATZ_KURZ));
    expect(zeile).toBeTruthy();
    expect(zeile).toContain("ebenfalls gestellt, kein laufendes Entgelt, keine Mindestlaufzeit");
    expect(junior.features.some((f) => f.includes("unentgeltlich (§ 86a HGB)"))).toBe(true);
  });

  it("erwähnt in den Featuretexten weder 3 % noch eine Setup-Investition", () => {
    const alles = [junior.kurz, junior.zielgruppe, ...junior.features].join(" ");
    expect(alles).not.toMatch(/3\s?%/);
    expect(alles.toLowerCase()).not.toContain("setup-investition");
  });
});

describe("Paket Lead-Berater (Duplikat des Vertriebspartners, nur Lead-Kapitel anders)", () => {
  const leadBerater = getLizenzPaket("lead_berater")!;
  const junior = getLizenzPaket("junior")!;

  it("hat dieselben Konditionen wie der Vertriebspartner", () => {
    expect(leadBerater.titel).toBe("Lead-Berater");
    expect(leadBerater.preis).toBe(junior.preis);
    expect(leadBerater.monatlich).toBe(junior.monatlich);
    expect(leadBerater.laufzeitMonate).toBe(junior.laufzeitMonate);
    expect(leadBerater.provisionssatz).toBe(junior.provisionssatz);
    expect(leadBerater.waehlbar).not.toBe(false);
  });

  it("ersetzt nur die Leadpaket-Zeile durch die Bereitstellungszusage", () => {
    const ohneLeadZeile = (features: string[]) =>
      features.filter((f) => !f.startsWith("Optionales Leadpaket") && !f.startsWith("Bereitstellung von Leads"));
    expect(ohneLeadZeile(leadBerater.features)).toEqual(ohneLeadZeile(junior.features));
    expect(leadBerater.features.join("\n")).toContain(
      "Bereitstellung von Leads zur Unterstützung der eigenen Akquisition, nach Verfügbarkeit, ohne definierte Stückzahl und ohne Anspruch auf eine bestimmte Menge",
    );
    expect(leadBerater.features.join("\n")).not.toContain("Optionales Leadpaket");
  });

  it("hängt an denselben Vertragsschaltern wie der Vertriebspartner", () => {
    expect(PAKETE_MIT_VERTRAGSSCHALTERN).toEqual(["junior", "lead_berater"]);
  });
});

describe("Wählbare Pakete", () => {
  it("zur Neuwahl stehen Vertriebspartner, Lead-Berater und Tippgeber", () => {
    expect(WAEHLBARE_LIZENZ_PAKETE.map((p) => p.id)).toEqual(["junior", "lead_berater", "tippgeber"]);
  });

  it("die Bestandspakete bleiben auflösbar, sind aber nicht mehr wählbar", () => {
    for (const id of ["lead", "team_builder", "enterprise", "partner_2"] as const) {
      const paket = getLizenzPaket(id);
      expect(paket).not.toBeNull();
      expect(paket!.waehlbar).toBe(false);
    }
    // Die Gesamtliste behält alle sieben Pakete für Bestandsdaten.
    expect(LIZENZ_PAKETE).toHaveLength(7);
  });
});
