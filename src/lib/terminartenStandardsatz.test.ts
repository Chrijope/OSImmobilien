import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Wacht ueber die Migration, die den Standardsatz der vier Terminarten
 * nachtraegt.
 *
 * Vorgeschichte: 20260827200000 hat den Satz nur fuer Nutzer angelegt, die in
 * `videocall_freigaben` stehen. Admins und Inhaber kommen ohne Eintrag dort
 * durch die Berechtigungspruefung und wurden uebersprungen, sie haben den Satz
 * bis heute nicht. 20260905120000 traegt ihn nach.
 *
 * Drei Zusagen werden hier geprueft, und zwar am Text der Migration: Die Tests
 * laufen ohne Supabase, eine laufende Datenbank gibt es hier nicht.
 *
 *   1. Wortgleich. Alle Migrationen, die den Satz anlegen, schreiben dieselben
 *      Bezeichnungen, Beschreibungen, Anlaesse und Sortierungen. Liefe das
 *      auseinander, haetten zwei Nutzer unterschiedliche Texte am selben
 *      Termin.
 *   2. Mehrfach ausfuehrbar. Jede Einfuegung haengt an einer Bedingung, die
 *      sowohl den Anlass als auch die Bezeichnung prueft. Ohne sie legte ein
 *      zweiter Lauf alles ein zweites Mal an.
 *   3. Nichts wird ueberschrieben. Kein UPDATE, kein DELETE auf
 *      `buchung_terminarten`. Wer eine Terminart umbenannt oder abgeschaltet
 *      hat, behaelt seine Fassung.
 */

const ORDNER = resolve(__dirname, "../../supabase/migrations");

/** Die Migration, die den Standardsatz nachtraegt. */
const NACHTRAG = "20260905120000_terminarten_standardsatz_nachtragen.sql";

/**
 * Der Block `CROSS JOIN (VALUES ...) AS v(bezeichnung, beschreibung, anlass,
 * sortierung)` aus einer Migration, oder null, wenn sie ihn nicht hat.
 */
function standardsatzBlock(datei: string): string | null {
  const sql = readFileSync(resolve(ORDNER, datei), "utf8");
  const anfang = sql.indexOf("CROSS JOIN (VALUES");
  if (anfang < 0) return null;
  const ende = sql.indexOf(") AS v(bezeichnung, beschreibung, anlass, sortierung)", anfang);
  if (ende < 0) return null;
  // Einrueckung und Zeilenumbrueche spielen keine Rolle, der Inhalt schon.
  return sql.slice(anfang, ende).replace(/\s+/g, " ").trim();
}

function migrationenMitStandardsatz(): string[] {
  return readdirSync(ORDNER)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => standardsatzBlock(f) !== null)
    .sort();
}

const NACHTRAG_SQL = readFileSync(resolve(ORDNER, NACHTRAG), "utf8");

describe("Standardsatz der Terminarten", () => {
  it("steht in mindestens zwei Migrationen, die neue ist dabei", () => {
    const dateien = migrationenMitStandardsatz();
    expect(dateien).toContain(NACHTRAG);
    expect(dateien.length).toBeGreaterThan(1);
  });

  it("ist in allen Migrationen wortgleich", () => {
    const dateien = migrationenMitStandardsatz();
    const bloecke = new Map(dateien.map((f) => [f, standardsatzBlock(f)!]));
    const massgeblich = bloecke.get("20260827200000_videocall_freigaben.sql");
    expect(massgeblich, "die Fassung vom 27.08.2026 fehlt").toBeTruthy();
    for (const [datei, block] of bloecke) {
      expect(block, `${datei} weicht vom Standardsatz ab`).toBe(massgeblich);
    }
  });

  it("nennt genau die vier bekannten Anlaesse in dieser Reihenfolge", () => {
    const block = standardsatzBlock(NACHTRAG)!;
    const anlaesse = [...block.matchAll(/'([a-z]+)', (\d+)\)/g)].map((t) => t[1]);
    expect(anlaesse).toEqual([
      "erstgespraech", "beratung", "objektvorstellung", "finanzierungsgespraech",
    ]);
  });

  it("traegt die vier Bezeichnungen, die Christian erwartet", () => {
    const block = standardsatzBlock(NACHTRAG)!;
    for (const name of [
      "Telefonisches Erstgespräch", "Beratungsgespräch",
      "Objektvorstellung", "Finanzierungsgespräch",
    ]) {
      expect(block, `${name} fehlt im Standardsatz`).toContain(`('${name}',`);
    }
  });
});

describe("Der Nachtrag richtet keinen Schaden an", () => {
  it("legt nichts doppelt an: geprueft wird Anlass und Bezeichnung", () => {
    expect(NACHTRAG_SQL).toContain("NOT EXISTS");
    expect(NACHTRAG_SQL).toContain("t.anlass = v.anlass");
    expect(NACHTRAG_SQL).toContain("lower(btrim(t.bezeichnung)) = lower(v.bezeichnung)");
  });

  it("ueberschreibt nichts und loescht nichts", () => {
    const ohneKommentare = NACHTRAG_SQL
      .split("\n")
      .filter((z) => !z.trimStart().startsWith("--"))
      .join("\n");
    expect(ohneKommentare).not.toMatch(/UPDATE\s+public\.buchung_terminarten/i);
    expect(ohneKommentare).not.toMatch(/DELETE\s+FROM\s+public\.buchung_terminarten/i);
    expect(ohneKommentare).not.toMatch(/ON\s+CONFLICT/i);
    expect(ohneKommentare).not.toMatch(/TRUNCATE/i);
  });

  it("erreicht alle drei Gruppen mit Zugang zum Buchungskalender", () => {
    expect(NACHTRAG_SQL).toContain("public.is_admin_role(p.id)");
    expect(NACHTRAG_SQL).toContain("public.videocall_freigaben");
    expect(NACHTRAG_SQL).toContain("public.buchung_einstellungen");
  });

  /*
   * Geprüft wird die maßgebliche Historie, nicht der Eingangskorb.
   *
   * Der Korb ist eine Merkliste dessen, was in Supabase noch nicht gelaufen
   * ist, und wird geleert, sobald es gelaufen ist. Diese Migration lief am
   * 07.09.2026, deshalb prüft der Test seitdem supabase/migrations/.
   */
  it("liegt in der maßgeblichen Historie", () => {
    const historie = resolve(__dirname, "../../supabase/migrations");
    expect(readdirSync(historie)).toContain(NACHTRAG);
  });
});
