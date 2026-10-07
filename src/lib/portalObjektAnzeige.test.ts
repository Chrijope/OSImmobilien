import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { adaptMoreImmoInvestment } from "@/lib/kundePortalInvestment";

/**
 * Was der Kunde im Portal sieht, sobald ein Objekt eingetragen ist.
 *
 * Vier Fälle sind zu unterscheiden, und sie verhalten sich unterschiedlich:
 *
 *   1. Objekt von Hand eingetragen (nur `meta.rvVirtualWohnung`).
 *   2. Wohnung aus dem eigenen Bestand reserviert (`meta.objektId` und
 *      `meta.wohnungId`, Daten kommen über `get-expose`).
 *   3. Es ist noch nichts eingetragen.
 *   4. Der Kunde hat mehrere Investments.
 *
 * Der Adapter unten versorgt Steuer-Cockpit, Marktwert und die Anlage V. Er
 * kannte die von Hand eingetragene Wohnung lange nicht, und deshalb stand dort
 * kein Preis je Quadratmeter und in der Anlage V „Angabe fehlt“, obwohl die
 * Fläche im Investment hinterlegt war.
 */

const investment = (kaufpreis = 200000, objekt = "Musterweg 1, 12345 Musterstadt") => ({
  id: "inv-1",
  objekt,
  wohnung: "3",
  kaufpreis,
  kaufdatum: null,
});

/** Was `speichereObjektDaten` am Investment ablegt. */
const vonHandEingetragen = {
  kaufpreis: 200000,
  rvVirtualWohnung: {
    weNr: "3",
    objAdresse: "Musterweg 1",
    objPlz: "12345",
    objOrt: "Musterstadt",
    kaufpreis: 200000,
    groesse: 62,
    bildUrl: "https://beispiel.test/storage/v1/object/public/objekt-medien/objektfotos/investment/inv-1/1.webp",
  },
};

describe("Fall 1: Objekt von Hand eingetragen", () => {
  it("reicht die Wohnfläche an Steuer-Cockpit und Anlage V durch", () => {
    const a = adaptMoreImmoInvestment(investment(), vonHandEingetragen, null);
    expect(a.wohnflaeche).toBe(62);
  });

  it("reicht Adresse, PLZ und Ort durch", () => {
    const a = adaptMoreImmoInvestment(investment(), vonHandEingetragen, null);
    expect(a.adresse).toBe("Musterweg 1");
    expect(a.plz).toBe("12345");
    expect(a.ort).toBe("Musterstadt");
  });

  it("zeigt den Kaufpreis aus der Spalte, die beim Speichern mitgefüllt wird", () => {
    const a = adaptMoreImmoInvestment(investment(), vonHandEingetragen, null);
    expect(a.kaufpreis).toBe(200000);
  });

  it("benennt das Investment nach dem Objekt, nicht nach seiner Nummer", () => {
    const a = adaptMoreImmoInvestment(investment(), vonHandEingetragen, null);
    expect(a.bezeichnung).toBe("Musterweg 1, 12345 Musterstadt");
  });
});

describe("Fall 2: Wohnung aus dem eigenen Bestand", () => {
  /*
   * Der Investagon-Weg und der Bestandsweg legen einen `objektSnapshot` ab.
   * Der Adapter las bisher `meta.objektMeta`, einen Namen, den im ganzen
   * Projekt niemand schreibt. Der Zweig lief damit immer leer.
   */
  const ausBestand = {
    objektId: "obj-1",
    wohnungId: "wo-1",
    objektSnapshot: { adresse: "Bestandsstraße 7", plz: "54321", ort: "Beispielort", baujahr: 1998 },
    wohnungSnapshot: { flaeche: 74, miete: 690 },
  };

  it("liest Adresse und Baujahr aus dem Schnappschuss des Objekts", () => {
    const a = adaptMoreImmoInvestment(investment(189000, "Bestandsobjekt"), ausBestand, null);
    expect(a.adresse).toBe("Bestandsstraße 7");
    expect(a.plz).toBe("54321");
    expect(a.ort).toBe("Beispielort");
    expect(a.baujahr).toBe(1998);
  });

  it("nimmt die Fläche aus dem Schnappschuss der Wohnung", () => {
    const a = adaptMoreImmoInvestment(investment(189000), ausBestand, null);
    expect(a.wohnflaeche).toBe(74);
  });

  it("rechnet die Jahresmiete aus der Monatsmiete", () => {
    const a = adaptMoreImmoInvestment(investment(189000), ausBestand, null);
    expect(a.mieteinnahmen_kalt).toBe(690);
  });
});

describe("Fall 3: Es ist noch nichts eingetragen", () => {
  it("liefert keine erfundenen Werte, sondern leere Felder", () => {
    const a = adaptMoreImmoInvestment({ id: "inv-1", objekt: null, wohnung: null, kaufpreis: 0 }, {}, null);
    expect(a.wohnflaeche).toBeNull();
    expect(a.baujahr).toBeNull();
    expect(a.adresse).toBe("");
    expect(a.kaufpreis).toBe(0);
  });

  it("fällt beim Namen auf eine neutrale Bezeichnung zurück", () => {
    const a = adaptMoreImmoInvestment({ id: "inv-1", objekt: null, wohnung: null, kaufpreis: 0 }, {}, null);
    expect(a.bezeichnung).toBe("MOREImmo Investment");
  });

  it("stürzt nicht ab, wenn meta fehlt", () => {
    expect(() => adaptMoreImmoInvestment(investment(), null, null)).not.toThrow();
    expect(() => adaptMoreImmoInvestment(investment(), undefined, undefined)).not.toThrow();
  });
});

describe("Fall 4: Mehrere Investments", () => {
  it("hält die Angaben zweier Investments auseinander", () => {
    const zweites = {
      kaufpreis: 310000,
      rvVirtualWohnung: { objAdresse: "Zweitweg 9", objPlz: "99999", objOrt: "Andernorts", groesse: 91, weNr: "7" },
    };
    const a = adaptMoreImmoInvestment(investment(200000), vonHandEingetragen, null);
    const b = adaptMoreImmoInvestment({ ...investment(310000), id: "inv-2" }, zweites, null);

    expect(a.id).toBe("inv-1");
    expect(b.id).toBe("inv-2");
    expect(a.adresse).toBe("Musterweg 1");
    expect(b.adresse).toBe("Zweitweg 9");
    expect(a.wohnflaeche).toBe(62);
    expect(b.wohnflaeche).toBe(91);
    expect(a.kaufpreis).toBe(200000);
    expect(b.kaufpreis).toBe(310000);
  });
});

// ── Was sich nur am Quelltext festhalten lässt ──

const portal = readFileSync(resolve(process.cwd(), "src/pages/KundeInvestments.tsx"), "utf8");

describe("Das Bild kommt im Portal an", () => {
  it("zeigt das am Investment hinterlegte Foto", () => {
    expect(portal).toContain("virt.bildUrl");
  });

  /*
    Seit dem 22.09.2026 sind es mehrere Bilder, und der Kunde blättert selbst
    durch. Die Leiste dafür steht in einer eigenen Komponente, zusammen mit dem
    Ausblenden eines nicht erreichbaren Bildes. Geprüft wird deshalb, dass das
    Portal sie überhaupt einbindet, der Rest liegt in deren eigenem Test.
  */
  it("gibt dem Kunden alle Bilder zum Durchblättern", () => {
    expect(portal).toContain("PortalObjektBilder");
    expect(portal).toContain("bilderListe(virt.bilder, virt.bildUrl)");
  });
});

describe("Die Wohnung aus dem Bestand wird mit ihren echten Spaltennamen gelesen", () => {
  it("kennt die Einheit unter we_nr", () => {
    expect(portal).toContain("wohnung.we_nr || wohnung.weNr");
  });

  it("kennt die Nettomiete unter miete_gesamt", () => {
    expect(portal).toContain("wohnung.miete_gesamt > 0");
  });

  // Seit 01.10.2026 baut das Portal dasselbe Exposé-PDF wie der Kundenlink:
  // aus der `get-expose`-Antwort über dieselbe Umwandlung der Spalten.
  it("baut das Wohnungsexposé aus der get-expose-Antwort wie der Kundenlink", () => {
    expect(portal).toContain("exposePayloadZuObjekt(antwort)");
    expect(portal).toContain("kundenExposePdf(objekt, einheit, undefined, new Date(), portalSprache())");
  });
});
