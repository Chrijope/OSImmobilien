/**
 * Glocke gegen gefälschte Meldungen (Migration 20260928160000, Freigabe vom
 * 28.09.2026).
 *
 * Eine Datenbank läuft in den Tests nicht mit. Geprüft wird deshalb, wie bei
 * den übrigen Migrationen im Projekt, der Text der Migration. Die Link-Regel
 * wird darüber hinaus wirklich ausgeführt: Die beiden Muster stehen in der
 * Migration und laufen hier gegen gute und böse Links.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lies = (pfad: string) => readFileSync(join(process.cwd(), pfad), "utf8");
const MIGRATION = "supabase/migrations/20260928160000_glocke_absichern.sql";
const sql = lies(MIGRATION);
const code = sql.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

function abschnitt(anfang: string, ende: string): string {
  const start = code.indexOf(anfang);
  expect(start, anfang).toBeGreaterThanOrEqual(0);
  return code.slice(start, code.indexOf(ende, start));
}

const linkFunktion = abschnitt("CREATE OR REPLACE FUNCTION public.glocke_link_ist_intern", "$$;");
const pruefung = abschnitt("CREATE OR REPLACE FUNCTION public.darf_glocke_senden", "COMMENT ON FUNCTION public.darf_glocke_senden");

/** Die beiden Muster aus der Migration, als JavaScript-Ausdruck. */
function linkRegelAusMigration(): (link: string | null) => boolean {
  const pfad = linkFunktion.match(/_link ~ '([^']+)'/)?.[1];
  const verboten = linkFunktion.match(/_link !~ '([^']+)'/)?.[1];
  expect(pfad).toBe("^/([^/\\\\]|$)");
  expect(verboten).toBe("[[:cntrl:]]");
  const pfadMuster = new RegExp(pfad!);
  // POSIX-Klasse, die JavaScript nicht kennt: dieselben Zeichen ausgeschrieben.
  // eslint-disable-next-line no-control-regex -- genau diese Zeichen sind gemeint
  const steuerzeichen = /[\x00-\x1f\x7f]/;
  return (link) => link === null || link === "" || (pfadMuster.test(link) && !steuerzeichen.test(link));
}

/** Die Rollenliste hinter einer Bedingung, etwa der Empfänger in Regel c). */
function rollenListe(ausschnitt: string, marke: string): string[] {
  const start = ausschnitt.indexOf(marke);
  expect(start, marke).toBeGreaterThanOrEqual(0);
  const liste = ausschnitt.slice(start).match(/IN \(([^)]*)\)/)?.[1] || "";
  return [...liste.matchAll(/'([a-z_]+)'/g)].map((t) => t[1]);
}

const EMPFAENGER_ROLLEN = rollenListe(pruefung, "WHERE ur.user_id = _empfaenger");
const HAUS_ROLLEN = rollenListe(pruefung, "WHERE ur.user_id = v_uid");

describe("Link der Glocke (für alle Schreibwege)", () => {
  const erlaubt = linkRegelAusMigration();

  it("nimmt Pfade im CRM und leere Links an", () => {
    for (const link of [
      null, "", "/", "/inbox", "/kunden/1b2c", "/#crm-updates",
      "/kunde/investments?tab=moreimmo&inv=1&highlight=bonitaetsunterlagen",
      "/signatur?token=abc&type=vertrag_kurz", "/bewerberprozess?bewerber=1",
      "/chat?id=1", "/kunden/1#empfehlungsprogramm",
    ]) {
      expect(erlaubt(link), String(link)).toBe(true);
    }
  });

  it("lehnt fremde Adressen und Umdeutungen des Browsers ab (Phishing)", () => {
    for (const link of [
      "https://fremd.example/login", "http://fremd.example", "//fremd.example/login",
      "/\\fremd.example", "/\t/fremd.example", "/\n/fremd.example",
      "javascript:alert(1)", "data:text/html,<b>x</b>", "kunden/1", " /kunden/1",
      "https://osimmobilien.netlify.app/kunden/1",
    ]) {
      expect(erlaubt(link), JSON.stringify(link)).toBe(false);
    }
  });

  it("gilt als Auslöser auf Glocke und Warteschlange, beim Anlegen und wenn der Link sich ändert", () => {
    expect(code).toContain("BEFORE INSERT OR UPDATE OF link ON public.benachrichtigungen");
    expect(code).toContain("BEFORE INSERT OR UPDATE OF link ON public.scheduled_notifications");
    expect(code).toContain("DROP TRIGGER IF EXISTS trg_glocke_link_pruefen ON public.benachrichtigungen;");
    expect(code).toContain("DROP TRIGGER IF EXISTS trg_glocke_link_pruefen ON public.scheduled_notifications;");
    const ausloeser = abschnitt("CREATE OR REPLACE FUNCTION public.glocke_link_pruefen()", "$$;");
    // Alte Zeilen: "gelesen" setzen bleibt möglich, geprüft wird nur ein neuer oder geänderter Link.
    expect(ausloeser).toContain("TG_OP = 'INSERT' OR NEW.link IS DISTINCT FROM OLD.link");
    expect(ausloeser).toContain("USING ERRCODE = 'check_violation'");
    // Kein SECURITY DEFINER nötig, und kein Ausweg für den Dienstschlüssel.
    expect(ausloeser).not.toContain("SECURITY DEFINER");
    expect(ausloeser).not.toContain("auth.uid()");
  });

  it("löscht und ändert keine bestehenden Zeilen", () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bUPDATE\s+public\.benachrichtigungen\b/i);
    expect(code).not.toMatch(/\bADD CONSTRAINT\b/i);
  });
});

describe("Wer wem eine Glocke schicken darf", () => {
  it("die alte Regel mit is_internal_role für beliebige Empfänger fällt weg", () => {
    expect(code).toContain('DROP POLICY IF EXISTS "Nutzer erstellen eigene Benachrichtigungen" ON public.benachrichtigungen;');
    expect(code).toContain('DROP POLICY IF EXISTS "Auth erstellt Benachrichtigungen" ON public.benachrichtigungen;');
    expect(code).toContain('DROP POLICY IF EXISTS "System erstellt Benachrichtigungen" ON public.benachrichtigungen;');
    const regel = abschnitt('CREATE POLICY "Glocke nur an erlaubte Empfaenger"', ");\n");
    expect(regel).toContain("FOR INSERT");
    expect(regel).toContain("TO authenticated");
    expect(regel).toContain("public.darf_glocke_senden(benutzer_id)");
    expect(regel).toContain("absender_id IS NOT DISTINCT FROM (select auth.uid())");
    expect(regel).not.toContain("is_internal_role");
  });

  it("ein Partner erreicht weder Kunden fremder Partner noch Konten ohne passende Rolle", () => {
    // Regel c) nennt keine externen Rollen und keine Rollen ohne fachlichen Bezug.
    for (const rolle of ["kunde", "tippgeber", "setterin", "objektpartner", "hausverwaltung", "individuell", "testaccount"]) {
      expect(EMPFAENGER_ROLLEN, rolle).not.toContain(rolle);
    }
    // An alle dürfen nur Leitung und Backoffice, kein Partner.
    expect(HAUS_ROLLEN.sort()).toEqual(["admin", "backoffice", "inhaber", "vertriebsleiter"]);
    // Kundenkonten nur über einen Kontakt, den der Absender betreut oder sehen darf.
    expect(pruefung).toMatch(/AND \(v_breit OR public\.is_vp_owner_of_kontakt\(v_uid, k\.zustaendig_id, k\.meta\)\)/);
    expect(pruefung).toContain("v_breit := COALESCE(public.darf_alle_kunden_sehen(v_uid), false);");
    // Ohne Anmeldung nichts, am Ende nein.
    expect(pruefung).toMatch(/IF v_uid IS NULL THEN\s+RETURN false;/);
    expect(pruefung.trimEnd()).toMatch(/RETURN false;\s+END;\s+\$\$;$/);
  });

  it("ein Kunde meldet nur seinem Zuständigen, und in der Warteschlange nur dem Finanzierungspartner", () => {
    expect(pruefung).toContain("AND (k.zustaendig_id = _empfaenger OR k.berater = _empfaenger::text)");
    expect(pruefung).toContain("RETURN _ziel_rolle = 'finanzierungspartner'");
    // Warteschlange: nur zum eigenen Kontakt, nicht zu irgendeinem.
    expect(pruefung).toMatch(/AND _kontakt_id IS NOT NULL\s+AND EXISTS \(\s+SELECT 1 FROM public\.kontakte k\s+WHERE k\.id = _kontakt_id\s+AND \(k\.meta ->> 'authUserId' = v_uid::text/);
  });

  it("die Prüffunktion ist SECURITY DEFINER, für Angemeldete, nicht für Fremde", () => {
    expect(pruefung).toContain("SECURITY DEFINER");
    expect(pruefung).toContain("SET search_path = public");
    expect(code).toContain("REVOKE ALL ON FUNCTION public.darf_glocke_senden(uuid, text, uuid) FROM public, anon;");
    expect(code).toContain("GRANT EXECUTE ON FUNCTION public.darf_glocke_senden(uuid, text, uuid) TO authenticated;");
  });

  it("die Warteschlange prüft Empfänger und Rolle nach derselben Regel", () => {
    const regel = abschnitt('CREATE POLICY "auth_insert_scheduled_notifications"', ");\n");
    expect(regel).toContain("WHEN target_role IS NULL THEN public.darf_glocke_senden(target_user_id)");
    expect(regel).toContain("ELSE public.darf_glocke_senden(NULL, target_role, kontakt_id)");
    expect(regel).not.toContain("auth.uid() IS NOT NULL");
  });

  it("die Absenderspalte kommt ohne Neuschreiben der Tabelle", () => {
    expect(code).toContain("ADD COLUMN IF NOT EXISTS absender_id uuid;");
    expect(code).toContain("ALTER COLUMN absender_id SET DEFAULT auth.uid();");
  });
});

/* ------------------------------------------------------------------------ */
/* Die legitimen Wege aus der Bestandsaufnahme                              */
/* ------------------------------------------------------------------------ */

function dateienUnter(ordner: string): string[] {
  const aus: string[] = [];
  for (const name of readdirSync(join(process.cwd(), ordner))) {
    const pfad = `${ordner}/${name}`;
    if (statSync(join(process.cwd(), pfad)).isDirectory()) aus.push(...dateienUnter(pfad));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) aus.push(pfad);
  }
  return aus;
}

describe("Legitime Wege aus dem Browser bleiben offen", () => {
  const quellen = dateienUnter("src").map((pfad) => ({ pfad, text: lies(pfad) }));

  it("jede Rolle, an die der Browser per notifyByRole meldet, steht in Regel c)", () => {
    const rollen = new Set<string>();
    for (const { text } of quellen) {
      for (const aufruf of text.matchAll(/notifyByRole\(\s*(\[[^\]]*\]|"[^"]+")/g)) {
        for (const r of aufruf[1].matchAll(/"([a-z_]+)"/g)) rollen.add(r[1]);
      }
    }
    // notifyAllInternal geht über eine Variable und nur aus den News (Admin, Inhaber: Regel b).
    expect(rollen.size).toBeGreaterThan(5);
    for (const rolle of rollen) expect(EMPFAENGER_ROLLEN, rolle).toContain(rolle);
  });

  it("jede Rolle, die der Browser in die Warteschlange legt, ist erlaubt", () => {
    const rollen = new Set<string>();
    for (const { text } of quellen) {
      for (const t of text.matchAll(/(?:target_role|targetRole):\s*"([a-z_]+)"\s*[,}]/g)) rollen.add(t[1]);
    }
    expect(rollen.size).toBeGreaterThan(0);
    const rollenzweig = rollenListe(pruefung, "IF v_intern THEN\n      RETURN _ziel_rolle IN");
    for (const rolle of rollen) expect(rollenzweig).toContain(rolle);
    // Nie die ganze Rolle Vertriebspartner (Glocken ohne Zuständigen gehen an die Zentrale).
    expect(rollenzweig).not.toContain("vertriebspartner");
    expect([...rollenzweig, "vertriebspartner"].sort()).toEqual([...EMPFAENGER_ROLLEN].sort());
  });

  it("Chat, Kundenbezug und die Glocke an sich selbst stehen in der Regel", () => {
    expect(pruefung).toMatch(/IF _empfaenger = v_uid THEN\s+RETURN true;/);
    expect(pruefung).toContain("JOIN public.chat_teilnehmer ct2 ON ct1.chat_id = ct2.chat_id");
    expect(pruefung).toContain("k.meta -> 'person2' ->> 'authUserId' = _empfaenger::text");
  });
});

describe("Server schreibt nur Pfade in die Glocke", () => {
  it("finalize-vertrag verlinkt die Gegenzeichnung als Pfad, die Mail behält die volle Adresse", () => {
    const f = lies("supabase/functions/finalize-vertrag/index.ts");
    expect(f).toContain("link: `/signatur?token=${kurzToken}&type=vertrag_kurz`,");
    expect(f).not.toMatch(/link:\s*signatureUrl/);
  });

  it("die Kennenlern-Erinnerung gibt der Glocke den Pfad, der Mail die Adresse", () => {
    const f = lies("supabase/functions/send-bewerber-kennenlernen-erinnerungen/index.ts");
    expect(f).toContain("const pfad = `/bewerberprozess?bewerber=${angaben.bewerbungId}`;");
    expect(f).toMatch(/schreibeGlocke\([^)]*\{[\s\S]*?link: pfad,/);
    expect(f).toContain("bewerberUrl: link,");
  });
});

describe("Eingangskorb", () => {
  it("Kopie, Sammeldatei, README und Prüfzeilen", () => {
    const korb = "supabase/migrations-inbox/20260928160000_glocke_absichern.sql";
    if (existsSync(join(process.cwd(), korb))) {
      expect(lies(korb)).toBe(sql);
      const alle = lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql");
      expect(alle).toContain(sql);
      const liesMich = lies("supabase/migrations-inbox/README.md");
      expect(liesMich).toContain("`20260928160000_glocke_absichern.sql`");
    }
    const pruef = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const n of ["33.1 ", "33.2 ", "33.3 ", "33.4 ", "33.5 ", "33.6 ", "33.7 ", "33.8 ", "33.9 ", "32.3 "]) expect(pruef).toContain(n);
  });

  it("33.3 und 33.4 zaehlen nur erlaubende Einfuegeregeln", () => {
    // Die einschraenkenden Regeln (Zwei-Faktor, Kundenportal-Sperre) liegen
    // auf beiden Tabellen und liessen die Zeilen sonst "fehlt" melden.
    const pruef = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const [nr, tabelle] of [["33.3", "benachrichtigungen"], ["33.4", "scheduled_notifications"]]) {
      const zeile = pruef.slice(pruef.indexOf(`'${nr} `), pruef.indexOf("UNION ALL", pruef.indexOf(`'${nr} `)));
      expect(zeile).toMatch(new RegExp(`tablename = '${tabelle}' AND cmd IN \\('INSERT', 'ALL'\\)\\s+AND permissive = 'PERMISSIVE'\\) = 1`));
    }
  });
});

