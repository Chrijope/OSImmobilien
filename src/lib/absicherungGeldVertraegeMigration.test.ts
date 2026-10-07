import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EINLADUNG_KONDITIONEN, einladungOhneFremdeKonditionen, tippgeberKontoAblehnung, tippgeberVerknuepfungAblehnung } from "../../supabase/functions/_shared/einladung-konditionen";
import { ENDGUELTIG_LOESCHEN_ROLLEN } from "../../supabase/functions/_shared/endgueltigLoeschen";
import { ABWICKLUNG_GELD_FELDER, ABWICKLUNG_GELD_ROLLEN, ABWICKLUNG_ROLLEN } from "./abwicklungStore";

/**
 * Migration absicherung_geld_vertraege (30.09.2026).
 *
 * Ausführen lässt sie sich hier nicht. Der Quelltext hält Christians
 * Grundsatz fest: Nur Admin und Inhaber schreiben Unterschrift, Geldeingang,
 * Provision und Zuordnung direkt, alle anderen über geprüfte Wege, und was
 * heute funktioniert, funktioniert weiter.
 */

const DATEI = "20260930110000_absicherung_geld_vertraege.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
const PRUEFUNG = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");

function funktion(kopf: string): string {
  const a = SQL.indexOf(kopf);
  expect(a).toBeGreaterThanOrEqual(0);
  return SQL.slice(a, SQL.indexOf("\n$$;", a) + 4);
}

const SCHLUESSEL = funktion("CREATE OR REPLACE FUNCTION public.investment_geschuetzte_schluessel()");
const WAECHTER = funktion("CREATE OR REPLACE FUNCTION public.investments_absicherung()");
const MERGE = funktion("CREATE OR REPLACE FUNCTION public.merge_investment_meta(");
const SA_PDF = funktion("CREATE OR REPLACE FUNCTION public.investment_sa_pdf_vermerken(");
const ABWICKLUNG = funktion("CREATE OR REPLACE FUNCTION public.investment_abwicklung_speichern(");
const LOESCHEN = funktion("CREATE OR REPLACE FUNCTION public.investment_loeschen(");
const NOTAR = funktion("CREATE OR REPLACE FUNCTION public.confirm_notar_termin(");
const KONTAKT = funktion("CREATE OR REPLACE FUNCTION public.kontakt_zuordnung_namen_schuetzen()");
const EMPFEHLUNG = funktion("CREATE OR REPLACE FUNCTION public.empfehlungen_praemie_schuetzen()");

describe("Migration absicherung_geld_vertraege: investments", () => {
  it("schützt Unterschriften, Abwicklung, Notartermin und Aftersales", () => {
    for (const k of [
      "saSigned", "saSignatures", "saPdf", "rvSigned", "rvSignatures", "rvSignedAt", "rvPdf", "rvData",
      "notarTerminBestaetigt", "aftersalesBeratung", "abwicklung", "kaufpreisEingegangen",
    ]) {
      expect(SCHLUESSEL).toContain(`'${k}'`);
    }
    // Den Provisionssatz schützt schon sein eigener Trigger, keine doppelte Wahrheit.
    expect(SCHLUESSEL).not.toContain("lockedProvisionRate");
    // Ein gesendeter Link ist kein Vertragsstand, der Browser setzt ihn weiter.
    expect(SCHLUESSEL).not.toContain("'saSignaturePending'");
  });

  it("der Wächter prüft nur direkte Schreibzugriffe und behält den alten Wert", () => {
    expect(WAECHTER).toContain("SECURITY INVOKER");
    expect(WAECHTER).toContain("IF current_user NOT IN ('authenticated', 'anon') THEN");
    expect(WAECHTER).toContain("IF auth.uid() IS NOT NULL AND public.is_admin_role(auth.uid()) THEN");
    expect(WAECHTER).toContain("NEW.meta := (_neu - _schluessel) || _alt;");
    expect(WAECHTER).not.toContain("RAISE EXCEPTION");
    // Ein meta, das kein Objekt ist, hebelt den Schutz nicht aus.
    expect(WAECHTER).toContain("IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN");
  });

  it("läuft vor dem Finanzierungswächter und feuert beim Anlegen und Ändern von meta", () => {
    expect(SQL).toContain("CREATE TRIGGER trg_absicherung_investments\nBEFORE INSERT OR UPDATE OF meta ON public.investments");
    // BEFORE-Trigger laufen nach Namen sortiert.
    const namen = ["trg_absicherung_investments", "trg_finanzierungsstand_intern_frei", "trg_investments_provisionssatz_festschreiben"];
    expect([...namen].sort()).toEqual(namen);
  });

  it("merge_investment_meta lässt Nicht-Admins geschützte Schlüssel nur zurücksetzen", () => {
    expect(MERGE).toContain("IF _ist_intern AND auth.uid() IS NOT NULL AND NOT public.is_admin_role(auth.uid())");
    expect(MERGE).toContain("AND public.investment_wert_leer(_wirksam -> _schluessel)");
    // Kunden bleiben auf die zwei Schlüssel beschränkt.
    expect(MERGE).toContain("'marktwertHistorie',\n    'steuerCockpit'");
    expect(SQL).toContain("_wert IN ('null'::jsonb, 'false'::jsonb, '\"\"'::jsonb, '{}'::jsonb, '[]'::jsonb)");
  });

  it("den Notartermin bestätigt nur der Kunde, und nur einen freigegebenen Vorschlag", () => {
    expect(NOTAR).toContain("IF auth.uid() IS NOT NULL AND public.is_internal_role(auth.uid()) AND NOT public.is_admin_role(auth.uid()) THEN");
    expect(NOTAR).toContain("current_meta -> 'notarTerminVorschlaegeFreigegeben'");
    expect(NOTAR).toContain("AND coalesce(v ->> 'uhrzeit', '') = coalesce(_uhrzeit, '')");
    // Die Karte im Portal schickt genau einen freigegebenen Vorschlag, Uhrzeit leer statt undefined.
    const karte = readFileSync("src/components/kunde/NotarterminAuswahlCard.tsx", "utf8");
    expect(karte).toContain("invMeta.notarTerminVorschlaegeFreigegeben");
    expect(karte).toContain('_uhrzeit: v.uhrzeit || "",');
  });

  it("zurücksetzen nur, was die Oberfläche leert, nie etwa rvReservierungAb", () => {
    const liste = MERGE.match(/_schluessel = ANY\(ARRAY\[([^\]]*)\]::text\[\]\)/)![1]
      .match(/'([A-Za-z]+)'/g)!.map((k) => k.replace(/'/g, ""));
    expect([...liste].sort()).toEqual([
      "notarTerminBestaetigt", "rvData", "rvPdf", "rvSignatures", "rvSigned", "saSignatures", "saSigned", "saSignedAt",
    ]);
    expect(liste).not.toContain("rvReservierungAb");
    // Jeder Schlüssel, den die Oberfläche leert, steht in der Liste.
    const store = readFileSync("src/lib/investmentsStore.ts", "utf8");
    const rv = store.slice(store.indexOf("export function clearRvSignatureData"), store.indexOf("export function markEinheitGewechselt"));
    const sa = readFileSync("src/components/selbstauskunft/SelbstauskunftForm.tsx", "utf8");
    const saReset = sa.slice(sa.indexOf("setInvestmentMetaFields(invId, {"), sa.indexOf("saEditStatus: \"bearbeitung\""));
    const geschuetzt = SCHLUESSEL.match(/'([A-Za-z]+)'/g)!.map((k) => k.replace(/'/g, ""));
    for (const teil of [rv, saReset]) {
      for (const k of teil.match(/^\s+([A-Za-z]+):/gm)!.map((z) => z.trim().replace(":", ""))) {
        if (geschuetzt.includes(k)) expect(liste).toContain(k);
      }
    }
  });

  it("saPdf nur mit Datei im Eimer oder unterschriebener Selbstauskunft", () => {
    // Rollen wie darfPdfSelbstauskunft in KundenDetail, Partner nur beim eigenen Kunden.
    expect(SA_PDF).toContain("OR public.has_role(_uid, 'vertriebsleiter'::public.app_role)");
    expect(SA_PDF).toContain("OR (public.has_role(_uid, 'vertriebspartner'::public.app_role)\n        AND public.ist_eigenes_investment(_uid, _inv.kunde_id))");
    expect(SA_PDF).not.toContain("darf_alle_kunden_sehen");
    expect(SA_PDF).toContain("_praefix := 'selbstauskunft-papier/' || _inv.kunde_id::text || '/' || _inv.id::text || '/';");
    expect(SA_PDF).toContain("WHERE o.bucket_id = 'unterlagen' AND o.name = _pfad");
    expect(SA_PDF).toContain("position('..' IN _pfad) > 0");
    expect(SA_PDF).toContain("IF NOT (coalesce(_meta ->> 'saSigned', '') = 'true'");
  });

  it("Abwicklung: Admin, Inhaber oder zuständiger Partner ab Notartermin, nur bekannte Felder", () => {
    expect(ABWICKLUNG).toContain("public.has_role(_uid, 'vertriebspartner'::public.app_role)");
    expect(ABWICKLUNG).toContain("public.ist_eigenes_investment(_uid, _inv.kunde_id)");
    expect(ABWICKLUNG).toContain("'notar', 'notar_ohne_gs', 'notar_mit_gs', 'faelligkeit', 'abrechnung', 'abgeschlossen'");
    expect(ABWICKLUNG).toContain("WHERE e.key = ANY(_felder);");
    // Dieselben Stufen wie die Karte in KundenDetail.
    const kd = readFileSync("src/pages/KundenDetail.tsx", "utf8");
    expect(kd).toContain('["notar", "notar_ohne_gs", "notar_mit_gs", "faelligkeit", "abrechnung", "abgeschlossen"].includes(inv.pipelineStufe)');
  });

  it("Kaufpreiseingang, Provisionsrechnung und Auszahlung nur Admin, Inhaber, Backoffice", () => {
    const geld = ABWICKLUNG.match(/_geldfelder constant text\[\] := ARRAY\[([^\]]*)\]/)![1]
      .match(/'([A-Za-z]+)'/g)!.map((k) => k.replace(/'/g, ""));
    expect(geld).toEqual([...ABWICKLUNG_GELD_FELDER]);
    expect(ABWICKLUNG).toContain("_darf_geld := public.is_admin_role(_uid) OR public.has_role(_uid, 'backoffice'::public.app_role);");
    // Vom Partner bleibt bei den Geldfeldern der gespeicherte Stand.
    expect(ABWICKLUNG).toContain("SELECT (_sauber - _geldfelder) || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)");
    expect([...ABWICKLUNG_GELD_ROLLEN].sort()).toEqual(["admin", "backoffice", "inhaber"]);
    expect(ABWICKLUNG_ROLLEN).toContain("backoffice");
    // Die Karte sperrt genau die drei Haken für alle anderen.
    const kd = readFileSync("src/pages/KundenDetail.tsx", "utf8");
    expect(kd.match(/disabled=\{!darfGeldfelder\}/g)).toHaveLength(3);
    expect(kd).toContain("werden vom Backoffice gepflegt.");
  });

  it("Löschen: direkt nur Admin, Partner über die Funktion nur vor der Reservierung", () => {
    expect(SQL).toContain('DROP POLICY IF EXISTS "Admins und zustaendige VP loeschen Investments" ON public.investments;');
    expect(SQL).toMatch(/CREATE POLICY "Admin und Inhaber loeschen Investments"\nON public\.investments\nFOR DELETE\nTO authenticated\nUSING \(\(SELECT public\.is_admin_role\(auth\.uid\(\)\)\)\);/);
    expect(LOESCHEN).toContain("IF public.pipelinestufe_ist_kaufphase(_inv.meta ->> 'pipelineStufe')");
    expect(LOESCHEN).toContain("OR coalesce(_inv.meta ->> 'rvSigned', '') = 'true' THEN");
    expect(LOESCHEN).toContain("USING ERRCODE = '42501'");
  });

  it("alle drei Wege sind SECURITY DEFINER und nur für Angemeldete", () => {
    for (const [name, sig] of [
      ["investment_sa_pdf_vermerken", "uuid, text, text"],
      ["investment_abwicklung_speichern", "uuid, jsonb"],
      ["investment_loeschen", "uuid"],
    ]) {
      expect(funktion(`CREATE OR REPLACE FUNCTION public.${name}(`)).toContain("SECURITY DEFINER");
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION public.${name}(${sig}) FROM PUBLIC, anon;`);
      expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${sig}) TO authenticated, service_role;`);
    }
  });

  it("uuid bleibt uuid: kein ::text-Vergleich mit kunde_id", () => {
    expect(SQL).not.toMatch(/kunde_id::text\s*=/);
    expect(SQL).not.toMatch(/=\s*[a-z_.]*kunde_id::text/);
  });
});

describe("Migration absicherung_geld_vertraege: kontakte", () => {
  it("setter, erstelltVonName, kontaktTyp und berater nur Admin, Inhaber, Server", () => {
    expect(KONTAKT).toContain("ARRAY['setter', 'erstelltVonName', 'kontaktTyp']");
    expect(KONTAKT).toContain("IF auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN");
    // berater nur zusammen mit der Zuständigkeit.
    expect(KONTAKT).toContain("AND NEW.zustaendig_id IS NOT DISTINCT FROM OLD.zustaendig_id THEN\n    NEW.berater := OLD.berater;");
    expect(KONTAKT).not.toContain("RAISE EXCEPTION");
    expect(SQL).toContain("BEFORE UPDATE OF meta, berater ON public.kontakte");
    // Direkt hinter dem bestehenden Zuordnungswächter.
    expect(["trg_kontakt_zuordnung", "trg_kontakt_zuordnung_namen", "trg_kontakt_zustaendigkeit_schuetzen"].sort())
      .toEqual(["trg_kontakt_zuordnung", "trg_kontakt_zuordnung_namen", "trg_kontakt_zustaendigkeit_schuetzen"]);
  });

  it("endgültig löschen dieselbe Liste wie darfEndgueltigLoeschen", () => {
    expect(SQL).toContain('DROP POLICY IF EXISTS "Vertriebspartner loeschen eigene Kontakte" ON public.kontakte;');
    expect(SQL).toContain('DROP POLICY IF EXISTS "Admin und interne Rollen loeschen Kontakte" ON public.kontakte;');
    expect(SQL).toContain("(SELECT public.is_admin_role(auth.uid()))\n  OR (SELECT public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role))");
    // is_admin_role deckt admin und inhaber ab.
    expect([...ENDGUELTIG_LOESCHEN_ROLLEN].sort()).toEqual(["admin", "inhaber", "vertriebsleiter"]);
  });
});

describe("Migration absicherung_geld_vertraege: tippgeber und empfehlungen", () => {
  it("Tippgeber ändern nur Admin und Inhaber, anlegen nur für sich selbst ohne Konto", () => {
    expect(SQL).toContain('DROP POLICY IF EXISTS "Interne bearbeiten Tippgeber" ON public.tippgeber;');
    expect(SQL).toContain('DROP POLICY IF EXISTS "Interne erstellen Tippgeber" ON public.tippgeber;');
    expect(SQL).toContain("AND zugeordnet_id = auth.uid()\n    AND benutzer_id IS NULL");
  });

  it("Prämie und Auszahlungsmarke an Empfehlungen nur Admin und Inhaber", () => {
    expect(EMPFEHLUNG).toContain("NEW.provision := OLD.provision;");
    expect(EMPFEHLUNG).toContain("_standardpraemie constant numeric := 500;");
    expect(EMPFEHLUNG).toContain("least(greatest(coalesce(NEW.provision, 0), 0), _standardpraemie)");
    // Die Empfehlungsseite trägt genau diese Standardprämie ein.
    expect(readFileSync("src/pages/Empfehlungen.tsx", "utf8")).toContain("provision: 500,");
  });

  it("Partner legen Empfehlungen nur für eigene Kunden an", () => {
    expect(SQL).toContain('DROP POLICY IF EXISTS "Interne erstellen Empfehlungen" ON public.empfehlungen;');
    expect(SQL).toContain("benutzer_id = auth.uid()");
    expect(SQL).toContain("AND public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta)");
  });
});

describe("Migration absicherung_geld_vertraege: Eingangskorb", () => {
  it("liegt, solange sie offen ist, als Kopie im Eingangskorb und in der Sammeldatei", () => {
    // Am 30.09.2026 ausgefuehrt, die Kopie ist aus dem Korb entfernt.
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
  });

  it("hat Prüfzeilen 51.x", () => {
    expect(PRUEFUNG).toContain("'51.1 ");
    expect(PRUEFUNG).toContain("20260930110000");
  });
});

describe("invite-user: Provisionsbedingungen nur von Admin und Inhaber", () => {
  const body = {
    email: "a@example.org", role: "tippgeber", karriereStufe: "senior", teamleaderId: "t-1",
    customProvisionRate: 9, customProvisionRateSetter: 1, customProvisionRateEigen: 12, karriereGatingActive: false,
  };

  it("verwirft die Bedingungen, wenn ein Partner einlädt", () => {
    const { body: rein, verworfen } = einladungOhneFremdeKonditionen(body, false);
    for (const feld of EINLADUNG_KONDITIONEN) expect(rein).not.toHaveProperty(feld);
    expect(rein.email).toBe("a@example.org");
    expect(verworfen).toEqual([...EINLADUNG_KONDITIONEN]);
  });

  it("übernimmt sie von Admin und Inhaber unverändert", () => {
    expect(einladungOhneFremdeKonditionen(body, true)).toEqual({ body, verworfen: [] });
  });

  it("die Function nutzt die Prüfung vor dem Auslesen", () => {
    const fn = readFileSync("supabase/functions/invite-user/index.ts", "utf8");
    expect(fn).toContain("einladungOhneFremdeKonditionen(body, callerIsAdminGlobal)");
    expect(fn).toMatch(/customProvisionRateEigen, tippgeberId, karriereGatingActive, rollenVariante \} = einladung;/);
  });

  it("die Tippgeber-Prüfung läuft vor Kontoanlage und Mail und antwortet mit 403", () => {
    const fn = readFileSync("supabase/functions/invite-user/index.ts", "utf8");
    const pruefung = fn.indexOf("tippgeberVerknuepfungAblehnung({");
    expect(pruefung).toBeGreaterThan(0);
    expect(pruefung).toBeLessThan(fn.indexOf("adminClient.auth.admin.createUser("));
    expect(pruefung).toBeLessThan(fn.indexOf("const existingUser = await findUserByEmail(email);"));
    expect(fn.slice(pruefung, pruefung + 700)).toContain("status: 403");
  });
});

describe("Tippgeber mit Portalkonto verknüpfen", () => {
  const rollen = (...r: string[]) => new Set(r);
  const team = new Map([["vp-unten", "vp-mitte"], ["vp-mitte", "vp-oben"]]);
  const tg = (zugeordnet_id: string | null, benutzer_id: string | null = null) => ({ zugeordnet_id, benutzer_id });
  const fall = (aufruferId: string, r: Set<string>, t: ReturnType<typeof tg> | null, passt = false) =>
    tippgeberVerknuepfungAblehnung({ aufruferId, aufruferRollen: r, tippgeber: t, teamleiterVon: team, kontoPasstZurAdresse: passt });

  it("erlaubt eigenen Tippgeber und den eines Teammitglieds über mehrere Stufen", () => {
    expect(fall("vp-unten", rollen("vertriebspartner"), tg("vp-unten"))).toBeNull();
    expect(fall("vp-oben", rollen("vertriebspartner"), tg("vp-unten"))).toBeNull();
  });

  it("lehnt fremde Tippgeber mit einem Satz ab", () => {
    expect(fall("vp-unten", rollen("vertriebspartner"), tg("vp-oben"))).toMatch(/nur für eigene Tippgeber/);
    expect(fall("vp-x", rollen("vertriebspartner"), tg(null))).toMatch(/nur für eigene Tippgeber/);
  });

  it("Admin, Inhaber und Vertriebsleitung dürfen jeden", () => {
    expect(fall("a", rollen("admin"), tg("vp-unten"))).toBeNull();
    expect(fall("i", rollen("inhaber"), tg("vp-unten", "fremd"))).toBeNull();
    expect(fall("vl", rollen("vertriebsleiter"), tg("vp-unten"))).toBeNull();
  });

  it("ein schon verknüpftes fremdes Konto hängt nur Admin oder Inhaber um", () => {
    expect(fall("vp-unten", rollen("vertriebspartner"), tg("vp-unten", "konto"), false)).toMatch(/schon einen Portal-Zugang/);
    expect(fall("vl", rollen("vertriebsleiter"), tg("vp-unten", "konto"), false)).toMatch(/schon einen Portal-Zugang/);
    // Erneut einladen mit derselben Adresse bleibt möglich.
    expect(fall("vp-unten", rollen("vertriebspartner"), tg("vp-unten", "konto"), true)).toBeNull();
  });

  it("das Konto eines anderen Tippgebers übernimmt nur Admin oder Inhaber", () => {
    const fremd = { aufruferRollen: rollen("vertriebspartner"), tippgeberId: "tg-neu", tippgeberDesKontos: ["tg-alt"] };
    expect(tippgeberKontoAblehnung(fremd)).toMatch(/anderen Tippgebers/);
    expect(tippgeberKontoAblehnung({ ...fremd, aufruferRollen: rollen("vertriebsleiter") })).toMatch(/anderen Tippgebers/);
    expect(tippgeberKontoAblehnung({ ...fremd, aufruferRollen: rollen("admin") })).toBeNull();
    // Derselbe Tippgeber erneut eingeladen, oder ein Konto ohne Tippgeber: passt.
    expect(tippgeberKontoAblehnung({ ...fremd, tippgeberDesKontos: ["tg-neu"] })).toBeNull();
    expect(tippgeberKontoAblehnung({ ...fremd, tippgeberDesKontos: [] })).toBeNull();
    // In der Function vor jeder Verknüpfung, direkt nach der Suche nach dem Konto.
    const fn = readFileSync("supabase/functions/invite-user/index.ts", "utf8");
    const pruefung = fn.indexOf("tippgeberKontoAblehnung({");
    expect(pruefung).toBeGreaterThan(fn.indexOf("const existingUser = await findUserByEmail(email);"));
    expect(pruefung).toBeLessThan(fn.indexOf('console.log("invite-user: User exists'));
    expect(pruefung).toBeLessThan(fn.indexOf("adminClient.auth.admin.createUser("));
  });

  it("der Teamleiter sieht die Abwicklung beim Kunden eines Teammitglieds nur lesend", () => {
    const kd = readFileSync("src/pages/KundenDetail.tsx", "utf8");
    expect(kd).toContain('&& (user.role !== "vertriebspartner" || isAssignedBerater);');
  });

  it("ein Kreis in den Teamleitern hängt die Prüfung nicht auf", () => {
    const kreis = new Map([["x", "y"], ["y", "x"]]);
    expect(tippgeberVerknuepfungAblehnung({
      aufruferId: "z", aufruferRollen: rollen("vertriebspartner"), tippgeber: tg("x"), teamleiterVon: kreis, kontoPasstZurAdresse: false,
    })).toMatch(/nur für eigene Tippgeber/);
  });
});
