import { describe, expect, it } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { berechneInvestment, standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { vorbelegungAusEinheit } from "@/lib/investmentrechner/objektVorbelegung";
import { eigenkapitalNachRegel } from "@/lib/investmentrechner/herkunft";

/**
 * Die Feldzuordnung des Reiters „Investmentrechner" auf der Einheitenseite.
 *
 * Geprüft wird beides: dass die gepflegten Zahlen im richtigen Feld und in der
 * richtigen Einheit ankommen, und dass ungepflegte Angaben leer bleiben und
 * als Lücke gemeldet werden statt geraten zu werden.
 *
 * Das Objekt ist dasselbe wie in exposeInhalt.test.ts, damit beide Zuordnungen
 * an derselben Vorlage geprüft werden.
 */

const objekt: ObjektData = {
  id: "o1", titel: "Musterwohnanlage", adresse: "Musterstraße 12", plz: "86150", ort: "Augsburg",
  beschreibung: "", highlights: [], bildUrl: "", bilder: [], dokumente: [],
  videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
  renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01",
  sanierungskosten: 100000, erhaltungsaufwandJahre: 2,
  afaDaten: { afaModell: "linear", afaSatz: 2.5, restnutzungsdauer: 40, grundstueckAnteil: 20 },
  globalDaten: { baujahr: 1962 } as ObjektData["globalDaten"],
  meta: {
    anlageklasse: "Eigentumswohnung",
    energieausweis: { art: "Verbrauchsausweis", kennwert: 121, klasse: "D", energietraeger: "Gas", gueltigBis: "31.12.2030" },
    sanierungen: [{ jahr: "2024", massnahme: "Heizung", betrag: 40000 }],
  } as ObjektData["meta"],
  wohnungen: [
    {
      id: "w7", weNr: "WE 7", etage: "2. OG", lage: "rechts", groesse: 61.4, zimmer: 3,
      mieteGesamt: 790, vkGesamt: 232000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei",
      stellplatzPreis: 9500, stellplatzMiete: 40, hausgeldNichtUmlagefaehigEuro: 45,
      sanierungAnteilProzent: 7.1, ruecklageWohnung: 3200,
    },
  ],
} as ObjektData;

const w = objekt.wohnungen[0];
const heute = new Date(2026, 8, 2);

/** Objekt und Einheit ohne jede gepflegte Zahl. */
const leer: ObjektData = {
  ...objekt, plz: "", ort: "", adresse: "", titel: "", sanierungskosten: undefined,
  afaDaten: undefined, globalDaten: undefined, meta: {},
  wohnungen: [{ id: "wx", weNr: "", etage: "", lage: "", groesse: 0, zimmer: 0, mieteGesamt: 0, vkGesamt: 0, qmPreis: 0, rendite: 0, vermietet: false, status: "frei" }],
} as ObjektData;

const feldnamen = (liste: Array<{ feld: string }>) => liste.map((e) => e.feld);

describe("Vorbelegung aus Objekt und Einheit", () => {
  const v = vorbelegungAusEinheit(objekt, w, heute);

  it("übernimmt Kaufpreis samt Stellplatz und Miete samt Stellplatzmiete", () => {
    // Der Rechner kennt nur ein Preisfeld, auf das die Kaufnebenkosten laufen.
    // Der Stellplatz gehört deshalb dorthin und nicht ins Möbelfeld.
    expect(v.eingabe.purchasePrice).toBe(241500);
    expect(v.eingabe.furniturePrice).toBe(0);
    expect(v.eingabe.monthlyColdRent).toBe(830);
  });

  it("übernimmt den Investagon-Möbelpreis als Anteil, ohne ihn dazuzuzählen", () => {
    // vk_gesamt enthält die Möbel schon (Investagon-Import). Seit dem
    // 25.09.2026 bleibt der Kaufpreis deshalb vk_gesamt samt Stellplatz, und
    // die Möbel stehen als „davon“ daneben.
    const mitMoebeln = vorbelegungAusEinheit(objekt, { ...w, moebelPreis: 8000 }, heute);
    expect(mitMoebeln.eingabe.purchasePrice).toBe(241500);
    expect(mitMoebeln.eingabe.furniturePrice).toBe(8000);
    expect(mitMoebeln.uebernommen.map((u) => u.feld)).toContain("davon Möbel/Inventar");
    expect(mitMoebeln.herkunft.furniturePrice?.quelle).toBe("objekt");
  });

  it("verwirft einen Möbelpreis über dem Kaufpreis", () => {
    const unsinn = vorbelegungAusEinheit(objekt, { ...w, moebelPreis: 999999 }, heute);
    expect(unsinn.eingabe.furniturePrice).toBe(0);
  });

  it("übernimmt Fläche, Zimmer, Baujahr, Bezeichnung und Adresse", () => {
    expect(v.eingabe.area).toBe(61.4);
    expect(v.eingabe.rooms).toBe(3);
    expect(v.eingabe.constructionYear).toBe(1962);
    expect(v.eingabe.propertyTitle).toBe("Musterwohnanlage, WE 7");
    expect(v.eingabe.address).toBe("Musterstraße 12, 86150 Augsburg");
    expect(v.eingabe.propertyType).toBe("Eigentumswohnung");
  });

  it("setzt die Kaufnebenkosten über das Bundesland aus der Postleitzahl", () => {
    expect(v.knk).toEqual({ weg: "bundesland", bundesland: "bayern" });
    expect(v.eingabe.transferTaxRate).toBe(3.5);
    expect(v.eingabe.notaryRate).toBe(1);
    expect(v.eingabe.landRegisterRate).toBe(0.5);
    // Makler fällt bei uns nicht beim Käufer an.
    expect(v.eingabe.brokerRate).toBe(0);
  });

  it("nimmt als laufende Kosten nur den nicht umlagefähigen Anteil", () => {
    expect(v.eingabe.monthlyOperatingCosts).toBe(45);
  });

  it("übernimmt Gebäudeanteil, AfA und den Sanierungsanteil der Einheit", () => {
    expect(v.eingabe.buildingShare).toBe(80);
    expect(v.eingabe.buildingDepreciationRate).toBe(2.5);
    expect(v.eingabe.depreciationMethod).toBe("linear");
    expect(v.eingabe.rehabExpense).toBeCloseTo(7100, 6);
    expect(v.eingabe.rehabMode).toBe("expense");
    expect(v.eingabe.rehabDistributionYears).toBe(2);
  });

  it("setzt das Startjahr auf das laufende Jahr", () => {
    expect(v.eingabe.startYear).toBe(2026);
  });

  it("meldet nur die Felder des Kunden als offen", () => {
    expect(feldnamen(v.luecken)).toEqual(["Kundenname", "zvE Kunde"]);
    expect(v.luecken.every((l) => l.quelle === "kunde")).toBe(true);
    // Kundenzahlen bleiben leer, sie stehen nicht am Objekt.
    expect(v.eingabe.clientName).toBe("");
    expect(v.eingabe.taxableIncomeCustomer).toBe(0);
  });

  it("belegt das Eigenkapital in Höhe der Kaufnebenkosten vor (Christian, 23.09.2026)", () => {
    const satz = v.eingabe.transferTaxRate + v.eingabe.notaryRate + v.eingabe.landRegisterRate
      + v.eingabe.brokerRate + v.eingabe.otherPurchaseCostRate;
    expect(satz).toBeGreaterThan(0);
    // Seit dem 30.09.2026 auf den Kaufpreis ohne Erhaltungsaufwand, genau wie im Rechenkern.
    expect(v.eingabe.rehabExpense).toBeGreaterThan(0);
    const basis = v.eingabe.purchasePrice - v.eingabe.rehabExpense;
    expect(v.eingabe.equity).toBe(Math.round((basis * satz) / 100));
    expect(v.eingabe.equity).toBe(Math.round(berechneInvestment(v.eingabe).purchaseCosts));
    expect(v.uebernommen.find((u) => u.feld === "Eigenkapital")?.woher).toMatch(/Kaufnebenkosten.*ohne Erhaltungsaufwand/);
  });

  it("zählt auf, was übernommen wurde", () => {
    expect(feldnamen(v.uebernommen)).toEqual([
      "Objektbezeichnung", "Adresse", "Objekttyp", "Kaufpreis", "Wohnfläche", "Zimmer",
      "Baujahr", "Kaufnebenkosten", "Eigenkapital", "Kaltmiete p. M.", "Nicht umlagefähige Kosten p. M.",
      "Gebäudeanteil", "Lineare AfA p. a.", "davon Erhaltungsaufwand",
      "Verteilung des Aufwands", "Energieausweis", "Anteil der Einheit an der Rücklage",
      "Letzte Sanierungen",
    ]);
  });

  it("übernimmt die Objektunterlagen, ohne sie in die Rechnung einzubauen", () => {
    expect(v.unterlagen).toMatchObject({
      energyClass: "D",
      energyValue: 121,
      certificateType: "Verbrauchsausweis",
      energyCarrier: "Gas",
      certificateValidUntil: "31.12.2030",
      reserveUnitShare: 3200,
      renovations: ["2024 · Heizung"],
    });
  });

  it("nennt die Vorgaben, die nicht am Objekt hängen", () => {
    expect(feldnamen(v.annahmen)).toContain("Sollzins p. a.");
    expect(feldnamen(v.annahmen)).toContain("Wertsteigerung p. a.");
  });
});

describe("Vorbelegung ohne gepflegte Daten", () => {
  const v = vorbelegungAusEinheit(leer, leer.wohnungen[0], heute);

  it("rät nichts und meldet jede fehlende Angabe", () => {
    expect(v.eingabe.purchasePrice).toBe(0);
    expect(v.eingabe.monthlyColdRent).toBe(0);
    expect(v.eingabe.monthlyOperatingCosts).toBe(0);
    expect(v.eingabe.rehabExpense).toBe(0);
    expect(feldnamen(v.luecken)).toEqual([
      "Kaufpreis", "Wohnfläche", "Zimmer", "Baujahr", "Bundesland des Objekts",
      "Kaltmiete p. M.", "Nicht umlagefähige Kosten p. M.", "Gebäudeanteil", "Lineare AfA p. a.",
      "Energieeffizienzklasse", "Kundenname", "zvE Kunde", "Eigenkapital",
    ]);
  });

  it("behält ohne Kaufpreisaufteilung und ohne AfA-Satz die Vorgaben des Rechners", () => {
    expect(v.eingabe.buildingShare).toBe(standardEingabe.buildingShare);
    // Ohne Baujahr gilt der Regelsatz nach § 7 Abs. 4 EStG.
    expect(v.eingabe.buildingDepreciationRate).toBe(2);
    expect(v.knk).toEqual({ weg: "bundesland", bundesland: "" });
  });
});

describe("Am Objekt gepflegter Kaufnebenkostensatz", () => {
  it("geht vor und wird in Grunderwerbsteuer, Notar und Grundbuch zerlegt", () => {
    const mitSatz = { ...objekt, meta: { ...objekt.meta, kaufnebenkostenPct: 9.5 } } as ObjektData;
    const v = vorbelegungAusEinheit(mitSatz, w, heute);
    expect(v.knk.weg).toBe("manuell");
    expect(v.eingabe.transferTaxRate).toBe(8);
    expect(v.eingabe.notaryRate).toBe(1);
    expect(v.eingabe.landRegisterRate).toBe(0.5);
    // Die Summe muss dem gepflegten Satz entsprechen, sonst rechnet der Reiter
    // andere Nebenkosten als die Kachel auf derselben Seite.
    expect(v.eingabe.transferTaxRate + v.eingabe.notaryRate + v.eingabe.landRegisterRate).toBeCloseTo(9.5, 6);
  });

  /*
   * Der Satz aus dem Anlageassistenten.
   *
   * Er wird dort als Pflichtfeld abgefragt und landet in der Spalte
   * `global_kaufnebenkosten`, im Objekt gelesen als
   * `globalDaten.kaufnebenkosten`. Gelesen wurde bis 09/2026 aber nur
   * `meta.kaufnebenkostenPct`, und dieses Feld schreibt niemand. Die Eingabe
   * war damit wirkungslos, der Rechner fiel immer auf das Bundesland zurück.
   */
  it("kommt auch aus der Globalspalte des Anlageassistenten an", () => {
    const ausAssistent = {
      ...objekt,
      globalDaten: { ...objekt.globalDaten, kaufnebenkosten: 9.5 },
    } as ObjektData;
    const v = vorbelegungAusEinheit(ausAssistent, w, heute);
    expect(v.knk.weg).toBe("manuell");
    expect(v.eingabe.transferTaxRate + v.eingabe.notaryRate + v.eingabe.landRegisterRate).toBeCloseTo(9.5, 6);
  });

  it("fällt ohne gepflegten Satz weiter auf das Bundesland zurück", () => {
    // Augsburg, also Bayern: 3,5 Prozent Grunderwerbsteuer plus Notar und Grundbuch.
    const v = vorbelegungAusEinheit(objekt, w, heute);
    expect(v.knk.weg).toBe("bundesland");
    expect(v.eingabe.transferTaxRate + v.eingabe.notaryRate + v.eingabe.landRegisterRate).toBeCloseTo(5, 6);
  });
});

describe("Degressive AfA", () => {
  it("wird auf die Methode des Rechners übersetzt", () => {
    const degressiv = {
      ...objekt,
      afaDaten: { afaModell: "degressiv" as const, afaSatz: 5, restnutzungsdauer: 40, grundstueckAnteil: 20 },
    } as ObjektData;
    const v = vorbelegungAusEinheit(degressiv, w, heute);
    expect(v.eingabe.depreciationMethod).toBe("declining");
    expect(v.eingabe.buildingDepreciationRate).toBe(5);
    expect(feldnamen(v.uebernommen)).toContain("Degressive AfA p. a.");
  });
});

describe("Bilder für den Bereich „Bilder“", () => {
  const mitBildern = {
    ...objekt,
    bildUrl: "/o/titel.jpg",
    bilder: [
      { id: "b1", url: "/o/1.jpg", alt: "", reihenfolge: 1 },
      { id: "b2", url: "/o/titel.jpg", alt: "", reihenfolge: 2 },
    ],
  } as ObjektData;

  it("nennt erst die Fotos der Einheit, dann die des Objekts mit dem Titelbild vorn", () => {
    const einheit = { ...w, bilder: [{ id: "w1", url: "/w/1.jpg", alt: "", reihenfolge: 1 }] } as ObjektWohnung;
    const v = vorbelegungAusEinheit(mitBildern, einheit, heute);
    expect(v.bilder).toEqual(["/w/1.jpg", "/o/titel.jpg", "/o/1.jpg"]);
    expect(v.uebernommen.find((u) => u.feld === "Bilder")).toMatchObject({ wert: "3 Fotos", woher: "erst Einheit, dann Objekt" });
  });

  it("zählt höchstens sechs Fotos, auch wenn mehr hinterlegt sind", () => {
    const viele = { ...w, bilder: Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, url: `/w/${i}.jpg`, alt: "", reihenfolge: i })) } as ObjektWohnung;
    const v = vorbelegungAusEinheit(mitBildern, viele, heute);
    expect(v.bilder).toHaveLength(10);
    expect(v.uebernommen.find((u) => u.feld === "Bilder")?.wert).toBe("6 Fotos");
  });

  it("führt ohne Fotos keinen Eintrag und keine Lücke", () => {
    const v = vorbelegungAusEinheit(objekt, w, heute);
    expect(v.bilder).toEqual([]);
    expect(feldnamen(v.uebernommen)).not.toContain("Bilder");
    expect(feldnamen(v.luecken)).not.toContain("Bilder");
  });
});

describe("Rückfall auf die Investagon-Rohdaten", () => {
  const ausInvestagon = {
    ...leer,
    meta: { investagonRaw: { object_building_year: "1965" } },
  } as unknown as ObjektData;

  it("nimmt das Baujahr aus den Rohdaten des Objekts, wenn keines gepflegt ist", () => {
    const v = vorbelegungAusEinheit(ausInvestagon, leer.wohnungen[0], heute);
    expect(v.eingabe.constructionYear).toBe(1965);
    expect(v.uebernommen.find((u) => u.feld === "Baujahr")?.woher).toBe("Investagon-Daten");
    expect(feldnamen(v.luecken)).not.toContain("Baujahr");
    expect(v.herkunft.constructionYear?.quelle).toBe("objekt");
  });

  it("nimmt das Baujahr auch aus den Rohdaten der Einheit und verwirft unplausible Jahre", () => {
    const einheit = { ...leer.wohnungen[0], investagonRaw: { object_building_year: 1998 } } as ObjektWohnung;
    const objektMitNull = { ...leer, meta: { investagonRaw: { object_building_year: 0 } } } as unknown as ObjektData;
    expect(vorbelegungAusEinheit(objektMitNull, einheit, heute).eingabe.constructionYear).toBe(1998);
  });

  it("lässt ein gepflegtes Baujahr vor den Rohdaten stehen", () => {
    const beides = { ...objekt, meta: { ...objekt.meta, investagonRaw: { object_building_year: 1990 } } } as ObjektData;
    expect(vorbelegungAusEinheit(beides, w, heute).eingabe.constructionYear).toBe(1962);
  });

  it("nimmt die Energieeffizienzklasse aus den Merkmalen der Einheit, wenn das Objekt keine nennt", () => {
    const einheit = {
      ...leer.wohnungen[0],
      investagonRaw: { tags: ["5. Energieeffizienzklasse: c"], energy_certificate_type: "demand_certificate" },
    } as ObjektWohnung;
    const v = vorbelegungAusEinheit(leer, einheit, heute);
    expect(v.unterlagen.energyClass).toBe("C");
    expect(v.unterlagen.certificateType).toBe("Bedarfsausweis");
    expect(v.uebernommen.find((u) => u.feld === "Energieausweis")).toMatchObject({ wert: "C", woher: "Investagon-Daten der Einheit" });
    expect(feldnamen(v.luecken)).not.toContain("Energieeffizienzklasse");
  });

  it("übernimmt aus den Rohdaten nichts, was keine Effizienzklasse ist", () => {
    const einheit = { ...leer.wohnungen[0], investagonRaw: { tags: ["Energieeffizienzklasse: wird ermittelt"] } } as ObjektWohnung;
    const v = vorbelegungAusEinheit(leer, einheit, heute);
    expect(v.unterlagen.energyClass).toBe("");
    expect(feldnamen(v.luecken)).toContain("Energieeffizienzklasse");
  });
});

describe("Mietverwaltung", () => {
  it("kommt zu den nicht umlagefähigen Kosten dazu", () => {
    const mitSev = {
      ...objekt,
      wohnungen: [{ ...w, verwaltungSevMonat: 25 } as ObjektWohnung],
    } as ObjektData;
    const v = vorbelegungAusEinheit(mitSev, mitSev.wohnungen[0], heute);
    expect(v.eingabe.monthlyOperatingCosts).toBe(70);
  });
});

/*
 * Rechenwerte aus Investagon, seit dem 25.09.2026, am Beispiel Sigmundstraße
 * 2, Nürnberg, Einheit 6b. „Vorher“ ist der Stand im CRM am 25.09.2026,
 * „nachher“ der Stand nach dem nächsten Importlauf.
 */
describe("Rechenwerte aus Investagon: Sigmundstraße 2, Einheit 6b", () => {
  const einheitVorher = {
    id: "6b", weNr: "6b", etage: "", lage: "", groesse: 70, zimmer: 4, mieteGesamt: 1650, vkGesamt: 358900,
    qmPreis: 0, rendite: 0, vermietet: false, status: "reserviert",
    hausgeldNichtUmlagefaehigEuro: 45, verwaltungSevMonat: 180,
  } as ObjektWohnung;
  const vorher = {
    ...objekt, titel: "Sigmundstraße 2, Nürnberg", adresse: "Sigmundstraße 2", plz: "90429", ort: "Nürnberg",
    sanierungskosten: 0, erhaltungsaufwandJahre: 1,
    afaDaten: { afaModell: "linear", afaSatz: 2, restnutzungsdauer: 50, grundstueckAnteil: 20 },
    globalDaten: { baujahr: 1963 } as ObjektData["globalDaten"],
    wohnungen: [einheitVorher],
  } as ObjektData;
  const einheitNachher = {
    ...einheitVorher,
    sanierungAnteilBetrag: 35000,
    ruecklageZufuehrungMonat: 90,
    moebelNutzungsdauerJahre: 10,
  } as ObjektWohnung;
  const nachher = {
    ...vorher,
    sanierungskosten: 35000,
    afaDaten: { afaModell: "linear", afaSatz: 3.5, restnutzungsdauer: 50, grundstueckAnteil: 18 },
    wohnungen: [einheitNachher],
  } as ObjektData;

  it("rechnet vorher mit 2 % AfA, 80 % Gebäude, ohne Erhaltungsaufwand und ohne Rücklage", () => {
    const v = vorbelegungAusEinheit(vorher, einheitVorher, heute);
    expect(v.eingabe.buildingDepreciationRate).toBe(2);
    expect(v.eingabe.buildingShare).toBe(80);
    expect(v.eingabe.rehabExpense).toBe(0);
    expect(v.eingabe.monthlyOperatingCosts).toBe(225);
    expect(v.eingabe.monthlyReserveContribution).toBe(0);
  });

  it("übernimmt nachher AfA, Gebäudeanteil, Erhaltungsaufwand und die Kostenteile", () => {
    const v = vorbelegungAusEinheit(nachher, einheitNachher, heute);
    expect(v.eingabe.buildingDepreciationRate).toBe(3.5);
    expect(v.eingabe.depreciationMethod).toBe("linear");
    expect(v.eingabe.buildingShare).toBe(82);
    expect(v.eingabe.rehabExpense).toBe(35000);
    expect(v.eingabe.rehabMode).toBe("expense");
    expect(v.eingabe.rehabDistributionYears).toBe(1);
    // Nicht umlagefähig 45 plus SEV 180, die Rücklage 90 im eigenen Feld.
    expect(v.eingabe.monthlyOperatingCosts).toBe(225);
    expect(v.eingabe.monthlyReserveContribution).toBe(90);
    expect(v.eingabe.furnitureDepreciationYears).toBe(10);
    expect(v.herkunft.monthlyReserveContribution?.quelle).toBe("objekt");
    expect(feldnamen(v.uebernommen)).toEqual(
      expect.arrayContaining(["Zuführung Instandhaltungsrücklage p. M.", "Nutzungsdauer Möbel"]),
    );
  });

  it("nimmt den Finanzierungssatz der Einheit, sonst den Standard als benannte Annahme", () => {
    const ohne = vorbelegungAusEinheit(nachher, einheitNachher, heute);
    expect(ohne.eingabe.financingCostRate).toBe(0.2);
    expect(feldnamen(ohne.annahmen)).toContain("Finanzierungsnebenkosten");

    const mitSatz = { ...einheitNachher, finanzierungsnebenkostenSatz: 0.3 } as ObjektWohnung;
    const mit = vorbelegungAusEinheit(nachher, mitSatz, heute);
    expect(mit.eingabe.financingCostRate).toBe(0.3);
    expect(feldnamen(mit.annahmen)).not.toContain("Finanzierungsnebenkosten");
    expect(feldnamen(mit.uebernommen)).toContain("Finanzierungsnebenkosten");
  });

  it("lässt ohne Investagon-Werte die bisherigen Rückfälle stehen", () => {
    const v = vorbelegungAusEinheit(objekt, w, heute);
    expect(v.eingabe.monthlyReserveContribution).toBe(0);
    expect(v.eingabe.furnitureDepreciationYears).toBe(standardEingabe.furnitureDepreciationYears);
    expect(v.eingabe.financingCostRate).toBe(standardEingabe.financingCostRate);
  });
});

describe("KfW-Programm aus Investagon, seit dem 07.10.2026", () => {
  it("übernimmt nur den Programmnamen und lässt den Schalter aus", () => {
    const mitProgramm = { ...objekt, meta: { ...objekt.meta, investagonRaw: { m3_program: "KfW Klimafreundlicher Neubau" } } } as ObjektData;
    const v = vorbelegungAusEinheit(mitProgramm, w, heute);
    expect(v.eingabe.kfwProgram).toBe("KfW Klimafreundlicher Neubau");
    expect(v.eingabe.kfwEnabled).toBe(false);
    expect(v.eingabe.kfwLoanAmount).toBe(0);
    expect(feldnamen(v.uebernommen)).toContain("KfW-Programm");
    expect(v.herkunft.kfwProgram?.quelle).toBe("objekt");
  });

  it("übernimmt eine Förderangabe ohne KfW nicht", () => {
    const sonstiges = { ...objekt, meta: { ...objekt.meta, investagonRaw: { funding: "Landesförderung" } } } as ObjektData;
    expect(vorbelegungAusEinheit(sonstiges, w, heute).eingabe.kfwProgram).toBe("");
    expect(vorbelegungAusEinheit(objekt, w, heute).eingabe.kfwProgram).toBe("");
  });
});

describe("Vorbelegung im All-inclusive-Modell (09.10.2026)", () => {
  const v = vorbelegungAusEinheit(objekt, w, heute, { allInclusive: true });

  it("schlägt 0 Eigenkapital vor, weil die Kaufnebenkosten im Kaufpreis stecken", () => {
    expect(v.eingabe.allInclusive).toBe(true);
    expect(v.eingabe.equity).toBe(0);
    const eintrag = v.uebernommen.find((u) => u.feld === "Eigenkapital");
    expect(eintrag?.wert).toMatch(/^0\s€$/);
    expect(eintrag?.woher).toMatch(/All-inclusive.*im Kaufpreis enthalten/);
  });

  it("meldet kein fehlendes Eigenkapital", () => {
    expect(feldnamen(v.luecken)).not.toContain("Eigenkapital");
    // Ohne Kaufpreis und Sätze ebenso nicht: 0 ist im Modell die Regel.
    const ohneDaten = vorbelegungAusEinheit(leer, leer.wohnungen[0], heute, { allInclusive: true });
    expect(feldnamen(ohneDaten.luecken)).not.toContain("Eigenkapital");
  });

  it("bleibt ohne die Option beim normalen Modell", () => {
    const normal = vorbelegungAusEinheit(objekt, w, heute);
    expect(normal.eingabe.allInclusive).toBe(false);
    expect(normal.eingabe.equity).toBeGreaterThan(0);
  });

  it("kennzeichnet das Eigenkapital nach der Regel, damit der Schalter es erkennt", () => {
    // Mit Erhaltungsaufwand (ausführlicher Satz) und ohne (kurzer Satz).
    expect(eigenkapitalNachRegel(vorbelegungAusEinheit(objekt, w, heute).herkunft)).toBe(true);
    const ohneAufwand = { ...objekt, sanierungskosten: 0 } as ObjektData;
    const kurz = vorbelegungAusEinheit(ohneAufwand, { ...w, sanierungAnteilProzent: 0 }, heute);
    expect(kurz.eingabe.rehabExpense).toBe(0);
    expect(eigenkapitalNachRegel(kurz.herkunft)).toBe(true);
    expect(eigenkapitalNachRegel({ equity: { quelle: "eigen", text: "" } })).toBe(false);
    expect(eigenkapitalNachRegel(undefined)).toBe(false);
  });
});
