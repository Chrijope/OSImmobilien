/**
 * Kundenportal: Empfehlungsprogramm anfragen und Empfehlung abgeben
 * (Vorgabe vom 04.10.2026). Aufgabe und Glocke gehen an den Zuständigen über
 * die Kennung, ohne ihn an die Leitung; die Glocke zeigt auf die Aufgabe.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SEITE = readFileSync("src/pages/KundeEmpfehlungen.tsx", "utf8");
const INBOX = readFileSync("src/pages/Inbox.tsx", "utf8");
const DATEI = "20261004175000_empfehlungsprogramm_anfrage.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");

describe("KundeEmpfehlungen", () => {
  it("Empfehlung über create_empfehlung_kontakt, nicht mehr direkt in Tabellen", () => {
    expect(SEITE).toContain('supabase.rpc("create_empfehlung_kontakt"');
    expect(SEITE).not.toMatch(/from\("kontakte"\)\.insert/);
    expect(SEITE).not.toMatch(/from\("empfehlungen"\)\.insert/);
  });
  it("kein Beratername mehr für die Zuständigkeit", () => {
    expect(SEITE).not.toMatch(/profiles_public/);
    expect(SEITE).not.toMatch(/kontakt\.berater/);
  });
  it("Anfrage über die Funktion, Rückfall nur mit Zuständigem, Fehler werden ausgewertet", () => {
    expect(SEITE).toContain('supabase.rpc("empfehlungsprogramm_anfragen" as any, { _kontakt_id: kontakt.id })');
    expect(SEITE).toContain("if (!funktionFehlt(error)) throw error;");
    // Rueckfall ohne Funktion: nur Glocke an den Zustaendigen, keine Aufgabe des Kunden.
    const rueckfall = SEITE.slice(SEITE.indexOf("async function programmAnfrageOhneFunktion"), SEITE.indexOf("export default function"));
    expect(rueckfall).not.toContain('from("aufgaben")');
    expect(rueckfall).toContain("benutzer_id: zustaendig");
    expect(rueckfall).toContain("if (!zustaendig) throw");
    expect(rueckfall).toContain("if (glockeFehler) throw glockeFehler;");
    // Erfolg erst nach allen Schritten
    const anfrage = SEITE.slice(SEITE.indexOf("const handleRequestProgramm"));
    expect(anfrage.indexOf("setRequestSent(true)")).toBeGreaterThan(anfrage.indexOf("programmAnfrageOhneFunktion(kontakt"));
  });
  it("Kundentexte der Fehlermeldungen kommen aus beiden Sprachdateien", () => {
    for (const sprache of ["de", "en"]) {
      const json = JSON.parse(readFileSync(`src/i18n/locales/${sprache}.json`, "utf8"));
      expect(json.portal.empfehlungen.request_error).toBeTruthy();
      expect(json.portal.empfehlungen.submit_error).toBeTruthy();
    }
  });
});

describe("Inbox hebt die verlinkte Aufgabe hervor", () => {
  it("liest ?aufgabe= und markiert die Karte", () => {
    expect(INBOX).toContain('suchParameter.get("aufgabe")');
    expect(INBOX).toContain("id={`inbox-${a.id}`}");
  });
});

describe(`Migration ${DATEI}`, () => {
  it("prüft den Kontakt des Kunden über das Portalkonto", () => {
    expect(SQL).toContain("(meta ->> 'authUserId') = _uid::text");
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.empfehlungsprogramm_anfragen(uuid) FROM public, anon;");
  });
  it("Empfänger: Zuständiger über die Kennung, sonst Admin, Inhaber, Vertriebsleitung", () => {
    expect(SQL).toContain("SELECT _k.zustaendig_id WHERE _k.zustaendig_id IS NOT NULL");
    expect(SQL).toMatch(/WHERE _k\.zustaendig_id IS NULL\s+AND ur\.role IN \('admin'::public\.app_role, 'inhaber'::public\.app_role, 'vertriebsleiter'::public\.app_role\)/);
    const rumpf = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");
    expect(rumpf).not.toMatch(/berater_name_normal|setter|berater/i);
  });
  it("Aufgabe gehört dem Empfänger, Glocke zeigt auf die Aufgabe, keine Doppelanfrage", () => {
    expect(SQL).toMatch(/VALUES \(\s*_empfaenger, _empfaenger, _k\.id, _titel/);
    expect(SQL).not.toMatch(/VALUES \(\s*_uid,/);
    expect(SQL).toContain("PERFORM pg_advisory_xact_lock(hashtext(_marker));");
    expect(SQL).toContain("_marker := 'empfehlungsprogramm:' || _k.id::text;");
    expect(SQL).toContain("a.ausloeser_schluessel LIKE _marker || ':%'");
    expect(SQL).not.toContain("a.titel = _titel");
    // Sperre vor der Pruefung
    expect(SQL.indexOf("pg_advisory_xact_lock")).toBeLessThan(SQL.indexOf("IF EXISTS ("));
    expect(SQL).toContain("'/inbox?art=aufgabe&aufgabe=' || _aufgabe_id::text");
    expect(SQL).toContain("'bereits_offen', true");
  });
  it("liegt im Eingangskorb und in der Sammeldatei", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    expect(existsSync(korb)).toBe(true);
    expect(readFileSync(korb, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("76.1");
  });
});
