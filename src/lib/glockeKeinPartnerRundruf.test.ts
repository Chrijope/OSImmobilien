/**
 * Waechter: Keine Glocke an die ganze Rolle Vertriebspartner.
 *
 * Christians Vorgabe vom 28.09.2026: Es duerfen nie Glocken mit Kundennamen
 * an alle Vertriebspartner gehen. Bis dahin stand in mehreren
 * Prozess-Glocken `else notifyByRole("vertriebspartner", …)` und in den
 * geplanten Erinnerungen `targetRole: "vertriebspartner"`. Hatte der Kunde
 * keinen Zustaendigen, etwa nach der Rueckgabe an die Zentrale, las jeder
 * Partner im Haus den Kundennamen. Ohne Zustaendigen geht so etwas jetzt an
 * die Leitung, also Admin, Inhaber und Vertriebsleitung (`notifyZustaendigen`
 * in `bellNotifications.ts`, seit dem 28.09.2026 statt des Backoffice).
 *
 * Dieser Test sucht im Browser-Code nach jeder Stelle, die an die Rolle
 * `vertriebspartner` als Ganzes meldet. Rundrufe ohne Kundenbezug (News)
 * stehen namentlich in der Ausnahmeliste.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const WURZEL = resolve(__dirname, "../..");
const SRC = join(WURZEL, "src");

function alleDateien(ordner: string, gesammelt: string[] = []): string[] {
  for (const eintrag of readdirSync(ordner)) {
    if (eintrag === "node_modules" || eintrag.startsWith(".")) continue;
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) alleDateien(pfad, gesammelt);
    else if (/\.tsx?$/.test(pfad) && !/\.test\.tsx?$/.test(pfad)) gesammelt.push(pfad);
  }
  return gesammelt;
}

/** Aufrufe von notifyByRole samt erstem Argument, der Rolle oder Rollenliste. */
const ROLLEN_AUFRUF = /notifyByRole\(\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/g;
const WARTESCHLANGE = /(targetRole|target_role)\s*:\s*["']vertriebspartner["']/;

/** An alle internen Nutzer, also auch alle Partner. Nur ohne Kundenbezug erlaubt. */
const ALLE_INTERNEN_ERLAUBT = new Set([
  "src/pages/News.tsx", // News an die Belegschaft, kein Kunde im Text
  "src/lib/bellNotifications.ts", // Definition
]);

describe("Keine Glocke an die ganze Rolle Vertriebspartner", () => {
  const dateien = alleDateien(SRC).map((pfad) => ({
    datei: relative(WURZEL, pfad).split("\\").join("/"),
    inhalt: readFileSync(pfad, "utf8"),
  }));

  it("findet die Suche ueberhaupt Aufrufe (sonst waere der Waechter blind)", () => {
    const treffer = dateien.flatMap(({ inhalt }) => [...inhalt.matchAll(ROLLEN_AUFRUF)]);
    expect(treffer.length).toBeGreaterThan(5);
  });

  it("notifyByRole nennt nirgends die Rolle vertriebspartner", () => {
    const funde: string[] = [];
    for (const { datei, inhalt } of dateien) {
      for (const m of inhalt.matchAll(ROLLEN_AUFRUF)) {
        if (m[1].includes("vertriebspartner")) funde.push(`${datei}: ${m[0]}`);
      }
    }
    expect(funde).toEqual([]);
  });

  it("keine geplante Glocke an die Rolle vertriebspartner", () => {
    const funde = dateien
      .filter(({ inhalt }) => WARTESCHLANGE.test(inhalt))
      .map(({ datei }) => datei);
    expect(funde).toEqual([]);
  });

  it("notifyAllInternal nur an den erlaubten Stellen ohne Kundenbezug", () => {
    const funde = dateien
      .filter(({ datei, inhalt }) => inhalt.includes("notifyAllInternal(") && !ALLE_INTERNEN_ERLAUBT.has(datei))
      .map(({ datei }) => datei);
    expect(funde).toEqual([]);
  });

  it("die Warteschlange leitet alte Zeilen an die Rolle vertriebspartner zur Leitung um", () => {
    const quelle = readFileSync(
      join(WURZEL, "supabase/functions/process-scheduled-notifications/index.ts"),
      "utf8",
    );
    expect(quelle).toMatch(/target_role === "vertriebspartner"\s*\?\s*\["admin", "inhaber", "vertriebsleiter"\]/);
    expect(quelle).not.toMatch(/target_role === "vertriebspartner"\s*\?\s*\[[^\]]*backoffice/);
  });

  it("die Rueckfaelle ohne Zustaendigen in der Datenbank nennen die Vertriebsleitung", () => {
    const sql = readFileSync(
      join(WURZEL, "supabase/migrations/20260928230000_glocke_ohne_zustaendigen_an_leitung.sql"),
      "utf8",
    );
    const rueckfall = "WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)";
    expect(sql.split(rueckfall).length - 1).toBe(2);
    expect(sql).not.toContain("'backoffice'");

    // Uebriger Rumpf wortgleich zur Fassung aus 20260928180000.
    const vorlage = readFileSync(join(WURZEL, "supabase/migrations/20260928180000_kennung_statt_name.sql"), "utf8");
    const rumpf = (s: string) => s.slice(
      s.indexOf("CREATE OR REPLACE FUNCTION public.create_empfehlung_kontakt("),
      s.indexOf("\n", s.indexOf("GRANT EXECUTE ON FUNCTION public.create_tippgeber_lead(")),
    );
    const altRolle = "WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role)";
    expect(rumpf(sql)).toBe(rumpf(vorlage).split(altRolle).join(rueckfall.trim()));

    // Solange offen, gleichlautend im Eingangskorb und in der Sammeldatei.
    const korb = join(WURZEL, "supabase/migrations-inbox/20260928230000_glocke_ohne_zustaendigen_an_leitung.sql");
    if (existsSync(korb)) {
      expect(readFileSync(korb, "utf8")).toBe(sql);
      expect(readFileSync(join(WURZEL, "supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql"), "utf8")).toContain(sql.trim());
    }
  });
});
