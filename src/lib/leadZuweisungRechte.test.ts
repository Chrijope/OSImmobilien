import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ZUWEISEN_ROLLEN,
  darfAnZentraleZurueckgeben,
  darfKontaktWeitergeben,
  darfLeadUebernehmen,
  darfLeadsZuweisen,
  darfUebergabeSehen,
  teileNachWeitergabeRecht,
  uebergabeBestaetigbar,
} from "./leadZuweisungRechte";

/**
 * Wer darf einen Lead weitergeben?
 *
 * Erster Teil: die Regel der Oberflaeche. Ein Vertriebspartner bekommt genau
 * die Leads zur Weitergabe angeboten, fuer die er selbst zustaendig ist.
 *
 * Zweiter Teil: dieselbe Regel in der Datenbank. SQL laeuft nicht im
 * Vitest-Prozess, geprueft wird deshalb der Wortlaut der Migration. Das
 * reicht fuer den Fehler, um den es geht: Jemand aendert eine Seite und
 * vergisst die andere.
 *
 * Vorbild: `src/lib/kundenzugriffRollen.test.ts`.
 */

const MIGRATIONEN = join(process.cwd(), "supabase", "migrations");
const lies = (datei: string) => readFileSync(join(MIGRATIONEN, datei), "utf8");

const UEBERGABE = "20260918130000_lead_uebergabe_nur_vom_zustaendigen.sql";
const EMPFAENGER = "20260918140000_lead_uebergabe_nur_an_vertriebspartner.sql";
const ZEILENWEISE = "20260915141000_rls_rollenpruefung_je_abfrage.sql";
const RUECKGABE = "20260928150000_lead_rueckgabe_an_zentrale.sql";
const KUNDENZUGRIFF = "20260916190000_kundenzugriff_rollenentscheidung.sql";
const CLAIM_ALT = "20260531170331_28a04901-e355-43e7-b907-942f93630287.sql";
/** Nur die ausfuehrbaren Zeilen, ohne Kommentare. */
const ausfuehrbar = (datei: string) =>
  lies(datei).split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

const ICH = "11111111-1111-1111-1111-111111111111";
const KOLLEGE = "22222222-2222-2222-2222-222222222222";

describe("Wer bekommt die Übergabe angeboten?", () => {
  it("die Leitung darf jeden Lead jedem geben", () => {
    expect([...ZUWEISEN_ROLLEN]).toEqual(["admin", "inhaber", "vertriebsleiter"]);
    for (const rolle of ZUWEISEN_ROLLEN) expect(darfLeadsZuweisen(rolle)).toBe(true);
  });

  it("der Vertriebspartner sieht den Knopf, darf aber nicht jeden Lead geben", () => {
    expect(darfUebergabeSehen("vertriebspartner")).toBe(true);
    expect(darfLeadsZuweisen("vertriebspartner")).toBe(false);
  });

  it("die übrigen Rollen sehen ihn gar nicht", () => {
    for (const rolle of ["backoffice", "setterin", "buchhaltung", "finanzierungspartner", "marketing"]) {
      expect(darfUebergabeSehen(rolle)).toBe(false);
    }
    expect(darfUebergabeSehen(undefined)).toBe(false);
  });
});

describe("Welchen Lead darf ein Vertriebspartner weitergeben?", () => {
  it("den, für den er selbst zuständig ist", () => {
    expect(
      darfKontaktWeitergeben({ zustaendig_id: ICH }, { rolle: "vertriebspartner", benutzerId: ICH }),
    ).toBe(true);
  });

  it("nicht den eines Kollegen, auch wenn er ihn in seiner Liste sieht", () => {
    // In seiner Liste stehen auch Kontakte, die er selbst angelegt hat oder
    // gerade vertritt. Zuständig ist dort der Kollege, also gibt er sie nicht
    // weiter.
    expect(
      darfKontaktWeitergeben({ zustaendig_id: KOLLEGE }, { rolle: "vertriebspartner", benutzerId: ICH }),
    ).toBe(false);
  });

  it("nicht einen Lead ohne Zuständigen, der gehört in die Lead-Verwaltung", () => {
    expect(
      darfKontaktWeitergeben({ zustaendig_id: "" }, { rolle: "vertriebspartner", benutzerId: ICH }),
    ).toBe(false);
  });

  it("gar keinen, solange die eigene Kennung noch nicht geladen ist", () => {
    expect(
      darfKontaktWeitergeben({ zustaendig_id: ICH }, { rolle: "vertriebspartner", benutzerId: "" }),
    ).toBe(false);
  });

  it("die Leitung dagegen jeden", () => {
    expect(darfKontaktWeitergeben({ zustaendig_id: KOLLEGE }, { rolle: "admin", benutzerId: ICH })).toBe(true);
    expect(darfKontaktWeitergeben({ zustaendig_id: "" }, { rolle: "vertriebsleiter", benutzerId: ICH })).toBe(true);
  });

  it("und ohne Kontakt entscheidet niemand etwas", () => {
    expect(darfKontaktWeitergeben(null, { rolle: "admin", benutzerId: ICH })).toBe(false);
  });
});

describe("An wen darf ein Vertriebspartner weitergeben?", () => {
  it("an einen echten Vertriebspartner", () => {
    expect(darfLeadUebernehmen({ rolle: "vertriebspartner" })).toBe(true);
    expect(darfLeadUebernehmen({ rolle: "backoffice", rollen: ["backoffice", "vertriebspartner"] })).toBe(true);
  });

  it("nicht an jemanden ohne Vertriebsrolle", () => {
    for (const rolle of ["buchhaltung", "backoffice", "setterin", "hr", "kunde", "tippgeber", "testaccount"]) {
      expect(darfLeadUebernehmen({ rolle })).toBe(false);
    }
  });

  it("auch nicht an die Leitung, die selbst keine Partnerrolle trägt", () => {
    // Ein Admin verteilt Leads, er bearbeitet sie nicht. Bekäme er einen
    // weitergegebenen Lead, stünde der in keiner Arbeitsliste mehr.
    expect(darfLeadUebernehmen({ rolle: "admin" })).toBe(false);
    expect(darfLeadUebernehmen({ rolle: "vertriebsleiter" })).toBe(false);
  });

  it("und an niemanden, den es nicht gibt", () => {
    expect(darfLeadUebernehmen(null)).toBe(false);
    expect(darfLeadUebernehmen({ rolle: "", rollen: [] })).toBe(false);
  });
});

describe("Dieselbe Regel in der Datenbank", () => {
  it("prüft seit dem 18.09.2026 auch den Empfänger", () => {
    const sql = lies(EMPFAENGER);
    // Die Abwehr selbst: ohne Vertriebspartner-Rolle kein neuer Zuständiger.
    expect(sql).toContain("public.darf_lead_uebernehmen(NEW.zustaendig_id)");
    expect(sql).toContain("Weitergeben kannst du einen Lead nur an einen Vertriebspartner.");
    expect(sql).toContain("AND ur.role = 'vertriebspartner'");
  });

  it("lässt den Weg zurück in den offenen Pool offen", () => {
    // Die Prüfung greift nur bei einem neuen Zuständigen. NULL, also zurück
    // in die Lead-Verwaltung, bleibt unberührt.
    const sql = lies(EMPFAENGER);
    expect(sql).toContain("IF NEW.zustaendig_id IS NOT NULL");
  });

  it("lässt die Leitung weiterhin jedem zuweisen", () => {
    const sql = lies(EMPFAENGER);
    const start = sql.indexOf("IF NEW.zustaendig_id IS NOT NULL");
    const block = sql.slice(start, start + 400);
    expect(block).toContain("NOT public.darf_leads_zuweisen(auth.uid())");
    expect(block).toContain("public.has_role(auth.uid(), 'vertriebspartner')");
  });

  it("behält die beiden älteren Absätze des Triggers", () => {
    // Die Migration ersetzt die ganze Funktion. Fehlte einer der beiden
    // Absätze, wäre er beim Ausführen stillschweigend verschwunden.
    const sql = lies(EMPFAENGER);
    expect(sql).toContain("Als Vertretung kannst du die Zuständigkeit nicht ändern");
    expect(sql).toContain("Du kannst nur Leads weitergeben, für die du selbst zuständig bist.");
  });
});

describe("Die Regel von heute Morgen", () => {
  it("lässt den Vertriebspartner nur seinen eigenen Lead verschieben", () => {
    const sql = lies(UEBERGABE);
    expect(sql).toContain("OLD.zustaendig_id <> auth.uid()");
    expect(sql).toContain("Du kannst nur Leads weitergeben, für die du selbst zuständig bist.");
    // Die Leitungsrollen stehen auf beiden Seiten gleich.
    for (const rolle of ZUWEISEN_ROLLEN) expect(sql).toContain(`'${rolle}'`);
  });

  it("gibt der Vertriebspartner-Regel ein eigenes WITH CHECK, sonst ginge die Abgabe nicht durch", () => {
    const sql = lies(UEBERGABE);
    const start = sql.indexOf('CREATE POLICY "Vertriebspartner bearbeiten eigene Kontakte"');
    expect(start).toBeGreaterThan(-1);
    const block = sql.slice(start, start + 700);
    expect(block).toContain("WITH CHECK");
    expect(block).toContain("zustaendig_id IS NOT NULL AND zustaendig_id <> auth.uid()");
  });

  it("lässt die Vertretung außen vor, wie seit dem 07.08.2026", () => {
    const sql = lies(UEBERGABE);
    expect(sql).toContain("Als Vertretung kannst du die Zuständigkeit nicht ändern");
  });

  it("hält fest, dass Lesen und Bearbeiten für den Partner dieselbe Bedingung tragen", () => {
    // Christians Einwand, geprüft am Quellstand: Was ein Vertriebspartner
    // nicht sieht, kann er auch nicht ändern. Beide Regeln stehen auf
    // is_vp_owner_of_kontakt. Fällt dieser Test um, ist das nicht mehr wahr.
    const sql = lies(ZEILENWEISE);
    const bedingung = `(select public.has_role(auth.uid(), 'vertriebspartner'))
    AND public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)`;
    const sehen = sql.indexOf('CREATE POLICY "Vertriebspartner sehen eigene Kontakte"');
    const bearbeiten = sql.indexOf('CREATE POLICY "Vertriebspartner bearbeiten eigene Kontakte"');
    expect(sql.slice(sehen, sehen + 400)).toContain(bedingung);
    expect(sql.slice(bearbeiten, bearbeiten + 400)).toContain(bedingung);
  });
});

describe("An die Zentrale zurückgeben (28.09.2026)", () => {
  const partner = { rolle: "vertriebspartner", benutzerId: ICH };

  it("lässt den Partner bestätigen, obwohl er kein Ziel auswählt", () => {
    // Der Fehler: Der Knopf verlangte ein Ziel, das nur die Leitung sieht.
    expect(uebergabeBestaetigbar({ darfAlleZuweisen: false, ziel: "", gruendeVollstaendig: true, laeuft: false })).toBe(true);
  });

  it("verlangt von der Leitung weiterhin ein Ziel", () => {
    expect(uebergabeBestaetigbar({ darfAlleZuweisen: true, ziel: "", gruendeVollstaendig: true, laeuft: false })).toBe(false);
    expect(uebergabeBestaetigbar({ darfAlleZuweisen: true, ziel: "Partner B", gruendeVollstaendig: true, laeuft: false })).toBe(true);
  });

  it("geht ohne Grund oder während des Speicherns nicht weiter", () => {
    expect(uebergabeBestaetigbar({ darfAlleZuweisen: false, ziel: "", gruendeVollstaendig: false, laeuft: false })).toBe(false);
    expect(uebergabeBestaetigbar({ darfAlleZuweisen: false, ziel: "", gruendeVollstaendig: true, laeuft: true })).toBe(false);
  });

  it("überspringt fremde Leads, statt die ganze Auswahl zu sperren", () => {
    const eigen = { id: "a", zustaendig_id: ICH };
    const fremd = { id: "b", zustaendig_id: KOLLEGE };
    const pool = { id: "c", zustaendig_id: "" };
    const { eigene, fremde } = teileNachWeitergabeRecht([eigen, fremd, pool], partner);
    expect(eigene.map((k) => k.id)).toEqual(["a"]);
    expect(fremde.map((k) => k.id)).toEqual(["b", "c"]);
  });

  it("gibt der Leitung die ganze Auswahl", () => {
    const { eigene, fremde } = teileNachWeitergabeRecht(
      [{ zustaendig_id: ICH }, { zustaendig_id: KOLLEGE }],
      { rolle: "admin", benutzerId: ICH },
    );
    expect(eigene).toHaveLength(2);
    expect(fremde).toHaveLength(0);
  });

  it("öffnet in der Datenbank den Weg zurück in den Pool, ohne das USING zu ändern", () => {
    const sql = lies(RUECKGABE);
    const start = sql.indexOf('CREATE POLICY "Vertriebspartner bearbeiten eigene Kontakte"');
    expect(start).toBeGreaterThan(-1);
    const block = sql.slice(start, start + 900);
    const using = block.slice(block.indexOf("USING"), block.indexOf("WITH CHECK"));
    const check = block.slice(block.indexOf("WITH CHECK"));
    expect(using).toContain("public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)");
    expect(using).not.toContain("IS NULL");
    expect(check).toContain("OR zustaendig_id IS NULL");
    // Die bisherigen beiden Fälle bleiben.
    expect(check).toContain("public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)");
    expect(check).toContain("zustaendig_id IS NOT NULL AND zustaendig_id <> auth.uid()");
  });

  it("kennt keine Wartezeit für die Rückgabe", () => {
    // Die Wartezeit nach „Nicht erreicht“ steht in meta.verstecktBis und
    // regelt nur das Anrufen. Weder Regel noch Trigger fragen sie ab.
    for (const datei of [RUECKGABE, UEBERGABE, EMPFAENGER]) {
      const ausfuehrbar = lies(datei).split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");
      expect(ausfuehrbar).not.toContain("verstecktBis");
    }
  });
});

describe("Vertriebsleiter gibt an die Zentrale zurück (28.09.2026)", () => {
  const leiter = { rolle: "vertriebsleiter", benutzerId: ICH };

  it("bekommt den Weg nach aktiver Rolle, Admin und Inhaber nicht", () => {
    expect(darfAnZentraleZurueckgeben("vertriebsleiter")).toBe(true);
    expect(darfAnZentraleZurueckgeben("vertriebspartner")).toBe(true);
    for (const rolle of ["admin", "inhaber", "backoffice", "finanzierungspartner", "setterin", "", null]) {
      expect(darfAnZentraleZurueckgeben(rolle)).toBe(false);
    }
  });

  it("darf genau die Kontakte in den Pool geben, die er auch zuweisen darf", () => {
    const auswahl = [{ zustaendig_id: KOLLEGE }, { zustaendig_id: ICH }];
    const { eigene, fremde } = teileNachWeitergabeRecht(auswahl, leiter);
    expect(eigene).toHaveLength(2);
    expect(fremde).toHaveLength(0);
    for (const k of auswahl) expect(darfKontaktWeitergeben(k, leiter)).toBe(true);
  });

  it("braucht im Pool-Weg kein Ziel, aber einen Grund", () => {
    // Im Pool-Weg rechnet die Seite wie beim Partner: kein Ziel.
    expect(uebergabeBestaetigbar({ darfAlleZuweisen: false, ziel: "", gruendeVollstaendig: true, laeuft: false })).toBe(true);
    expect(uebergabeBestaetigbar({ darfAlleZuweisen: false, ziel: "", gruendeVollstaendig: false, laeuft: false })).toBe(false);
  });

  it("wächst serverseitig nicht: Pool und Zuweisung laufen für ihn durch dieselbe Prüfung", () => {
    // Die Regel für interne Rollen prüft die neue Zeile nicht inhaltlich,
    // NULL geht dort also schon heute durch, für Zuweisung wie für Pool.
    const zugriff = lies(KUNDENZUGRIFF);
    const start = zugriff.indexOf('CREATE POLICY "Admin und interne Rollen bearbeiten Kontakte"');
    expect(zugriff.slice(start, start + 400)).toContain("WITH CHECK ((select public.darf_alle_kunden_sehen(auth.uid())))");
    expect(zugriff).toMatch(/'vertriebsleiter',\s*'backoffice'/);

    // Der Trigger: Die beiden Partner-Absätze nehmen die Leitung aus, die
    // Vertretungssperre gilt für ihn (is_admin_role kennt nur admin und
    // inhaber) und fragt nicht, wohin die Zuständigkeit geht.
    const trigger = lies(EMPFAENGER);
    const vertretung = trigger.slice(trigger.indexOf("IF NOT public.is_admin_role(auth.uid())"), trigger.indexOf("Als Vertretung kannst du"));
    expect(vertretung).not.toContain("NEW.zustaendig_id");
    expect(trigger.match(/AND NOT public\.darf_leads_zuweisen\(auth\.uid\(\)\)/g)?.length).toBe(2);

    // Die Migration vom 28.09. fasst weder die Regel für interne Rollen noch
    // den Trigger an.
    const neu = ausfuehrbar(RUECKGABE);
    expect(neu).not.toContain("Admin und interne Rollen");
    expect(neu).not.toContain("kontakt_zustaendigkeit_schuetzen");
  });
});

describe("claim_lead nur für die Lead-Verwaltung (28.09.2026)", () => {
  const claim = () => {
    const sql = ausfuehrbar(RUECKGABE);
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_lead(_kontakt_id uuid, _via text DEFAULT 'manual')");
    expect(start).toBeGreaterThan(-1);
    return sql.slice(start, sql.indexOf("$$;", sql.indexOf("AS $$", start)) + 3);
  };

  it("lässt nur die Rollen der Lead-Verwaltung übernehmen, keine Partner", () => {
    const rumpf = claim();
    expect(rumpf).not.toContain("is_internal_role");
    const liste = rumpf.match(/ur\.role IN \(([^)]*)\)/)?.[1] || "";
    for (const rolle of ["admin", "inhaber", "individuell", "vertriebsleiter", "setterin"]) {
      expect(liste).toContain(`'${rolle}'`);
    }
    for (const rolle of ["vertriebspartner", "tippgeber", "juniorpartner", "backoffice", "finanzierungspartner"]) {
      expect(liste).not.toContain(`'${rolle}'`);
    }
    // Ohne berechtigte Rolle: false, ohne zu schreiben.
    const pruefung = rumpf.slice(rumpf.indexOf("IF NOT EXISTS"), rumpf.indexOf("UPDATE public.kontakte"));
    expect(pruefung).toContain("RETURN QUERY SELECT false, NULL::uuid, NULL::text;");
  });

  it("behält Signatur, festen search_path, SECURITY DEFINER und die Rechte", () => {
    const rumpf = claim();
    expect(rumpf).toContain("RETURNS TABLE(success boolean, claimed_by uuid, claimed_by_name text)");
    expect(rumpf).toContain("SECURITY DEFINER");
    expect(rumpf).toContain("SET search_path = public");
    const sql = ausfuehrbar(RUECKGABE);
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.claim_lead(uuid, text) FROM anon, public;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.claim_lead(uuid, text) TO authenticated;");
  });

  it("übernimmt den Rest des Rumpfs unverändert aus der ersten Fassung", () => {
    const alt = ausfuehrbar(CLAIM_ALT);
    const altRumpf = alt.slice(alt.indexOf("SELECT name INTO v_name"), alt.indexOf("$$;", alt.indexOf("SELECT name INTO v_name")));
    const neuRumpf = claim();
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();
    expect(norm(neuRumpf)).toContain(norm(altRumpf));
  });
});

describe("Meldung vom 28.09.2026: Partner kann nicht zurückgeben", () => {
  const FUNKTION = "20260928190000_lead_rueckgabe_ohne_lesesperre.sql";

  it("spielt die Varianten eines Partners nach aktiver Rolle durch", () => {
    const partner = { rolle: "vertriebspartner", benutzerId: ICH };
    const eigenZugeteilt = { id: "a", zustaendig_id: ICH };
    // Selbst angelegt, aber einem Kollegen zugeteilt, oder als Vertretung sichtbar.
    const fremdSichtbar = { id: "b", zustaendig_id: KOLLEGE };
    // Nur der Name im Freitext, keine Kennung.
    const nurName = { id: "c", zustaendig_id: null };
    const { eigene, fremde } = teileNachWeitergabeRecht([eigenZugeteilt, fremdSichtbar, nurName], partner);
    expect(eigene.map((k) => k.id)).toEqual(["a"]);
    expect(fremde.map((k) => k.id)).toEqual(["b", "c"]);
    expect(darfAnZentraleZurueckgeben("vertriebspartner")).toBe(true);
    // Mehrere Rollen: Es zählt die aktive. Als Setterin kein Rückgabeknopf.
    expect(darfUebergabeSehen("setterin")).toBe(false);
    // „Vertriebspartner (Alt)“ ist eine Karrierestufe, die Rolle bleibt vertriebspartner.
    // Der Tippgeber hat eine eigene Rolle ohne „Alle Kontakte“ und ohne Knopf.
    expect(darfUebergabeSehen("tippgeber")).toBe(false);
    expect(darfAnZentraleZurueckgeben("tippgeber")).toBe(false);
  });

  it("gibt über eine Funktion zurück, weil die Leseregel des Partners die neue Zeile prüft", () => {
    // Postgres prüft bei UPDATE mit WHERE auch die SELECT-Regeln gegen die
    // neue Zeile. Die Leseregel des Partners verlangt is_vp_owner_of_kontakt,
    // nach der Rückgabe ist er das nicht mehr. Nachgestellt am 28.09.2026.
    const sehen = lies(ZEILENWEISE);
    const start = sehen.indexOf('CREATE POLICY "Vertriebspartner sehen eigene Kontakte"');
    expect(sehen.slice(start, start + 400)).toContain("is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)");

    const sql = ausfuehrbar(FUNKTION);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.lead_an_zentrale_zurueckgeben(");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    // Nur der bisherige Zuständige oder die Leitung, keine Vertretung.
    expect(sql).toContain("AND (zustaendig_id = v_uid OR public.darf_leads_zuweisen(v_uid))");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.lead_an_zentrale_zurueckgeben(uuid, jsonb) FROM public, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.lead_an_zentrale_zurueckgeben(uuid, jsonb) TO authenticated;");
    expect(sql).not.toContain("verstecktBis");
  });
});
