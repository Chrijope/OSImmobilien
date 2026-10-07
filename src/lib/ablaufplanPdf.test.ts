import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Rauchtest der PDF-Erzeugung des Ablaufplans: jsPDF wird durch eine Attrappe
 * ersetzt, die alle Zeichenaufrufe schluckt. Geprueft wird, dass die
 * Erzeugung nicht wirft und der Download mit dem Datumsnamen ausgeloest wird.
 * Gleiche Bauweise wie in anlageVPdf.test.ts.
 */
const { gespeichert } = vi.hoisted(() => ({ gespeichert: [] as string[] }));

vi.mock("jspdf", () => {
  class GState { constructor(_: unknown) {} }
  class JsPdfAttrappe {
    private seiten = 1;
    addFileToVFS() {}
    addFont() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setGState() {}
    rect() {}
    roundedRect() {}
    ellipse() {}
    circle() {}
    line() {}
    text() {}
    addImage() {}
    addPage() { this.seiten += 1; }
    setPage() {}
    getNumberOfPages() { return this.seiten; }
    getTextWidth(s: string) { return String(s).length * 1.5; }
    splitTextToSize(s: string) { return [String(s)]; }
    save(name: string) { gespeichert.push(name); }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});

import { generateAblaufplanPDF } from "@/lib/ablaufplanPdf";

beforeEach(() => { gespeichert.length = 0; });

describe("generateAblaufplanPDF", () => {
  it("erzeugt das PDF ohne Fehler und speichert es unter dem Datumsnamen", async () => {
    await expect(generateAblaufplanPDF()).resolves.toBeUndefined();
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0]).toMatch(/^MOREImmo-Ablaufplan-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe("Ablaufplan: Seite und PDF zeigen dasselbe", () => {
  it("hat für jede Station eine CRM-Anleitung", async () => {
    const { ABLAUF_STATIONEN } = await import("@/lib/ablaufplan");
    for (const station of ABLAUF_STATIONEN) {
      expect(station.imCrm, `Station "${station.titel}" hat keine CRM-Anleitung`).toBeTruthy();
      expect(station.imCrm!.length).toBeGreaterThan(0);
    }
  });

  it("liest die Grundregel aus derselben Quelle wie die Seite", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const seite = readFileSync(join(process.cwd(), "src/components/vertriebsakademie/AblaufplanZeitleiste.tsx"), "utf8");
    const pdf = readFileSync(join(process.cwd(), "src/lib/ablaufplanPdf.ts"), "utf8");
    // Beide müssen aus ABLAUF_GRUNDREGEL und station.imCrm lesen. Sobald einer
    // von beiden eigene Texte mitbringt, laufen sie auseinander.
    for (const quelle of [seite, pdf]) {
      expect(quelle).toContain("ABLAUF_GRUNDREGEL");
      expect(quelle).toContain("imCrm");
    }
  });

  it("nennt in der Grundregel die Ampel im Kundenprofil", async () => {
    const { ABLAUF_GRUNDREGEL } = await import("@/lib/ablaufplan");
    const text = ABLAUF_GRUNDREGEL.saetze.join(" ");
    expect(text).toContain("Ampel");
    expect(text).toContain("Termin geplant");
  });
});
