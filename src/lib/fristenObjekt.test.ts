import { describe, expect, it } from "vitest";
import { fristenSammeln } from "./fristenObjekt";

describe("Fristen je Objekt", () => {
  it("sammelt die Termine, rechnet Subventionsenden und sortiert nach Datum", () => {
    const f = fristenSammeln([
      { weNr: "WE 2", erhoehungAb: "2027-01-01", erhoehungPlus: 82.56, befristetBis: "2026-12-31" },
      { weNr: "WE 5", uebergabe: "2027-01-01", subventionMonate: 36, garagenSubventionMonate: 12, notartermin: "2026-11-20" },
    ], "2033-05-01");
    expect(f.map((x) => `${x.datum} ${x.art} ${x.einheit}`)).toEqual([
      "2026-11-20 Notartermin WE 5",
      "2026-12-31 Befristung endet WE 2",
      "2027-01-01 Mieterhöhung möglich WE 2",
      "2027-01-01 Übergabe WE 5",
      "2027-12-31 Garagen-Subvention endet WE 5",
      "2029-12-31 Mietsubvention endet WE 5",
      "2033-05-01 Energieausweis läuft ab ",
    ]);
  });

  it("übergeht leere oder ungültige Daten und Erhöhungen ohne Mehrbetrag", () => {
    expect(fristenSammeln([{ weNr: "WE 1", befristetBis: "", erhoehungAb: "2027-01-01", erhoehungPlus: 0, notartermin: "bald" }])).toEqual([]);
  });
});
