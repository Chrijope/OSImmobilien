/**
 * Fehler vom 01.10.2026: Nach "Stattgefunden" blieb der Kasten
 * "Beratungsgespräch: Ergebnis" stehen.
 *
 * Das Kundenprofil arbeitet mit KundeData aus `dbRowToKunde`, und das traegt
 * kein `meta`. `meta.erledigteTermine` war dort deshalb immer leer. Bewacht
 * wird hier mit einem echten `dbRowToKunde`, nicht mit einem Kontakt, dem der
 * Test von Hand ein meta mitgibt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({
  zeile: null as Record<string, unknown> | null,
  merge: vi.fn(),
}));

vi.mock("./dataCache", async (orig) => ({
  ...(await orig<typeof import("./dataCache")>()),
  cacheGet: (tabelle: string) => (tabelle === "kontakte" && t.zeile ? [t.zeile] : []),
}));
vi.mock("./investmentsStore", async (orig) => ({
  ...(await orig<typeof import("./investmentsStore")>()),
  // Der Beratungstermin steht nur am Investment, wie im gemeldeten Fall.
  getInvestmentsByKontakt: () => [
    { id: "inv-1", pipelineStufe: "beratungsgespraech", meta: { beratungsgespraechAm: "2026-06-24", beratungsgespraechUhrzeit: "12:30" } },
  ],
  updateInvestment: () => {},
}));
vi.mock("./kontaktPipeline", async (orig) => ({
  ...(await orig<typeof import("./kontaktPipeline")>()),
  getEffectivePipelineStufe: () => "beratungsgespraech",
}));
vi.mock("./aktivitaetenStore", async (orig) => ({
  ...(await orig<typeof import("./aktivitaetenStore")>()),
  addAktivitaet: () => {},
}));
vi.mock("./kundenStore", async (orig) => ({
  ...(await orig<typeof import("./kundenStore")>()),
  updateKontakt: () => Promise.resolve(true),
  mergeKontaktMetaMitGrund: async (_id: string, patch: Record<string, unknown>) => {
    t.merge(patch);
    // Wie im echten Store: die neue meta landet in der Zeile im Zwischenspeicher.
    t.zeile = { ...t.zeile!, meta: { ...(t.zeile!.meta as object), ...patch } };
    return { ok: true };
  },
}));

const { dbRowToKunde } = await import("./kundenStore");
const { festeTermine } = await import("./kontaktTermine");
const { festerTerminStattgefunden } = await import("./festerTerminErgebnis");

beforeEach(() => {
  t.merge.mockClear();
  t.zeile = { id: "k-1", vorname: "Test", nachname: "Kunde", meta: { erledigteTermine: ["2026-05-01 09:00"] } };
});

describe("Stattgefunden am Beratungsgespräch im Kundenprofil", () => {
  it("nimmt den Termin aus der Liste, obwohl KundeData kein meta traegt", async () => {
    const kunde = dbRowToKunde(t.zeile);
    expect((kunde as { meta?: unknown }).meta).toBeUndefined();
    expect(festeTermine(kunde).map((x) => x.bezeichnung)).toEqual(["Beratungsgespräch"]);

    const ok = await festerTerminStattgefunden(
      { titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "12:30" },
      { kunde, userName: "Admin", melde: () => {} },
    );
    expect(ok).toBe(true);
    // Der fruehere Eintrag bleibt erhalten, statt ueberschrieben zu werden.
    expect(t.merge).toHaveBeenCalledWith({ erledigteTermine: ["2026-05-01 09:00", "2026-06-24 12:30"] });
    // Nach dem Neuladen (frisches KundeData aus der Zeile) ist der Kasten weg.
    expect(festeTermine(dbRowToKunde(t.zeile))).toEqual([]);
  });
});
