import { describe, it, expect } from "vitest";
import {
  VERTRAGS_FASSUNG,
  VERTRAGS_FASSUNG_ALT,
  bewerberMitFassungAusAnfrage,
  konditionenAus,
  leadpaketAnlageNummer,
  vertragsFassungKennung,
  vertragsFassungVon,
} from "./vertragKonditionen";
import { getLizenzPaket } from "./lizenzPakete";
import type { Bewerber } from "./bewerbungStore";

/**
 * Der Fassungsschalter und das Konditionen-Objekt: Aus dem Bewerber entsteht
 * genau ein Objekt, aus dem alle Renderer, das Konditionenblatt, die
 * Zusammenfassung und der Stempel lesen.
 */

const stub = (extra: Partial<Bewerber> = {}): Bewerber =>
  ({ vorname: "Max", nachname: "Mustermann", paketwahl: "junior", ...extra }) as unknown as Bewerber;

describe("vertragsFassungVon: wer bekommt welche Textfassung", () => {
  it("neue Bewerber und Bewerber mit Entwurf bekommen die kompakte Fassung", () => {
    expect(vertragsFassungVon(stub())).toBe("neu");
    expect(vertragsFassungVon(stub({ vertragStatus: "nicht_gesendet" }))).toBe("neu");
    expect(vertragsFassungVon(stub({ vertragStatus: "abgelehnt" }))).toBe("neu");
    expect(vertragsFassungKennung(stub())).toBe(VERTRAGS_FASSUNG);
  });

  it("gesendete, wartende und unterschriebene Verträge ohne Kennzeichen sind Altfassung", () => {
    for (const status of ["gesendet", "wartet_auf_kurz", "unterschrieben"] as const) {
      expect(vertragsFassungVon(stub({ vertragStatus: status }))).toBe("alt");
      expect(vertragsFassungKennung(stub({ vertragStatus: status }))).toBe(VERTRAGS_FASSUNG_ALT);
    }
  });

  it("ein gespeichertes Kennzeichen entscheidet, egal welcher Status", () => {
    expect(vertragsFassungVon(stub({ vertragStatus: "unterschrieben", vertragFassung: VERTRAGS_FASSUNG }))).toBe("neu");
    expect(vertragsFassungVon(stub({ vertragStatus: "nicht_gesendet", vertragFassung: VERTRAGS_FASSUNG_ALT }))).toBe("alt");
  });

  it("ein Kennzeichen aus einer früheren kompakten Fassung bleibt kompakt", () => {
    // Die Weiche vergleicht nur gegen das Kennzeichen der Altfassung; jedes
    // andere nicht leere Kennzeichen heißt kompakt. Deshalb bleiben Verträge,
    // die im Testbetrieb unter einem inzwischen geänderten Kennzeichen
    // gespeichert wurden, ohne Zutun in der kompakten Fassung.
    // "2026-09-05" war einen Tag lang das Kennzeichen und wurde auf
    // "2026-09-04" korrigiert, weil es sonst in der Zukunft läge.
    for (const alt of ["2026-09-05", "2026-09-02", "irgendein-kennzeichen"]) {
      expect(vertragsFassungVon(stub({ vertragStatus: "gesendet", vertragFassung: alt }))).toBe("neu");
      expect(vertragsFassungVon(stub({ vertragStatus: "unterschrieben", vertragFassung: alt }))).toBe("neu");
    }
    expect(VERTRAGS_FASSUNG).not.toBe(VERTRAGS_FASSUNG_ALT);
  });

  it("das Fassungskennzeichen liegt nie in der Zukunft", () => {
    // Auf jedem Deckblatt stehen Datum und Fassung nebeneinander. Ein
    // Fassungsdatum nach dem heutigen Tag fällt dort sofort auf.
    const [j, m, t] = VERTRAGS_FASSUNG.split("-").map(Number);
    const fassungsTag = new Date(j, m - 1, t);
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    expect(fassungsTag.getTime()).toBeLessThanOrEqual(heute.getTime());
  });

  it("die vier Altpakete bleiben immer in der langen Fassung", () => {
    for (const paket of ["lead", "team_builder", "enterprise", "partner_2"]) {
      expect(vertragsFassungVon(stub({ paketwahl: paket, vertragFassung: VERTRAGS_FASSUNG }))).toBe("alt");
      expect(vertragsFassungVon(stub(), paket)).toBe("alt");
    }
    expect(vertragsFassungVon(stub({ paketwahl: "lead_berater" }))).toBe("neu");
  });

  it("Signaturanfragen ohne Kennzeichen gehören zur Altfassung", () => {
    expect(bewerberMitFassungAusAnfrage({ vertragFassung: "" }).vertragFassung).toBe(VERTRAGS_FASSUNG_ALT);
    expect(bewerberMitFassungAusAnfrage({ vertragFassung: VERTRAGS_FASSUNG }).vertragFassung).toBe(VERTRAGS_FASSUNG);
  });

  it("die Leadpaket-Vereinbarung heißt Anlage 3 neu und Anlage 9 alt", () => {
    // Vom 04.09. bis 06.09.2026 war sie Anlage 4, weil die 3 der
    // Servicevereinbarung gehörte. Die ist seit dem 07.09.2026 entfallen.
    expect(leadpaketAnlageNummer("neu")).toBe("Anlage 3");
    expect(leadpaketAnlageNummer("alt")).toBe("Anlage 9");
  });
});

describe("konditionenAus: ein Objekt für alle Konditionen", () => {
  it("liefert null ohne bekanntes Paket", () => {
    expect(konditionenAus(stub({ paketwahl: "" }))).toBeNull();
    expect(konditionenAus(stub({ paketwahl: "gibtsnicht" }))).toBeNull();
  });

  it("Standard-Vertriebspartner: kein laufendes Entgelt, keine Mindestlaufzeit, 4 Prozent, kein Leadpaket, Standardfassung", () => {
    // Bis zum 06.09.2026 standen hier 150 Euro und 12 Monate. Seit dem
    // 07.09.2026 kennt die kompakte Fassung weder Gebühr noch Mindestlaufzeit.
    const k = konditionenAus(stub())!;
    expect(k.fassung).toBe("neu");
    expect(k.paketId).toBe("junior");
    expect(k.hasCrmGebuehr).toBe(false);
    expect(k.crmGebuehrMonatlich).toBe(0);
    expect(k.crmGebuehrErlassen).toBe(false);
    expect(k.mindestlaufzeitMonate).toBe(0);
    expect(k.laufzeitOffen).toBe(false);
    expect(k.standardSatz).toBe(4);
    expect(k.hasOverride).toBe(false);
    expect(k.leadModell).toBe("leadpaket");
    expect(k.leadPaket).toBeNull();
    expect(k.wettbewerbsfassung).toBe("standard");
    expect(k.andereVertriebe).toEqual([]);
    expect(k.einmalbetrag).toBe(0);
    expect(k.raten).toEqual([]);
    expect(k.schutzfristMonate).toBe(24);
    expect(k.vertragsstrafeMaxEinzel).toBe(25000);
    expect(k.vertragsstrafeMaxSystematisch).toBe(50000);
  });

  it("der Altwert ohneCrmGebuehr bleibt in der kompakten Fassung harmlos", () => {
    // Bis zum 06.09.2026 schaltete dieser Wert die Servicevereinbarung ab.
    // Jetzt gibt es nichts mehr abzuschalten; der Wert wird nur noch für den
    // Konditionen-Stempel weitergeführt (laufzeitOffen), damit bereits
    // erzeugte Verträge nicht als veraltet gelten.
    const k = konditionenAus(stub({ ohneCrmGebuehr: true }))!;
    expect(k.hasCrmGebuehr).toBe(false);
    expect(k.crmGebuehrMonatlich).toBe(0);
    expect(k.crmGebuehrErlassen).toBe(true);
    expect(k.mindestlaufzeitMonate).toBe(0);
    expect(k.laufzeitOffen).toBe(true);
    expect(k.paket).toEqual(konditionenAus(stub())!.paket);
  });

  it("Bestandspartner der Altfassung behalten die CRM-Systemgebühr samt Mindestlaufzeit", () => {
    // Das Paket trägt die Gebühr nicht mehr; für die Altfassung wird sie
    // ergänzt, damit Zusammenfassung, Stempel und neu erzeugter Alttext
    // unverändert das sagen, was der Partner unterschrieben hat.
    const alt = konditionenAus(stub({ vertragFassung: VERTRAGS_FASSUNG_ALT }))!;
    expect(alt.fassung).toBe("alt");
    expect(alt.hasCrmGebuehr).toBe(true);
    expect(alt.crmGebuehrMonatlich).toBe(150);
    expect(alt.mindestlaufzeitMonate).toBe(12);
    expect(alt.paket.features.join("\n")).toContain("CRM-Systemgebühr 150 € brutto/Monat");
    // Der frühere Schalter wirkt dort weiter wie vereinbart.
    const ohne = konditionenAus(stub({ vertragFassung: VERTRAGS_FASSUNG_ALT, ohneCrmGebuehr: true }))!;
    expect(ohne.hasCrmGebuehr).toBe(false);
    expect(ohne.crmGebuehrMonatlich).toBe(0);
    expect(ohne.mindestlaufzeitMonate).toBe(0);
  });

  it("individuelle Sätze, Leadpaket und Individualfassung landen im Objekt", () => {
    const k = konditionenAus(stub({
      satzLead: "3", satzEigen: "5", individuelleVertragsFassung: true, andereVertriebe: "A GmbH\n\nB AG\n",
      leadPaket: { betrag: 2500, anzahl: 20 },
    }))!;
    expect(k.saetze).toEqual({ individuell: null, lead: 3, eigen: 5, bestand: null, neubau: null });
    expect(k.saetzeRoh).toEqual(["", "3", "5", "", ""]);
    expect(k.hasOverride).toBe(true);
    expect(k.saetzeListe).toHaveLength(2);
    expect(k.leadPaket).toEqual({ betrag: 2500, anzahl: 20 });
    expect(k.wettbewerbsfassung).toBe("individuell");
    expect(k.andereVertriebe).toEqual(["A GmbH", "B AG"]);
    expect(k.paket.features.join("\n")).toContain("Individuell vereinbarte Provision");
  });

  it("ausdrücklich übergebene Sätze aus dem Closing-Formular haben Vorrang", () => {
    const k = konditionenAus(stub({ satzLead: "3" }), { saetze: { individuell: 3.5 } })!;
    expect(k.saetze.individuell).toBe(3.5);
    // Die gespeicherten Rohwerte bleiben für den Stempel erhalten.
    expect(k.saetzeRoh[1]).toBe("3");
  });

  it("Lead-Berater: gestellte Leads, nie ein Leadpaket", () => {
    const k = konditionenAus(stub({ paketwahl: "lead_berater", leadPaket: { betrag: 2500, anzahl: 20 } }))!;
    expect(k.leadModell).toBe("gestellt");
    expect(k.leadPaket).toBeNull();
  });

  it("Altpakete: Einmalbetrag mit Ratenplan, lange Fassung, kürzere Schutzfrist beim Partner-Vertrag", () => {
    const lead = konditionenAus(stub({ paketwahl: "lead", zahlungsweise: "raten_2" }))!;
    expect(lead.fassung).toBe("alt");
    expect(lead.einmalbetrag).toBe(5000);
    expect(lead.raten).toEqual([2500, 2500]);
    expect(lead.zahlungsweiseLabel).toBe("2 Raten");
    expect(lead.leadModell).toBe("altpaket");
    const partner = konditionenAus(stub({ paketwahl: "partner_2" }))!;
    expect(partner.partnerHonorar).toBe(true);
    expect(partner.hasCrmGebuehr).toBe(false);
    expect(partner.schutzfristMonate).toBe(12);
  });

  it("die Individualfassung greift nur bei Paketen mit Vertragsschaltern", () => {
    const k = konditionenAus(stub({ paketwahl: "lead", individuelleVertragsFassung: true, andereVertriebe: "A" }), { paket: getLizenzPaket("lead") })!;
    expect(k.wettbewerbsfassung).toBe("standard");
  });
});
