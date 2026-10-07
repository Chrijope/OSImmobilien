/**
 * `addKontakt` mit Kundensprache (Plan Kundensprache vom 25.09.2026).
 *
 * Seit Etappe 0 schickt „Kontakt anlegen“ bei jedem Anlegen die Sprache in
 * `meta` mit. Vorher gab es dort nur Meta-Felder, wenn ein Empfehlungsgeber
 * eingetragen war; ohne Meta-Felder setzte `addKontakt` den Kontakt-Typ
 * „eigen“. Diese Regel darf die Sprache nicht aushebeln.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({ eingefuegt: [] as Array<Record<string, any>> }));

vi.mock("./dataCache", () => ({
  cacheGet: () => [],
  cacheSet: vi.fn(),
  cacheInsert: async (_tabelle: string, zeile: Record<string, any>) => { t.eingefuegt.push(zeile); return zeile; },
  cacheUpdate: vi.fn(),
  cacheDelete: vi.fn(),
  onCacheChange: () => () => undefined,
  getCacheVersion: () => 0,
  grosseOperationBeginnen: vi.fn(),
  grosseOperationBeenden: vi.fn(),
}));
vi.mock("./dbStoreHelper", () => ({ isTestAccount: () => false, localGet: (_k: string, f: unknown) => f, localSet: vi.fn() }));
vi.mock("./currentUser", () => ({ getCurrentUserId: () => "u1" }));
vi.mock("./aktivitaetenStore", () => ({ addAktivitaet: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

const { addKontakt } = await import("./kundenStore");
const { kundenSpracheMetaPatch } = await import("./kundenSprache");

beforeEach(() => { t.eingefuegt = []; });

describe("addKontakt und die Kundensprache", () => {
  it("nur die Sprache in meta: Kontakt-Typ „eigen“ bleibt, Sprache ist gespeichert", async () => {
    await addKontakt({ vorname: "Jane", nachname: "Doe", meta: kundenSpracheMetaPatch("en", "u1") } as never);
    const meta = t.eingefuegt[0].meta;
    expect(meta).toMatchObject({ kundenSprache: "en", kundenSpracheGesetztVon: "u1", kontaktTyp: "eigen", herkunftKanal: "Manuell" });
    expect(typeof meta.kundenSpracheGesetztAm).toBe("string");
  });

  it("ohne meta wie bisher „eigen“", async () => {
    await addKontakt({ vorname: "Max", nachname: "Muster" });
    expect(t.eingefuegt[0].meta).toMatchObject({ kontaktTyp: "eigen" });
    expect(t.eingefuegt[0].meta.kundenSprache).toBeUndefined();
  });

  it("mit weiteren Meta-Feldern wie bisher ohne Rückfall", async () => {
    await addKontakt({ vorname: "Eva", nachname: "E", meta: { ...kundenSpracheMetaPatch("de", "u1"), empfehlungsgeber: true } } as never);
    const meta = t.eingefuegt[0].meta;
    expect(meta.kundenSprache).toBe("de");
    expect(meta.kontaktTyp).toBeUndefined();
  });
});
