import { describe, it, expect } from "vitest";
import {
  BUNDESLAENDER,
  bundeslandById,
  grunderwerbsteuerSpanne,
  kaufnebenkostenProzent,
} from "@/lib/grunderwerbsteuer";
import {
  OBJEKTTYPEN,
  ZUZAHLUNG_GRENZE,
  objekttypById,
  rechneMuster,
  sortiereTypenNachPassung,
  waehleMusterobjekt,
} from "@/lib/objekttypen";

describe("Grunderwerbsteuer", () => {
  it("kennt alle sechzehn Bundesländer", () => {
    expect(BUNDESLAENDER).toHaveLength(16);
    expect(new Set(BUNDESLAENDER.map((b) => b.id)).size).toBe(16);
  });

  it("führt die aktuellen Sätze", () => {
    expect(bundeslandById("by")?.grunderwerbsteuer).toBe(3.5);
    expect(bundeslandById("hb")?.grunderwerbsteuer).toBe(5.5); // seit 1.7.2025
    expect(bundeslandById("th")?.grunderwerbsteuer).toBe(5.0); // seit 1.1.2024
    expect(bundeslandById("nw")?.grunderwerbsteuer).toBe(6.5);
  });

  it("nennt die Spanne von 3,5 bis 6,5 Prozent", () => {
    expect(grunderwerbsteuerSpanne()).toEqual({ min: 3.5, max: 6.5 });
  });

  it("schlägt zwei Prozent für Notar und Grundbuch auf", () => {
    expect(kaufnebenkostenProzent("by")).toBe(5.5);
    expect(kaufnebenkostenProzent("nw")).toBe(8.5);
  });

  it("nimmt ohne Bundesland den Mittelwert", () => {
    const mittel = kaufnebenkostenProzent(null);
    expect(mittel).toBeGreaterThan(kaufnebenkostenProzent("by"));
    expect(mittel).toBeLessThan(kaufnebenkostenProzent("nw"));
  });
});

describe("Objekttypen", () => {
  it("hat drei Typen mit sinnvollen Spannen", () => {
    expect(OBJEKTTYPEN).toHaveLength(3);
    for (const t of OBJEKTTYPEN) {
      expect(t.kaufpreisVon).toBeLessThan(t.kaufpreisBis);
      expect(t.mietrenditeProzent).toBeGreaterThan(0);
      expect(t.afaSatzProzent).toBeGreaterThan(0);
      expect(t.kurz.length).toBeGreaterThan(10);
    }
  });

  it("gibt beim WG-Konzept die höchste Mietrendite", () => {
    const wg = objekttypById("wg_konzept");
    expect(wg.mietrenditeProzent).toBeGreaterThan(objekttypById("neubau").mietrenditeProzent);
    expect(wg.erhaltungsaufwandProzent).toBeGreaterThan(0);
  });

  it("führt beim Neubau die Sonderabschreibung", () => {
    expect(objekttypById("neubau").sonderAfaProzent).toBe(5);
    expect(objekttypById("sanierter_altbau").sonderAfaProzent).toBeUndefined();
  });
});

describe("Musterrechnung", () => {
  const basis = { rahmenBis: 400000, grenzsteuersatz: 0.42, bundeslandId: "by" };

  it("rechnet die Kaufnebenkosten nach Bundesland", () => {
    const r = rechneMuster(objekttypById("neubau"), 300000, basis);
    expect(r.kaufnebenkostenProzent).toBe(5.5);
    expect(r.kaufnebenkosten).toBe(16500);
  });

  it("finanziert den Kaufpreis, die Nebenkosten trägt der Käufer", () => {
    const r = rechneMuster(objekttypById("neubau"), 300000, basis);
    expect(r.darlehen).toBe(300000);
  });

  it("erzeugt im ersten Jahr einen steuerlichen Verlust und damit eine Erstattung", () => {
    const r = rechneMuster(objekttypById("sanierter_altbau"), 300000, basis);
    expect(r.steuerlichesErgebnis).toBeLessThan(0);
    expect(r.steuerwirkungJahr).toBeGreaterThan(0);
  });

  it("senkt durch die Steuerwirkung die Zuzahlung", () => {
    const r = rechneMuster(objekttypById("sanierter_altbau"), 300000, basis);
    expect(r.zuzahlungMonat).toBeLessThan(r.zuzahlungOhneSteuerMonat);
  });

  it("lässt die Zuzahlung nie unter null fallen", () => {
    const r = rechneMuster(objekttypById("wg_konzept"), 200000, basis);
    expect(r.zuzahlungMonat).toBeGreaterThanOrEqual(0);
  });

  it("baut über zehn Jahre Vermögen auf", () => {
    const r = rechneMuster(objekttypById("neubau"), 300000, basis);
    expect(r.restschuldNach10).toBeLessThan(r.darlehen);
    expect(r.vermoegenNach10).toBeGreaterThan(0);
    expect(r.immobilienwertNach10).toBeGreaterThan(r.kaufpreis);
  });
});

describe("Auswahl des Beispielobjekts", () => {
  const basis = { rahmenBis: 400000, grenzsteuersatz: 0.42, bundeslandId: "by" };

  it("hält bei jedem Typ die Zuzahlungsgrenze ein", () => {
    for (const t of OBJEKTTYPEN) {
      const r = waehleMusterobjekt(t, basis);
      expect(r.zuzahlungMonat, `${t.name}: ${Math.round(r.zuzahlungMonat)} €`).toBeLessThanOrEqual(
        ZUZAHLUNG_GRENZE,
      );
      expect(r.innerhalbGrenze).toBe(true);
    }
  });

  it("bleibt innerhalb der Kaufpreisspanne des Typs", () => {
    for (const t of OBJEKTTYPEN) {
      const r = waehleMusterobjekt(t, basis);
      expect(r.kaufpreis).toBeGreaterThanOrEqual(t.kaufpreisVon);
      expect(r.kaufpreis).toBeLessThanOrEqual(t.kaufpreisBis);
    }
  });

  it("überschreitet nie den Finanzierungsrahmen", () => {
    const eng = { ...basis, rahmenBis: 220000 };
    for (const t of OBJEKTTYPEN) {
      const r = waehleMusterobjekt(t, eng);
      expect(r.kaufpreis).toBeLessThanOrEqual(Math.max(t.kaufpreisVon, eng.rahmenBis));
    }
  });

  it("wählt das größte Objekt, das die Grenze noch hält", () => {
    const t = objekttypById("wg_konzept");
    const r = waehleMusterobjekt(t, basis);
    const groesser = rechneMuster(t, r.kaufpreis + 10000, basis);
    // Entweder war das nächstgrößere über der Grenze oder über der Spanne.
    const ueberSpanne = r.kaufpreis + 10000 > Math.min(t.kaufpreisBis, basis.rahmenBis);
    expect(ueberSpanne || groesser.zuzahlungMonat > ZUZAHLUNG_GRENZE).toBe(true);
  });

  it("kennzeichnet ehrlich, wenn selbst das kleinste Objekt zu teuer ist", () => {
    // Niedriger Steuersatz und teures Bundesland: Der Steuerhebel fehlt.
    const schwierig = { rahmenBis: 400000, grenzsteuersatz: 0.14, bundeslandId: "nw" };
    const r = waehleMusterobjekt(objekttypById("neubau"), schwierig);
    if (r.zuzahlungMonat > ZUZAHLUNG_GRENZE) expect(r.innerhalbGrenze).toBe(false);
  });
});

describe("Reihenfolge der Typen", () => {
  it("stellt bei hohem Steuersatz den sanierten Bestand nach vorne", () => {
    expect(sortiereTypenNachPassung(0.42, 400000)[0].id).toBe("sanierter_altbau");
  });

  it("liefert immer alle drei Typen", () => {
    expect(sortiereTypenNachPassung(0.25, 200000)).toHaveLength(3);
  });
});
