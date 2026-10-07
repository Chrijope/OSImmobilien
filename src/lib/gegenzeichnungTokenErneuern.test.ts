/**
 * Offene Gegenzeichnungen: neuer Token, Verweis auf die Unterschrift
 * (Migration 20260927080000, Codex-Pruefung 27.09.2026, NB-02).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fassungDesHinterlegtenVertrags, VERTRAGS_FASSUNG, VERTRAGS_FASSUNG_ALT } from "@/lib/vertragKonditionen";

const lies = (pfad: string) => readFileSync(join(process.cwd(), pfad), "utf8");
const sql = lies("supabase/migrations/20260927080000_gegenzeichnung_token_erneuern.sql");

describe("Migration 20260927080000", () => {
  it("trägt bewerberRequestId nach: zuletzt unterschriebene echte Vertragsanfrage, kein Testversand", () => {
    expect(sql).toMatch(/'bewerberRequestId',\s+\(SELECT v\.id::text/);
    expect(sql).toContain("AND v.person_type = 'vertrag'");
    expect(sql).toContain("AND v.status = 'signed'");
    expect(sql).toContain("coalesce(v.sa_data ->> 'testversand', 'false') <> 'true'");
    expect(sql).toContain("ORDER BY v.signed_at DESC NULLS LAST, v.created_at DESC");
  });

  it("gibt jeder offenen Gegenzeichnung einmal einen neuen Token", () => {
    expect(sql).toContain("SET token = gen_random_uuid()::text");
    expect(sql).toMatch(/WHERE person_type = 'vertrag_kurz'\s+AND status = 'pending'\s+AND coalesce\(sa_data ->> 'tokenErneuertAm', ''\) = ''/);
  });

  it("entfernt vertragKurzAnfrageToken aus den Bewerbungen", () => {
    expect(sql).toContain("SET meta = meta - 'vertragKurzAnfrageToken'");
  });

  it("liegt, solange sie offen ist, im Eingangskorb; die Prüfzeilen bleiben", () => {
    const korb = "supabase/migrations-inbox/20260927080000_gegenzeichnung_token_erneuern.sql";
    if (existsSync(join(process.cwd(), korb))) expect(lies(korb)).toBe(sql);
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    expect(pruefung).toContain("27.1 ");
    expect(pruefung).toContain("27.2 ");
  });

  it("die Erinnerung an den Gegenzeichner nimmt den Token beim Klick frisch, auf dem Server", () => {
    // Seit 20260929200000 liest der Browser den Token nicht mehr. Die
    // Function holt ihn bei jedem Klick aus der offenen Anfrage.
    const tab = lies("src/components/bewerbung/VertragsTab.tsx");
    const remind = tab.slice(tab.indexOf("const remind = async () => {"));
    expect(remind).toContain('signaturLinkErinnern({ art: "vertrag_kurz"');
    expect(remind).not.toContain("token=");
    const fn = lies("supabase/functions/signatur-link-erinnern/index.ts");
    const kurz = fn.slice(fn.indexOf('art === "vertrag_kurz"'));
    expect(kurz.indexOf('.eq("status", "pending")')).toBeGreaterThan(0);
    expect(kurz.indexOf('.eq("status", "pending")')).toBeLessThan(kurz.indexOf("signatureUrl"));
  });
});

describe("Fassung beim Hochladen wie beim Wiederversand (NB-05)", () => {
  it("die gespeicherte Kennung, ohne Kennung die Altfassung, nie die aktuelle", () => {
    expect(fassungDesHinterlegtenVertrags({ vertragFassung: "2026-09-10" })).toBe("2026-09-10");
    expect(fassungDesHinterlegtenVertrags({ vertragFassung: "" })).toBe(VERTRAGS_FASSUNG_ALT);
    expect(fassungDesHinterlegtenVertrags({})).toBe(VERTRAGS_FASSUNG_ALT);
    expect(fassungDesHinterlegtenVertrags({ vertragFassung: "  " })).not.toBe(VERTRAGS_FASSUNG);
  });
  it("Hochladen und Wiederversand nutzen dieselbe Regel", () => {
    const tab = lies("src/components/bewerbung/VertragsTab.tsx");
    expect(tab).toContain(": fassungDesHinterlegtenVertrags(b);");
    expect(tab).toContain("fassung: fassungDesHinterlegtenVertrags(b),");
    expect(tab).not.toContain("vertragsDokumentKennung(b, aktiv?.id)");
  });
});

describe("Formulare bleiben während des Absendens angemeldet (NB-08)", () => {
  it("Konfigurator und Lead-Funnel", () => {
    expect(lies("src/components/handbuch/Konfigurator.tsx")).toMatch(/useFormularOffenFuerPixel\(\s+sendet \|\|/);
    expect(lies("src/components/landing/LeadFunnelDialog.tsx")).toMatch(/useFormularOffenFuerPixel\(\s+isSubmitting \|\|/);
  });

  it("die offene Handbuch-Selbstauskunft hat seit 27.09.2026 gar kein Pixel mehr (Punkt 6)", () => {
    const seite = lies("src/pages/HandbuchSelbstauskunftOffen.tsx");
    expect(seite).not.toMatch(/useMetaPixelMitEinwilligung\(|useFormularOffenFuerPixel\(/);
  });
});
