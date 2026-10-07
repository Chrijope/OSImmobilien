/**
 * Die Auswertung je Kampagne in der Statistik: Leads, Termine,
 * Reservierungen und Abschlüsse, gezählt mit denselben Nachweisen wie der
 * Trichter "Conversion".
 */
import { describe, expect, it } from "vitest";
import { kampagnenAuswertung, type Row } from "@/lib/statistikController";
import { OHNE_KAMPAGNE } from "@/lib/kampagnenKennung";

const kontakt = (id: string, kampagne: string | null, meta: Record<string, unknown> = {}): Row => ({
  id,
  quelle: "Meta Ads: München",
  meta: { ...(kampagne ? { kampagne: { utmCampaign: kampagne } } : {}), ...meta },
});

describe("kampagnenAuswertung", () => {
  const kontakte: Row[] = [
    kontakt("a", "herbst_video", { erstgespraechTermin: "2026-09-10" }),
    kontakt("b", "herbst_video", { setterTerminGebucht: true }),
    kontakt("c", "herbst_video"),
    kontakt("d", "herbst_bild"),
    kontakt("e", null, { erstgespraechAt: "2026-09-11" }),
  ];
  const investments: Row[] = [
    { id: "i1", kunde_id: "a", meta: { rvSigned: true, pipelineStufe: "abgeschlossen" } },
    { id: "i2", kunde_id: "b", meta: { rvSigned: true } },
    // Storniert: zählt weder als Reservierung noch als Abschluss.
    { id: "i3", kunde_id: "d", storniert: true, meta: { rvSigned: true, pipelineStufe: "abgeschlossen" } },
  ];

  const zeilen = kampagnenAuswertung(kontakte, investments);
  const zeile = (name: string) => zeilen.find((z) => z.kampagne === name)!;

  it("zählt Leads, Termine, Reservierungen und Abschlüsse je Kampagne", () => {
    expect(zeile("herbst_video")).toMatchObject({ leads: 3, termine: 2, reservierungen: 2, abschluesse: 1 });
    expect(zeile("herbst_video").abschlussquote).toBeCloseTo(33.33, 1);
  });

  it("zählt stornierte Investments nicht mit", () => {
    expect(zeile("herbst_bild")).toMatchObject({ leads: 1, reservierungen: 0, abschluesse: 0 });
  });

  it("stellt Leads ohne Kennung in die Sammelzeile, und zwar ans Ende", () => {
    expect(zeilen[zeilen.length - 1].kampagne).toBe(OHNE_KAMPAGNE);
    expect(zeile(OHNE_KAMPAGNE)).toMatchObject({ leads: 1, termine: 1 });
  });

  it("verliert keinen Lead", () => {
    expect(zeilen.reduce((s, z) => s + z.leads, 0)).toBe(kontakte.length);
  });
});
