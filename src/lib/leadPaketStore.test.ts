import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a) } }));

const { BEKANNTE_MELDUNGEN, einsatzfrist, leadPaketAusBewerbung, offenePaketeFuer, paketZaehlung, verstaendlicheMeldung } = await import("./leadPaketStore");
type Z = import("./leadPaketStore").LeadPaketZuweisung;
type P = import("./leadPaketStore").LeadPaket;

const paket = (id: string, anzahl: number, extra: Partial<P> = {}): P => ({
  id,
  partner_id: "partner-1",
  anzahl,
  paketpreis: 2500,
  bezahlt_am: null,
  freigeschaltet_am: null,
  status: "offen",
  bemerkung: null,
  erstellt_am: "2026-10-01T10:00:00Z",
  ...extra,
});
let n = 0;
const lieferung = (paketId: string, extra: Partial<Z> = {}): Z => ({
  id: `z${++n}`,
  paket_id: paketId,
  kontakt_id: `k${n}`,
  zugewiesen_am: "2026-10-02T10:00:00Z",
  zugewiesen_von: "leitung",
  reklamiert_am: null,
  reklamationsgrund: null,
  ersatz_fuer: null,
  ...extra,
});

describe("paketZaehlung", () => {
  it("zählt geliefert, reklamiert, ersetzt und offen nach Anlage 3", () => {
    const a = lieferung("p1");
    const b = lieferung("p1", { reklamiert_am: "2026-10-03T10:00:00Z", reklamationsgrund: "Dublette" });
    const c = lieferung("p1", { reklamiert_am: "2026-10-04T10:00:00Z", reklamationsgrund: "Falsche Nummer" });
    const ersatz = lieferung("p1", { ersatz_fuer: b.id });
    const fremd = lieferung("p2");
    expect(paketZaehlung(paket("p1", 20), [a, b, c, ersatz, fremd])).toEqual({
      zugewiesen: 4,
      geliefert: 2, // a und der Ersatzlead; reklamierte zählen nicht
      reklamiert: 2,
      ersetzt: 1, // b ist ersetzt, c wartet noch
      offen: 18,
    });
  });

  it("offen fällt nie unter null", () => {
    const alle = [lieferung("p3"), lieferung("p3"), lieferung("p3")];
    expect(paketZaehlung(paket("p3", 2), alle).offen).toBe(0);
  });
});

describe("offenePaketeFuer", () => {
  it("liefert offene Pakete des Partners, ältestes zuerst, ohne volle und beendete", () => {
    const alt = paket("alt", 1, { erstellt_am: "2026-09-01T00:00:00Z" });
    const neu = paket("neu", 5, { erstellt_am: "2026-10-01T00:00:00Z" });
    const voll = paket("voll", 1, { erstellt_am: "2026-08-01T00:00:00Z" });
    const beendet = paket("beendet", 5, { erstellt_am: "2026-07-01T00:00:00Z", status: "beendet" });
    const anderer = paket("anderer", 5, { partner_id: "partner-2", erstellt_am: "2026-06-01T00:00:00Z" });
    const zuweisungen = [lieferung("voll")];
    const ids = offenePaketeFuer("partner-1", { pakete: [neu, voll, beendet, alt, anderer], zuweisungen }).map((p) => p.id);
    expect(ids).toEqual(["alt", "neu"]);
  });

  it("ein reklamierter Lead macht ein volles Paket wieder offen", () => {
    const p = paket("p", 1);
    const zuweisungen = [lieferung("p", { reklamiert_am: "2026-10-05T00:00:00Z" })];
    expect(offenePaketeFuer("partner-1", { pakete: [p], zuweisungen })).toHaveLength(1);
  });
});

describe("einsatzfrist", () => {
  it("beginnt erst, wenn Zahlung und Freischaltung da sind", () => {
    expect(einsatzfrist({ bezahlt_am: "2026-10-15", freigeschaltet_am: null })).toBeNull();
    expect(einsatzfrist({ bezahlt_am: null, freigeschaltet_am: "2026-10-15" })).toBeNull();
  });

  it("läuft einen Monat ab Zahlung, frühestens ab Freischaltung", () => {
    expect(einsatzfrist({ bezahlt_am: "2026-10-15", freigeschaltet_am: "2026-10-01" })).toEqual({ beginn: "2026-10-15", ende: "2026-11-15" });
    expect(einsatzfrist({ bezahlt_am: "2026-10-15", freigeschaltet_am: "2026-10-20" })).toEqual({ beginn: "2026-10-20", ende: "2026-11-20" });
  });

  it("endet am Monatsletzten, wenn der Tag im Folgemonat fehlt", () => {
    expect(einsatzfrist({ bezahlt_am: "2027-01-31", freigeschaltet_am: "2027-01-31" })?.ende).toBe("2027-02-28");
    expect(einsatzfrist({ bezahlt_am: "2026-12-15", freigeschaltet_am: "2026-12-01" })?.ende).toBe("2027-01-15");
  });
});

/*
 * Die Migration läuft hier nicht, ihr Quelltext hält die Rechte fest:
 * niemand schreibt direkt, jede Funktion prüft die Rolle selbst.
 */
describe("Migration 20260930130000_lead_pakete", () => {
  const sql = readFileSync("supabase/migrations/20260930130000_lead_pakete.sql", "utf8");
  const inboxPfad = "supabase/migrations-inbox/20260930130000_lead_pakete.sql";
  const funktion = (name: string) => {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    return sql.slice(start, sql.indexOf("$$;", start));
  };

  it("die Kopie im Eingangskorb ist, solange sie offen ist, identisch", () => {
    // Am 30.09.2026 ausgefuehrt, die Kopie ist aus dem Korb entfernt.
    if (!existsSync(inboxPfad)) return;
    expect(readFileSync(inboxPfad, "utf8")).toBe(sql);
  });

  it("Tabellen nur lesbar, kein direktes Schreiben", () => {
    for (const t of ["lead_pakete", "lead_paket_zuweisungen"]) {
      expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`REVOKE ALL ON public.${t} FROM anon, public;`);
      expect(sql).toContain(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.${t} FROM authenticated;`);
    }
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL) TO/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)/);
  });

  it("Partner lesen nur eigene Pakete, die Leitung alles", () => {
    expect(sql).toContain("partner_id = (select auth.uid())");
    expect(sql).toContain("p.partner_id = (select auth.uid())");
    for (const r of ["admin", "inhaber", "vertriebsleiter"]) {
      expect(sql.match(new RegExp(`has_role\\(auth.uid\\(\\), '${r}'\\)\\)`, "g"))?.length).toBe(2);
    }
  });

  it("Anlegen und Ändern nur Admin und Inhaber", () => {
    for (const f of ["lead_paket_anlegen", "lead_paket_aendern"]) {
      const body = funktion(f);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = public");
      expect(body).toContain("NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber'))");
      expect(body).not.toMatch(/has_role\(v_uid, 'vertriebsleiter'\)/);
    }
  });

  it("Lieferung vermerken und Reklamation: Admin, Inhaber, Vertriebsleitung", () => {
    for (const f of ["lead_paket_zuweisung_vermerken", "lead_paket_reklamation"]) {
      const body = funktion(f);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = public");
      expect(body).toMatch(/has_role\(v_uid, 'admin'\) OR public\.has_role\(v_uid, 'inhaber'\)\s+OR public\.has_role\(v_uid, 'vertriebsleiter'\)/);
    }
  });

  it("Vermerk nur für Leads des Paketpartners, nie über die Anzahl hinaus", () => {
    const body = funktion("lead_paket_zuweisung_vermerken");
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("v_kontakt.zustaendig_id IS DISTINCT FROM v_paket.partner_id");
    expect(body).toContain("v_geliefert >= v_paket.anzahl");
    expect(body).toContain("status = 'beendet'");
  });

  it("Aufrufrechte: nur angemeldete Nutzer, die interne Hilfsfunktion niemand", () => {
    for (const sig of [
      "lead_paket_anlegen(uuid, integer, numeric, date, date, text)",
      "lead_paket_aendern(uuid, date, date, boolean, text)",
      "lead_paket_zuweisung_vermerken(uuid, uuid)",
      "lead_paket_reklamation(uuid, text)",
      "lead_paket_aus_bewerbung(uuid)",
    ]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM anon, public;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
    for (const intern of ["lead_paket_status_nachziehen(uuid)", "lead_paket_datum(text)", "lead_paket_aus_bewerbung_intern(uuid)"]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${intern} FROM anon, authenticated, public;`);
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION public.${intern}`);
    }
  });

  it("ein Lead zählt paketübergreifend nur einmal gültig (Teilindex)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS lead_paket_zuweisungen_einmal_gueltig\s+ON public\.lead_paket_zuweisungen \(kontakt_id\) WHERE reklamiert_am IS NULL;/,
    );
    expect(funktion("lead_paket_zuweisung_vermerken")).toContain("EXCEPTION WHEN unique_violation THEN");
  });

  it("reklamierter Lead zählt nicht erneut auf dasselbe Paket, mit eigener Meldung", () => {
    const body = funktion("lead_paket_zuweisung_vermerken");
    expect(body).toContain("WHERE kontakt_id = _kontakt_id AND paket_id = _paket_id");
    expect(body).toContain("Dieser Lead wurde aus diesem Paket schon reklamiert");
  });

  it("nur Leads der Gesellschaft, keine Eigenkontakte (Regel wie getKontaktTyp)", () => {
    const body = funktion("lead_paket_zuweisung_vermerken");
    expect(body).toContain("v_kontakt.meta->>'erstelltVonId' = v_paket.partner_id::text");
    expect(body).toContain("v_kontakt.meta->>'setter'");
    expect(body).toContain("zapier|analysetool|webhook|api|webform|extern|lead|meta|facebook|instagram|tiktok|google|landing");
  });

  it("Pakete nur für Konten mit Partnerrolle", () => {
    expect(funktion("lead_paket_anlegen")).toContain("role IN ('vertriebspartner', 'vertriebsleiter')");
    expect(funktion("lead_paket_aus_bewerbung_intern")).toContain("role IN ('vertriebspartner', 'vertriebsleiter')");
  });

  it("Paket aus der Bewerbung: nur gebucht, bezahlt, mit Konto und passender E-Mail, nie doppelt", () => {
    const intern = funktion("lead_paket_aus_bewerbung_intern");
    for (const status of ["kein_paket", "nicht_bezahlt", "kein_konto", "email_abweichend", "angelegt", "ergaenzt", "vorhanden"]) {
      expect(intern, status).toContain(`'${status}'`);
    }
    // E-Mail des Kontos gegen die Bewerbung, ohne Groß- und Leerzeichen-Unterschiede.
    expect(intern).toContain("FROM auth.users u");
    expect(intern).toContain("lower(btrim(COALESCE(u.email, ''))) = lower(btrim(v_email))");
    // Die E-Mail-Prüfung steht vor jedem Schreiben.
    expect(intern.indexOf("'email_abweichend'")).toBeLessThan(intern.indexOf("UPDATE public.lead_pakete"));
    expect(intern.indexOf("'email_abweichend'")).toBeLessThan(intern.indexOf("INSERT INTO public.lead_pakete"));
    expect(intern).toContain("ON CONFLICT (bewerbung_id) DO NOTHING");
    // Vorhandene Daten werden nur ergänzt, nie überschrieben, mit Änderungsvermerk.
    expect(intern).toContain("bezahlt_am = COALESCE(lp.bezahlt_am, v_bezahlt)");
    expect(intern).toContain("freigeschaltet_am = COALESCE(lp.freigeschaltet_am,");
    expect(intern).toContain("geaendert_am = now()");
    expect(intern).toContain("geaendert_von = auth.uid()");
    // Einziger Parameter ist die Bewerbung, Rechte nur Admin und Inhaber.
    expect(sql).toContain("FUNCTION public.lead_paket_aus_bewerbung_intern(_bewerbung_id uuid)");
    expect(sql).toContain("FUNCTION public.lead_paket_aus_bewerbung(_bewerbung_id uuid)");
    // Auslösen darf der Bewerberbereich (HR, Admin, Inhaber, Backoffice), Werte kommen nur aus der Bewerbung.
    const rpc = funktion("lead_paket_aus_bewerbung");
    expect(rpc).toContain("IF v_uid IS NULL OR NOT public.darf_bewerberbereich(v_uid) THEN");
    expect(rpc).toContain("v_ergebnis := public.lead_paket_aus_bewerbung_intern(_bewerbung_id);");
  });

  it("neu angelegt durch HR oder Backoffice: Glocke an Admin und Inhaber, nicht an den Auslöser", () => {
    const rpc = funktion("lead_paket_aus_bewerbung");
    expect(rpc).toContain("IF v_ergebnis->>'status' = 'angelegt'");
    expect(rpc).toContain("AND NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber')) THEN");
    expect(rpc).toContain("WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role)");
    expect(rpc).toContain("AND ur.user_id <> v_uid");
    expect(rpc).toContain("INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)");
    expect(rpc).toContain("'/statistiken?tab=leadzuweisung'");
    // Namen über die Kennung, keine Namenssuche.
    expect(rpc).toContain("LEFT JOIN public.profiles pr ON pr.id = lp.partner_id");
    expect(rpc).toContain("FROM public.profiles WHERE id = v_uid");
    expect(rpc).not.toMatch(/WHERE\s+(pr\.)?name\s*=/);
    // Sichtbarer Text ohne Gedankenstriche.
    expect(rpc).not.toMatch(/[–—]/);
    expect(rpc).toContain("RETURN v_ergebnis;");
  });

  it("Freischaltung liegt nie vor dem Zahlungseingang", () => {
    const intern = funktion("lead_paket_aus_bewerbung_intern");
    expect(intern).toContain("GREATEST(v_konto, v_bezahlt)");
    expect(intern).toContain("GREATEST(v_konto, COALESCE(lp.bezahlt_am, v_bezahlt))");
  });

  it("Zeitpunkte werden auf den Tag in Berlin umgerechnet, reine Daten bleiben", () => {
    const datum = funktion("lead_paket_datum");
    expect(datum).toContain("IF _text ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN\n    RETURN _text::date;");
    expect(datum).toContain("RETURN (_text::timestamptz AT TIME ZONE 'Europe/Berlin')::date;");
    expect(datum).not.toContain("left(_text, 10)");
    // Alle drei Tage laufen durch diese Umrechnung.
    const intern = funktion("lead_paket_aus_bewerbung_intern");
    for (const feld of ["rechnungZahlungsdatum", "rechnungBezahltAm", "userInviteSentAt"]) {
      expect(intern, feld).toContain(`public.lead_paket_datum(v_meta->>'${feld}')`);
    }
  });

  it("kein Bestandsnachtrag beim Ausführen", () => {
    expect(sql).not.toMatch(/SELECT public\.lead_paket_aus_bewerbung_intern\(/);
    expect(sql).not.toMatch(/INSERT INTO public\.lead_pakete[\s\S]*FROM public\.bewerbungen b/);
  });

  it("kaputte Werte in der Bewerbung brechen nichts ab", () => {
    const datum = funktion("lead_paket_datum");
    expect(datum).toContain("EXCEPTION WHEN others THEN\n  RETURN NULL;");
    const intern = funktion("lead_paket_aus_bewerbung_intern");
    for (const zeile of intern.split("\n").filter((z) => /::(uuid|numeric)/.test(z))) {
      expect(zeile.trim().startsWith("THEN"), zeile).toBe(true);
    }
  });

  it("wer selbst Partner des Pakets ist, vermerkt und reklamiert nicht, außer Admin oder Inhaber", () => {
    for (const f of ["lead_paket_zuweisung_vermerken", "lead_paket_reklamation"]) {
      expect(funktion(f)).toContain("'Im eigenen Leadpaket vermerken und reklamieren nur Admin und Inhaber.'");
    }
    expect(funktion("lead_paket_zuweisung_vermerken")).toContain(
      "v_paket.partner_id = v_uid AND NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber'))",
    );
  });

  it("gelöschte Kontakte zählen nicht", () => {
    expect(funktion("lead_paket_zuweisung_vermerken")).toContain("IF COALESCE(v_kontakt.geloescht, false) THEN");
  });

  it("jede Meldung, die der Browser durchreicht, steht so in der Migration", () => {
    for (const m of BEKANNTE_MELDUNGEN) expect(sql, m).toContain(`'${m}'`);
  });
});

describe("verstaendlicheMeldung", () => {
  it("reicht eigene Meldungen durch, auch mit Vorspann", () => {
    expect(verstaendlicheMeldung("P0001: Dieses Leadpaket ist beendet.")).toBe("Dieses Leadpaket ist beendet.");
  });

  it("übersetzt rohe Datenbankmeldungen", () => {
    expect(verstaendlicheMeldung('duplicate key value violates unique constraint "x"')).toBe("Dieser Lead zählt schon für ein Leadpaket.");
    expect(verstaendlicheMeldung("permission denied for function x")).toBe("Dir fehlt das Recht für diese Änderung.");
    expect(verstaendlicheMeldung("Could not find the function public.lead_paket_anlegen")).toMatch(/noch nicht eingerichtet/);
    expect(verstaendlicheMeldung("syntax error at or near")).toBe("Das ließ sich gerade nicht speichern. Bitte versuch es noch einmal.");
  });
});

describe("leadPaketAusBewerbung", () => {
  it("bleibt still für Rollen ohne Recht und ohne Migration, meldet echte Fehler", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Leadpakete aus der Bewerbung legen nur HR, Admin, Inhaber und Backoffice an." } });
    expect(await leadPaketAusBewerbung("b1")).toEqual({ ok: true });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Could not find the function public.lead_paket_aus_bewerbung" } });
    expect(await leadPaketAusBewerbung("b1")).toEqual({ ok: true });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    expect((await leadPaketAusBewerbung("b1")).ok).toBe(false);
    expect(rpcMock).toHaveBeenLastCalledWith("lead_paket_aus_bewerbung", { _bewerbung_id: "b1" });
  });
});

describe("leadPaketAusBewerbung liefert den Status", () => {
  it("reicht Status und Anzahl der Datenbank durch", async () => {
    rpcMock.mockResolvedValueOnce({ data: { status: "angelegt", paket_id: "x", anzahl: 20 }, error: null });
    expect(await leadPaketAusBewerbung("b2")).toEqual({ ok: true, status: "angelegt", anzahl: 20 });
    rpcMock.mockResolvedValueOnce({ data: { status: "email_abweichend" }, error: null });
    expect(await leadPaketAusBewerbung("b2")).toEqual({ ok: true, status: "email_abweichend", anzahl: undefined });
  });
});
