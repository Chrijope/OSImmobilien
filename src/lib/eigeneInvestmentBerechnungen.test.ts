import { describe, it, expect } from "vitest";
import {
  afaSatz,
  berechneSteuer,
  berechneForecast,
  berechneTilgungsplan,
  erhaltungsaufwandAusBelegen,
  leseAnlageV,
  vermieteteMonate,
  type ExternesInvestment,
  type SteuerInput,
  type ForecastInput,
} from "@/lib/eigeneInvestmentBerechnungen";

const inv = (over: Partial<ExternesInvestment> = {}): ExternesInvestment => ({
  id: "t1",
  bezeichnung: "Testwohnung",
  kaufpreis: 300000,
  kaufdatum: null,
  baujahr: 1990,
  nebenkosten: 30000,
  darlehenssumme: 250000,
  offene_tilgung: 250000,
  zinssatz: 4,
  monatliche_rate: 1200,
  mieteinnahmen_kalt: 1000,
  hausgeld: 300,
  ruecklagen: 50,
  ...over,
});

const input = (over: Partial<SteuerInput> = {}): SteuerInput => ({
  bodenwertAnteil: 20,
  hausgeldNichtUmlagefaehig: 20,
  sonderAfA7b: false,
  erhaltungsaufwandJahr: 0,
  grenzsteuersatz: 42,
  betrachtungsjahr: 2026,
  ...over,
});

const forecastInput = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  jahre: 10,
  mietsteigerungP: 0,
  hausgeldSteigerungP: 0,
  anschlussZinsAufschlag: 0,
  steuersatz: 42,
  bodenwertAnteil: 20,
  hausgeldNichtUmlagefaehigP: 20,
  ...over,
});

// Gebaeudeanteil des Standardfalls: (300.000 + 30.000) x 80 % = 264.000
const GEBAEUDE = 264000;

describe("afaSatz nach § 7 Abs. 4 EStG", () => {
  it("kennt alle drei Baujahresstufen inklusive der 3-Prozent-Regel ab 2023", () => {
    expect(afaSatz(1900)).toBe(2.5);
    expect(afaSatz(1924)).toBe(2.5);
    expect(afaSatz(1925)).toBe(2);
    expect(afaSatz(1990)).toBe(2);
    expect(afaSatz(2022)).toBe(2);
    expect(afaSatz(2023)).toBe(3); // vorher fielen Neubauten faelschlich auf 2 %
    expect(afaSatz(2025)).toBe(3);
  });

  it("fliesst in berechneSteuer ein", () => {
    const neu = berechneSteuer(inv({ baujahr: 2024 }), input());
    expect(neu.afaSatzP).toBe(3);
    expect(neu.afaJahr).toBeCloseTo(GEBAEUDE * 0.03, 6);
    expect(neu.afaParagraf).toContain("§ 7 Abs. 4");
    const alt = berechneSteuer(inv({ baujahr: 1910 }), input());
    expect(alt.afaSatzP).toBe(2.5);
  });
});

describe("Angabe fehlt statt stiller Pauschalen", () => {
  it("rechnet ohne Baujahr KEINE AfA (kein 2-Prozent-Fallback)", () => {
    const erg = berechneSteuer(inv({ baujahr: null }), input());
    expect(erg.afaJahr).toBe(0);
    expect(erg.afaSatzP).toBe(0);
    expect(erg.posten.some((p) => p.fehlt && p.label.includes("AfA"))).toBe(true);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Baujahr"))).toBe(true);
  });

  it("rechnet ohne Gebaeudeanteil KEINE AfA (kein 80-Prozent-Default)", () => {
    const erg = berechneSteuer(inv(), input({ bodenwertAnteil: null }));
    expect(erg.afaJahr).toBe(0);
    expect(erg.afaBemessungsgrundlage).toBe(0);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Gebäudeanteil"))).toBe(true);
  });

  it("setzt ohne erfasste Nebenkosten KEINE 10,5-Prozent-Pauschale an", () => {
    const erg = berechneSteuer(inv({ nebenkosten: 0 }), input());
    expect(erg.nebenkosten).toBe(0);
    expect(erg.nebenkostenErfasst).toBe(false);
    // AfA-Grundlage nur aus dem Kaufpreis: 300.000 x 80 % = 240.000
    expect(erg.afaBemessungsgrundlage).toBeCloseTo(240000, 6);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Kaufnebenkosten"))).toBe(true);
  });

  it("setzt den Hausgeld-Posten ohne aktiven Prozentsatz NICHT an (keine 30-Prozent-Pauschale)", () => {
    const erg = berechneSteuer(inv(), input({ hausgeldNichtUmlagefaehig: null }));
    expect(erg.hausgeldAbsetzbarJahr).toBe(0);
    expect(erg.posten.some((p) => p.fehlt && p.label.includes("Hausgeld"))).toBe(true);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Verwaltungsanteil"))).toBe(true);
  });

  it("liefert ohne Steuersatz und ohne zvE KEINEN Steuereffekt (kein 42-Prozent-Fallback)", () => {
    const erg = berechneSteuer(inv(), input({ grenzsteuersatz: null }));
    expect(erg.steuerEffektFehlt).toBe(true);
    expect(erg.steuerEffekt).toBe(0);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Steuersatz"))).toBe(true);
  });

  it("kennzeichnet ein vollstaendiges Ergebnis ohne fehlende Angaben", () => {
    // Seit Stufe 2 gehoeren auch Grundsteuer, Versicherung, Verwaltungskosten
    // und die vereinnahmten Umlagen zur vollstaendigen Anlage V.
    const erg = berechneSteuer(
      inv({ grundsteuer_jahr: 400, versicherung_jahr: 320, verwaltungskosten_jahr: 250, umlagen_monat: 120 }),
      input(),
    );
    expect(erg.fehlendeAngaben).toEqual([]);
  });

  it("meldet die neuen Anlage-V-Posten als fehlend, wenn sie nicht erfasst sind", () => {
    const erg = berechneSteuer(inv(), input());
    expect(erg.fehlendeAngaben.some((f) => f.includes("Grundsteuer"))).toBe(true);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Versicherung"))).toBe(true);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Verwaltungskosten"))).toBe(true);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Umlagen"))).toBe(true);
    expect(erg.posten.filter((p) => p.fehlt).length).toBeGreaterThanOrEqual(4);
    // Kein stiller 0-Ansatz: die Summen bleiben ohne diese Posten
    expect(erg.grundsteuerJahr).toBe(0);
    expect(erg.umlagenJahr).toBe(0);
  });
});

describe("leseAnlageV: Spalte vor meta.anlageV", () => {
  it("liest meta.anlageV, solange die Migration nicht gelaufen ist", () => {
    const erg = leseAnlageV(inv({ meta: { anlageV: { gebaeude_anteil_prozent: 75, grundsteuer_jahr: 380 } } }));
    expect(erg.gebaeudeAnteilProzent).toBe(75);
    expect(erg.grundsteuerJahr).toBe(380);
    expect(erg.afaSatzProzent).toBeNull();
  });

  it("bevorzugt die echte Spalte vor meta.anlageV", () => {
    const erg = leseAnlageV(inv({
      gebaeude_anteil_prozent: 80,
      meta: { anlageV: { gebaeude_anteil_prozent: 60, umlagen_monat: 100 } },
    }));
    expect(erg.gebaeudeAnteilProzent).toBe(80); // Spalte gewinnt
    expect(erg.umlagenMonat).toBe(100);         // Rest weiter aus meta
  });

  it("liefert ueberall null, wenn nichts erfasst ist (kein 0-Default)", () => {
    const erg = leseAnlageV(inv());
    expect(Object.values(erg).every((v) => v === null)).toBe(true);
  });
});

describe("neue Werbungskosten-Posten (Grundsteuer, Versicherung, Verwaltung)", () => {
  it("setzt erfasste Betraege als Werbungskosten an", () => {
    const ohne = berechneSteuer(inv(), input());
    const mit = berechneSteuer(
      inv({ grundsteuer_jahr: 400, versicherung_jahr: 320, verwaltungskosten_jahr: 250 }),
      input(),
    );
    expect(mit.grundsteuerJahr).toBe(400);
    expect(mit.versicherungJahr).toBe(320);
    expect(mit.verwaltungskostenJahr).toBe(250);
    expect(mit.werbungskostenSumme).toBeCloseTo(ohne.werbungskostenSumme + 970, 6);
    expect(mit.posten.some((p) => p.label.includes("Grundsteuer") && !p.fehlt)).toBe(true);
  });

  it("liest die Posten auch aus meta.anlageV (Migrationsunabhaengigkeit)", () => {
    const spalte = berechneSteuer(inv({ grundsteuer_jahr: 400 }), input());
    const metaPfad = berechneSteuer(inv({ meta: { anlageV: { grundsteuer_jahr: 400 } } }), input());
    expect(metaPfad.grundsteuerJahr).toBe(spalte.grundsteuerJahr);
    expect(metaPfad.werbungskostenSumme).toBeCloseTo(spalte.werbungskostenSumme, 6);
  });
});

describe("Umlagen als Einnahme und durchlaufender Posten", () => {
  it("zaehlt vereinnahmte Umlagen als Einnahme", () => {
    const erg = berechneSteuer(inv({ umlagen_monat: 120 }), input());
    expect(erg.umlagenJahr).toBeCloseTo(120 * 12, 6);
    expect(erg.einnahmenJahr).toBeCloseTo(erg.mietEinnahmenJahr + 120 * 12, 6);
    expect(erg.posten.some((p) => p.typ === "einnahme" && p.label.includes("Umlagen") && !p.fehlt)).toBe(true);
  });

  it("setzt die umlagefaehigen Hausgeld-Kosten nur mit erfassten Umlagen UND erfasstem nicht umlagefaehigen Anteil an", () => {
    // beides da: Hausgeld 300, nicht umlagefaehig 60 → umlagefaehig 240 x 12
    const beides = berechneSteuer(
      inv({ umlagen_monat: 120, hausgeld_nicht_umlage_monat: 60 }),
      input({ hausgeldNichtUmlagefaehig: null }),
    );
    expect(beides.hausgeldAbsetzbarJahr).toBeCloseTo(60 * 12, 6);
    expect(beides.hausgeldUmlagefaehigJahr).toBeCloseTo(240 * 12, 6);
    // ohne Umlagen: der durchlaufende Posten bleibt auf Angabe fehlt
    const ohneUmlagen = berechneSteuer(
      inv({ hausgeld_nicht_umlage_monat: 60 }),
      input({ hausgeldNichtUmlagefaehig: null }),
    );
    expect(ohneUmlagen.hausgeldUmlagefaehigJahr).toBe(0);
    expect(ohneUmlagen.posten.some((p) => p.fehlt && p.label.includes("Umlagefähige"))).toBe(true);
    // ohne nicht umlagefaehigen Anteil: kompletter Hausgeld-Pfad auf Angabe fehlt
    const ohneAnteil = berechneSteuer(
      inv({ umlagen_monat: 120 }),
      input({ hausgeldNichtUmlagefaehig: null }),
    );
    expect(ohneAnteil.hausgeldAbsetzbarJahr).toBe(0);
    expect(ohneAnteil.hausgeldUmlagefaehigJahr).toBe(0);
    expect(ohneAnteil.fehlendeAngaben.some((f) => f.includes("Verwaltungsanteil"))).toBe(true);
  });

  it("laesst den Euro-Wert aus den Steuerangaben vor dem Prozentsatz gehen", () => {
    const erg = berechneSteuer(
      inv({ hausgeld_nicht_umlage_monat: 60 }),
      input({ hausgeldNichtUmlagefaehig: 50 }), // wuerde 150 €/Monat ergeben
    );
    expect(erg.hausgeldAbsetzbarJahr).toBeCloseTo(60 * 12, 6);
  });
});

describe("Gebaeudeanteil und AfA-Satz aus den Steuerangaben", () => {
  it("nutzt den direkten Gebaeudeanteil vor dem Bodenwert-Anteil", () => {
    const erg = berechneSteuer(inv({ gebaeude_anteil_prozent: 70 }), input({ bodenwertAnteil: 20 }));
    // 330.000 x 70 % statt 330.000 x 80 %
    expect(erg.afaBemessungsgrundlage).toBeCloseTo(330000 * 0.7, 6);
  });

  it("rechnet mit manuellem AfA-Satz auch ohne Baujahr", () => {
    const erg = berechneSteuer(inv({ baujahr: null, afa_satz_prozent: 2.5 }), input());
    expect(erg.afaSatzP).toBe(2.5);
    expect(erg.afaJahr).toBeCloseTo(GEBAEUDE * 0.025, 6);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Baujahr"))).toBe(false);
  });
});

describe("Miteigentumsanteil skaliert das Ergebnis", () => {
  it("halbiert Einnahmen, Werbungskosten und Steuereffekt bei 50 %", () => {
    const voll = berechneSteuer(inv(), input());
    const halb = berechneSteuer(inv({ miteigentumsanteil_prozent: 50 }), input());
    expect(halb.miteigentumsanteilP).toBe(50);
    expect(halb.einnahmenJahr).toBeCloseTo(voll.einnahmenJahr / 2, 6);
    expect(halb.werbungskostenSumme).toBeCloseTo(voll.werbungskostenSumme / 2, 6);
    expect(halb.ueberschussVerlust).toBeCloseTo(voll.ueberschussVerlust / 2, 6);
    expect(halb.steuerEffekt).toBeCloseTo(voll.steuerEffekt / 2, 6);
  });

  it("rechnet ohne Angabe mit 100 % und kennzeichnet das", () => {
    const erg = berechneSteuer(inv(), input());
    expect(erg.miteigentumsanteilP).toBe(100);
  });
});

describe("Steuerjahr: vermietete Monate und Belege des Jahres", () => {
  it("setzt die Einnahmen ab der ersten Miete nur anteilig an", () => {
    const basis = inv({ umlagen_monat: 100, meta: { erste_miete: "2026-03-10" } });
    const erg = berechneSteuer(basis, input({ betrachtungsjahr: 2026 }));
    expect(erg.vermieteteMonate).toBe(10); // Maerz bis Dezember
    expect(erg.vermieteteMonateAngenommen).toBe(false);
    expect(erg.mietEinnahmenJahr).toBeCloseTo(1000 * 10, 6);
    expect(erg.umlagenJahr).toBeCloseTo(100 * 10, 6);
    const folgejahr = berechneSteuer(basis, input({ betrachtungsjahr: 2027 }));
    expect(folgejahr.vermieteteMonate).toBe(12);
    expect(folgejahr.mietEinnahmenJahr).toBeCloseTo(12000, 6);
  });

  it("nimmt ohne erste Miete 12 Monate an und kennzeichnet die Annahme", () => {
    const erg = berechneSteuer(inv(), input());
    expect(erg.vermieteteMonate).toBe(12);
    expect(erg.vermieteteMonateAngenommen).toBe(true);
  });

  it("vermieteteMonate deckt die Randfaelle ab", () => {
    expect(vermieteteMonate(null, 2026)).toEqual({ monate: 12, angenommen: true });
    expect(vermieteteMonate("kein-datum", 2026)).toEqual({ monate: 12, angenommen: true });
    expect(vermieteteMonate("2027-01-01", 2026)).toEqual({ monate: 0, angenommen: false });
    expect(vermieteteMonate("2026-01-01", 2026)).toEqual({ monate: 12, angenommen: false });
    expect(vermieteteMonate("2026-12-05", 2026)).toEqual({ monate: 1, angenommen: false });
  });
});

describe("Erhaltungsaufwand aus Belegen", () => {
  const docs = [
    { typ: "Reparatur/Erhaltung", betrag: 500, datum: "2026-04-01T12:00:00Z" },
    { typ: "Reparatur/Erhaltung", datum: "2026-05-01T12:00:00Z" },            // ohne Betrag: zaehlt nie
    { typ: "Reparatur/Erhaltung", betrag: 300, datum: "2025-06-01T12:00:00Z" }, // anderes Jahr
    { typ: "Sonstige", betrag: 999, datum: "2026-07-01T12:00:00Z" },           // falscher Typ
    { typ: "Sonstige", betrag: 200, datum: "2026-08-01T12:00:00Z", steuer_relevant: true },
  ];

  it("zaehlt nur Belege mit Betrag, passendem Typ oder Markierung und Jahr", () => {
    expect(erhaltungsaufwandAusBelegen(docs, 2026)).toEqual({ summe: 700, anzahl: 2 });
    expect(erhaltungsaufwandAusBelegen(docs, 2025)).toEqual({ summe: 300, anzahl: 1 });
  });

  it("summiert ohne Jahresfilter alle Belege mit Betrag", () => {
    expect(erhaltungsaufwandAusBelegen(docs)).toEqual({ summe: 1000, anzahl: 3 });
  });

  it("bleibt bei leeren oder fehlenden Dokumenten auf 0", () => {
    expect(erhaltungsaufwandAusBelegen(undefined, 2026)).toEqual({ summe: 0, anzahl: 0 });
    expect(erhaltungsaufwandAusBelegen([], 2026)).toEqual({ summe: 0, anzahl: 0 });
  });
});

describe("zeitanteilige AfA im Anschaffungsjahr (§ 7 Abs. 1 Satz 4 EStG)", () => {
  it("setzt bei Kauf im Juli nur 6 von 12 Monaten an", () => {
    const erg = berechneSteuer(inv({ kaufdatum: "2026-07-15" }), input({ betrachtungsjahr: 2026 }));
    expect(erg.afaMonate).toBe(6);
    expect(erg.afaJahr).toBeCloseTo(GEBAEUDE * 0.02 * (6 / 12), 6);
  });

  it("rechnet ausserhalb des Anschaffungsjahres volle 12 Monate", () => {
    const erg = berechneSteuer(inv({ kaufdatum: "2020-07-15" }), input({ betrachtungsjahr: 2026 }));
    expect(erg.afaMonate).toBe(12);
    expect(erg.afaJahr).toBeCloseTo(GEBAEUDE * 0.02, 6);
  });
});

describe("Sonder-AfA § 7b EStG mit Grenzen und Vierjahreszeitraum", () => {
  it("setzt 5 % innerhalb der Grenzen und des Zeitraums an", () => {
    const erg = berechneSteuer(
      inv({ kaufdatum: "2026-01-10", wohnflaeche: 80 }),
      input({ sonderAfA7b: true }),
    );
    // 264.000 / 80 m² = 3.300 Euro je m², unter beiden Grenzen → 5 % von 264.000
    expect(erg.sonderAfaJahr).toBeCloseTo(GEBAEUDE * 0.05, 6);
    expect(erg.posten.some((p) => p.label.includes("§ 7b"))).toBe(true);
  });

  it("deckelt die Bemessungsgrundlage auf 4.000 Euro je m²", () => {
    const erg = berechneSteuer(
      inv({ kaufdatum: "2026-01-10", wohnflaeche: 60 }),
      input({ sonderAfA7b: true }),
    );
    // 264.000 / 60 = 4.400 je m² (unter 5.200), Bemessung gedeckelt auf 60 x 4.000 = 240.000
    expect(erg.sonderAfaJahr).toBeCloseTo(240000 * 0.05, 6);
  });

  it("entfaellt vollstaendig ueber der Baukostenobergrenze", () => {
    const erg = berechneSteuer(
      inv({ kaufdatum: "2026-01-10", wohnflaeche: 40 }),
      input({ sonderAfA7b: true }),
    );
    // 264.000 / 40 = 6.600 je m² > 5.200 → Fallbeil, keine Foerderung
    expect(erg.sonderAfaJahr).toBe(0);
    expect(erg.sonderAfaHinweis).toContain("§ 7b");
  });

  it("endet nach vier Jahren statt unbegrenzt weiterzulaufen", () => {
    const im4 = berechneSteuer(
      inv({ kaufdatum: "2023-03-01", wohnflaeche: 80 }),
      input({ sonderAfA7b: true, betrachtungsjahr: 2026 }),
    );
    expect(im4.sonderAfaJahr).toBeGreaterThan(0); // Jahr 4
    const nach4 = berechneSteuer(
      inv({ kaufdatum: "2022-03-01", wohnflaeche: 80 }),
      input({ sonderAfA7b: true, betrachtungsjahr: 2026 }),
    );
    expect(nach4.sonderAfaJahr).toBe(0); // Jahr 5
    expect(nach4.sonderAfaHinweis).toContain("abgelaufen");
  });

  it("wird ohne pruefbares Anschaffungsjahr konservativ nicht angesetzt", () => {
    const erg = berechneSteuer(
      inv({ kaufdatum: null, baujahr: null, wohnflaeche: 80 }),
      input({ sonderAfA7b: true }),
    );
    expect(erg.sonderAfaJahr).toBe(0);
    expect(erg.sonderAfaHinweis).toContain("nicht angesetzt");
  });

  it("wird ohne Wohnflaeche nicht angesetzt", () => {
    const erg = berechneSteuer(
      inv({ kaufdatum: "2026-01-10" }),
      input({ sonderAfA7b: true }),
    );
    expect(erg.sonderAfaJahr).toBe(0);
    expect(erg.sonderAfaHinweis).toContain("Wohnfläche");
  });
});

describe("Hausgeld und Ruecklagen", () => {
  it("zieht mit aktiv gesetztem Verwaltungsanteil genau diesen ab", () => {
    const erg = berechneSteuer(inv(), input({ hausgeldNichtUmlagefaehig: 20 }));
    expect(erg.hausgeldAbsetzbarJahr).toBeCloseTo(300 * 12 * 0.2, 6);
    expect(erg.posten.some((p) => p.label.includes("Rücklagenzuführung"))).toBe(true);
  });

  it("laesst die Ruecklagenzufuehrung nicht in die Werbungskosten einfliessen", () => {
    const ohne = berechneSteuer(inv({ ruecklagen: 0 }), input());
    const mit = berechneSteuer(inv({ ruecklagen: 500 }), input());
    expect(mit.werbungskostenSumme).toBeCloseTo(ohne.werbungskostenSumme, 6);
    expect(mit.ueberschussVerlust).toBeCloseTo(ohne.ueberschussVerlust, 6);
  });
});

describe("Steuereffekt", () => {
  it("kennzeichnet die flache Rechnung ohne zvE als Schaetzung", () => {
    const flach = berechneSteuer(inv(), input());
    expect(flach.steuerEffektGeschaetzt).toBe(true);
    expect(flach.steuerEffektFehlt).toBe(false);
    const differenz = berechneSteuer(inv(), input({ zvE: 60000 }));
    expect(differenz.steuerEffektGeschaetzt).toBe(false);
  });
});

describe("Forecast", () => {
  it("zieht die Annuitaet nach Volltilgung nicht mehr ab", () => {
    // 10.000 Restschuld, 0 % Zins, 12.000 Annuitaet pro Jahr → nach Jahr 1 getilgt
    const rows = berechneForecast(
      inv({ darlehenssumme: 10000, offene_tilgung: 10000, zinssatz: 0, monatliche_rate: 1000 }),
      forecastInput({ jahre: 3 }),
    );
    expect(rows[0].restschuld).toBe(0);
    expect(rows[0].rate).toBeCloseTo(10000, 6); // nur der Rest, nicht die volle Annuitaet
    expect(rows[1].rate).toBe(0);
    expect(rows[2].rate).toBe(0);
    // Cashflow steigt nach der Volltilgung um die weggefallene Rate
    expect(rows[1].cashflow).toBeGreaterThan(rows[0].cashflow);
  });

  it("beruecksichtigt die Sondertilgung wie der Tilgungsplan", () => {
    const basis = inv({ meta: { sondertilgung_jahr: 10000 } });
    const rows = berechneForecast(basis, forecastInput({ jahre: 2 }));
    const plan = berechneTilgungsplan(250000, 4, 1200 * 12, 10000, 2);
    expect(rows[0].sondertilgung).toBeCloseTo(plan[0].sondertilgung, 6);
    expect(rows[0].restschuld).toBeCloseTo(plan[0].restschuld, 6);
    expect(rows[1].restschuld).toBeCloseTo(plan[1].restschuld, 6);
    // Sondertilgung ist ein Mittelabfluss und drueckt den Cashflow
    const ohneSond = berechneForecast(inv(), forecastInput({ jahre: 2 }));
    expect(rows[0].cashflow).toBeCloseTo(ohneSond[0].cashflow - 10000, 6);
  });

  it("laesst den expliziten Parameter vor meta.sondertilgung_jahr gehen", () => {
    const rows = berechneForecast(
      inv({ meta: { sondertilgung_jahr: 10000 } }),
      forecastInput({ jahre: 1, sondertilgungJahr: 0 }),
    );
    expect(rows[0].sondertilgung).toBe(0);
  });

  it("rechnet ohne Gebaeudeanteil oder Baujahr ohne AfA statt mit Pauschale", () => {
    const mitAfa = berechneForecast(inv(), forecastInput({ jahre: 1 }));
    const ohneBoden = berechneForecast(inv(), forecastInput({ jahre: 1, bodenwertAnteil: null }));
    const ohneBaujahr = berechneForecast(inv({ baujahr: null }), forecastInput({ jahre: 1 }));
    // Ohne AfA ist der steuerliche Ueberschuss hoeher, der Steuereffekt entsprechend kleiner
    expect(ohneBoden[0].steuerEffekt).toBeLessThan(mitAfa[0].steuerEffekt);
    expect(ohneBaujahr[0].steuerEffekt).toBeCloseTo(ohneBoden[0].steuerEffekt, 6);
  });

  it("laesst ohne Steuersatz keinen Steuereffekt einfliessen", () => {
    const rows = berechneForecast(inv(), forecastInput({ jahre: 1, steuersatz: 0 }));
    expect(rows[0].steuerEffekt).toBe(0);
  });
});

describe("berechneSteuer, ausdrückliche 0 bei zvE und Satz", () => {
  // Hohe Miete, damit ein Überschuss entsteht.
  const ueberschuss = () => inv({ mieteinnahmen_kalt: 4000 });

  it("rechnet bei zvE 0 die Mehrsteuer eines Überschusses nach Tarif", () => {
    const erg = berechneSteuer(ueberschuss(), input({ grenzsteuersatz: 0, zvE: 0 }));
    expect(erg.steuerEffektFehlt).toBe(false);
    expect(erg.steuerEffektGeschaetzt).toBe(false);
    expect(erg.steuerEffekt).toBeGreaterThan(0);
  });

  it("ein Satz von 0 ohne zvE ist eine Angabe und kein „Steuersatz fehlt“", () => {
    const erg = berechneSteuer(inv(), input({ grenzsteuersatz: 0 }));
    expect(erg.steuerEffektFehlt).toBe(false);
    expect(erg.steuerEffekt + 0).toBe(0);
    expect(erg.fehlendeAngaben.some((f) => f.includes("Steuersatz"))).toBe(false);
  });

  it("ohne zvE bleibt es bei der flachen Rechnung mit dem Satz", () => {
    const erg = berechneSteuer(inv(), input({ grenzsteuersatz: 42, zvE: undefined }));
    expect(erg.steuerEffektGeschaetzt).toBe(true);
  });
});
