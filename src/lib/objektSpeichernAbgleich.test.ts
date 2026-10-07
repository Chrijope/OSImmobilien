import { describe, expect, it } from "vitest";
import { einheitLoeschSperre, investmentEinheit, KEINE_BEZUEGE } from "@/lib/objektSpeichernAbgleich";

/*
 * Die eine Löschsperre für Einheiten, gemeinsam genutzt von `saveObjekt`
 * (Entfernen beim Speichern des Objekts) und `deleteWohnung` (Mülleimer).
 * Christians Regel vom 23.09.2026.
 */

const JETZT = new Date("2026-09-23T12:00:00Z");
const frei = { id: "w-1", we_nr: "1", status: "frei", kunde_id: null, kunde_name: null, meta: {} };
const sperre = (felder: Record<string, unknown>, bezuege = KEINE_BEZUEGE) =>
  einheitLoeschSperre({ ...frei, ...felder }, bezuege, JETZT);

describe("einheitLoeschSperre", () => {
  it("lässt eine freie, von Hand angelegte Einheit ohne Bezüge durch", () => {
    expect(sperre({})).toBeNull();
    expect(sperre({ status: "verfügbar" })).toBeNull();
  });

  it("sperrt Reservierung, Setzen und Verkauf", () => {
    expect(sperre({ status: "reserviert" })).toBe("sie reserviert ist");
    expect(sperre({ status: "gesetzt" })).toBe("sie reserviert ist");
    expect(sperre({ status: "Verkauft" })).toBe("sie verkauft ist");
    expect(sperre({ reserviert_von: "u-1" })).toBe("sie reserviert ist");
  });

  it("sperrt eine Einheit, an der ein Kunde hängt", () => {
    expect(sperre({ kunde_id: "k-1" })).toBe("an ihr ein Kunde hängt");
    expect(sperre({ kunde_name: "Anna" })).toBe("an ihr ein Kunde hängt");
  });

  it("sperrt nur eine laufende Vormerkung, keine abgelaufene", () => {
    expect(sperre({ vorgemerkt_bis: "2026-09-23T13:00:00Z" })).toBe("sie gerade für einen Kunden vorgemerkt ist");
    expect(sperre({ vorgemerkt_bis: "2026-09-23T11:00:00Z" })).toBeNull();
  });

  it("sperrt eine Einheit aus Investagon", () => {
    expect(sperre({ meta: { investagonId: "inv-1" } })).toBe("sie aus Investagon kommt und dort gepflegt wird");
  });

  it("sperrt eine Einheit, auf die ein Investment verweist", () => {
    expect(sperre({}, { investments: 1, offeneLinks: 0 })).toBe("ein Investment auf sie verweist");
    expect(sperre({}, { investments: 3, offeneLinks: 0 })).toBe("3 Investments auf sie verweisen");
  });

  it("sperrt eine Einheit mit gesendetem, nicht zurückgezogenem Kundenlink", () => {
    expect(sperre({}, { investments: 0, offeneLinks: 1 })).toBe("an ihr ein gesendeter Kundenlink hängt, der nicht zurückgezogen ist");
    expect(sperre({}, { investments: 0, offeneLinks: 2 })).toBe("an ihr 2 gesendete Kundenlinks hängen, die nicht zurückgezogen sind");
  });

  it("nennt den Verkaufsstand vor den Bezügen", () => {
    expect(sperre({ status: "verkauft" }, { investments: 1, offeneLinks: 1 })).toBe("sie verkauft ist");
  });
});

describe("investmentEinheit", () => {
  it("liest `meta.wohnungId` und ist sonst leer", () => {
    expect(investmentEinheit({ meta: { wohnungId: " w-1 " } })).toBe("w-1");
    expect(investmentEinheit({ meta: null })).toBe("");
    expect(investmentEinheit({})).toBe("");
  });
});
