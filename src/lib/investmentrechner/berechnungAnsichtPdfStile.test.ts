import { describe, expect, it } from "vitest";
import { stileInKopieEinbetten } from "./berechnungAnsichtPdf";

describe("Download der Berechnung: Stile in der Kopie", () => {
  it("ersetzt verlinkte Stildateien an gleicher Stelle durch die geladenen Regeln", () => {
    const kopie = document.implementation.createHTMLDocument("kopie");
    kopie.head.innerHTML = `
      <link rel="stylesheet" href="https://crm.test/assets/a.css">
      <style id="dazwischen">.x{}</style>
      <link rel="stylesheet" href="https://fonts.fremd.test/f.css">`;
    stileInKopieEinbetten(kopie, new Map([["https://crm.test/assets/a.css", ".expose-page{width:210mm}"]]));

    const knoten = Array.from(kopie.head.children);
    expect(knoten[0].tagName).toBe("STYLE");
    expect(knoten[0].textContent).toContain(".expose-page");
    expect(knoten[1].id).toBe("dazwischen");
    // Fremde Datei ohne lesbare Regeln bleibt verlinkt.
    expect((knoten[2] as HTMLLinkElement).href).toBe("https://fonts.fremd.test/f.css");
  });
});
