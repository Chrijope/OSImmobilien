import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startrollenSetzen } from "../../supabase/functions/_shared/startrolle.ts";

/**
 * Registrierung ohne Rollenwahl (04.10.2026). Bis dahin vergab der Trigger
 * handle_new_user die Rolle aus raw_user_meta_data, die bei der
 * Selbstregistrierung der Browser setzt: Jeder konnte sich per signUp mit
 * data.role = 'admin' ein Admin-Konto anlegen. Dazu: send-recovery in
 * invite-user entfernt, Links nur noch von einer festen Basisadresse,
 * testRecipient der Wochenberichte nur mit Dienstschluessel.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

const ROLLE_DATEI = "20261004120000_registrierung_ohne_rollenwahl.sql";
const CRON_DATEI = "20261004110000_wochenberichte_geheimwort.sql";
const ROLLE_SQL = lies(`supabase/migrations/${ROLLE_DATEI}`);
const CRON_SQL = lies(`supabase/migrations/${CRON_DATEI}`);

/** Kleiner Ersatz fuer den Supabase-Client, nur user_roles. */
function falscheDatenbank(start: string[]) {
  const rollen = new Set(start);
  const client = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: [...rollen].map((role) => ({ role })), error: null }) }),
      insert: async (zeilen: { role: string }[]) => {
        for (const z of zeilen) rollen.add(z.role);
        return { error: null };
      },
      delete: () => ({
        eq: () => ({
          eq: async (_spalte: string, wert: string) => {
            rollen.delete(wert);
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { client, rollen };
}

describe("startrollenSetzen", () => {
  it("ersetzt die Rueckfallrolle kunde durch die gewuenschte Rolle", async () => {
    const { client, rollen } = falscheDatenbank(["kunde"]);
    await startrollenSetzen(client, "u1", ["vertriebspartner"]);
    expect([...rollen]).toEqual(["vertriebspartner"]);
  });

  it("laesst kunde stehen, wenn kunde gewuenscht ist", async () => {
    const { client, rollen } = falscheDatenbank(["kunde"]);
    await startrollenSetzen(client, "u1", ["kunde"]);
    expect([...rollen]).toEqual(["kunde"]);
  });

  it("traegt mehrere Rollen ein und doppelt nichts (alter Trigger setzte schon die Hauptrolle)", async () => {
    const { client, rollen } = falscheDatenbank(["admin"]);
    await startrollenSetzen(client, "u1", ["admin", "backoffice", "admin"]);
    expect([...rollen].sort()).toEqual(["admin", "backoffice"]);
  });

  it("bricht ohne Rolle ab", async () => {
    const { client } = falscheDatenbank([]);
    await expect(startrollenSetzen(client, "u1", [])).rejects.toThrow();
  });
});

describe("Migration registrierung_ohne_rollenwahl", () => {
  // Nur der Rumpf, der Kommentarkopf nennt die alte Fassung.
  const rumpf = ROLLE_SQL.slice(
    ROLLE_SQL.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user()"),
    ROLLE_SQL.indexOf("\n$$;") + 4,
  );

  it("liest die Rolle nur aus raw_app_meta_data, Rueckfall kunde", () => {
    expect(rumpf).toContain("(NEW.raw_app_meta_data ->> 'role')::app_role,\n      'kunde'::app_role");
    expect(rumpf).not.toContain("raw_user_meta_data ->> 'role'");
    expect(rumpf).toContain("COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email)");
  });

  it("bleibt SECURITY DEFINER mit festem search_path und aendert keine Daten", () => {
    expect(ROLLE_SQL).toContain("SECURITY DEFINER\nSET search_path = public");
    expect(ROLLE_SQL).not.toMatch(/^\s*(UPDATE|DELETE|DROP|TRUNCATE)\b/im);
    expect(ROLLE_SQL).toContain("REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;");
  });

  it("nennt die Reihenfolge: erst Functions, dann Migration", () => {
    expect(ROLLE_SQL).toContain("ERST DIE FUNCTIONS, DANN DIESE MIGRATION");
  });
});

describe("Konto-Functions setzen die Rolle selbst", () => {
  for (const fn of ["invite-user", "setup-admin", "create-test-accounts"]) {
    it(`${fn}: app_metadata und startrollenSetzen direkt nach createUser`, () => {
      const code = lies(`supabase/functions/${fn}/index.ts`);
      expect(code).toContain('from "../_shared/startrolle.ts"');
      expect(code).toMatch(/app_metadata: \{ role/);
      const anlage = code.indexOf("auth.admin.createUser(");
      expect(anlage).toBeGreaterThan(-1);
      expect(code.indexOf("startrollenSetzen(adminClient", anlage)).toBeGreaterThan(anlage);
    });
  }

  it("invite-user setzt die Rolle vor der Aktivierungsmail", () => {
    const code = lies("supabase/functions/invite-user/index.ts");
    const anlage = code.indexOf("auth.admin.createUser(");
    expect(code.indexOf("startrollenSetzen(adminClient, newUser.user.id, requestedRoles)", anlage))
      .toBeLessThan(code.indexOf("sendActivationEmail({ userId: newUser.user.id, isExistingUser: false })"));
  });
});

describe("invite-user: kein Recovery-Link, feste Basisadresse", () => {
  const code = lies("supabase/functions/invite-user/index.ts");

  it("gibt keinen Anmeldelink mehr heraus", () => {
    expect(code).not.toContain("generateLink");
    expect(code).not.toContain("actionLink");
    expect(code).not.toContain("redirectUrl");
  });

  it("baut Links nicht aus dem Origin-Kopf", () => {
    expect(code).not.toMatch(/headers\.get\(["']origin["']\)/i);
    expect(code).toContain('Deno.env.get("APP_BASE_URL") || "https://portal.more.immo"');
  });

  it("das Frontend ruft send-recovery nicht auf", () => {
    for (const datei of ["src/components/kunde/AlsTippgeberAnlegenButton.tsx", "src/components/bewerbung/AktivierungTab.tsx"]) {
      expect(lies(datei)).not.toContain("send-recovery");
    }
  });
});

describe("Wochenberichte: Automatikschutz und testRecipient nur mit Dienstschluessel", () => {
  for (const fn of ["send-weekly-summary", "send-weekly-vp-summary"]) {
    it(fn, () => {
      const code = lies(`supabase/functions/${fn}/index.ts`);
      const schutz = code.indexOf(`automatikSchutz(req, '${fn}', corsHeaders)`);
      expect(schutz).toBeGreaterThan(-1);
      expect(schutz).toBeLessThan(code.indexOf("await req.json()"));
      expect(code).toContain("if (mitServiceKey) testRecipient = b.testRecipient.trim()");
      expect(code).toContain("=== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`");
    });
  }

  it("die Cron-Migration stellt genau diese beiden Zeitplaene um", () => {
    expect(CRON_SQL).toContain("_funktionen text[] := ARRAY[\n    'send-weekly-summary',\n    'send-weekly-vp-summary'\n  ];");
    expect(CRON_SQL).toContain("jsonb_build_object(''x-internal-secret'', public.automatik_geheimnis())");
  });
});

describe("Eingangskorb", () => {
  it("hat die Pruefzeilen 57.1 und 58.1, nur die letzte Zeile endet mit Semikolon", () => {
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    expect(pruefung).toContain("SELECT '57.1 ");
    expect(pruefung).toContain("SELECT '58.1 handle_new_user liest raw_app_meta_data, nicht raw_user_meta_data'");
    expect(pruefung.trimEnd().endsWith(";")).toBe(true);
    expect(pruefung.indexOf("SELECT '57.1 ")).toBeLessThan(pruefung.indexOf("SELECT '58.1 "));
  });

  it("beide Teile liegen, solange offen, im Korb und in der Sammeldatei, Wochenberichte zuerst", () => {
    const sammel = lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql");
    for (const [datei, sql] of [[CRON_DATEI, CRON_SQL], [ROLLE_DATEI, ROLLE_SQL]]) {
      const korb = `supabase/migrations-inbox/${datei}`;
      if (!existsSync(korb)) continue;
      expect(lies(korb)).toBe(sql);
      expect(sammel).toContain(sql.trim());
    }
    if (existsSync(`supabase/migrations-inbox/${ROLLE_DATEI}`) && existsSync(`supabase/migrations-inbox/${CRON_DATEI}`)) {
      expect(sammel.indexOf(CRON_SQL.trim())).toBeLessThan(sammel.indexOf(ROLLE_SQL.trim()));
    }
  });
});
