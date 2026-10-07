import { describe, expect, it, vi } from "vitest";

/*
 * M20a (04.10.2026): Die höchste Investment-Stufe und der Abgleich der
 * Kontakt-Stufe folgen fortschrittsRang und istEndzustand aus
 * pipelineStufen.ts. Vorher zählte die Position in PIPELINE_STUFEN, wo
 * Verloren, Archiviert und Vermögensaufbau ganz hinten stehen.
 */

const inv = vi.hoisted(() => ({ liste: [] as Array<{ id: string; pipelineStufe: string }> }));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentsByKontakt: () => inv.liste,
  getSaSigned: () => false,
  getRvSigned: () => false,
  getSaSignaturePending: () => false,
}));
vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [] }));

const { getEffectivePipelineStufe } = await import("./kontaktPipeline");
const kunde = { id: "k-1", vorname: "A", nachname: "B", status: "kunde", pipelineStufe: "neuer_lead" } as never;

describe("höchste Investment-Stufe", () => {
  it("eine Altstufe am Ende der Liste schlägt keinen echten Fortschritt", () => {
    inv.liste = [{ id: "a", pipelineStufe: "notar" }, { id: "b", pipelineStufe: "vermoegensaufbau" }];
    expect(getEffectivePipelineStufe(kunde)).toBe("notar");
  });

  it("abgeschlossen gewinnt gegen verloren, wenn nichts mehr läuft", () => {
    inv.liste = [{ id: "a", pipelineStufe: "abgeschlossen" }, { id: "b", pipelineStufe: "verloren" }];
    expect(getEffectivePipelineStufe(kunde)).toBe("abgeschlossen");
  });

  it("nur Endzustände: der Endzustand", () => {
    inv.liste = [{ id: "a", pipelineStufe: "verloren" }];
    expect(getEffectivePipelineStufe(kunde)).toBe("verloren");
  });

  it("ein laufendes Investment zählt vor einem abgeschlossenen", () => {
    inv.liste = [{ id: "a", pipelineStufe: "abgeschlossen" }, { id: "b", pipelineStufe: "reservierung" }];
    expect(getEffectivePipelineStufe(kunde)).toBe("reservierung");
  });
});
