import { describe, it, expect } from "vitest";
import {
  KREDIT_FELDREGELN,
  KREDIT_FELD_LABEL,
  KREDITNEHMER_AUSWAHL,
  SONDERTILGUNG_AUSWAHL,
  ZINSART_AUSWAHL,
  fehlendeKreditfelder,
  immobilieOhneKreditPersonen,
  immobilienPosition,
  immobilienVerweise,
  kreditFeldStufe,
  kreditPruefung,
  kreditPruefungGesamt,
  verweiseNachLoeschen,
} from "./kreditPflichtfelder";
import { KREDIT_AUSWAHL } from "./finanzierbarkeitUtils";
import { SA_UI_EN } from "./selbstauskunftTexte";

/**
 * Die Pflichtregel für Kredite in der Selbstauskunft (Vorgabe der
 * Finanzierung, 28.09.2026). Diese Tests halten die Tabelle fest, damit eine
 * Änderung an ihr bewusst geschieht.
 */

const vollerImmobilienkredit = {
  art: "Sparkasse",
  kategorie: "immobilienkredit",
  rate: "900",
  restschuld: "180.000",
  restschuldPer: "01.09.2026",
  laufzeitEnde: "01.01.2045",
  bank: "Sparkasse",
  ursprung: "250.000",
  zinssatz: "3.1",
  zinsart: "fest",
  vertragsbeginn: "01.01.2020",
  zinsbindungBis: "01.01.2030",
  zweck: "Kauf Eigentumswohnung",
  immobilie: "0",
};

describe("Tabelle Kreditart × Feld", () => {
  it("jede Kreditart der Auswahl hat eine Regel", () => {
    for (const a of KREDIT_AUSWAHL) expect(KREDIT_FELDREGELN[a.wert], a.wert).toBeDefined();
  });

  it("Immobilienkredit: alle Felder der Bank-Ergänzung Pflicht, Sondertilgung freiwillig", () => {
    for (const feld of ["bank", "ursprung", "zinssatz", "vertragsbeginn", "zinsbindungBis", "zweck", "immobilie", "zinsart"] as const) {
      expect(kreditFeldStufe("immobilienkredit", feld), feld).toBe("P");
    }
    expect(kreditFeldStufe("immobilienkredit", "sondertilgung")).toBe("o");
  });

  it("Grundzeile: Rate, Restschuld und Stichtag immer Pflicht, Laufzeitende nicht bei Dispo und Kreditkarte", () => {
    for (const a of KREDIT_AUSWAHL) {
      expect(kreditFeldStufe(a.wert, "rate")).toBe("P");
      expect(kreditFeldStufe(a.wert, "restschuld")).toBe("P");
      expect(kreditFeldStufe(a.wert, "restschuldPer")).toBe("P");
      const offen = a.wert === "dispo" || a.wert === "kreditkarte";
      expect(kreditFeldStufe(a.wert, "laufzeitEnde"), a.wert).toBe(offen ? "o" : "P");
    }
  });

  it("Zinsart nur bei Immobilienkredit und Bauspardarlehen, Sondertilgung nur beim Immobilienkredit", () => {
    for (const a of KREDIT_AUSWAHL) {
      const immo = a.wert === "immobilienkredit" || a.wert === "bauspardarlehen";
      expect(kreditFeldStufe(a.wert, "zinsart"), a.wert).toBe(immo ? "P" : "-");
      expect(kreditFeldStufe(a.wert, "sondertilgung"), a.wert).toBe(a.wert === "immobilienkredit" ? "o" : "-");
    }
  });

  it("Leasing verlangt nur Bank und Vertragsbeginn, Ursprung und Zins passen nicht", () => {
    expect(kreditFeldStufe("kfz_leasing", "bank")).toBe("P");
    expect(kreditFeldStufe("kfz_leasing", "vertragsbeginn")).toBe("P");
    expect(kreditFeldStufe("kfz_leasing", "ursprung")).toBe("-");
    expect(kreditFeldStufe("kfz_leasing", "zinssatz")).toBe("-");
    expect(kreditFeldStufe("kfz_leasing", "immobilie")).toBe("-");
  });

  it("ohne gewählte Art ist nichts erzwungen und nichts ausgeblendet", () => {
    expect(kreditFeldStufe("", "bank")).toBe("o");
    expect(kreditFeldStufe(undefined, "zinsart")).toBe("o");
  });
});

describe("fehlendeKreditfelder", () => {
  it("ohne Art fehlt zuerst die Art, sonst greift keine Regel", () => {
    expect(fehlendeKreditfelder({ art: "VW Bank", rate: "200" }, [], false)).toEqual(["kategorie"]);
  });

  it("vollständiger Immobilienkredit: nichts fehlt", () => {
    expect(fehlendeKreditfelder(vollerImmobilienkredit, ["0"], false)).toEqual([]);
  });

  it("nur Rate, Laufzeitende und Zinssatz reichen beim Immobilienkredit nicht", () => {
    const fehlt = fehlendeKreditfelder({ kategorie: "immobilienkredit", rate: "900", laufzeitEnde: "01.01.2045", zinssatz: "3" }, ["0"], false);
    expect(fehlt).toEqual(expect.arrayContaining(["restschuld", "restschuldPer", "bank", "ursprung", "zinsart", "vertragsbeginn", "zinsbindungBis", "zweck", "immobilie"]));
    expect(fehlt).not.toContain("sondertilgung");
  });

  it("Autokredit: kein Beleihungsobjekt, kein Zweck, keine Zinsbindung erzwungen", () => {
    const fehlt = fehlendeKreditfelder({ kategorie: "kfz_finanzierung" }, ["0"], false);
    expect(fehlt).toEqual(["rate", "restschuld", "restschuldPer", "laufzeitEnde", "bank", "ursprung", "vertragsbeginn"]);
  });

  it("Kreditnehmer nur mit Person 2", () => {
    const ohne = fehlendeKreditfelder({ ...vollerImmobilienkredit }, ["0"], false);
    const mit = fehlendeKreditfelder({ ...vollerImmobilienkredit }, ["0"], true);
    expect(ohne).not.toContain("kreditnehmer");
    expect(mit).toEqual(["kreditnehmer"]);
  });

  it("Zuordnung zur Immobilie zählt nur, wenn es eine Immobilie gibt, und nur ein gültiger Verweis", () => {
    const ohneZuordnung = { ...vollerImmobilienkredit, immobilie: undefined };
    expect(fehlendeKreditfelder(ohneZuordnung, [], false)).toEqual([]);
    expect(fehlendeKreditfelder(ohneZuordnung, ["0"], false)).toEqual(["immobilie"]);
    expect(fehlendeKreditfelder({ ...vollerImmobilienkredit, immobilie: "3" }, ["0"], false)).toEqual(["immobilie"]);
    expect(fehlendeKreditfelder({ ...vollerImmobilienkredit, immobilie: "p2:0" }, ["0", "p2:0"], false)).toEqual([]);
  });

  it("eine alte Selbstauskunft ohne die neuen Felder lässt sich prüfen, ohne zu stürzen", () => {
    const alt = { art: "Baufinanzierung", rate: "1200", restschuld: "150000", laufzeitEnde: "2040", bank: "DKB" };
    expect(() => kreditPruefung([alt, {} as never], [], false)).not.toThrow();
    expect(kreditPruefung([alt], [], false).fehler).toEqual(["kredit_0_kategorie"]);
  });
});

describe("kreditPruefung", () => {
  it("meldet eine fehlende Immobilie, wenn keine zur Auswahl steht", () => {
    const r = kreditPruefung([{ ...vollerImmobilienkredit, immobilie: undefined }], [], false);
    expect(r).toEqual({ fehler: [], immobilieFehlt: true });
  });

  it("Person 2 bekommt eigene Schlüssel", () => {
    const r = kreditPruefungGesamt({
      kredite: [],
      person2: true,
      person2Data: { kredite: [{ kategorie: "dispo", rate: "50", restschuld: "800", restschuldPer: "01.09.2026", kreditnehmer: "person2" }] },
    });
    expect(r.fehler).toEqual(["p2_kredit_0_bank"]);
  });

  it("Person 2 zählt ohne Häkchen nicht mit", () => {
    const r = kreditPruefungGesamt({ kredite: [], person2: false, person2Data: { kredite: [{ kategorie: "dispo" }] } });
    expect(r.fehler).toEqual([]);
  });
});

describe("Verweise auf Immobilien beider Personen", () => {
  it("Person 1 wie bisher per Zahl, Person 2 mit Vorsatz", () => {
    const sa = { immobilien: [{}, {}], person2: true, person2Data: { immobilien: [{}] } };
    expect(immobilienVerweise(sa)).toEqual(["0", "1", "p2:0"]);
    expect(immobilienPosition("1", 2, 1)).toBe(1);
    expect(immobilienPosition("p2:0", 2, 1)).toBe(2);
    expect(immobilienPosition("p2:1", 2, 1)).toBe(-1);
    expect(immobilienPosition(undefined, 2, 1)).toBe(-1);
  });

  it("Löschen einer Immobilie verschiebt nur die Verweise derselben Person", () => {
    const kredite = [{ immobilie: "0" }, { immobilie: "1" }, { immobilie: "p2:1" }, { immobilie: "p2:0" }];
    expect(verweiseNachLoeschen(kredite, 1, 0).map((k) => k.immobilie)).toEqual([undefined, "0", "p2:1", "p2:0"]);
    expect(verweiseNachLoeschen(kredite, 2, 0).map((k) => k.immobilie)).toEqual(["0", "1", "p2:0", undefined]);
  });
});

describe("Gegenprüfung: Immobilie im Bestand ohne Kredit", () => {
  it("fragt, wenn eine Immobilie angegeben ist und kein Immobilienkredit", () => {
    expect(immobilieOhneKreditPersonen({ vermoegenswerte: [{ art: "Immobilien" }], kredite: [] })).toEqual([1]);
    expect(immobilieOhneKreditPersonen({ immobilien: [{}], kredite: [{ kategorie: "kfz_leasing" }] })).toEqual([1]);
  });

  it("fragt nicht mit Immobilienkredit, Bauspardarlehen oder altem Freitext", () => {
    expect(immobilieOhneKreditPersonen({ immobilien: [{}], kredite: [{ kategorie: "immobilienkredit" }] })).toEqual([]);
    expect(immobilieOhneKreditPersonen({ immobilien: [{}], kredite: [{ kategorie: "bauspardarlehen" }] })).toEqual([]);
    expect(immobilieOhneKreditPersonen({ immobilien: [{}], kredite: [{ art: "Baufinanzierung Sparkasse" }] })).toEqual([]);
  });

  it("fragt nicht erneut nach „schuldenfrei“", () => {
    expect(immobilieOhneKreditPersonen({ immobilien: [{}], kredite: [], immobilienSchuldenfrei: true })).toEqual([]);
  });

  it("je Person, auch über beide Personen hinweg", () => {
    const beide = { immobilien: [{}], kredite: [], person2: true, person2Data: { immobilien: [{}], kredite: [] } };
    expect(immobilieOhneKreditPersonen(beide)).toEqual([1, 2]);
    // Kredit bei Person 1, zugeordnet der Immobilie von Person 2: Person 2 ist abgedeckt.
    const gemeinsam = { ...beide, kredite: [{ kategorie: "ratenkredit", immobilie: "p2:0" }] };
    expect(immobilieOhneKreditPersonen(gemeinsam)).toEqual([1]);
    // Schuldenfrei nur für Person 2 beantwortet.
    expect(immobilieOhneKreditPersonen({ ...beide, person2Data: { ...beide.person2Data, immobilienSchuldenfrei: true } })).toEqual([1]);
  });
});

describe("Deutsch und Englisch", () => {
  it("jede Beschriftung und jeder Auswahlwert hat eine englische Fassung", () => {
    const texte = [
      ...Object.values(KREDIT_FELD_LABEL),
      ...KREDITNEHMER_AUSWAHL.map((a) => a.label),
      ...ZINSART_AUSWAHL.map((a) => a.label),
      ...SONDERTILGUNG_AUSWAHL.map((a) => a.label),
      "Wird die Immobilie noch abbezahlt?",
      "Nein, schuldenfrei",
      "Ja, Kredit eintragen",
    ];
    for (const de of texte) expect(SA_UI_EN[de], de).toBeTruthy();
  });

  it("keine Gedankenstriche in den neuen Texten", () => {
    const neu = ["Wird die Immobilie noch abbezahlt?", "Nein, schuldenfrei", "Ja, Kredit eintragen", ...Object.values(KREDIT_FELD_LABEL)];
    for (const de of neu) {
      expect(de).not.toMatch(/[–—]/);
      expect(SA_UI_EN[de]).not.toMatch(/[–—]/);
    }
  });
});
