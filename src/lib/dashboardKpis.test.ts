import { describe, it, expect } from "vitest";
import {
  berechneDashboardKpis,
  istUeberfaellig,
  leseDatum,
  zeitraumGrenzen,
  zielFuerZeitraum,
} from "@/lib/dashboardKpis";

const HEUTE = new Date(2026, 6, 27); // 27. Juli 2026

describe("zeitraumGrenzen", () => {
  it("liefert den laufenden Monat", () => {
    const { von, bis } = zeitraumGrenzen("monat", HEUTE);
    expect(von).toEqual(new Date(2026, 6, 1));
    expect(bis).toEqual(new Date(2026, 7, 1));
  });

  it("liefert das laufende Quartal", () => {
    const { von, bis } = zeitraumGrenzen("quartal", HEUTE);
    expect(von).toEqual(new Date(2026, 6, 1));
    expect(bis).toEqual(new Date(2026, 9, 1));
  });

  it("liefert das laufende Jahr", () => {
    const { von, bis } = zeitraumGrenzen("jahr", HEUTE);
    expect(von).toEqual(new Date(2026, 0, 1));
    expect(bis).toEqual(new Date(2027, 0, 1));
  });
});

describe("zielFuerZeitraum", () => {
  // Zwölf Monate, jeder anders geplant. Genau deshalb darf man nicht durch
  // zwölf teilen.
  const plan = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

  it("nimmt beim Monat genau den laufenden Monat", () => {
    expect(zielFuerZeitraum(plan, "monat", HEUTE)).toBe(70); // Juli
  });

  it("summiert beim Quartal die drei Monate", () => {
    expect(zielFuerZeitraum(plan, "quartal", HEUTE)).toBe(70 + 80 + 90);
  });

  it("summiert beim Jahr alles", () => {
    expect(zielFuerZeitraum(plan, "jahr", HEUTE)).toBe(780);
  });

  it("kommt ohne Planung mit null zurecht", () => {
    expect(zielFuerZeitraum(undefined, "monat", HEUTE)).toBe(0);
    expect(zielFuerZeitraum([], "jahr", HEUTE)).toBe(0);
  });
});

describe("leseDatum", () => {
  it("versteht ISO und deutsches Datum", () => {
    expect(leseDatum("2026-07-01")?.getMonth()).toBe(6);
    expect(leseDatum("01.07.2026")?.getMonth()).toBe(6);
    expect(leseDatum("kein Datum")).toBeNull();
  });
});

describe("berechneDashboardKpis", () => {
  const { von, bis } = zeitraumGrenzen("monat", HEUTE);

  const basis = {
    von,
    bis,
    jetzt: HEUTE,
    kontakte: [
      { id: "a", pipelineStufe: "reservierung", erstellt_am: "2026-07-02" },
      { id: "b", pipelineStufe: "finanzierung", erstellt_am: "2026-07-03" },
      { id: "c", pipelineStufe: "erstgespraech", erstellt_am: "2026-07-04" },
      { id: "d", pipelineStufe: "notar", erstellt_am: "2026-07-05" },
      { id: "e", pipelineStufe: "verloren", erstellt_am: "2026-07-06" },
      { id: "f", pipelineStufe: "reservierung", erstellt_am: "2026-07-07", archiviert: true },
    ],
    investments: [
      { id: "i1", kaufpreis: 300000, notarTermin: "2026-07-10" }, // beurkundet
      { id: "i2", kaufpreis: 200000, notarTermin: "2026-07-30" }, // geplant
      { id: "i3", kaufpreis: 500000, notarTermin: "2026-06-10" }, // außerhalb
      { id: "i4", kaufpreis: 100000, notarTermin: "2026-07-11", status: "storniert" },
    ],
  };

  it("zählt nur beurkundeten Umsatz im Zeitraum", () => {
    const r = berechneDashboardKpis(basis);
    expect(r.umsatz).toBe(300000);
    expect(r.notarBeurkundet).toBe(1);
    expect(r.notarGeplant).toBe(1);
  });

  it("zählt offene Reservierungen ohne archivierte", () => {
    const r = berechneDashboardKpis(basis);
    expect(r.offeneReservierungen).toBe(2);
  });

  it("zählt aktive Leads ohne gewonnene und verlorene", () => {
    const r = berechneDashboardKpis(basis);
    // a, b, c sind aktiv. d ist gewonnen, e verloren, f archiviert.
    expect(r.aktiveLeads).toBe(3);
  });

  it("rechnet die Conversion vom Erstgespräch bis mindestens Reservierung", () => {
    const r = berechneDashboardKpis(basis);
    // Vier Kontakte ab Erstgespräch, davon drei ab Reservierung.
    expect(r.conversionProzent).toBe(75);
  });

  it("lässt die Conversion ohne Grundlage leer statt null Prozent zu behaupten", () => {
    const r = berechneDashboardKpis({ ...basis, kontakte: [] });
    expect(r.conversionProzent).toBeNull();
  });

  it("setzt Umsatz gegen Ziel", () => {
    const r = berechneDashboardKpis({ ...basis, ziel: 600000 });
    expect(r.zielProzent).toBe(50);
  });

  it("gibt ohne Ziel keine Prozentzahl vor", () => {
    expect(berechneDashboardKpis(basis).zielProzent).toBeNull();
    expect(berechneDashboardKpis({ ...basis, ziel: 0 }).zielProzent).toBeNull();
  });

  it("zählt überfällige Aufgaben", () => {
    const r = berechneDashboardKpis({
      ...basis,
      aufgaben: [
        { faelligAm: "2026-07-20", status: "offen" },
        { faelligAm: "2026-07-26", status: "offen" },
        { faelligAm: "2026-08-01", status: "offen" },
        { faelligAm: "2026-07-01", status: "erledigt" },
      ],
    });
    expect(r.ueberfaelligeAufgaben).toBe(2);
  });
});

describe("istUeberfaellig", () => {
  const jetzt = new Date(2026, 6, 27, 14, 0); // 27. Juli, 14 Uhr

  it("zählt ein reines Datum bis zum Ende des Tages nicht als überfällig", () => {
    // Genau der Unterschied, der Dashboard und Inbox auseinanderlaufen ließ.
    expect(istUeberfaellig("2026-07-27", undefined, jetzt)).toBe(false);
  });

  it("zählt gestern als überfällig", () => {
    expect(istUeberfaellig("2026-07-26", undefined, jetzt)).toBe(true);
  });

  it("berücksichtigt eine gesetzte Uhrzeit", () => {
    expect(istUeberfaellig("2026-07-27", "10:00", jetzt)).toBe(true);
    expect(istUeberfaellig("2026-07-27", "16:00", jetzt)).toBe(false);
  });

  it("ignoriert die Uhrzeit, die zufällig im Zeitstempel steckt", () => {
    // Genau hier liefen Inbox und Dashboard auseinander. Es gilt die Regel der
    // Inbox: Nur das eigene Uhrzeitfeld zählt, sonst hat man den ganzen Tag.
    expect(istUeberfaellig("2026-07-27T10:00:00", undefined, jetzt)).toBe(false);
    expect(istUeberfaellig("2026-07-27T10:00:00", "09:00", jetzt)).toBe(true);
  });

  it("versteht auch ein deutsches Datum", () => {
    expect(istUeberfaellig("26.07.2026", undefined, jetzt)).toBe(true);
    expect(istUeberfaellig("28.07.2026", undefined, jetzt)).toBe(false);
  });

  it("kommt ohne Datum zurecht", () => {
    expect(istUeberfaellig(undefined, undefined, jetzt)).toBe(false);
  });
});
