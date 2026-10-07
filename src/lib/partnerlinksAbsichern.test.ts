/**
 * Partnerlinks absichern (Codex-Prüfung vom 26.09.2026, F03, F05, F07 und
 * stabile Tippgeber-Links). Die Regeln stehen in der Migration
 * 20260926235000 und in zwei Edge Functions; geprüft wird hier ihr Text, wie
 * bei den übrigen Migrationen im Projekt. Die Entscheidung „gesperrt oder
 * ohne Partnerrolle“ selbst ist in `leadZuordnung.test.ts` abgedeckt.
 */
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { beurteileLinkKuerzel } from "../../supabase/functions/_shared/lead-zuordnung";

const lies = (pfad: string) => readFileSync(join(process.cwd(), pfad), "utf8");
const MIGRATION = "supabase/migrations/20260926235000_partnerlinks_absichern.sql";
const sql = lies(MIGRATION);
/** Der Körper einer Funktion, von CREATE bis zum schließenden $$. */
const funktion = (name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `Funktion ${name} fehlt`).toBeGreaterThanOrEqual(0);
  const koerper = sql.indexOf("$$", start);
  return sql.slice(start, sql.indexOf("$$;", koerper + 2));
};

describe("F05: gesperrter Partner, keine Daten unter seinem Link", () => {
  const microsite = lies("supabase/functions/get-vp-microsite/index.ts");

  it("get-vp-microsite urteilt wie submit-lead und liest dafür gesperrt", () => {
    expect(microsite).toContain('.select("id, name, email, avatar_url, vp_slug, gesperrt")');
    expect(microsite).toContain("beurteileLinkKuerzel({ kuerzelGueltig: true, profil: profile, rollen: roles }) !== \"ok\"");
    expect(microsite).not.toContain("hatBeraterRolle(");
  });

  it("die Prüfung gibt für gesperrt und ohne Partnerrolle kein ok", () => {
    const rollen = [{ role: "vertriebspartner" }];
    const id = "11111111-1111-4111-8111-111111111111";
    expect(beurteileLinkKuerzel({ kuerzelGueltig: true, profil: { id, gesperrt: true }, rollen })).toBe("profil_gesperrt");
    expect(beurteileLinkKuerzel({ kuerzelGueltig: true, profil: { id, gesperrt: false }, rollen: [{ role: "kunde" }] })).toBe("keine_beraterrolle");
    expect(beurteileLinkKuerzel({ kuerzelGueltig: true, profil: { id, gesperrt: false }, rollen })).toBe("ok");
  });

  it("die öffentliche Antwort verdeckt eine Sperre höchstens drei Minuten", () => {
    expect(microsite).toContain('"Cache-Control": "public, max-age=60, s-maxage=120"');
    expect(microsite).not.toContain("max-age=120, s-maxage=300");
  });

  it("der Tippgeber bekommt den Link eines gesperrten Partners nicht", () => {
    const tippgeberLink = lies("supabase/functions/get-tippgeber-vp-slug/index.ts");
    expect(tippgeberLink).toContain('.select("id, name, vp_slug, gesperrt")');
    expect(tippgeberLink).toMatch(/beurteileBeraterKennung\(\{ kennung: vpId, profil: profile, rollen \}\) !== "ok"/);
    // Die Prüfung steht vor der Nachvergabe des Kürzels.
    expect(tippgeberLink.indexOf("beurteileBeraterKennung({")).toBeLessThan(tippgeberLink.indexOf("vergibVpSlug(admin"));
  });

  it("die Datenbank kennt dieselbe Regel und dieselbe Rollenliste", () => {
    const regel = funktion("partner_link_aktiv");
    expect(regel).toContain("p.gesperrt IS NOT TRUE");
    expect(regel).toContain("('vertriebspartner', 'vertriebsleiter', 'admin', 'inhaber')");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.partner_link_aktiv(uuid) FROM public, anon, authenticated;");
    expect(funktion("resolve_tippgeber_slug")).toContain("public.partner_link_aktiv(p.id)");
    expect(funktion("tippgeber_klick_buchen")).toContain("public.partner_link_aktiv(t.zugeordnet_id)");
  });
});

describe("F03: Link-Kürzel nur über Verwaltung und Dienstschlüssel", () => {
  const schutz = funktion("vp_slug_schutz_pruefen");

  it("lässt Dienstschlüssel, Admin und Inhaber durch, sonst Fehler", () => {
    expect(schutz).toContain("auth.uid() IS NULL");
    expect(schutz).toContain("public.has_role(auth.uid(), 'admin'::public.app_role)");
    expect(schutz).toContain("public.has_role(auth.uid(), 'inhaber'::public.app_role)");
    expect(schutz).toContain("RAISE EXCEPTION");
  });

  it("greift nur bei geändertem Kürzel, Namensänderungen bleiben frei", () => {
    expect(schutz).toContain("NEW.vp_slug IS NOT DISTINCT FROM OLD.vp_slug");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF vp_slug ON public.profiles");
    expect(sql).toContain("CREATE TRIGGER trg_vp_slug_schutz");
    // Der Trigger gegen gesperrte Wörter bleibt, wie er ist.
    expect(sql).not.toContain("DROP TRIGGER IF EXISTS trg_vp_slug_sperre");
  });

  it("kein Browser-Code schreibt vp_slug", async () => {
    const { execSync } = await import("node:child_process");
    const treffer = execSync("grep -rln 'vp_slug' src --include=*.ts --include=*.tsx || true", { encoding: "utf8" })
      .split("\n")
      .filter((z) => z && !z.includes(".test.") && !z.endsWith("integrations/supabase/types.ts"));
    for (const datei of treffer) {
      expect(lies(datei), datei).not.toMatch(/\bvp_slug\s*:/);
    }
  });
});

describe("F07: Klickzähler eindeutig und begrenzt", () => {
  it("der neue Weg sucht den Tippgeber nur unter dem Partner des Links", () => {
    const zaehlen = funktion("tippgeber_klick_zaehlen");
    expect(zaehlen).toContain("WHERE p.vp_slug = _vp");
    expect(zaehlen).toContain("t.zugeordnet_id = _partner");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.tippgeber_klick_zaehlen(text, text) TO anon, authenticated;");
  });

  it("der alte Weg zählt ein Kürzel nur bei genau einem Treffer", () => {
    const alt = funktion("increment_tippgeber_klick");
    expect(alt).toContain("CASE WHEN count(*) = 1");
    expect(alt).not.toMatch(/tg_slug = _tippgeber LIMIT 1/);
  });

  it("höchstens 200 Klicks je Tippgeber und Tag, ohne Personenbezug", () => {
    const buchen = funktion("tippgeber_klick_buchen");
    expect(buchen).toContain("WHERE k.anzahl < 200");
    expect(buchen).toContain("IF _anzahl IS NULL THEN");
    const tabelle = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.tippgeber_klick_tage"), sql.indexOf(");", sql.indexOf("CREATE TABLE IF NOT EXISTS public.tippgeber_klick_tage")));
    expect(tabelle).not.toMatch(/\b(ip\w*|user_agent|email|name|vorname|nachname)\b/i);
    expect(sql).toContain("ALTER TABLE public.tippgeber_klick_tage ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.tippgeber_klick_buchen(uuid) FROM public, anon, authenticated;");
  });
});

describe("Tippgeber-Links bleiben bei Namensänderung", () => {
  it("vergibt das Kürzel nur, wenn keins da ist", () => {
    const vergabe = funktion("tippgeber_set_slug");
    expect(vergabe).toContain("IF NEW.tg_slug IS NULL OR NEW.tg_slug = '' THEN");
    expect(vergabe).not.toContain("NEW.vorname <> OLD.vorname");
  });
});

describe("Eingangskorb", () => {
  it("die Migration liegt, solange sie offen ist, als Kopie im Korb und in der Sammeldatei, Prüfzeilen bleiben", () => {
    const sammel = lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql");
    // Kein Rest eines Merge-Konflikts, der den ganzen Lauf abbräche.
    expect(sammel).not.toMatch(/^(=======|<<<<<<<|>>>>>>>)/m);
    if (existsSync("supabase/migrations-inbox/20260926235000_partnerlinks_absichern.sql")) {
      expect(lies("supabase/migrations-inbox/20260926235000_partnerlinks_absichern.sql")).toBe(sql);
      expect(sammel).toContain(sql.trim());
    }
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const nr of ["20.1", "20.2", "20.3", "20.4", "20.5", "20.6"]) expect(pruefung).toContain(`'${nr} `);
  });
});
