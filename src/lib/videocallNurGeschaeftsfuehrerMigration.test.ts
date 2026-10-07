import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration 20260927120000: Videocall nur fuer den Geschaeftsfuehrer als
 * admin, externer Kalender getrennt davon.
 *
 * Die Migration laesst sich hier nicht ausfuehren. Die Tests halten am
 * Quelltext fest, was Codex bemaengelt hat (VC-01, VC-06, VC-07).
 */

const DATEI = "20260927120000_videocall_nur_geschaeftsfuehrer.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

/** Der Text einer Funktion von CREATE bis zum schliessenden $$;. */
function funktion(name: string): string {
  const start = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const ende = CODE.indexOf("\n$$;", start);
  return CODE.slice(start, ende);
}

/** Der Text einer Zeilenregel bis zum Semikolon. */
function regel(name: string): string {
  const start = CODE.indexOf(`CREATE POLICY "${name}"`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return CODE.slice(start, CODE.indexOf(";", start));
}

describe("Migration Videocall nur Geschaeftsfuehrer", () => {
  it("liegt gleichlautend im Eingangskorb, in der Sammeldatei und im README", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    for (const zeile of ["29.1 ", "29.10 ", "29.11 ", "29.12 "]) expect(pruefung).toContain(`'${zeile}`);
  });

  describe("VC-01: Kontakt eines Links nicht nachtraeglich umhaengen", () => {
    it("prueft beim Aendern dieselben Bedingungen wie beim Anlegen", () => {
      for (const name of ["Buchung Links anlegen", "Buchung Links aendern"]) {
        const text = regel(name);
        const pruefung = text.slice(text.indexOf("WITH CHECK"));
        expect(pruefung, name).toContain("public.darf_videocall(auth.uid())");
        expect(pruefung, name).toContain("ziel = 'extern'");
        expect(pruefung, name).toContain("terminart_id IS NULL");
        expect(pruefung, name).toContain("public.is_internal_role(auth.uid())");
        expect(pruefung, name).toContain("public.kontakt_visible_to_internal(auth.uid(), kontakt_id::text)");
      }
    });

    it("sperrt Kontakt und Besitzer ueber die Schnittstelle, laesst das Zusammenfuehren zu", () => {
      const text = funktion("buchung_links_zuordnung_schuetzen");
      expect(text).toContain("NEW.kontakt_id IS DISTINCT FROM OLD.kontakt_id");
      expect(text).toContain("NEW.mitarbeiter_id IS DISTINCT FROM OLD.mitarbeiter_id");
      expect(text).toContain("current_user IN ('authenticated', 'anon')");
      // Als SECURITY DEFINER waere current_user immer der Besitzer, die
      // Sperre griffe nie.
      expect(text).not.toContain("SECURITY DEFINER");
      expect(CODE).toMatch(/CREATE TRIGGER trg_buchung_links_zuordnung\s+BEFORE UPDATE ON public\.buchung_links/);
    });
  });

  describe("VC-06: Bewerberbuchung ohne Videocall bricht ab", () => {
    it("prueft darf_videocall vor jedem Schreiben und legt sonst nichts an", () => {
      const text = funktion("bewerber_termin_buchen");
      const pruefung = text.indexOf("IF NOT public.darf_videocall(_gastgeber) THEN");
      expect(pruefung).toBeGreaterThan(0);
      expect(text.slice(pruefung, pruefung + 140)).toContain("RAISE EXCEPTION 'Zurzeit ist keine Terminbuchung moeglich'");
      for (const schreiben of ["INSERT INTO public.videoraeume", "INSERT INTO public.buchungen", "UPDATE public.bewerbungen"]) {
        expect(text.indexOf(schreiben), schreiben).toBeGreaterThan(pruefung);
      }
    });
  });

  describe("VC-07: Terminseite nur fuer externe Links", () => {
    it("nimmt in beiden Funktionen nur ziel = 'extern' an", () => {
      for (const name of ["partnertermin_zugang", "partnertermin_bestaetigen"]) {
        const text = funktion(name);
        expect(text, name).toMatch(/WHERE l\.token = _token[\s\S]*AND l\.ziel = 'extern'[\s\S]*LIMIT 1;/);
        expect(text, name).toContain("SECURITY DEFINER");
      }
      expect(CODE).toContain("GRANT EXECUTE ON FUNCTION public.partnertermin_zugang(text) TO anon, authenticated;");
      expect(CODE).toContain(
        "GRANT EXECUTE ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) TO anon, authenticated;",
      );
    });

    it("uebernimmt die neueste Fassung und ergaenzt nur die Bedingung", () => {
      const quelle = (datei: string, name: string) => {
        const text = readFileSync(`supabase/migrations/${datei}`, "utf8");
        const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
        return text.slice(start, text.indexOf("\n$$;", start));
      };
      const ohneZiel = (t: string) => t.replace("\n    -- Seit 27.09.2026: nur Links auf den externen Kalender.\n    AND l.ziel = 'extern'", "");
      const inMigration = (name: string) => {
        const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
        return SQL.slice(start, SQL.indexOf("\n$$;", start));
      };
      expect(ohneZiel(inMigration("partnertermin_zugang"))).toBe(
        quelle("20260921250000_partnertermin_kunde.sql", "partnertermin_zugang"),
      );
      expect(ohneZiel(inMigration("partnertermin_bestaetigen"))).toBe(
        quelle("20260921240000_partnertermin_uuid_vergleich.sql", "partnertermin_bestaetigen"),
      );
    });
  });
});
