/**
 * Tests fuer die Trichter-Zuordnung der Statistik.
 *
 * Anlass war Auftrag 4: Ein zugewiesener Lead wurde als "Nicht erreicht"
 * gezaehlt, obwohl ihn niemand angerufen hatte. Die Zuordnung lag als private
 * Funktion in `Statistiken.tsx` und konnte deshalb nicht gepruefte werden.
 */
import { describe, it, expect } from "vitest";
import { AUSSERHALB_TRICHTER, TRICHTER_STUFEN, normalizeStufe } from "@/lib/statistikTrichter";
import { PIPELINE_STUFEN, fortschrittsStufe } from "@/lib/pipelineStufen";

/*
 * Die Liste stand hier früher noch einmal abgetippt, und zwar in der alten
 * Reihenfolge mit der Bonität vor der Objektauswahl. Ein Test, der eine eigene
 * Kopie der geprüften Sache mitbringt, prüft nur sich selbst. Jetzt kommt sie
 * aus dem Modul, die Reihenfolge bewacht `statistikReihenfolge.test.ts`.
 */

describe("normalizeStufe", () => {
  it("stellt einen zugewiesenen Lead an den Anfang des Trichters", () => {
    // Der Kern von Auftrag 4. Vorher stand hier "nicht_erreicht", also ein
    // gescheiterter Anruf, den es nie gegeben hat.
    expect(normalizeStufe("zugewiesen")).toBe("neuer_lead");
  });

  it("sagt dasselbe wie die Rangfolge im Kundenprofil", () => {
    // `pipelineStufen.ts` bildet "zugewiesen" im Rang ebenfalls auf
    // "neuer_lead" ab. Liefen die beiden Stellen auseinander, stuende ein Lead
    // in der Leiste vorne und in der Statistik hinten.
    expect(fortschrittsStufe("zugewiesen")).toBe(normalizeStufe("zugewiesen"));
  });

  it("laesst den echten Altbestand, wo er war", () => {
    expect(normalizeStufe("kontaktversuche")).toBe("nicht_erreicht");
    expect(normalizeStufe("vermoegensaufbau")).toBe("erreicht");
    expect(normalizeStufe("erstgespraech")).toBe("erstgespraech_geplant");
    expect(normalizeStufe("bedarfsanalyse")).toBe("erstgespraech_geplant");
    expect(normalizeStufe("closing")).toBe("objektauswahl");
    expect(normalizeStufe("after_sales")).toBe("faelligkeit");
  });

  it("zaehlt eine fehlende Stufe als neuen Lead", () => {
    expect(normalizeStufe(null)).toBe("neuer_lead");
    expect(normalizeStufe(undefined)).toBe("neuer_lead");
    expect(normalizeStufe("")).toBe("neuer_lead");
  });

  it("laesst die heutigen Stufen unveraendert", () => {
    for (const stufe of TRICHTER_STUFEN) {
      expect(normalizeStufe(stufe)).toBe(stufe);
    }
  });
});

describe("Jede Stufe hat einen Platz", () => {
  it("landet jede bekannte Stufe entweder im Trichter oder ausserhalb", () => {
    // Ohne diese Zusicherung faellt eine neue Stufe still in den Auffangposten
    // "neuer_lead". Genau so standen archivierte Vorgaenge und importierte
    // Bestandskunden jahrelang unter den neuen Leads.
    const platz = new Set([...TRICHTER_STUFEN, ...AUSSERHALB_TRICHTER]);
    const ohnePlatz = PIPELINE_STUFEN.map((s) => normalizeStufe(s.key)).filter(
      (s) => !platz.has(s),
    );
    expect(ohnePlatz).toEqual([]);
  });

  it("haelt die Zustaende ohne Abschlusserwartung aus dem Trichter heraus", () => {
    for (const stufe of AUSSERHALB_TRICHTER) {
      expect(TRICHTER_STUFEN).not.toContain(stufe);
    }
  });
});
