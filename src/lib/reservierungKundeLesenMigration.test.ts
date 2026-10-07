import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Die Leseregel für die Reservierungsvereinbarung im Kundenportal (26.09.2026).
 *
 * Die Migration lässt sich hier nicht ausführen. Der Quelltext hält fest, dass
 * die Regel eng bleibt: nur Lesen, nur der Ordner `reservierung/`, nur der
 * eigene Kontakt, und dass Person 2 dabei ist.
 */

const DATEI = "20260926150000_reservierung_kunde_lesen.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
/** Nur die ausführbaren Zeilen, ohne die Erklärung im Kopf. */
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Migration reservierung_kunde_lesen", () => {
  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und im README", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("Kunde liest eigene Reservierungsvereinbarung");
  });

  it("legt genau eine Regel an, und die darf nur lesen", () => {
    expect(CODE.match(/CREATE POLICY/g)).toHaveLength(1);
    expect(CODE).toContain("FOR SELECT TO authenticated");
    expect(CODE).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\b/);
  });

  it("gilt nur im Eimer unterlagen und nur im Ordner reservierung", () => {
    expect(CODE).toContain("bucket_id = 'unterlagen'");
    expect(CODE).toContain("(storage.foldername(name))[1] = 'reservierung'");
  });

  it("verlangt den eigenen Kontakt als zweite Ordnerebene, für Person 1 und Person 2", () => {
    expect(CODE).toContain("k.id::text = (storage.foldername(name))[2]");
    expect(CODE).toContain("(k.meta ->> 'authUserId') = (SELECT auth.uid()::text)");
    expect(CODE).toContain("((k.meta -> 'person2') ->> 'authUserId') = (SELECT auth.uid()::text)");
  });

  it("lässt den Kundenordner bewusst aus, dort prüft die Freigabe nur die Oberfläche", () => {
    expect(CODE).not.toContain("'kundenordner'");
  });

  it("ist mehrfach ausführbar", () => {
    expect(CODE).toContain('DROP POLICY IF EXISTS "Kunde liest eigene Reservierungsvereinbarung" ON storage.objects;');
  });
});
