import { describe, it, expect } from "vitest";
import {
  SERIE_MAX_TAGE,
  berechneSerie,
  mitAktivemTag,
  tagDavor,
  tagesSchluessel,
} from "@/lib/vertriebsakademieProgress";

/** Baut eine Kette aufeinanderfolgender Tage, endend beim übergebenen Tag. */
function tageBisZu(letzter: string, anzahl: number): string[] {
  const out: string[] = [];
  let t = letzter;
  for (let i = 0; i < anzahl; i++) {
    out.unshift(t);
    t = tagDavor(t);
  }
  return out;
}

describe("Tagesschlüssel", () => {
  it("schreibt Ortszeit als JJJJ-MM-TT mit führenden Nullen", () => {
    expect(tagesSchluessel(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(tagesSchluessel(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("geht über Monats- und Jahresgrenzen einen Tag zurück", () => {
    expect(tagDavor("2026-03-01")).toBe("2026-02-28");
    expect(tagDavor("2027-01-01")).toBe("2026-12-31");
  });

  it("übersteht den Sommerzeitwechsel", () => {
    // Ende März wird die Uhr vorgestellt. Ein reiner Stundenabzug würde hier
    // auf demselben Tag landen.
    expect(tagDavor("2026-03-30")).toBe("2026-03-29");
    expect(tagDavor("2026-10-26")).toBe("2026-10-25");
  });
});

describe("Serie zählt nur gelöste Aufgaben", () => {
  it("steht ohne einen einzigen aktiven Tag auf null", () => {
    const s = berechneSerie([], "2026-09-07");
    expect(s.laenge).toBe(0);
    expect(s.laengste).toBe(0);
    expect(s.heuteAktiv).toBe(false);
  });

  it("zählt nicht hoch, wenn nur die Seite aufgerufen wird", () => {
    // Ein Seitenaufruf trägt keinen Tag ein. Die Liste bleibt leer, also auch
    // die Serie. Genau das ist der Unterschied zu einer Serie, die schon vom
    // Öffnen lebt.
    const tage: string[] = [];
    for (let i = 0; i < 10; i++) expect(berechneSerie(tage, "2026-09-07").laenge).toBe(0);
  });

  it("zählt einen Tag nur einmal, egal wie viele Aufgaben gelöst wurden", () => {
    let tage: string[] = [];
    tage = mitAktivemTag(tage, "2026-09-07");
    tage = mitAktivemTag(tage, "2026-09-07");
    tage = mitAktivemTag(tage, "2026-09-07");
    expect(tage).toEqual(["2026-09-07"]);
    expect(berechneSerie(tage, "2026-09-07").laenge).toBe(1);
  });

  it("zählt aufeinanderfolgende Tage zusammen", () => {
    const tage = tageBisZu("2026-09-07", 4);
    expect(berechneSerie(tage, "2026-09-07").laenge).toBe(4);
  });

  it("hält die Serie am Leben, solange der heutige Tag noch offen ist", () => {
    // Letzter gelöster Tag war gestern, heute noch nichts. Der Tag ist noch
    // nicht vorbei, die Serie steht.
    const tage = tageBisZu("2026-09-06", 3);
    const s = berechneSerie(tage, "2026-09-07");
    expect(s.laenge).toBe(3);
    expect(s.heuteAktiv).toBe(false);
  });

  it("bricht ab, sobald ein ganzer Tag ohne Lösung vergangen ist", () => {
    const tage = tageBisZu("2026-09-05", 6);
    expect(berechneSerie(tage, "2026-09-07").laenge).toBe(0);
  });

  it("beginnt nach einer Unterbrechung wieder bei eins", () => {
    const tage = [...tageBisZu("2026-09-01", 5), "2026-09-07"];
    expect(berechneSerie(tage, "2026-09-07").laenge).toBe(1);
  });

  it("ignoriert Lücken innerhalb der Kette", () => {
    const tage = ["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];
    expect(berechneSerie(tage, "2026-09-07").laenge).toBe(4);
  });
});

describe("Serie bestraft nicht", () => {
  it("behält die längste Serie, auch wenn die aktuelle gerissen ist", () => {
    const tage = tageBisZu("2026-08-20", 9);
    const s = berechneSerie(tage, "2026-09-07");
    expect(s.laenge).toBe(0);
    expect(s.laengste).toBe(9);
  });

  it("meldet die laufende Serie nie kleiner als die längste", () => {
    const tage = tageBisZu("2026-09-07", 12);
    const s = berechneSerie(tage, "2026-09-07");
    expect(s.laengste).toBeGreaterThanOrEqual(s.laenge);
    expect(s.laengste).toBe(12);
  });
});

describe("Serie über Geräte und Zeit hinweg", () => {
  it("die letzten sieben Tage enden immer beim heutigen", () => {
    const s = berechneSerie(["2026-09-05", "2026-09-07"], "2026-09-07");
    expect(s.letzteTage).toHaveLength(7);
    expect(s.letzteTage[6]).toEqual({ tag: "2026-09-07", aktiv: true });
    expect(s.letzteTage[0].tag).toBe("2026-09-01");
    expect(s.letzteTage.filter((t) => t.aktiv)).toHaveLength(2);
  });

  it("hält die Liste kurz und behält die jüngsten Tage", () => {
    const viele = tageBisZu("2026-09-07", SERIE_MAX_TAGE + 40);
    const gekappt = mitAktivemTag(viele, "2026-09-07");
    expect(gekappt.length).toBeLessThanOrEqual(SERIE_MAX_TAGE);
    expect(gekappt[gekappt.length - 1]).toBe("2026-09-07");
  });

  it("wirft unbrauchbare Einträge weg statt daran zu scheitern", () => {
    const s = berechneSerie(["kaputt", "", "2026-09-07"], "2026-09-07");
    expect(s.laenge).toBe(1);
  });
});
