import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PIPELINE_STUFEN } from "./pipelineStufen";

/**
 * Migration provisionssatz_ab_reservierung (29.09.2026).
 *
 * Ausfuehren laesst sie sich hier nicht. Der Quelltext haelt fest, was
 * Christian entschieden hat: festgeschrieben erst ab Reservierung, neu beim
 * Partnerwechsel, die Schluessel schreibt nur die Datenbank.
 */

const DATEI = "20260929140000_provisionssatz_ab_reservierung.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

function funktion(sql: string, kopf: string): string {
  const a = sql.indexOf(kopf);
  expect(a).toBeGreaterThanOrEqual(0);
  return sql.slice(a, sql.indexOf("\n$$;", a) + 4);
}

const TRIGGER = funktion(SQL, "CREATE OR REPLACE FUNCTION public.investments_provisionssatz_festschreiben()");
const ERMITTELN = funktion(SQL, "CREATE OR REPLACE FUNCTION public.provisionssatz_ermitteln(");
const WECHSEL = funktion(SQL, "CREATE OR REPLACE FUNCTION public.kontakte_provisionssatz_partnerwechsel()");

describe("Migration provisionssatz_ab_reservierung", () => {
  it("die Kaufphase ist genau reservierung bis abgeschlossen aus pipelineStufen.ts", () => {
    const keys: string[] = PIPELINE_STUFEN.map((s) => s.key);
    const erwartet = keys.slice(keys.indexOf("reservierung"), keys.indexOf("abgeschlossen") + 1);
    const liste = funktion(SQL, "CREATE OR REPLACE FUNCTION public.pipelinestufe_ist_kaufphase(")
      .match(/IN \(([^)]*)\)/)![1]
      .match(/'([a-z_]+)'/g)!
      .map((s) => s.replace(/'/g, ""));
    expect(liste).toEqual(erwartet);
  });

  it("feuert beim Anlegen und bei jeder Aenderung von meta", () => {
    expect(SQL).toContain("BEFORE INSERT OR UPDATE OF meta ON public.investments");
    expect(SQL).toContain("AFTER UPDATE OF zustaendig_id ON public.kontakte");
    expect(SQL).toContain("WHEN (OLD.zustaendig_id IS DISTINCT FROM NEW.zustaendig_id)");
  });

  it("schuetzt die Schluessel: Client-Werte fallen weg, der gespeicherte Stand bleibt", () => {
    expect(TRIGGER).toContain("- 'lockedProvisionRateNeu') - _schluessel");
    expect(TRIGGER).toContain("WHERE e.key = ANY(_schluessel)");
    for (const k of ["lockedProvisionRate", "lockedProvisionRateAt", "lockedProvisionRateQuelle",
      "lockedProvisionRatePartner", "lockedProvisionRateAnlass", "lockedProvisionRateFehler"]) {
      expect(TRIGGER).toContain(`'${k}'`);
    }
  });

  it("schreibt vor der Kaufphase nichts und nimmt Auftraege aus dem Browser nicht an", () => {
    expect(TRIGGER).toContain("IF public.pipelinestufe_ist_kaufphase(_meta ->> 'pipelineStufe') THEN");
    expect(TRIGGER).toContain("IF _auftrag IS NOT NULL AND pg_trigger_depth() <= 1 AND auth.uid() IS NOT NULL THEN");
    // Gueltig ist nur ein Satz dieser Fassung (mit Anlass), nicht die alten mit Quelle 'serverseitig'.
    expect(TRIGGER).toContain("_hat_serversatz := (_meta ? 'lockedProvisionRate') AND (_meta ? 'lockedProvisionRateAnlass');");
    expect(TRIGGER).not.toContain("IN ('serverseitig', 'nachgetragen')");
    expect(TRIGGER).toContain("'lockedProvisionRatePartner', _ergebnis.partner_id::text");
  });

  it("ein meta, das kein Objekt ist, hebelt den Schutz nicht aus", () => {
    expect(TRIGGER).toContain("IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN\n    _meta := '{}'::jsonb;");
    expect(TRIGGER).not.toMatch(/jsonb_typeof\(NEW\.meta\) <> 'object' THEN\s+RETURN NEW/);
  });

  it("ermittelt bei Rueckkehr in die Kaufphase neu, wenn der Partner ein anderer ist", () => {
    expect(TRIGGER).toContain("_nur_bei_anderem_partner := true;");
    expect(TRIGGER).toContain("ELSIF _ergebnis.partner_id::text IS NOT DISTINCT FROM (_meta ->> 'lockedProvisionRatePartner') THEN");
  });

  it("Provisionseinstellungen aendern nur Admin, Inhaber und der Server", () => {
    const WAECHTER = funktion(SQL, "CREATE OR REPLACE FUNCTION public.user_settings_provision_schuetzen()");
    expect(WAECHTER).toContain("IF auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN");
    for (const k of ["custom_provision_rate", "custom_provision_rate_eigen", "custom_provision_rate_setter",
      "karriere_override", "provision_locked"]) {
      expect(WAECHTER).toContain(`'${k}'`);
    }
    // Alter Wert bleibt, kein Abbruch: das uebrige Speichern geht weiter.
    expect(WAECHTER).toContain("NEW.einstellungen := (_neu - _schluessel) || _alt;");
    expect(WAECHTER).not.toContain("RAISE EXCEPTION");
    expect(SQL).toContain("BEFORE INSERT OR UPDATE OF einstellungen ON public.user_settings");
  });

  it("entfernt auf Auftrag nur Saetze vor der Kaufphase", () => {
    const block = TRIGGER.slice(TRIGGER.indexOf("IF _auftrag = 'verwerfen' THEN"));
    expect(block).toMatch(/^IF _auftrag = 'verwerfen' THEN\s+IF NOT public\.pipelinestufe_ist_kaufphase\(_meta ->> 'pipelineStufe'\) THEN\s+_meta := _meta - _schluessel;/);
    // Der Auftrag wird erst nach der Pruefung auf vertrauenswuerdige Herkunft ausgewertet.
    expect(TRIGGER.indexOf("pg_trigger_depth() <= 1")).toBeLessThan(TRIGGER.indexOf("IF _auftrag = 'verwerfen' THEN"));
  });

  it("vermerkt jeden Fehler am Investment statt ihn zu verschlucken", () => {
    expect(TRIGGER.match(/EXCEPTION WHEN OTHERS THEN/g)).toHaveLength(1);
    expect(TRIGGER).toContain("_grund := 'ausnahme';");
    expect(TRIGGER).toContain("'lockedProvisionRateFehler', jsonb_strip_nulls(");
    // Der Partnerwechsel faengt nichts ab, siehe Kommentar in der Migration.
    expect(WECHSEL).not.toContain("EXCEPTION");
  });

  it("der Partnerwechsel ergaenzt nur den Auftrag und ersetzt meta nicht", () => {
    expect(WECHSEL).toContain("SET meta = coalesce(i.meta, '{}'::jsonb) || jsonb_build_object('lockedProvisionRateNeu', 'partnerwechsel')");
    expect(WECHSEL).toContain("WHERE i.kunde_id = NEW.id");
    expect(WECHSEL).toContain("IF NEW.zustaendig_id IS NULL THEN");
  });

  it("die Ermittlung ist die bisherige Kette, uuid gegen uuid", () => {
    expect(ERMITTELN).toContain("WHERE k.id = _kunde_id");
    expect(ERMITTELN).not.toMatch(/k\.id::text|_kunde_id::text/);
    expect(ERMITTELN).toContain("partner_id := public.investment_partner_id(_kunde_id);");
    expect(ERMITTELN).toContain("SELECT count(*) = 1 AND bool_and(p.id = partner_id) INTO _eigen");
    expect(ERMITTELN).toContain("satz := public.provisionssatz_fuer_partner(partner_id, _eigen);");
  });

  it("die Helfer mit fremden Saetzen sind auch fuer PUBLIC gesperrt", () => {
    for (const f of ["provisionssatz_ermitteln(uuid)", "provisionssatz_fuer_partner(uuid, boolean)", "investment_partner_id(uuid)"]) {
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
    }
  });

  it("aendert keine Bestandsdaten", () => {
    const ohneKommentare = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");
    // Das einzige UPDATE steht im Trigger fuer den Partnerwechsel.
    expect(ohneKommentare.match(/\bUPDATE public\./g)).toHaveLength(1);
    expect(ohneKommentare).not.toMatch(/\bDELETE FROM\b|\bINSERT INTO\b/);
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb und in der Sammeldatei", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
  });
});

describe("Datenkorrektur provisionssatz_nachtrag", () => {
  const DATEI2 = "20260929150000_provisionssatz_nachtrag.sql";
  const NACHTRAG = readFileSync(`supabase/migrations/${DATEI2}`, "utf8");

  it("laeuft erst nach der Mechanik und nur im SQL-Editor", () => {
    expect(DATEI2 > DATEI).toBe(true);
    expect(NACHTRAG).toContain("RAISE EXCEPTION 'Zuerst 20260929140000_provisionssatz_ab_reservierung.sql");
    expect(NACHTRAG).toContain("IF auth.uid() IS NOT NULL THEN");
  });

  it("rechnet keinen Satz selbst, sondern beauftragt den Trigger", () => {
    expect(NACHTRAG).toContain(`'{"lockedProvisionRateNeu": "verwerfen"}'::jsonb`);
    expect(NACHTRAG).toContain(`'{"lockedProvisionRateNeu": "nachtrag"}'::jsonb`);
    expect(NACHTRAG).not.toContain("provisionssatz_fuer_partner");
    expect(NACHTRAG).not.toMatch(/'lockedProvisionRate'\s*,/);
    // Alt ist, was keinen Anlass traegt, nicht nur, was keine Quelle hat.
    expect(NACHTRAG.match(/NOT i\.meta \? 'lockedProvisionRateAnlass'/g)!.length).toBeGreaterThanOrEqual(3);
    expect(NACHTRAG).not.toContain("lockedProvisionRateQuelle");
  });

  it("laesst Fehlervermerke und Endzustaende liegen und prueft gegen", () => {
    expect(NACHTRAG.match(/NOT i\.meta \? 'lockedProvisionRateFehler'/g)!.length).toBeGreaterThanOrEqual(4);
    expect(NACHTRAG).toContain("NOT IN ('verloren', 'archiviert', 'bestandsimport')");
    expect(NACHTRAG).toContain("RAISE EXCEPTION 'Der Trigger hat % Auftraege nicht angenommen");
    // Ergebnis als Tabelle nach dem COMMIT, weil NOTICE nicht ueberall sichtbar ist.
    expect(NACHTRAG.lastIndexOf("SELECT\n  count(*) FILTER")).toBeGreaterThan(NACHTRAG.lastIndexOf("COMMIT;"));
  });

  it("liegt im Eingangskorb nach der Mechanik", () => {
    const korb = `supabase/migrations-inbox/${DATEI2}`;
    if (!existsSync(korb)) return;
    expect(readFileSync(korb, "utf8")).toBe(NACHTRAG);
    const alle = readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8");
    expect(alle.indexOf(NACHTRAG.trim())).toBeGreaterThan(alle.indexOf(SQL.trim()));
  });
});

describe("Browser: das Kundenprofil schreibt kein ganzes Investment-meta zurueck", () => {
  it("KundenDetail setzt Merker am Investment nur ueber setInvestmentMetaFields", () => {
    const quelle = readFileSync("src/pages/KundenDetail.tsx", "utf8");
    expect(quelle).not.toContain('cacheUpdate("investments"');
    expect(quelle).toContain('setInvestmentMetaFields(inv.id, { unterlagenGesendet: true');
    expect(quelle).toContain('setInvestmentMetaFields(inv.id, { docMissingNotifiedAt:');
  });
});
