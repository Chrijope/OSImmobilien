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

describe("Excel mit Namensraum-Präfix", () => {
  it("liest Blätter, deren Tags ein Präfix tragen (x:sheet, x:c), wie die Brück-Vertriebsliste", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const ns = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    zip.file("xl/workbook.xml", `<?xml version="1.0"?><x:workbook ${ns}><x:sheets><x:sheet name="Vertriebsliste" sheetId="1" r:id="R1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="x" Target="/xl/sharedStrings.xml" Id="R2" /><Relationship Type="y" Target="/xl/worksheets/sheet1.xml" Id="R1" /></Relationships>`);
    zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><x:sst ${ns}><x:si><x:t>WE</x:t></x:si><x:si><x:t>WE 1</x:t></x:si></x:sst>`);
    zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><x:worksheet ${ns}><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>Verkaufspreis</x:t></x:is></x:c></x:row><x:row r="2"><x:c r="A2" t="s"><x:v>1</x:v></x:c><x:c r="B2"><x:v>153500</x:v></x:c></x:row></x:sheetData></x:worksheet>`);
    const [blatt] = await leseExcel(await zip.generateAsync({ type: "arraybuffer" }));
    expect(blatt.name).toBe("Vertriebsliste");
    expect(blatt.zeilen).toEqual([["WE", "Verkaufspreis"], ["WE 1", 153500]]);
  });
});
