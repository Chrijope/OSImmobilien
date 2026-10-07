import { describe, it, expect } from "vitest";
import { PIPELINE_STUFEN, STUFEN_WAHRSCHEINLICHKEIT } from "@/lib/pipelineStufen";

/**
 * Wacht über die neue Reihenfolge, die am 06.08.2026 gedreht wurde:
 * Objektauswahl und Reservierung stehen jetzt VOR den Bonitätsunterlagen.
 */

const pos = (key: string) => PIPELINE_STUFEN.findIndex((s) => s.key === key);

describe("Reihenfolge der Pipelinestufen", () => {
  it("stellt Objektauswahl und Reservierung vor die Bonitaet", () => {
    expect(pos("objektauswahl")).toBeLessThan(pos("bonitaetsunterlagen"));
    expect(pos("reservierung")).toBeLessThan(pos("bonitaetsunterlagen"));
  });

  it("laesst die Selbstauskunft vor der Objektauswahl", () => {
    // Erst unterschreibt der Kunde die Selbstauskunft, dann sucht er ein Objekt.
    expect(pos("selbstauskunft")).toBeLessThan(pos("objektauswahl"));
    expect(pos("beratungsgespraech")).toBeLessThan(pos("selbstauskunft"));
  });

  it("haelt die Reihenfolge Objektauswahl, Reservierung, Bonitaet, Finanzierung ein", () => {
    const kette = ["objektauswahl", "reservierung", "bonitaetsunterlagen", "finanzierung", "notar"];
    for (let i = 1; i < kette.length; i++) {
      expect(pos(kette[i]), `${kette[i]} muss hinter ${kette[i - 1]} liegen`)
        .toBeGreaterThan(pos(kette[i - 1]));
    }
  });

  it("bewertet eine Reservierung ohne Bonitaet niedriger als mit", () => {
    // Sie ist weniger wert als frueher, wo die Bonitaet schon dahinter lag.
    expect(STUFEN_WAHRSCHEINLICHKEIT.reservierung)
      .toBeLessThan(STUFEN_WAHRSCHEINLICHKEIT.bonitaetsunterlagen);
  });
});

describe("Bonitaetspruefung haelt, was ihr Name verspricht", () => {
  it("meldet erst dann freigegeben, wenn jedes Pflichtdokument geprueft ist", async () => {
    const { sindDokumenteFreigegeben } = await import("@/lib/kontaktPipeline");
    const { REQUIRED_BONITAET_DOCS } = await import("@/lib/bonitaetDocs");
    const status: Record<string, string> = {};

    expect(sindDokumenteFreigegeben(status), "nichts geprueft").toBe(false);
    expect(sindDokumenteFreigegeben(null), "gar keine Angaben").toBe(false);

    // Hochgeladen heisst nicht geprueft. "uploaded" sagt nur, dass eine Datei
    // da ist, nicht dass jemand hineingesehen hat.
    for (const d of REQUIRED_BONITAET_DOCS) status[d] = "uploaded";
    expect(sindDokumenteFreigegeben(status), "nur hochgeladen").toBe(false);

    // Eines fehlt noch.
    for (const d of REQUIRED_BONITAET_DOCS) status[d] = "approved";
    status[REQUIRED_BONITAET_DOCS[0]] = "uploaded";
    expect(sindDokumenteFreigegeben(status), "eines offen").toBe(false);

    status[REQUIRED_BONITAET_DOCS[0]] = "approved";
    expect(sindDokumenteFreigegeben(status), "alle freigegeben").toBe(true);
  });

  it("laesst sich von einem abgelehnten Dokument nicht taeuschen", async () => {
    const { sindDokumenteFreigegeben } = await import("@/lib/kontaktPipeline");
    const { REQUIRED_BONITAET_DOCS } = await import("@/lib/bonitaetDocs");
    const status: Record<string, string> = {};
    for (const d of REQUIRED_BONITAET_DOCS) status[d] = "approved";
    status[REQUIRED_BONITAET_DOCS[1]] = "rejected";
    expect(sindDokumenteFreigegeben(status)).toBe(false);
  });
});

describe("Investments in den neuen Stufen zaehlen weiterhin", () => {
  it("die Grenze fuer echte Investments liegt vor Objektauswahl und Reservierung", async () => {
    /*
     * Beim Drehen der Reihenfolge war das die gefaehrlichste Stelle: Die
     * Grenze zeigte auf "bonitaetsunterlagen", die dabei hinter die
     * Reservierung gerutscht ist. Investments in "objektauswahl" und
     * "reservierung" waeren damit uebersprungen worden, und ein Kunde mit
     * unterschriebener Reservierungsvereinbarung waere aus der Pipeline
     * gefallen.
     */
    const { PIPELINE_STUFEN } = await import("@/lib/pipelineStufen");
    const stelle = (k: string) => PIPELINE_STUFEN.findIndex((s) => s.key === k);
    const grenze = stelle("selbstauskunft");
    for (const stufe of ["objektauswahl", "reservierung", "bonitaetsunterlagen", "finanzierung"]) {
      expect(stelle(stufe), `${stufe} muss hinter der Grenze liegen`).toBeGreaterThanOrEqual(grenze);
    }
    // Und die Stubs davor bleiben draussen.
    for (const stub of ["erstgespraech", "beratungsgespraech", "eg_noshow", "bg_noshow"]) {
      expect(stelle(stub), `${stub} muss vor der Grenze liegen`).toBeLessThan(grenze);
    }
  });
});

describe("Die Phasenleiste im Investment zeigt dasselbe wie die Pipeline", () => {
  it("kennt dieselbe Reihenfolge der Hauptstufen", async () => {
    /*
     * Die Leiste im Kundenprofil fuehrte lange eine eigene Liste. Sie lief
     * zweimal auseinander: Erst standen die Bonitaetsunterlagen weiter vor der
     * Objektauswahl und die Selbstauskunft fehlte ganz, dann fehlten die fuenf
     * frueheren Stufen. Jetzt ist sie aus PIPELINE_STUFEN abgeleitet, dieser
     * Test wacht darueber, dass sie es bleibt.
     */
    const { PIPELINE_STUFEN, FORTSCHRITT_STUFEN } = await import("@/lib/pipelineStufen");
    const quelle: string[] = PIPELINE_STUFEN.map((s) => s.key as string);
    const leiste: string[] = FORTSCHRITT_STUFEN.map((s) => s.key as string);

    for (let i = 1; i < leiste.length; i++) {
      expect(
        quelle.indexOf(leiste[i]),
        `${leiste[i]} steht in der Leiste hinter ${leiste[i - 1]}, in der Pipeline aber davor`,
      ).toBeGreaterThan(quelle.indexOf(leiste[i - 1]));
    }
  });
});

describe("Bereichs-Zuordnung, wie sie das Info-Fenster im Kundenprofil zeigt", () => {
  it("ordnet jede Stufe der Leiste einem Bereich zu", async () => {
    // Das Info-Fenster rechnet die Zuordnung aus getProzessBereichForStufe aus,
    // statt sie zu tippen. Faellt eine Stufe aus allen Bereichen heraus, waere
    // sie dort unsichtbar.
    const { getProzessBereichForStufe } = await import("@/lib/kontaktPipeline");
    const { FORTSCHRITT_STUFEN } = await import("@/lib/pipelineStufen");
    const gezeigt = new Set(["leadverwaltung", "followup", "kontakte", "neukunden", "abwicklung", "bestandskunden"]);
    for (const stufe of FORTSCHRITT_STUFEN) {
      expect(gezeigt.has(getProzessBereichForStufe(stufe.key)), `${stufe.key} faellt aus allen Bereichen`).toBe(true);
    }
  });

  it("haelt die Zuordnung, die der handgeschriebene Text falsch hatte", async () => {
    /*
     * Der alte Text nannte bei den Neukunden nur Bonitaet und Objektauswahl,
     * schrieb Faelligkeit und Abrechnung den Bestandskunden zu und steckte
     * Follow-Up in die Lead-Verwaltung. Alle drei Angaben widersprachen dem
     * Code. Massgeblich ist der Code.
     */
    const { getProzessBereichForStufe } = await import("@/lib/kontaktPipeline");
    expect(getProzessBereichForStufe("selbstauskunft")).toBe("neukunden");
    expect(getProzessBereichForStufe("faelligkeit")).toBe("abwicklung");
    expect(getProzessBereichForStufe("abrechnung")).toBe("abwicklung");
    expect(getProzessBereichForStufe("follow_up")).toBe("followup");
    expect(getProzessBereichForStufe("abgeschlossen")).toBe("bestandskunden");
  });
});
