import { describe, expect, it } from "vitest";
import { bereinigeObjekteFilter, LEERE_OBJEKTE_FILTER } from "./objekteFilter";

describe("bereinigeObjekteFilter", () => {
  it("liefert leere Filter, wenn nichts gespeichert ist", () => {
    expect(bereinigeObjekteFilter(null)).toEqual(LEERE_OBJEKTE_FILTER);
    expect(bereinigeObjekteFilter("kaputt")).toEqual(LEERE_OBJEKTE_FILTER);
  });

  it("übernimmt gespeicherte Werte und ergänzt fehlende", () => {
    const f = bereinigeObjekteFilter({ adresse: "Brück", kpMax: "250000" });
    expect(f.adresse).toBe("Brück");
    expect(f.kpMax).toBe("250000");
    expect(f.bauzustand).toBe("alle");
  });

  it("verwirft Felder mit falschem Typ", () => {
    const f = bereinigeObjekteFilter({ kpMin: 100, mehrOffen: "ja", fremd: "x" });
    expect(f.kpMin).toBe("");
    expect(f.mehrOffen).toBe(false);
    expect("fremd" in f).toBe(false);
  });
});
