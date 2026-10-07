/**
 * Nachweis der Pixel-Einwilligung am Lead nur durch den Server
 * (Migration 20260927070000, Codex-Pruefung 27.09.2026, PIXEL-003).
 *
 * Geprüft wird der Text der Migration, wie bei den übrigen Migrationen im
 * Projekt, dazu dass der Browser den Schlüssel nirgends selbst schreibt.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  haengeMarketingNachweisAn,
  ohneEinwilligungsNachweise,
  pruefePartnerMarketingEinwilligung,
} from "../../supabase/functions/_shared/cookie-einwilligung.ts";

const lies = (pfad: string) => readFileSync(join(process.cwd(), pfad), "utf8");
const MIGRATION = "supabase/migrations/20260927070000_marketing_einwilligung_schuetzen.sql";
const sql = lies(MIGRATION);
const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.kontakt_marketing_nachweis_schuetzen()");
const schutz = sql.slice(start, sql.indexOf("$$;", sql.indexOf("$$", start) + 2));

describe("Nachweis der Pixel-Einwilligung (PIXEL-003)", () => {
  it("nur der Dienstschlüssel darf ihn schreiben, sonst gilt der alte Wert", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(schutz).toMatch(/IF auth\.uid\(\) IS NULL THEN\s+RETURN NEW;/);
    // Anlegen: mitgeschickter Nachweis fliegt raus.
    expect(schutz).toMatch(/TG_OP = 'INSERT'[\s\S]*NEW\.meta := neu_meta - 'marketingEinwilligung'/);
    // Ändern und Löschen: der alte Wert bleibt, fehlte er, bleibt er weg.
    expect(schutz).toContain("jsonb_set(neu_meta, '{marketingEinwilligung}', OLD.meta -> 'marketingEinwilligung', true)");
    expect(schutz).toContain("IS NOT DISTINCT FROM (OLD.meta -> 'marketingEinwilligung')");
  });

  it("ein meta, das kein Objekt ist, nimmt den Nachweis nicht mit (NB-06)", () => {
    expect(schutz).toContain("IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN");
    expect(schutz).toMatch(/IF alt_hat_nachweis THEN\s+NEW\.meta := OLD\.meta;/);
    expect(schutz).toContain("jsonb_typeof(OLD.meta) = 'object' AND OLD.meta ? 'marketingEinwilligung'");
  });

  it("setzt zurück statt abzubrechen, damit Speichern aus dem CRM und Zusammenführen nie scheitern", () => {
    expect(schutz).not.toContain("RAISE EXCEPTION");
  });

  it("hängt als BEFORE-Auslöser an Anlegen und an Änderungen von meta, wiederholbar", () => {
    expect(sql).toContain("DROP TRIGGER IF EXISTS trg_kontakt_marketing_nachweis ON public.kontakte;");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF meta ON public.kontakte");
    expect(sql).toContain("EXECUTE FUNCTION public.kontakt_marketing_nachweis_schuetzen();");
  });

  it("liegt, solange sie offen ist, im Eingangskorb; die Prüfzeilen bleiben", () => {
    const korb = "supabase/migrations-inbox/20260927070000_marketing_einwilligung_schuetzen.sql";
    if (existsSync(join(process.cwd(), korb))) expect(lies(korb)).toBe(sql);
    expect(lies("supabase/migrations-inbox/99_PRUEFUNG.sql")).toContain("26.1 ");
  });

  it("der Browser schreibt den Schlüssel nirgends selbst, nur submit-lead", async () => {
    const { execSync } = await import("node:child_process");
    const treffer = execSync("grep -rln 'marketingEinwilligung' src supabase/functions || true", { encoding: "utf8" })
      .split("\n")
      .filter((z) => z && !z.includes(".test."))
      .sort();
    expect(treffer).toEqual([
      "supabase/functions/_shared/cookie-einwilligung.ts",
      "supabase/functions/submit-lead/index.ts",
    ]);
  });
});

/*
 * Nachfolger: Migration 20260927090000 (Punkt 9, Codex-Prüfung DS-001 und
 * DS-002). Die Liste `meta.marketingEinwilligungen` wächst nur über
 * `kontakt_marketing_nachweis_anhaengen`, für alle Schreibwege.
 */
const LISTE = "supabase/migrations/20260927090000_marketing_einwilligungen_liste.sql";
const liste = lies(LISTE);
const listeCode = liste.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");
const ausloeser = listeCode.slice(
  listeCode.indexOf("CREATE OR REPLACE FUNCTION public.kontakt_marketing_nachweis_schuetzen()"),
  listeCode.indexOf("COMMENT ON FUNCTION public.kontakt_marketing_nachweis_schuetzen()"),
);
const anhaengen = listeCode.slice(listeCode.indexOf("CREATE OR REPLACE FUNCTION public.kontakt_marketing_nachweis_anhaengen"));

describe("Pixel-Nachweise bei wiederholten Anfragen (20260927090000)", () => {
  it("der einzelne Nachweis bleibt wie bisher: nur der Dienstschlüssel schreibt ihn", () => {
    expect(ausloeser).toContain("dienst boolean := auth.uid() IS NULL;");
    expect(ausloeser).toMatch(/IF NOT dienst THEN\s+IF TG_OP = 'INSERT' THEN\s+neu_meta := neu_meta - 'marketingEinwilligung';/);
  });

  it("die Liste schützt der Auslöser für ALLE Schreibwege, auch den Dienstschlüssel", () => {
    // Nur mit Markierung UND Dienstschlüssel darf sie sich ändern ...
    expect(ausloeser).toContain("current_setting('app.marketing_nachweis_anhaengen', true)");
    expect(ausloeser).toContain("waechst := dienst AND anhaengen");
    // ... und nur wachsend: der alte Inhalt ist der Anfang des neuen.
    expect(ausloeser).toContain("jsonb_array_length(neu_liste) > jsonb_array_length(alt_liste)");
    expect(ausloeser).toMatch(/WHERE t\.nr <= jsonb_array_length\(alt_liste\)\) = alt_liste/);
    // Sonst gilt der alte Wert, eine neue Liste ohne Markierung fliegt raus.
    expect(ausloeser).toContain("jsonb_set(neu_meta, '{marketingEinwilligungen}', alt_liste, true)");
    expect(ausloeser).toContain("neu_meta := neu_meta - 'marketingEinwilligungen';");
    // Keine frühe Rückkehr mehr für den Dienstschlüssel vor dem Listenschutz.
    expect(ausloeser).not.toMatch(/IF auth\.uid\(\) IS NULL THEN\s+RETURN NEW;/);
  });

  it("meta ohne Objekt behält das alte meta, wenn ein geschützter Nachweis dastand", () => {
    expect(ausloeser).toContain("(NOT dienst AND OLD.meta ? 'marketingEinwilligung') OR OLD.meta ? 'marketingEinwilligungen'");
    expect(ausloeser).toContain("NEW.meta := OLD.meta;");
    expect(ausloeser).not.toMatch(/RAISE/);
  });

  it("die Anhänge-Funktion hängt atomar an, setzt die Markierung und ist nur für die Service-Rolle", () => {
    expect(anhaengen).toContain("SECURITY DEFINER");
    expect(anhaengen).toContain("SET search_path = public");
    expect(anhaengen).toContain("PERFORM set_config('app.marketing_nachweis_anhaengen', 'an', true);");
    expect(anhaengen).toMatch(/UPDATE public\.kontakte\s+SET meta = jsonb_set\(/);
    expect(anhaengen).toContain("|| jsonb_build_array(p_nachweis)");
    expect(anhaengen).toContain("PERFORM set_config('app.marketing_nachweis_anhaengen', '', true);");
    expect(listeCode).toContain(
      "REVOKE ALL ON FUNCTION public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb) FROM public, anon, authenticated;",
    );
    expect(listeCode).toContain("GRANT EXECUTE ON FUNCTION public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb) TO service_role;");
    expect(listeCode).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|authenticated)/);
  });

  it("legt den Auslöser selbst an; die Prüfzeilen 26.2 und 26.3 bleiben gültig", () => {
    expect(listeCode).toContain("DROP TRIGGER IF EXISTS trg_kontakt_marketing_nachweis ON public.kontakte;");
    expect(listeCode).toContain("EXECUTE FUNCTION public.kontakt_marketing_nachweis_schuetzen();");
    expect(ausloeser).toContain("auth.uid() IS NULL");
    expect(ausloeser).toContain("NEW.meta := OLD.meta");
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, als Teil 1 in der Sammeldatei und im README", () => {
    const korb = "supabase/migrations-inbox/20260927090000_marketing_einwilligungen_liste.sql";
    if (!existsSync(join(process.cwd(), korb))) return;
    expect(lies(korb)).toBe(liste);
    const sammel = lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql");
    expect(sammel).toContain("-- Teil 1: 20260927090000_marketing_einwilligungen_liste.sql");
    expect(sammel).toContain(liste.trim());
    expect(lies("supabase/migrations-inbox/README.md")).toContain("20260927090000_marketing_einwilligungen_liste.sql");
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const nr of ["28.1", "28.2", "28.3", "28.4"]) expect(pruefung).toContain(`'${nr} `);
  });
});

describe("submit-lead und die Nachweise (DS-001, DS-002)", () => {
  const code = lies("supabase/functions/submit-lead/index.ts");

  it("eine gefälschte Liste oder ein gefälschter Nachweis aus der Eingabe wird nie gespeichert", () => {
    const gefaelscht = {
      kampagne: { utm_source: "meta" },
      marketingEinwilligung: { fassung: 2, partnerId: "x" },
      marketingEinwilligungen: [{ fassung: 2, partnerId: "x", zeitpunkt: "2026-09-27T10:00:00Z" }],
    };
    const sauber = ohneEinwilligungsNachweise(gefaelscht);
    expect(sauber).toEqual({ kampagne: { utm_source: "meta" } });
    expect(gefaelscht).toHaveProperty("marketingEinwilligungen"); // die Eingabe selbst bleibt unberührt
    expect(ohneEinwilligungsNachweise(null)).toBeNull();
    expect(ohneEinwilligungsNachweise([1, 2])).toEqual([1, 2]);
    // Ohne gültige Einwilligung entsteht serverseitig kein Nachweis.
    expect(pruefePartnerMarketingEinwilligung({ version: 2 }, "11111111-1111-4111-8111-111111111111")).toBeNull();
  });

  it("bereinigt die Eingabe direkt nach dem Einlesen, vor jedem Aufbau von meta", () => {
    const einlesen = code.indexOf("} = body;");
    const bereinigen = code.indexOf("meta = ohneEinwilligungsNachweise(meta);");
    expect(einlesen).toBeGreaterThan(0);
    expect(bereinigen).toBeGreaterThan(einlesen);
    const ersteNutzung = code.indexOf("meta = {", einlesen);
    expect(bereinigen).toBeLessThan(ersteNutzung);
  });

  it("hängt über die Datenbankfunktion an, vor dem Schreiben des ganzen meta, mit Rückfall ohne Migration", () => {
    const rpc = code.indexOf("await haengeMarketingNachweisAn(");
    const schreiben = code.indexOf(".update(ergaenzung)");
    expect(rpc).toBeGreaterThan(0);
    expect(rpc).toBeLessThan(schreiben);
    expect(code).toMatch(/marketingNachweis && nachweisWeg === "rueckfall"\s*\?\s*\{ marketingEinwilligungen:/);
    expect(code).toMatch(/const marketingNachweis = hbSaOffen\s*\?\s*null/);
  });

  it("haengeMarketingNachweisAn: angehängt, fehlende Funktion und Ausnahme als Rückfall, wirft nie", async () => {
    const nachweis = pruefePartnerMarketingEinwilligung(
      { version: 2, partnerMarketing: { partnerId: "11111111-1111-4111-8111-111111111111", zeitpunkt: new Date().toISOString() } },
      "11111111-1111-4111-8111-111111111111",
    )!;
    expect(nachweis).not.toBeNull();
    const aufrufe: unknown[] = [];
    const ok = { rpc: async (fn: string, args: Record<string, unknown>) => (aufrufe.push([fn, args]), { data: true, error: null }) };
    expect(await haengeMarketingNachweisAn(ok, "k1", nachweis)).toBe("angehaengt");
    expect(aufrufe).toEqual([["kontakt_marketing_nachweis_anhaengen", { p_kontakt_id: "k1", p_nachweis: nachweis }]]);

    const fehlt = { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await haengeMarketingNachweisAn(fehlt, "k1", nachweis)).toBe("rueckfall");
    const wirft = { rpc: async () => { throw new Error("Netz"); } };
    expect(await haengeMarketingNachweisAn(wirft, "k1", nachweis)).toBe("rueckfall");
    const nichtGefunden = { rpc: async () => ({ data: false, error: null }) };
    expect(await haengeMarketingNachweisAn(nichtGefunden, "k1", nachweis)).toBe("rueckfall");
    warn.mockRestore();
  });
});
