import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Absicherung Lesen (Freigabe Christian vom 04.10.2026):
 * K4 Kundendokumente nur noch für Zuständige, H14 Hausverwaltungsdaten nur
 * Hausverwaltung, M6 kein Namensnachschlagen ohne Anmeldung.
 */

const DATEI = "20261004130000_absicherung_lesen.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
const lies = (pfad: string) => readFileSync(pfad, "utf8");

/** Rumpf einer Funktion aus der Migration, ohne Kommentarkopf. */
function rumpf(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("\n$$;", start));
}

describe("K4: Kundendokumente lesen", () => {
  const lesen = rumpf("darf_unterlage_lesen");

  it("ersetzt die Leseregel für alle internen Rollen in beiden Eimern", () => {
    expect(SQL).toContain('DROP POLICY IF EXISTS "Internal read unterlagen" ON storage.objects;');
    expect(SQL).toContain('DROP POLICY IF EXISTS "SA-PDFs: internal or owner read" ON storage.objects;');
    expect(SQL).toContain("USING (bucket_id = 'unterlagen' AND public.darf_unterlage_lesen(auth.uid(), name));");
    expect(SQL).toContain("USING (bucket_id = 'selbstauskunft-pdfs' AND public.darf_unterlage_lesen(auth.uid(), name));");
  });

  it("behält den Kundenteil der SA-PDF-Regel wortgleich", () => {
    expect(SQL).toContain('CREATE POLICY "SA-PDFs: owner read" ON storage.objects');
    expect(SQL).toContain("(k.meta ->> 'authUserId') = auth.uid()::text");
    expect(SQL).toContain("(k.meta -> 'person2' ->> 'authUserId') = auth.uid()::text");
  });

  it("fasst keine Kunden-, Chat- oder Schreibregel an", () => {
    for (const regel of [
      "Kunde read unterlagen", "Person 2 liest Kundenunterlagen", "Chat participants read unterlagen",
      "Kunde liest eigene Reservierungsvereinbarung", "Mobile scan read by valid token",
      "Unterlagen ueberschreiben nur zustaendig", "Internal upload unterlagen",
    ]) {
      expect(SQL).not.toContain(`DROP POLICY IF EXISTS "${regel}"`);
    }
  });

  it("Reihenfolge: Admin, Chat, nur intern, Gesamtsicht, Arbeitsordner, Zuständiger", () => {
    const stellen = [
      "public.is_admin_role(_user_id)",
      "(storage.foldername(_name))[1] = 'chat'",
      "NOT public.is_internal_role(_user_id)",
      "public.darf_alle_kunden_sehen(_user_id)",
      "(storage.foldername(_name))[1] = _user_id::text",
      "public.unterlagen_lese_kontakt(_name)",
      "public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)",
    ].map((s, i, alle) => (i === alle.length - 1 ? lesen.lastIndexOf(s) : lesen.indexOf(s)));
    expect(stellen.every((i) => i > -1)).toBe(true);
    expect([...stellen].sort((a, b) => a - b)).toEqual(stellen);
  });

  it("ordnet Aftersales und Mobil-Scan zu, Mobil-Scan nur über die Sitzung", () => {
    const zuordnung = rumpf("unterlagen_lese_kontakt");
    expect(zuordnung).toContain("teile[1] = 'aftersales'");
    expect(zuordnung).toContain("FROM public.mobile_scan_sessions s WHERE s.token = teile[2]");
    // docFileUrls trägt jeder Partner über register_unterlage_upload selbst ein.
    expect(zuordnung).not.toContain("docFileUrls");
    expect(zuordnung).not.toContain("investments i");
    expect(zuordnung).toContain("RETURN public.unterlagen_pfad_kontakt(_name);");
  });

  it("externe Investments: jeder passende Kontakt zählt, kein LIMIT 1", () => {
    const lesen = rumpf("darf_unterlage_lesen");
    expect(lesen).toContain("(storage.foldername(_name))[1] = 'externe-investments'");
    expect(lesen).toContain("FROM public.externe_investments ei");
    expect(lesen).toContain("AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)");
    expect(SQL).not.toContain("LIMIT 1");
  });

  it("der Resolver ist nicht über die Schnittstelle aufrufbar", () => {
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.unterlagen_lese_kontakt(text) FROM public, anon, authenticated;");
    expect(SQL).not.toContain("GRANT EXECUTE ON FUNCTION public.unterlagen_lese_kontakt");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.darf_unterlage_lesen(uuid, text) TO authenticated;");
  });

  it("bricht bei unbekannter Leseregel der Eimer und bei globaler Leseregel ab", () => {
    expect(SQL).toContain("Unerwartete erlaubende Leseregel");
    expect(SQL).toContain("(coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%bucket_id%'");
    expect(SQL).toContain("ohne Eimerbezug gefunden");
  });
});

describe("Scan-Sitzungen bleiben stehen", () => {
  it("der Cleanup löscht keine mobile_scan_sessions mehr, sonst alles wie vorher", () => {
    const cleanup = rumpf("cleanup_expired_tokens");
    expect(cleanup).not.toMatch(/DELETE\s+FROM\s+public\.mobile_scan_sessions/);
    for (const tabelle of ["activation_tokens", "sa_fill_tokens", "email_unsubscribe_tokens", "signature_requests"]) {
      expect(cleanup).toContain(`DELETE FROM public.${tabelle}`);
    }
    expect(cleanup).toContain("'mobile_scan_sessions', 0,");
    // Zeitplan und Rechte bleiben, wie sie sind.
    expect(SQL).not.toContain("cron.schedule");
    expect(SQL).not.toMatch(/GRANT[^;]*cleanup_expired_tokens/);
  });
});

describe("H14: Hausverwaltung lesen", () => {
  it("acht Tabellen, dienstleister bleibt lesbar", () => {
    expect(SQL).toContain("'Hausverwaltung liest'");
    expect(SQL).toContain("USING ((SELECT public.darf_hausverwaltung_lesen(auth.uid())))");
    const block = SQL.slice(SQL.indexOf("-- 2) Hausverwaltung lesen"), SQL.indexOf("-- 3) Scan-Sitzungen"));
    expect(block).not.toContain("'dienstleister'");
    expect(rumpf("darf_hausverwaltung_lesen")).toContain("public.has_role(_user_id, 'hausverwaltung'::public.app_role)");
  });

  it("die Dashboardkarte Hausverwaltung sieht die Vertriebsleitung nicht mehr", () => {
    const zeile = lies("src/pages/Index.tsx").split("\n").find((z) => z.includes('id: "hausverwaltung-admin"')) || "";
    expect(zeile).toContain('visibleFor: ["inhaber", "admin"]');
  });
});

describe("M6: Name zur Aktivierung nur über das Token", () => {
  it("entzieht lookup_activation_name allen außer der Dienstrolle", () => {
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.lookup_activation_name(text) FROM public, anon, authenticated;");
  });

  it("keine Seite ruft sie mehr auf, die Function liefert den Vornamen", () => {
    expect(lies("src/pages/Aktivieren.tsx")).not.toContain("lookup_activation_name\"");
    expect(lies("src/pages/PortalAktivieren.tsx")).not.toContain("lookup_activation_name\"");
    const fn = lies("supabase/functions/redeem-activation-token/index.ts");
    expect(fn).toContain('admin.from("profiles").select("name").eq("id", row.user_id)');
  });

  it("ein benutzter oder abgelaufener Link verrät weder Adresse noch Name noch Sprache", () => {
    const fn = lies("supabase/functions/redeem-activation-token/index.ts");
    const info = fn.slice(fn.indexOf('if (action === "info")'), fn.indexOf("// ── REDEEM"));
    const sperre = info.indexOf("if (row.used || row.expired) {");
    expect(sperre).toBeGreaterThan(-1);
    expect(sperre).toBeLessThan(info.indexOf("kundenSprache("));
    expect(sperre).toBeLessThan(info.indexOf('admin.from("profiles")'));
    expect(info).toContain("return json({ used: !!row.used, expired: !row.used && !!row.expired });");
  });
});

describe("Eingangskorb", () => {
  it("hat Prüfzeilen 59.1 bis 59.4", () => {
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const n of ["59.1", "59.2", "59.3", "59.4"]) expect(pruefung).toContain(`SELECT '${n} `);
    expect(pruefung.trimEnd().endsWith(";")).toBe(true);
    // Nur die letzte Zeile schließt die Abfrage.
    expect(pruefung.slice(pruefung.indexOf("Teil 59")).match(/;\s*$/gm)?.length).toBe(1);
  });

  it("liegt, solange sie offen ist, im Eingangskorb, in der Sammeldatei und im README", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(lies(KORB_PFAD)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL.trim());
    expect(lies("supabase/migrations-inbox/README.md")).toContain(DATEI);
  });
});
