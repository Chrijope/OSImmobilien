import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Absicherung Objekte, Speicher, Chats, Hausverwaltung (30.09.2026).
 *
 * Christians Grundsatz: Nur Admin und Inhaber schreiben direkt, alle anderen
 * nur ueber gepruefte Ablaeufe, und was heute geht, geht weiter. Ausfuehren
 * laesst sich die Migration hier nicht; der Quelltext haelt die Regeln fest.
 * Dazu die umgestellten Wege im Browser: Reservierung aufheben,
 * Belegungsabgleich und Chat-Teilnehmer, jeweils mit Rueckfall, solange die
 * Migration fehlt.
 */

const DATEI = "20260930120000_absicherung_objekte_speicher_chats.sql";
const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");
const SQL = lies(`supabase/migrations/${DATEI}`);
const ohneKommentare = (s: string) => s.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");
const CODE = ohneKommentare(SQL);
/** Der wirksame Teil nach den beiden Waechtern, die alte und neue Regelnamen nur aufzaehlen. */
const WIRKSAM = CODE.slice(CODE.indexOf("CREATE OR REPLACE FUNCTION public.darf_objekt_schreiben"));

function funktion(name: string): string {
  const a = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(a, name).toBeGreaterThanOrEqual(0);
  return CODE.slice(a, CODE.indexOf("\n$$;", a) + 4);
}

describe("Migration absicherung_objekte_speicher_chats", () => {
  it("hat Pruefzeilen 52.x", () => {
    expect(lies("supabase/migrations-inbox/99_PRUEFUNG.sql")).toContain("52.1 ");
  });

  it("liegt, solange sie offen ist, deckungsgleich im Eingangskorb und in der Sammeldatei", () => {
    // Am 30.09.2026 ausgefuehrt, die Kopie ist aus dem Korb entfernt.
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (!existsSync(resolve(__dirname, "../..", korb))) return;
    expect(lies(korb)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL.trim());
  });

  it("laeuft in einer Transaktion", () => {
    expect(CODE.trim().startsWith("BEGIN;")).toBe(true);
    expect(CODE.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("bricht bei einer erlaubenden ALL-Regel ab, statt sie samt Leserecht zu loeschen", () => {
    const vorab = CODE.slice(CODE.indexOf("BEGIN;"), CODE.indexOf("CREATE OR REPLACE FUNCTION public.darf_objekt_schreiben"));
    expect(vorab).toContain("AND cmd = 'ALL'");
    expect(vorab).toContain("RAISE EXCEPTION 'Erlaubende ALL-Regel");
    // Die Loesch-Schleifen nehmen ALL nie mit.
    expect(WIRKSAM).not.toMatch(/cmd IN \([^)]*'ALL'/);
  });

  it("Objektbereich: alle erlaubenden Schreibregeln fallen, auch von Hand angelegte", () => {
    const riegel = CODE.slice(CODE.indexOf("tablename IN ('objekte', 'wohnungen', 'objekt_bilder', 'wohnungs_bilder',\n                         'wohnungs_dokumente', 'objekt_dokumente', 'objekt_einreichungen')\n       AND permissive"));
    for (const tabelle of ["objekte", "wohnungen", "objekt_bilder", "wohnungs_bilder", "wohnungs_dokumente", "objekt_dokumente", "objekt_einreichungen"]) {
      expect(riegel.slice(0, 300)).toContain(`'${tabelle}'`);
    }
    expect(riegel).toContain("permissive = 'PERMISSIVE'");
    expect(riegel).toContain("cmd IN ('INSERT', 'UPDATE', 'DELETE')");
  });

  it("die Waechter-Ausloeser greifen nur beim Schreiben aus dem Browser, nie in DEFINER-Funktionen", () => {
    for (const name of ["objekt_ersteller_festhalten", "chat_nachricht_nur_lesebestaetigung"]) {
      const f = funktion(name);
      expect(f, name).toContain("SECURITY INVOKER");
      expect(f, name).not.toContain("SECURITY DEFINER");
      expect(f, name).toContain("current_user NOT IN ('authenticated', 'anon')");
    }
  });

  it("bricht bei unerwarteten erlaubenden Speicherregeln der vier Eimer ab, auch bei ALL", () => {
    const a = CODE.indexOf("Unerwartete erlaubende Speicherregel");
    expect(a).toBeGreaterThan(0);
    const waechter = CODE.slice(CODE.lastIndexOf("DO $$", a), a);
    expect(waechter).toContain("cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')");
    expect(waechter).toContain("'''(unterlagen|praesentation-pdfs|objekt-medien|ansprechpartner)'''");
    // Er steht vor dem ersten Eingriff in den Speicher.
    expect(a).toBeLessThan(CODE.indexOf("ON storage.objects"));
    // Der Vorab-SELECT ist im Kopf dokumentiert.
    expect(SQL).toContain("where schemaname = 'storage' and tablename = 'objects'");
  });

  it("nennt die auszurollenden Functions im Kopf", () => {
    const kopf = SQL.slice(0, SQL.indexOf("BEGIN;"));
    expect(kopf).toContain("In Lovable ausrollen: objekt-texte-ki");
    expect(kopf).toContain("save-expose-pdf");
    expect(kopf).not.toContain("Keine Function auszurollen");
  });

  it("meldet der Schnittstelle die neuen Funktionen", () => {
    expect(CODE).toContain("NOTIFY pgrst, 'reload schema';");
  });

  it("Objektbereich: schreiben nur Admin, Inhaber und Objektpartner am eigenen Objekt", () => {
    const f = funktion("darf_objekt_schreiben");
    expect(f).toContain("public.is_admin_role(_user_id)");
    expect(f).toContain("public.has_role(_user_id, 'objektpartner'::public.app_role)");
    expect(f).toContain("o.erstellt_von = _user_id");
    // Keine der neuen Regeln faellt auf die alte, weite Grenze zurueck.
    const regeln = CODE.split("CREATE POLICY").slice(1).map((r) => r.slice(0, r.indexOf(";")));
    for (const r of regeln.filter((x) => /ON public\.(objekte|wohnungen|objekt_bilder|wohnungs_bilder|wohnungs_dokumente|objekt_dokumente|objekt_einreichungen)\b/.test(x))) {
      expect(r).not.toContain("is_internal_role");
      expect(r).not.toContain("is_objekt_manager");
    }
  });

  it("Objektbereich: Loeschen bleibt bei Wohnungsbildern, Wohnungsunterlagen und Einreichungen Admin", () => {
    for (const [name, tabelle] of [
      ["Admins loeschen WBilder", "wohnungs_bilder"],
      ["Admins loeschen WDokumente", "wohnungs_dokumente"],
      ["Admins loeschen Einreichungen", "objekt_einreichungen"],
    ]) {
      const a = CODE.indexOf(`CREATE POLICY "${name}" ON public.${tabelle}`);
      expect(a, name).toBeGreaterThanOrEqual(0);
      expect(CODE.slice(a, CODE.indexOf(";", a))).toContain("USING (public.is_admin_role(auth.uid()))");
    }
  });

  it("Objekt gehoert dem Anlegenden, danach aendert den Eigentuemer nur der Server", () => {
    const f = funktion("objekt_ersteller_festhalten");
    expect(f).toContain("IF current_user NOT IN ('authenticated', 'anon') OR auth.uid() IS NULL THEN\n    RETURN NEW;");
    expect(f).toContain("NEW.erstellt_von := auth.uid();");
    expect(f).toContain("NEW.erstellt_von := OLD.erstellt_von;");
    expect(CODE).toContain("BEFORE INSERT OR UPDATE ON public.objekte");
  });

  it("Belegungsabgleich: nur wer das Investment nutzen darf, verkauft nur mit Reservierungsrecht, Ausloeser nicht der Aufrufer", () => {
    const f = funktion("einheit_belegung_abgleichen");
    expect(f).toContain("public.darf_investment_nutzen(v_uid, v_inv.kunde_id, v_kontakt.meta)");
    // Alle Pruefungen stehen vor dem ersten Schreiben, auch vor „verkauft“.
    const vorDemSchreiben = f.slice(0, f.indexOf("SET status = 'verkauft'"));
    expect(vorDemSchreiben).toContain("IF NOT (public.darf_reservieren(v_uid)\n          OR (v_stufe = 'abgeschlossen' AND public.has_role(v_uid, 'backoffice'::public.app_role))) THEN");
    expect(vorDemSchreiben).toContain("IF v_einheit.global_objekt THEN");
    expect(vorDemSchreiben).toContain("'grund', 'vorgemerkt_von_anderem'");
    expect(vorDemSchreiben).toContain("'grund', 'exklusiv'");
    expect(f).toContain("reserviert_von = coalesce(v_kontakt.zustaendig_id, v_inv.benutzer_id)");
    expect(f).not.toContain("reserviert_von = v_uid");
  });

  it("Belegungsabgleich: Unterschriftsprüfung für reserviert und für eine noch freie Einheit bei verkauft, Leitung ausgenommen", () => {
    const f = funktion("einheit_belegung_abgleichen");
    expect(f).toContain("FROM public.signature_requests s");
    expect(f).toContain("s.investment_id = p_investment_id::text");
    expect(f).toContain("s.person_type LIKE 'rv\\_%'");
    expect(f).toContain("s.status = 'signed'");
    // Verkauf einer noch freien Einheit: nur mit Unterschrift, ausser Admin und Inhaber.
    const verkauf = f.slice(f.indexOf("IF v_stufe = 'abgeschlossen' THEN\n"), f.indexOf("SET status = 'verkauft'"));
    expect(verkauf).toContain("IF v_status = 'frei' AND NOT v_admin AND NOT v_rv_unterschrieben THEN");
    // Reservieren: immer mit Unterschrift, ausser Admin und Inhaber (Papier).
    const reservieren = f.slice(f.indexOf("SET status = 'verkauft'"), f.indexOf("SET status = 'reserviert'"));
    expect(reservieren).toContain("IF NOT v_admin AND NOT v_rv_unterschrieben THEN");
    expect(f).toContain("v_admin := public.is_admin_role(v_uid);");
  });

  it("Belegungsabgleich: Exklusivzuweisung wie vormerke_einheit, Leitung ausgenommen", () => {
    const f = funktion("einheit_belegung_abgleichen");
    expect(f).toContain("IF NOT v_admin THEN\n    IF jsonb_typeof(v_einheit.meta -> 'exklusivNutzer') = 'array'");
    expect(f).toContain("v_einheit.meta -> 'exklusivNutzer'");
    expect(f).toContain("unnest(v_einheit.exklusiv_partner)");
  });

  it("Reservierung aufheben: Vertrieb nur beim eigenen Kunden, verkauft nur die Leitung", () => {
    const f = funktion("einheit_reservierung_aufheben");
    expect(f).toContain("SECURITY DEFINER");
    expect(f).toContain("public.darf_objekt_schreiben(v_uid, v_einheit.objekt_id)");
    expect(f).toContain("public.darf_reservieren(v_uid)");
    expect(f).toContain("= 'verkauft' THEN");
    expect(f).toContain("public.darf_kontakt_bearbeiten(v_uid, v_kontakt)");
    // Ein leeres reserviert_von darf nicht als Erlaubnis durchgehen.
    expect(f).toContain("coalesce(v_einheit.reserviert_von = v_uid, false)");
    expect(f).toContain("SET status = 'frei'");
  });

  it("Belegungsabgleich: leitet aus dem Investment ab, ohne fremden Kunden, ohne Globalobjekt-Einheit", () => {
    const f = funktion("einheit_belegung_abgleichen");
    expect(f).toContain("public.is_internal_role(v_uid)");
    expect(f).toContain("v_stufe = 'abgeschlossen'");
    expect(f).toContain("('abgeschlossen', 'reservierung', 'finanzierung', 'notar', 'faelligkeit', 'abrechnung')");
    expect(f).toContain("coalesce((v_meta -> 'rvSigned') = 'true'::jsonb, false)");
    expect(f).toContain("rvReservierungEntfallenAm");
    expect(f).toContain("rvReservierungWirksamAm");
    expect(f).toContain("'grund', 'globalobjekt'");
    expect(f).toContain("'grund', 'vergeben'");
    expect(f).toContain("public.darf_reservieren(v_uid)");
  });

  it("unterlagen: Ueberschreiben und Loeschen an den Kontakt des Pfads gebunden", () => {
    for (const alt of ["Internal update unterlagen", "Unterlagen delete intern", "unterlagen_internal_delete"]) {
      expect(CODE).toContain(`DROP POLICY IF EXISTS "${alt}" ON storage.objects;`);
    }
    const pfad = funktion("unterlagen_pfad_kontakt");
    for (const ordner of ["kundenordner", "selbstauskunft-papier", "kaufvertrag", "notarfotos", "kunde-dokumente", "reservierung"]) {
      expect(pfad).toContain(`'${ordner}'`);
    }
    expect(pfad).toContain("teile[1] = 'finanzierung' AND teile[2] = 'eigen'");
    expect(pfad).toContain("FROM public.investments i WHERE i.id = kandidat::uuid");
    const darf = funktion("darf_unterlage_aendern");
    expect(darf).toContain("public.is_admin_role(_user_id)");
    expect(darf).toContain("public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)");
    expect(darf).not.toContain("is_internal_role");
    // Finanzierungspartner nur unter finanzierung/ (Darlehensvertraege).
    expect(darf).toContain("(storage.foldername(_name))[1] = 'finanzierung'\n             AND public.has_role(_user_id, 'finanzierungspartner'::public.app_role)");
    // Hochladen bleibt: keine neue und keine entfernte INSERT-Regel fuer unterlagen.
    expect(WIRKSAM).not.toMatch(/Internal upload unterlagen|Kunde upload unterlagen/);
  });

  it("praesentation-pdfs wie am 18.09. beschlossen nur Admin und Inhaber, objekt-medien und ansprechpartner geprueft", () => {
    expect(CODE).toContain(`DROP POLICY IF EXISTS "Praesentation-PDFs auth insert" ON storage.objects;`);
    expect(CODE).toContain(`DROP POLICY IF EXISTS "Praesentation-PDFs auth update" ON storage.objects;`);
    const praes = CODE.split("CREATE POLICY").slice(1).filter((r) => r.includes("praesentation-pdfs"));
    expect(praes).toHaveLength(3);
    for (const r of praes) {
      expect(r).toContain("(select public.is_admin_role(auth.uid()))");
      expect(r).not.toContain("is_internal_role");
    }
    // Wortgleich mit der Migration vom 18.09.2026.
    const alt = lies("supabase/migrations/20260918170000_praesentations_pdfs_nur_pflege_schreibt.sql");
    for (const name of ["Praesentation-PDFs pflege insert", "Praesentation-PDFs pflege update", "Praesentation-PDFs pflege delete"]) {
      expect(alt).toContain(`CREATE POLICY "${name}"`);
      expect(CODE).toContain(`CREATE POLICY "${name}"`);
    }
    for (const alt of ["objekt_medien_internal_write", "objekt_medien_internal_update", "objekt_medien_internal_delete"]) {
      expect(CODE).toContain(`DROP POLICY IF EXISTS "${alt}" ON storage.objects;`);
    }
    // Die Einreichungsregeln bleiben stehen.
    expect(WIRKSAM).not.toContain("objekt_medien_anon_einreichung_upload");
    const medien = funktion("darf_objekt_medien_schreiben");
    expect(medien).toContain("teile[1] = 'objektfotos' AND teile[2] = 'investment'");
    expect(medien).toContain("public.darf_investment_nutzen(");
    for (const alt of ["Interne upload Ansprechpartner", "Interne update Ansprechpartner", "Interne delete Ansprechpartner"]) {
      expect(CODE).toContain(`DROP POLICY IF EXISTS "${alt}" ON storage.objects;`);
    }
    expect(CODE).toContain("bucket_id = 'ansprechpartner' AND public.is_admin_role(auth.uid())");
  });

  it("Chats: keine INSERT-Regel mehr, Beitreten nur ueber die Funktion", () => {
    const riegel = CODE.slice(CODE.indexOf("tablename  = 'chat_teilnehmer'"));
    expect(riegel.slice(0, 200)).toContain("cmd IN ('INSERT', 'UPDATE')");
    expect(CODE).not.toMatch(/CREATE POLICY[^;]*ON public\.chat_teilnehmer/);
    const f = funktion("chat_teilnehmer_eintragen");
    expect(f).toContain("public.is_chat_participant(v_uid, p_chat_id)");
    expect(f).toContain("'tippgeber_vp'");
    expect(f).toContain("public.darf_kontakt_bearbeiten(v_uid, v_kontakt)");
    expect(f).toContain("In diesen Chat kannst du dich nicht selbst eintragen");
  });

  it("Chat-Nachrichten: Nicht-Admins aendern nur die eigene Lesebestaetigung", () => {
    const f = funktion("chat_nachricht_nur_lesebestaetigung");
    for (const spalte of ["id", "chat_id", "absender_id", "inhalt", "gesendet_am", "gelesen", "meta"]) {
      expect(f).toContain(`NEW.${spalte} := OLD.${spalte};`);
    }
    expect(f).toContain("WHERE e <> v_ich");
    expect(CODE).toContain("BEFORE UPDATE ON public.chat_nachrichten");
  });

  it("Hausverwaltung: Anlegen und Aendern nur Rolle hausverwaltung, Admin, Inhaber", () => {
    const f = funktion("darf_hausverwaltung_schreiben");
    expect(f).toContain("public.has_role(_user_id, 'hausverwaltung'::public.app_role)");
    const block = CODE.slice(CODE.indexOf("FOREACH tabelle IN ARRAY"));
    for (const t of ["mieter", "eigentuemer", "vermietungen", "kautionen", "versicherungen", "zaehlerstaende", "betriebskosten", "hv_tickets", "dienstleister"]) {
      expect(block.slice(0, 300)).toContain(`'${t}'`);
    }
    expect(block).toContain("public.darf_hausverwaltung_schreiben(auth.uid())");
  });

  it("Rechte: neue Funktionen nicht fuer anon", () => {
    for (const sig of [
      "einheit_reservierung_aufheben(uuid)", "einheit_belegung_abgleichen(uuid)", "chat_teilnehmer_eintragen(uuid, jsonb)",
      "darf_unterlage_aendern(uuid, text)", "darf_objekt_medien_schreiben(uuid, text)",
    ]) {
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM public, anon;`);
      expect(CODE).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
  });

  it("fasst die Bereiche der parallelen Migrationen nicht an", () => {
    expect(CODE).not.toMatch(/ON public\.(investments|kontakte|tippgeber|empfehlungen)\b/);
    expect(CODE).not.toMatch(/(UPDATE|INSERT INTO|DELETE FROM) public\.(investments|kontakte|tippgeber|empfehlungen)\b/);
  });
});

/* ── Die umgestellten Wege im Browser ───────────────────────────────────── */

const zustand = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  rpcAntwort: { data: null as unknown, error: null as unknown },
  rpcAufrufe: [] as Array<{ name: string; args: Record<string, unknown> }>,
  updates: [] as Array<{ tabelle: string; werte: Record<string, unknown> }>,
  updateAbgelehnt: false,
  eingefuegt: [] as Array<{ tabelle: string; zeile: Record<string, unknown> }>,
  neuGeladen: [] as string[],
}));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (t: string) => zustand.rows[t] || [],
  cacheFilter: (t: string, f: (r: Record<string, unknown>) => boolean) => (zustand.rows[t] || []).filter(f),
  cacheReload: async (t: string) => { zustand.neuGeladen.push(t); },
  cacheInsert: async (t: string, zeile: Record<string, unknown>) => { zustand.eingefuegt.push({ tabelle: t, zeile }); return zeile; },
  cacheUpdate: async () => true, cacheDelete: async () => true, cacheSet: () => {}, cacheUpsert: async () => ({}),
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false, localGet: () => [], localSet: () => {} }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_k: string, f: unknown) => f, setUserSetting: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      zustand.rpcAufrufe.push({ name, args });
      return zustand.rpcAntwort;
    },
    from: (tabelle: string) => ({
      update: (werte: Record<string, unknown>) => ({
        eq: () => ({
          select: async () => {
            zustand.updates.push({ tabelle, werte });
            return zustand.updateAbgelehnt ? { data: [], error: null } : { data: [{ id: "w-1" }], error: null };
          },
        }),
      }),
    }),
  },
}));

const { removeReservierung, gleicheEinheitMitInvestmentAb, updateWohnung } = await import("@/lib/objekteStore");
const { chatTeilnehmerEintragen } = await import("@/lib/chatStore");

const FEHLT = { code: "PGRST202", message: "Could not find the function" };

beforeEach(() => {
  zustand.rows = { wohnungen: [{ id: "w-1", objekt_id: "o-1", we_nr: "1", status: "reserviert", kunde_id: "k-1", meta: {} }] };
  zustand.rpcAntwort = { data: null, error: null };
  zustand.rpcAufrufe = [];
  zustand.updates = [];
  zustand.updateAbgelehnt = false;
  zustand.eingefuegt = [];
  zustand.neuGeladen = [];
});

describe("removeReservierung", () => {
  it("hebt ueber einheit_reservierung_aufheben auf und schreibt nicht selbst", async () => {
    zustand.rpcAntwort = { data: { ok: true, grund: "aufgehoben" }, error: null };
    await expect(removeReservierung("o-1", "w-1")).resolves.toEqual({ ok: true });
    expect(zustand.rpcAufrufe).toEqual([{ name: "einheit_reservierung_aufheben", args: { p_wohnung_id: "w-1" } }]);
    expect(zustand.updates).toEqual([]);
    expect(zustand.neuGeladen).toContain("wohnungen");
  });

  it("meldet eine Ablehnung, statt Erfolg vorzutaeuschen", async () => {
    zustand.rpcAntwort = { data: { ok: false, grund: "keine_berechtigung" }, error: null };
    const ergebnis = await removeReservierung("o-1", "w-1");
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehlerText).toMatch(/nicht zu deinem Kunden/);
    expect(zustand.updates).toEqual([]);
  });

  it("nimmt ohne Migration den bisherigen Weg", async () => {
    zustand.rpcAntwort = { data: null, error: FEHLT };
    await expect(removeReservierung("o-1", "w-1")).resolves.toEqual({ ok: true });
    expect(zustand.updates).toHaveLength(1);
    expect(zustand.updates[0].tabelle).toBe("wohnungen");
    expect(zustand.updates[0].werte).toMatchObject({ status: "frei", kunde_id: null, kunde_name: null });
  });

  it("faellt bei einem anderen Fehler nicht auf das direkte Schreiben zurueck", async () => {
    zustand.rpcAntwort = { data: null, error: { code: "42501", message: "permission denied" } };
    const ergebnis = await removeReservierung("o-1", "w-1");
    expect(ergebnis.ok).toBe(false);
    expect(zustand.updates).toEqual([]);
  });
});

describe("updateWohnung", () => {
  it("wertet null geaenderte Zeilen als Ablehnung, statt Erfolg zu melden", async () => {
    zustand.updateAbgelehnt = true;
    const fehler = await updateWohnung("o-1", "w-1", { stadtteil: "Mitte" });
    expect(fehler).toMatchObject({ code: "42501" });
  });

  it("meldet keinen Fehler, wenn die Zeile geschrieben wurde", async () => {
    await expect(updateWohnung("o-1", "w-1", { stadtteil: "Mitte" })).resolves.toBeNull();
  });
});

describe("gleicheEinheitMitInvestmentAb", () => {
  it("fragt die Datenbank mit der Kennung des Investments", async () => {
    zustand.rpcAntwort = { data: { ok: true, grund: "verkauft" }, error: null };
    await expect(gleicheEinheitMitInvestmentAb("inv-1")).resolves.toBe("erledigt");
    expect(zustand.rpcAufrufe).toEqual([{ name: "einheit_belegung_abgleichen", args: { p_investment_id: "inv-1" } }]);
    expect(zustand.neuGeladen).toContain("wohnungen");
  });

  it("meldet ohne Migration den Rueckfall", async () => {
    zustand.rpcAntwort = { data: null, error: FEHLT };
    await expect(gleicheEinheitMitInvestmentAb("inv-1")).resolves.toBe("ohne_migration");
  });

  it("gilt bei Ablehnung als erledigt, damit der Browser nichts erzwingt", async () => {
    zustand.rpcAntwort = { data: { ok: false, grund: "vergeben" }, error: null };
    await expect(gleicheEinheitMitInvestmentAb("inv-1")).resolves.toBe("erledigt");
  });
});

describe("chatTeilnehmerEintragen", () => {
  const person = { id: "u-1", name: "Paula Partner", initials: "PP", role: "Vertriebspartner" };

  it("traegt ueber chat_teilnehmer_eintragen ein, nicht direkt in die Tabelle", async () => {
    await chatTeilnehmerEintragen("c-1", [person]);
    expect(zustand.rpcAufrufe).toEqual([{
      name: "chat_teilnehmer_eintragen",
      args: { p_chat_id: "c-1", p_teilnehmer: [{ benutzer_id: "u-1", meta: { name: "Paula Partner", initials: "PP", role: "Vertriebspartner" } }] },
    }]);
    expect(zustand.eingefuegt).toEqual([]);
    expect(zustand.neuGeladen).toContain("chat_teilnehmer");
  });

  it("wirft, wenn die Datenbank ablehnt", async () => {
    zustand.rpcAntwort = { data: null, error: { code: "42501", message: "In diesen Chat kannst du niemanden eintragen" } };
    await expect(chatTeilnehmerEintragen("c-1", [person])).rejects.toThrow(/niemanden eintragen/);
    expect(zustand.eingefuegt).toEqual([]);
  });

  it("nimmt ohne Migration den bisherigen Weg", async () => {
    zustand.rpcAntwort = { data: null, error: FEHLT };
    await chatTeilnehmerEintragen("c-1", [person]);
    expect(zustand.eingefuegt).toHaveLength(1);
    expect(zustand.eingefuegt[0]).toMatchObject({ tabelle: "chat_teilnehmer", zeile: { chat_id: "c-1", benutzer_id: "u-1" } });
  });
});
