import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reserviereNachUnterschrift,
  type EinheitDatenzugriff,
} from "../../supabase/functions/_shared/einheit-vormerkung";

/*
 * Die Seite der Edge Functions und der Datenbank.
 *
 * `finalize-reservierung` und `send-reservierung-eskalation` schrieben bis zum
 * 23.09.2026 ohne jede Prüfung auf „reserviert“ und überschrieben damit auch
 * die Reservierung eines anderen Kunden. Jetzt reserviert die Datenbank in
 * einem Schritt und nur, wenn die Einheit frei ist oder schon diesem Kunden
 * gehört. Fehlt die Migration, gilt ein bedingtes Update.
 */

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

/* ── Ein nachgebauter Supabase-Client, gerade so viel, wie der Helfer braucht ── */

interface Aufzeichnung {
  rpc: Array<{ name: string; args: unknown }>;
  updates: Array<{ werte: Record<string, unknown>; filter: Array<[string, string, unknown]> }>;
}

function falscherClient(opts: {
  rpc: { data: unknown; error: unknown };
  zeile?: Record<string, unknown> | null;
  objekt?: Record<string, unknown> | null;
  geschrieben?: number;
  danach?: Record<string, unknown> | null;
}): { db: EinheitDatenzugriff; auf: Aufzeichnung } {
  const auf: Aufzeichnung = { rpc: [], updates: [] };
  let gelesen = 0;
  const abfrage = (tabelle: string) => {
    const filter: Array<[string, string, unknown]> = [];
    let werte: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {
      select: () => {
        if (werte) {
          auf.updates.push({ werte, filter });
          return Promise.resolve({ data: Array.from({ length: opts.geschrieben ?? 1 }, () => ({ id: "we-6" })), error: null });
        }
        return q;
      },
      update: (w: Record<string, unknown>) => { werte = w; return q; },
      eq: (spalte: string, wert: unknown) => { filter.push(["eq", spalte, wert]); return q; },
      is: (spalte: string, wert: unknown) => { filter.push(["is", spalte, wert]); return q; },
      maybeSingle: async () => {
        if (tabelle === "objekte") return { data: opts.objekt ?? { global_objekt: false }, error: null };
        gelesen += 1;
        return { data: gelesen === 1 ? opts.zeile ?? null : opts.danach ?? null, error: null };
      },
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
    };
    return q;
  };
  const db = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      auf.rpc.push({ name, args });
      return Promise.resolve(opts.rpc);
    },
    from: (tabelle: string) => abfrage(tabelle),
  } as unknown as EinheitDatenzugriff;
  return { db, auf };
}

const AUFTRAG = { wohnungId: "we-6", kontaktId: "k-1", kundeName: "Anna Beispiel", reserviertAm: "2026-09-23T12:00:00.000Z", reserviertVon: "partner-1" };
const OHNE_FUNKTION = { data: null, error: { code: "PGRST202", message: "Could not find the function public.reserviere_einheit_nach_unterschrift" } };

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Reservieren nach der Unterschrift, mit Migration", () => {
  it("ruft die Datenbankfunktion mit allen Angaben und schreibt selbst nichts", async () => {
    const { db, auf } = falscherClient({ rpc: { data: { ergebnis: "reserviert" }, error: null } });
    expect(await reserviereNachUnterschrift(db, AUFTRAG)).toMatchObject({ ergebnis: "reserviert" });
    expect(auf.rpc).toEqual([{
      name: "reserviere_einheit_nach_unterschrift",
      args: { p_wohnung_id: "we-6", p_kontakt_id: "k-1", p_kunde_name: "Anna Beispiel", p_reserviert_am: AUFTRAG.reserviertAm, p_reserviert_von: "partner-1" },
    }]);
    expect(auf.updates).toHaveLength(0);
  });

  it("gibt den Konflikt der Datenbank weiter", async () => {
    const { db } = falscherClient({ rpc: { data: { ergebnis: "vergeben", status: "reserviert", kunde_id: "k-9" }, error: null } });
    expect(await reserviereNachUnterschrift(db, AUFTRAG)).toMatchObject({ ergebnis: "vergeben", status: "reserviert", kundeId: "k-9" });
  });

  it("weicht bei einem echten Fehler NICHT auf das Update aus", async () => {
    const { db, auf } = falscherClient({ rpc: { data: null, error: { code: "42501", message: "keine Rechte" } } });
    expect(await reserviereNachUnterschrift(db, AUFTRAG)).toMatchObject({ ergebnis: "fehler" });
    expect(auf.updates).toHaveLength(0);
  });
});

describe("Rückfall ohne Migration: bedingtes Update", () => {
  it("schreibt eine freie Einheit nur unter der Bedingung, dass sie noch frei ist", async () => {
    const { db, auf } = falscherClient({ rpc: OHNE_FUNKTION, zeile: { id: "we-6", objekt_id: "o1", status: "frei", kunde_id: null } });
    expect(await reserviereNachUnterschrift(db, AUFTRAG)).toMatchObject({ ergebnis: "reserviert", ohneMigration: true });
    expect(auf.updates).toHaveLength(1);
    expect(auf.updates[0].werte).toMatchObject({ status: "reserviert", kunde_id: "k-1", kunde_name: "Anna Beispiel" });
    // Die neuen Spalten gibt es ohne Migration nicht.
    expect(auf.updates[0].werte).not.toHaveProperty("reserviert_von");
    expect(auf.updates[0].filter).toEqual([["eq", "id", "we-6"], ["eq", "status", "frei"], ["is", "kunde_id", null]]);
  });

  it("schreibt nichts, wenn ein anderer Kunde die Einheit hat", async () => {
    const { db, auf } = falscherClient({ rpc: OHNE_FUNKTION, zeile: { id: "we-6", objekt_id: "o1", status: "reserviert", kunde_id: "k-9" } });
    expect(await reserviereNachUnterschrift(db, AUFTRAG)).toMatchObject({ ergebnis: "vergeben", kundeId: "k-9" });
    expect(auf.updates).toHaveLength(0);
  });

  it("meldet vergeben, wenn dazwischen jemand anderes geschrieben hat", async () => {
    const { db } = falscherClient({
      rpc: OHNE_FUNKTION,
      zeile: { id: "we-6", objekt_id: "o1", status: "frei", kunde_id: null },
      geschrieben: 0,
      danach: { status: "reserviert", kunde_id: "k-9", kunde_name: "Bernd" },
    });
    expect(await reserviereNachUnterschrift(db, AUFTRAG)).toMatchObject({ ergebnis: "vergeben", kundeId: "k-9" });
  });

  it("reserviert nie eine Einheit eines Globalobjekts", async () => {
    const { db, auf } = falscherClient({ rpc: OHNE_FUNKTION, zeile: { id: "we-6", objekt_id: "o1", status: "frei", kunde_id: null }, objekt: { global_objekt: true } });
    expect(await reserviereNachUnterschrift(db, AUFTRAG)).toMatchObject({ ergebnis: "globalobjekt" });
    expect(auf.updates).toHaveLength(0);
  });
});

describe("finalize-reservierung", () => {
  const quelle = lies("supabase/functions/finalize-reservierung/index.ts");

  it("reserviert nur noch bedingt über den gemeinsamen Helfer", () => {
    expect(quelle).toContain("reserviereNachUnterschrift(");
    // Kein bedingungsloses Update auf „reserviert“ mehr in dieser Datei.
    expect(quelle).not.toMatch(/from\("wohnungen"\)\s*\.update\(\{\s*status:\s*"reserviert"/);
  });

  it("läutet im Konfliktfall beim Zuständigen, ohne ihn bei der Leitung", () => {
    expect(quelle).toContain("Einheit inzwischen vergeben: ${notifKundeName}");
    // Seit 05.10.2026 wie jede Prozess-Glocke: Zustaendiger, sonst Leitung.
    expect(quelle).toContain("await zustaendigOderLeitung(supabase, kontaktId)");
    expect(quelle).toContain("insertNotifOnce(uid)");
  });

  it("vermerkt den Konflikt am Vorgang, ohne den Namen des anderen Kunden", () => {
    expect(quelle).toContain("nextMeta.rvEinheitVergeben = {");
    expect(quelle).toContain("nextMeta.rvReservierungEntfallenAm = jetzt");
    expect(quelle).not.toMatch(/rvReservierungEntfallenGrund[^\n]*konflikt\.kundeName/);
  });

  it("schickt im Konfliktfall keine Zahlungsaufforderung und keine Erfolgsmail an den Partner", () => {
    expect(quelle).toContain("einheitVergeben: true");
    // Seit 24.09.2026 geht die Partnermail erst mit der PDF, ueber den
    // gemeinsamen Helfer. Die Vorlage sagt im Konfliktfall, dass keine
    // Reservierung zustande kam, statt einen Erfolg zu melden.
    expect(quelle).not.toContain('templateName: "reservierung-unterschrieben"');
    const vorlage = lies("supabase/functions/_shared/transactional-email-templates/reservierung-unterschrieben.tsx");
    expect(vorlage).toContain("Eine Reservierung ist deshalb nicht zustande gekommen");
    expect(vorlage).toContain("einheitVergeben ? 'Unterschrieben, aber schon vergeben'");
  });

  it("setzt bei einer neuen Unterschrift alte Entfallen-Vermerke zurück", () => {
    expect(quelle).toMatch(/rvReservierungEntfallenAm: null,\s*rvReservierungEntfallenGrund: null,\s*rvEinheitVergeben: null,/);
  });
});

describe("send-reservierung-eskalation", () => {
  const quelle = lies("supabase/functions/send-reservierung-eskalation/index.ts");

  it("schreibt nie ohne Prüfung auf reserviert", () => {
    expect(quelle).toContain("reserviereNachUnterschrift(");
    expect(quelle).not.toMatch(/status:\s*"reserviert"/);
  });

  it("lässt einen Fehler nicht als „entfallen“ durchgehen", () => {
    expect(quelle).toContain('if (ergebnis.ergebnis === "fehler") throw');
  });

  it("schreibt den Namen des anderen Kunden nicht mehr in das Investment", () => {
    expect(quelle).not.toContain("besetztVon");
  });
});

describe("Die Vertragskopie im Konfliktfall", () => {
  const vorlage = lies("supabase/functions/_shared/transactional-email-templates/reservierung-kopie.tsx");

  it("fordert keine Zahlung an, sondern bittet, nicht zu zahlen", () => {
    // Der Zweig zeigt den Text `vergeben`, der seit Etappe 2 der Kundensprache
    // je Sprache im Objekt TEXTE steht.
    const zweig = vorlage.slice(vorlage.indexOf("{einheitVergeben ? ("), vorlage.indexOf(") : ohneGebuehr ? ("));
    expect(zweig).toContain("t.vergeben(");
    for (const anfang of ["\n  vergeben: (gesamt: boolean) =>", "\n    vergeben: (gesamt: boolean) =>"]) {
      const i = vorlage.indexOf(anfang);
      expect(i, anfang).toBeGreaterThan(-1);
      const text = vorlage.slice(i, vorlage.indexOf("ohneGebuehr:", i));
      expect(text).not.toContain("Eingang der");
      expect(text).not.toMatch(/receipt of/);
      expect(text).not.toMatch(/[–—]/);
    }
    expect(vorlage).toContain("Bitte zahlen Sie keine Reservierungsgebühr");
    expect(vorlage).toContain("Please do not pay a reservation fee");
  });
});

describe("Die Migration", () => {
  const sql = lies("supabase/migrations/20260923150000_reservierung_vormerkung.sql");

  it("liegt, solange sie offen ist, als gleiche Kopie im Eingangskorb", () => {
    // Nach dem Ausfuehren nimmt Christian die Kopie aus dem Korb (README dort).
    // Liegt sie noch dort, muss sie der Historie gleichen.
    const kopie = resolve(__dirname, "../..", "supabase/migrations-inbox/20260923150000_reservierung_vormerkung.sql");
    if (existsSync(kopie)) expect(readFileSync(kopie, "utf-8")).toBe(sql);
  });

  it("legt die Spalten wiederholbar an, mit Verweis auf den Kontakt", () => {
    for (const spalte of ["vorgemerkt_bis timestamptz", "vorgemerkt_kunde_id uuid", "vorgemerkt_kunde_name text", "vorgemerkt_von uuid", "vorgemerkt_berater_name text", "reserviert_von uuid"]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${spalte}`);
    }
    expect(sql).toContain("REFERENCES public.kontakte(id) ON DELETE SET NULL");
  });

  it("merkt in einem Schritt vor, nur frei, ohne Kunden und ohne fremde laufende Vormerkung", () => {
    const vormerken = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.vormerke_einheit"), sql.indexOf("REVOKE ALL ON FUNCTION public.vormerke_einheit"));
    expect(vormerken).toContain("SECURITY DEFINER");
    expect(vormerken).toContain("SET search_path = public");
    expect(vormerken).toContain("interval '60 minutes'");
    expect(vormerken).toContain("public.darf_reservieren(v_uid)");
    expect(vormerken).toContain("public.darf_kontakt_bearbeiten(v_uid, p_kontakt_id)");
    expect(vormerken).toContain("'globalobjekt'");
    expect(vormerken).toContain("'exklusiv'");
    expect(vormerken).toMatch(/NOT IN \('reserviert', 'gesetzt', 'verkauft'\)/);
    expect(vormerken).toMatch(/w\.vorgemerkt_bis IS NULL\s+OR w\.vorgemerkt_bis <= now\(\)\s+OR w\.vorgemerkt_kunde_id = p_kontakt_id/);
    // Der Status bleibt frei: Die Vormerkung setzt ihn nicht.
    expect(vormerken).not.toMatch(/SET status/);
  });

  it("gibt das Vormerken nur Angemeldeten und das Reservieren nur der Dienstrolle", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.vormerke_einheit(uuid, uuid) FROM public, anon;");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reserviere_einheit_nach_unterschrift\(uuid, uuid, text, text, uuid\)\s+FROM public, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reserviere_einheit_nach_unterschrift\(uuid, uuid, text, text, uuid\)\s+TO service_role;/);
  });

  it("reserviert nach der Unterschrift nur frei oder schon für diesen Kunden und räumt die Vormerkung", () => {
    const reservieren = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.reserviere_einheit_nach_unterschrift"), sql.indexOf("REVOKE ALL ON FUNCTION public.reserviere_einheit_nach_unterschrift"));
    // Verglichen wird als Text, damit es gleich ist, ob die Spalte Text oder uuid ist.
    expect(reservieren).toContain("AND w.kunde_id::text = p_kontakt_id::text");
    expect(reservieren).toContain("vorgemerkt_bis = NULL");
    expect(reservieren).toContain("'vergeben'");
    // Die fremde Vormerkung steht bewusst NICHT in der Bedingung: Die erste Unterschrift gewinnt.
    const anfang = reservieren.indexOf("WHERE w.id = p_wohnung_id\n     AND (");
    expect(anfang).toBeGreaterThan(-1);
    const bedingung = reservieren.slice(anfang, reservieren.indexOf("RETURNING w.id INTO v_treffer"));
    expect(bedingung).not.toContain("vorgemerkt_bis");
  });

  it("verschärft den Auslöser: Kundenwechsel nur Admin und Inhaber, nie ein Globalobjekt", () => {
    const ausloeser = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.wohnung_reservierung_pruefen()"));
    expect(ausloeser).toContain("kundenwechsel AND NOT public.is_admin_role(auth.uid())");
    expect(ausloeser).toContain("o.global_objekt");
    // Der Globalobjekt-Riegel steht VOR dem Ausstieg für die Dienstrolle.
    expect(ausloeser.indexOf("o.global_objekt")).toBeLessThan(ausloeser.indexOf("IF auth.uid() IS NULL THEN"));
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });

  it("hat eine lesende Prüfabfrage im Kopf", () => {
    expect(sql).toContain("to_regprocedure('public.vormerke_einheit(uuid,uuid)') is not null");
  });
});
