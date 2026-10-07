import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Person 2 liest im Kundenportal dieselben Unterlagen wie Person 1 (26.09.2026).
 *
 * Die Migration lässt sich hier nicht ausführen. Der Quelltext hält fest, dass
 * Person 2 genau die Ordner bekommt, die "Kunde read unterlagen" für Person 1
 * öffnet, nur lesend und nur für den eigenen Kontakt, und dass die Regel für
 * Person 1 unangetastet bleibt.
 */

const DATEI = "20260926160000_person2_unterlagen_lesen.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
/** Nur die ausführbaren Zeilen, ohne die Erklärung im Kopf. */
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

/** Die Regel für Person 1, so wie sie zuletzt angelegt wurde. */
const PERSON1 = readFileSync("supabase/migrations/20260517104329_976bac9b-346b-48b4-8556-1b5cb7e7a4e0.sql", "utf8");

/** Die Ordnerbedingungen einer Regel, ohne Leerraum, zum Vergleichen. */
function ordnerBedingungen(sql: string): string[] {
  return (sql.match(/\(storage\.foldername\(name\)\)\[\d\] = [^\n)]+/g) ?? []).map((z) => z.replace(/\s+/g, " ").trim());
}

describe("Migration person2_unterlagen_lesen", () => {
  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und im README", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    const sammel = readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8");
    expect(sammel).toContain(SQL.trim());
    expect(sammel).toContain(`-- Teil 2: ${DATEI}`);
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("Person 2 liest Kundenunterlagen");
  });

  it("legt genau eine Regel an, und die darf nur lesen", () => {
    expect(CODE.match(/CREATE POLICY/g)).toHaveLength(1);
    expect(CODE).toContain("FOR SELECT TO authenticated");
    expect(CODE).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\b/);
    expect(CODE).toContain("bucket_id = 'unterlagen'");
  });

  it("gilt nur für Person 2 des eigenen Kontakts", () => {
    expect(CODE).toContain("((k.meta -> 'person2') ->> 'authUserId') = (SELECT auth.uid()::text)");
    // Person 1 hat ihre eigene Regel, hier kommt sie nicht vor.
    expect(CODE).not.toContain("(k.meta ->> 'authUserId')");
  });

  it("öffnet genau die Ordner, die Person 1 lesen darf, nicht mehr", () => {
    const person1Regel = PERSON1.slice(
      PERSON1.indexOf('CREATE POLICY "Kunde read unterlagen"'),
      PERSON1.indexOf("DROP POLICY", PERSON1.indexOf('CREATE POLICY "Kunde read unterlagen"')),
    );
    expect(ordnerBedingungen(CODE)).toEqual(ordnerBedingungen(person1Regel));
    expect(CODE).toContain("(storage.foldername(name))[1] = 'kundenordner'");
    expect(CODE).not.toContain("'reservierung'");
    expect(CODE).not.toContain("'eigen'");
  });

  it("lässt die Regel für Person 1 unangetastet", () => {
    expect(CODE).not.toContain('"Kunde read unterlagen"');
  });

  it("ist mehrfach ausführbar", () => {
    expect(CODE).toContain('DROP POLICY IF EXISTS "Person 2 liest Kundenunterlagen" ON storage.objects;');
  });
});
