import { describe, expect, it } from "vitest";
import { bankCode, SA_BRANCHEN, SA_TAETIGKEITEN } from "./saBankListen";
import { extractEinkuenfte } from "./finanzierbarkeitUtils";

describe("Banklisten der Selbstauskunft", () => {
  it("findet den Baufi24-Code zum gespeicherten Text, unabhängig von Groß- und Kleinschreibung", () => {
    expect(bankCode(SA_BRANCHEN, "Öffentlicher Dienst")).toBe("Oeffentl");
    expect(bankCode(SA_BRANCHEN, "it/beratung")).toBe("IT");
    expect(bankCode(SA_TAETIGKEITEN.selbstaendig, "Freiberufler/in")).toBe("Freib");
  });

  it("alter Freitext ohne Listeneintrag ergibt keinen Code", () => {
    expect(bankCode(SA_BRANCHEN, "Maschinenbau")).toBeUndefined();
    expect(bankCode(SA_BRANCHEN, "")).toBeUndefined();
  });

  it("variable Bezüge zählen in der Haushaltsrechnung unter Sonstige mit", () => {
    const e = extractEinkuenfte({ einkommen: { netto: "3.000", sonstige: "100", variabel: "250" } });
    expect(e.sonstige).toBe(350);
  });
});
