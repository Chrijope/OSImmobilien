/**
 * Portalzugang und Eigentum am Kontakt (Migration 20260928160000, Abschnitte
 * 6 und 7; Gegenprüfung vom 28.09.2026, A1 bis A3).
 *
 * Eine Datenbank läuft in den Tests nicht mit. Geprüft werden der Text der
 * Migration, die Positivliste von submit-lead (echt ausgeführt, auch gegen
 * die Rümpfe aller Seiten) und die Prüfung von invite-user mit einem
 * nachgebauten Datenzugriff.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_META_POSITIVLISTE, nurErlaubteLeadMeta } from "../../supabase/functions/_shared/lead-meta-positivliste.ts";
import { vorhandenesKontoPruefen } from "../../supabase/functions/_shared/portal-verknuepfung.ts";

const lies = (pfad: string) => readFileSync(join(process.cwd(), pfad), "utf8");
const sql = lies("supabase/migrations/20260928160000_glocke_absichern.sql");
const code = sql.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

function abschnitt(anfang: string, ende: string): string {
  const start = code.indexOf(anfang);
  expect(start, anfang).toBeGreaterThanOrEqual(0);
  return code.slice(start, code.indexOf(ende, start));
}

const schutz = abschnitt(
  "CREATE OR REPLACE FUNCTION public.kontakt_zuordnung_schuetzen()",
  "COMMENT ON FUNCTION public.kontakt_zuordnung_schuetzen()",
);
const merge = abschnitt("CREATE OR REPLACE FUNCTION public.merge_kontakt_meta", "$$;\n");

/* ------------------------------------------------------------------------ */
/* A1: submit-lead                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Die Schlüssel der obersten Ebene in `meta: { … }` eines Rumpfs, auch aus
 * `...(x ? { a, b: 1 } : {})`. Verschachtelte Objekte zählen nicht.
 */
function metaSchluessel(text: string): string[] {
  const start = text.indexOf("meta: {");
  expect(start).toBeGreaterThanOrEqual(0);
  const src = text
    .slice(text.indexOf("{", start))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const stapel: boolean[] = [];
  const schluessel = new Set<string>();
  let vorher = "";
  for (let j = 0; j < src.length; j++) {
    const c = src[j];
    if (c === "{") { stapel.push(vorher === "?"); vorher = "{"; continue; }
    if (c === "}") { stapel.pop(); vorher = "}"; if (stapel.length === 0) break; continue; }
    if (/[A-Za-z_$]/.test(c) && (vorher === "{" || vorher === ",")) {
      const wort = /^[A-Za-z_$][\w$]*/.exec(src.slice(j))![0];
      const danach = src.slice(j + wort.length).match(/^\s*(.)/)?.[1];
      const oben = stapel.length === 1 || (stapel.length === 2 && stapel[1]);
      if (oben && (danach === ":" || danach === "," || danach === "}")) schluessel.add(wort);
      j += wort.length - 1;
      vorher = "x";
      continue;
    }
    if (!/\s/.test(c)) vorher = c;
  }
  return [...schluessel].sort();
}

describe("A1: submit-lead übernimmt meta nur über eine Positivliste", () => {
  it("wirft Zugang, Eigentum, Zuständigkeit und Übernahme-Felder hinaus", () => {
    const aus = nurErlaubteLeadMeta({
      authUserId: "u1",
      person2: { authUserId: "u2", vorname: "X" },
      erstelltVonId: "p1",
      erstelltVonName: "P",
      empfehlungsgeberVpId: "p1",
      tippgeberBenutzerId: "t1",
      setterId: "s1",
      zustaendig_id: "p1",
      berater: "P",
      beraterId: "p1",
      claimedBy: "p1",
      claimedAt: "2026-09-28",
      offenerLead: false,
      leadTyp: "eigen",
      kampagne: { utm_source: "meta" },
      steuerSnapshot: { jahresbrutto: 1 },
    });
    expect(Object.keys(aus).sort()).toEqual(["kampagne", "steuerSnapshot"]);
  });

  it("kein Objekt ergibt ein leeres meta", () => {
    expect(nurErlaubteLeadMeta(undefined)).toEqual({});
    expect(nurErlaubteLeadMeta("x")).toEqual({});
    expect(nurErlaubteLeadMeta(["a"])).toEqual({});
  });

  it("die Liste enthält keinen Schlüssel, der Rechte oder Zuordnung trägt", () => {
    for (const verboten of ["authUserId", "person2", "erstelltVonId", "empfehlungsgeberVpId", "tippgeberBenutzerId",
      "setterId", "zustaendig_id", "zustaendigId", "berater", "beraterId", "claimedBy", "offenerLead"]) {
      expect(LEAD_META_POSITIVLISTE as readonly string[], verboten).not.toContain(verboten);
    }
  });

  it("jede Seite behält ihre Felder; nur der Ersteller aus dem Tippgeber-Link fällt bewusst weg", () => {
    const erwartetVerworfen: Record<string, string[]> = {
      "src/components/landing/LeadFunnelDialog.tsx": ["erstelltVonId", "erstelltVonName"],
      "src/lib/analyseLead.ts": [],
      "src/lib/steuerrechnerLead.ts": [],
      "src/lib/expatsRechnerLead.ts": [],
      "src/lib/handbuch/leadAbsenden.ts": [],
    };
    for (const [datei, verworfen] of Object.entries(erwartetVerworfen)) {
      const gesendet = metaSchluessel(lies(datei));
      expect(gesendet.length, datei).toBeGreaterThan(0);
      const fehlt = gesendet.filter((k) => !(LEAD_META_POSITIVLISTE as readonly string[]).includes(k));
      expect(fehlt.sort(), datei).toEqual([...verworfen].sort());
    }
  });

  it("submit-lead wendet die Liste gleich nach den Einwilligungsnachweisen an, den Ersteller setzt der Server", () => {
    const f = lies("supabase/functions/submit-lead/index.ts");
    expect(f).toMatch(/meta = ohneEinwilligungsNachweise\(meta\);[\s\S]{0,400}meta = nurErlaubteLeadMeta\(meta\);/);
    expect(f.indexOf("meta = nurErlaubteLeadMeta(meta);")).toBeLessThan(f.indexOf("const baseMeta"));
    expect(f).toContain("(baseMeta as any).erstelltVonId = zustaendigId;");
  });

  it("der Auslöser entfernt den Zugang beim Anlegen immer, auch beim Dienstschlüssel", () => {
    // Nur Admin und Inhaber (angemeldet) steigen vorher aus, der Dienst nur beim Ändern.
    expect(schutz).toMatch(/IF NOT v_dienst AND COALESCE\(public\.is_admin_role\(v_uid\), false\) THEN\s+RETURN NEW;/);
    expect(schutz).toMatch(/IF v_dienst AND TG_OP = 'UPDATE' THEN\s+RETURN NEW;/);
    expect(schutz).not.toMatch(/IF v_uid IS NULL OR/);
    // Beim Anlegen gibt es für den Zugang keine Ausnahme.
    expect(schutz).toContain("erlaubt := TG_OP = 'UPDATE' AND (");
    expect(schutz).toMatch(/IF NOT COALESCE\(erlaubt, false\) THEN\s+IF alt_wert IS NULL THEN\s+neu_meta := neu_meta #- pfad;/);
  });
});

/* ------------------------------------------------------------------------ */
/* A2: invite-user                                                           */
/* ------------------------------------------------------------------------ */

/** Ein nachgebauter Datenzugriff mit Rollen und Kontakten. */
function datenzugriff(rollen: string[], kontakteMitZugang: string[]) {
  return {
    from(tabelle: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- nachgebaute Abfragekette
      const kette: any = {
        select: () => kette,
        eq: () => kette,
        or: () => kette,
        neq: (_spalte: string, wert: string) => {
          kette._ohne = wert;
          return kette;
        },
        limit: () => Promise.resolve({ data: kontakteMitZugang.filter((id) => id !== kette._ohne).map((id) => ({ id })) }),
        then: (fertig: (x: unknown) => void) => fertig({ data: rollen.map((role) => ({ role })) }),
      };
      if (tabelle !== "user_roles" && tabelle !== "kontakte") throw new Error(tabelle);
      return kette;
    },
  };
}

describe("A2: invite-user verknüpft nur, was der Aufrufer betreut", () => {
  it("ein vorhandenes Konto mit Rolle im CRM wird abgelehnt", async () => {
    expect(await vorhandenesKontoPruefen(datenzugriff(["vertriebspartner"], []), "u1", "k1")).toMatch(/Konto im CRM/);
    expect(await vorhandenesKontoPruefen(datenzugriff(["kunde", "admin"], []), "u1", null)).toMatch(/Konto im CRM/);
  });

  it("ein Portalzugang an einem anderen Kontakt wird abgelehnt, am selben Kontakt geht es", async () => {
    expect(await vorhandenesKontoPruefen(datenzugriff(["kunde"], ["k2"]), "u1", "k1")).toMatch(/anderen Kontakt/);
    expect(await vorhandenesKontoPruefen(datenzugriff(["kunde"], ["k1"]), "u1", "k1")).toBeNull();
    expect(await vorhandenesKontoPruefen(datenzugriff(["kunde"], []), "u1", "k1")).toBeNull();
  });

  it("ein Kunde wird Tippgeber: ohne Kontakt keine Kontaktprüfung", async () => {
    expect(await vorhandenesKontoPruefen(datenzugriff(["kunde"], ["k9"]), "u1", null)).toBeNull();
  });

  it("fremder Kontakt: Prüfung mit der Sitzung des Aufrufers, bevor etwas angelegt oder verknüpft wird", () => {
    const f = lies("supabase/functions/invite-user/index.ts");
    const pruefung = f.indexOf("if (!callerIsAdminGlobal) {\n      if (kontaktId) {");
    expect(pruefung).toBeGreaterThan(0);
    expect(f.slice(pruefung, pruefung + 900)).toMatch(/callerClient\s+\.from\("kontakte"\)\s+\.select\("id"\)\s+\.eq\("id", kontaktId\)/);
    expect(f.slice(pruefung, pruefung + 1500)).toContain("status: 403");
    // Vor jeder Veränderung: Rolle anhängen, Konto anlegen, Kontakt verknüpfen.
    expect(pruefung).toBeLessThan(f.indexOf('await adminClient.from("user_roles").insert({ user_id: existingUser.id, role })'));
    expect(pruefung).toBeLessThan(f.indexOf("adminClient.auth.admin.createUser"));
    expect(pruefung).toBeLessThan(f.indexOf("// Link kontakt to auth user"));
    expect(f).toContain("vorhandenesKontoPruefen(adminClient, existingUser.id, kontaktId || null)");
  });
});

/* ------------------------------------------------------------------------ */
/* A3: merge_kontakt_meta und Eigentumsschlüssel                             */
/* ------------------------------------------------------------------------ */

describe("A3: merge_kontakt_meta und Eigentum am Kontakt", () => {
  it("merge_kontakt_meta prüft für Rollen ohne breiten Zugriff den alten Stand wie die Bearbeiten-Regel", () => {
    expect(merge).toContain("SELECT meta, zustaendig_id INTO _kontakt_meta, _zustaendig FROM public.kontakte WHERE id = _kontakt_id;");
    expect(merge).toMatch(
      /AND NOT COALESCE\(public\.darf_alle_kunden_sehen\(auth\.uid\(\)\), false\)\s+AND NOT COALESCE\(public\.is_vp_owner_of_kontakt\(auth\.uid\(\), _zustaendig, _kontakt_meta\), false\) THEN\s+_ist_intern := false;/,
    );
    // Danach gilt die Kundenregel: nur am eigenen Kontakt, sonst Ablehnung.
    expect(merge).toContain("RAISE EXCEPTION 'Not authorized';");
    expect(merge).toContain("SECURITY DEFINER");
  });

  it("die Eigentumsschlüssel sind geschützt: beim Anlegen nur man selbst oder der Zuständige, beim Ändern der alte Wert", () => {
    expect(schutz).toContain("ARRAY['erstelltVonId', 'empfehlungsgeberVpId',\n                                      'tippgeberBenutzerId', 'setterId']");
    expect(schutz).toMatch(/erlaubt := TG_OP = 'INSERT'\s+AND \(neu_wert = v_uid::text OR neu_wert = NEW\.zustaendig_id::text\);/);
    expect(schutz).toContain("neu_meta := jsonb_set(neu_meta, ARRAY[schluessel], alt_meta -> schluessel, true);");
    expect(schutz).toContain("neu_meta := neu_meta - schluessel;");
    // Der Anzeigename der Setterin bleibt frei (SetterSkript trägt ihn an fremden Leads ein).
    expect(schutz).not.toContain("'setter'");
    expect(schutz).not.toContain("RAISE EXCEPTION");
  });

  it("legitime Wege schreiben das Eigentum auf sich selbst oder den Zuständigen", () => {
    // Partner und Setterin legen an: sie selbst. Der Foto-Upload, der
    // erstelltVonId ausdrücklich setzte, ist seit dem 01.10.2026 aus der
    // Lead-Verwaltung entfernt.
    const lv = lies("src/pages/LeadVerwaltung.tsx");
    expect(lv).toContain("setterId: isSetterin ? (myUserId || undefined) : undefined,");
    expect(lies("src/lib/kundenStore.ts")).toContain("erstelltVonId: creatorId || null,");
    // Empfehlung aus dem CRM: Empfehlungs-Partner ist der Zuständige der neuen Zeile.
    const emp = lies("src/pages/Empfehlungen.tsx");
    expect(emp).toContain("zustaendig_id: vpId,");
    expect(emp).toContain('empfehlungsgeberVpId: vpId || "",');
    // Tippgeber-Funktion: Tippgeber und Ersteller sind der Aufrufer selbst.
    const tipp = lies("supabase/migrations/20260927020000_tippgeber_einverstaendnis.sql");
    expect(tipp).toContain("'tippgeberBenutzerId', auth.uid()::text,");
    expect(tipp).toContain("'erstelltVonId', auth.uid()::text,");
    // Die Ersteller-Auswahl im Kundenprofil gibt es nur für Admin und Inhaber.
    expect(lies("src/pages/KundenDetail.tsx")).toContain("// Ersteller (nur Admins/Inhaber dürfen ändern – UI versteckt das Feld sonst)");
  });

  it("Person 2: ausdrücklich null entfernt, fehlend bleibt sie stehen", () => {
    expect(schutz).toContain("CONTINUE WHEN jsonb_typeof(neu_meta -> 'person2') = 'null';");
    expect(schutz).toContain("neu_meta := jsonb_set(neu_meta, '{person2}', alt_meta -> 'person2', true);");
    expect(lies("src/components/selbstauskunft/SelbstauskunftForm.tsx")).toContain("_updates: { person2: null,");
  });

  it("Zusammenführen: der Zugang wandert nur von einem betreuten Kontakt, die Dublette fällt weg", () => {
    expect(schutz).toMatch(/\(alt_wert IS NULL AND EXISTS \([\s\S]*?k\.id <> NEW\.id[\s\S]*?AND \(v_breit OR public\.is_vp_owner_of_kontakt\(v_uid, k\.zustaendig_id, k\.meta\)\)\)\)/);
    expect(schutz).toMatch(/OR \(neu_wert IS NULL AND EXISTS \([\s\S]*?k\.id <> NEW\.id/);
  });

  it("Auslöser, Indizes und das Aufräumen der älteren Fassung, wiederholbar", () => {
    expect(code).toContain("DROP TRIGGER IF EXISTS trg_kontakt_zuordnung ON public.kontakte;");
    expect(code).toContain("BEFORE INSERT OR UPDATE OF meta ON public.kontakte");
    expect(code).toContain("REVOKE ALL ON FUNCTION public.kontakt_zuordnung_schuetzen() FROM public, anon, authenticated;");
    expect(code).toContain("CREATE INDEX IF NOT EXISTS idx_kontakte_meta_auth_user");
    expect(code).toContain("CREATE INDEX IF NOT EXISTS idx_kontakte_meta_person2_auth_user");
    expect(code).not.toMatch(/CONCURRENTLY/);
    // Erst die Regeln, dann die alte Funktion, dann die neue.
    const regelWeg = code.indexOf('DROP POLICY IF EXISTS "Glocke nur an erlaubte Empfaenger"');
    const altWeg = code.indexOf("DROP FUNCTION IF EXISTS public.darf_glocke_senden(uuid, text);");
    const neu = code.indexOf("CREATE OR REPLACE FUNCTION public.darf_glocke_senden(");
    expect(regelWeg).toBeGreaterThan(0);
    expect(regelWeg).toBeLessThan(altWeg);
    expect(altWeg).toBeLessThan(neu);
    expect(code).toContain("DROP FUNCTION IF EXISTS public.kontakt_portalzugang_schuetzen();");
  });

  it("der Browser schreibt den Zugang nicht in die Datenbank, nur invite-user tut es", async () => {
    const { execSync } = await import("node:child_process");
    const zuweisungen = execSync("grep -rn 'authUserId:' src supabase/functions || true", { encoding: "utf8" })
      .split("\n")
      .filter((z) => z && !z.includes(".test.") && !z.includes("_test.ts"))
      // Lesezugriffe und Parameter anderer Helfer, keine Schreibwege an kontakte.meta.
      .filter((z) => !/kunden-sprache|kundenSprache\(|rate-limit|auth-email-hook|kontaktMetaSchema/.test(z))
      .filter((z) => !/\(authUserId: /.test(z))
      .map((z) => z.split(":")[0])
      .sort();
    expect(zuweisungen).toEqual([
      // Nur der Zwischenspeicher nach der Freischaltung, die Datenbank schreibt invite-user.
      "src/pages/KundenDetail.tsx",
      "supabase/functions/invite-user/index.ts",
      "supabase/functions/invite-user/index.ts",
    ]);
  });
});
