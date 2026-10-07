/**
 * Glocke nur an den Zustaendigen (Christians Regel vom 29.09.2026).
 *
 * Jede Rolle bekommt Glocken nur zu Leads, die ihr JETZT zugewiesen sind
 * (`kontakte.zustaendig_id`). Geht ein Lead an die Zentrale zurueck oder an
 * einen anderen Partner, zaehlt der aktuell hinterlegte. Geprueft werden die
 * Regel selbst, die Warteschlange, die Cron-Functions und die Browser-Glocken.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  empfaengerZumVersand,
  entscheideEmpfaenger,
  ohneFremdePartnerListe,
  zustaendigOderLeitung,
} from "../../supabase/functions/_shared/glocke-zustaendiger.ts";

const WURZEL = resolve(__dirname, "../..");
const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

const LEITUNG = ["u-admin", "u-vl"];

describe("Regel: Empfaenger zum Versandzeitpunkt", () => {
  const basis = { geplantFuer: "u-a", rollenDesGeplanten: ["vertriebspartner"], leitung: LEITUNG };

  it("geplant fuer Partner A, Lead jetzt bei B: B bekommt sie, A nicht", () => {
    expect(entscheideEmpfaenger({ ...basis, zustaendigJetzt: "u-b" })).toMatchObject({ art: "umleiten", an: ["u-b"] });
  });

  it("geplant fuer Partner A, Lead zurueck an die Zentrale: die Leitung", () => {
    expect(entscheideEmpfaenger({ ...basis, zustaendigJetzt: null })).toMatchObject({ art: "umleiten", an: LEITUNG });
  });

  it("geplant fuer den, der noch zustaendig ist: unveraendert", () => {
    expect(entscheideEmpfaenger({ ...basis, zustaendigJetzt: "u-a" })).toEqual({ art: "wie_geplant" });
  });

  it("Leitungs-Rueckfall ohne Zustaendigen bleibt bei der Leitung, mit neuem Zustaendigen geht er an ihn", () => {
    const leitung = { geplantFuer: "u-admin", rollenDesGeplanten: ["admin", "inhaber"], leitung: LEITUNG };
    expect(entscheideEmpfaenger({ ...leitung, zustaendigJetzt: null })).toEqual({ art: "wie_geplant" });
    expect(entscheideEmpfaenger({ ...leitung, zustaendigJetzt: "u-b" })).toMatchObject({ art: "umleiten", an: ["u-b"] });
  });

  it("Backoffice, Finanzierung und Setterin bleiben unveraendert, dort gilt die Erinnerung der Rolle", () => {
    for (const rolle of ["backoffice", "finanzierungspartner", "setterin"]) {
      expect(entscheideEmpfaenger({ ...basis, rollenDesGeplanten: [rolle], zustaendigJetzt: "u-b" })).toEqual({ art: "wie_geplant" });
    }
  });

  it("Aufgabe an Tag 14 entfaellt ohne Zustaendigen, und ohne Kontakt entfaellt jede", () => {
    expect(entscheideEmpfaenger({ ...basis, zustaendigJetzt: null, ohneZustaendigenEntfaellt: true }).art).toBe("entfaellt");
    expect(entscheideEmpfaenger({ ...basis, zustaendigJetzt: undefined }).art).toBe("entfaellt");
  });
});

/** Kleine Datenbank im Speicher mit den Filtern, die die Regel braucht. */
function speicherDb(tabellen: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(tabelle: string) {
      let zeilen = [...(tabellen[tabelle] || [])];
      const abfrage = {
        select: () => abfrage,
        eq: (f: string, w: unknown) => ((zeilen = zeilen.filter((z) => z[f] === w)), abfrage),
        neq: (f: string, w: unknown) => ((zeilen = zeilen.filter((z) => z[f] !== w)), abfrage),
        in: (f: string, w: unknown[]) => ((zeilen = zeilen.filter((z) => w.includes(z[f]))), abfrage),
        maybeSingle: async () => ({ data: zeilen[0] ?? null, error: null }),
        then: (ok: (w: unknown) => unknown, fehler?: (e: unknown) => unknown) =>
          Promise.resolve({ data: zeilen, error: null }).then(ok, fehler),
      };
      return abfrage;
    },
  };
}

const ROLLEN = [
  { user_id: "u-a", role: "vertriebspartner" },
  { user_id: "u-b", role: "vertriebspartner" },
  { user_id: "u-admin", role: "admin" },
  { user_id: "u-vl", role: "vertriebsleiter" },
  { user_id: "u-backoffice", role: "backoffice" },
];
const ERINNERUNG = {
  id: "z-1", target_user_id: "u-a", kontakt_id: "k-1", titel: "Notarfoto nicht vergessen!",
  trigger_at: "2026-10-01T08:00:00.000Z", category: null, status: "pending",
};

describe("Warteschlange: Erinnerung fuer A, Lead danach bei B", () => {
  it("geht an B", async () => {
    const db = speicherDb({ kontakte: [{ id: "k-1", zustaendig_id: "u-b" }], user_roles: ROLLEN, scheduled_notifications: [ERINNERUNG] });
    expect(await empfaengerZumVersand(db, ERINNERUNG)).toMatchObject({ art: "umleiten", an: ["u-b"] });
  });

  it("ohne Zustaendigen an die Leitung, nie an A", async () => {
    const db = speicherDb({ kontakte: [{ id: "k-1", zustaendig_id: null }], user_roles: ROLLEN, scheduled_notifications: [ERINNERUNG] });
    const e = await empfaengerZumVersand(db, ERINNERUNG);
    expect(e).toMatchObject({ art: "umleiten" });
    expect(e.art === "umleiten" && [...e.an].sort()).toEqual(["u-admin", "u-vl"]);
  });

  it("hat B dieselbe Erinnerung schon, bekommt er keine zweite", async () => {
    const eigene = { ...ERINNERUNG, id: "z-2", target_user_id: "u-b" };
    const db = speicherDb({ kontakte: [{ id: "k-1", zustaendig_id: "u-b" }], user_roles: ROLLEN, scheduled_notifications: [ERINNERUNG, eigene] });
    expect((await empfaengerZumVersand(db, ERINNERUNG)).art).toBe("entfaellt");
  });

  it("der Verarbeiter bestimmt den Empfaenger vor dem Sonderfall Tag 14 und vor dem Versand", () => {
    const quelle = lies("supabase/functions/process-scheduled-notifications/index.ts");
    const regel = quelle.indexOf("await empfaengerZumVersand(supabase, row)");
    expect(regel).toBeGreaterThan(0);
    expect(regel).toBeLessThan(quelle.indexOf('if (row.category === "sa_vp_nudge")'));
    expect(quelle).toContain("targetUserIds = umgeleitetAn ?? [row.target_user_id]");
    expect(quelle).toContain("benutzer_id: vpId,");
    expect(quelle).not.toContain("benutzer_id: row.target_user_id");
  });
});

describe("Liste ohne fremde Partner (Exposé geoeffnet)", () => {
  const rollen = new Map<string, string[]>([
    ["u-a", ["vertriebspartner"]],
    ["u-backoffice", ["backoffice"]],
    ["u-vl", ["vertriebsleiter", "vertriebspartner"]],
  ]);

  it("der fruehere Partner als Absender faellt heraus, der Zustaendige bleibt", () => {
    expect(ohneFremdePartnerListe(["u-b", "u-a"], "u-b", rollen, LEITUNG)).toEqual(["u-b"]);
  });

  it("Backoffice und Leitung als Absender bleiben", () => {
    expect(ohneFremdePartnerListe(["u-b", "u-backoffice", "u-vl"], "u-b", rollen, LEITUNG)).toEqual(["u-b", "u-backoffice", "u-vl"]);
  });

  it("ohne Zustaendigen und mit Partner als Absender: nur die Leitung", () => {
    expect(ohneFremdePartnerListe(["u-a"], null, rollen, LEITUNG)).toEqual(LEITUNG);
  });

  it("ohne Zustaendigen und mit Backoffice als Absender: der Absender und die Leitung", () => {
    expect(ohneFremdePartnerListe(["u-backoffice"], null, rollen, LEITUNG)).toEqual(["u-backoffice", ...LEITUNG]);
  });

  it("geloeschter Kontakt: nie die Leitung, ein Partner als Absender auch nicht", () => {
    expect(ohneFremdePartnerListe(["u-backoffice"], null, rollen, LEITUNG, false)).toEqual(["u-backoffice"]);
    expect(ohneFremdePartnerListe(["u-a"], null, rollen, LEITUNG, false)).toEqual([]);
  });

  it("die Functions reichen mit, ob der Kontakt noch da ist", () => {
    for (const f of ["get-expose", "get-kundenansicht"]) {
      const q = lies(`supabase/functions/${f}/index.ts`);
      expect(q).toContain("!!kontakt && kontakt.geloescht !== true,");
      expect(q).toContain("zustaendig_id, meta, geloescht\")");
    }
  });
});

describe("Cron-Functions nehmen den aktuellen Zustaendigen", () => {
  it("Unterlagen ausstehend ueber zustaendig_id, ohne ihn an die Leitung", () => {
    const q = lies("supabase/functions/check-document-reminders/index.ts");
    expect(q).toContain(": kontakt.zustaendig_id ? [kontakt.zustaendig_id] : await saGlockeLeitung(supabase);");
    expect(q).not.toContain("beraterKennung");
  });

  it("Reservierung unterschrieben: an den Zustaendigen, ohne ihn an die Leitung (05.10.2026)", () => {
    const q = lies("supabase/functions/finalize-reservierung/index.ts");
    expect(q).toContain("glockenEmpfaenger = (await zustaendigOderLeitung(supabase, kontaktId)) ?? await saGlockeLeitung(supabase);");
    expect(q).not.toContain('.in("role", ["admin", "inhaber", "vertriebsleiter"]);');
  });

  it("3: Termin verschoben oder abgesagt geht an den Zustaendigen, ohne Kontakt an den Kalenderbesitzer", () => {
    const q = lies("supabase/functions/send-buchung-aenderung/index.ts");
    expect(q).toContain("const zuKontakt = buchung.kontakt_id ? await zustaendigOderLeitung(supabase, buchung.kontakt_id) : null");
    expect(q).toContain("const empfaenger: string[] = zuKontakt ?? (buchung.mitarbeiter_id ? [buchung.mitarbeiter_id] : [])");
    expect(q).not.toContain("benutzer_id: buchung.mitarbeiter_id");
  });

  it("Follow-Up ueberfaellig: Ersteller nur, solange ihm der Kontakt gehoert", () => {
    const q = lies("supabase/functions/send-followup-overdue-nudges/index.ts");
    expect(q).toContain("entscheideMitRollen(supabase, fu.benutzer_id, kontakt.zustaendig_id || null)");
    expect(q).not.toContain("fu.benutzer_id || kontakt.zustaendig_id");
  });

  it("Reservierung unterschrieben: die Partner-Glocke nie ueber den Beraternamen", () => {
    const q = lies("supabase/functions/finalize-reservierung/index.ts");
    expect(q).not.toContain('.eq("name", kontakt.berater)');
  });

  it("Exposé und Objektuebersicht filtern fremde Partner", () => {
    for (const f of ["get-expose", "get-kundenansicht"]) {
      expect(lies(`supabase/functions/${f}/index.ts`)).toContain("await ohneFremdePartner(");
    }
  });
});

describe("Migration: Empfehlung als Dublette", () => {
  const PFAD = "supabase/migrations/20260929090000_glocke_nur_an_zustaendigen.sql";
  const sql = lies(PFAD);
  const funktion = (s: string) =>
    s.slice(s.indexOf("CREATE OR REPLACE FUNCTION public.create_empfehlung_kontakt("), s.indexOf("$$;", s.indexOf("RETURN jsonb_build_object(\n    'kontakt_id', _kontakt_id,\n    'empfehlung_id'")) + 3);

  it("gehoert die Dublette nicht dem Partner des Empfehlenden, geht die Glocke an die Leitung", () => {
    expect(sql).toContain("IF _duplicate_id IS NOT NULL AND _duplicate_zustaendig IS DISTINCT FROM _vp_id THEN\n    _glocke_an := NULL;");
    expect(sql).toContain("IF _glocke_an IS NOT NULL THEN");
  });

  it("der uebrige Rumpf ist wortgleich zu 20260928230000", () => {
    const vorlage = funktion(lies("supabase/migrations/20260928230000_glocke_ohne_zustaendigen_an_leitung.sql"));
    const neu = funktion(sql)
      .replace("  _duplicate_zustaendig uuid;\n  _glocke_an uuid;\n", "")
      .replace(", zustaendig_id INTO _duplicate_id, _duplicate_name, _duplicate_zustaendig", " INTO _duplicate_id, _duplicate_name")
      .replace(/  -- Neu am 29\.09\.2026:[\s\S]*?  IF _glocke_an IS NOT NULL THEN/, "  IF _vp_id IS NOT NULL THEN")
      .replace("      _glocke_an,\n", "      _vp_id,\n")
      .replace("        CASE WHEN _vp_id IS NOT NULL THEN 'Neue Empfehlung: Dublette prüfen'\n             ELSE 'Neue Empfehlung ohne Zuständigkeit' END,", "        'Neue Empfehlung ohne Zuständigkeit',");
    expect(neu).toBe(vorlage);
  });

  it("liegt solange offen im Eingangskorb, in der Sammeldatei und hat Pruefzeile 40.1", () => {
    const korb = join(WURZEL, "supabase/migrations-inbox/20260929090000_glocke_nur_an_zustaendigen.sql");
    if (!existsSync(korb)) return;
    expect(readFileSync(korb, "utf8")).toBe(sql);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(sql.trim());
    expect(lies("supabase/migrations-inbox/99_PRUEFUNG.sql")).toContain("'40.1 ");
  });
});

// ── Browser-Glocken ──────────────────────────────────────────────────────────

const cache = vi.hoisted(() => ({
  insert: vi.fn(),
  warteschlange: vi.fn(async () => ({ error: null })),
  tabellen: {} as Record<string, unknown[]>,
}));

vi.mock("./dataCache", () => ({
  cacheGet: (tabelle: string) => cache.tabellen[tabelle] ?? [],
  cacheInsert: cache.insert,
}));
vi.mock("./dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_s: string, standard: unknown) => standard,
  localSet: vi.fn(),
}));
vi.mock("./pushNotifications", () => ({ showPushNotification: vi.fn() }));
vi.mock("./userSettingsCache", () => ({ getUserSetting: (_k: string, standard: unknown) => standard }));
vi.mock("./currentUser", () => ({ getCurrentUserId: () => "u-backoffice" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: cache.warteschlange }) },
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));

import {
  notifyDokumenteVollstaendig,
  notifyLeadZugewiesen,
  scheduleNotarfotoReminders,
  scheduleSaFollowUpReminders,
} from "./bellNotifications";

const glockenAn = () => cache.insert.mock.calls
  .filter((c) => c[0] === "benachrichtigungen")
  .map((c) => (c[1] as { benutzer_id: string }).benutzer_id);
const geplantFuer = () => (cache.warteschlange.mock.calls as unknown as Array<[{ target_user_id: string }]>)
  .map((c) => c[0].target_user_id);

describe("Browser-Glocke mit veralteter Kennung", () => {
  beforeEach(() => {
    cache.insert.mockClear();
    cache.warteschlange.mockClear();
    cache.tabellen = {
      kontakte: [{ id: "k-1", zustaendig_id: "u-b" }, { id: "k-2", zustaendig_id: null }],
      user_roles: ROLLEN,
      benachrichtigungen: [],
    };
  });

  it("geht an den aktuellen Zustaendigen statt an den mitgereichten A", () => {
    notifyDokumenteVollstaendig("Kunde", "k-1", "u-a");
    expect(glockenAn()).toEqual(["u-b"]);
  });

  it("ohne Zustaendigen an die Leitung, nie an A", () => {
    notifyDokumenteVollstaendig("Kunde", "k-2", "u-a");
    expect(glockenAn().sort()).toEqual(["u-admin", "u-vl"]);
  });

  it("fehlt der Kontakt im Zwischenspeicher, gilt die mitgereichte Kennung", () => {
    notifyDokumenteVollstaendig("Kunde", "k-unbekannt", "u-a");
    expect(glockenAn()).toEqual(["u-a"]);
  });

  it("geplante Erinnerungen werden fuer den aktuellen Zustaendigen eingereiht", async () => {
    scheduleNotarfotoReminders("Kunde", "k-1", "2026-10-01", "10:00", "u-a");
    await Promise.resolve();
    expect(new Set(geplantFuer())).toEqual(new Set(["u-b"]));
  });

  it("SA-Nachfass: aktueller Zustaendiger, ohne ihn der Absender, nie ein frueherer Partner", async () => {
    scheduleSaFollowUpReminders("Kunde", "k-1", "inv-1", "u-a");
    scheduleSaFollowUpReminders("Kunde", "k-2", "inv-2", "u-a");
    await Promise.resolve();
    expect(geplantFuer()).toEqual(["u-b", "u-b", "u-backoffice", "u-backoffice"]);
  });

  it("'Neuer Lead zugewiesen' nur, wenn der Lead dem Partner jetzt gehoert", () => {
    notifyLeadZugewiesen("Kunde", "Partner A", "u-a", "k-1");
    expect(glockenAn()).toEqual([]);
    notifyLeadZugewiesen("Kunde", "Partner B", "u-b", "k-1");
    expect(glockenAn()).toEqual(["u-b"]);
  });
});

describe("3: Zustaendiger oder Leitung zu einem Termin", () => {
  const db = speicherDb({
    kontakte: [
      { id: "k-b", zustaendig_id: "u-b", geloescht: false },
      { id: "k-pool", zustaendig_id: null, geloescht: false },
      { id: "k-weg", zustaendig_id: "u-b", geloescht: true },
    ],
    user_roles: ROLLEN,
  });

  it("Kontakt bei B: B, nicht der Kalenderbesitzer", async () => {
    expect(await zustaendigOderLeitung(db, "k-b")).toEqual(["u-b"]);
  });

  it("Kontakt ohne Zustaendigen: die Leitung", async () => {
    expect((await zustaendigOderLeitung(db, "k-pool"))?.sort()).toEqual(["u-admin", "u-vl"]);
  });

  it("geloeschter oder fehlender Kontakt: null, dann bleibt es beim Kalenderbesitzer", async () => {
    expect(await zustaendigOderLeitung(db, "k-weg")).toBeNull();
    expect(await zustaendigOderLeitung(db, "k-gibtsnicht")).toBeNull();
  });
});

describe("2: Glocken-Kopien an die Vertretung bleiben (Christian, 29.09.2026)", () => {
  it("die Migration fasst den Vertretungs-Trigger nicht an", () => {
    const sql = lies("supabase/migrations/20260929090000_glocke_nur_an_zustaendigen.sql");
    expect(sql).not.toMatch(/DROP TRIGGER[^;]*trg_benachrichtigung_an_vertretung/);
    expect(sql).not.toMatch(/DROP FUNCTION/);
    expect(lies("supabase/migrations-inbox/99_PRUEFUNG.sql")).toContain("'40.2 Vertretung bekommt weiter Glocken-Kopien");
  });

  it("keine spaetere Migration entfernt den Trigger", () => {
    const spaeter = readdirSync(join(WURZEL, "supabase/migrations"))
      .filter((f) => f > "20260929090000")
      .filter((f) => /DROP TRIGGER[^;]*trg_benachrichtigung_an_vertretung/.test(lies(`supabase/migrations/${f}`)));
    expect(spaeter).toEqual([]);
  });
});

describe("Setterin uebergibt auf der Kundenseite", () => {
  const q = lies("src/pages/KundenDetail.tsx");
  const rumpf = q.slice(q.indexOf("const handleSetterSave = async () => {"), q.indexOf("const findeSetterBerater"));

  it("setzt die Zustaendigkeit ueber die Kennung", () => {
    expect(rumpf).toContain("if (beraterUser) saveData.zustaendig_id = beraterUser.id;");
  });

  it("wartet aufs Speichern, meldet eine Ablehnung im Projektstil und laeutet erst danach", () => {
    const speichern = rumpf.indexOf("gespeichert = await updateKontakt(id, saveData);");
    expect(speichern).toBeGreaterThan(0);
    expect(rumpf.indexOf("await hinweisDialog({")).toBeGreaterThan(speichern);
    expect(rumpf.indexOf("notifyLeadZugewiesen(")).toBeGreaterThan(speichern);
  });
});
