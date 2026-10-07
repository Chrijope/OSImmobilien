import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Sichtbarkeitsschalter fuer Investagon-Objekte (30.09.2026).
 *
 * Ausfuehren laesst sich die Migration hier nicht; der Quelltext haelt die
 * Regeln fest: nur die drei Rollen, nur Investagon-Objekte, nur die Spalte
 * `sichtbar`, und nie pauschal alle Objekte (siehe die Falle
 * 20260922120000_investagon_objekte_sofort_sichtbar).
 */

const DATEI = "20260930160000_objekt_sichtbarkeit_schalter.sql";
const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");
const SQL = lies(`supabase/migrations/${DATEI}`);
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Migration objekt_sichtbarkeit_schalter", () => {
  it("liegt, solange sie offen ist, deckungsgleich im Eingangskorb und in der Sammeldatei", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (!existsSync(resolve(__dirname, "../..", korb))) return;
    expect(lies(korb)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL.trim());
  });

  it("laeuft in einer Transaktion als geprüfte Funktion, nicht fuer anon", () => {
    expect(CODE.trim().startsWith("BEGIN;")).toBe(true);
    expect(CODE.trim().endsWith("COMMIT;")).toBe(true);
    expect(CODE).toContain("SECURITY DEFINER");
    expect(CODE).toContain("SET search_path = public");
    expect(CODE).toContain("REVOKE ALL ON FUNCTION public.objekt_sichtbarkeit_setzen(uuid, boolean) FROM public, anon;");
    expect(CODE).toContain("GRANT EXECUTE ON FUNCTION public.objekt_sichtbarkeit_setzen(uuid, boolean) TO authenticated;");
  });

  it("laesst nur Admin, Inhaber und Objektpartner schalten", () => {
    expect(CODE).toContain("public.is_admin_role(v_uid)");
    expect(CODE).toContain("public.has_role(v_uid, 'objektpartner'::public.app_role)");
    expect(CODE.indexOf("keine_berechtigung")).toBeLessThan(CODE.indexOf("UPDATE public.objekte"));
  });

  it("gilt nur fuer Investagon-Objekte, mit denselben Merkmalen wie ausInvestagon", () => {
    for (const merkmal of ["investagonRaw", "investagonId", "investagonVollSyncVersion", "api_property_id"]) {
      expect(CODE).toContain(`'${merkmal}'`);
    }
    expect(CODE.indexOf("kein_investagon_objekt")).toBeLessThan(CODE.indexOf("UPDATE public.objekte"));
  });

  it("aendert genau eine Spalte an genau einem Objekt", () => {
    const updates = CODE.match(/UPDATE public\.objekte[^;]*;/g) ?? [];
    expect(updates).toEqual(["UPDATE public.objekte SET sichtbar = p_sichtbar WHERE id = p_objekt_id;"]);
  });
});

/* ── Der Weg im Browser ─────────────────────────────────────────────────── */

const zustand = vi.hoisted(() => ({
  rpcAntwort: { data: null as unknown, error: null as unknown },
  rpcAufrufe: [] as Array<{ name: string; args: Record<string, unknown> }>,
  updates: [] as Array<{ tabelle: string; werte: Record<string, unknown> }>,
  updateAbgelehnt: false,
  neuGeladen: [] as string[],
}));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [], cacheFilter: () => [],
  cacheReload: async (t: string) => { zustand.neuGeladen.push(t); },
  cacheInsert: async () => ({}), cacheUpdate: async () => true, cacheDelete: async () => true,
  cacheSet: () => {}, cacheUpsert: async () => ({}),
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false, localGet: () => [], localSet: () => {} }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_k: string, f: unknown) => f, setUserSetting: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      zustand.rpcAufrufe.push({ name, args });
      return zustand.rpcAntwort;
    },
    from: (tabelle: string) => ({
      update: (werte: Record<string, unknown>) => ({
        eq: () => ({
          select: async () => {
            zustand.updates.push({ tabelle, werte });
            return zustand.updateAbgelehnt ? { data: [], error: null } : { data: [{ id: "o-1" }], error: null };
          },
        }),
      }),
    }),
  },
}));

const { setObjektSichtbar } = await import("@/lib/objekteStore");
const FEHLT = { code: "PGRST202", message: "Could not find the function" };

beforeEach(() => {
  zustand.rpcAntwort = { data: null, error: null };
  zustand.rpcAufrufe = [];
  zustand.updates = [];
  zustand.updateAbgelehnt = false;
  zustand.neuGeladen = [];
});

describe("setObjektSichtbar", () => {
  it("schaltet ueber objekt_sichtbarkeit_setzen und schreibt nicht selbst", async () => {
    zustand.rpcAntwort = { data: { ok: true, sichtbar: false }, error: null };
    await expect(setObjektSichtbar("o-1", false)).resolves.toEqual({ ok: true });
    expect(zustand.rpcAufrufe).toEqual([{ name: "objekt_sichtbarkeit_setzen", args: { p_objekt_id: "o-1", p_sichtbar: false } }]);
    expect(zustand.updates).toEqual([]);
    expect(zustand.neuGeladen).toContain("objekte");
  });

  it("meldet eine Ablehnung, statt Erfolg vorzutaeuschen", async () => {
    zustand.rpcAntwort = { data: { ok: false, grund: "keine_berechtigung" }, error: null };
    const ergebnis = await setObjektSichtbar("o-1", true);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehlerText).toMatch(/Admin, Inhaber und Objektpartner/);
    expect(zustand.updates).toEqual([]);
  });

  it("nimmt ohne Migration den direkten Weg, nur die Spalte sichtbar", async () => {
    zustand.rpcAntwort = { data: null, error: FEHLT };
    await expect(setObjektSichtbar("o-1", true)).resolves.toEqual({ ok: true });
    expect(zustand.updates).toEqual([{ tabelle: "objekte", werte: { sichtbar: true } }]);
  });

  it("wertet ohne Migration null geaenderte Zeilen als Ablehnung", async () => {
    zustand.rpcAntwort = { data: null, error: FEHLT };
    zustand.updateAbgelehnt = true;
    const ergebnis = await setObjektSichtbar("o-1", false);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehlerText).toMatch(/abgelehnt/);
  });

  it("faellt bei einem anderen Fehler nicht auf das direkte Schreiben zurueck", async () => {
    zustand.rpcAntwort = { data: null, error: { code: "42501", message: "permission denied" } };
    const ergebnis = await setObjektSichtbar("o-1", false);
    expect(ergebnis.ok).toBe(false);
    expect(zustand.updates).toEqual([]);
  });
});
