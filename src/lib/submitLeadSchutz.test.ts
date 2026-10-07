/**
 * Drei Befunde an submit-lead vom 26.09.2026.
 *
 *   HB-002  Ein Browser erfaehrt nicht, ob eine Adresse bekannt ist oder
 *           welchem Partner sie gehoert. Details nur mit HMAC-Signatur.
 *   HB-007  Auf der Handbuch-Seite ist die Einwilligung serverseitig Pflicht.
 *   HB-001  Eine Dublette ueberschreibt den ersten Konfigurator-Stand nicht.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { leadAntwort } from "../../supabase/functions/_shared/lead-zuordnung.ts";
import { HANDBUCH_FASSUNGEN, handbuchEinwilligungGueltig } from "../../supabase/functions/_shared/lead-einwilligung.ts";
import { handbuchFunnelFuerDublette } from "../../supabase/functions/_shared/handbuch-anlage.ts";
import {
  HANDBUCH_EINWILLIGUNG_VERSION,
  HANDBUCH_EINWILLIGUNG_VERSION_EN,
  HANDBUCH_SA_EINWILLIGUNG_VERSION,
  HANDBUCH_SA_EINWILLIGUNG_VERSION_EN,
  baueHandbuchEinwilligung,
  baueHandbuchSaEinwilligung,
  baueLeadEinwilligung,
} from "@/lib/leadEinwilligung";

const quelle = readFileSync(join(process.cwd(), "supabase/functions/submit-lead/index.ts"), "utf8");

describe("HB-002: neutrale Antwort an den Browser", () => {
  const neu = { kontaktId: "k-neu", leadTyp: "standard" as const, zugewiesenAn: "vp-a" };
  const dublette = { kontaktId: "k-alt", leadTyp: "standard" as const, zugewiesenAn: "vp-b", dublette: { erkanntUeber: "email" } };

  it("ohne Signatur: neuer Lead und Dublette sehen gleich aus, ohne Kennungen", () => {
    const a = leadAntwort({ signiert: false, ...neu });
    const b = leadAntwort({ signiert: false, ...dublette });
    expect(a).toEqual(b);
    expect(a).toEqual({ success: true, leadTyp: "standard" });
  });

  it("mit Signatur: alle Angaben fuer die Integration", () => {
    expect(leadAntwort({ signiert: true, ...dublette })).toEqual({
      success: true, kontaktId: "k-alt", dublette: true, erkanntUeber: "email", leadTyp: "standard", zugewiesenAn: "vp-b",
    });
    expect(leadAntwort({ signiert: true, ...neu })).toEqual({
      success: true, kontaktId: "k-neu", leadTyp: "standard", zugewiesenAn: "vp-a",
    });
  });

  it("submit-lead antwortet nur ueber leadAntwort und nennt keine Fehlerdetails", () => {
    expect(quelle.match(/leadAntwort\(\{\s*signiert: signatureStatus === "verified"/g)?.length).toBe(2);
    expect(quelle).not.toMatch(/zugewiesenAn: (bestandsVpId|zustaendigId),\s*\}\),/);
    expect(quelle).not.toContain('"Speichern fehlgeschlagen", details');
  });
});

describe("HB-007: Einwilligung auf der Handbuch-Seite", () => {
  it("die Fassungen des Servers sind die des Browsers", () => {
    expect([...HANDBUCH_FASSUNGEN.konfigurator]).toEqual([HANDBUCH_EINWILLIGUNG_VERSION, HANDBUCH_EINWILLIGUNG_VERSION_EN]);
    expect([...HANDBUCH_FASSUNGEN.selbstauskunft]).toEqual([HANDBUCH_SA_EINWILLIGUNG_VERSION, HANDBUCH_SA_EINWILLIGUNG_VERSION_EN]);
  });

  it("nimmt an, was die Formulare schicken, in beiden Sprachen", () => {
    expect(handbuchEinwilligungGueltig(baueHandbuchEinwilligung(true, false), "konfigurator")).toBe(true);
    expect(handbuchEinwilligungGueltig(baueHandbuchEinwilligung(true, true, undefined, "en"), "konfigurator")).toBe(true);
    expect(handbuchEinwilligungGueltig(baueHandbuchSaEinwilligung(true, false), "selbstauskunft")).toBe(true);
    expect(handbuchEinwilligungGueltig(baueHandbuchSaEinwilligung(true, false, undefined, "en"), "selbstauskunft")).toBe(true);
  });

  it("weist fehlende, verweigerte, fremde und leere Einwilligungen ab", () => {
    expect(handbuchEinwilligungGueltig(undefined, "konfigurator")).toBe(false);
    expect(handbuchEinwilligungGueltig(null, "konfigurator")).toBe(false);
    expect(handbuchEinwilligungGueltig(true, "konfigurator")).toBe(false);
    expect(handbuchEinwilligungGueltig(baueHandbuchEinwilligung(false, false), "konfigurator")).toBe(false);
    expect(handbuchEinwilligungGueltig({ ...baueHandbuchEinwilligung(true, false), erteilt: false }, "konfigurator")).toBe(false);
    expect(handbuchEinwilligungGueltig({ version: HANDBUCH_EINWILLIGUNG_VERSION, text: "x" }, "konfigurator")).toBe(false);
    expect(handbuchEinwilligungGueltig({ ...baueHandbuchEinwilligung(true, false), text: " " }, "konfigurator")).toBe(false);
    // Die Fassung der Analyse-Formulare zaehlt hier nicht, ebenso wenig die des anderen Weges.
    expect(handbuchEinwilligungGueltig(baueLeadEinwilligung(true, false), "konfigurator")).toBe(false);
    expect(handbuchEinwilligungGueltig(baueHandbuchSaEinwilligung(true, false), "konfigurator")).toBe(false);
    expect(handbuchEinwilligungGueltig(baueHandbuchEinwilligung(true, false), "selbstauskunft")).toBe(false);
  });

  it("submit-lead prueft vor der ersten Anlage", () => {
    const pruefung = quelle.indexOf("handbuchEinwilligungGueltig(");
    expect(pruefung).toBeGreaterThan(0);
    expect(pruefung).toBeLessThan(quelle.indexOf("createClient(\n"));
    expect(pruefung).toBeLessThan(quelle.indexOf(".insert(insertPayload)"));
    expect(pruefung).toBeLessThan(quelle.indexOf("handbuchNachLeadAnlegen(supabaseAdmin"));
  });
});

describe("HB-001: erster Konfigurator-Stand bleibt", () => {
  const alt = { antworten: { ziel: "alt" }, zeitpunkt: "2026-09-01T10:00:00Z" };
  const neu = { antworten: { ziel: "neu" }, zeitpunkt: "2026-09-26T10:00:00Z" };

  it("ueberschreibt einen vorhandenen Stand nicht", () => {
    expect(handbuchFunnelFuerDublette({ handbuchFunnel: alt }, neu)).toEqual({});
  });

  it("setzt den Stand, wenn der Kontakt noch keinen hat", () => {
    expect(handbuchFunnelFuerDublette({}, neu)).toEqual({ handbuchFunnel: neu });
    expect(handbuchFunnelFuerDublette({ handbuchSelbstauskunft: { zeitpunkt: "x" } }, neu)).toEqual({ handbuchFunnel: neu });
  });

  it("ohne neuen Stand passiert nichts", () => {
    expect(handbuchFunnelFuerDublette({}, undefined)).toEqual({});
  });

  it("submit-lead nutzt die Regel, die neue Einsendung bleibt im Verlauf", () => {
    expect(quelle).toContain("handbuchFunnelFuerDublette(bestehendeMeta, (meta as any).handbuchFunnel)");
    expect(quelle).not.toContain("{ handbuchFunnel: (meta as any).handbuchFunnel }");
    // Die Anfrage mit ihrem vollen `meta` (Antworten, Ausgang, Rahmen, Zeitpunkt, Kampagne).
    expect(quelle).toContain("if (meta && typeof meta === \"object\") angaben.meta = meta;");
    expect(quelle).toContain("weitereAnfragen: [...bisherigeAnfragen, anfrage].slice(-25)");
  });
});
