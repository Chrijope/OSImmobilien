import { describe, expect, it } from "vitest";
import {
  argumenteBereinigen,
  beschreibungAuftrag,
  beschreibungBereinigen,
  darfObjektTexteErstellen,
  eingabeBereinigen,
  kiJson,
  MAX_ARGUMENT,
  MAX_KURZBESCHREIBUNG,
  MAX_WIZARD_STANDORTARGUMENTE,
  objektFakten,
  standortAuftrag,
} from "../../supabase/functions/_shared/objekt-wizard-texte.ts";

describe("KI-Texte im Wizard: Rechte", () => {
  it("nur Admin, Inhaber und Objektpartner", () => {
    for (const r of ["admin", "inhaber", "objektpartner"]) expect(darfObjektTexteErstellen([r])).toBe(true);
    for (const r of ["vertrieb", "backoffice", "finanzierungspartner", "hausverwaltung", "kunde", "tippgeber"]) {
      expect(darfObjektTexteErstellen([r])).toBe(false);
    }
    expect(darfObjektTexteErstellen([])).toBe(false);
    expect(darfObjektTexteErstellen(["vertrieb", "objektpartner"])).toBe(true);
    expect(darfObjektTexteErstellen([null, undefined])).toBe(false);
  });
});

describe("KI-Texte im Wizard: Grenzen", () => {
  it("Beschreibung höchstens 1000 Zeichen, am Satzende gekürzt, ohne Gedankenstriche", () => {
    const satz = "Das Haus steht ruhig – und hell im Grünen. ";
    const { beschreibung } = beschreibungBereinigen({ beschreibung: satz.repeat(40) });
    expect(beschreibung.length).toBeLessThanOrEqual(MAX_KURZBESCHREIBUNG);
    expect(beschreibung.endsWith(".")).toBe(true);
    expect(beschreibung).not.toMatch(/[–—]/);
  });

  it("höchstens acht Standortargumente, je höchstens 160 Zeichen, ohne Doppelte und Leere", () => {
    const roh = { standortargumente: ["A. eins", "A. eins", "", ...Array.from({ length: 10 }, (_, i) => `Punkt ${i}. ${"x".repeat(200)}`)] };
    const { standortargumente } = argumenteBereinigen(roh);
    expect(standortargumente).toHaveLength(MAX_WIZARD_STANDORTARGUMENTE);
    expect(standortargumente[0]).toBe("A. eins");
    expect(standortargumente.every((a) => a.length <= MAX_ARGUMENT)).toBe(true);
  });

  it("meldet Versprechen und Zeitdruck als Hinweis", () => {
    expect(beschreibungBereinigen({ beschreibung: "Garantiert hohe Rendite, nur noch zwei Wohnungen frei." }).hinweise.length).toBeGreaterThanOrEqual(2);
    expect(beschreibungBereinigen({ beschreibung: "Ein ruhiges Haus mit hellen Wohnungen." }).hinweise).toEqual([]);
  });

  it("liest JSON auch im Markdown-Block, sonst nichts", () => {
    expect(kiJson('```json\n{"beschreibung":"x"}\n```')).toEqual({ beschreibung: "x" });
    expect(kiJson("kein json")).toBeUndefined();
  });

  it("bereinigt die Eingabe: Fremdes fällt weg, Listen sind begrenzt", () => {
    const e = eingabeBereinigen({ adresse: "  Seeweg 1 ", baujahr: -3, einheiten: "x", standortargumente: Array(20).fill("A"), boese: "x" });
    expect(e.adresse).toBe("Seeweg 1");
    expect(e.baujahr).toBeUndefined();
    expect(e.einheiten).toEqual([]);
    expect(e.standortargumente).toHaveLength(MAX_WIZARD_STANDORTARGUMENTE);
    expect(e).not.toHaveProperty("boese");
  });
});

describe("KI-Texte im Wizard: Auftrag", () => {
  const angaben = eingabeBereinigen({
    adresse: "Brückstraße 12", plz: "03046", ort: "Cottbus", baujahr: 1912, zustand: "Saniert",
    sanierungen: [{ jahr: "2023", massnahme: "Dach und Fassade" }],
    energieausweis: { klasse: "C", art: "Bedarfsausweis" },
    konzept: "Zusatzrente",
    einheiten: [
      { groesse: 48.5, zimmer: 2, kaufpreis: 189000, kaltmiete: 520, rendite: 3.3 },
      { groesse: 72, zimmer: 3, kaufpreis: 259000, kaltmiete: 760, rendite: 3.52 },
    ],
    standortargumente: ["Uni in der Nähe. Die BTU liegt im Stadtgebiet."],
  });

  it("Standortargumente: Adresse, Anlegersicht, Mikro/Makro, Arbeitgeber, höchstens acht, keine erfundenen Zahlen", () => {
    const { system, nutzer } = standortAuftrag(angaben);
    expect(nutzer).toContain("Brückstraße 12, 03046 Cottbus");
    expect(system).toMatch(/Kapitalanleger/);
    expect(system).toMatch(/Mikrolage/);
    expect(system).toMatch(/Makrolage/);
    expect(system).toMatch(/Arbeitgeber/);
    expect(system).toContain(`höchstens ${MAX_WIZARD_STANDORTARGUMENTE}`);
    expect(system).toMatch(/nur, wenn du sie für diesen Ort sicher kennst/);
    expect(system).toMatch(/Keine Gedankenstriche/);
  });

  it("Beschreibung: alle Angaben, Bilder, 1000 Zeichen, du, ohne Versprechen und Verknappung", () => {
    const { system, nutzer } = beschreibungAuftrag(angaben, 3);
    expect(system).toContain(`höchstens ${MAX_KURZBESCHREIBUNG} Zeichen`);
    expect(system).toMatch(/„du“/);
    expect(system).toMatch(/Keine Garantien/);
    expect(system).toMatch(/Verknappung/);
    expect(system).toMatch(/Keine Zahlen zu Kaufpreis, Miete oder Rendite/);
    expect(nutzer).toContain("Dazu 3 Bilder");
    for (const teil of ["Baujahr: 1912", "Zustand: Saniert", "Sanierung 2023: Dach und Fassade", "Bedarfsausweis, Klasse C", "Zusatzrente", "2 Wohnungen, 48,5 bis 72 m², 2 bis 3 Zimmer", "Kaufpreise 189.000 bis 259.000 €", "Uni in der Nähe"]) {
      expect(nutzer).toContain(teil);
    }
    expect(beschreibungAuftrag(angaben, 0).nutzer).toContain("keine Bilder");
  });

  it("die Kennzahlen stehen nur zur Einordnung im Auftrag", () => {
    expect(objektFakten(angaben).find((z) => z.includes("Kaufpreise"))).toMatch(/^Nur zur Einordnung, nicht in den Text/);
  });
});
