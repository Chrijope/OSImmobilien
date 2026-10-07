import { describe, it, expect, vi } from "vitest";

/**
 * Der Kundenkontext, mit dem der Investmentrechner und der OS Lotse
 * arbeiten.
 *
 * Zwei Dinge werden hier geprüft:
 *
 *   1. Der Zahlenhelfer liest deutsche Beträge richtig. Vorher wurde nur das
 *      Komma ersetzt, der Tausenderpunkt blieb stehen, und aus "3.248,15"
 *      wurde 3,248, also ein Tausendstel.
 *   2. Es gibt keinen Rückfall mehr auf die am Kontakt erfassten Einkünfte.
 *      Gerechnet wird ausschließlich mit der Selbstauskunft des gewählten
 *      Investments (Entscheidung Christian, 10.09.2026).
 *
 * Attrappen sind allein die beiden Datenquellen: der Kontakt und die
 * investments-Zeilen aus dem Zwischenspeicher.
 */

const bestand = vi.hoisted(() => ({
  kontakte: {} as Record<string, unknown>,
  investments: [] as unknown[],
}));

vi.mock("@/lib/kundenStore", async (original) => ({
  ...(await original<typeof import("@/lib/kundenStore")>()),
  getKontaktById: (id: string) => bestand.kontakte[id] ?? null,
}));

vi.mock("@/lib/dataCache", async (original) => ({
  ...(await original<typeof import("@/lib/dataCache")>()),
  cacheGet: (tabelle: string) => (tabelle === "investments" ? bestand.investments : []),
}));

import { loadKundenkontext } from "@/lib/kundenkontextHelper";

function bestandSetzen(kontakt: Record<string, unknown>, saData: unknown | null = null) {
  bestand.kontakte = { k1: { id: "k1", vorname: "Otto", nachname: "Hans", meta: {}, ...kontakt } };
  bestand.investments = [
    { id: "inv1", kunde_id: "k1", erstellt_am: "2026-08-01T00:00:00.000Z", meta: { nummer: 1, saData } },
  ];
}

/** Ein Investment mit Selbstauskunft, in der nur der Vermögenswert wechselt. */
function mitLiquiden(betrag: unknown) {
  bestandSetzen({}, { vermoegen: { liquideMittel: betrag }, abgeschlossenAm: "2026-08-12T00:00:00.000Z" });
}

describe("Beträge aus der Selbstauskunft", () => {
  it("liest deutsche Schreibweise mit Tausenderpunkt", () => {
    // Vorher wurde nur das Komma ersetzt, aus "3.248,15" wurde 3,248.
    mitLiquiden("3.248,15");
    expect(loadKundenkontext("k1", "inv1")?.liquideMittel).toBeCloseTo(3_248.15, 2);
  });

  it("liest auch blanke Zahlen und Punktdezimalen unverändert", () => {
    mitLiquiden(38_981.42);
    expect(loadKundenkontext("k1", "inv1")?.liquideMittel).toBeCloseTo(38_981.42, 2);
    mitLiquiden("38981.42");
    expect(loadKundenkontext("k1", "inv1")?.liquideMittel).toBeCloseTo(38_981.42, 2);
  });

  it("nimmt einen reinen Punkt als Tausendertrenner, wenn drei Stellen folgen", () => {
    mitLiquiden("3.248");
    expect(loadKundenkontext("k1", "inv1")?.liquideMittel).toBe(3_248);
  });
});

describe("Keine Zahlen mehr vom Kontakt", () => {
  it("ignoriert Einkünfte und Vermögen am Kontakt vollständig", () => {
    // Altbestand: Der Kontakt trägt noch Zahlen aus der Zeit, als die
    // Selbstauskunft zusätzlich dorthin kopiert wurde. Gerechnet wird damit
    // nicht mehr.
    bestandSetzen({
      einkuenfte: { gehalt: 5_000, selbstaendig: 0 },
      meta: { vermoegen: { liquideMittel: 80_000 }, liquideMittel: 80_000 },
    });
    const ctx = loadKundenkontext("k1", "inv1");
    expect(ctx?.saVerfuegbar).toBe(false);
    expect(ctx?.bruttoJahrHaushalt).toBe(0);
    expect(ctx?.liquideMittel).toBe(0);
    expect(ctx?.grenzsteuersatz).toBe(42);
    expect(ctx?.ausSelbstauskunft).toBeNull();
  });
});

describe("Jedes Investment steht fuer sich", () => {
  /**
   * Der Fall, um den es geht: Ein Kunde kauft zum zweiten Mal. Fuer den
   * ersten Kauf gibt es eine Selbstauskunft, fuer den zweiten noch nicht.
   * Der Rechner darf beim zweiten Kauf nichts aus dem ersten uebernehmen
   * (Entscheidung Christian, 10.09.2026).
   */
  function zweiInvestments() {
    bestand.kontakte = { k1: { id: "k1", vorname: "Otto", nachname: "Hans", meta: {} } };
    bestand.investments = [
      {
        id: "inv1",
        kunde_id: "k1",
        erstellt_am: "2026-08-01T00:00:00.000Z",
        meta: {
          nummer: 1,
          saData: {
            familienstand: "verheiratet",
            bruttoJahr: "120.000,00",
            vermoegen: { liquideMittel: "50.000,00" },
            abgeschlossenAm: "2026-08-12T00:00:00.000Z",
          },
        },
      },
      { id: "inv2", kunde_id: "k1", erstellt_am: "2026-09-01T00:00:00.000Z", meta: { nummer: 2 } },
    ];
  }

  it("liefert fuer das Investment ohne eigene Selbstauskunft keine Zahlen aus dem Geschwister-Investment", () => {
    zweiInvestments();
    const ctx = loadKundenkontext("k1", "inv2");
    expect(ctx?.saVerfuegbar).toBe(false);
    expect(ctx?.ausSelbstauskunft).toBeNull();
    expect(ctx?.bruttoJahrHaushalt).toBe(0);
    expect(ctx?.liquideMittel).toBe(0);
    expect(ctx?.verheiratet).toBe(false);
  });

  it("liefert fuer das Investment mit eigener Selbstauskunft dessen Zahlen", () => {
    zweiInvestments();
    const ctx = loadKundenkontext("k1", "inv1");
    expect(ctx?.saVerfuegbar).toBe(true);
    expect(ctx?.bruttoJahrHaushalt).toBe(120_000);
    expect(ctx?.liquideMittel).toBe(50_000);
  });

  it("zeigt ohne gewaehltes Investment gar keine Selbstauskunft", () => {
    zweiInvestments();
    const ctx = loadKundenkontext("k1");
    expect(ctx?.saVerfuegbar).toBe(false);
    expect(ctx?.ausSelbstauskunft).toBeNull();
  });
});

describe("Der belegbare Block", () => {
  it("füllt den belegbaren Block nur aus der Selbstauskunft", () => {
    bestandSetzen(
      { einkuenfte: { gehalt: 38_981.42, selbstaendig: 0 }, person2: { name: "Partnerin" } },
      {
        familienstand: "ledig",
        bruttoJahr: "60.000,00",
        vermoegen: { liquideMittel: "25.000,00" },
        abgeschlossenAm: "2026-08-12T00:00:00.000Z",
      },
    );
    const ctx = loadKundenkontext("k1", "inv1");
    expect(ctx?.ausSelbstauskunft).toEqual({
      bruttoJahrHaushalt: 60_000,
      zvE: 42_000,
      zvEAngegeben: false,
      verheiratet: false,
      anzahlPersonen: 1,
      liquideMittel: 25_000,
    });
    // Die zweite Person hängt am Kontakt, nicht an der Selbstauskunft. Der
    // flache Wert zählt sie mit, der belegbare Block nicht.
    expect(ctx?.anzahlPersonen).toBe(2);
  });
});

describe("Zu versteuerndes Jahreseinkommen aus der Selbstauskunft", () => {
  it("nimmt das angegebene zvE vor der Schätzung aus dem Brutto", () => {
    bestandSetzen({}, { bruttoJahr: "90.000,00", zvEJahr: "71.500,00", familienstand: "Ledig" });
    const sa = loadKundenkontext("k1", "inv1")?.ausSelbstauskunft;
    expect(sa?.zvE).toBe(71_500);
    expect(sa?.zvEAngegeben).toBe(true);
  });

  it("schätzt weiter aus dem Brutto, wenn kein zvE angegeben ist", () => {
    bestandSetzen({}, { bruttoJahr: "90.000,00", familienstand: "Ledig" });
    const sa = loadKundenkontext("k1", "inv1")?.ausSelbstauskunft;
    expect(sa?.zvE).toBe(63_000);
    expect(sa?.zvEAngegeben).toBe(false);
  });

  it("nimmt bei Verheirateten das gemeinsame zvE von Person 1, nicht die Summe", () => {
    bestandSetzen({}, {
      familienstand: "Verheiratet",
      person2: true,
      zvEJahr: "120.000,00",
      person2Data: { zvEJahr: "50.000,00" },
    });
    const ctx = loadKundenkontext("k1", "inv1");
    expect(ctx?.ausSelbstauskunft?.zvE).toBe(120_000);
    expect(ctx?.ausSelbstauskunft?.verheiratet).toBe(true);
    expect(ctx?.zvE).toBe(120_000);
  });
});

describe("Eine eingetragene 0 beim zvE", () => {
  it("gilt als Angabe und nicht als fehlend, keine Schätzung aus dem Brutto", () => {
    bestandSetzen({}, { bruttoJahr: "90.000,00", zvEJahr: "0,00", familienstand: "Ledig" });
    const ctx = loadKundenkontext("k1", "inv1");
    expect(ctx?.ausSelbstauskunft?.zvE).toBe(0);
    expect(ctx?.ausSelbstauskunft?.zvEAngegeben).toBe(true);
    expect(ctx?.zvE).toBe(0);
    expect(ctx?.grenzsteuersatz).toBe(0);
  });

  it("ein leeres Feld bleibt keine Angabe", () => {
    bestandSetzen({}, { bruttoJahr: "90.000,00", zvEJahr: "", familienstand: "Ledig" });
    expect(loadKundenkontext("k1", "inv1")?.ausSelbstauskunft?.zvEAngegeben).toBe(false);
  });
});
