import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * „permission denied for table bewerbungen“ (Meldung aus Lovable, 28.09.2026).
 *
 * Seit 20260927060000 hat `anon` keine Rechte mehr auf `bewerbungen`, und
 * lesen dürfen nur hr, admin, inhaber und backoffice (dazu der Bewerber seine
 * Zeile). Der Browser fragte die Tabelle trotzdem für jede Rolle ab, und nach
 * dem Abmelden liefen Cache, Realtime und Seitenleisten-Zähler mit dem
 * öffentlichen Schlüssel weiter. Hier wird festgehalten, dass beides nicht
 * mehr passiert.
 */

const state = vi.hoisted(() => ({
  zeilen: {} as Record<string, Array<{ id: string }>>,
  abfragen: [] as string[],
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  class FakeQuery {
    constructor(private table: string) {}
    select() { return this; }
    or() { return this; }
    order() { return this; }
    limit() { return this; }
    range() { return this; }
    abortSignal() { return this; }
    eq() { return this; }
    then(resolve: (r: { data: unknown[]; error: null }) => void) {
      state.abfragen.push(this.table);
      resolve({ data: state.zeilen[this.table] || [], error: null });
    }
  }
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: (table: string) => new FakeQuery(table),
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

import { cacheGet, cacheRolleSetzen, initDataCache, isTableLoaded, ladeTabellen, resetCache } from "./dataCache";

describe("dataCache: Bewerbungen nur für berechtigte Rollen", () => {
  beforeEach(() => {
    resetCache();
    state.zeilen = { bewerbungen: [{ id: "b1" }], kontakte: [{ id: "k1" }] };
    state.abfragen = [];
  });

  afterEach(() => {
    resetCache();
  });

  it.each(["vertriebspartner", "vertriebsleitung", "setterin", "kunde", "tippgeber", ""])(
    "Rolle %s fragt bewerbungen nicht ab und bekommt eine leere, geladene Liste",
    async (rolle) => {
      cacheRolleSetzen(rolle);
      await initDataCache({ sofort: ["kontakte", "bewerbungen"] });

      expect(state.abfragen).toContain("kontakte");
      expect(state.abfragen).not.toContain("bewerbungen");
      // Geladen, damit keine Seite auf die Tabelle wartet.
      expect(isTableLoaded("bewerbungen")).toBe(true);
      expect(cacheGet("bewerbungen")).toEqual([]);
    },
  );

  it.each(["hr", "admin", "inhaber", "backoffice", "bewerber"])("Rolle %s lädt bewerbungen", async (rolle) => {
    cacheRolleSetzen(rolle);
    await initDataCache({ sofort: ["bewerbungen"] });

    expect(state.abfragen).toContain("bewerbungen");
    expect(cacheGet("bewerbungen")).toEqual([{ id: "b1" }]);
  });

  it("Rollenwechsel lädt nach der neuen Rolle neu", async () => {
    cacheRolleSetzen("vertriebspartner");
    await initDataCache({ sofort: ["bewerbungen"] });
    expect(cacheGet("bewerbungen")).toEqual([]);

    cacheRolleSetzen("hr");
    await ladeTabellen(["bewerbungen"]);
    expect(cacheGet("bewerbungen")).toEqual([{ id: "b1" }]);

    // Zurück auf eine Vertriebsrolle: der Stand der HR-Rolle bleibt nicht liegen.
    state.abfragen = [];
    cacheRolleSetzen("vertriebspartner");
    await ladeTabellen(["bewerbungen"]);
    expect(cacheGet("bewerbungen")).toEqual([]);
    expect(state.abfragen).not.toContain("bewerbungen");
  });

  it("nach dem Abmelden ist die Rolle vergessen", async () => {
    cacheRolleSetzen("hr");
    resetCache();
    await initDataCache({ sofort: ["bewerbungen"] });
    expect(state.abfragen).not.toContain("bewerbungen");
  });
});

describe("keine Abfrage von bewerbungen außerhalb des Caches", () => {
  it("die Seitenleisten-Zähler lesen bewerbungen nicht mehr (der Zähler war ungenutzt)", () => {
    const code = readFileSync("src/hooks/useSidebarCounts.ts", "utf8");
    expect(code).not.toContain("bewerbungen");
    // Ohne Anmeldung weder Zähler noch Kanal.
    expect(code).toMatch(/if \(!userId\) return;\s*fetchCounts\(\);/);
  });

  it("beim Abmelden wird der Cache samt Realtime geschlossen", () => {
    const code = readFileSync("src/contexts/UserContext.tsx", "utf8");
    const zweig = code.slice(code.indexOf('if (event === "SIGNED_OUT")'));
    expect(zweig.slice(0, zweig.indexOf("return;"))).toContain("resetCache();");
  });
});
