import { describe, it, expect } from "vitest";
import {
  bereinigeDetails,
  detailsAlsText,
  istBerechtigungsFehler,
  istFehlendeDetailsSpalte,
  labelFuer,
  leereDetails,
  OBJEKTTYP_OPTIONEN,
  pruefePflichtfelder,
  type PflichtfeldEingaben,
} from "./objektEinreichungFormular";

function vollstaendigeEingaben(): PflichtfeldEingaben {
  return {
    strasse: "Hauptstraße 1",
    plz: "70173",
    ort: "Stuttgart",
    objekttyp: "mehrfamilienhaus",
    wohneinheiten: 8,
    kaufpreis: 1200000,
    jahresnettokaltmiete: 60000,
    leerstand: "",
    einreicherName: "Max Muster",
    einreicherTelefon: "+49 170 1234567",
    einreicherEmail: "",
  };
}

describe("pruefePflichtfelder", () => {
  it("liefert keine Fehler bei vollstaendigen Angaben", () => {
    expect(pruefePflichtfelder(vollstaendigeEingaben())).toEqual([]);
  });

  it("verlangt die vollstaendige Adresse", () => {
    const fehler = pruefePflichtfelder({ ...vollstaendigeEingaben(), plz: " " });
    expect(fehler.some(f => f.includes("Adresse"))).toBe(true);
  });

  it("verlangt Objekttyp, Wohneinheiten und Kaufpreis", () => {
    const fehler = pruefePflichtfelder({
      ...vollstaendigeEingaben(),
      objekttyp: "",
      wohneinheiten: "",
      kaufpreis: 0,
    });
    expect(fehler).toHaveLength(3);
  });

  it("erlaubt Miete 0 nur mit beschriebenem Leerstand", () => {
    const ohneLeerstand = pruefePflichtfelder({ ...vollstaendigeEingaben(), jahresnettokaltmiete: 0 });
    expect(ohneLeerstand.some(f => f.includes("Jahresnettokaltmiete"))).toBe(true);

    const mitLeerstand = pruefePflichtfelder({
      ...vollstaendigeEingaben(),
      jahresnettokaltmiete: 0,
      leerstand: "Objekt steht komplett leer",
    });
    expect(mitLeerstand).toEqual([]);
  });

  it("verlangt Name und mindestens einen Kontaktweg des Einreichers", () => {
    const fehler = pruefePflichtfelder({
      ...vollstaendigeEingaben(),
      einreicherName: "",
      einreicherTelefon: "",
      einreicherEmail: "",
    });
    expect(fehler).toHaveLength(2);

    const mitEmail = pruefePflichtfelder({
      ...vollstaendigeEingaben(),
      einreicherTelefon: "",
      einreicherEmail: "max@beispiel.de",
    });
    expect(mitEmail).toEqual([]);
  });
});

describe("bereinigeDetails", () => {
  it("entfernt leere Strings, null und leere Arrays", () => {
    const details = leereDetails();
    details.objekttyp = "mehrfamilienhaus";
    details.stellplaetze = 4;
    details.letzte_sanierungen = "  Dach 2021  ";
    const ergebnis = bereinigeDetails(details);
    expect(ergebnis).toEqual({
      objekttyp: "mehrfamilienhaus",
      stellplaetze: 4,
      letzte_sanierungen: "Dach 2021",
    });
  });

  it("behaelt die Zahl 0 als bewussten Wert", () => {
    const details = leereDetails();
    details.jahresnettokaltmiete_ist = 0;
    expect(bereinigeDetails(details)).toEqual({ jahresnettokaltmiete_ist: 0 });
  });
});

describe("detailsAlsText", () => {
  it("liefert leeren Text ohne ausgefuellte Felder", () => {
    expect(detailsAlsText(leereDetails())).toBe("");
  });

  it("stellt ausgefuellte Felder mit Labels dar", () => {
    const details = leereDetails();
    details.objekttyp = "wohnanlage_portfolio";
    details.denkmalschutz = "nein";
    details.unterlagen = ["expose", "mietaufstellung"];
    details.jahresnettokaltmiete_ist = 60000;
    const text = detailsAlsText(details);
    expect(text).toContain("Objekttyp: Wohnanlage / Portfolio");
    expect(text).toContain("Denkmalschutz: Nein");
    expect(text).toContain("Exposé, Mietaufstellung");
    expect(text).toContain("60.000");
  });
});

describe("labelFuer", () => {
  it("faellt auf den Rohwert zurueck, wenn die Option unbekannt ist", () => {
    expect(labelFuer(OBJEKTTYP_OPTIONEN, "mehrfamilienhaus")).toBe("Mehrfamilienhaus");
    expect(labelFuer(OBJEKTTYP_OPTIONEN, "unbekannter_wert")).toBe("unbekannter_wert");
    expect(labelFuer(OBJEKTTYP_OPTIONEN, "")).toBe("");
  });
});

describe("Fehlererkennung", () => {
  it("erkennt die fehlende details-Spalte", () => {
    expect(
      istFehlendeDetailsSpalte({
        code: "PGRST204",
        message: "Could not find the 'details' column of 'objekt_einreichungen' in the schema cache",
      })
    ).toBe(true);
    expect(istFehlendeDetailsSpalte({ code: "PGRST204", message: "Could not find the 'anders' column" })).toBe(false);
    expect(istFehlendeDetailsSpalte(null)).toBe(false);
  });

  it("erkennt Berechtigungsfehler", () => {
    expect(istBerechtigungsFehler({ code: "42501", message: "new row violates row-level security policy" })).toBe(true);
    expect(istBerechtigungsFehler({ message: "permission denied for table objekt_einreichungen" })).toBe(true);
    expect(istBerechtigungsFehler({ code: "PGRST204", message: "irgendwas" })).toBe(false);
    expect(istBerechtigungsFehler(null)).toBe(false);
  });
});
