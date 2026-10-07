import { describe, it, expect } from "vitest";
import { groesseText, ZIELGROESSE, aufHochladbareGroesse } from "@/lib/unterlagenVerkleinern";

describe("Groessenangabe", () => {
  it("nennt Megabyte ab einem Megabyte", () => {
    expect(groesseText(5 * 1024 * 1024)).toBe("5 MB");
    expect(groesseText(12.45 * 1024 * 1024)).toBe("12,5 MB");
  });

  it("nennt darunter Kilobyte", () => {
    expect(groesseText(300 * 1024)).toBe("300 KB");
  });
});

describe("Zielgroesse", () => {
  it("liegt unter dem Limit des Speichers von 20 MB", () => {
    // Mit Luft nach oben: Der Upload selbst bringt etwas Mehrgewicht mit,
    // und genau am Limit zu landen waere ein unnoetiges Risiko.
    expect(ZIELGROESSE).toBeLessThan(20 * 1024 * 1024);
    expect(ZIELGROESSE).toBeGreaterThan(10 * 1024 * 1024);
  });
});

describe("Kleine Dateien bleiben unangetastet", () => {
  it("gibt eine passende Datei unveraendert zurueck", async () => {
    /*
     * Wichtig fuer PDFs: Sie durch den Bildwolf zu drehen kostet die
     * Textebene. Bei einer Datei, die ohnehin passt, waere das ein Schaden
     * ohne jeden Nutzen.
     */
    const klein = new File([new Uint8Array(1024)], "klein.pdf", { type: "application/pdf" });
    const r = await aufHochladbareGroesse(klein);
    expect(r.datei).toBe(klein);
    expect(r.verkleinert).toBe(false);
    expect(r.textEbeneVerloren).toBeUndefined();
  });
});
