import { describe, expect, it } from "vitest";
import { jahreBisRente, kundeAus } from "./kundenObjektvergleichVorbelegung";

describe("kundeAus", () => {
  it("liest die Selbstauskunft wie im Objektvergleich gebraucht", () => {
    const k = kundeAus({ anrede: "Frau", vorname: "Anna", nachname: "Muster" }, {
      einkommen: { netto: "3.500,00" }, bruttoJahr: "68.000", steuerklasse: "1", familienstand: "ledig", kinder: [],
      beschaeftigungsart: "angestellt", arbeitsvertragArt: "unbefristet", anstellung: { angestelltSeit: "2023-02-01" },
      mietart: "Zur Miete", mieteWarm: "790", lebenshaltungskosten: "1000",
      kredite: [{ rate: "249" }], vermoegenswerte: [{ betrag: "20.000" }, { betrag: "5.000" }], geburtsdatum: "1993-05-01",
    }, "2026-08-31", new Date("2026-10-28"));
    expect(k).toMatchObject({
      anrede: "Frau", nachname: "Muster", netto: 3500, bruttoJahr: 68000, kinder: "keine",
      beschaeftigung: "angestellt, unbefristet, seit 2023", antrag: "allein, ohne Mitantragsteller",
      wohnsituation: "zur Miete, 790 € warm", lebenshaltung: 1000, kreditRaten: 249, kredite: "1 Kredit, 249 € im Monat",
      kapital: 25000, jahreBisRente: 34, saDatum: "2026-08-31",
    });
  });
  it("kommt ohne Selbstauskunft aus", () => {
    const k = kundeAus(null, null, "");
    expect(k.netto).toBe(0);
    expect(k.kredite).toBe("keine");
  });
});

describe("jahreBisRente", () => {
  it("rechnet bis 67, auch mit deutschem Datum", () => {
    expect(jahreBisRente("12.04.1986", new Date("2026-10-28"))).toBe(27);
    expect(jahreBisRente("", new Date("2026-10-28"))).toBe(0);
  });
});
