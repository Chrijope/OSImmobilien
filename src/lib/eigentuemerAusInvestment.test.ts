import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Eigentümer-Übernahme nach dem Notartermin (H3, 04.10.2026).
 *
 * Partner und Backoffice durften seit 20260930120000 nicht mehr direkt in
 * `eigentuemer` anlegen. Die Übernahme scheiterte still, die Stufe sprang
 * trotzdem weiter. Jetzt: geprüfte Funktion, Erfolg erst nach der Antwort.
 */

const cache = vi.hoisted(() => ({
  zeilen: [] as Record<string, unknown>[],
  insert: vi.fn(),
  refresh: vi.fn(async () => {}),
}));

vi.mock("./dataCache", () => ({
  cacheGet: () => cache.zeilen,
  cacheInsert: cache.insert,
  cacheUpdate: vi.fn(),
  cacheDelete: vi.fn(),
  cacheRefreshTable: cache.refresh,
  isTableLoaded: () => true,
}));
vi.mock("./dbStoreHelper", () => ({ isTestAccount: () => false, localGet: () => [], localSet: () => {} }));

const { eigentuemerAusInvestment, lesbarerUebernahmeGrund } = await import("./eigentuemerStore");

const ANGABEN = {
  kontaktId: "k-1", kontaktName: "Max Muster", anrede: "Herr", email: "m@x.de", telefon: "1",
  strasse: "Weg 1", plz: "12345", ort: "Ort", investmentId: "inv-1", objektId: "o-1", objektName: "Haus", notarDatum: "2026-10-01",
};

beforeEach(() => {
  cache.zeilen = [];
  cache.insert.mockReset();
  cache.refresh.mockClear();
});

describe("eigentuemerAusInvestment", () => {
  it("ruft die geprüfte Funktion und meldet die Kennung", async () => {
    const rpc = vi.fn(async () => ({ data: "e-1", error: null }));
    await expect(eigentuemerAusInvestment(ANGABEN, rpc)).resolves.toEqual({ ok: true, id: "e-1" });
    expect(rpc).toHaveBeenCalledWith("eigentuemer_aus_investment", { _investment_id: "inv-1" });
    expect(cache.insert).not.toHaveBeenCalled();
  });

  it("meldet eine Ablehnung als Fehlschlag mit lesbarem Grund und schreibt nichts direkt", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "42501", message: "Keine Berechtigung" } }));
    const ergebnis = await eigentuemerAusInvestment(ANGABEN, rpc);
    expect(ergebnis).toEqual({ ok: false, grund: "Keine Berechtigung, den Eigentümer in der Hausverwaltung anzulegen" });
    expect(cache.insert).not.toHaveBeenCalled();
  });

  it("fällt ohne Migration auf das direkte Anlegen zurück und wartet auf die Datenbank", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }));
    cache.insert.mockRejectedValueOnce({ code: "42501", message: "new row violates row-level security policy" });
    const ergebnis = await eigentuemerAusInvestment(ANGABEN, rpc);
    expect(ergebnis.ok).toBe(false);
    expect(cache.insert).toHaveBeenCalledTimes(1);
    expect(cache.insert.mock.calls[0][2]).toEqual({ silent: true });
  });

  it("legt im Rückfall kein zweites Mal an, wenn es den Eigentümer schon gibt", async () => {
    cache.zeilen = [{ id: "e-alt", name: "Max", meta: { herkunftInvestmentId: "inv-1" } }];
    const rpc = vi.fn(async () => ({ data: null, error: { code: "PGRST202" } }));
    await expect(eigentuemerAusInvestment(ANGABEN, rpc)).resolves.toEqual({ ok: true, id: "e-alt" });
    expect(cache.insert).not.toHaveBeenCalled();
  });

  it("übersetzt Netzwerkfehler", () => {
    expect(lesbarerUebernahmeGrund(new Error("Failed to fetch"))).toBe("Keine Verbindung zum Server");
  });
});

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

describe("Migration eigentuemer_aus_investment", () => {
  const DATEI = "20261004160000_eigentuemer_aus_investment.sql";
  const SQL = lies(`supabase/migrations/${DATEI}`);
  const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

  it("liegt, solange sie offen ist, deckungsgleich im Eingangskorb und in der Sammeldatei", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (!existsSync(resolve(__dirname, "../..", korb))) return;
    expect(lies(korb)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL.trim());
  });

  it("prüft Rolle und Investment, bevor irgendetwas angelegt wird", () => {
    expect(CODE).toContain("SECURITY DEFINER");
    expect(CODE).toContain("SET search_path = public");
    const anlegen = CODE.indexOf("INSERT INTO public.eigentuemer");
    expect(CODE.indexOf("public.is_internal_role(_uid)")).toBeLessThan(anlegen);
    expect(CODE.indexOf("public.darf_investment_nutzen(_uid, _inv.kunde_id, _k.meta)")).toBeLessThan(anlegen);
    expect(CODE.indexOf("noch kein Notartermin")).toBeLessThan(anlegen);
    expect(CODE).toContain("REVOKE ALL ON FUNCTION public.eigentuemer_aus_investment(uuid) FROM public, anon;");
    expect(CODE).toContain("GRANT EXECUTE ON FUNCTION public.eigentuemer_aus_investment(uuid) TO authenticated;");
  });

  it("legt je Investment genau einmal an", () => {
    const anlegen = CODE.indexOf("INSERT INTO public.eigentuemer");
    expect(CODE.indexOf("pg_advisory_xact_lock")).toBeLessThan(anlegen);
    expect(CODE.indexOf("meta ->> 'herkunftInvestmentId' = _investment_id::text")).toBeLessThan(anlegen);
    expect(CODE).toContain("RETURN _vorhanden;");
    expect((CODE.match(/INSERT INTO/g) ?? []).length).toBe(1);
    expect(CODE).not.toMatch(/\b(UPDATE|DELETE)\b/);
  });
});

describe("Kundenprofil: Stufe erst nach gelungener Übernahme", () => {
  const profil = lies("src/pages/KundenDetail.tsx");

  it("wechselt auf Fälligkeit erst nach dem Erfolg der Übernahme und bietet einen neuen Versuch an", () => {
    const aufruf = profil.indexOf("const uebernahme = await eigentuemerAusInvestment({");
    const pruefung = profil.indexOf("if (uebernahme.ok === false) {", aufruf);
    const stufe = profil.indexOf('updateInvestment(inv.id, { pipelineStufe: "faelligkeit" });', aufruf);
    expect(aufruf).toBeGreaterThan(-1);
    expect(pruefung).toBeGreaterThan(aufruf);
    expect(stufe).toBeGreaterThan(pruefung);
    expect(profil).not.toContain("transferFromVertrieb(");
    expect(profil).toContain("eigentuemerUebernahmeRef.current.delete(inv.id);");
  });
});
