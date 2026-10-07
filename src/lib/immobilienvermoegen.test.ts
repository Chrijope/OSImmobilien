import { describe, it, expect } from "vitest";
import { berechneImmobilienvermoegen } from "./immobilienvermoegen";
import { calculateFinanzierbarkeitFromSaData } from "./finanzierbarkeitUtils";

/**
 * Im Kundenprofil stand unter der Überschrift "Immobilienvermögen" jahrelang
 * die Restschuld der Immobilienkredite, also eine Schuld statt eines Werts.
 * Der Marktwert aus der Selbstauskunft wurde nirgends gelesen.
 *
 * Diese Tests halten die Formel fest: Verkehrswert minus Restschuld.
 */

describe("Nettoimmobilienvermögen", () => {
  it("zieht die Restschuld vom Verkehrswert ab", () => {
    const v = berechneImmobilienvermoegen({
      immobilien: [{ marktwert: "420.000,00" }],
      kredite: [{ art: "Immobiliendarlehen", restschuld: "180.000,00" }],
    });
    expect(v.verkehrswert).toBe(420000);
    expect(v.restschuld).toBe(180000);
    expect(v.netto).toBe(240000);
    expect(v.anzahl).toBe(1);
    expect(v.vorhanden).toBe(true);
  });

  it("rechnet beide Personen der Selbstauskunft zusammen", () => {
    const v = berechneImmobilienvermoegen({
      immobilien: [{ marktwert: "300.000" }],
      kredite: [{ art: "Immobilie Eigentum", restschuld: "100.000" }],
      person2: true,
      person2Data: {
        immobilien: [{ marktwert: "200.000" }],
        kredite: [{ art: "Hypothek", restschuld: "50.000" }],
      },
    });
    expect(v.verkehrswert).toBe(500000);
    expect(v.restschuld).toBe(150000);
    expect(v.netto).toBe(350000);
    expect(v.anzahl).toBe(2);
  });

  it("ignoriert Kredite, die nichts mit Immobilien zu tun haben", () => {
    const v = berechneImmobilienvermoegen({
      immobilien: [{ marktwert: "250.000" }],
      kredite: [
        { art: "Autokredit", restschuld: "15.000" },
        { art: "Baufinanzierung", restschuld: "90.000" },
      ],
    });
    expect(v.restschuld).toBe(90000);
    expect(v.netto).toBe(160000);
  });

  it("erkennt eine Immobilie auch dann, wenn sie genau so hoch belastet ist wie ihr Wert", () => {
    const v = berechneImmobilienvermoegen({
      immobilien: [{ marktwert: "200.000" }],
      kredite: [{ art: "Immobiliendarlehen", restschuld: "200.000" }],
    });
    expect(v.netto).toBe(0);
    // Vorhanden ist sie trotzdem, sonst verschwände sie stillschweigend.
    expect(v.vorhanden).toBe(true);
  });

  it("liefert einen negativen Wert, wenn die Restschuld den Verkehrswert übersteigt", () => {
    const v = berechneImmobilienvermoegen({
      immobilien: [{ marktwert: "150.000" }],
      kredite: [{ art: "Immobiliendarlehen", restschuld: "190.000" }],
    });
    expect(v.netto).toBe(-40000);
  });

  it("erkennt den Immobilienkredit an der gewählten Art, auch ohne Bezeichnung, mit den neuen Angaben", () => {
    const v = berechneImmobilienvermoegen({
      immobilien: [{ marktwert: "300.000" }],
      kredite: [
        { art: "", kategorie: "immobilienkredit", restschuld: "100.000", restschuldPer: "01.09.2026", zinsart: "fest", sondertilgung: "nein" },
        // Gewählt ist ein Leasing: zählt nicht, auch wenn der Freitext anders klingt.
        { art: "Immobil-Leasing", kategorie: "kfz_leasing", restschuld: "20.000" },
      ],
      person2: true,
      person2Data: { immobilien: [{ marktwert: "100.000" }], kredite: [{ art: "Bausparkasse", kategorie: "bauspardarlehen", restschuld: "10.000" }] },
    });
    expect(v.restschuld).toBe(110000);
    expect(v.verkehrswert).toBe(400000);
    expect(v.kredite[0]).toMatchObject({ bezeichnung: "Immobilienkredit / Baufinanzierung", restschuldPer: "01.09.2026", zinsart: "Fest", sondertilgung: "Nein" });
    expect(v.kredite[1]).toMatchObject({ person: 2, restschuldPer: "" });
  });

  it("kommt mit fehlenden Angaben zurecht", () => {
    expect(berechneImmobilienvermoegen(null).vorhanden).toBe(false);
    expect(berechneImmobilienvermoegen({}).netto).toBe(0);
    expect(berechneImmobilienvermoegen({ immobilien: [], kredite: [] }).vorhanden).toBe(false);
  });

  it("zählt einen liegengebliebenen Entwurf von Person 2 nicht mit", () => {
    // Person 2 abgewählt, ihre Angaben stehen noch im Datensatz. PDF und
    // Bankformular zeigen sie nicht, also zählen sie auch hier nicht.
    const sa = {
      immobilien: [{ marktwert: "300.000" }],
      person2: false,
      person2Data: { immobilien: [{ marktwert: "200.000" }], kredite: [{ kategorie: "immobilienkredit", restschuld: "50.000" }] },
    };
    expect(berechneImmobilienvermoegen(sa).verkehrswert).toBe(300000);
    expect(berechneImmobilienvermoegen(sa).restschuld).toBe(0);
    const rechnung = calculateFinanzierbarkeitFromSaData({
      einkommen: { netto: "3000" }, person2: false,
      person2Data: { einkommen: { netto: "2000" }, kredite: [{ kategorie: "ratenkredit", rate: "400" }] },
    });
    expect(rechnung?.hasPerson2).toBe(false);
    expect(rechnung?.sumEink).toBe(3000);
  });
});
