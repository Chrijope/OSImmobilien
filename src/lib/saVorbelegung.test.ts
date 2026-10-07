import { describe, it, expect } from "vitest";
import {
  abschnitteMitUebernahme,
  abschnitteZuFeldern,
  abschnittZuFeld,
  felderInAbschnitten,
  felderOhneAbschnitt,
  uebernommeneFelder,
  verbleibendeFelder,
  vorbelegterSaStand,
  wertAn,
  saAbschnittText,
  saFeldMarkeErklaerung,
  saVorbelegungText,
  SA_LEGENDE_UEBERNOMMEN,
  SA_FELDER_OHNE_EINGABE,
} from "./saVorbelegung";
import { EMPTY_DATA, EMPTY_PERSON } from "@/components/selbstauskunft/SelbstauskunftForm";

/**
 * Die sichtbare Markierung der uebernommenen Angaben.
 *
 * Zwei Dinge duerfen nie passieren: Ein selbst eingetippter Wert darf nicht
 * als uebernommen dastehen, und eine uebernommene Zahl darf nicht unmarkiert
 * durchrutschen. Die Voreinstellungen des Formulars ("Herr", "Zur Miete",
 * "nein", Kindergeld "0") sind keine Uebernahme.
 */

const leer = EMPTY_DATA as unknown as Record<string, unknown>;
const leerPerson = EMPTY_PERSON as unknown as Record<string, unknown>;

describe("uebernommeneFelder", () => {
  it("markiert nichts an einem leeren Formular", () => {
    expect(uebernommeneFelder({ ...leer }, leer, leerPerson)).toEqual([]);
  });

  it("markiert nur das gefuellte Feld einer Gruppe, nicht die ganze Gruppe", () => {
    // Genau der Fehler, den es zu vermeiden gilt: Ein leeres Feld als
    // uebernommen zu markieren waere falsch.
    const sa = { ...leer, einkommen: { ...(leer.einkommen as object), netto: "3500" } };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual(["einkommen.netto"]);
  });

  it("zaehlt Name und Anschrift nicht als Uebernahme", () => {
    // Die stehen in den Stammdaten des Kontakts, nicht in einer alten
    // Selbstauskunft. Sie zu markieren waere falsch.
    const sa = { ...leer, vorname: "Max", nachname: "Mustermann", plz: "83022", ort: "Rosenheim" };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual([]);
  });

  it("zaehlt die Steuer-ID nicht als Uebernahme", () => {
    const sa = { ...leer, steuerId: "123/456/78901" };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual([]);
  });

  it("zaehlt eine Voreinstellung des Formulars nicht als Uebernahme", () => {
    const sa = { ...leer, mietart: "Zur Miete", privateKV: "0" };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual([]);
  });

  it("markiert eine uebernommene Antwort zu Mahnverfahren und Schufa (seit 29.09.2026 ohne Voreinstellung)", () => {
    const sa = { ...leer, mahnverfahren: "nein", schufaBekannt: "nein" };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual(["mahnverfahren", "schufaBekannt"]);
  });

  it("erkennt Angaben von Person 2 mit eigenem Pfad", () => {
    const sa = {
      ...leer,
      person2: true,
      person2Data: { ...leerPerson, lebenshaltungskosten: "900" },
    };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual([
      "person2Data.lebenshaltungskosten",
    ]);
  });

  it("uebergeht Person 2, solange sie nicht angelegt ist", () => {
    const sa = { ...leer, person2: false, person2Data: { ...leerPerson, mieteWarm: "800" } };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual([]);
  });

  it("erkennt auch die Bank-Ergaenzungen von Person 2", () => {
    // Die gibt es im leeren Personenstand nicht. Ohne diesen Fall bliebe eine
    // uebernommene Zahl unmarkiert stehen.
    const sa = {
      ...leer,
      person2: true,
      person2Data: { ...leerPerson, nebenkosten: "220" },
    };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual(["person2Data.nebenkosten"]);
  });

  it("haelt eine Liste als Ganzes fest, nicht Zelle fuer Zelle", () => {
    const sa = {
      ...leer,
      kredite: [{ art: "Autokredit", rate: "250", restschuld: "12000", laufzeitEnde: "" }],
    };
    expect(uebernommeneFelder(sa, leer, leerPerson)).toEqual(["kredite"]);
  });
});

describe("abschnitteMitUebernahme", () => {
  it("markiert nichts an einem leeren Formular", () => {
    expect(abschnitteMitUebernahme({ ...leer }, leer, leerPerson)).toEqual([]);
  });

  it("markiert nur den Abschnitt, in dem wirklich etwas steht", () => {
    const sa = { ...leer, einkommen: { ...(leer.einkommen as object), netto: "3500" } };
    // Schritt 2 sind die Einnahmen.
    expect(abschnitteMitUebernahme(sa, leer, leerPerson)).toEqual([2]);
  });

  it("erkennt auch Angaben von Person 2", () => {
    const sa = {
      ...leer,
      person2: true,
      person2Data: { ...leerPerson, lebenshaltungskosten: "900" },
    };
    // Schritt 3 sind die Ausgaben.
    expect(abschnitteMitUebernahme(sa, leer, leerPerson)).toEqual([3]);
  });

  it("markiert mehrere Abschnitte einer vollstaendigen Selbstauskunft", () => {
    const sa = {
      ...leer,
      wuenscheZiele: ["rente"],
      familienstand: "verheiratet",
      einkommen: { ...(leer.einkommen as object), netto: "3500" },
      lebenshaltungskosten: "1000",
      vermoegenswerte: [{ art: "Depot", institut: "", betrag: "25000" }],
      kredite: [{ art: "Autokredit", rate: "250", restschuld: "12000", laufzeitEnde: "" }],
      schufaScore: "95",
    };
    expect(abschnitteMitUebernahme(sa, leer, leerPerson)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("abschnittZuFeld", () => {
  it("findet den Schritt auch bei Unterfeld und bei Person 2", () => {
    expect(abschnittZuFeld("einkommen.netto")).toBe(2);
    expect(abschnittZuFeld("person2Data.einkommen.netto")).toBe(2);
    expect(abschnittZuFeld("lebenshaltungskosten")).toBe(3);
  });

  it("kennt keinen Schritt fuer ein Feld ohne Markierung", () => {
    expect(abschnittZuFeld("vorname")).toBeUndefined();
  });

  it("fasst Felder zu Schritten zusammen und sortiert sie", () => {
    expect(abschnitteZuFeldern(["lebenshaltungskosten", "einkommen.netto", "vorname"])).toEqual([
      2, 3,
    ]);
  });
});

describe("felderOhneAbschnitt", () => {
  it("nimmt alle Felder eines geprueften Schrittes heraus", () => {
    // Sonst stuenden die Feldmarkierungen noch da, waehrend der Streifen
    // ueber dem Abschnitt schon weg ist.
    const felder = ["einkommen.netto", "person2Data.einkommen.rente", "lebenshaltungskosten"];
    expect(felderOhneAbschnitt(felder, 2)).toEqual(["lebenshaltungskosten"]);
  });
});

describe("verbleibendeFelder", () => {
  const basis = {
    ...leer,
    einkommen: { ...(leer.einkommen as object), netto: "3500", rente: "200" },
  };
  const felder = ["einkommen.netto", "einkommen.rente"];

  it("nimmt genau das geaenderte Feld heraus, nicht die Nachbarn", () => {
    const neu = { ...basis, einkommen: { ...(basis.einkommen as object), netto: "3900" } };
    expect(verbleibendeFelder(basis, neu, felder)).toEqual(["einkommen.rente"]);
  });

  it("laesst alles stehen, wenn ein anderes Feld geaendert wird", () => {
    const neu = { ...basis, lebenshaltungskosten: "1200" };
    expect(verbleibendeFelder(basis, neu, felder)).toEqual(felder);
  });

  it("laesst alles stehen, wenn die Stammdaten nachgezogen werden", () => {
    // Genau das passiert kurz nach dem Oeffnen des Formulars. Es darf keine
    // Markierung aufheben, der Nutzer hat nichts getan.
    const neu = { ...basis, vorname: "Max", strasse: "Musterweg", ort: "Rosenheim" };
    expect(verbleibendeFelder(basis, neu, felder)).toEqual(felder);
  });

  it("erkennt eine Aenderung bei Person 2", () => {
    const mitP2 = { ...basis, person2: true, person2Data: { ...leerPerson, mieteWarm: "800" } };
    const neu = { ...mitP2, person2Data: { ...leerPerson, mieteWarm: "850" } };
    expect(verbleibendeFelder(mitP2, neu, ["person2Data.mieteWarm"])).toEqual([]);
  });

  it("nimmt ein geleertes Feld ebenfalls heraus", () => {
    const neu = { ...basis, einkommen: { ...(basis.einkommen as object), rente: "" } };
    expect(verbleibendeFelder(basis, neu, felder)).toEqual(["einkommen.netto"]);
  });
});

describe("wertAn", () => {
  it("liest auch tief liegende Werte", () => {
    const sa = { ...leer, person2Data: { ...leerPerson, einkommen: { netto: "2000" } } };
    expect(wertAn(sa, "person2Data.einkommen.netto")).toBe("2000");
  });

  it("gibt undefined zurueck, wenn es den Pfad nicht gibt", () => {
    expect(wertAn(leer, "gibtEsNicht.tiefer")).toBeUndefined();
  });
});

describe("felderInAbschnitten", () => {
  it("bildet die Feldliste eines Altbestands aus den offenen Abschnitten nach", () => {
    // Staende von vor der Feldmarkierung kennen nur die offenen Abschnitte.
    const sa = {
      ...leer,
      einkommen: { ...(leer.einkommen as object), netto: "3500" },
      lebenshaltungskosten: "1000",
    };
    expect(felderInAbschnitten(sa, leer, leerPerson, [3])).toEqual(["lebenshaltungskosten"]);
  });
});

describe("vorbelegterSaStand", () => {
  const alteSa = {
    ...leer,
    vorname: "Max",
    nachname: "Mustermann",
    einkommen: { ...(leer.einkommen as object), netto: "3500" },
    abgeschlossen: true,
    vorbelegung: { ausInvestment: 2, uebernommenAm: "2026-01-01T00:00:00Z", offeneAbschnitte: [2] },
  };

  it("haengt die Herkunft an und nennt die offenen Abschnitte", () => {
    const stand = vorbelegterSaStand({ data: alteSa, ausInvestment: 4 }, leer, leerPerson);
    expect(stand?.vorbelegung.ausInvestment).toBe(4);
    expect(stand?.vorbelegung.offeneAbschnitte).toEqual([2]);
  });

  it("nennt die einzelnen uebernommenen Felder", () => {
    const stand = vorbelegterSaStand({ data: alteSa, ausInvestment: 4 }, leer, leerPerson);
    expect(stand?.vorbelegung.felder).toEqual(["einkommen.netto"]);
  });

  it("laesst den Abschluss und eine alte Herkunft im alten Vorgang zurueck", () => {
    const stand = vorbelegterSaStand({ data: alteSa, ausInvestment: 4 }, leer, leerPerson);
    // Der neue Vorgang ist nicht abgeschlossen, nur weil der alte es war.
    expect(stand?.abgeschlossen).toBe(false);
    // Und die Herkunft zeigt auf Investment 4, nicht auf die alte 2.
    expect(stand?.vorbelegung.ausInvestment).not.toBe(2);
  });

  it("uebernimmt nichts ohne Quelle", () => {
    expect(vorbelegterSaStand(null, leer, leerPerson)).toBeNull();
  });

  it("uebernimmt nichts, wenn die alte Selbstauskunft nur Stammdaten enthaelt", () => {
    const nurName = { ...leer, vorname: "Max", nachname: "Mustermann" };
    expect(vorbelegterSaStand({ data: nurName, ausInvestment: 4 }, leer, leerPerson)).toBeNull();
  });
});

describe("Wortlaut", () => {
  it("nennt immer das Investment, aus dem die Angaben stammen", () => {
    expect(saAbschnittText(4)).toContain("Investment 4");
    expect(saVorbelegungText(4)).toContain("Investment 4");
    expect(saFeldMarkeErklaerung(4)).toContain("Investment 4");
  });

  it("kommt ohne Gedankenstriche aus", () => {
    expect(saVorbelegungText(4)).not.toMatch(/[–—]/);
    expect(saAbschnittText(4)).not.toMatch(/[–—]/);
    expect(saFeldMarkeErklaerung(4)).not.toMatch(/[–—]/);
    expect(SA_LEGENDE_UEBERNOMMEN).not.toMatch(/[–—]/);
  });
});

/**
 * Drei Felder stehen im Datenmodell und im PDF, haben im Formular aber kein
 * Eingabefeld mehr. Ein alter Vorgang kann sie trotzdem tragen.
 *
 * Wuerden sie markiert, entstuende eine Sackgasse: Der Streifen "Bitte
 * pruefen" stuende ueber dem Abschnitt, ohne dass irgendwo etwas zu sehen
 * waere. Der Nutzer suchte nach einer Stelle, die es nicht gibt.
 */
describe("Felder ohne Eingabefeld", () => {
  it("markiert weder das Feld noch den Abschnitt", () => {
    const alt = { gehalt13: true, gehalt14: true, versicherungsbeitraege: "250" };
    expect(uebernommeneFelder(alt, leer, leerPerson)).toEqual([]);
    expect(abschnitteMitUebernahme(alt, leer, leerPerson)).toEqual([]);
  });

  it("laesst ein sichtbares Feld im selben Abschnitt unberuehrt", () => {
    // bruttoJahr steht in Schritt 2, genau wie gehalt13.
    const alt = { gehalt13: true, bruttoJahr: "68000" };
    expect(uebernommeneFelder(alt, leer, leerPerson)).toEqual(["bruttoJahr"]);
    expect(abschnitteMitUebernahme(alt, leer, leerPerson)).toEqual([2]);
  });

  it("nennt genau die drei, die im Formular fehlen", () => {
    expect(SA_FELDER_OHNE_EINGABE).toEqual(["gehalt13", "gehalt14", "versicherungsbeitraege"]);
  });
});

/**
 * Mehrere Felder haben eine Voreinstellung ("nein", "Zur Miete", "deutsch").
 * Ein alter Vorgang aus der Zeit vor diesen Feldern traegt dort gar nichts.
 * Sein fehlender Wert weicht dann von der Voreinstellung ab, ist aber keine
 * Uebernahme: Uebernommen ist nur, wo wirklich etwas steht.
 */
describe("Fehlende und leere Werte", () => {
  it("markiert kein Feld, das im alten Vorgang gar nicht vorkommt", () => {
    // mahnverfahren und schufaBekannt stehen im Leerstand auf "nein".
    expect(uebernommeneFelder({ bruttoJahr: "68000" }, leer, leerPerson)).toEqual(["bruttoJahr"]);
  });

  it("markiert kein leeres Feld und kein leeres Verzeichnis", () => {
    const alt = { mobilfunk: "", titel: "   ", kredite: [], wuenscheZiele: [] };
    expect(uebernommeneFelder(alt, leer, leerPerson)).toEqual([]);
  });

  it("markiert weiterhin, was wirklich dasteht", () => {
    const alt = { mietart: "Eigentum", mahnverfahren: "ja" };
    expect(uebernommeneFelder(alt, leer, leerPerson).sort())
      .toEqual(["mahnverfahren", "mietart"]);
  });
});
