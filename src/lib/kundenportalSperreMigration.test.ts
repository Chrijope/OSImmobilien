/**
 * Die Migration `20260923180000_kundenportal_sperre.sql` am Quelltext geprüft.
 *
 * Laufen lassen kann sie nur Christian im SQL-Editor. Hier wird festgehalten,
 * was sie tun muss, damit eine spätere Änderung nicht still etwas davon
 * verliert: die Hilfsfunktion, die Sperrregel an allen Tabellen, die Rechte
 * an den Funktionen, der Ausloeser und die Wiederholbarkeit.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const WURZEL = join(__dirname, "..", "..");
const NAME = "20260923180000_kundenportal_sperre.sql";
const sql = readFileSync(join(WURZEL, "supabase", "migrations", NAME), "utf8");
/** Ohne Kommentare, damit nur zählt, was wirklich ausgeführt wird. */
const code = sql.replace(/--[^\n]*/g, "");

/** Rumpf einer Funktion bis zum schliessenden $$. */
function rumpf(funktion: string): string {
  const start = code.indexOf(`FUNCTION public.${funktion}(`);
  expect(start, `Funktion ${funktion} fehlt`).toBeGreaterThan(-1);
  const anfang = code.indexOf("$$", start);
  const ende = code.indexOf("$$", anfang + 2);
  return code.slice(start, ende + 2);
}

describe("Migration Kundenportal-Sperre", () => {
  it("ist am 24.09.2026 gelaufen und liegt deshalb nicht mehr im Eingangskorb", () => {
    expect(existsSync(join(WURZEL, "supabase", "migrations-inbox", NAME))).toBe(false);
    const liesMich = readFileSync(join(WURZEL, "supabase", "migrations-inbox", "README.md"), "utf8");
    expect(liesMich).toContain(`| \`${NAME}\``);
  });

  it("legt die Sperrtabelle wiederholbar an, ohne Zugriff aus dem Browser", () => {
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.kundenportal_sperren/);
    expect(code).toMatch(/kontakt_id\s+uuid PRIMARY KEY REFERENCES public\.kontakte\(id\) ON DELETE CASCADE/);
    expect(code).toMatch(/ALTER TABLE public\.kundenportal_sperren ENABLE ROW LEVEL SECURITY/);
    expect(code).toMatch(/REVOKE ALL ON public\.kundenportal_sperren FROM anon, authenticated/);
    // Keine eigene Regel, die Browserrollen etwas freigibt.
    expect(code).not.toMatch(/CREATE POLICY[^;]*ON public\.kundenportal_sperren/);
  });

  it("übernimmt den heutigen Bestand, ohne eine spätere Entsperrung zu überschreiben", () => {
    expect(code).toMatch(/INSERT INTO public\.kundenportal_sperren[\s\S]*?WHERE \(k\.meta ->> 'portalGesperrt'\) = 'true'[\s\S]*?ON CONFLICT \(kontakt_id\) DO NOTHING/);
  });

  it("Hilfsfunktion: Person 1 und 2, nie unbekannt, interne Rollen ausgenommen", () => {
    const f = rumpf("kunde_portal_gesperrt");
    expect(f).toMatch(/STABLE SECURITY DEFINER/);
    expect(f).toMatch(/SET search_path = public/);
    expect(f).toMatch(/COALESCE\(/);
    expect(f).toContain("(k.meta ->> 'authUserId') = _user_id::text");
    expect(f).toContain("((k.meta -> 'person2') ->> 'authUserId') = _user_id::text");
    expect(f).toContain("WHERE s.gesperrt");
    expect(f).toContain("AND NOT public.is_internal_role(_user_id)");
    // Fremde Kennungen fragt aus dem Browser niemand ab, nur secure-login.
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.kunde_portal_gesperrt\(uuid\) FROM public, anon, authenticated/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.kunde_portal_gesperrt\(uuid\) TO service_role/);
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.kunde_portal_gesperrt\(uuid\)[^;]*authenticated/);
  });

  it("Sperrregel und Portal fragen nur nach dem eigenen Stand", () => {
    const f = rumpf("kundenportal_gesperrt_fuer_mich");
    expect(f).toMatch(/SECURITY DEFINER/);
    expect(f).toContain("public.kunde_portal_gesperrt(auth.uid())");
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.kundenportal_gesperrt_fuer_mich\(\) TO authenticated/);
  });

  it("Schreiben nur mit dem Dienstschlüssel, Wahrheit vor Anzeige", () => {
    const f = rumpf("kundenportal_sperre_schreiben");
    expect(f).toMatch(/IF auth\.uid\(\) IS NOT NULL THEN\s+RAISE EXCEPTION 'Not authorized'/);
    expect(f.indexOf("INSERT INTO public.kundenportal_sperren")).toBeLessThan(f.indexOf("UPDATE public.kontakte"));
    expect(f).toContain("'portalGesperrt', true");
    expect(f).toContain("'portalGesperrt', false");
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.kundenportal_sperre_schreiben\(uuid, boolean, uuid\) FROM public, anon, authenticated/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.kundenportal_sperre_schreiben\(uuid, boolean, uuid\) TO service_role/);
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.kundenportal_sperre_schreiben[^;]*authenticated/);
  });

  it("der Anzeigewert folgt der Tabelle, auch an merge_kontakt_meta vorbei", () => {
    const f = rumpf("kontakt_portalsperre_spiegeln");
    expect(f).toMatch(/SECURITY DEFINER/);
    expect(f).toContain("FROM public.kundenportal_sperren");
    expect(f).toContain("jsonb_set(NEW.meta, '{portalGesperrt}', to_jsonb(_wahr), true)");
    expect(code).toMatch(/DROP TRIGGER IF EXISTS kontakt_portalsperre_spiegeln ON public\.kontakte/);
    expect(code).toMatch(/CREATE TRIGGER kontakt_portalsperre_spiegeln\s+BEFORE INSERT OR UPDATE OF meta ON public\.kontakte/);
  });

  it("setzt die Sperrregel als RESTRICTIVE an allen Tabellen mit RLS und an storage.objects", () => {
    const f = rumpf("kundenportal_sperrregeln_anlegen");
    expect(f).toContain("c.relrowsecurity");
    expect(f).toContain("n.nspname = 'public'");
    expect(f).toContain("SELECT 'storage', 'objects'");
    expect(f).toContain("AS RESTRICTIVE FOR ALL TO authenticated");
    // Als Unterabfrage, damit Postgres sie einmal je Abfrage auswertet und nicht je Zeile.
    expect(f).toContain("USING (NOT (SELECT public.kundenportal_gesperrt_fuer_mich()))");
    expect(f).toContain("WITH CHECK (NOT (SELECT public.kundenportal_gesperrt_fuer_mich()))");
    // Wiederholbar: vorher entfernen.
    expect(f.indexOf("DROP POLICY IF EXISTS")).toBeLessThan(f.indexOf("CREATE POLICY"));
    // Ohne diese drei lädt die Anwendung nicht.
    expect(f).toContain("c.relname NOT IN ('profiles', 'user_roles', 'user_settings')");
    // Und sie läuft in der Migration auch wirklich.
    expect(code.trimEnd().endsWith("SELECT public.kundenportal_sperrregeln_anlegen();")).toBe(true);
    // Aus dem Browser nicht aufrufbar.
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.kundenportal_sperrregeln_anlegen\(\) FROM public, anon, authenticated, service_role/);
  });

  it("deckt alle Tabellen ab, auf denen Kunden heute eigene Regeln haben", () => {
    // Stand 23.09.2026. Keine davon darf auf der Ausnahmeliste stehen.
    const kundentabellen = [
      "kontakte", "investments", "finanzierungen", "kunde_dokumente",
      "kunden_bewertungen", "empfehlungen", "signature_requests",
    ];
    const ausnahmen = ["profiles", "user_roles", "user_settings"];
    for (const t of kundentabellen) expect(ausnahmen).not.toContain(t);
  });

  it("ist wiederholbar geschrieben", () => {
    // Jede Funktion mit CREATE OR REPLACE.
    const nackt = code.match(/CREATE FUNCTION/g) ?? [];
    expect(nackt).toEqual([]);
    // Keine Policy ohne vorheriges DROP (die einzigen stehen in der Schleife).
    expect((code.match(/CREATE POLICY/g) ?? []).length).toBe(1);
  });

  it("nennt im Kopf, was ohne sie passiert, und eine Prüfabfrage", () => {
    expect(sql).toContain("WAS OHNE SIE PASSIERT");
    expect(sql).toContain("PRUEFEN");
    expect(sql).toContain("WIEDERHOLBAR");
  });
});

/** Letzte Fassung einer Funktion in einer Migration, von CREATE bis $$;. */
function fassung(datei: string, name: string): string {
  const text = readFileSync(join(WURZEL, "supabase", "migrations", datei), "utf8");
  const start = text.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} in ${datei}`).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf("$$;", text.indexOf("AS $$", start) + 5) + 3);
}

describe("Nachzug 20261004152000_kundenportal_sperre_nachziehen", () => {
  const DATEI = "20261004152000_kundenportal_sperre_nachziehen.sql";
  const nachzug = readFileSync(join(WURZEL, "supabase", "migrations", DATEI), "utf8");
  const nachzugCode = nachzug.replace(/--[^\n]*/g, "");

  it("liegt, solange sie offen ist, deckungsgleich im Eingangskorb und in der Sammeldatei", () => {
    const korb = join(WURZEL, "supabase", "migrations-inbox", DATEI);
    if (!existsSync(korb)) return;
    expect(readFileSync(korb, "utf8")).toBe(nachzug);
    expect(readFileSync(join(WURZEL, "supabase", "migrations-inbox", "00_ALLE_ZUSAMMEN.sql"), "utf8")).toContain(nachzug.trim());
  });

  it("nimmt dem Browser die Frage nach fremden Kennungen und zieht die Sperrregel über neue Tabellen", () => {
    expect(nachzugCode).toContain("REVOKE ALL ON FUNCTION public.kunde_portal_gesperrt(uuid) FROM public, anon, authenticated;");
    expect(nachzugCode).toContain("GRANT EXECUTE ON FUNCTION public.kunde_portal_gesperrt(uuid) TO service_role;");
    expect(nachzugCode).toContain("SELECT public.kundenportal_sperrregeln_anlegen();");
    // Datenänderungen höchstens in Funktionsrümpfen, nie beim Ausführen selbst.
    const ohneRuempfe = nachzugCode.replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(ohneRuempfe).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/);
  });

  it("Zusammenführ-Funktionen: bisherige Fassung plus nur der Sperrblock am Anfang", () => {
    // Interne melden sich seit dem 05.10.2026 nur mit Passwort an, es gibt
    // keine Zwei-Faktor-Prüfung für sie mehr und keine Vorbedingung.
    const sperre =
      "  -- Gesperrter Kunde: keine Rueckgabe, kein Schreiben (04.10.2026).\n" +
      "  IF auth.uid() IS NOT NULL AND public.kunde_portal_gesperrt(auth.uid()) THEN\n" +
      "    RAISE EXCEPTION 'Dein Zugang ist gerade gesperrt.' USING ERRCODE = '42501';\n" +
      "  END IF;\n";
    for (const [fn, vorher] of [
      ["merge_kontakt_meta", "20260928160000_glocke_absichern.sql"],
      ["merge_investment_meta", "20260930110000_absicherung_geld_vertraege.sql"],
    ]) {
      const alt = fassung(vorher, fn);
      expect(fassung(DATEI, fn), fn).toBe(alt.replace("\nBEGIN\n", `\nBEGIN\n${sperre}`));
    }
    expect(nachzug).not.toMatch(/zweiter_faktor/);
    expect(nachzugCode.trim().startsWith("BEGIN;\n\nCREATE OR REPLACE FUNCTION public.kundenportal_sperrregeln_anlegen()")).toBe(true);
  });

  it("Kundenzweig der Helfer fragt die Sperre, Sperre nur bei Konten mit ausschließlich kunde", () => {
    const din = nachzugCode.slice(nachzugCode.indexOf("CREATE OR REPLACE FUNCTION public.darf_investment_nutzen("));
    expect(din.slice(0, 900)).toContain("AND NOT public.kunde_portal_gesperrt(_user_id)");
    const ik = nachzugCode.slice(nachzugCode.indexOf("CREATE OR REPLACE FUNCTION public.ist_kunde_des_kontakts("));
    expect(ik.slice(0, 700)).toContain("AND NOT public.kunde_portal_gesperrt(_user_id)");
    const kpg = nachzugCode.slice(nachzugCode.lastIndexOf("CREATE OR REPLACE FUNCTION public.kunde_portal_gesperrt("));
    expect(kpg.slice(0, 1000)).toContain("ur.role::text <> 'kunde'");
  });

  it("stellt die Regeln erst auf kundenportal_gesperrt_fuer_mich um, prüft und nimmt dann das Recht", () => {
    // Live fragten alle Regeln kunde_portal_gesperrt(auth.uid()) direkt. Ein
    // REVOKE vorher hätte jede Abfrage aller Angemeldeten scheitern lassen.
    const umstellen = nachzugCode.indexOf("SELECT public.kundenportal_sperrregeln_anlegen();");
    const waechter = nachzugCode.indexOf("Abbruch, nichts geaendert");
    const entzug = nachzugCode.indexOf("REVOKE ALL ON FUNCTION public.kunde_portal_gesperrt(uuid)");
    expect(nachzugCode).toContain("'USING (NOT (SELECT public.kundenportal_gesperrt_fuer_mich())) '");
    // Die Sperrregeln selbst fragen nie mehr direkt (die Zusammenführ-Funktionen dürfen es als Eigentümer).
    const anlegen = nachzugCode.slice(nachzugCode.indexOf("CREATE OR REPLACE FUNCTION public.kundenportal_sperrregeln_anlegen()"), umstellen);
    expect(anlegen).not.toContain("kunde_portal_gesperrt(auth.uid())");
    expect(umstellen).toBeGreaterThan(nachzugCode.indexOf("CREATE OR REPLACE FUNCTION public.kundenportal_sperrregeln_anlegen()"));
    expect(waechter).toBeGreaterThan(umstellen);
    expect(entzug).toBeGreaterThan(waechter);
    expect(nachzugCode.trim().startsWith("BEGIN;")).toBe(true);
    expect(nachzugCode.trim().endsWith("COMMIT;")).toBe(true);
  });
});
