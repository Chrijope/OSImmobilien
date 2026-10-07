/**
 * Reservierungslink nach dem Aufheben ungültig (05.10.2026): Migration
 * 20261005130000, finalize-reservierung, Signaturseite und Eingangskorb.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { RV_AUFGEHOBEN, vorLetztemAufheben } from "../../supabase/functions/_shared/reservierung-anfragerunde.ts";
import { SIGNATUR_SEITE_TEXTE } from "./signaturSeiteTexte";

const lies = (pfad: string) => readFileSync(pfad, "utf8");

const DATEI = "20261005130000_rv_link_nach_aufheben.sql";
const SQL = lies(`supabase/migrations/${DATEI}`);
const ohneKommentare = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("vorLetztemAufheben", () => {
  const meta = { rvZuletztAufgehobenAm: "2026-10-05T12:00:00.000Z" };
  it("Anfragen vor dem Aufheben zählen nicht, danach wieder", () => {
    expect(vorLetztemAufheben({ created_at: "2026-10-05T11:59:59Z" }, meta)).toBe(true);
    expect(vorLetztemAufheben({ created_at: "2026-10-05T12:00:01Z" }, meta)).toBe(false);
  });
  it("ohne oder mit unlesbarem Vermerk ändert sich nichts", () => {
    expect(vorLetztemAufheben({ created_at: "2026-10-01T00:00:00Z" }, {})).toBe(false);
    expect(vorLetztemAufheben({ created_at: "2026-10-01T00:00:00Z" }, { rvZuletztAufgehobenAm: "kaputt" })).toBe(false);
    expect(vorLetztemAufheben({ created_at: null }, meta)).toBe(false);
  });
});

describe(DATEI, () => {
  it("prüft nur rv-Anfragen gegen investments.meta.rvZuletztAufgehobenAm, uuid gegen text sicher", () => {
    expect(ohneKommentare).toContain("_person_type NOT LIKE 'rv\\_%'");
    expect(ohneKommentare).toContain("WHERE i.id::text = _investment_id;");
    expect(ohneKommentare).toContain("RETURN _created_at < _am;");
    expect(ohneKommentare).toContain("REVOKE ALL ON FUNCTION public.rv_anfrage_aufgehoben(text, text, timestamptz) FROM anon, authenticated;");
  });

  it("Abruf markiert und meldet, Unterschreiben lehnt ab", () => {
    expect(ohneKommentare).toMatch(/get_signature_request\(_token text\)\nRETURNS public\.signature_requests\nLANGUAGE plpgsql\nVOLATILE/);
    expect(ohneKommentare).toContain("SET status = CASE WHEN status = 'pending' THEN 'ueberholt' ELSE status END");
    expect(ohneKommentare).toContain("jsonb_build_object('rvAufgehoben', true)");
    expect(ohneKommentare).toContain(`RAISE EXCEPTION '${RV_AUFGEHOBEN.de}'`);
    expect(SQL.indexOf("rv_anfrage_aufgehoben(s.person_type")).toBeLessThan(SQL.indexOf("SET status = 'signed'"));
  });
});

describe("finalize-reservierung und Signaturseite", () => {
  it("die Function zählt aufgehobene Anfragen nicht, markiert sie und lehnt den Link ab", () => {
    const q = lies("supabase/functions/finalize-reservierung/index.ts");
    expect(q).toContain("aktuelleRvAnfragen((rawRequests as any[]).filter((r) => !aufgehoben(r)))");
    expect(q).toContain("error: RV_AUFGEHOBEN.de, errorEn: RV_AUFGEHOBEN.en }, 410)");
  });

  it("die Seite zeigt den eigenen Hinweis in beiden Sprachen, Sie-Form, ohne Gedankenstrich", () => {
    const seite = lies("src/pages/SignaturSeite.tsx");
    expect(seite).toContain('setStatus(data.meta?.rvAufgehoben === true ? "rv_aufgehoben" : "ueberholt")');
    expect(seite).toContain("{t.rvAufgehobenText}");
    expect(SIGNATUR_SEITE_TEXTE.de.rvAufgehobenText).toContain(RV_AUFGEHOBEN.de);
    expect(SIGNATUR_SEITE_TEXTE.en.rvAufgehobenText).toContain(RV_AUFGEHOBEN.en);
    expect(SIGNATUR_SEITE_TEXTE.de.rvAufgehobenText).toMatch(/\bSie\b/);
    for (const t of [SIGNATUR_SEITE_TEXTE.de, SIGNATUR_SEITE_TEXTE.en]) {
      expect(`${t.rvAufgehobenTitel} ${t.rvAufgehobenText}`).not.toMatch(/[–—]/);
    }
  });
});

describe("Eingangskorb", () => {
  it("hat die Prüfzeile 87.1, nur die letzte Zeile endet mit Semikolon", () => {
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    expect(pruefung).toContain("SELECT '87.1 ");
    const schluss = pruefung.split("\n").filter((z) => !z.trim().startsWith("--") && z.trimEnd().endsWith(";"));
    expect(schluss).toHaveLength(1);
  });

  it("liegt, solange offen, unverändert im Korb, in der Sammeldatei und im README", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (!existsSync(korb)) return;
    expect(lies(korb)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL.trim());
    expect(lies("supabase/migrations-inbox/README.md")).toContain(`\`${DATEI}\``);
  });
});
