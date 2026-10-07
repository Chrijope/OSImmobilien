import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Stift im Steuer-Cockpit und der Bearbeiten-Dialog muessen in DASSELBE
 * Feld schreiben. Geprueft wird hier der gemeinsame Schreibweg: Welche
 * Spalten und welche meta-Schluessel die Aenderung setzt und was an Supabase
 * geht. Supabase ist eine Attrappe, es werden keine echten Daten beruehrt.
 */
const { updateMock, eqMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  eqMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabelle: string) => ({
      update: (werte: unknown) => {
        updateMock(tabelle, werte);
        return { eq: (spalte: string, wert: string) => eqMock(spalte, wert) };
      },
    }),
  },
}));

import {
  aktualisiereEigenesInvestment,
  altwerteZuAenderung,
  anlageVAusFormular,
  einzelwerteZuAenderung,
  uebernimmAltwerte,
  wendeAenderungAn,
  ANLAGE_V_FORMULARFELDER,
} from "@/lib/eigeneInvestmentSpeichern";
import {
  bodenwertAusGebaeudeAnteil,
  cockpitWerte,
  gebaeudeAnteilAusBodenwert,
  hausgeldEuroAusProzent,
  hausgeldProzentAusEuro,
  leseAnlageV,
  type ExternesInvestment,
} from "@/lib/eigeneInvestmentBerechnungen";

// Erfundene Testwohnung, keine echten Kundendaten.
const inv = (extra: Partial<ExternesInvestment> = {}): ExternesInvestment => ({
  id: "inv-1",
  bezeichnung: "Musterwohnung Teststraße",
  kaufpreis: 300000,
  kaufdatum: "2024-01-15",
  baujahr: null,
  nebenkosten: 30000,
  darlehenssumme: 250000,
  offene_tilgung: null,
  zinssatz: 3.5,
  monatliche_rate: 1200,
  mieteinnahmen_kalt: 1000,
  hausgeld: 300,
  ruecklagen: 50,
  meta: { quelle: "extern", notizFeld: "bleibt", anlageV: { versicherung_jahr: 240 } },
  grundsteuer_jahr: null,
  versicherung_jahr: null,
  ...extra,
});

describe("einzelwerteZuAenderung", () => {
  it("setzt die Grundsteuer in Spalte und meta.anlageV, wie der Dialog", () => {
    const a = einzelwerteZuAenderung(inv(), { grundsteuer_jahr: "412,50" });
    expect(a.anlageV.grundsteuer_jahr).toBe(412.5);
    expect((a.meta.anlageV as Record<string, unknown>).grundsteuer_jahr).toBe(412.5);
    // Der Dialog baut die Anlage-V-Werte mit derselben Umwandlung.
    expect(anlageVAusFormular({ grundsteuer_jahr: "412,50" }).grundsteuer_jahr).toBe(412.5);
  });

  it("behaelt alle anderen gespeicherten Werte und meta-Schluessel", () => {
    const a = einzelwerteZuAenderung(inv(), { grundsteuer_jahr: "400" });
    // Versicherung lag nur in meta.anlageV (Migration nicht gelaufen) und bleibt erhalten.
    expect(a.anlageV.versicherung_jahr).toBe(240);
    expect(a.meta.notizFeld).toBe("bleibt");
    expect(a.meta.quelle).toBe("extern");
    expect(Object.keys(a.anlageV).sort()).toEqual([...ANLAGE_V_FORMULARFELDER].sort());
    expect(a.payload).toEqual({});
  });

  it("leeres Feld wird NULL, nicht 0", () => {
    const a = einzelwerteZuAenderung(inv({ grundsteuer_jahr: 500 }), { grundsteuer_jahr: "" });
    expect(a.anlageV.grundsteuer_jahr).toBeNull();
  });

  it("schreibt Baujahr als Spalte und erste Mieteinnahme als meta.erste_miete", () => {
    const a = einzelwerteZuAenderung(inv(), { baujahr: "1998", afa_satz_prozent: "2", erste_miete: "2024-03-01" });
    expect(a.payload).toEqual({ baujahr: 1998 });
    expect(a.anlageV.afa_satz_prozent).toBe(2);
    expect(a.meta.erste_miete).toBe("2024-03-01");
  });

  it("nach dem Anwenden liest leseAnlageV den neuen Wert", () => {
    const neu = wendeAenderungAn(inv(), einzelwerteZuAenderung(inv(), { umlagen_monat: "180" }));
    expect(leseAnlageV(neu).umlagenMonat).toBe(180);
  });
});

describe("aktualisiereEigenesInvestment", () => {
  beforeEach(() => {
    updateMock.mockReset();
    eqMock.mockReset();
  });

  it("schreibt Spalten und meta in externe_investments, nur die eigene Zeile per id", async () => {
    eqMock.mockResolvedValue({ error: null });
    const a = einzelwerteZuAenderung(inv(), { grundsteuer_jahr: "400" });
    const { error } = await aktualisiereEigenesInvestment("inv-1", a);
    expect(error).toBeNull();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [tabelle, werte] = updateMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(tabelle).toBe("externe_investments");
    expect(werte.grundsteuer_jahr).toBe(400);
    expect((werte.meta as { anlageV: Record<string, unknown> }).anlageV.grundsteuer_jahr).toBe(400);
    expect(eqMock).toHaveBeenCalledWith("id", "inv-1");
  });

  it("faellt ohne die Anlage-V-Spalten auf meta allein zurueck, wenn die Migration fehlt", async () => {
    eqMock
      .mockResolvedValueOnce({ error: { code: "PGRST204", message: "column not found" } })
      .mockResolvedValueOnce({ error: null });
    const a = einzelwerteZuAenderung(inv(), { grundsteuer_jahr: "400" });
    const { error } = await aktualisiereEigenesInvestment("inv-1", a);
    expect(error).toBeNull();
    expect(updateMock).toHaveBeenCalledTimes(2);
    const zweiter = updateMock.mock.calls[1][1] as Record<string, unknown>;
    expect(zweiter.grundsteuer_jahr).toBeUndefined();
    expect((zweiter.meta as { anlageV: Record<string, unknown> }).anlageV.grundsteuer_jahr).toBe(400);
  });

  it("gibt andere Fehler weiter, ohne zweiten Versuch", async () => {
    eqMock.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    const { error } = await aktualisiereEigenesInvestment("inv-1", einzelwerteZuAenderung(inv(), { grundsteuer_jahr: "1" }));
    expect(error?.code).toBe("42501");
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

/*
 * Ein Wert fuer Bodenwert und Verwaltungsanteil (Entscheidung 25.09.2026):
 * Die Prozentfelder oben im Cockpit schreiben in die Dialogfelder, und die
 * Altwerte aus meta.steuerCockpit werden beim Laden einmalig uebernommen.
 */
describe("Bodenwert und Hausgeld-Verwaltungsanteil: Umrechnung", () => {
  it("Gebaeudeanteil ist 100 minus Bodenwert, hin und zurueck", () => {
    expect(gebaeudeAnteilAusBodenwert(20)).toBe(80);
    expect(gebaeudeAnteilAusBodenwert(17.5)).toBe(82.5);
    expect(bodenwertAusGebaeudeAnteil(gebaeudeAnteilAusBodenwert(33.33))).toBe(33.33);
    expect(gebaeudeAnteilAusBodenwert(0)).toBe(100);
  });

  it("rechnet nichts aus fehlenden oder unzulaessigen Angaben", () => {
    expect(gebaeudeAnteilAusBodenwert(null)).toBeNull();
    expect(gebaeudeAnteilAusBodenwert("")).toBeNull();
    expect(gebaeudeAnteilAusBodenwert(150)).toBeNull();
    expect(gebaeudeAnteilAusBodenwert(-1)).toBeNull();
  });

  it("Verwaltungsanteil wird nur mit Gesamthausgeld zu Euro je Monat", () => {
    expect(hausgeldEuroAusProzent(30, 300)).toBe(90);
    expect(hausgeldEuroAusProzent(12.5, 287)).toBe(35.88);
    expect(hausgeldEuroAusProzent(30, 0)).toBeNull();
    expect(hausgeldEuroAusProzent(30, null)).toBeNull();
    expect(hausgeldProzentAusEuro(90, 300)).toBe(30);
    expect(hausgeldProzentAusEuro(90, 0)).toBeNull();
  });
});

describe("altwerteZuAenderung: einmalige Uebernahme aus meta.steuerCockpit", () => {
  const mitAltwerten = (steuerCockpit: Record<string, unknown>, extra: Partial<ExternesInvestment> = {}) =>
    inv({ meta: { quelle: "extern", steuerCockpit }, ...extra });

  it("uebernimmt den Bodenwert als Gebaeudeanteil in das leere Dialogfeld und entfernt den Altwert", () => {
    const a = altwerteZuAenderung(mitAltwerten({ bodenwertAnteil: 20, grenzsteuersatz: 42, sonderAfA7b: true }))!;
    expect(a.anlageV.gebaeude_anteil_prozent).toBe(80);
    expect((a.meta.anlageV as Record<string, unknown>).gebaeude_anteil_prozent).toBe(80);
    // Grenzsteuersatz und Sonder-AfA bleiben, wo sie sind.
    expect(a.meta.steuerCockpit).toEqual({ grenzsteuersatz: 42, sonderAfA7b: true });
    expect(a.meta.quelle).toBe("extern");
  });

  it("uebernimmt den Verwaltungsanteil als Euro je Monat, wenn ein Hausgeld vorliegt", () => {
    const a = altwerteZuAenderung(mitAltwerten({ hausgeldNichtUmlagefaehig: 30 }, { hausgeld: 300 }))!;
    expect(a.anlageV.hausgeld_nicht_umlage_monat).toBe(90);
    expect(a.meta.steuerCockpit).toEqual({});
  });

  it("laesst den Verwaltungsanteil ohne Hausgeld liegen und rechnet nichts", () => {
    expect(altwerteZuAenderung(mitAltwerten({ hausgeldNichtUmlagefaehig: 30 }, { hausgeld: 0 }))).toBeNull();
    const a = altwerteZuAenderung(mitAltwerten({ bodenwertAnteil: 25, hausgeldNichtUmlagefaehig: 30 }, { hausgeld: 0 }))!;
    expect(a.anlageV.gebaeude_anteil_prozent).toBe(75);
    expect(a.anlageV.hausgeld_nicht_umlage_monat).toBeNull();
    expect(a.meta.steuerCockpit).toEqual({ hausgeldNichtUmlagefaehig: 30 });
  });

  it("ein gefuelltes Dialogfeld gewinnt, der Altwert wird nur entfernt", () => {
    const a = altwerteZuAenderung(mitAltwerten({ bodenwertAnteil: 20 }, { gebaeude_anteil_prozent: 70 }))!;
    expect(a.anlageV.gebaeude_anteil_prozent).toBe(70);
    expect(a.meta.steuerCockpit).toEqual({});
  });

  it("ohne Altwerte gibt es nichts zu tun", () => {
    expect(altwerteZuAenderung(inv())).toBeNull();
    expect(altwerteZuAenderung(mitAltwerten({ grenzsteuersatz: 35 }))).toBeNull();
  });

  it("ist einmalig: nach der Uebernahme gilt nur noch der Dialogwert", () => {
    const vorher = mitAltwerten({ bodenwertAnteil: 20, hausgeldNichtUmlagefaehig: 30 }, { hausgeld: 300 });
    const nachher = wendeAenderungAn(vorher, altwerteZuAenderung(vorher)!);
    // Vor und nach der Uebernahme rechnen alle Leser mit demselben Wert.
    expect(cockpitWerte(vorher)).toEqual(cockpitWerte(nachher));
    expect(cockpitWerte(nachher)).toEqual({
      gebaeudeAnteilProzent: 80, bodenwertAnteil: 20, hausgeldNichtUmlageMonat: 90, hausgeldNichtUmlageProzent: 30,
    });
    expect(altwerteZuAenderung(nachher)).toBeNull();
    // Wird das Dialogfeld danach geleert, kommt der Altwert nicht zurueck.
    const geleert = wendeAenderungAn(nachher, einzelwerteZuAenderung(nachher, { gebaeude_anteil_prozent: "" }));
    expect(cockpitWerte(geleert).gebaeudeAnteilProzent).toBeNull();
  });
});

describe("uebernimmAltwerte", () => {
  beforeEach(() => {
    updateMock.mockReset();
    eqMock.mockReset();
  });

  it("schreibt die Uebernahme ueber den gemeinsamen Weg und liefert den neuen Stand", async () => {
    eqMock.mockResolvedValue({ error: null });
    const neu = await uebernimmAltwerte(inv({ meta: { steuerCockpit: { bodenwertAnteil: 20 } } }));
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [tabelle, werte] = updateMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(tabelle).toBe("externe_investments");
    expect(werte.gebaeude_anteil_prozent).toBe(80);
    expect(leseAnlageV(neu).gebaeudeAnteilProzent).toBe(80);
    expect(neu.meta.steuerCockpit).toEqual({});
  });

  it("schreibt nichts, wenn es nichts zu uebernehmen gibt", async () => {
    const alt = inv();
    expect(await uebernimmAltwerte(alt)).toBe(alt);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("laesst das Investment bei einem Fehler unveraendert", async () => {
    eqMock.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    const alt = inv({ meta: { steuerCockpit: { bodenwertAnteil: 20 } } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await uebernimmAltwerte(alt)).toBe(alt);
    warn.mockRestore();
  });
});
