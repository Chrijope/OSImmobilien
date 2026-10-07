import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Absicherung von Functions vom 04.10.2026. Deno-Code laeuft nicht im
 * Vitest-Prozess, geprueft wird deshalb der Wortlaut, damit der Schutz nicht
 * still wieder verschwindet.
 */
const lies = (...teile: string[]) => readFileSync(join(process.cwd(), "supabase", "functions", ...teile), "utf8");

describe("interner Aufrufer", () => {
  const helfer = lies("_shared", "interner-aufrufer.ts");

  it("verlangt Anmeldung, interne Rolle und ein nicht gesperrtes Profil", () => {
    expect(helfer).toContain("admin.auth.getUser(token)");
    expect(helfer).toContain('admin.rpc("is_internal_role"');
    expect(helfer).toContain('.select("gesperrt")');
    expect(helfer).toContain('if (profil?.gesperrt === true) return antwort("Keine Berechtigung", 403);');
  });

  it.each(["extract-loan-terms", "erstgespraech-zusammenfassung"])("%s nutzt ihn vor allem anderen", (name) => {
    expect(lies(name, "index.ts")).toContain("const aufrufer = await internerAufrufer(req, corsHeaders);");
  });
});

describe("extract-loan-terms", () => {
  const quelle = lies("extract-loan-terms", "index.ts");
  /* Dieselbe Positivliste wie in der Function. Steht sie dort anders, faellt
     der Wortlauttest unten, und diese Faelle gehoeren nachgezogen. */
  const muster = /^finanzierung\/[A-Za-z0-9_-]+(\/[A-Za-z0-9._-]+)+$/;
  const gueltig = (pfad: string) => muster.test(pfad) && !pfad.split("/").some((teil) => /^\.+$/.test(teil));

  it("hat die Positivliste fuer den Pfad", () => {
    expect(quelle).toContain(String.raw`const PFAD_MUSTER = /^finanzierung\/[A-Za-z0-9_-]+(\/[A-Za-z0-9._-]+)+$/;`);
    expect(quelle).toContain(String.raw`!pfad.split("/").some((teil) => /^\.+$/.test(teil))`);
    expect(quelle).not.toMatch(/fileUrl\?:|body\.fileUrl/);
  });

  it("laesst echte Pfade durch und Spruenge nicht", () => {
    expect(gueltig("finanzierung/0b6f1c2e-1111-2222-3333-444455556666/fa-1727000000000-abc/fd-1727000000000-3_1727000000123.pdf")).toBe(true);
    expect(gueltig("finanzierung/x/../../kunden/a.pdf")).toBe(false);
    expect(gueltig("finanzierung/x/.../a.pdf")).toBe(false);
    expect(gueltig("finanzierung/x/a b.pdf")).toBe(false);
    expect(gueltig("kunden/x/a.pdf")).toBe(false);
    expect(gueltig("finanzierung/a.pdf")).toBe(false);
  });
});

describe("steuer-auswertung-versand", () => {
  const quelle = lies("steuer-auswertung-versand", "index.ts");

  it("nimmt den Ansprechpartner nicht aus der Anfrage", () => {
    expect(quelle).toContain("beraterAusProfil(admin, beraterSlug, beraterUserId)");
    expect(quelle).not.toMatch(/beraterName,\s*\n\s*beraterEmail,/);
  });

  it("bremst je Adresse, insgesamt und faengt Bots ohne Versand ab", () => {
    expect(quelle).toContain("const JE_EMPFAENGER_PRO_TAG = 3;");
    expect(quelle).toContain('scope: "steuer-auswertung-empfaenger"');
    expect(quelle).toContain('scope: "steuer-auswertung-gesamt"');
    expect(quelle).toContain("const MINDESTDAUER_MS = 1500;");
    expect(quelle).toContain("return json({ pdfUrl: null, mailVersendet: false });");
  });
});

describe("edge-rate-limit", () => {
  const helfer = lies("_shared", "edge-rate-limit.ts");

  it("bleibt standardmaessig offen, schliesst aber mit failClosed", () => {
    expect(helfer).toContain("failClosed?: boolean;");
    expect(helfer).toContain("return opts.failClosed ? gesperrt : { ok: true, exceeded: false };");
    expect(helfer).toContain('typeof (data as any)?.exceeded !== "boolean"');
  });

  it("liest cf-connecting-ip vor x-forwarded-for", () => {
    const cf = helfer.indexOf('req.headers.get("cf-connecting-ip")');
    const real = helfer.indexOf('req.headers.get("x-real-ip")');
    const xff = helfer.indexOf('req.headers.get("x-forwarded-for")');
    expect(cf).toBeGreaterThan(0);
    expect(cf).toBeLessThan(real);
    expect(real).toBeLessThan(xff);
  });

  it.each([
    ["steuer-auswertung-versand", 3],
    ["erstgespraech-zusammenfassung", 1],
  ])("%s schaltet failClosed ein und antwortet 503", (name, anzahl) => {
    const quelle = lies(name, "index.ts");
    expect(quelle.match(/failClosed: true/g)?.length).toBe(anzahl);
    expect(quelle).toMatch(/503/);
  });
});

describe("Automatiken ohne Zeitplan", () => {
  it("der Helfer kennt den strengen Modus", () => {
    const helfer = lies("_shared", "automatik-schutz.ts");
    expect(helfer).toContain("optionen: { streng?: boolean } = {}");
    expect(helfer).toContain("if (!geheimwort && optionen.streng) {");
  });

  it.each(["daily-backup", "auto-purge-papierkorb"])("%s weist ohne Geheimwort immer ab", (name) => {
    expect(lies(name, "index.ts")).toContain(`automatikSchutz(req, "${name}", corsHeaders, { streng: true })`);
  });
});
