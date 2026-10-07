import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dsgvoOrdnerFuerKontakt } from "../../supabase/functions/_shared/zusammengefuehrteOrdner";

/**
 * Die Datenbankfunktion zum Zusammenführen (26.09.2026).
 *
 * Die Migration lässt sich hier nicht ausführen. Der Quelltext hält fest, was
 * Christian entschieden hat: der ältere bleibt, alles wandert, der neuere geht
 * in den Papierkorb und wird nie hart gelöscht.
 */

const DATEI = "20260926230000_kontakte_zusammenfuehren.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Migration kontakte_zusammenfuehren", () => {
  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und im README", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("19.1 Duplikate zusammenfuehren");
  });

  it("ist nur für angemeldete Nutzer aufrufbar und prüft die Rechte wie beim Löschen", () => {
    expect(CODE).toContain("SECURITY DEFINER");
    expect(CODE).toContain("SET search_path = public");
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.kontakte_zusammenfuehren\([^)]*\) FROM anon;/);
    expect(CODE).toMatch(/GRANT EXECUTE ON FUNCTION public\.kontakte_zusammenfuehren\([^)]*\) TO authenticated;/);
    expect(CODE).toContain("public.darf_alle_kunden_sehen(_uid)");
    expect(CODE).toContain("public.is_vp_eigentuemer_of_kontakt(_uid, _neu.zustaendig_id, _neu.meta)");
  });

  it("besteht auf dem älteren Kontakt als dem behaltenen", () => {
    expect(CODE).toContain("'Behalten wird immer der ältere Kontakt.'");
    expect(CODE).toMatch(/_alt\.erstellt_am,[\s\S]*?\) > \([\s\S]*?_neu\.erstellt_am/);
  });

  it("hängt die bekannten Verknüpfungen um, uuid- wie text-Spalten, plus jeden Fremdschlüssel", () => {
    for (const ziel of [
      "investments.kunde_id", "aktivitaeten.kunde_id", "aufgaben.kontakt_id", "kunde_dokumente.kontakt_id",
      "sa_fill_tokens.kontakt_id", "signature_requests.kontakt_id", "handbuch_anforderungen.kontakt_id",
      "buchungen.kontakt_id", "videoraeume.kontakt_id", "emails.kontakt_id", "activation_tokens.kontakt_id",
    ]) expect(CODE).toContain(`'${ziel}'`);
    // Der Spaltentyp kommt aus dem Katalog, nie fest verdrahtet: investments.kunde_id ist uuid,
    // sa_fill_tokens.kontakt_id ist text.
    expect(CODE).toContain("format_type(a.atttypid, a.atttypmod)");
    expect(CODE).toContain("CAST($1 AS %s)");
    expect(CODE).toContain("con.confrelid = 'public.kontakte'::regclass");
    expect(CODE).toContain("'chat_gruppen.kundeId'");
  });

  it("legt den neueren in den Papierkorb und löscht keinen Kontakt hart", () => {
    expect(CODE).toContain("geloescht = true");
    expect(CODE).toContain("'zusammengeführt in ' || _alt_nr");
    expect(CODE).toContain("'zusammengefuehrtIn'");
    expect(CODE).not.toMatch(/DELETE FROM public\.kontakte/i);
  });

  it("überschreibt einen fremden Portalzugang nicht", () => {
    expect(CODE).toContain("_portal_konflikt := true");
    expect(CODE).toContain("_neu_meta := _neu_meta - 'authUserId'");
  });
});

describe("dsgvoOrdnerFuerKontakt", () => {
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";

  it("gibt einem aufgelösten Kontakt keine Ordner mehr, damit seine Dateien beim älteren bleiben", () => {
    expect(dsgvoOrdnerFuerKontakt(B, { zusammengefuehrtIn: A })).toEqual([]);
  });

  it("gibt dem behaltenen Kontakt die Ordner der zusammengeführten dazu", () => {
    expect(dsgvoOrdnerFuerKontakt(A, { zusammenfuehrungen: [{ ausKontaktId: B }, { ausKontaktId: "../x" }] })).toEqual([A, B]);
  });

  it("ändert ohne Zusammenführung nichts", () => {
    expect(dsgvoOrdnerFuerKontakt(A, null)).toEqual([A]);
  });
});
