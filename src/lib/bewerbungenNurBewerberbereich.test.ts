import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BEWERBERPROZESS_ROLLEN, BEWERBERPROZESS_ROUTE } from "@/lib/bewerberprozessFreigabe";
import { kannBewerberVerwalten } from "@/lib/bewerberRechte";
import { BEWERBER_ROLLEN, darfBewerberbereich } from "../../supabase/functions/_shared/bewerber-rollen.ts";

/**
 * Bewerbungen nur noch für hr, admin, inhaber und backoffice (27.09.2026).
 *
 * Geprüft wird an drei Stellen, die dieselbe Liste tragen: Routenschutz im
 * Browser, Edge Functions und die Migration mit den Regeln der Datenbank.
 * Die Migration lässt sich hier nicht ausführen, ihr Quelltext hält die
 * Grenze fest.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { isUrlAllowedForRole, istRouteGesperrt } = await import("@/lib/sidebarPermissions");

const VIER = ["hr", "admin", "inhaber", "backoffice"];
const DRAUSSEN = [
  "vertriebspartner",
  "vertriebsleiter",
  "setterin",
  "buchhaltung",
  "marketing",
  "objektpartner",
  "finanzierungspartner",
  "hausverwaltung",
  "versicherungsexperte",
  "individuell",
  "testaccount",
  "kunde",
  "tippgeber",
];

describe("Routenschutz Bewerberprozess je Rolle", () => {
  it("oeffnet Bereich, Unterseiten und alte Adresse fuer die vier Rollen", () => {
    for (const rolle of VIER) {
      for (const url of [BEWERBERPROZESS_ROUTE, `${BEWERBERPROZESS_ROUTE}/abc`, "/bewerbungsmanagement"]) {
        expect(istRouteGesperrt(url, rolle as never), `${rolle} ${url}`).toBe(false);
        expect(isUrlAllowedForRole(url, rolle as never), `${rolle} ${url}`).toBe(true);
      }
    }
  });

  it("sperrt jede andere Rolle, auch mit eigener Berechtigung", () => {
    for (const rolle of DRAUSSEN) {
      for (const url of [BEWERBERPROZESS_ROUTE, `${BEWERBERPROZESS_ROUTE}/abc`, "/bewerbungsmanagement"]) {
        expect(isUrlAllowedForRole(url, rolle as never, [url]), `${rolle} ${url}`).toBe(false);
        expect(istRouteGesperrt(url, rolle as never), `${rolle} ${url}`).toBe(true);
      }
    }
  });

  it("laesst das Bearbeiten an denselben vier Rollen haengen", () => {
    for (const rolle of VIER) expect(kannBewerberVerwalten(rolle), rolle).toBe(true);
    for (const rolle of DRAUSSEN) expect(kannBewerberVerwalten(rolle), rolle).toBe(false);
  });
});

describe("Edge Functions", () => {
  it("tragen dieselbe Rollenliste wie der Browser", () => {
    expect([...BEWERBER_ROLLEN]).toEqual([...BEWERBERPROZESS_ROLLEN]);
    expect([...BEWERBER_ROLLEN].sort()).toEqual([...VIER].sort());
  });

  it("lassen nur die vier Rollen durch, ein Lesefehler zaehlt als nein", async () => {
    const client = (rollen: string[] | null, error: unknown = null) => ({
      from: () => ({ select: () => ({ eq: async () => ({ data: rollen?.map((role) => ({ role })) ?? null, error }) }) }),
    });
    for (const rolle of VIER) expect(await darfBewerberbereich(client([rolle]), "u1"), rolle).toBe(true);
    expect(await darfBewerberbereich(client(["vertriebspartner", "backoffice"]), "u1")).toBe(true);
    for (const rolle of DRAUSSEN) expect(await darfBewerberbereich(client([rolle]), "u1"), rolle).toBe(false);
    expect(await darfBewerberbereich(client(["hr"], new Error("weg")), "u1")).toBe(false);
    expect(await darfBewerberbereich(client(["hr"]), "")).toBe(false);
  });

  it("pruefen die Rolle ueber die gemeinsame Liste, ohne eigene Kopie", () => {
    for (const fn of [
      "send-bewerber-kennenlernen",
      "send-bewerber-nachfass",
      "send-bewerber-formular",
      "send-vertrag-signature",
    ]) {
      const code = readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
      expect(code, fn).toContain('from "../_shared/bewerber-rollen.ts"');
      expect(code, fn).toMatch(/darfBewerberbereich\((admin|rollenLeser), caller\.id\)/);
      expect(code, fn).not.toContain("ERLAUBTE_ROLLEN");
    }
  });
});

const DATEI = "20260927060000_bewerbungen_nur_bewerberbereich.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
/** Nur die ausführbaren Zeilen, ohne die Erklärungen. */
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

/** Der Text einer Regel, vom CREATE bis zum Semikolon. */
function regel(name: string): string {
  const start = CODE.indexOf(`CREATE POLICY "${name}"`);
  expect(start, name).toBeGreaterThan(-1);
  return CODE.slice(start, CODE.indexOf(";", start));
}

describe(`Migration ${DATEI}`, () => {
  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und im README", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (!existsSync(korb)) return;
    expect(readFileSync(korb, "utf8")).toBe(SQL);
    const sammel = readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8");
    expect(sammel).toContain(SQL.trim());
    expect(sammel).toContain(`-- Teil 4: ${DATEI}`);
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("25.2 ");
  });

  it("kennt genau die vier Rollen, wie Browser und Functions", () => {
    const liste = CODE.match(/r\.role::text IN \(([^)]*)\)/)?.[1] ?? "";
    const rollen = liste.split(",").map((r) => r.trim().replace(/'/g, "")).sort();
    expect(rollen).toEqual([...BEWERBERPROZESS_ROLLEN].sort());
    expect(CODE).toContain("REVOKE ALL ON FUNCTION public.darf_bewerberbereich(uuid) FROM PUBLIC, anon;");
  });

  it("nennt is_internal_role in keiner Regel mehr", () => {
    expect(CODE).not.toContain("is_internal_role");
  });

  it("raeumt alle alten Regeln der drei Tabellen und der Ablage ab", () => {
    expect(CODE).toContain("tablename IN ('bewerbungen', 'bewerber_formular', 'bewerber_mail_tracking')");
    expect(CODE).toContain("LIKE '%''bewerbungen''%'");
  });

  it("gibt bewerbungen nur den vier Rollen, lesen zusaetzlich dem Bewerber selbst", () => {
    const lesen = regel("Bewerberbereich sieht Bewerbungen");
    expect(lesen).toContain("FOR SELECT");
    expect(lesen).toContain("darf_bewerberbereich(auth.uid())");
    expect(lesen).toContain("benutzer_id = (select auth.uid())");
    for (const [name, art] of [
      ["Bewerberbereich legt Bewerbungen an", "FOR INSERT"],
      ["Bewerberbereich bearbeitet Bewerbungen", "FOR UPDATE"],
      ["Bewerberbereich loescht Bewerbungen", "FOR DELETE"],
    ]) {
      const r = regel(name);
      expect(r, name).toContain(art);
      expect(r, name).toContain("darf_bewerberbereich(auth.uid())");
      expect(r, name).not.toContain("benutzer_id");
    }
  });

  it("schuetzt Formulare, Mail-Tracking und Ablage mit derselben Regel", () => {
    for (const name of [
      "Bewerberbereich liest Bewerberformulare",
      "Bewerberbereich liest Mail-Tracking",
      "Bewerberbereich legt Mail-Tracking an",
      "Bewerberbereich liest Bewerbungsdateien",
      "Bewerberbereich laedt Bewerbungsdateien hoch",
      "Bewerberbereich loescht Bewerbungsdateien",
    ]) {
      expect(regel(name), name).toContain("darf_bewerberbereich(auth.uid())");
    }
    expect(regel("Bewerberbereich laedt Bewerbungsdateien hoch")).toContain(
      "IN ('vertrag', 'paket-uebersicht', 'muster-vertrag')",
    );
  });

  it("nimmt die Partnervertraege aus signature_requests heraus, ohne andere Zeilen zu beruehren", () => {
    const r = regel("Partnervertraege nur Bewerberbereich");
    expect(r).toContain("AS RESTRICTIVE");
    expect(r).toContain("NOT IN ('vertrag', 'vertrag_kurz')");
    expect(r).toContain("darf_bewerberbereich(auth.uid())");
    // Die bestehenden Regeln der Tabelle bleiben stehen.
    expect(CODE).not.toMatch(/DROP POLICY IF EXISTS "(?!Partnervertraege)[^"]*" ON public\.signature_requests/);
  });

  it("gibt keiner Regel anon", () => {
    expect(CODE).not.toMatch(/TO anon/);
  });
});

describe("Team-Zuordnung ohne Bewerbungen", () => {
  it("findet den geworbenen Partner ueber user_settings, auch wenn keine Bewerbung lesbar ist", async () => {
    vi.resetModules();
    vi.doMock("@/lib/bewerbungStore", () => ({ getBewerber: () => [] }));
    vi.doMock("@/lib/dataCache", () => ({
      cacheGet: (tabelle: string) =>
        tabelle === "user_settings"
          ? [{ user_id: "junior-1", einstellungen: { geworben_von_user_id: "leiter-1" } }]
          : tabelle === "profiles"
            ? [{ id: "junior-1", name: "Junior Eins" }]
            : [],
    }));
    const { getJuniorsForRecruiter } = await import("@/lib/juniorOverrideLogic");
    expect(getJuniorsForRecruiter("leiter-1")).toEqual([{ userId: "junior-1", name: "Junior Eins" }]);
    expect(getJuniorsForRecruiter("jemand-anderes")).toEqual([]);
    vi.doUnmock("@/lib/bewerbungStore");
    vi.doUnmock("@/lib/dataCache");
  });
});
