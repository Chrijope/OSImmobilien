/**
 * Wer darf `bulk_recompute_pipeline` aufrufen?
 *
 * Die Funktion ist `SECURITY DEFINER` und hat keine Pruefung im Rumpf. Sie
 * laeuft ueber die gesamte Pipeline und schreibt in `investments` und
 * `kontakte`. Das Ausfuehrungsrecht lag bis zum 16.09.2026 bei
 * `authenticated`, also bei jedem angemeldeten Nutzer einschliesslich jedes
 * Kunden im Portal. Seit
 * `20260916180000_bulk_recompute_nur_berechtigte.sql` darf nur noch
 * `service_role`.
 *
 * Geprueft wird hier nicht das Verhalten der Datenbank, sondern dass die
 * Entscheidung im Quellstand steht und nicht unbemerkt zurueckgedreht wird.
 * Das ist der Fehler, der sich hier schon einmal ereignet hat: Die
 * Rechtevergabe wanderte ueber fuenf Migrationen, und am Ende blieb
 * `authenticated` uebrig, weil ein REVOKE die Rolle nicht mitnannte.
 * Massgeblich ist immer die zeitlich letzte Migration.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONEN = join(process.cwd(), "supabase", "migrations");

/** Iststand einer Datei im Migrationsordner. */
function lies(datei: string): string {
  return readFileSync(join(MIGRATIONEN, datei), "utf8");
}

/**
 * Alle Migrationen in der Reihenfolge, in der sie laufen.
 *
 * iCloud-Kopien tragen ein Leerzeichen mit Ziffer im Namen und laufen in
 * Supabase nie. Sie wuerden hier nur falsche Treffer erzeugen.
 */
function alleMigrationen(): string[] {
  return readdirSync(MIGRATIONEN)
    .filter((n) => n.endsWith(".sql"))
    .filter((n) => !/ \d+\.sql$/.test(n))
    .sort();
}

describe("bulk_recompute_pipeline steht nur dem Dienst offen", () => {
  it("die zeitlich letzte Rechtevergabe entzieht authenticated", () => {
    const betroffen = alleMigrationen().filter((name) => {
      const text = lies(name);
      return /(?:REVOKE|GRANT)\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bulk_recompute_pipeline/i
        .test(text);
    });

    // Die letzte Datei, die das Recht anfasst, ist die aus diesem Befund.
    expect(betroffen.at(-1)).toBe("20260916180000_bulk_recompute_nur_berechtigte.sql");

    const letzte = lies(betroffen.at(-1)!);
    expect(letzte).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bulk_recompute_pipeline\(\)\s*\n?\s*FROM\s+authenticated,\s*anon,\s*public/i,
    );
    expect(letzte).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bulk_recompute_pipeline\(\)\s*\n?\s*TO\s+service_role/i,
    );

    /*
     * Und kein GRANT an authenticated mehr, auch nicht nebenbei. Geprueft
     * werden nur die Anweisungen, nicht der Kommentarkopf: Der erzaehlt die
     * Geschichte der Rechtevergabe und nennt `authenticated` mehrfach.
     */
    const anweisungen = letzte
      .split("\n")
      .filter((z) => !z.trimStart().startsWith("--"))
      .join("\n");
    expect(anweisungen).not.toMatch(/GRANT[^;]*authenticated/i);
  });

  it("die Migration ist wiederholbar und traegt einen Prueflauf", () => {
    const text = lies("20260916180000_bulk_recompute_nur_berechtigte.sql");

    // REVOKE, GRANT und COMMENT sind wiederholbar. Ein CREATE TABLE oder ein
    // INSERT ohne Absicherung waere es nicht.
    expect(text).not.toMatch(/^\s*(CREATE\s+TABLE|INSERT\s+INTO|ALTER\s+TABLE)/im);

    expect(text).toContain("PRUEFLAUF");

    // Der Prueflauf gehoert auskommentiert, sonst laeuft er beim Einspielen
    // mit. Ab der Zeile mit dem Wort darf nichts Ausfuehrbares mehr kommen.
    const zeilen = text.split("\n");
    const start = zeilen.findIndex((z) => z.includes("PRUEFLAUF"));
    expect(start).toBeGreaterThan(0);
    for (const zeile of zeilen.slice(start)) {
      if (zeile.trim() === "") continue;
      expect(zeile.trimStart().startsWith("--")).toBe(true);
    }
  });

  it("niemand ruft die Funktion aus dem Browser", () => {
    // Der einzige Aufrufer ist die Edge Function, und die nimmt den
    // Service-Key. Kaeme ein Aufruf aus `src/` dazu, waere der Entzug ein
    // kaputter Knopf und der Test soll darauf hinweisen.
    const edge = readFileSync(
      join(process.cwd(), "supabase", "functions", "recompute-pipeline", "index.ts"),
      "utf8",
    );
    expect(edge).toContain('supabase.rpc("bulk_recompute_pipeline")');
    expect(edge).toContain("serviceRoleKey");
  });
});
