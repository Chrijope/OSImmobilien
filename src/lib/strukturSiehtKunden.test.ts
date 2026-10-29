import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Migration Teamkette (20261029120000)", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20261029120000_struktur_sieht_kunden_der_downline.sql"), "utf8");

  it("Sehen und Bearbeiten bekommen die Teamkette, Löschen und Zuständigkeit nicht", () => {
    const owner = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.is_vp_owner_of_kontakt"));
    expect(owner.slice(0, owner.indexOf("$$;"))).toContain("public.ist_in_teamkette(_user_id, _zustaendig_id)");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.is_vp_eigentuemer_of_kontakt");
  });

  it("gibt nach oben nur Kennungen heraus", () => {
    expect(sql).toContain("RETURNS TABLE(ebene integer, leiter_id uuid)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.ist_in_teamkette(uuid, uuid) FROM PUBLIC, anon, authenticated;");
  });
});
