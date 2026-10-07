import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Zwei Weekly Sales Calls am Montag (Vorgabe Christian vom 05.10.2026):
 * 19:00 Lead-Berater, 19:30 Vertriebspartner, Leitung beide. Die Punkte sind
 * je Call getrennt, und zwar in der Datenbank, nicht nur in der Oberflaeche.
 */

const DATEI = "20261005160000_weekly_call_zwei_runden.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const lies = (pfad: string) => readFileSync(pfad, "utf8");

/** Rumpf einer Funktion aus der Migration. */
function rumpf(kopf: string): string {
  const start = SQL.indexOf(kopf);
  expect(start).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("\n$$;", start));
}

describe("Wer welchen Call sieht, in der Datenbank", () => {
  const runden = rumpf("CREATE OR REPLACE FUNCTION public.weekly_call_runden(");

  it("gibt der Leitung beide Calls", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter"]) {
      expect(runden).toContain(`has_role(_uid, '${rolle}'::public.app_role)`);
    }
    expect(runden).toContain("THEN ARRAY['lead_berater', 'vertriebspartner']");
  });

  it("trennt Vertriebspartner nach der Variante Lead-Berater", () => {
    expect(runden).toContain("has_role(_uid, 'vertriebspartner'::public.app_role)");
    expect(runden).toContain("rollen_variante = 'lead_berater'");
    expect(runden).toContain("THEN ARRAY['lead_berater']");
    expect(runden).toContain("ELSE ARRAY['vertriebspartner']");
  });

  it("antwortet im Browser nur fuer den angemeldeten Nutzer", () => {
    expect(runden).toContain("WHEN auth.uid() IS NOT NULL AND _uid <> auth.uid() THEN ARRAY[]::text[]");
  });

  it("gibt allen anderen keinen Call", () => {
    expect(runden).toMatch(/ELSE ARRAY\[\]::text\[\]\s*END;/);
  });
});

describe("Punkte je Call", () => {
  it("ordnet den Bestand dem 19:00-Call zu", () => {
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS call_runde text NOT NULL DEFAULT 'lead_berater'");
    expect(SQL).toContain("CHECK (call_runde IN ('lead_berater', 'vertriebspartner'))");
  });

  /** Text einer Policy bis zum abschliessenden Semikolon. */
  function regel(name: string): string {
    const start = SQL.indexOf(`CREATE POLICY "${name}"`);
    expect(start).toBeGreaterThan(-1);
    expect(SQL).toContain(`DROP POLICY IF EXISTS "${name}" ON public.weekly_call_punkte;`);
    return SQL.slice(start, SQL.indexOf(";", start));
  }
  const imCall = "call_runde = ANY (public.weekly_call_runden(auth.uid()))";

  it("laesst eigene Zeilen nur im eigenen Call lesen, eintragen und loeschen", () => {
    for (const name of ["wcp_select_eigene", "wcp_insert", "wcp_delete_eigene"]) {
      const teil = regel(name);
      expect(teil).toContain(imCall);
      expect(teil).toContain("user_id = auth.uid()");
    }
  });

  it("prueft beim Aendern alte und neue Zeile auf den eigenen Call", () => {
    const teil = regel("wcp_update_eigene");
    const using = teil.slice(teil.indexOf("USING"), teil.indexOf("WITH CHECK"));
    const check = teil.slice(teil.indexOf("WITH CHECK"));
    expect(using).toContain(imCall);
    expect(check).toContain(imCall);
  });

  it("haelt call_runde nach dem Anlegen fest", () => {
    expect(SQL).toContain("BEFORE UPDATE OF call_runde ON public.weekly_call_punkte");
    const waechter = rumpf("CREATE OR REPLACE FUNCTION public.weekly_call_runde_fest(");
    expect(waechter).toContain("NEW.call_runde IS DISTINCT FROM OLD.call_runde AND auth.uid() IS NOT NULL");
    expect(waechter).toContain("RAISE EXCEPTION");
  });

  it("liest nur die eigenen Calls und gibt keinen Verfasser heraus", () => {
    const lesen = rumpf("CREATE FUNCTION public.weekly_call_punkte_lesen(");
    expect(lesen).toContain("p.call_runde = ANY (public.weekly_call_runden(auth.uid()))");
    expect(lesen).toContain("(_runde IS NULL OR p.call_runde = _runde)");
    expect(lesen).not.toMatch(/p\.user_id,|p\.user_id\s+AS\s+user_id/);
    expect(lesen).toContain("p.user_id = auth.uid() AS von_mir");
  });

  it("zaehlt auch die Rueckschau nur aus den eigenen Calls", () => {
    const termine = rumpf("CREATE FUNCTION public.weekly_call_termine(");
    expect(termine).toContain("p.call_runde = ANY (public.weekly_call_runden(auth.uid()))");
  });

  it("entfernt die alten Fassungen, sonst waere der Aufruf mehrdeutig", () => {
    expect(SQL).toContain("DROP FUNCTION IF EXISTS public.weekly_call_punkte_lesen(date);");
    expect(SQL).toContain("DROP FUNCTION IF EXISTS public.weekly_call_termine();");
  });
});

describe("Eingangskorb", () => {
  it("liegt wortgleich im Eingangskorb und in der Sammeldatei", () => {
    expect(lies(`supabase/migrations-inbox/${DATEI}`)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(`-- Teil: ${DATEI}\n`);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL);
  });

  it("hat Pruefzeilen und einen Eintrag im README", () => {
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const nr of ["90.1", "90.2", "90.3"]) expect(pruefung).toContain(`'${nr} `);
    expect(lies("supabase/migrations-inbox/README.md")).toContain(DATEI);
  });
});

describe("Punkte-Mail je Empfaenger", () => {
  const quelle = lies("supabase/functions/send-weekly-call-punkte/index.ts");

  it("geht nur an Adressen mit Leitungsrolle, alle anderen stehen im Protokoll", () => {
    expect(quelle).toContain("if (istWeeklyCallLeitung(rollenJeNutzer.get(z.id) || [])) ergebnis.add(");
    expect(quelle).toContain("const zuSenden = empfaenger.filter((a) => leitung.has(a.toLowerCase()))");
    expect(quelle).toContain("const ohneBerechtigung = empfaenger.filter((a) => !leitung.has(a.toLowerCase()))");
    expect(quelle).toContain("for (const adresse of zuSenden)");
    expect(lies("supabase/functions/_shared/weekly-call-runden.ts")).toContain(
      "const LEITUNG = ['admin', 'inhaber', 'vertriebsleiter']",
    );
  });

  it("enthaelt fuer die Leitung die Punkte beider Calls, getrennt nach Uhrzeit", () => {
    expect(quelle).toMatch(/const templateData: Record<string, unknown> = \{[^}]*\n\s+punkte,\n/);
    const vorlage = lies("supabase/functions/_shared/transactional-email-templates/weekly-call-punkte.tsx");
    expect(vorlage).toContain("Uhr Lead-Berater`");
    expect(vorlage).toContain("Uhr Vertriebspartner`");
  });
});

describe("Gleicher Zoom-Link fuer beide Calls", () => {
  /** Alle Quelldateien unter src, ohne Tests. */
  function quellen(ordner: string): string[] {
    return readdirSync(ordner).flatMap((name) => {
      const pfad = join(ordner, name);
      if (statSync(pfad).isDirectory()) return quellen(pfad);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [pfad] : [];
    });
  }

  it("steht genau an einer Stelle im Browser-Code", () => {
    const mitLink = quellen("src").filter((pfad) => lies(pfad).includes("zoom.us/j/"));
    expect(mitLink).toEqual([join("src", "lib", "weeklyCallZeit.ts")]);
  });
});
