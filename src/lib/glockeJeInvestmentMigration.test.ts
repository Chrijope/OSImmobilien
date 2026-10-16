import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration glocke_je_investment (11.10.2026). Gegen eine lokale Postgres
 * geprueft; hier haelt der Quelltext die Regeln fest.
 */
const SQL = readFileSync("supabase/migrations/20261016203000_glocke_je_investment.sql", "utf8");
const code = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Migration glocke_je_investment", () => {
  it("laeutet bei einem Stufenwechsel am Investment, nicht am Kontakt", () => {
    expect(code).toContain("AFTER UPDATE OF meta ON public.investments");
    expect(code).toContain("WHEN (OLD.meta->>'pipelineStufe' IS DISTINCT FROM NEW.meta->>'pipelineStufe')");
    expect(code).toContain("DROP TRIGGER IF EXISTS trg_notify_vp_pipeline_change ON public.kontakte;");
    expect(code).not.toMatch(/CREATE TRIGGER trg_notify_vp_pipeline_change/);
  });

  it("nur an den Zustaendigen und nie an den, der selbst geaendert hat", () => {
    expect(code).toContain("IF _kontakt.zustaendig_id IS NULL THEN");
    expect(code).toContain("IF _actor IS NOT NULL AND _actor = _kontakt.zustaendig_id THEN");
  });

  it("nennt das Investment und verlinkt genau dorthin", () => {
    expect(code).toContain("'Investment ' || COALESCE(NEW.meta->>'nummer', '?')");
    expect(code).toContain("'?investment=' || NEW.id::text");
  });
});
