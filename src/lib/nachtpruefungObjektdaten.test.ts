import { describe, expect, it } from "vitest";
import {
  MAIL_NEU_HOECHSTENS,
  OBJEKTDATEN_TITEL,
  einheitenText,
  hatNeueObjektdaten,
  istObjektdatenBefund,
  leseTreffer,
  objektLink,
  objektdatenFuerMail,
  objektdatenJeObjekt,
  objektdatenSammelbefunde,
  type BefundRoh,
} from "../../supabase/functions/_shared/nachtpruefung-objektdaten.ts";
import {
  KENNZAHL_LABEL,
  SCHWELLEN,
  baueDatenblock,
  gerisseneSchwellen,
  type KennzahlZeile,
} from "../../supabase/functions/_shared/tagesbriefing-auftrag.ts";
import { KENNZAHL_LABEL as KENNZAHL_LABEL_BROWSER } from "./kennzahlenVerlauf";

/**
 * Die Aufbereitung der Objektbefunde für Morgenmail und Seite, und ihre
 * Zuordnung im Tagesbriefing. Die Befunde selbst schreibt die Datenbank
 * (Migration 20260924170000); hier steht, was aus ihnen wird.
 */

const GERMERING = "8b6c91f5-33e7-44be-b503-a0ae0eaf5a2e";
const DELITZSCH = "b934913c-1c2c-4337-98c9-31d3106bf46b";
const CRAILSHEIM = "6c2130e2-5662-4d76-8a68-006bd61fcf78";

function treffer(objektId: string, titel: string, neu: boolean, extra: Record<string, unknown> = {}) {
  return {
    objekt_id: objektId,
    titel,
    quelle: "investagon",
    detail: "Titel nennt PLZ 82210, im Feld steht 82110",
    aktion: "In Investagon korrigieren. Eine Änderung im CRM überschreibt der nächste Abgleich.",
    neu,
    ...extra,
  };
}

function befund(pruefung: string, bereich: string | null, beispiele: unknown[], extra: Partial<BefundRoh> = {}): BefundRoh {
  return {
    pruefung,
    bereich,
    schwere: "warnung",
    anzahl: beispiele.length,
    meldung: `${OBJEKTDATEN_TITEL[pruefung] ?? pruefung}: Testmeldung`,
    beispiele,
    ...extra,
  };
}

describe("istObjektdatenBefund", () => {
  it("erkennt Objektbefunde am Präfix und am Bereich", () => {
    expect(istObjektdatenBefund({ pruefung: "objektdaten_plz", schwere: "warnung", bereich: "OBJ" })).toBe(true);
    expect(istObjektdatenBefund({ pruefung: "objektdaten_hausgeld", schwere: "hinweis", bereich: "FIN" })).toBe(true);
    expect(istObjektdatenBefund({ pruefung: "objektdaten_verwaltung", schwere: "warnung", bereich: "AS" })).toBe(true);
  });

  it("lässt die alten Prüfungen ohne Bereich draußen", () => {
    expect(istObjektdatenBefund({ pruefung: "kontakt_ohne_zustaendigen", schwere: "warnung", bereich: null })).toBe(false);
    expect(istObjektdatenBefund({ pruefung: "signatur_abgelaufen", schwere: "warnung" })).toBe(false);
  });

  it("lässt einen Ausfall einer Regel draußen, der gehört unter Kaputt", () => {
    expect(istObjektdatenBefund({ pruefung: "objektdaten_plz", schwere: "fehler", bereich: "OBJ" })).toBe(false);
    // Der Sammelausfall des ganzen Blocks trägt kein Präfix mit Unterstrich.
    expect(istObjektdatenBefund({ pruefung: "objektdaten", schwere: "fehler", bereich: null })).toBe(false);
  });

  it("verlangt einen der drei Bereiche", () => {
    expect(istObjektdatenBefund({ pruefung: "objektdaten_plz", schwere: "warnung", bereich: "TEC" })).toBe(false);
    expect(istObjektdatenBefund({ pruefung: "objektdaten_plz", schwere: "warnung" })).toBe(false);
  });
});

describe("leseTreffer", () => {
  it("liest die Felder aus der Datenbank", () => {
    const [t] = leseTreffer([
      treffer(CRAILSHEIM, "Crailsheim", true, {
        detail: "Adresse „9a“ enthält keinen Straßennamen",
        einheiten: ["10a", "10b"],
        einheiten_weitere: 3,
      }),
    ]);
    expect(t).toEqual({
      objektId: CRAILSHEIM,
      titel: "Crailsheim",
      quelle: "investagon",
      detail: "Adresse „9a“ enthält keinen Straßennamen",
      einheiten: ["10a", "10b"],
      einheitenWeitere: 3,
      aktion: "In Investagon korrigieren. Eine Änderung im CRM überschreibt der nächste Abgleich.",
      neu: true,
    });
  });

  it("verwirft Unbrauchbares, statt abzustürzen", () => {
    expect(leseTreffer(null)).toEqual([]);
    expect(leseTreffer("kaputt")).toEqual([]);
    expect(leseTreffer([null, 3, "x", [], { titel: "ohne Kennung" }])).toEqual([]);
  });

  it("nimmt fehlende Angaben als leer und nicht als neu", () => {
    const [t] = leseTreffer([{ objekt_id: GERMERING }]);
    expect(t.titel).toBe("Objekt ohne Titel");
    expect(t.quelle).toBe("crm");
    expect(t.neu).toBe(false);
    expect(t.einheiten).toEqual([]);
  });

  it("enthält keine Felder, in denen eine Person stehen könnte", () => {
    const [t] = leseTreffer([{ ...treffer(GERMERING, "Germering", true), kunde_name: "Erika Beispiel" }]);
    expect(JSON.stringify(t)).not.toContain("Erika");
  });
});

describe("einheitenText", () => {
  it("nennt eine, mehrere und den Rest als Zahl", () => {
    expect(einheitenText({ einheiten: [], einheitenWeitere: 0 })).toBe("");
    expect(einheitenText({ einheiten: ["3"], einheitenWeitere: 0 })).toBe("Einheit 3");
    expect(einheitenText({ einheiten: ["3", "5"], einheitenWeitere: 0 })).toBe("Einheiten 3, 5");
    expect(einheitenText({ einheiten: ["1", "2", "3", "4", "5"], einheitenWeitere: 7 })).toBe(
      "Einheiten 1, 2, 3, 4, 5 und 7 weitere",
    );
  });
});

describe("objektLink", () => {
  it("zeigt auf die Objektseite im CRM", () => {
    expect(objektLink(GERMERING)).toBe(`https://portal.more.immo/objekte/${GERMERING}`);
    expect(objektLink(GERMERING, "https://beispiel.test/")).toBe(`https://beispiel.test/objekte/${GERMERING}`);
  });
});

describe("objektdatenFuerMail", () => {
  it("nennt neue Treffer einzeln und bestehende nur als Zahl", () => {
    const bereiche = objektdatenFuerMail([
      befund("objektdaten_titel_plz", "OBJ", [
        treffer(GERMERING, "13. Landsbergerstraße 22a, 82210 Germering", true),
        treffer(DELITZSCH, "Bismarckstraße 39, 0409 Delitzsch", false),
      ]),
    ]);
    expect(bereiche).toHaveLength(1);
    const [obj] = bereiche;
    expect(obj.bereich).toBe("OBJ");
    expect(obj.titel).toBe("Objektmanagement (Tobias Ammann)");
    expect(obj.neu).toHaveLength(1);
    expect(obj.neu[0].text).toBe("13. Landsbergerstraße 22a, 82210 Germering: PLZ im Titel weicht vom Feld ab");
    expect(obj.neu[0].unter).toContain("im Feld steht 82110");
    expect(obj.neu[0].unter).toContain("In Investagon korrigieren");
    expect(obj.neu[0].href).toBe(`https://portal.more.immo/objekte/${GERMERING}`);
    expect(obj.bestehend).toBe(1);
    expect(hatNeueObjektdaten(bereiche)).toBe(true);
  });

  it("ordnet jeden Befund seinem Bereich zu, in der Reihenfolge OBJ, FIN, AS", () => {
    const bereiche = objektdatenFuerMail([
      befund("objektdaten_verwaltung", "AS", [treffer(GERMERING, "Germering", true)]),
      befund("objektdaten_unterlagen", "FIN", [treffer(DELITZSCH, "Delitzsch", true)]),
      befund("objektdaten_adresse", "OBJ", [treffer(CRAILSHEIM, "Crailsheim", true)]),
    ]);
    expect(bereiche.map((b) => b.bereich)).toEqual(["OBJ", "FIN", "AS"]);
    expect(bereiche.map((b) => b.titel)).toEqual([
      "Objektmanagement (Tobias Ammann)",
      "Finanzierung (Fabian Kortmann)",
      "Aftersales (Sophie Lindner)",
    ]);
  });

  it("ohne neue Treffer ist das allein kein Grund für eine Mail", () => {
    const bereiche = objektdatenFuerMail([
      befund("objektdaten_plz", "OBJ", [treffer(GERMERING, "Germering", false)]),
    ]);
    expect(bereiche[0].neu).toEqual([]);
    expect(bereiche[0].bestehend).toBe(1);
    expect(hatNeueObjektdaten(bereiche)).toBe(false);
  });

  it("begrenzt die Einzelliste und zählt den Rest", () => {
    const viele = Array.from({ length: MAIL_NEU_HOECHSTENS + 4 }, (_, i) =>
      treffer(`00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, `Objekt ${i}`, true),
    );
    const [obj] = objektdatenFuerMail([befund("objektdaten_baujahr", "OBJ", viele)]);
    expect(obj.neu).toHaveLength(MAIL_NEU_HOECHSTENS);
    expect(obj.neuWeitere).toBe(4);
    expect(hatNeueObjektdaten([{ ...obj, neu: [] }])).toBe(true);
  });

  it("gibt einen Sammelbefund als einen Satz weiter, ohne Liste", () => {
    const [fin] = objektdatenFuerMail([
      befund("objektdaten_ruecklage", "FIN", [], {
        schwere: "hinweis",
        anzahl: 80,
        meldung: "Rücklage fehlt: bei 80 von 91 Objekten, davon 78 aus Investagon.",
      }),
    ]);
    expect(fin.sammel).toEqual(["Rücklage fehlt: bei 80 von 91 Objekten, davon 78 aus Investagon."]);
    expect(fin.neu).toEqual([]);
    expect(hatNeueObjektdaten([fin])).toBe(false);
  });

  it("übergeht Regeln ohne Treffer, Ausfälle und die alten Prüfungen", () => {
    expect(
      objektdatenFuerMail([
        befund("objektdaten_plz", "OBJ", [], { anzahl: 0, schwere: "hinweis" }),
        befund("objektdaten_rendite", "OBJ", [], { schwere: "fehler", anzahl: 1 }),
        befund("kontakt_ohne_zustaendigen", null, [{ name: "Erika Beispiel" }]),
      ]),
    ).toEqual([]);
  });
});

describe("objektdatenJeObjekt", () => {
  const zeilen: BefundRoh[] = [
    befund("objektdaten_titel_plz", "OBJ", [treffer(GERMERING, "Germering", false)]),
    befund("objektdaten_unterlagen", "FIN", [
      treffer(GERMERING, "Germering", true, { detail: "Es fehlt: Energieausweis", aktion: "In Investagon ergänzen oder im CRM hochladen." }),
      treffer(DELITZSCH, "Delitzsch", false, { detail: "Es fehlt: Teilungserklärung" }),
    ]),
    befund("objektdaten_preisspanne", "OBJ", [treffer(DELITZSCH, "Delitzsch", false)], { schwere: "hinweis" }),
    befund("objektdaten_verkauft_ohne_miete", "AS", [
      treffer(CRAILSHEIM, "Crailsheim", false, { detail: "2 verkaufte Einheiten ohne Miete", einheiten: ["1", "2"] }),
    ]),
    befund("objektdaten_plz", "OBJ", [], { schwere: "fehler", anzahl: 1 }),
  ];

  it("fasst alle Punkte eines Objekts über die Bereiche zusammen", () => {
    const objekte = objektdatenJeObjekt(zeilen);
    const germering = objekte.find((o) => o.objektId === GERMERING)!;
    expect(germering.punkte.map((p) => p.bereich)).toEqual(["OBJ", "FIN"]);
    expect(germering.neu).toBe(1);
  });

  it("stellt Objekte mit Neuem nach oben, dann nach Zahl der Punkte", () => {
    expect(objektdatenJeObjekt(zeilen).map((o) => o.titel)).toEqual(["Germering", "Delitzsch", "Crailsheim"]);
  });

  it("sortiert im Objekt Warnungen vor Hinweisen", () => {
    const delitzsch = objektdatenJeObjekt(zeilen).find((o) => o.objektId === DELITZSCH)!;
    expect(delitzsch.punkte.map((p) => p.schwere)).toEqual(["warnung", "hinweis"]);
  });

  it("hängt die Einheiten an den Text", () => {
    const crailsheim = objektdatenJeObjekt(zeilen).find((o) => o.objektId === CRAILSHEIM)!;
    expect(crailsheim.punkte[0].text).toBe("2 verkaufte Einheiten ohne Miete (Einheiten 1, 2)");
  });

  it("liefert ohne Objektbefunde eine leere Liste", () => {
    expect(objektdatenJeObjekt([befund("signatur_abgelaufen", null, [{ name: "x" }])])).toEqual([]);
  });

  it("sammelt die Sammelbefunde getrennt", () => {
    expect(
      objektdatenSammelbefunde([
        befund("objektdaten_ruecklage", "FIN", [], { anzahl: 80, meldung: "Rücklage fehlt: bei 80 von 91 Objekten." }),
        befund("objektdaten_plz", "OBJ", [], { anzahl: 0 }),
      ]),
    ).toEqual([{ bereich: "FIN", regel: "Rücklage fehlt", meldung: "Rücklage fehlt: bei 80 von 91 Objekten." }]);
  });
});

describe("Tagesbriefing: Objektdaten je Bereich", () => {
  const zeile = (bereich: string, kennzahl: string, wert: number): KennzahlZeile => ({
    bereich,
    kennzahl,
    label: KENNZAHL_LABEL[kennzahl] ?? kennzahl,
    stichtag: "2026-09-25",
    wert,
    stichtagVorwoche: null,
    wertVorwoche: null,
    veraenderung: null,
  });

  it("kennt beide Kennzahlen im Klartext, in Deno und im Browser gleich", () => {
    for (const k of ["objektdaten_unstimmig", "objektdaten_neu"]) {
      expect(KENNZAHL_LABEL[k]).toBeTruthy();
      expect(KENNZAHL_LABEL_BROWSER[k]).toBe(KENNZAHL_LABEL[k]);
    }
  });

  it("hat für jeden der drei Bereiche eine Schwelle auf den neuen Treffern", () => {
    for (const bereich of ["OBJ", "FIN", "AS"]) {
      const schwelle = SCHWELLEN.find((s) => s.bereich === bereich && s.kennzahl === "objektdaten_neu");
      expect(schwelle?.ab).toBe(1);
    }
    // Die Gesamtzahl bleibt bewusst ohne Schwelle, sonst stünde sie jeden Morgen im Text.
    expect(SCHWELLEN.some((s) => s.kennzahl === "objektdaten_unstimmig")).toBe(false);
  });

  it("reißt die Schwelle nur mit neuen Treffern und nennt den Bereich", () => {
    const zeilen = [
      zeile("OBJ", "objektdaten_unstimmig", 7),
      zeile("OBJ", "objektdaten_neu", 2),
      zeile("FIN", "objektdaten_unstimmig", 12),
      zeile("FIN", "objektdaten_neu", 0),
    ];
    const gerissen = gerisseneSchwellen(zeilen);
    expect(gerissen.map((g) => `${g.zeile.bereich}.${g.zeile.kennzahl}`)).toEqual(["OBJ.objektdaten_neu"]);

    const block = baueDatenblock(zeilen, "2026-09-25");
    expect(block).toContain("- OBJ | Neue Unstimmigkeiten in den Objektdaten | Wert: 2");
    expect(block).toContain("OBJ (Objektmanagement):");
    expect(block).toContain("  Objekte mit unstimmigen Daten | heute: 12");
  });
});
