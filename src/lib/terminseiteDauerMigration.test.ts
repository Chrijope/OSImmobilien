import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration terminseite_dauer (30.09.2026).
 *
 * Ausführen lässt sie sich hier nicht. Der Quelltext hält fest:
 * Erstgespräch 20 und Beratungsgespräch 45 Minuten, fest und ohne Blick auf
 * `buchung_terminarten`, in beiden Funktionen der Terminseite. Sonst
 * wortgleich zu 20260929130000, die in der Datenbank läuft.
 */

const DATEI = "20260930140000_terminseite_dauer.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const VORLAGE = readFileSync("supabase/migrations/20260929130000_partnertermin_nur_partner.sql", "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

/** Ab BEGIN, also ohne den Kopfkommentar. */
const ab = (sql: string) => sql.slice(sql.indexOf("BEGIN;\n"));

/** Die neue Fassung auf die alte zurückgedreht: Danach muss sie wortgleich sein. */
function zurueckgedreht(sql: string): string {
  return ab(sql)
    .replace("'Erstgespräch'::text, 20::integer,\n       'Kurzes", "'Erstgespräch'::text, 30::integer,\n       'Kurzes")
    .replace("('beratung', 2, 'Beratungsgespräch', 45,", "('beratung', 2, 'Beratungsgespräch', 60,")
    .replace(
      "             -- Seit 30.09.2026: Erstgespraech und Beratung fest, ohne eigene Terminart.\n" +
        "             'dauer_minuten', CASE WHEN a.anlass IN ('erstgespraech', 'beratung')\n" +
        "                                   THEN a.dauer\n" +
        "                                   ELSE COALESCE(t.dauer_minuten, a.dauer) END,",
      "             'dauer_minuten', COALESCE(t.dauer_minuten, a.dauer),",
    )
    .replace("('erstgespraech'::text, 'Erstgespräch'::text, 20::integer, p.buchungslink::text)", "('erstgespraech'::text, 'Erstgespräch'::text, 30::integer, p.buchungslink::text)")
    .replace("('beratung', 'Beratungsgespräch', 45, p.beratungslink)", "('beratung', 'Beratungsgespräch', 60, p.beratungslink)")
    .replace(
      "  -- Seit 30.09.2026: Erstgespraech 20 und Beratung 45 Minuten fest, ohne eigene Terminart.\n" +
        "  _dauer := CASE WHEN _anlass IN ('erstgespraech', 'beratung')\n" +
        "                 THEN _dauer\n" +
        "                 ELSE COALESCE(_dauer_eigene, _dauer, 60) END;",
      "  _dauer := COALESCE(_dauer_eigene, _dauer, 60);",
    );
}

describe("Migration terminseite_dauer", () => {
  it("ändert gegenüber 20260929130000 nur die Dauern", () => {
    expect(zurueckgedreht(SQL)).toBe(ab(VORLAGE));
  });

  it("setzt Erstgespräch 20 und Beratung 45 Minuten, Objekt und Finanzierung bleiben 60", () => {
    expect(SQL).toContain("('erstgespraech'::text, 1::integer, 'Erstgespräch'::text, 20::integer,");
    expect(SQL).toContain("('beratung', 2, 'Beratungsgespräch', 45,");
    expect(SQL).toContain("('objektvorstellung', 3, 'Objektgespräch', 60,");
    expect(SQL).toContain("('finanzierungsgespraech', 4, 'Finanzierungsgespräch', 60,");
    expect(SQL).toContain("('erstgespraech'::text, 'Erstgespräch'::text, 20::integer, p.buchungslink::text)");
    expect(SQL).toContain("('beratung', 'Beratungsgespräch', 45, p.beratungslink)");
  });

  it("lässt für diese beiden die eigene Terminart außen vor, in beiden Funktionen", () => {
    expect(SQL).toContain("CASE WHEN a.anlass IN ('erstgespraech', 'beratung')\n                                   THEN a.dauer");
    expect(SQL).toContain("CASE WHEN _anlass IN ('erstgespraech', 'beratung')\n                 THEN _dauer");
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und in der Prüfung", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    const alle = readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8");
    expect(alle).toContain(SQL.trim());
    expect(alle).toContain(`-- Teil 6: ${DATEI}`);
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    for (const zeile of ["'54.1 Terminseite", "'54.2 Terminseite"]) expect(pruefung).toContain(zeile);
    expect(pruefung.match(/END;\s*$/gm)).toHaveLength(1);
    expect(pruefung.trimEnd().endsWith("END;")).toBe(true);
  });
});
