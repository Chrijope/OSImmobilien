/**
 * Aufgaben nie an den Kunden, Geschwister-Aufgaben, Migrationen und
 * Follow-up-Ketten (15.10.2026).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const zustand = vi.hoisted(() => ({
  rolle: "vertriebspartner",
  eingefuegt: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(async () => ({ data: 1, error: null })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u-ich" } } }) },
    rpc: zustand.rpc,
  },
}));
vi.mock("./dataCache", async (original) => ({
  ...(await original<typeof import("./dataCache")>()),
  aktiveCacheRolle: () => zustand.rolle,
  cacheGet: () => [],
  cacheInsert: async (_t: string, zeile: Record<string, unknown>) => { zustand.eingefuegt.push(zeile); return zeile; },
  cacheUpdate: async () => {},
  isTableLoaded: () => true,
}));

import { addAufgabe, erledigeAufgabe, GESCHWISTER_AUSLOESER_PRAEFIXE, geschwisterAufgabenSchliessen } from "./aufgabenStore";
import { getFollowUpKetten } from "./followUpStore";

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ohneKommentare = (sql: string) => sql.replace(/--.*$/gm, "");

beforeEach(() => {
  zustand.rolle = "vertriebspartner";
  zustand.eingefuegt = [];
  zustand.rpc.mockClear();
});

describe("addAufgabe nie an den Kunden", () => {
  it("bricht im Kundenportal ohne anderen Empfänger still ab", async () => {
    zustand.rolle = "kunde";
    expect(await addAufgabe({ titel: "Unterlagen prüfen" })).toBeNull();
    expect(await addAufgabe({ titel: "Unterlagen prüfen", zugewiesenAn: "u-ich" })).toBeNull();
    expect(zustand.eingefuegt).toHaveLength(0);
  });

  it("legt im Kundenportal an, wenn ein anderer Empfänger angegeben ist", async () => {
    zustand.rolle = "kunde";
    expect(await addAufgabe({ titel: "Mindestunterlagen da: Objektauswahlgespräch terminieren", zugewiesenAn: "u-partner" })).not.toBeNull();
    expect(zustand.eingefuegt[0]).toMatchObject({ zugewiesen_an: "u-partner" });
  });

  it("bleibt für interne Rollen wie bisher: ohne Empfänger an den Anlegenden", async () => {
    expect(await addAufgabe({ titel: "Eigene Aufgabe" })).not.toBeNull();
    expect(zustand.eingefuegt[0]).toMatchObject({ zugewiesen_an: "u-ich", benutzer_id: "u-ich" });
  });
});

describe("Geschwister-Aufgaben", () => {
  it("ruft die Datenbank nur für freigegebene Präfixe und mit Kontakt", async () => {
    await geschwisterAufgabenSchliessen("dolmetscher_notar:i1", "k1");
    await geschwisterAufgabenSchliessen("dolmetscher_notar:i1", undefined);
    await geschwisterAufgabenSchliessen("sa_nachfass:i1", "k1");
    expect(zustand.rpc).toHaveBeenCalledTimes(1);
    expect(zustand.rpc).toHaveBeenCalledWith("aufgaben_geschwister_schliessen", { _schluessel: "dolmetscher_notar:i1", _kontakt_id: "k1" });
  });

  it("ein Fehler der Datenbank bricht das eigene Abhaken nicht ab", async () => {
    zustand.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "could not find the function" } } as never);
    await expect(erledigeAufgabe("a1")).resolves.toBeUndefined();
  });

  it("die Präfixliste im Browser passt zur Datenbankfunktion", () => {
    const sql = ohneKommentare(lies("supabase/migrations/20261016206000_aufgaben_geschwister_schliessen.sql"));
    const imSql = [...sql.matchAll(/'([a-z_]+:)'/g)].map((m) => m[1]);
    expect([...new Set(imSql)].sort()).toEqual([...GESCHWISTER_AUSLOESER_PRAEFIXE].sort());
  });
});

describe("Migrationen vom 15.10.2026", () => {
  const dateien = {
    empfehlungsprogramm: "supabase/migrations/20261016204000_aufgabentitel_empfehlungsprogramm.sql",
    portal: "supabase/migrations/20261016205000_unterlagen_pruefaufgabe.sql",
    geschwister: "supabase/migrations/20261016206000_aufgaben_geschwister_schliessen.sql",
  };

  it("ohne BEGIN; und DO auf oberster Ebene, nie für anon", () => {
    for (const pfad of Object.values(dateien)) {
      const sql = ohneKommentare(lies(pfad));
      expect(sql, pfad).not.toMatch(/^\s*BEGIN;/m);
      expect(sql, pfad).not.toMatch(/^\s*DO \$/m);
      expect(sql, pfad).toMatch(/REVOKE ALL ON FUNCTION .* FROM public, anon;/);
      expect(sql, pfad).toContain("SECURITY DEFINER");
      expect(sql, pfad).toContain("SET search_path = public");
    }
  });

  it("tragen die neuen Titel und Schlüssel", () => {
    expect(lies(dateien.empfehlungsprogramm)).toContain("'Empfehlungsprogramm angefragt: einrichten und freigeben'");
    const portal = lies(dateien.portal);
    expect(portal).toContain("'Neue Unterlagen im Portal: prüfen und freigeben'");
    expect(portal).toContain("'portal:unterlagen_pruefen:'");
    expect(portal).toContain("'portal:bonitaet:'");
    expect(portal).toContain("Automatisch zusammengeführt: Je Investment gibt es eine Prüfaufgabe für neue Unterlagen aus dem Portal.");
    expect(portal).toContain("'Empfehlung erhalten: Empfohlenen anrufen'");
    expect(portal).toContain("'empfehlung_erhalten:'");
    expect(portal).toContain("pg_advisory_xact_lock(hashtext(");
    const geschwister = lies(dateien.geschwister);
    expect(geschwister).toContain("'Von einer Kollegin oder einem Kollegen erledigt'");
    expect(geschwister).toContain("RETURNS integer");
  });
});

describe("Follow-up-Ketten", () => {
  it("es bleibt nur der Schritt einen Monat nach dem Notar", () => {
    const ketten = getFollowUpKetten();
    expect(ketten).toHaveLength(1);
    expect(ketten[0]).toMatchObject({ pipelineStufe: "faelligkeit" });
    expect(ketten[0].schritte).toEqual([
      expect.objectContaining({ tageNachEvent: 30, typ: "anruf", prioritaet: "mittel", titel: "Einen Monat nach dem Notar: Zufriedenheit abfragen" }),
    ]);
  });
});
