import { describe, expect, it } from "vitest";
import { tabelleAlsXlsx } from "./tabelleExport";
import { leseExcel } from "./excelLesen";

describe("Export als Excel", () => {
  it("schreibt Kopf und Zeilen, Zahlen bleiben Zahlen, und lässt sich wieder lesen", async () => {
    const blob = await tabelleAlsXlsx({ titel: "Einheitenliste Brück", kopf: ["WE", "Fläche m²", "Kaufpreis"], zeilen: [["WE 1", 65, 153500], ["WE 2 & <Büro>", null, 64500]] });
    // Der Blob der Testumgebung kennt kein arrayBuffer(); FileReader schon.
    const puffer = await new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as ArrayBuffer); r.readAsArrayBuffer(blob); });
    const [blatt] = await leseExcel(puffer);
    expect(blatt.name).toBe("Einheitenliste Brück");
    expect(blatt.zeilen).toEqual([["WE", "Fläche m²", "Kaufpreis"], ["WE 1", 65, 153500], ["WE 2 & <Büro>", null, 64500]]);
  });
});
