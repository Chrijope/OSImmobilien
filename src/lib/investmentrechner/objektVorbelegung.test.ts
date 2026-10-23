import { describe, expect, it } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { berechneInvestment, standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { stellplatzmieteTrennen, vorbelegungAusEinheit } from "@/lib/investmentrechner/objektVorbelegung";

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
  beschreibung: "", bildUrl: "", bilder: [], dokumente: [],
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

  it("übernimmt Kaufpreis samt Stellplatz, Wohnungs- und Stellplatzmiete getrennt", () => {
    // Der Kaufpreis bleibt Wohnung plus Stellplatz, der Stellplatz steht seit
    // dem 22.10.2026 zusätzlich als „davon“. Die Miete ist getrennt: 790 € die
    // Wohnung, 40 € der Stellplatz, zusammen wie vorher 830 €.
    expect(v.eingabe.purchasePrice).toBe(241500);
    expect(v.eingabe.furniturePrice).toBe(0);
    expect(v.eingabe.garagePrice).toBe(9500);
    expect(v.eingabe.monthlyColdRent).toBe(790);
    expect(v.eingabe.monthlyGarageRent).toBe(40);
    expect(v.herkunft.monthlyGarageRent?.quelle).toBe("objekt");
  });

  it("trennt eine gespeicherte Kaltmiete samt Stellplatz genau einmal", () => {
    const alt = {
      ...v.eingabe, monthlyColdRent: 830, monthlyGarageRent: 0, garagePrice: 0,
    };
    const herkunftAlt = { monthlyColdRent: { quelle: "objekt" as const, text: "Aus der Objektanlage, Einheit, inklusive Stellplatzmiete" } };
    const einmal = stellplatzmieteTrennen(alt, herkunftAlt, v);
    expect(einmal.getrennt).toBe(true);
    expect(einmal.eingabe.monthlyColdRent).toBe(790);
    expect(einmal.eingabe.monthlyGarageRent).toBe(40);
    expect(einmal.eingabe.garagePrice).toBe(9500);
    // Gerechnet wird gleich, nur der Ausweis der Wohnungsrendite ändert sich.
    expect(berechneInvestment(einmal.eingabe).years).toEqual(berechneInvestment(alt).years);
    // Ein zweiter Lauf ändert nichts mehr: keine doppelte Garage.
    const zweimal = stellplatzmieteTrennen(einmal.eingabe, einmal.herkunft, v);
    expect(zweimal.getrennt).toBe(false);
    expect(zweimal.eingabe).toEqual(einmal.eingabe);
  });

  it("lässt eine von Hand geänderte oder schon getrennte Miete stehen", () => {
    const alt = { ...v.eingabe, monthlyColdRent: 830, monthlyGarageRent: 0 };
    expect(stellplatzmieteTrennen(alt, { monthlyColdRent: { quelle: "eigen", text: "" } }, v).getrennt).toBe(false);
    const herkunftAlt = { monthlyColdRent: { quelle: "objekt" as const, text: "Aus der Objektanlage, Einheit, inklusive Stellplatzmiete" } };
    expect(stellplatzmieteTrennen({ ...alt, monthlyGarageRent: 40 }, herkunftAlt, v).getrennt).toBe(false);
    expect(stellplatzmieteTrennen(alt, herkunftAlt, null).getrennt).toBe(false);
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
    expect(v.eingabe.notaryRate).toBe(1.5);
    expect(v.eingabe.landRegisterRate).toBe(0.5);
    // Makler fällt bei uns nicht beim Käufer an.
    expect(v.eingabe.brokerRate).toBe(0);
  });

  it("nimmt als laufende Kosten nur den nicht umlagefähigen Anteil", () => {
    expect(v.eingabe.monthlyOperatingCosts + v.eingabe.housingFeeNonRecoverable).toBe(45);
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
    expect(feldnamen(v.luecken)).toEqual(["Kundenname", "Zu versteuerndes Einkommen"]);
    expect(v.luecken.every((l) => l.quelle === "kunde")).toBe(true);
    // Kundenzahlen bleiben leer, sie stehen nicht am Objekt.
    expect(v.eingabe.clientName).toBe("");
    expect(v.eingabe.taxableIncomeCustomer).toBe(0);
  });

  it("finanziert den Kaufpreis über die Bank, das Eigenkapital trägt die Kaufnebenkosten (seit dem 23.10.2026 als Rest)", () => {
    const satz = v.eingabe.transferTaxRate + v.eingabe.notaryRate + v.eingabe.landRegisterRate
      + v.eingabe.brokerRate + v.eingabe.otherPurchaseCostRate;
    expect(satz).toBeGreaterThan(0);
    expect(v.eingabe.seniorLoanMode).toBe("percent");
    expect(v.eingabe.seniorLoanValue).toBe(100);
    // Die Kaufnebenkosten laufen ohne Erhaltungsaufwand, genau wie im Rechenkern.
    expect(v.eingabe.rehabExpense).toBeGreaterThan(0);
    const r = berechneInvestment(v.eingabe);
    expect(r.eigenkapital).toBeCloseTo(((v.eingabe.purchasePrice - v.eingabe.rehabExpense) * satz) / 100, 6);
    expect(r.eigenkapital).toBeCloseTo(r.purchaseCosts, 6);
    expect(v.annahmen.find((a) => a.feld === "Bankdarlehen")?.wert).toMatch(/100 %.*Eigenkapital in Höhe der Kaufnebenkosten/);
  });

  it("zählt auf, was übernommen wurde", () => {
    expect(feldnamen(v.uebernommen)).toEqual([
      "Objektbezeichnung", "Adresse", "Objekttyp", "Kaufpreis", "davon Stellplatz/Garage", "Wohnfläche", "Zimmer",
      "Baujahr", "Kaufnebenkosten", "Stellplatz-/Garagenmiete p. M.", "Kaltmiete p. M.", "Hausgeld gesamt p. M.", "Nicht umlagefähige Kosten p. M.",
      "Gebäudeanteil", "Lineare AfA p. a.", "davon Erhaltungsaufwand",
      "Verteilung des Aufwands", "Anteil der Einheit an der Rücklage",
      "Letzte Sanierungen",
    ]);
  });

  it("übernimmt die Objektunterlagen ohne Energieausweis, ohne sie in die Rechnung einzubauen", () => {
    expect(v.unterlagen).toMatchObject({
      reserveUnitShare: 3200,
      renovations: ["2024 · Heizung"],
    });
    expect(v.unterlagen).not.toHaveProperty("energyClass");
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
    expect(v.eingabe.monthlyOperatingCosts + v.eingabe.housingFeeNonRecoverable).toBe(0);
    expect(v.eingabe.rehabExpense).toBe(0);
    expect(feldnamen(v.luecken)).toEqual([
      "Kaufpreis", "Wohnfläche", "Zimmer", "Baujahr", "Bundesland des Objekts",
      "Kaltmiete p. M.", "Nicht umlagefähige Kosten p. M.", "Gebäudeanteil", "Lineare AfA p. a.",
      "Kundenname", "Zu versteuerndes Einkommen",
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
    expect(v.eingabe.transferTaxRate).toBe(7.5);
    expect(v.eingabe.notaryRate).toBe(1.5);
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
    expect(v.eingabe.transferTaxRate + v.eingabe.notaryRate + v.eingabe.landRegisterRate).toBeCloseTo(5.5, 6);
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

  it("übernimmt den Energieausweis seit dem 23.10.2026 nicht mehr und meldet ihn nicht als Lücke", () => {
    const einheit = {
      ...leer.wohnungen[0],
      investagonRaw: { tags: ["5. Energieeffizienzklasse: c"], energy_certificate_type: "demand_certificate" },
    } as ObjektWohnung;
    const v = vorbelegungAusEinheit(leer, einheit, heute);
    expect(v.unterlagen).not.toHaveProperty("energyClass");
    expect(feldnamen(v.uebernommen)).not.toContain("Energieausweis");
    expect(feldnamen(v.luecken)).not.toContain("Energieeffizienzklasse");
  });
});

/*
 * Hausgeld, Prüfung vom 22.10.2026: umlagefähig zahlt der Mieter und belastet
 * den Cashflow nicht, nicht umlagefähig schon, die Rücklage im Cashflow ja,
 * steuerlich nicht. Ist nur das Hausgeld gesamt bekannt, wird geschätzt und
 * das genannt.
 */
describe("Hausgeld in der Vorbelegung", () => {
  const mit = (einheit: Partial<ObjektWohnung>) => {
    const wohnung = { ...w, hausgeldNichtUmlagefaehigEuro: undefined, ...einheit } as ObjektWohnung;
    return vorbelegungAusEinheit({ ...objekt, wohnungen: [wohnung] }, wohnung, heute);
  };

  it("nimmt die drei Teile getrennt: nur nicht umlagefähig in die Kosten, die Rücklage ins eigene Feld", () => {
    const v = mit({ hausgeldUmlagefaehigEuro: 150, hausgeldNichtUmlagefaehigEuro: 45, ruecklageZufuehrungMonat: 90 });
    expect(v.eingabe.monthlyOperatingCosts + v.eingabe.housingFeeNonRecoverable).toBe(45);
    expect(v.eingabe.monthlyReserveContribution).toBe(90);
    expect(feldnamen(v.luecken)).not.toContain("Nicht umlagefähiges Hausgeld (nur geschätzt)");
    // Die Rücklage mindert den Cashflow, aber nicht das steuerliche Ergebnis.
    const r = berechneInvestment(v.eingabe);
    const ohneRuecklage = berechneInvestment({ ...v.eingabe, monthlyReserveContribution: 0 });
    expect(ohneRuecklage.years[1].cashflowBeforeTax - r.years[1].cashflowBeforeTax).toBeCloseTo(90 * 12 * 1.02, 6);
    expect(r.years[1].taxableResult).toBeCloseTo(ohneRuecklage.years[1].taxableResult, 6);
  });

  it("liest den nicht umlagefähigen Anteil auch aus den Investagon-Rohdaten statt zu schätzen", () => {
    const v = mit({ hausgeldMonat: 300, investagonRaw: { operation_cost_landlord_apartment: 52, operation_cost_reserve_apartment: 70 } } as Partial<ObjektWohnung>);
    expect(v.eingabe.monthlyOperatingCosts + v.eingabe.housingFeeNonRecoverable).toBe(52);
    expect(v.eingabe.monthlyReserveContribution).toBe(70);
  });

  it("nur Hausgeld gesamt: geschätzt, ohne die Rücklage doppelt zu zählen, und als Lücke gemeldet", () => {
    const nurGesamt = mit({ hausgeldMonat: 300 } as Partial<ObjektWohnung>);
    expect(nurGesamt.eingabe.monthlyOperatingCosts + nurGesamt.eingabe.housingFeeNonRecoverable).toBe(90);
    expect(feldnamen(nurGesamt.luecken)).toContain("Nicht umlagefähiges Hausgeld (nur geschätzt)");
    expect(nurGesamt.uebernommen.find((u) => u.feld === "Nicht umlagefähige Kosten p. M.")?.woher).toMatch(/geschätzt/);
    const mitRuecklage = mit({ hausgeldMonat: 300, ruecklageZufuehrungMonat: 100 } as Partial<ObjektWohnung>);
    // 30 % von 300 − 100, die Rücklage steht im eigenen Feld.
    expect(mitRuecklage.eingabe.monthlyOperatingCosts + mitRuecklage.eingabe.housingFeeNonRecoverable).toBe(60);
    expect(mitRuecklage.eingabe.monthlyReserveContribution).toBe(100);
  });
});

describe("Mietverwaltung", () => {
  it("kommt zu den nicht umlagefähigen Kosten dazu", () => {
    const mitSev = {
      ...objekt,
      wohnungen: [{ ...w, verwaltungSevMonat: 25 } as ObjektWohnung],
    } as ObjektData;
    const v = vorbelegungAusEinheit(mitSev, mitSev.wohnungen[0], heute);
    expect(v.eingabe.monthlyOperatingCosts + v.eingabe.housingFeeNonRecoverable).toBe(70);
    // Seit dem 22.10.2026 getrennt: Hausgeld nicht umlagefähig und die Mietverwaltung als weitere Kosten.
    expect(v.eingabe.housingFeeNonRecoverable).toBe(45);
    expect(v.eingabe.monthlyOperatingCosts).toBe(25);
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
    expect(v.eingabe.monthlyOperatingCosts + v.eingabe.housingFeeNonRecoverable).toBe(225);
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
    expect(v.eingabe.monthlyOperatingCosts + v.eingabe.housingFeeNonRecoverable).toBe(225);
    expect(v.eingabe.monthlyReserveContribution).toBe(90);
    expect(v.eingabe.furnitureDepreciationYears).toBe(10);
    expect(v.herkunft.monthlyReserveContribution?.quelle).toBe("objekt");
    expect(feldnamen(v.uebernommen)).toEqual(
      expect.arrayContaining(["davon Instandhaltungsrücklage p. M.", "Nutzungsdauer Möbel"]),
    );
  });

  it("übernimmt seit dem 23.10.2026 keinen Finanzierungsnebenkostensatz mehr", () => {
    const mitSatz = { ...einheitNachher, finanzierungsnebenkostenSatz: 0.3 } as ObjektWohnung;
    const mit = vorbelegungAusEinheit(nachher, mitSatz, heute);
    expect(mit.eingabe).not.toHaveProperty("financingCostRate");
    expect(feldnamen(mit.annahmen)).not.toContain("Finanzierungsnebenkosten");
    expect(feldnamen(mit.uebernommen)).not.toContain("Finanzierungsnebenkosten");
  });

  it("lässt ohne Investagon-Werte die bisherigen Rückfälle stehen", () => {
    const v = vorbelegungAusEinheit(objekt, w, heute);
    expect(v.eingabe.monthlyReserveContribution).toBe(0);
    expect(v.eingabe.furnitureDepreciationYears).toBe(standardEingabe.furnitureDepreciationYears);
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

  it("rechnet mit 0 Eigenkapital, weil die Bank den Kaufpreis samt Kaufnebenkosten finanziert", () => {
    expect(v.eingabe.allInclusive).toBe(true);
    expect(berechneInvestment(v.eingabe).eigenkapital).toBeCloseTo(0, 6);
    expect(v.annahmen.find((a) => a.feld === "Bankdarlehen")?.wert).toMatch(/All-inclusive/);
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
    expect(berechneInvestment(normal.eingabe).eigenkapital).toBeGreaterThan(0);
  });
});
