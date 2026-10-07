import { describe, it, expect, vi } from "vitest";

/**
 * "Alle Kontakte" ist die Arbeitsliste. Verlorene und archivierte Kontakte
 * gehören dort nicht hinein, sie stehen unter "Verloren / Archiviert".
 *
 * Diese Tests sichern die Regel ab, nach der beide Ansichten entscheiden. Sie
 * muss an beiden Orten dieselbe sein, sonst taucht ein Kontakt entweder
 * doppelt auf oder verschwindet ganz.
 */

vi.mock("./investmentsStore", () => ({
  getInvestmentsByKontakt: () => [],
  getSaDataZurVorbelegung: () => null,
}));

import { getEffectivePipelineStufe } from "./kontaktPipeline";

type Kontakt = Parameters<typeof getEffectivePipelineStufe>[0];

const baue = (teil: Partial<Kontakt>): Kontakt =>
  ({ id: "k1", vorname: "Max", nachname: "Muster", ...teil }) as Kontakt;

/** Dieselbe Regel, die AlleKontakte und die Verloren-Seite anwenden. */
const istAbgelegt = (k: Kontakt): boolean => {
  if ((k as { archiviert?: boolean }).archiviert) return true;
  const stufe = getEffectivePipelineStufe(k);
  return stufe === "verloren" || stufe === "archiviert";
};

describe("Abgelegte Kontakte gehören nicht in die Arbeitsliste", () => {
  it("erkennt den Status verloren", () => {
    expect(istAbgelegt(baue({ status: "verloren" }))).toBe(true);
  });

  it("erkennt inaktiv ebenfalls als verloren, so wie die Pipeline", () => {
    expect(istAbgelegt(baue({ status: "inaktiv" }))).toBe(true);
  });

  it("erkennt archivierte Kontakte", () => {
    expect(istAbgelegt(baue({ archiviert: true }))).toBe(true);
  });

  it("lässt aktive Kontakte in der Arbeitsliste", () => {
    expect(istAbgelegt(baue({ status: "kontaktiert" }))).toBe(false);
    expect(istAbgelegt(baue({}))).toBe(false);
  });

  it("holt einen als verloren markierten Kontakt nicht über die Pipeline-Stufe zurück", () => {
    // Der Top-Level-Status hat Vorrang. Sonst könnte ein Auto-Trigger einen
    // verlorenen Lead wieder in eine aktive Stufe heben und er stünde erneut
    // in der Arbeitsliste.
    const k = baue({ status: "verloren", meta: { pipelineStufe: "erstgespraech" } } as Partial<Kontakt>);
    expect(getEffectivePipelineStufe(k)).toBe("verloren");
    expect(istAbgelegt(k)).toBe(true);
  });
});
