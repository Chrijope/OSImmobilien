import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ObjektDaten } from "@/lib/objektDatenPflicht";

/**
 * Der Verlauf der Objektauswahl.
 *
 * Wird an einem Investment ein anderes Objekt eingetragen, verschwand das
 * bisherige bis jetzt spurlos: Der Datensatz wird überschrieben, und niemand
 * konnte später nachsehen, auf welcher Wohnung der Kunde vorher saß.
 *
 * Geprüft wird deshalb dreierlei: dass ein Wechsel einen Eintrag erzeugt, dass
 * eine bloße Korrektur am selben Objekt keinen erzeugt, und dass der Verlauf
 * nicht über seine Grenze hinauswächst.
 */

const investment: Record<string, any> = {};
const metaFelder: Record<string, any> = {};

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (investment.id === id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: any) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, any>) => {
    Object.assign(metaFelder, felder);
  },
  updateInvestment: (_id: string, felder: Record<string, any>) => { Object.assign(investment, felder); },
  getInvestmentsByKontakt: () => [],
}));

vi.mock("@/lib/objekteStore", () => ({ getWohnungKurz: () => null }));

const {
  speichereObjektDaten, objektVerlauf, istAnderesObjekt, objektBezeichnung,
  objektBereitsEingetragen, reservierungStandFuerWechsel, OBJEKT_VERLAUF_MAX,
  objektInVerlaufVerschieben, objektEingetragenAm, weNrAnzeige, weNrIstZahl,
} = await import("@/lib/objektDatenPflicht");

/** Ein Objekt mit den fünf Pflichtangaben. */
const objekt = (
  strasse: string, plz: string, ort: string, weNr: string, kaufpreis: number,
): ObjektDaten => ({ strasse, plz, ort, weNr, kaufpreis });

const ERSTES = objekt("Roonstraße 3", "95028", "Hof", "6", 189000);
const ZWEITES = objekt("Musterweg 9", "12345", "Andernorts", "2", 210000);

beforeEach(() => {
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
  for (const k of Object.keys(investment)) delete investment[k];
  Object.assign(investment, { id: "inv-1", kontaktId: "k-1", pipelineStufe: "beratungsgespraech" });
});

describe("Ein bestehendes Investment hat keinen Verlauf", () => {
  it("liefert eine leere Liste, solange nie gewechselt wurde", () => {
    expect(objektVerlauf("inv-1")).toEqual([]);
    speichereObjektDaten("inv-1", ERSTES);
    expect(objektVerlauf("inv-1")).toEqual([]);
    // Der Schlüssel wird gar nicht erst angelegt.
    expect(metaFelder.objektVerlauf).toBeUndefined();
  });

  it("verträgt einen unbrauchbaren Datensatz, ohne etwas umzuwerfen", () => {
    metaFelder.objektVerlauf = "kaputt";
    expect(objektVerlauf("inv-1")).toEqual([]);
    metaFelder.objektVerlauf = [null, 7, {}, { strasse: "Altweg 1", gewechseltAm: "2026-09-01T10:00:00.000Z" }];
    expect(objektVerlauf("inv-1")).toHaveLength(1);
    expect(objektVerlauf("inv-1")[0].strasse).toBe("Altweg 1");
  });

  it("fragt ohne Kennung gar nicht erst nach", () => {
    expect(objektVerlauf(null)).toEqual([]);
    expect(objektBereitsEingetragen(null)).toBe(false);
  });
});

describe("Ein Wechsel legt das bisherige Objekt in den Verlauf", () => {
  beforeEach(() => {
    speichereObjektDaten("inv-1", ERSTES);
    speichereObjektDaten("inv-1", ZWEITES, { gewechseltVon: "Christian Peetz" });
  });

  it("merkt sich Adresse, Einheit und Kaufpreis des alten Objekts", () => {
    const verlauf = objektVerlauf("inv-1");
    expect(verlauf).toHaveLength(1);
    expect(verlauf[0].strasse).toBe("Roonstraße 3");
    expect(verlauf[0].plz).toBe("95028");
    expect(verlauf[0].ort).toBe("Hof");
    expect(verlauf[0].weNr).toBe("6");
    expect(verlauf[0].kaufpreis).toBe(189000);
  });

  it("hält fest, wann und von wem gewechselt wurde", () => {
    const [eintrag] = objektVerlauf("inv-1");
    expect(eintrag.gewechseltVon).toBe("Christian Peetz");
    expect(Number.isNaN(Date.parse(eintrag.gewechseltAm))).toBe(false);
  });

  it("merkt sich von wann bis wann das alte Objekt ausgewählt war", () => {
    const [eintrag] = objektVerlauf("inv-1");
    // Das "von" ist der Zeitpunkt, an dem das erste Objekt eingetragen wurde,
    // das "bis" der Wechsel. Ohne beides ist der Zeitraum keiner.
    expect(Number.isNaN(Date.parse(eintrag.eingetragenAm || ""))).toBe(false);
    expect(Date.parse(eintrag.eingetragenAm!)).toBeLessThanOrEqual(Date.parse(eintrag.gewechseltAm));
  });

  it("gibt dem neuen Objekt ein eigenes von", () => {
    const [eintrag] = objektVerlauf("inv-1");
    const seit = objektEingetragenAm("inv-1");
    expect(seit).not.toBe("");
    // Das aktuelle Objekt steht seit dem Wechsel da, nicht seit dem alten "von".
    expect(Date.parse(seit)).toBeGreaterThanOrEqual(Date.parse(eintrag.gewechseltAm));
  });

  it("lässt oben das neue Objekt stehen", () => {
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Musterweg 9");
    expect(metaFelder.rvVirtualWohnung.weNr).toBe("2");
    expect(metaFelder.kaufpreis).toBe(210000);
  });

  it("kommt auch ohne Namen aus", () => {
    for (const k of Object.keys(metaFelder)) delete metaFelder[k];
    speichereObjektDaten("inv-1", ERSTES);
    speichereObjektDaten("inv-1", ZWEITES);
    expect(objektVerlauf("inv-1")[0].gewechseltVon).toBeUndefined();
  });
});

describe("Eine Korrektur am selben Objekt ist kein Wechsel", () => {
  it("erzeugt bei einem geänderten Kaufpreis keinen Eintrag", () => {
    speichereObjektDaten("inv-1", ERSTES);
    speichereObjektDaten("inv-1", { ...ERSTES, kaufpreis: 195000 });
    expect(objektVerlauf("inv-1")).toEqual([]);
  });

  it("erzeugt bei nachgetragenen Kennzahlen keinen Eintrag", () => {
    speichereObjektDaten("inv-1", ERSTES);
    speichereObjektDaten("inv-1", { ...ERSTES, miete: 620, hausgeld: 185, zimmer: 2 });
    expect(objektVerlauf("inv-1")).toEqual([]);
  });

  it("wertet eine nachgetragene PLZ als Ergänzung, nicht als Wechsel", () => {
    // Die PLZ ist erst seit 09/2026 Pflicht. Altvorgänge haben sie nicht.
    speichereObjektDaten("inv-1", objekt("Roonstraße 3", "", "Hof", "6", 189000));
    speichereObjektDaten("inv-1", ERSTES);
    expect(objektVerlauf("inv-1")).toEqual([]);
  });

  it("stört sich nicht an Groß- und Kleinschreibung oder doppelten Leerzeichen", () => {
    speichereObjektDaten("inv-1", ERSTES);
    speichereObjektDaten("inv-1", objekt("  Roonstraße   3 ", "95028", "  HOF ", "6", 189000));
    expect(objektVerlauf("inv-1")).toEqual([]);
  });
});

/**
 * Das „von“ der Zeitachse.
 *
 * Bis 09/2026 wurde nur der Wechsel gemerkt, also das Ende. Wie lange ein
 * Objekt ausgewählt war, ließ sich daraus nicht ablesen. Geprüft wird deshalb,
 * dass der Zeitpunkt beim Eintragen entsteht, eine Korrektur ihn in Ruhe lässt
 * und ein Altvorgang ohne ihn nichts erfindet.
 */
describe("Seit wann das Objekt eingetragen ist", () => {
  it("entsteht beim ersten Eintragen", () => {
    expect(objektEingetragenAm("inv-1")).toBe("");
    speichereObjektDaten("inv-1", ERSTES);
    expect(Number.isNaN(Date.parse(objektEingetragenAm("inv-1")))).toBe(false);
  });

  it("bleibt bei einer Korrektur am selben Objekt stehen", () => {
    speichereObjektDaten("inv-1", ERSTES);
    const zuerst = objektEingetragenAm("inv-1");
    speichereObjektDaten("inv-1", { ...ERSTES, hausgeld: 185, miete: 620 });
    // Ein nachgetragenes Hausgeld darf nicht behaupten, das Objekt sei erst
    // heute ausgewählt worden.
    expect(objektEingetragenAm("inv-1")).toBe(zuerst);
  });

  it("erfindet für einen Altvorgang nichts", () => {
    // So sieht ein Vorgang aus, der vor 09/2026 eingetragen wurde: Objekt da,
    // Zeitpunkt nicht.
    metaFelder.rvVirtualWohnung = {
      objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof", weNr: "6", kaufpreis: 189000,
    };
    metaFelder.kaufpreis = 189000;
    expect(objektEingetragenAm("inv-1")).toBe("");
    // Eine Korrektur setzt ihn nicht nachträglich.
    speichereObjektDaten("inv-1", { ...ERSTES, hausgeld: 185 });
    expect(objektEingetragenAm("inv-1")).toBe("");
    // Und der Verlaufseintrag bleibt ohne "von", statt eines zu behaupten.
    speichereObjektDaten("inv-1", ZWEITES);
    expect(objektVerlauf("inv-1")[0].eingetragenAm).toBeUndefined();
  });

  it("wandert beim Abräumen mit in den Verlauf und bleibt nicht stehen", () => {
    speichereObjektDaten("inv-1", ERSTES);
    const zuerst = objektEingetragenAm("inv-1");
    objektInVerlaufVerschieben("inv-1");
    expect(objektVerlauf("inv-1")[0].eingetragenAm).toBe(zuerst);
    // Sonst stünde das nächste Objekt angeblich schon seit dem alten Datum da.
    expect(objektEingetragenAm("inv-1")).toBe("");
  });
});

describe("Die Wohneinheit ist eine Zahl", () => {
  it("erkennt eine reine Zahl", () => {
    expect(weNrIstZahl("6")).toBe(true);
    expect(weNrIstZahl(" 14 ")).toBe(true);
    expect(weNrIstZahl("WE 14")).toBe(false);
    expect(weNrIstZahl("2. OG links")).toBe(false);
    expect(weNrIstZahl("")).toBe(false);
    expect(weNrIstZahl(null)).toBe(false);
  });

  it("setzt das WE genau einmal davor, auch bei alten Texteinträgen", () => {
    expect(weNrAnzeige("6")).toBe("WE 6");
    expect(weNrAnzeige("WE 14")).toBe("WE 14");
    expect(weNrAnzeige("we-14")).toBe("WE 14");
    expect(weNrAnzeige("WE14")).toBe("WE 14");
    // Kein WE abschneiden, wo gar keines steht.
    expect(weNrAnzeige("Westflügel 3")).toBe("WE Westflügel 3");
    expect(weNrAnzeige("")).toBe("");
    expect(weNrAnzeige(null)).toBe("");
  });

  it("nennt ein altes Objekt im Verlauf trotzdem sauber", () => {
    expect(objektBezeichnung({ strasse: "Roonstraße 3", ort: "Hof", weNr: "WE 14" }))
      .toBe("Roonstraße 3, Hof, WE 14");
  });
});

describe("Der Verlauf wächst nicht über seine Grenze", () => {
  it("behält nur die letzten Wechsel, den jüngsten zuerst", () => {
    speichereObjektDaten("inv-1", objekt("Weg 0", "10000", "Ort 0", "0", 100000));
    for (let i = 1; i <= OBJEKT_VERLAUF_MAX + 2; i++) {
      speichereObjektDaten("inv-1", objekt(`Weg ${i}`, `1000${i}`, `Ort ${i}`, String(i), 100000 + i));
    }
    const verlauf = objektVerlauf("inv-1");
    expect(verlauf).toHaveLength(OBJEKT_VERLAUF_MAX);
    // Der zuletzt ersetzte steht oben, der älteste ist herausgefallen.
    expect(verlauf[0].strasse).toBe(`Weg ${OBJEKT_VERLAUF_MAX + 1}`);
    expect(verlauf[verlauf.length - 1].strasse).toBe(`Weg ${OBJEKT_VERLAUF_MAX - 1}`);
    expect(verlauf.some((e) => e.strasse === "Weg 0")).toBe(false);
  });

  it("schneidet auch einen zu lang gewordenen Datensatz beim Lesen ab", () => {
    metaFelder.objektVerlauf = Array.from({ length: 10 }, (_, i) => ({
      strasse: `Weg ${i}`, plz: "", ort: "", weNr: "", kaufpreis: 0,
      gewechseltAm: "2026-09-01T10:00:00.000Z",
    }));
    expect(objektVerlauf("inv-1")).toHaveLength(OBJEKT_VERLAUF_MAX);
  });
});

describe("Die Bausteine der Rückfrage", () => {
  it("erkennt ein anderes Objekt an Adresse und Einheit", () => {
    expect(istAnderesObjekt(ERSTES, ZWEITES)).toBe(true);
    expect(istAnderesObjekt(ERSTES, { ...ERSTES, weNr: "7" })).toBe(true);
    expect(istAnderesObjekt(ERSTES, { ...ERSTES, kaufpreis: 1 })).toBe(false);
    expect(istAnderesObjekt(null, ZWEITES)).toBe(false);
  });

  it("sagt, ob überhaupt ein Objekt zu ersetzen ist", () => {
    expect(objektBereitsEingetragen("inv-1")).toBe(false);
    speichereObjektDaten("inv-1", ERSTES);
    expect(objektBereitsEingetragen("inv-1")).toBe(true);
  });

  it("nennt das Objekt in einer Zeile", () => {
    expect(objektBezeichnung(ERSTES)).toBe("Roonstraße 3, 95028 Hof, WE 6");
    expect(objektBezeichnung({ strasse: "Roonstraße 3" })).toBe("Roonstraße 3");
    expect(objektBezeichnung({})).toBe("");
  });

  it("meldet eine vorhandene Reservierungsvereinbarung", () => {
    expect(reservierungStandFuerWechsel("inv-1")).toEqual({ vorhanden: false, unterschrieben: false });
    metaFelder.rvPdf = "rv-inv-1.pdf";
    expect(reservierungStandFuerWechsel("inv-1")).toEqual({ vorhanden: true, unterschrieben: false });
    metaFelder.rvSigned = true;
    expect(reservierungStandFuerWechsel("inv-1")).toEqual({ vorhanden: true, unterschrieben: true });
  });
});

/**
 * Zwei Zusagen an der Oberfläche, die sich sonst still zurückdrehen lassen,
 * weil kein Aufruf sie erzwingt. Dieselbe Bauart wie in
 * `objektauswahlEineStelle.test.ts`.
 */
describe("Die Karte zeigt den Verlauf, das Fenster fragt im Projektstil", () => {
  const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");
  const karte = lies("src/components/kunden/FreieWohnungenCard.tsx");
  const fenster = lies("src/components/kunden/ObjektDatenDialog.tsx");

  it("zeigt das vorherige Objekt unter dem aktuellen", () => {
    expect(karte).toContain("<ObjektVerlaufListe");
    expect(karte).toContain("verlauf={objektVerlauf(inv.id)}");
    expect(karte).toContain("Zeitachse der Objektauswahl");
  });

  it("sagt von wann bis wann, und beim aktuellen Objekt seit wann", () => {
    expect(karte).toContain("vom ${vonText} bis ${bisText}");
    // Ohne "von" bleibt es beim reinen "bis", statt eine halbe Klammer zu zeigen.
    expect(karte).toContain("ersetzt am ${bisText}");
    expect(karte).toContain("seit dem ${formatDatum(aktuell.seit)}");
    expect(karte).toContain("aktuell={");
  });

  it("nimmt in der Wohneinheit nur noch Ziffern an", () => {
    expect(fenster).toContain('replace(/\\D/g, "")');
    expect(fenster).toContain('inputMode="numeric"');
    expect(fenster).toContain("weNrIstZahl(weNr)");
    // Der alte Platzhalter war der Grund für "WE 14" im Feld.
    expect(fenster).not.toContain('placeholder="z. B. WE 6"');
  });

  it("fragt über den Baustein des Projekts und nicht über den Browser", () => {
    expect(fenster).toContain("Objekt wirklich ersetzen?");
    expect(fenster).toContain("<AlertDialog open={!!rueckfrage}");
    expect(fenster).not.toContain("window.confirm");
  });

  it("schreibt erst nach der Rückfrage", () => {
    // `speichern` fragt, `uebernehmen` schreibt. Nur an einer Stelle.
    expect(fenster).toContain("setRueckfrage({ alt, neu: daten })");
    expect(fenster.match(/speichereObjektDaten\(/g) || []).toHaveLength(1);
  });
});

/**
 * Der Wechsel über "Einheit wechseln".
 *
 * Der Verlauf griff bisher nur beim Ändern über das Objektfenster.
 * `handleSwitchObjekt` im Kundenprofil löschte Titel und Einheit am
 * Investment, ließ `rvVirtualWohnung` aber stehen und erzeugte keinen
 * Eintrag: Das alte Objekt verschwand spurlos und stand zugleich weiter als
 * das aktuelle in der Karte.
 */
describe("Einheit wechseln legt das Objekt in den Verlauf und räumt die Karte", () => {
  beforeEach(() => {
    speichereObjektDaten("inv-1", ERSTES);
  });

  it("merkt dieselben Angaben wie beim Ändern über das Fenster", () => {
    const gemerkt = objektInVerlaufVerschieben("inv-1", { gewechseltVon: "Christian Peetz" });
    expect(gemerkt).toBe(true);
    const [eintrag] = objektVerlauf("inv-1");
    expect(eintrag.strasse).toBe("Roonstraße 3");
    expect(eintrag.plz).toBe("95028");
    expect(eintrag.ort).toBe("Hof");
    expect(eintrag.weNr).toBe("6");
    expect(eintrag.kaufpreis).toBe(189000);
    expect(eintrag.gewechseltVon).toBe("Christian Peetz");
    expect(Number.isNaN(Date.parse(eintrag.gewechseltAm))).toBe(false);
  });

  it("räumt das alte Objekt aus der Karte, sonst stünde es doppelt da", () => {
    objektInVerlaufVerschieben("inv-1");
    expect(objektBereitsEingetragen("inv-1")).toBe(false);
    expect(metaFelder.kaufpreis).toBe(0);
    expect(metaFelder.rvVirtualWohnung).toEqual({});
    expect(metaFelder.objektVerkaeufer).toBeNull();
    expect(metaFelder.objektGrundbuch).toBeNull();
    expect(metaFelder.wohnflaeche).toBeNull();
  });

  it("setzt danach ein neues Objekt oben drüber, das alte bleibt im Verlauf", () => {
    objektInVerlaufVerschieben("inv-1", { gewechseltVon: "Christian Peetz" });
    speichereObjektDaten("inv-1", ZWEITES);
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Musterweg 9");
    // Genau ein Eintrag: Das Abräumen hat die Karte geleert, deshalb hält
    // `speichereObjektDaten` den Vorgang nicht für einen zweiten Wechsel.
    const verlauf = objektVerlauf("inv-1");
    expect(verlauf).toHaveLength(1);
    expect(verlauf[0].strasse).toBe("Roonstraße 3");
  });

  it("kommt ohne Namen aus und wächst nicht über seine Grenze", () => {
    objektInVerlaufVerschieben("inv-1");
    expect(objektVerlauf("inv-1")[0].gewechseltVon).toBeUndefined();
    for (let i = 1; i <= OBJEKT_VERLAUF_MAX + 1; i++) {
      speichereObjektDaten("inv-1", { ...ERSTES, weNr: String(i) });
      objektInVerlaufVerschieben("inv-1");
    }
    expect(objektVerlauf("inv-1")).toHaveLength(OBJEKT_VERLAUF_MAX);
  });

  it("merkt nichts, wenn gar kein Objekt eingetragen war", () => {
    for (const k of Object.keys(metaFelder)) delete metaFelder[k];
    // Titel und Einheit hängen am Investment, nicht in `meta`. Bleiben sie
    // stehen, gibt es sehr wohl noch etwas zu merken.
    investment.objektTitel = undefined;
    investment.weNr = undefined;
    expect(objektInVerlaufVerschieben("inv-1")).toBe(false);
    expect(objektVerlauf("inv-1")).toEqual([]);
    expect(metaFelder.objektVerlauf).toBeUndefined();
  });

  it("fragt ohne Kennung gar nicht erst nach", () => {
    expect(objektInVerlaufVerschieben("")).toBe(false);
  });
});

/**
 * Die Aufrufstelle im Kundenprofil. Ohne diese Prüfung ließe sich der
 * Verlaufseintrag beim Wechsel still wieder entfernen, denn kein Test der
 * Bibliothek würde das bemerken.
 */
describe("Das Kundenprofil merkt das Objekt, bevor es abräumt", () => {
  const seite = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");
  // Seit dem 05.10.2026 steht der Ablauf für beide Knöpfe in `reservierungAufheben.ts`.
  const ablauf = readFileSync(resolve(process.cwd(), "src/lib/reservierungAufheben.ts"), "utf8");
  const wechsel = ablauf.slice(ablauf.indexOf("export async function reservierungAufheben"));

  it("ruft den Verlauf im Objektwechsel auf, mit Person und Einheit", () => {
    expect(seite).toContain('reservierungAufhebenAusfuehren(invId, { objektId, wohnungId }, "einheit_gewechselt")');
    expect(wechsel).toContain("mittel.objektInVerlauf(e.investmentId, { gewechseltVon: e.vonName, objektId: e.objektId, wohnungId: e.wohnungId })");
    // Seit dem 06.10.2026 als Patch im einen Schreibvorgang des Aufhebens.
    expect(ablauf).toContain("objektInVerlauf: (investmentId, o) => objektVerlaufPatch(investmentId, o)");
    expect(wechsel).toContain("...verlauf,");
  });

  it("merkt vor dem Zurücksetzen des Investments, nicht danach", () => {
    expect(wechsel.indexOf("mittel.objektInVerlauf(")).toBeLessThan(wechsel.indexOf("mittel.zuruecksetzen("));
  });

  it("schreibt den Verlauf erst, wenn die Datenbank das Aufheben erlaubt hat (30.09.2026)", () => {
    const aufheben = wechsel.indexOf("await mittel.einheitFreigeben");
    const abbruch = wechsel.indexOf("if (!r.ok)");
    expect(aufheben).toBeGreaterThanOrEqual(0);
    expect(abbruch).toBeGreaterThan(aufheben);
    expect(wechsel.indexOf("mittel.objektInVerlauf(")).toBeGreaterThan(abbruch);
  });

  it("nennt den Verlauf in der Rückfrage, damit der Wechsel weniger endgültig klingt", () => {
    expect(seite).toContain("Zeitachse der Objektauswahl</strong>");
  });
});
