import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  bankpruefungListenFuerInvestment,
  bonitaetFuerStatistikFreigegeben,
  buildBankpruefungDocListe,
  eigenkapitalJeVermoegenswertBelegt,
  kontoBrauchtNachweis,
} from "./bankpruefungListe";
import {
  applyLegacyDocKeys,
  buildBankpruefungBaseDocs,
  mergeVorhandeneDocs,
  zaehltFuerAbschluss,
} from "./bankpruefungDocs";

/**
 * Kundenprofil und Kundenportal bauen ihre Bankprüfungsliste über dieselbe
 * Funktion. Diese Tests sichern ab, dass die Liste vollständig ist (auch
 * Kontoauszüge und PKV-Nachweis für den Kunden), dass Person 2 dieselben
 * dynamischen Nachweise bekommt und dass Alt-Uploads unter den früheren
 * Portal-Schlüsseln nicht verschwinden.
 */

const saNeu = {
  beschaeftigungsart: "angestellt",
  privateKV: "250,00",
  mietart: "Zur Miete",
  einkommen: { netto: "3.500,00", miet: "0" },
  kredite: [
    { art: "VW Bank", kategorie: "kfz_finanzierung", rate: "300,00" },
  ],
  vermoegenswerte: [{ art: "Depot", institut: "ING", betrag: "10.000,00" }],
  bankkonten: [{ konto: "Girokonto", institut: "Sparkasse", iban: "DE00" }],
  person2Data: {
    beschaeftigungsart: "angestellt",
    mietart: "Mietfrei",
    ausgaben: { privatkredite: 150 },
    einkuenfte: { mieteinnahmen: 500 },
    vermoegenswerte: [{ art: "Tagesgeld", institut: "DKB", betrag: "5.000,00" }],
  },
};

describe("buildBankpruefungDocListe", () => {
  it("liefert dem Kunden dieselbe Liste wie dem Berater (Kontoauszuege und PKV inklusive)", () => {
    const liste = buildBankpruefungDocListe({ person: 1, saData: saNeu });
    const namen = liste.map((d) => d.name);
    expect(namen).toContain("Kontoauszüge der letzten 3 Monate");
    expect(namen).toContain("PKV Nachweis");
    expect(namen).toContain("Mietvertrag");
    expect(namen).toContain("Kreditvertrag Autokredit");
    expect(namen).toContain("Nachweis: Depot – ING");
    expect(namen).toContain("Nachweis: Girokonto – Sparkasse");
    // Der alte, nur im Portal existierende Sammelname taucht nicht mehr auf.
    expect(namen).not.toContain('Eigener Mietvertrag / „Mietfrei-Bestätigung"');
  });

  it("stimmt fuer die Grundliste mit der Admin-Variante ueberein", () => {
    const gemeinsame = buildBankpruefungDocListe({ person: 1, saData: { beschaeftigungsart: "selbstaendig", mietart: "Eigentum" } });
    const admin = buildBankpruefungBaseDocs({ beschaeftigungsart: "selbstaendig", person: 1, variant: "admin" });
    for (const doc of admin) {
      expect(gemeinsame.map((d) => d.name)).toContain(doc.name);
    }
  });

  it("baut fuer Person 2 dieselben dynamischen Nachweise mit Suffix", () => {
    const liste = buildBankpruefungDocListe({ person: 2, saData: saNeu.person2Data });
    const namen = liste.map((d) => d.name);
    expect(namen).toContain("Mietfreibestätigung Person 2");
    expect(namen).toContain("Kreditvertrag Privatkredit Person 2");
    expect(namen).toContain("Mietvertrag Vermietungsobjekt Person 2");
    expect(namen).toContain("Nachweis: Tagesgeld – DKB Person 2");
  });

  it("zeigt ohne Selbstauskunft den Mietvertrag als Standard-Wohnnachweis", () => {
    const liste = buildBankpruefungDocListe({ person: 1, saData: undefined });
    expect(liste.map((d) => d.name)).toContain("Mietvertrag");
  });

  it("liest Kreditbedarf nur aus der Selbstauskunft, nicht mehr vom Kontakt", () => {
    // Frueher zaehlte hier ein Kredit, der nur am Kontakt stand. Er konnte
    // aus einem ganz anderen Kauf stammen (Entscheidung Christian, 10.09.2026).
    const liste = buildBankpruefungDocListe({
      person: 1,
      saData: { mietart: "Eigentum", ausgaben: { autokredite: 200 } },
    });
    expect(liste.map((d) => d.name)).toContain("Kreditvertrag Autokredit");

    const ohne = buildBankpruefungDocListe({ person: 1, saData: { mietart: "Eigentum" } });
    expect(ohne.map((d) => d.name)).not.toContain("Kreditvertrag Autokredit");
  });
});

/**
 * Die Regel vom 10.09.2026: Jedes Investment steht fuer sich. Ein Investment
 * ohne eigene Selbstauskunft bekommt keine Liste aus einem anderen Kauf.
 */
describe("bankpruefungListenFuerInvestment", () => {
  it("baut die volle Liste aus der eigenen Selbstauskunft des Investments", () => {
    const listen = bankpruefungListenFuerInvestment({ eigeneSaData: saNeu });
    expect(listen.ohneEigeneSa).toBe(false);
    expect(listen.p1.map((d) => d.name)).toContain("Kreditvertrag Autokredit");
    expect(listen.p2.map((d) => d.name)).toContain("Mietfreibestätigung Person 2");
  });

  it("zeigt ohne eigene Selbstauskunft KEINE Liste, auch wenn ein Geschwister-Investment eine hat", () => {
    // Der Fall: Kunde kauft ein zweites Mal. Investment 1 hat eine
    // Selbstauskunft, Investment 2 noch nicht. Investment 2 darf daraus
    // nichts ableiten, sonst verlangt es Nachweise zum falschen Kauf.
    const listen = bankpruefungListenFuerInvestment({ eigeneSaData: null });
    expect(listen.ohneEigeneSa).toBe(true);
    expect(listen.p1).toEqual([]);
    expect(listen.p2).toEqual([]);
  });

  it("behaelt ohne eigene Selbstauskunft die von Hand ergaenzten Zusatzunterlagen", () => {
    // Die stammen vom Vertriebspartner, nicht aus einer Selbstauskunft.
    const listen = bankpruefungListenFuerInvestment({
      eigeneSaData: null,
      customBankDocs: [{ name: "Erbschein", required: true }],
    });
    expect(listen.p1.map((d) => d.name)).toEqual(["Erbschein"]);
  });


});

describe("applyLegacyDocKeys", () => {
  it("laesst einen alten Portal-Upload fuer die neue Mietvertrag-Zeile zaehlen", () => {
    const statuses = { 'Eigener Mietvertrag / „Mietfrei-Bestätigung"': "uploaded" };
    const bereinigt = applyLegacyDocKeys(statuses, ["Mietvertrag"]);
    expect(bereinigt["Mietvertrag"]).toBe("uploaded");
    expect(bereinigt['Eigener Mietvertrag / „Mietfrei-Bestätigung"']).toBeUndefined();
  });

  it("ueberschreibt keinen bereits vorhandenen neuen Eintrag", () => {
    const statuses = {
      'Eigener Mietvertrag / „Mietfrei-Bestätigung"': "uploaded",
      "Mietvertrag": "approved",
    };
    const bereinigt = applyLegacyDocKeys(statuses, ["Mietvertrag"]);
    expect(bereinigt["Mietvertrag"]).toBe("approved");
  });

  it("behandelt Person 2 getrennt und laesst fremde Schluessel unangetastet", () => {
    const statuses = {
      'Eigener Mietvertrag / „Mietfrei-Bestätigung" Person 2': "approved",
      "Personalausweis": "uploaded",
    };
    const bereinigt = applyLegacyDocKeys(statuses, ["Mietfreibestätigung Person 2"]);
    expect(bereinigt["Mietfreibestätigung Person 2"]).toBe("approved");
    expect(bereinigt["Personalausweis"]).toBe("uploaded");
  });
});

/*
 * Entscheidungen Christian, 25.09.2026. Alle Fälle sind erfunden.
 */
const namenVon = (liste: { name: string }[]) => liste.map((d) => d.name);
const pflichtVon = (liste: { name: string; required: boolean }[]) =>
  liste.filter((d) => d.required).map((d) => d.name);

/** So legt das Formular eine neue Selbstauskunft an: eine Girokonto-Zeile ohne Angaben. */
const unberuehrt = {
  beschaeftigungsart: "angestellt",
  mietart: "Zur Miete",
  bankkonten: [{ konto: "Girokonto", institut: "", iban: "" }],
  vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "", betrag: "" }],
};

describe("Kontonachweis nur bei ausgefüllter Kontozeile", () => {
  it("eine unberührte Kontozeile ergibt keinen Nachweis", () => {
    const liste = buildBankpruefungDocListe({ person: 1, saData: unberuehrt });
    expect(namenVon(liste).some((n) => n.startsWith("Nachweis: Girokonto"))).toBe(false);
    expect(namenVon(liste).some((n) => n.startsWith("Nachweis:"))).toBe(false);
  });

  it("nur Leerzeichen zählen nicht als Angabe", () => {
    expect(kontoBrauchtNachweis({ konto: "Girokonto", institut: "  ", iban: " " })).toBe(false);
  });

  it("eine Kontozeile mit Institut ergibt einen Nachweis", () => {
    const liste = buildBankpruefungDocListe({
      person: 1,
      saData: { ...unberuehrt, bankkonten: [{ konto: "Girokonto", institut: "Bank A", iban: "" }] },
    });
    expect(pflichtVon(liste)).toContain("Nachweis: Girokonto – Bank A");
  });

  it("eine Kontozeile nur mit IBAN ergibt einen Nachweis unter dem bisherigen Namen", () => {
    const liste = buildBankpruefungDocListe({
      person: 1,
      saData: { ...unberuehrt, bankkonten: [{ konto: "Girokonto", institut: "", iban: "DE00 0000 0000 0000 0000 00" }] },
    });
    expect(pflichtVon(liste)).toContain("Nachweis: Girokonto");
  });

  it("gilt auch für Person 2", () => {
    const leer = buildBankpruefungDocListe({ person: 2, saData: unberuehrt });
    expect(namenVon(leer)).not.toContain("Nachweis: Girokonto Person 2");
    const mitInstitut = buildBankpruefungDocListe({
      person: 2,
      saData: { ...unberuehrt, bankkonten: [{ konto: "Girokonto", institut: "Bank B", iban: "" }] },
    });
    expect(pflichtVon(mitInstitut)).toContain("Nachweis: Girokonto – Bank B Person 2");
  });
});

describe("Eigenkapitalnachweis entfällt bei belegten Vermögenswerten", () => {
  const mitVermoegen = {
    ...unberuehrt,
    vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "Bank A", betrag: "20.000,00" }],
  };

  it("ohne Vermögenswert mit Betrag bleibt er Pflicht", () => {
    expect(eigenkapitalJeVermoegenswertBelegt(unberuehrt)).toBe(false);
    expect(pflichtVon(buildBankpruefungDocListe({ person: 1, saData: unberuehrt }))).toContain("Eigenkapitalnachweis");
    // Ein Betrag von null zählt nicht.
    const null_ = { ...unberuehrt, vermoegenswerte: [{ art: "Depot", institut: "ING", betrag: "0,00" }] };
    expect(pflichtVon(buildBankpruefungDocListe({ person: 1, saData: null_ }))).toContain("Eigenkapitalnachweis");
  });

  it("ohne Selbstauskunft bleibt er Pflicht", () => {
    expect(pflichtVon(buildBankpruefungDocListe({ person: 1, saData: undefined }))).toContain("Eigenkapitalnachweis");
  });

  it("mit Vermögenswert entfällt er, der Nachweis je Vermögenswert bleibt", () => {
    const liste = buildBankpruefungDocListe({ person: 1, saData: mitVermoegen });
    expect(namenVon(liste)).not.toContain("Eigenkapitalnachweis");
    expect(pflichtVon(liste)).toContain("Nachweis: Bank- & Sparguthaben – Bank A");
  });

  it("richtet sich je Person nach den eigenen Angaben", () => {
    // Person 1 mit Vermögen, Person 2 ohne
    const sa1 = { ...mitVermoegen, person2Data: unberuehrt };
    const a = bankpruefungListenFuerInvestment({ eigeneSaData: sa1 });
    expect(namenVon(a.p1)).not.toContain("Eigenkapitalnachweis");
    expect(pflichtVon(a.p2)).toContain("Eigenkapitalnachweis Person 2");

    // Person 1 ohne Vermögen, Person 2 mit
    const sa2 = { ...unberuehrt, person2Data: mitVermoegen };
    const b = bankpruefungListenFuerInvestment({ eigeneSaData: sa2 });
    expect(pflichtVon(b.p1)).toContain("Eigenkapitalnachweis");
    expect(namenVon(b.p2)).not.toContain("Eigenkapitalnachweis Person 2");
    expect(pflichtVon(b.p2)).toContain("Nachweis: Bank- & Sparguthaben – Bank A Person 2");
  });
});

describe("Altzeilen blockieren den Abschluss nicht", () => {
  const mitVermoegen = {
    ...unberuehrt,
    vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "Bank A", betrag: "20.000,00" }],
  };

  it("ein alter Eigenkapitalnachweis mit Datei bleibt als freiwillige Zeile sichtbar", () => {
    const basis = buildBankpruefungDocListe({ person: 1, saData: mitVermoegen });
    const statuses = { Eigenkapitalnachweis: "approved" };
    const liste = mergeVorhandeneDocs(basis, statuses, (n) => !n.endsWith(" Person 2"));
    expect(liste.find((d) => d.name === "Eigenkapitalnachweis")).toEqual({ name: "Eigenkapitalnachweis", required: false });
  });

  it("eine alte Kontozeile „Nachweis: Girokonto“ mit Datei bleibt ebenso sichtbar", () => {
    const basis = buildBankpruefungDocListe({ person: 1, saData: unberuehrt });
    const liste = mergeVorhandeneDocs(basis, { "Nachweis: Girokonto": "uploaded" }, () => true);
    expect(liste.find((d) => d.name === "Nachweis: Girokonto")?.required).toBe(false);
  });

  it("eine abgelehnte Altzeile zählt nicht zum Abschluss, eine von Hand ergänzte schon", () => {
    const vonHand = new Set(["Erbschein"]);
    expect(zaehltFuerAbschluss({ name: "Eigenkapitalnachweis", required: false }, vonHand)).toBe(false);
    expect(zaehltFuerAbschluss({ name: "Erbschein", required: false }, vonHand)).toBe(true);
    expect(zaehltFuerAbschluss({ name: "Arbeitsvertrag", required: true }, vonHand)).toBe(true);
  });

  it("die Conversion-Statistik zählt die Bonität trotz abgelehnter Altzeile", () => {
    const pflicht = [
      ...buildBankpruefungDocListe({ person: 1, saData: mitVermoegen }).filter((d) => d.required).map((d) => d.name),
      "Personalausweis", "Letzter Gehaltsnachweis", "Vorletzter Gehaltsnachweis",
      "Vorvorletzter Gehaltsnachweis", "Gehaltsnachweis Dezember Vorjahr",
    ];
    const docStatuses: Record<string, string> = Object.fromEntries(pflicht.map((n) => [n, "approved"]));
    docStatuses["Eigenkapitalnachweis"] = "rejected";
    const zeile = { id: "inv-test", meta: { saData: mitVermoegen, saSigned: true, docStatuses } };
    expect(bonitaetFuerStatistikFreigegeben(zeile, {})).toBe(true);

    // Eine abgelehnte Pflichtzeile hält sie weiter auf.
    const mitPflichtAbgelehnt = { ...zeile, meta: { ...zeile.meta, docStatuses: { ...docStatuses, Arbeitsvertrag: "rejected" } } };
    expect(bonitaetFuerStatistikFreigegeben(mitPflichtAbgelehnt, {})).toBe(false);

    // Eine von Hand ergänzte, abgelehnte Unterlage ebenfalls.
    const mitVonHand = { ...zeile, meta: { ...zeile.meta, docStatuses: { ...docStatuses, Erbschein: "rejected" } } };
    expect(bonitaetFuerStatistikFreigegeben(mitVonHand, { customBankDocs: [{ name: "Erbschein", required: false }] })).toBe(false);
  });

  it("ohne einen einzigen zählenden Eintrag gilt die Bonität nicht als freigegeben", () => {
    const zeile = { id: "inv-test", meta: { saData: mitVermoegen, saSigned: true, docStatuses: { Eigenkapitalnachweis: "approved" } } };
    expect(bonitaetFuerStatistikFreigegeben(zeile, {})).toBe(false);
  });
});

describe("Kundenprofil: Ergebnis senden", () => {
  it("prüft beim Abschluss nur Pflichtzeilen und von Hand ergänzte Unterlagen", () => {
    const code = readFileSync(resolve(__dirname, "..", "pages", "KundenDetail.tsx"), "utf8");
    expect(code).toMatch(/const bankZumAbschluss = dynamicBankDocs\.filter\(d => zaehltFuerAbschluss\(d, vonHandErgaenzt\)\)/);
    expect(code).toMatch(/const allBankReviewed = bankZumAbschluss\.every/);
    expect(code).toMatch(/&& bankZumAbschluss\.every\(d => docStatuses\[d\.name\] === "approved"\)/);
    // Auch die automatische Rückfrage nach dem letzten Freigeben folgt der Regel.
    expect(code).toMatch(/const allBankReviewed = dynamicBankDocs\.filter\(d => zaehltFuerAbschluss\(d, vonHandErgaenzt\)\)\.every/);
    // Die frühere Prüfung über jede Zeile, auch freiwillige Altzeilen, ist weg.
    expect(code).not.toMatch(/const allBankReviewed = dynamicBankDocs\.every/);
    expect(code).not.toMatch(/const allBonitaetReviewed = bonitaetDocsInv\.every/);
  });
});
