import { describe, it, expect } from "vitest";
import {
  anlageVDateiname,
  baueAnlageVAufstellung,
  erhaltungsBelegeDesJahres,
  type AnlageVInvestment,
} from "@/lib/anlageVExport";
import { erhaltungsaufwandAusBelegen } from "@/lib/eigeneInvestmentBerechnungen";

/** Vollstaendig erfasstes Investment: alle Anlage-V-Angaben vorhanden. */
const vollInv = (over: Partial<AnlageVInvestment> = {}): AnlageVInvestment => ({
  id: "t1",
  bezeichnung: "Testwohnung",
  adresse: "Musterweg 1",
  plz: "15749",
  ort: "Mittenwalde",
  kaufpreis: 300000,
  kaufdatum: "2024-05-15",
  baujahr: 1990,
  wohnflaeche: 60,
  nebenkosten: 30000,
  darlehenssumme: 250000,
  offene_tilgung: 240000,
  zinssatz: 4,
  monatliche_rate: 1200,
  mieteinnahmen_kalt: 1000,
  hausgeld: 300,
  ruecklagen: 50,
  dokumente: [],
  meta: { erste_miete: "2024-06-01" },
  gebaeude_anteil_prozent: 80,
  umlagen_monat: 200,
  grundsteuer_jahr: 400,
  versicherung_jahr: 300,
  verwaltungskosten_jahr: 350,
  hausgeld_nicht_umlage_monat: 90,
  ...over,
});

const opt = { jahr: 2026, herkunft: "eigen" as const };

describe("baueAnlageVAufstellung, vollstaendiges Investment", () => {
  const a = baueAnlageVAufstellung(vollInv(), opt);

  it("ist vollstaendig, ohne fehlende Angaben (Steuersatz zaehlt hier nicht)", () => {
    expect(a.fehlendeAngaben).toEqual([]);
    expect(a.unvollstaendig).toBe(false);
  });

  it("kennzeichnet keine Zeile als fehlend", () => {
    for (const z of [...a.einnahmen, ...a.werbungskosten]) {
      expect(z.fehlt, z.posten).toBe(false);
      expect(z.betrag, z.posten).not.toBeNull();
    }
  });

  it("rechnet Einnahmen und Werbungskosten wie das Steuer-Cockpit", () => {
    // Miete 12 x 1.000 plus Umlagen 12 x 200
    expect(a.summeEinnahmen).toBeCloseTo(14400, 2);
    // Zinsen 9.600 + AfA 5.280 + Hausgeld n.u. 1.080 + umlagefaehig 2.520
    // + Grundsteuer 400 + Versicherung 300 + Verwaltung 350
    expect(a.summeWerbungskosten).toBeCloseTo(19530, 2);
    expect(a.ueberschussVerlust).toBeCloseTo(14400 - 19530, 2);
  });

  it("nennt zu jeder Zeile Rechtsgrundlage und Datenherkunft", () => {
    for (const z of [...a.einnahmen, ...a.werbungskosten]) {
      expect(z.rechtsgrundlage, z.posten).not.toBe("");
      expect(z.quelle, z.posten).not.toBe("");
    }
    const afa = a.werbungskosten.find((z) => z.posten.startsWith("AfA"));
    expect(afa?.rechtsgrundlage).toContain("§ 7");
    const miete = a.einnahmen[0];
    expect(miete.rechtsgrundlage).toContain("§ 21");
    expect(miete.quelle).toBe("erfasst vom Kunden");
  });

  it("fuehrt die Objektangaben inklusive Adresse und Miteigentumsanteil", () => {
    const werte = Object.fromEntries(a.objekt.map((o) => [o.label, o.wert]));
    expect(werte["Bezeichnung"]).toBe("Testwohnung");
    expect(werte["Adresse"]).toContain("Musterweg 1");
    expect(werte["Adresse"]).toContain("15749 Mittenwalde");
    expect(werte["Wohnfläche"]).toBe("60 m²");
    expect(werte["Miteigentumsanteil"]).toContain("100 %");
  });
});

describe("baueAnlageVAufstellung, fehlende Angaben", () => {
  it("legt fehlende Posten in die Fehlliste statt sie zu schaetzen", () => {
    const a = baueAnlageVAufstellung(
      vollInv({
        nebenkosten: 0,
        gebaeude_anteil_prozent: null,
        umlagen_monat: null,
        grundsteuer_jahr: null,
        versicherung_jahr: null,
        verwaltungskosten_jahr: null,
        hausgeld_nicht_umlage_monat: null,
      }),
      opt,
    );
    expect(a.unvollstaendig).toBe(true);
    expect(a.fehlendeAngaben.join(" ")).toContain("Umlagen");
    expect(a.fehlendeAngaben.join(" ")).toContain("Gebäudeanteil");
    expect(a.fehlendeAngaben.join(" ")).toContain("Grundsteuer");
    expect(a.fehlendeAngaben.join(" ")).toContain("Versicherung");
    expect(a.fehlendeAngaben.join(" ")).toContain("Verwaltungskosten");
    expect(a.fehlendeAngaben.join(" ")).toContain("Kaufnebenkosten");
    // Der Steuersatz gehoert nicht zur Anlage V und taucht nicht auf.
    expect(a.fehlendeAngaben.join(" ")).not.toContain("Steuersatz");

    const afa = a.werbungskosten.find((z) => z.posten.startsWith("AfA"));
    expect(afa?.fehlt).toBe(true);
    expect(afa?.betrag).toBeNull();
    const grundsteuer = a.werbungskosten.find((z) => z.posten === "Grundsteuer");
    expect(grundsteuer?.fehlt).toBe(true);
    expect(grundsteuer?.betrag).toBeNull();
  });

  it("meldet fehlende Kaltmiete als eigene fehlende Angabe", () => {
    const a = baueAnlageVAufstellung(vollInv({ mieteinnahmen_kalt: 0 }), opt);
    expect(a.fehlendeAngaben.join(" ")).toContain("Kaltmiete");
    expect(a.einnahmen[0].fehlt).toBe(true);
    expect(a.einnahmen[0].betrag).toBeNull();
  });

  it("meldet fehlenden Zinssatz bei offenem Darlehen, statt 0 Zinsen auszuweisen", () => {
    const a = baueAnlageVAufstellung(vollInv({ zinssatz: 0 }), opt);
    const zinsen = a.werbungskosten.find((z) => z.posten === "Schuldzinsen");
    expect(zinsen?.fehlt).toBe(true);
    expect(zinsen?.betrag).toBeNull();
    expect(a.fehlendeAngaben.join(" ")).toContain("Zinssatz");
  });
});

describe("baueAnlageVAufstellung, Miteigentum", () => {
  it("skaliert das Ergebnis mit dem Miteigentumsanteil", () => {
    const voll = baueAnlageVAufstellung(vollInv(), opt);
    const halb = baueAnlageVAufstellung(vollInv({ miteigentumsanteil_prozent: 50 }), opt);
    expect(halb.miteigentumsanteilP).toBe(50);
    expect(halb.ueberschussVerlust).toBeCloseTo(voll.ueberschussVerlust / 2, 2);
    expect(halb.summeEinnahmen).toBeCloseTo(voll.summeEinnahmen / 2, 2);
    expect(halb.summeWerbungskosten).toBeCloseTo(voll.summeWerbungskosten / 2, 2);
  });
});

describe("baueAnlageVAufstellung, Jahres-Logik", () => {
  it("setzt im Kaufjahr vermietete Monate und zeitanteilige AfA an", () => {
    const a = baueAnlageVAufstellung(vollInv(), { ...opt, jahr: 2024 });
    // erste Miete Juni 2024 → 7 vermietete Monate
    expect(a.vermieteteMonate).toBe(7);
    expect(a.vermieteteMonateAngenommen).toBe(false);
    const miete = a.einnahmen[0];
    expect(miete.betrag).toBeCloseTo(7000, 2);
    // Kauf Mai 2024 → AfA 8/12 anteilig: 264.000 x 2 % x 8/12
    const afa = a.werbungskosten.find((z) => z.posten.startsWith("AfA"));
    expect(afa?.betrag).toBeCloseTo(264000 * 0.02 * (8 / 12), 2);
    expect(afa?.posten).toContain("8/12");
  });

  it("kennzeichnet angenommene 12 Monate, wenn die erste Miete fehlt", () => {
    const a = baueAnlageVAufstellung(vollInv({ meta: {} }), opt);
    expect(a.vermieteteMonate).toBe(12);
    expect(a.vermieteteMonateAngenommen).toBe(true);
  });

  it("zaehlt Erhaltungsbelege nur im gewaehlten Steuerjahr", () => {
    const dokumente = [
      { typ: "Reparatur/Erhaltung", titel: "Handwerker Bad", betrag: 500, datum: "2025-03-12T12:00:00.000Z" },
      { typ: "Reparatur/Erhaltung", titel: "Fenster", betrag: 900, datum: "2026-01-05T12:00:00.000Z" },
      { typ: "Fotos", titel: "Ohne Betrag", datum: "2025-05-01T12:00:00.000Z" },
    ];
    const belege = erhaltungsBelegeDesJahres(dokumente, 2025);
    expect(belege).toHaveLength(1);
    expect(belege[0].titel).toBe("Handwerker Bad");
    expect(belege[0].datum).toBe("12.03.2025");
    expect(belege[0].betrag).toBe(500);
    // Die Liste stimmt mit der Summe der Rechenlogik ueberein.
    const summe = erhaltungsaufwandAusBelegen(dokumente, 2025).summe;
    expect(belege.reduce((s, b) => s + b.betrag, 0)).toBe(summe);

    const a = baueAnlageVAufstellung(vollInv({ dokumente }), { ...opt, jahr: 2025 });
    const erhaltung = a.werbungskosten.find((z) => z.posten.startsWith("Erhaltungsaufwand"));
    expect(erhaltung?.betrag).toBe(500);
    expect(a.erhaltungsBelege).toHaveLength(1);
  });
});

describe("anlageVDateiname", () => {
  it("baut den vorgegebenen Dateinamen mit Umlaut-Ersetzung", () => {
    expect(anlageVDateiname("Wohnung Münchner Straße 5", 2026))
      .toBe("anlage-v-vorbereitung_wohnung-muenchner-strasse-5_2026.pdf");
  });
  it("faellt bei leerer Bezeichnung auf einen neutralen Namen zurueck", () => {
    expect(anlageVDateiname("", 2025)).toBe("anlage-v-vorbereitung_investment_2025.pdf");
  });
});
