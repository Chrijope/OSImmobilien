/**
 * Die Anredezeile der Kundenmails.
 *
 * Der Helfer liegt bei den Mailvorlagen, weil er dort gebraucht wird. Getestet
 * wird er hier, weil Vitest nur unterhalb von src sucht, so wie bei
 * steuerAuswertungMail.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  hallo,
  vornameAus,
} from "../../supabase/functions/_shared/transactional-email-templates/_anrede.ts";

describe("vornameAus", () => {
  it("nimmt das erste Wort eines vollen Namens", () => {
    expect(vornameAus("Max Mustermann")).toBe("Max");
    expect(vornameAus("  Martina   Brandl  ")).toBe("Martina");
    expect(vornameAus("Anna Maria Berater")).toBe("Anna");
  });

  it("laesst ein einzelnes Wort als Vornamen gelten", () => {
    // document-reminder und birthday-customer bekommen nur den Vornamen.
    expect(vornameAus("Max")).toBe("Max");
  });

  it("ueberspringt Anrede und Titel", () => {
    expect(vornameAus("Herr Max Mustermann")).toBe("Max");
    expect(vornameAus("Frau Martina Brandl")).toBe("Martina");
    expect(vornameAus("Dr. Max Mustermann")).toBe("Max");
    expect(vornameAus("Frau Dr. Martina Brandl")).toBe("Martina");
  });

  it("erkennt, wenn nach der Anrede nur der Nachname steht", () => {
    // "Hallo Mustermann," waere peinlich. Dann lieber gar kein Name.
    expect(vornameAus("Herr Mustermann")).toBe("");
    expect(vornameAus("Frau Brandl")).toBe("");
    expect(vornameAus("Dr. Mustermann")).toBe("");
  });

  it("gibt bei nichts auch nichts zurueck", () => {
    expect(vornameAus("")).toBe("");
    expect(vornameAus("   ")).toBe("");
    expect(vornameAus(undefined)).toBe("");
    expect(vornameAus(null)).toBe("");
    expect(vornameAus("Herr")).toBe("");
  });
});

describe("hallo", () => {
  it("gruesst mit Vornamen", () => {
    expect(hallo("Max Mustermann")).toBe("Hallo Max,");
    expect(hallo("Martina")).toBe("Hallo Martina,");
  });

  it("gruesst ohne Namen, wenn keiner bekannt ist", () => {
    expect(hallo(undefined)).toBe("Hallo,");
    expect(hallo("")).toBe("Hallo,");
    expect(hallo("Herr Mustermann")).toBe("Hallo,");
  });
});
