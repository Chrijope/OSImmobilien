import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wer Unterlagen für Kunden freigeben darf (Christian, 23.09.2026): Admin und
 * Inhaber immer, dazu die in der Nutzerverwaltung gewählten Rollen, ohne
 * Eintrag Vertriebsleiter und Objektpartner. Die gespeicherte Einstellung ist
 * hier nachgebaut.
 */

const einstellung = vi.hoisted(() => ({ wert: null as unknown, gespeichert: [] as unknown[] }));
vi.mock("./appConfigStore", () => ({
  getAppConfig: (_schluessel: string, rueckfall: unknown) => einstellung.wert ?? rueckfall,
  setAppConfig: vi.fn(async (_schluessel: string, wert: unknown) => {
    einstellung.gespeichert.push(wert);
    return true;
  }),
}));

const {
  darfDokumentFreigeben,
  freigabeRollenAusWert,
  speichereFreigabeRollen,
  FREIGABE_ROLLEN_SCHLUESSEL,
  FREIGABE_ROLLEN_STANDARD,
  FREIGABE_ROLLEN_WAEHLBAR,
} = await import("./dokumentFreigabeRollen");
const { setAppConfig } = await import("./appConfigStore");

beforeEach(() => {
  einstellung.wert = null;
  einstellung.gespeichert = [];
  vi.mocked(setAppConfig).mockClear();
});

describe("darfDokumentFreigeben, ohne Einstellung", () => {
  it.each([["admin"], ["inhaber"], ["vertriebsleiter"], ["objektpartner"]])("lässt %s umschalten", (rolle) => {
    expect(darfDokumentFreigeben(rolle)).toBe(true);
  });

  it.each([["vertriebspartner"], ["backoffice"], ["kunde"], ["testaccount"], ["individuell"], [""], [null], [undefined]])(
    "lässt %s nicht umschalten",
    (rolle) => {
      expect(darfDokumentFreigeben(rolle)).toBe(false);
    },
  );
});

describe("darfDokumentFreigeben, mit Einstellung", () => {
  it("folgt den gewählten Rollen", () => {
    einstellung.wert = { rollen: ["backoffice", "vertriebspartner"] };
    expect(darfDokumentFreigeben("backoffice")).toBe(true);
    expect(darfDokumentFreigeben("vertriebspartner")).toBe(true);
    // Abgewählt heißt abgewählt, auch wenn es die Voreinstellung war.
    expect(darfDokumentFreigeben("vertriebsleiter")).toBe(false);
    expect(darfDokumentFreigeben("objektpartner")).toBe(false);
  });

  it("lässt Admin und Inhaber immer, auch bei leerer Liste", () => {
    einstellung.wert = { rollen: [] };
    expect(darfDokumentFreigeben("admin")).toBe(true);
    expect(darfDokumentFreigeben("inhaber")).toBe(true);
    expect(darfDokumentFreigeben("vertriebsleiter")).toBe(false);
    expect(darfDokumentFreigeben("objektpartner")).toBe(false);
  });

  it("zählt keine Rolle außerhalb der Auswahl, auch wenn sie im Eintrag steht", () => {
    einstellung.wert = { rollen: ["kunde", "tippgeber", "testaccount"] };
    expect(darfDokumentFreigeben("kunde")).toBe(false);
    expect(darfDokumentFreigeben("tippgeber")).toBe(false);
    expect(darfDokumentFreigeben("testaccount")).toBe(false);
    expect(darfDokumentFreigeben("kunde", ["kunde"])).toBe(false);
  });
});

describe("freigabeRollenAusWert", () => {
  it("nimmt ohne Eintrag oder bei kaputtem Eintrag die Voreinstellung", () => {
    expect(FREIGABE_ROLLEN_STANDARD).toEqual(["vertriebsleiter", "objektpartner"]);
    for (const wert of [null, undefined, "vertriebsleiter", ["backoffice"], {}, { rollen: "backoffice" }]) {
      expect(freigabeRollenAusWert(wert)).toEqual(["vertriebsleiter", "objektpartner"]);
    }
  });

  it("behält eine leere Liste als Entscheidung und sortiert wie die Auswahl", () => {
    expect(freigabeRollenAusWert({ rollen: [] })).toEqual([]);
    expect(freigabeRollenAusWert({ rollen: ["vertriebspartner", "admin", 7, "backoffice"] })).toEqual(["backoffice", "vertriebspartner"]);
  });
});

describe("speichereFreigabeRollen", () => {
  it("schreibt nur wählbare Rollen unter den festen Schlüssel", async () => {
    await expect(speichereFreigabeRollen(["objektpartner", "admin", "kunde", "vertriebsleiter"])).resolves.toBe(true);
    expect(setAppConfig).toHaveBeenCalledWith(FREIGABE_ROLLEN_SCHLUESSEL, { rollen: ["vertriebsleiter", "objektpartner"] });
    expect(FREIGABE_ROLLEN_SCHLUESSEL).toBe("dokument_freigabe_rollen");
  });
});

/*
 * Maßgeblich ist die Datenbank. Die Migration muss dieselbe Regel enthalten,
 * sonst zeigt der Browser einen Schalter, den die Datenbank ablehnt, oder
 * umgekehrt.
 */
describe("Migration 20260923170000, Quelltext", () => {
  const datei = "supabase/migrations/20260923170000_dokument_kundenfreigabe.sql";
  const sql = readFileSync(resolve(__dirname, "../..", datei), "utf-8");
  const funktion = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.darf_dokument_freigeben"),
    sql.indexOf("COMMENT ON FUNCTION public.darf_dokument_freigeben"),
  );
  const sqlListe = (text: string) => [...text.matchAll(/'([a-z_]+)'/g)].map((t) => t[1]);

  it("legt darf_dokument_freigeben als SECURITY DEFINER an, Admin und Inhaber zuerst", () => {
    expect(funktion).toMatch(/CREATE OR REPLACE FUNCTION public\.darf_dokument_freigeben\(_user_id uuid\)/);
    expect(funktion).toMatch(/SECURITY DEFINER/);
    expect(funktion).toMatch(/SET search_path = public/);
    expect(funktion).toMatch(/IF public\.is_admin_role\(_user_id\) THEN\s+RETURN true;/);
    expect(funktion).toMatch(/c\.schluessel = 'dokument_freigabe_rollen'/);
    expect(funktion).toMatch(/FROM public\.user_roles ur/);
  });

  it("kennt dieselben wählbaren Rollen und dieselbe Voreinstellung wie der Browser", () => {
    const waehlbar = funktion.match(/_waehlbar constant text\[\] := ARRAY\[([^\]]+)\]/);
    const standard = funktion.match(/_rollen := ARRAY\[([^\]]+)\]/);
    expect(waehlbar && sqlListe(waehlbar[1])).toEqual([...FREIGABE_ROLLEN_WAEHLBAR]);
    expect(standard && sqlListe(standard[1])).toEqual([...FREIGABE_ROLLEN_STANDARD]);
  });

  it("prüft in setze_kunden_freigabe und im Auslöser darf_dokument_freigeben statt is_admin_role", () => {
    expect(sql).toMatch(/IF v_uid IS NULL OR NOT public\.darf_dokument_freigeben\(v_uid\) THEN/);
    expect(sql).toMatch(/IF auth\.uid\(\) IS NOT NULL AND NOT public\.darf_dokument_freigeben\(auth\.uid\(\)\) THEN/);
    expect(sql).not.toMatch(/NOT public\.is_admin_role\(/);
  });

  it("gibt die Prüfung nicht an den Browser heraus", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.darf_dokument_freigeben\(uuid\) FROM public, anon, authenticated;/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.darf_dokument_freigeben/);
  });

  it("liegt als gleiche Kopie im Eingangskorb, solange sie noch nicht gelaufen ist", () => {
    const kopie = resolve(__dirname, "../..", "supabase/migrations-inbox/20260923170000_dokument_kundenfreigabe.sql");
    if (existsSync(kopie)) expect(readFileSync(kopie, "utf-8")).toBe(sql);
  });
});
