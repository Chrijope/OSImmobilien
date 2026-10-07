import { describe, it, expect } from "vitest";
import {
  alleFormulierungen,
  istSchonNotiert,
  neueUnterschriften,
  stufenwechselNotiz,
  unterschriftMeldung,
  unterschriftNotiz,
  versandNotiz,
  BONITAET_FREIGEGEBEN,
  ERSTER_KONTAKTVERSUCH,
  NOTARTERMIN_STATTGEFUNDEN,
  RV_ERSTELLT,
  RV_UNTERSCHRIEBEN,
  RV_VERSENDET,
  SA_UNTERSCHRIEBEN,
  SA_ZUR_UNTERSCHRIFT_VERSENDET,
  notarterminGesetzt,
} from "@/lib/prozessNotizen";

/**
 * Gemeldet am 22.09.2026: Ein Partner versendet die Reservierungsvereinbarung,
 * und in der Akte erscheint „Selbstauskunft unterschrieben".
 *
 * Bis dahin gab es keinen einzigen Test, der geprueft haette, welcher Text bei
 * welcher Aktion entsteht. Diese Datei holt das nach.
 */
describe("Versand der Reservierungsvereinbarung", () => {
  it("schreibt den Versand-Eintrag und nicht den Unterschrift-Eintrag", () => {
    expect(versandNotiz("rv").text).toBe("Reservierungsvereinbarung versendet");
    expect(versandNotiz("rv").text).not.toBe(unterschriftNotiz("rv").text);
    expect(versandNotiz("rv").text).not.toBe(unterschriftNotiz("sa").text);
  });

  it("loest nichts aus, wenn die Selbstauskunft schon vorher unterschrieben war", () => {
    // Genau der gemeldete Fall: Die Reservierung wartet auf die Unterschrift,
    // die Selbstauskunft ist laengst unterschrieben. Vorher fragte die
    // Wachschleife „ist irgendetwas unterschrieben?" und schrieb deshalb
    // „Selbstauskunft unterschrieben" mit dem Datum des Versands.
    const vorher = { sa: true, rv: false };
    expect(neueUnterschriften(vorher, { sa: true, rv: false })).toEqual([]);
  });

  it("meldet die Reservierung erst, wenn der Kunde wirklich unterschreibt", () => {
    const vorher = { sa: true, rv: false };
    expect(neueUnterschriften(vorher, { sa: true, rv: true })).toEqual(["rv"]);
    expect(unterschriftNotiz("rv").text).toBe("Reservierungsvereinbarung unterschrieben");
    expect(unterschriftMeldung("rv")).toBe("Reservierungsvereinbarung wurde unterschrieben!");
  });
});

describe("Versand der Selbstauskunft zur Unterschrift", () => {
  it("schreibt den Versand-Eintrag und nicht den Unterschrift-Eintrag", () => {
    expect(versandNotiz("sa").text).toBe("Selbstauskunft wartet auf Unterschrift vom Kunden");
    expect(versandNotiz("sa").text).not.toBe(unterschriftNotiz("sa").text);
    expect(versandNotiz("sa").text).not.toBe(unterschriftNotiz("rv").text);
  });

  it("meldet die Selbstauskunft erst, wenn sie neu unterschrieben ist", () => {
    expect(neueUnterschriften({ sa: false, rv: false }, { sa: false, rv: false })).toEqual([]);
    expect(neueUnterschriften({ sa: false, rv: false }, { sa: true, rv: false })).toEqual(["sa"]);
    expect(unterschriftNotiz("sa").text).toBe("Selbstauskunft unterschrieben");
  });

  it("kennt den Fall, dass beide Unterschriften zwischen zwei Abfragen eingehen", () => {
    expect(neueUnterschriften({ sa: false, rv: false }, { sa: true, rv: true })).toEqual(["sa", "rv"]);
  });
});

describe("Stufenwechsel", () => {
  it("nennt die Stufe, die wirklich gesetzt wurde", () => {
    // Der alte Text behauptete nach der unterschriebenen Reservierung immer
    // „→ Bonitaetsunterlagen". Wer selbst finanziert, geht aber auf
    // „Finanzierung".
    expect(stufenwechselNotiz("bonitaetsunterlagen").text)
      .toBe('Pipeline-Stufe gewechselt auf „Bonitätsunterlagen"');
    expect(stufenwechselNotiz("finanzierung").text)
      .toBe('Pipeline-Stufe gewechselt auf „Finanzierung"');
    expect(stufenwechselNotiz("bonitaetsunterlagen").text)
      .not.toBe(stufenwechselNotiz("finanzierung").text);
  });

  it("nennt die Stufe des ersten Kontaktversuchs so, wie sie gespeichert wird", () => {
    // Gesetzt wird der Schluessel „kontaktversuche", siehe KundenDetail.tsx.
    expect(stufenwechselNotiz("kontaktversuche").text)
      .toBe('Pipeline-Stufe gewechselt auf „Kontaktversuche"');
  });

  it("unterscheidet die beiden Follow-Up-Stufen", () => {
    expect(stufenwechselNotiz("follow_up_objekt").text)
      .toBe('Pipeline-Stufe gewechselt auf „Follow-Up (nach Objektauswahl)"');
  });

  it("trennt das Ereignis vom Stufenwechsel", () => {
    // Kein Ereignistext nennt noch eine Stufe. Sonst koennen die beiden
    // wieder auseinanderlaufen.
    const ereignisse = [
      SA_ZUR_UNTERSCHRIFT_VERSENDET, SA_UNTERSCHRIEBEN,
      RV_VERSENDET, RV_ERSTELLT, RV_UNTERSCHRIEBEN,
      BONITAET_FREIGEGEBEN, NOTARTERMIN_STATTGEFUNDEN, ERSTER_KONTAKTVERSUCH,
      notarterminGesetzt("2026-10-01", "10:00"),
    ];
    for (const e of ereignisse) {
      expect(e.text).not.toContain("→");
      expect(e.text).not.toContain("Pipeline-Stufe");
    }
  });
});

describe("Sperre gegen Doppeleintraege", () => {
  it("erkennt die frueheren Formulierungen desselben Ereignisses", () => {
    // Ein laufender Vorgang traegt die alte, zusammengesetzte Fassung in der
    // Akte. Ohne diese Liste bekaeme er einmalig einen zweiten,
    // gleichbedeutenden Eintrag.
    const akte = ["Reservierungsvereinbarung vom Kunden unterschrieben → Bonitätsunterlagen"];
    expect(istSchonNotiert(akte, RV_UNTERSCHRIEBEN)).toBe(true);
  });

  it("erkennt auch die heutige Fassung", () => {
    expect(istSchonNotiert([RV_UNTERSCHRIEBEN.text], RV_UNTERSCHRIEBEN)).toBe(true);
    expect(istSchonNotiert(["Irgendetwas anderes"], RV_UNTERSCHRIEBEN)).toBe(false);
    expect(istSchonNotiert([], RV_UNTERSCHRIEBEN)).toBe(false);
  });

  it("haelt die frueheren Fassungen aller umbenannten Ereignisse fest", () => {
    const paare: Array<[ReturnType<typeof unterschriftNotiz>, string]> = [
      [SA_UNTERSCHRIEBEN, "Selbstauskunft unterschrieben → Objektauswahl (Reservierung freigeschaltet)"],
      [RV_ERSTELLT, "Reservierungsvereinbarung erstellt → Reservierung (wartet auf Unterschrift)"],
      [RV_UNTERSCHRIEBEN, "Reservierungsvereinbarung vom Kunden unterschrieben → Bonitätsunterlagen"],
      [BONITAET_FREIGEGEBEN, "Alle Bonitätsunterlagen freigegeben → Finanzierung"],
      [NOTARTERMIN_STATTGEFUNDEN, "Notartermin stattgefunden → Fälligkeit / Bestandskunde"],
      [ERSTER_KONTAKTVERSUCH, 'Erster Kontaktversuch durch Vertriebspartner → Pipeline-Stufe „Kontaktversuche"'],
    ];
    for (const [notiz, alt] of paare) {
      expect(alleFormulierungen(notiz)).toContain(alt);
      expect(istSchonNotiert([alt], notiz)).toBe(true);
    }
  });

  it("kennt auch die alte Fassung des Notartermins mit Datum", () => {
    const notiz = notarterminGesetzt("2026-10-01", "10:00");
    expect(notiz.text).toBe("Notartermin gesetzt am 2026-10-01 um 10:00 Uhr");
    expect(istSchonNotiert(["Notartermin gesetzt am 2026-10-01 um 10:00 Uhr → Notar"], notiz)).toBe(true);
  });
});
