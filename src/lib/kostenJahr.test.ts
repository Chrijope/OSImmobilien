import { describe, expect, it } from "vitest";
import { kostenJahr, type KostenEinheit } from "./kostenJahr";

const basis: KostenEinheit = {
  istMiete: 400, eigentuemerlast: 80, hausgeldGesamt: 300, uebergabe: "",
  subventionMonat: 150, subventionMonate: 36, garagenSubventionMonat: 100, garagenSubventionMonate: 12, einmalSubvention: 0,
};

describe("Kosten-Jahresübersicht", () => {
  it("ohne Übergabe: das ganze Jahr Miete und Eigentümerlast", () => {
    const k = kostenJahr([basis], 2027);
    expect(k.summe).toMatchObject({ miete: 4800, eigentuemerlast: 960, subvention: 0 });
    expect(k.saldo).toBe(3840);
    expect(k.ohneUebergabe).toBe(1);
  });

  it("Leerstand trägt das ganze Hausgeld", () => {
    expect(kostenJahr([{ ...basis, istMiete: null }], 2027).summe.leerstand).toBe(3600);
  });

  it("Übergabe am 01.07.: bis Juni Miete, ab Juli Subventionen, Einmalanteil im Juli", () => {
    const k = kostenJahr([{ ...basis, uebergabe: "2027-07-01", einmalSubvention: 7901.51 }], 2027);
    expect(k.summe).toMatchObject({ miete: 2400, eigentuemerlast: 480, subvention: 900, garage: 600, einmal: 7901.51 });
    expect(k.monate.einmal[6]).toBe(7901.51);
    expect(k.saldo).toBe(2400 - 480 - 900 - 600 - 7901.51);
  });

  it("Garagen-Subvention endet nach 12 Monaten, die Mietsubvention nach der Laufzeit", () => {
    const k = kostenJahr([{ ...basis, uebergabe: "2027-01-01" }], 2028);
    expect(k.summe).toMatchObject({ garage: 0, subvention: 1800, miete: 0 });
    expect(kostenJahr([{ ...basis, uebergabe: "2027-01-01" }], 2030).summe.subvention).toBe(0);
  });
});
