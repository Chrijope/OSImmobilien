/**
 * Wer darf das Kundenportal eines Kontakts sperren, entsperren und die
 * Einladung erneut versenden?
 *
 * Die Regel liegt in `supabase/functions/_shared/kundenportal-recht.ts`, der
 * Ablauf des Sperrens in `supabase/functions/kundenportal-sperre/ablauf.ts`.
 * Geprüft werden beide hier, denn die Edge Functions selbst laufen unter Deno
 * und kommen im Testlauf nicht vor. Dazu kommen Quelltextprüfungen an
 * `invite-user` und `secure-login`.
 *
 * Anlass: Christians Freigabe vom 23.09.2026. Vorher entschied allein die
 * Rolle, jeder interne Nutzer konnte sperren und jeder Partner für jeden
 * Kontakt einladen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  entscheideKundenportalRecht,
  fehltDatenbankfunktion,
  kontenDesKontakts,
  pruefeKundenportalRecht,
  KUNDENPORTAL_ABGELEHNT,
  type PortalKontakt,
} from "../../supabase/functions/_shared/kundenportal-recht.ts";
import { portalSperreSetzen, SPERRDAUER } from "../../supabase/functions/kundenportal-sperre/ablauf.ts";

const KONTAKT_ID = "11111111-1111-1111-1111-111111111111";
const PARTNER_ID = "22222222-2222-2222-2222-222222222222";
const FREMDER_ID = "33333333-3333-3333-3333-333333333333";
const ADMIN_ID = "44444444-4444-4444-4444-444444444444";
const KUNDE_ID = "55555555-5555-5555-5555-555555555555";
const PERSON2_ID = "66666666-6666-6666-6666-666666666666";

function kontakt(ueber: Partial<PortalKontakt> = {}): PortalKontakt {
  return {
    id: KONTAKT_ID,
    zustaendig_id: PARTNER_ID,
    meta: { authUserId: KUNDE_ID, person2: { authUserId: PERSON2_ID } },
    ...ueber,
  };
}

describe("Regel: wer das Kundenportal verwalten darf", () => {
  it("der zuständige Vertriebspartner ja", () => {
    expect(entscheideKundenportalRecht({ aufruferId: PARTNER_ID, rollen: ["vertriebspartner"], kontakt: kontakt() })).toBe(true);
  });

  it("ein fremder Vertriebspartner nein", () => {
    expect(entscheideKundenportalRecht({ aufruferId: FREMDER_ID, rollen: ["vertriebspartner"], kontakt: kontakt() })).toBe(false);
  });

  it("ein Vertriebsleiter ohne eigene Zuständigkeit nein", () => {
    expect(entscheideKundenportalRecht({ aufruferId: FREMDER_ID, rollen: ["vertriebsleiter"], kontakt: kontakt() })).toBe(false);
  });

  it("Backoffice und andere interne Rollen nein", () => {
    for (const rolle of ["backoffice", "buchhaltung", "hausverwaltung", "setterin", "finanzierungspartner"]) {
      expect(entscheideKundenportalRecht({ aufruferId: FREMDER_ID, rollen: [rolle], kontakt: kontakt() })).toBe(false);
    }
  });

  it("Admin und Inhaber ja, auch ohne Zuständigkeit", () => {
    expect(entscheideKundenportalRecht({ aufruferId: ADMIN_ID, rollen: ["admin"], kontakt: kontakt() })).toBe(true);
    expect(entscheideKundenportalRecht({ aufruferId: ADMIN_ID, rollen: ["inhaber"], kontakt: kontakt() })).toBe(true);
  });

  it("der Kunde selbst nein", () => {
    expect(entscheideKundenportalRecht({ aufruferId: KUNDE_ID, rollen: ["kunde"], kontakt: kontakt() })).toBe(false);
  });

  it("Tippgeber und Setterin nie, auch nicht als Ersteller oder eingetragene Zuständige (04.10.2026)", () => {
    const angelegt = kontakt({ zustaendig_id: null, meta: { erstelltVonId: PARTNER_ID } });
    for (const rolle of ["tippgeber", "setterin"]) {
      expect(entscheideKundenportalRecht({ aufruferId: PARTNER_ID, rollen: [rolle], kontakt: angelegt })).toBe(false);
      expect(entscheideKundenportalRecht({ aufruferId: PARTNER_ID, rollen: [rolle], kontakt: kontakt() })).toBe(false);
    }
  });

  it("eine heute laufende Vertretung des Zuständigen ja, mit Partnerrolle", () => {
    expect(entscheideKundenportalRecht({ aufruferId: FREMDER_ID, rollen: ["vertriebspartner"], kontakt: kontakt(), vertretungAktiv: true })).toBe(true);
    expect(entscheideKundenportalRecht({ aufruferId: FREMDER_ID, rollen: ["tippgeber"], kontakt: kontakt(), vertretungAktiv: true })).toBe(false);
  });

  it("ohne zustaendig_id zählt, wer den Kontakt angelegt hat, sonst niemand", () => {
    const ohne = kontakt({ zustaendig_id: null, meta: { erstelltVonId: PARTNER_ID } });
    expect(entscheideKundenportalRecht({ aufruferId: PARTNER_ID, rollen: ["vertriebspartner"], kontakt: ohne })).toBe(true);
    expect(entscheideKundenportalRecht({ aufruferId: FREMDER_ID, rollen: ["vertriebspartner"], kontakt: ohne })).toBe(false);
  });

  it("steht zustaendig_id, hilft das Anlegen allein nicht", () => {
    const umgehaengt = kontakt({ zustaendig_id: PARTNER_ID, meta: { erstelltVonId: FREMDER_ID } });
    expect(entscheideKundenportalRecht({ aufruferId: FREMDER_ID, rollen: ["vertriebspartner"], kontakt: umgehaengt })).toBe(false);
  });

  it("ohne Kontakt oder Kennung nie", () => {
    expect(entscheideKundenportalRecht({ aufruferId: PARTNER_ID, rollen: ["vertriebspartner"], kontakt: null })).toBe(false);
    expect(entscheideKundenportalRecht({ aufruferId: "", rollen: ["admin"], kontakt: kontakt() })).toBe(false);
  });
});

/**
 * Service-Role-Client zum Mitschreiben. Rollen und Kontakt stehen fest, die
 * Antworten der Datenbankfunktionen lassen sich je Name vorgeben.
 */
function dienst(optionen: {
  /** Rollen des Aufrufers. */
  rollen?: string[];
  kontakt?: PortalKontakt | null;
  rpc?: Record<string, { data: unknown; error: unknown }>;
  /** Rollen je Konto; Person 1 und 2 tragen sonst nur "kunde". */
  kontoRollen?: Record<string, string[]>;
  banFehler?: Record<string, unknown>;
  rollenFehler?: unknown;
  /** Zeilen in abwesenheiten. */
  abwesenheiten?: Array<{ user_id: string; vertretung_id: string; von: string; bis: string }>;
} = {}) {
  const aufrufe = {
    rpc: [] as Array<[string, Record<string, unknown>]>,
    ban: [] as Array<[string, { ban_duration: string }]>,
    audit: [] as Array<Record<string, unknown>>,
  };
  const client = {
    from: (tabelle: string) => ({
      select: () => {
        const filter: Record<string, unknown> = {};
        const kette = {
          eq: (feld: string, wert: unknown) => {
            filter[feld] = wert;
            return kette;
          },
          maybeSingle: async () => ({ data: optionen.kontakt === undefined ? kontakt() : optionen.kontakt, error: null }),
          then: (fertig: (r: { data: unknown; error: unknown }) => unknown) => {
            if (tabelle === "abwesenheiten") {
              return Promise.resolve(fertig({
                data: (optionen.abwesenheiten ?? []).filter((a) => a.user_id === filter.user_id && a.vertretung_id === filter.vertretung_id),
                error: null,
              }));
            }
            const id = String(filter.user_id);
            const rollen = optionen.kontoRollen?.[id]
              ?? ([KUNDE_ID, PERSON2_ID].includes(id) ? ["kunde"] : (optionen.rollen ?? []));
            return Promise.resolve(fertig({
              data: optionen.rollenFehler ? null : rollen.map((role) => ({ role })),
              error: optionen.rollenFehler ?? null,
            }));
          },
        };
        return kette;
      },
      insert: async (zeile: Record<string, unknown>) => {
        aufrufe.audit.push(zeile);
        return { error: null };
      },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      aufrufe.rpc.push([name, args]);
      return optionen.rpc?.[name] ?? { data: { authUserId: KUNDE_ID, person2: { authUserId: PERSON2_ID }, portalGesperrt: true }, error: null };
    },
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: { ban_duration: string }) => {
          aufrufe.ban.push([id, attrs]);
          return { error: optionen.banFehler?.[id] ?? null };
        },
      },
    },
  };
  return { client, aufrufe };
}

describe("pruefeKundenportalRecht: lädt und entscheidet", () => {
  it("lehnt einen fremden Partner mit 403 und dem festen Text ab", async () => {
    const { client } = dienst({ rollen: ["vertriebspartner"] });
    const ergebnis = await pruefeKundenportalRecht(client, FREMDER_ID, KONTAKT_ID);
    expect(ergebnis).toMatchObject({ erlaubt: false, status: 403, grund: KUNDENPORTAL_ABGELEHNT });
  });

  it("lässt den zuständigen Partner durch", async () => {
    const { client } = dienst({ rollen: ["vertriebspartner"] });
    expect((await pruefeKundenportalRecht(client, PARTNER_ID, KONTAKT_ID)).erlaubt).toBe(true);
  });

  it("lässt die heutige Vertretung des Zuständigen durch, eine abgelaufene nicht", async () => {
    const { heuteInBerlin } = await import("../../supabase/functions/_shared/kundenportal-recht.ts");
    const heute = heuteInBerlin();
    const laufend = dienst({ rollen: ["vertriebspartner"], abwesenheiten: [{ user_id: PARTNER_ID, vertretung_id: FREMDER_ID, von: heute, bis: heute }] });
    expect((await pruefeKundenportalRecht(laufend.client, FREMDER_ID, KONTAKT_ID)).erlaubt).toBe(true);
    const vorbei = dienst({ rollen: ["vertriebspartner"], abwesenheiten: [{ user_id: PARTNER_ID, vertretung_id: FREMDER_ID, von: "2026-01-01", bis: "2026-01-02" }] });
    expect((await pruefeKundenportalRecht(vorbei.client, FREMDER_ID, KONTAKT_ID)).erlaubt).toBe(false);
  });

  it("lässt Admin durch", async () => {
    const { client } = dienst({ rollen: ["admin"] });
    expect((await pruefeKundenportalRecht(client, ADMIN_ID, KONTAKT_ID)).erlaubt).toBe(true);
  });

  it("gibt einem unbekannten Kontakt dieselbe Ablehnung wie einem fremden, auch für Admin", async () => {
    const { client } = dienst({ rollen: ["admin"], kontakt: null });
    expect(await pruefeKundenportalRecht(client, ADMIN_ID, KONTAKT_ID)).toMatchObject({ erlaubt: false, status: 403, grund: KUNDENPORTAL_ABGELEHNT });
  });

  it("wertet eine nicht lesbare Rolle als nicht erlaubt", async () => {
    const { client } = dienst({ rollenFehler: { message: "boom" } });
    expect(await pruefeKundenportalRecht(client, ADMIN_ID, KONTAKT_ID)).toMatchObject({ erlaubt: false, status: 500 });
  });

  it("lehnt eine Kennung ab, die keine ist", async () => {
    const { client } = dienst({ rollen: ["admin"] });
    expect((await pruefeKundenportalRecht(client, ADMIN_ID, "kein-kontakt")).erlaubt).toBe(false);
  });
});

describe("kundenportal-sperre: der Ablauf", () => {
  it("fremder Partner: 403, nichts geschrieben, kein Konto angefasst", async () => {
    const { client, aufrufe } = dienst({ rollen: ["vertriebspartner"] });
    const ergebnis = await portalSperreSetzen(client, FREMDER_ID, KONTAKT_ID, true);
    expect(ergebnis.status).toBe(403);
    expect(ergebnis.rumpf.error).toBe(KUNDENPORTAL_ABGELEHNT);
    expect(aufrufe.rpc).toEqual([]);
    expect(aufrufe.ban).toEqual([]);
  });

  it("zuständiger Partner: schreibt die Sperre und sperrt beide Anmeldekonten", async () => {
    const { client, aufrufe } = dienst({ rollen: ["vertriebspartner"] });
    const ergebnis = await portalSperreSetzen(client, PARTNER_ID, KONTAKT_ID, true);
    expect(ergebnis.status).toBe(200);
    expect(ergebnis.rumpf).toMatchObject({ ok: true, gesperrt: true, datenbanksperre: true, anmeldungGeaendert: 2, anmeldungFehler: 0 });
    expect(aufrufe.rpc[0]).toEqual(["kundenportal_sperre_schreiben", { _kontakt_id: KONTAKT_ID, _gesperrt: true, _von: PARTNER_ID }]);
    expect(aufrufe.ban).toEqual([
      [KUNDE_ID, { ban_duration: SPERRDAUER }],
      [PERSON2_ID, { ban_duration: SPERRDAUER }],
    ]);
    expect(aufrufe.audit[0]).toMatchObject({ action: "kundenportal_gesperrt", entity_id: KONTAKT_ID, actor: PARTNER_ID });
  });

  it("Admin: entsperrt und gibt die Anmeldung wieder frei", async () => {
    const { client, aufrufe } = dienst({
      rollen: ["admin"],
      rpc: { kundenportal_sperre_schreiben: { data: { authUserId: KUNDE_ID, portalGesperrt: false }, error: null } },
    });
    const ergebnis = await portalSperreSetzen(client, ADMIN_ID, KONTAKT_ID, false);
    expect(ergebnis.status).toBe(200);
    expect(aufrufe.ban).toEqual([[KUNDE_ID, { ban_duration: "none" }]]);
  });

  it("ein Konto mit interner Rolle wird nie gesperrt", async () => {
    const { client, aufrufe } = dienst({ rollen: ["admin"], kontoRollen: { [KUNDE_ID]: ["kunde", "backoffice"] } });
    const ergebnis = await portalSperreSetzen(client, ADMIN_ID, KONTAKT_ID, true);
    expect(aufrufe.ban.map(([id]) => id)).toEqual([PERSON2_ID]);
    expect(ergebnis.rumpf).toMatchObject({ anmeldungUebersprungen: 1, anmeldungGeaendert: 1 });
  });

  it("Person 2 mit eigener Tippgeberrolle wird nicht global gesperrt (04.10.2026)", async () => {
    const { client, aufrufe } = dienst({ rollen: ["admin"], kontoRollen: { [PERSON2_ID]: ["kunde", "tippgeber"] } });
    const ergebnis = await portalSperreSetzen(client, ADMIN_ID, KONTAKT_ID, true);
    expect(aufrufe.ban.map(([id]) => id)).toEqual([KUNDE_ID]);
    expect(ergebnis.rumpf).toMatchObject({ anmeldungUebersprungen: 1, anmeldungGeaendert: 1 });
  });

  it("nicht lesbare Rollen eines Kontos: Konto bleibt unberührt, Fehler wird gemeldet", async () => {
    const { client, aufrufe } = dienst({ rollen: ["admin"] });
    // Rollen des Aufrufers lesbar, die der Konten nicht: über kontoRollen nicht abbildbar,
    // deshalb hier über einen Rollenfehler nach der Rechtepruefung simuliert.
    const original = client.from;
    let aufruf = 0;
    client.from = ((t: string) => {
      if (t === "user_roles" && aufruf++ > 0) {
        return { select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: "weg" } }) }) } as never;
      }
      return original(t);
    }) as typeof client.from;
    const ergebnis = await portalSperreSetzen(client, ADMIN_ID, KONTAKT_ID, true);
    expect(aufrufe.ban).toEqual([]);
    expect(ergebnis.rumpf).toMatchObject({ anmeldungFehler: 2 });
  });

  it("ohne Migration: schreibt den Anzeigewert über merge_kontakt_meta und sperrt trotzdem die Anmeldung", async () => {
    const { client, aufrufe } = dienst({
      rollen: ["vertriebspartner"],
      rpc: {
        kundenportal_sperre_schreiben: { data: null, error: { code: "PGRST202", message: "Could not find the function" } },
        merge_kontakt_meta: { data: { authUserId: KUNDE_ID, portalGesperrt: true }, error: null },
      },
    });
    const ergebnis = await portalSperreSetzen(client, PARTNER_ID, KONTAKT_ID, true, () => "2026-09-23T18:00:00.000Z");
    expect(ergebnis.rumpf).toMatchObject({ ok: true, datenbanksperre: false, anmeldungGeaendert: 1 });
    expect(aufrufe.rpc[1]).toEqual(["merge_kontakt_meta", {
      _kontakt_id: KONTAKT_ID,
      _updates: { portalGesperrt: true, portalGesperrtAt: "2026-09-23T18:00:00.000Z" },
    }]);
  });

  it("ein anderer Datenbankfehler bricht ab, bevor ein Konto angefasst wird", async () => {
    const { client, aufrufe } = dienst({
      rollen: ["admin"],
      rpc: { kundenportal_sperre_schreiben: { data: null, error: { code: "XX000", message: "kaputt" } } },
    });
    const ergebnis = await portalSperreSetzen(client, ADMIN_ID, KONTAKT_ID, true);
    expect(ergebnis.status).toBe(500);
    expect(aufrufe.ban).toEqual([]);
  });

  it("meldet eine nicht gesetzte Anmeldesperre ausdrücklich", async () => {
    const { client } = dienst({ rollen: ["admin"], banFehler: { [PERSON2_ID]: { message: "User not found" } } });
    const ergebnis = await portalSperreSetzen(client, ADMIN_ID, KONTAKT_ID, true);
    expect(ergebnis.status).toBe(200);
    expect(ergebnis.rumpf).toMatchObject({ anmeldungGeaendert: 1, anmeldungFehler: 1, anmeldungFehlerGrund: "User not found" });
  });

  it("verlangt einen echten Sperrstand und eine Kontaktkennung", async () => {
    const { client } = dienst({ rollen: ["admin"] });
    expect((await portalSperreSetzen(client, ADMIN_ID, KONTAKT_ID, "ja")).status).toBe(400);
    expect((await portalSperreSetzen(client, ADMIN_ID, "x", true)).status).toBe(400);
  });
});

describe("Hilfen", () => {
  it("findet die Konten von Person 1 und 2, ohne Doppel und ohne Unsinn", () => {
    expect(kontenDesKontakts({ authUserId: KUNDE_ID, person2: { authUserId: PERSON2_ID } })).toEqual([KUNDE_ID, PERSON2_ID]);
    expect(kontenDesKontakts({ authUserId: KUNDE_ID, person2: { authUserId: KUNDE_ID } })).toEqual([KUNDE_ID]);
    expect(kontenDesKontakts({ authUserId: "abc" })).toEqual([]);
    expect(kontenDesKontakts(null)).toEqual([]);
  });

  it("erkennt eine fehlende Datenbankfunktion", () => {
    expect(fehltDatenbankfunktion({ code: "PGRST202" })).toBe(true);
    expect(fehltDatenbankfunktion({ code: "42883" })).toBe(true);
    expect(fehltDatenbankfunktion({ message: "Could not find the function public.x in the schema cache" })).toBe(true);
    expect(fehltDatenbankfunktion({ code: "42501", message: "Not authorized" })).toBe(false);
    expect(fehltDatenbankfunktion(null)).toBe(false);
  });
});

const WURZEL = join(__dirname, "..", "..");
const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

describe("invite-user: Einladung nur durch Zuständige", () => {
  const quelle = lies("supabase/functions/invite-user/index.ts");

  it("prüft die Zuständigkeit, sobald eine kontaktId mitkommt, und vor dem Anlegen eines Kontos", () => {
    const pruefung = quelle.indexOf("pruefeKundenportalRecht(adminClient, caller.id, kontaktId)");
    expect(pruefung).toBeGreaterThan(-1);
    expect(pruefung).toBeLessThan(quelle.indexOf("const existingUser = await findUserByEmail(email)"));
    expect(pruefung).toBeLessThan(quelle.indexOf("auth.admin.createUser("));
    expect(quelle).toMatch(/if \(!recht\.erlaubt\)[\s\S]{0,300}status: recht\.status \?\? 403/);
  });

  it("hebt beim Einladen keine Portalsperre mehr auf", () => {
    expect(quelle).not.toMatch(/portalGesperrt:\s*false/);
  });
});

describe("secure-login: gesperrter Zugang", () => {
  const quelle = lies("supabase/functions/secure-login/index.ts");

  it("meldet eine gesperrte Anmeldung als zugang_gesperrt und nicht als Fehlversuch", () => {
    expect(quelle).toContain("'user_banned'");
    expect(quelle).toContain("error: 'zugang_gesperrt'");
    // Die Sperre wird erkannt, bevor ein Fehlversuch gezählt wird.
    expect(quelle.indexOf("if (gesperrt) return zugangGesperrtAntwort()"))
      .toBeLessThan(quelle.indexOf("_success: false"));
  });

  it("beendet die Sitzung eines gesperrten Kunden, dessen Anmeldung noch offen war", () => {
    expect(quelle).toMatch(/rpc\('kunde_portal_gesperrt'[\s\S]{0,300}auth\.admin\.signOut\(signInData\.session\.access_token\)/);
  });
});
