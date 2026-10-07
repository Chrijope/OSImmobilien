/**
 * Wachhund über der Kopie in `supabase/functions/_shared/pipeline-schwellen.ts`.
 *
 * Die Edge Functions laufen in Deno und können nichts aus `src/` importieren.
 * Ihre Schwellentabelle ist deshalb eine Kopie. Genau so ist der Schaden
 * entstanden, den dieser Test verhindern soll: `lead-eskalation-check` und
 * `weekly-pipeline-mahnreport` führten je eine eigene Kopie mit dem Kommentar
 * "1:1 aus Pipeline.tsx". Beide kannten die längst abgeschafften Stufen
 * `closing` und `vermoegensaufbau`, und es fehlte die gesamte Mitte des
 * Prozesses. Leads in diesen Stufen wurden stillschweigend übersprungen,
 * monatelang, ohne dass irgendwo etwas rot geworden wäre.
 *
 * Von hier aus läuft das nicht mehr auseinander, ohne dass es auffällt.
 */
import { describe, it, expect } from "vitest";
import { INACTIVITY_THRESHOLDS } from "@/lib/inactivityThresholds";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import {
  INAKTIVITAETS_SCHWELLEN,
  FINALE_SCHWELLEN,
  STUFEN_LABELS,
  STUFEN_REIHENFOLGE,
  NICHT_UEBERWACHTE_STUFEN,
  schwellenFuerStufe,
  istBekannteStufe,
  stufenLabel,
  tageSeit,
} from "../../supabase/functions/_shared/pipeline-schwellen.ts";

describe("Schwellen der Edge Functions gegen die Anwendung", () => {
  it("kennt genau dieselben Stufen wie INACTIVITY_THRESHOLDS", () => {
    expect(Object.keys(INAKTIVITAETS_SCHWELLEN).sort()).toEqual(
      Object.keys(INACTIVITY_THRESHOLDS).sort(),
    );
  });

  it("hat für jede Stufe dieselben Werte wie die Anwendung", () => {
    for (const [stufe, werte] of Object.entries(INACTIVITY_THRESHOLDS)) {
      expect(INAKTIVITAETS_SCHWELLEN[stufe], `Stufe ${stufe}`).toEqual(werte);
    }
  });

  it("kennt jede Stufe der Pipeline mit Klartextnamen", () => {
    for (const stufe of PIPELINE_STUFEN) {
      expect(STUFEN_LABELS[stufe.key], `Label fehlt für ${stufe.key}`).toBe(stufe.label);
    }
    expect(Object.keys(STUFEN_LABELS).sort()).toEqual(
      PIPELINE_STUFEN.map((s) => s.key).sort(),
    );
  });

  it("führt die Stufen in der Reihenfolge der Pipeline", () => {
    expect(STUFEN_REIHENFOLGE).toEqual(PIPELINE_STUFEN.map((s) => s.key));
  });
});

describe("Finale Schwellen", () => {
  it("gibt es für jede überwachte Stufe", () => {
    for (const stufe of Object.keys(INAKTIVITAETS_SCHWELLEN)) {
      expect(FINALE_SCHWELLEN[stufe], `finale Schwelle fehlt für ${stufe}`).toBeGreaterThan(0);
    }
  });

  it("liegt immer mindestens zwei Tage hinter der Rot-Schwelle", () => {
    for (const [stufe, [, rot]] of Object.entries(INAKTIVITAETS_SCHWELLEN)) {
      expect(FINALE_SCHWELLEN[stufe], `Stufe ${stufe}`).toBeGreaterThanOrEqual(rot + 2);
    }
  });

  it("hat keinen Eintrag für eine Stufe ohne Untätigkeitsschwelle", () => {
    for (const stufe of Object.keys(FINALE_SCHWELLEN)) {
      expect(INAKTIVITAETS_SCHWELLEN[stufe], `verwaiste finale Schwelle: ${stufe}`).toBeTruthy();
    }
  });
});

describe("Die Mitte des Prozesses ist jetzt abgedeckt", () => {
  // Genau diese Stufen fehlten in den alten Kopien der Edge Functions.
  const frueherUeberspringen = [
    "nicht_erreicht",
    "erreicht",
    "erstgespraech_geplant",
    "beratungsgespraech",
    "selbstauskunft",
    "eg_noshow",
    "bg_noshow",
    "abrechnung",
  ];

  for (const stufe of frueherUeberspringen) {
    it(`überwacht "${stufe}"`, () => {
      const s = schwellenFuerStufe(stufe);
      expect(s, `${stufe} wird immer noch übersprungen`).not.toBeNull();
      expect(s!.orange).toBeLessThanOrEqual(s!.rot);
      expect(s!.rot).toBeLessThan(s!.final);
    });
  }

  it("kennt die abgeschaffte Stufe closing nicht mehr", () => {
    expect(istBekannteStufe("closing")).toBe(false);
  });

  it("führt vermoegensaufbau als vollwertige Stufe", () => {
    // Sie wurde früher auf "follow_up" umgeschrieben. Der
    // Versicherungsexperte sieht in der Pipeline aber ausschließlich diese
    // Spalte, und die blieb dadurch dauerhaft leer.
    expect(STUFEN_LABELS.vermoegensaufbau).toBe("Vermögensaufbau");
  });
});

describe("schwellenFuerStufe", () => {
  it("liefert null für abgeschlossene und verlorene Vorgänge", () => {
    for (const stufe of ["abgeschlossen", "archiviert", "verloren", "bestandsimport"]) {
      expect(schwellenFuerStufe(stufe), stufe).toBeNull();
    }
  });

  it("liefert null für Follow-Up, das misst der eigene Dienst in Stunden", () => {
    expect(NICHT_UEBERWACHTE_STUFEN.has("follow_up")).toBe(true);
    expect(schwellenFuerStufe("follow_up")).toBeNull();
  });

  it("liefert null für leere und unbekannte Stufen", () => {
    expect(schwellenFuerStufe(null)).toBeNull();
    expect(schwellenFuerStufe("")).toBeNull();
    expect(schwellenFuerStufe("gibt_es_nicht")).toBeNull();
  });

  it("trennt unbekannt von nicht überwacht", () => {
    // Beide liefern null, aber der Aufrufer muss sie auseinanderhalten können:
    // eine unbekannte Stufe ist ein Datenfehler und gehört gemeldet.
    expect(istBekannteStufe("abgeschlossen")).toBe(true);
    expect(istBekannteStufe("gibt_es_nicht")).toBe(false);
  });
});

describe("Hilfsfunktionen", () => {
  it("stufenLabel fällt auf den rohen Schlüssel zurück", () => {
    expect(stufenLabel("selbstauskunft")).toBe("Selbstauskunft");
    expect(stufenLabel("gibt_es_nicht")).toBe("gibt_es_nicht");
    expect(stufenLabel(null)).toBe("ohne Stufe");
  });

  it("tageSeit zählt ganze Tage und wird nie negativ", () => {
    const vorFuenfTagen = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(tageSeit(vorFuenfTagen)).toBe(5);
    expect(tageSeit(new Date(Date.now() + 86400000).toISOString())).toBe(0);
    expect(tageSeit(null)).toBe(0);
    expect(tageSeit("kein datum")).toBe(0);
  });
});
