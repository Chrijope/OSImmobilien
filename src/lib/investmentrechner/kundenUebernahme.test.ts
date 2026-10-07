import { describe, it, expect } from "vitest";
import type { Kundenkontext } from "@/lib/kundenkontextHelper";
import { kundenschritt, kundenUebernahmeAus, steuerklasseAusSa } from "@/lib/investmentrechner/kundenUebernahme";
import { herkunftText, setzeHerkunft } from "@/lib/investmentrechner/herkunft";

/**
 * Die Ableitung der Kundendaten für den Investmentrechner. Geprüft wird, was
 * übernommen wird, was bewusst nicht, und was ohne Selbstauskunft geschieht.
 */

/**
 * Ein Kundenkontext, wie ihn `loadKundenkontext` liefert.
 *
 * Die Angaben gelten für beide Blöcke: die flachen Felder, die einen Rückfall
 * auf die am Kontakt erfassten Einkünfte haben, und `ausSelbstauskunft`, das
 * nur trägt, was wirklich in der Selbstauskunft steht. Ohne Selbstauskunft
 * (`saVerfuegbar: false`) bleibt der zweite Block leer, genau wie im echten
 * Helfer. Wo beide auseinanderlaufen sollen, wird `ausSelbstauskunft`
 * ausdrücklich übergeben.
 */
function kontext(over: Partial<Kundenkontext> = {}): Kundenkontext {
  const flach: Kundenkontext = {
    kundeId: "k1",
    kundeName: "Anna Muster",
    grenzsteuersatz: 42,
    zvE: 63_000,
    verheiratet: false,
    anzahlPersonen: 1,
    liquideMittel: 40_000,
    bruttoJahrHaushalt: 90_000,
    saDatum: "2026-08-12T00:00:00.000Z",
    saVerfuegbar: true,
    ausSelbstauskunft: null,
    ...over,
  };
  if (over.ausSelbstauskunft !== undefined) return flach;
  return {
    ...flach,
    ausSelbstauskunft: flach.saVerfuegbar
      ? {
          bruttoJahrHaushalt: flach.bruttoJahrHaushalt,
          zvE: flach.zvE,
          zvEAngegeben: false,
          verheiratet: flach.verheiratet,
          anzahlPersonen: flach.anzahlPersonen,
          liquideMittel: flach.liquideMittel,
        }
      : null,
  };
}

describe("Steuerklasse aus der Selbstauskunft", () => {
  it("liest die Ziffer aus dem PDF-Formular", () => {
    expect(steuerklasseAusSa({ person1: { steuerklasse: "3" } })).toBe("III");
    expect(steuerklasseAusSa({ steuerklasse: 1 })).toBe("I");
  });

  it("liest auch die römische Schreibweise", () => {
    expect(steuerklasseAusSa({ person1: { steuerklasse: "iv" } })).toBe("IV");
  });

  it("gibt bei fehlender oder unsinniger Angabe nichts zurück", () => {
    expect(steuerklasseAusSa(null)).toBeUndefined();
    expect(steuerklasseAusSa({})).toBeUndefined();
    expect(steuerklasseAusSa({ person1: { steuerklasse: "" } })).toBeUndefined();
    expect(steuerklasseAusSa({ person1: { steuerklasse: "9" } })).toBeUndefined();
    expect(steuerklasseAusSa({ person1: { steuerklasse: "keine Ahnung" } })).toBeUndefined();
  });
});

describe("Übernahme mit Selbstauskunft", () => {
  it("nimmt Jahresbrutto, Steuerklasse, Veranlagung und zvE mit", () => {
    const u = kundenUebernahmeAus(kontext(), "III");
    expect(u.ohneSelbstauskunft).toBe(false);
    expect(u.aenderung).toEqual({
      annualGrossIncome: 90_000,
      taxClass: "III",
      jointAssessment: false,
      taxableIncomeCustomer: 63_000,
    });
    expect(u.felder).toEqual(["annualGrossIncome", "taxClass", "jointAssessment", "taxableIncomeCustomer"]);
  });

  it("nennt in jedem Posten den Wert, den der Nutzer vor der Zustimmung sieht", () => {
    const u = kundenUebernahmeAus(kontext(), "III");
    expect(u.posten.map((p) => p.feld)).toEqual([
      "Jahresbrutto Kunde",
      "Steuerklasse",
      "Veranlagung / Einkommensteuertarif",
      "zvE Kunde",
    ]);
    expect(u.posten[0].wert).toContain("90.000");
    expect(u.posten[2].wert).toContain("Grundtabelle");
  });

  it("setzt Splitting, wenn der Kunde verheiratet ist", () => {
    const u = kundenUebernahmeAus(kontext({ verheiratet: true, anzahlPersonen: 2 }), "III");
    expect(u.aenderung.jointAssessment).toBe(true);
    expect(u.posten[0].hinweis).toBe("Summe beider Personen");
  });

  it("lässt die Steuerklasse unberührt, wenn die Selbstauskunft keine nennt", () => {
    const u = kundenUebernahmeAus(kontext({ verheiratet: true }), undefined);
    expect(u.aenderung).not.toHaveProperty("taxClass");
    expect(u.felder).not.toContain("taxClass");
    expect(u.aenderung.jointAssessment).toBe(true);
    const veranlagung = u.posten.find((p) => p.feld.startsWith("Veranlagung"));
    expect(veranlagung?.hinweis).toContain("Familienstand");
  });

  it("lässt leere Zahlen weg, statt Nullen einzutragen", () => {
    const u = kundenUebernahmeAus(kontext({ bruttoJahrHaushalt: 0, zvE: 0 }), undefined);
    expect(u.aenderung).toEqual({ jointAssessment: false });
    expect(u.posten).toHaveLength(1);
  });

  it("trägt den Stand der Selbstauskunft in den Hinweis unter dem Feld", () => {
    const u = kundenUebernahmeAus(kontext(), "III");
    expect(u.hinweis.quelle).toBe("selbstauskunft");
    expect(u.hinweis.text).toBe("Aus der Selbstauskunft vom 12.08.2026");
    const herkunft = setzeHerkunft({}, u.felder, u.hinweis);
    expect(herkunftText(herkunft, "annualGrossIncome")).toBe("Aus der Selbstauskunft vom 12.08.2026");
  });

  it("kommt ohne Datum aus", () => {
    const u = kundenUebernahmeAus(kontext({ saDatum: undefined }), "III");
    expect(u.hinweis.text).toBe("Aus der Selbstauskunft");
  });

  it("übernimmt das Jahresbrutto nicht, wenn es nicht in der Selbstauskunft steht", () => {
    // Der Fall Otto Hans: Die Selbstauskunft nennt kein Jahresbrutto, am
    // Kontakt steht ein Monatswert. Mal zwölf ergab das 467.777 Euro, die der
    // Rechner als „Aus der Selbstauskunft" auswies. Der flache Wert bleibt am
    // Kontakt stehen, übernommen wird er hier nicht.
    const u = kundenUebernahmeAus(
      kontext({
        bruttoJahrHaushalt: 467_777,
        zvE: 327_444,
        ausSelbstauskunft: {
          bruttoJahrHaushalt: 0,
          zvE: 0,
          zvEAngegeben: false,
          verheiratet: false,
          anzahlPersonen: 1,
          liquideMittel: 0,
        },
      }),
      undefined,
    );
    expect(u.ohneSelbstauskunft).toBe(false);
    expect(u.aenderung).toEqual({ jointAssessment: false });
    expect(u.posten.some((p) => p.feld === "Jahresbrutto Kunde")).toBe(false);
  });

  it("nennt eine zweite Person nur, wenn die Selbstauskunft eine führt", () => {
    // Am Kontakt hängt ein Partner, die Selbstauskunft kennt nur eine Person.
    // Dann ist das Brutto nicht die Summe beider, und der Zusatz muss weg.
    const u = kundenUebernahmeAus(
      kontext({
        anzahlPersonen: 2,
        ausSelbstauskunft: {
          bruttoJahrHaushalt: 90_000,
          zvE: 63_000,
          zvEAngegeben: false,
          verheiratet: false,
          anzahlPersonen: 1,
          liquideMittel: 0,
        },
      }),
      undefined,
    );
    expect(u.posten[0].hinweis).toBeUndefined();
  });
});

describe("ohne Selbstauskunft", () => {
  it("übernimmt nichts und sagt das", () => {
    const u = kundenUebernahmeAus(kontext({ saVerfuegbar: false }), undefined);
    expect(u.ohneSelbstauskunft).toBe(true);
    expect(u.aenderung).toEqual({});
    expect(u.felder).toEqual([]);
    expect(u.posten).toEqual([]);
  });

  it("übernimmt auch dann nichts, wenn Zahlen ohne Selbstauskunft im Kontext stehen", () => {
    // Für den Rechner ist alles ohne Selbstauskunft keine belastbare
    // Grundlage: Er rechnet Steuer, und die Steuer hängt am zvE aus dem
    // Bescheid, nicht an einer geschätzten Zahl.
    const u = kundenUebernahmeAus(kontext({ saVerfuegbar: false, bruttoJahrHaushalt: 72_000, zvE: 50_400 }), "I");
    expect(u.aenderung).toEqual({});
  });

  it("kommt ohne Kunden zurecht", () => {
    const u = kundenUebernahmeAus(null, undefined);
    expect(u.ohneSelbstauskunft).toBe(true);
    expect(u.aenderung).toEqual({});
  });
});

describe("Reihenfolge im Rechner", () => {
  const mitSa = kundenUebernahmeAus(kontext(), "III");
  const ohneSa = kundenUebernahmeAus(kontext({ saVerfuegbar: false }), undefined);

  it("fragt nach der Kundenwahl noch nicht, sondern bittet um das Investment", () => {
    // Mehrere Investments, noch keines gewählt: Es ist offen, welche
    // Selbstauskunft gemeint wäre, also wird nicht gefragt.
    expect(kundenschritt(null, 3, null)).toEqual({ art: "investmentWaehlen" });
  });

  it("schweigt, wenn der Kunde gar kein Investment hat", () => {
    // Das sagt die Investmentauswahl selbst, ein zweiter Hinweis wäre Lärm.
    expect(kundenschritt(null, 0, null)).toEqual({ art: "still" });
  });

  it("fragt erst mit gewähltem Investment und vorliegender Selbstauskunft", () => {
    expect(kundenschritt("inv1", 3, mitSa)).toEqual({ art: "frage", uebernahme: mitSa });
  });

  it("fragt nicht, wenn zum gewählten Investment keine Selbstauskunft vorliegt", () => {
    expect(kundenschritt("inv1", 3, ohneSa)).toEqual({ art: "ohneSelbstauskunft" });
  });
});

describe("zvE aus der Selbstauskunft", () => {
  const mitZvE = (verheiratet: boolean, anzahlPersonen: 1 | 2 = 1) =>
    kontext({
      ausSelbstauskunft: {
        bruttoJahrHaushalt: 90_000,
        zvE: 71_500,
        zvEAngegeben: true,
        verheiratet,
        anzahlPersonen,
        liquideMittel: 0,
      },
    });

  it("belegt das zvE Kunde vor und sagt, dass es laut Selbstauskunft ist", () => {
    const u = kundenUebernahmeAus(mitZvE(false), undefined);
    expect(u.aenderung.taxableIncomeCustomer).toBe(71_500);
    expect(u.felder).toContain("taxableIncomeCustomer");
    expect(u.posten.find((p) => p.feld === "zvE Kunde")?.hinweis).toBe("Laut Selbstauskunft");
    expect(u.hinweis.text).toMatch(/^Aus der Selbstauskunft/);
    expect(u.aenderung.taxableIncomeSpouse).toBeUndefined();
  });

  it("rechnet ein gemeinsames zvE mit Splitting und setzt das Partnerfeld auf null", () => {
    const u = kundenUebernahmeAus(mitZvE(true, 2), undefined);
    expect(u.aenderung.jointAssessment).toBe(true);
    expect(u.aenderung.taxableIncomeCustomer).toBe(71_500);
    // Sonst addierte der Rechner einen alten Partnerwert zum gemeinsamen zvE.
    expect(u.aenderung.taxableIncomeSpouse).toBe(0);
    expect(u.felder).toContain("taxableIncomeSpouse");
    expect(u.posten.find((p) => p.feld === "zvE Kunde")?.hinweis).toMatch(/Gemeinsames zvE.*Splitting/);
  });

  it("kennzeichnet die Schätzung, solange die Selbstauskunft kein zvE nennt", () => {
    const u = kundenUebernahmeAus(kontext(), undefined);
    expect(u.posten.find((p) => p.feld === "zvE Kunde")?.hinweis).toMatch(/Geschätzt aus dem Jahresbrutto/);
  });
});

describe("zvE von 0 aus der Selbstauskunft", () => {
  it("wird übernommen, bei Zusammenveranlagung samt genulltem Partnerfeld", () => {
    const u = kundenUebernahmeAus(
      kontext({
        ausSelbstauskunft: {
          bruttoJahrHaushalt: 0,
          zvE: 0,
          zvEAngegeben: true,
          verheiratet: true,
          anzahlPersonen: 2,
          liquideMittel: 0,
        },
      }),
      undefined,
    );
    expect(u.aenderung.taxableIncomeCustomer).toBe(0);
    expect(u.aenderung.taxableIncomeSpouse).toBe(0);
    expect(u.felder).toEqual(expect.arrayContaining(["taxableIncomeCustomer", "taxableIncomeSpouse"]));
  });
});
