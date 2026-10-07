import { describe, it, expect } from "vitest";
import {
  alterAmGeburtstag,
  leseGeburtstag,
  sammleGeburtstage,
  tageBisGeburtstag,
} from "@/lib/geburtstage";

const HEUTE = new Date(2026, 6, 27); // 27. Juli 2026, ein Montag

describe("leseGeburtstag", () => {
  it("liest die gängigen Formate", () => {
    expect(leseGeburtstag("05.06.1980")).toEqual({ tag: 5, monat: 6, jahr: 1980 });
    expect(leseGeburtstag("1980-06-05")).toEqual({ tag: 5, monat: 6, jahr: 1980 });
    expect(leseGeburtstag("1980-06-05T00:00:00Z")).toEqual({ tag: 5, monat: 6, jahr: 1980 });
  });

  it("kommt auch ohne Jahr zurecht", () => {
    expect(leseGeburtstag("05.06.")).toEqual({ tag: 5, monat: 6, jahr: undefined });
    expect(leseGeburtstag("06-05")).toEqual({ tag: 5, monat: 6 });
  });

  it("weist Unsinn ab", () => {
    expect(leseGeburtstag("")).toBeNull();
    expect(leseGeburtstag("irgendwann")).toBeNull();
    expect(leseGeburtstag("45.13.1980")).toBeNull();
  });
});

describe("tageBisGeburtstag", () => {
  it("gibt heute null Tage", () => {
    expect(tageBisGeburtstag({ tag: 27, monat: 7 }, HEUTE)).toBe(0);
  });

  it("rechnet über die Monatsgrenze hinweg", () => {
    // Genau der Fall, der in der alten Karte durchfiel.
    expect(tageBisGeburtstag({ tag: 2, monat: 8 }, HEUTE)).toBe(6);
  });

  it("rechnet über den Jahreswechsel", () => {
    expect(tageBisGeburtstag({ tag: 1, monat: 1 }, HEUTE)).toBe(158);
  });

  it("legt den 29. Februar in Nicht-Schaltjahren auf den 28.", () => {
    const vorFebruar = new Date(2027, 1, 20); // 2027 ist kein Schaltjahr
    expect(tageBisGeburtstag({ tag: 29, monat: 2 }, vorFebruar)).toBe(8);
  });

  it("nimmt im Schaltjahr den echten 29.", () => {
    const vorFebruar = new Date(2028, 1, 20); // 2028 ist ein Schaltjahr
    expect(tageBisGeburtstag({ tag: 29, monat: 2 }, vorFebruar)).toBe(9);
  });
});

describe("alterAmGeburtstag", () => {
  it("nennt das Alter, das erreicht wird", () => {
    expect(alterAmGeburtstag({ tag: 2, monat: 8, jahr: 1980 }, HEUTE)).toBe(46);
  });

  it("bleibt ohne Jahr leer", () => {
    expect(alterAmGeburtstag({ tag: 2, monat: 8 }, HEUTE)).toBeUndefined();
  });

  it("verwirft unplausible Jahre", () => {
    expect(alterAmGeburtstag({ tag: 2, monat: 8, jahr: 2030 }, HEUTE)).toBeUndefined();
  });
});

describe("sammleGeburtstage", () => {
  const rohe = [
    { id: "1", name: "Heute", bezeichnung: "Kunde", quelle: "kunde" as const, geburtstag: "27.07.1990" },
    { id: "2", name: "In sechs Tagen", bezeichnung: "Admin", quelle: "team" as const, geburtstag: "02.08.1985" },
    { id: "3", name: "Weit weg", bezeichnung: "Kunde", quelle: "kunde" as const, geburtstag: "01.01.1970" },
    { id: "4", name: "Ohne Datum", bezeichnung: "Kunde", quelle: "kunde" as const, geburtstag: "" },
  ];

  it("nimmt nur, was ins Fenster fällt, und sortiert nach Nähe", () => {
    const r = sammleGeburtstage(rohe, 30, HEUTE);
    expect(r.map((e) => e.name)).toEqual(["Heute", "In sechs Tagen"]);
    expect(r[0].tageBis).toBe(0);
    expect(r[1].tageBis).toBe(6);
  });

  it("liefert Alter und Quelle mit", () => {
    const r = sammleGeburtstage(rohe, 30, HEUTE);
    expect(r[0].alter).toBe(36);
    expect(r[0].quelle).toBe("kunde");
    expect(r[1].quelle).toBe("team");
  });

  it("achtet auf die Fensterbreite", () => {
    expect(sammleGeburtstage(rohe, 3, HEUTE)).toHaveLength(1);
  });
});
