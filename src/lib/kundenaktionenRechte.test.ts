/**
 * Die Kundenaktionen auf Objekt- und Einheitenseite („Kundenlink senden“,
 * „Als Kunde ansehen“, „Exposé anzeigen“), freigegeben für Vertriebsleitung
 * und Vertriebspartner am 05.10.2026 (Christians Go).
 *
 * Zwei Riegel auf dem Server: die Rolle (`hatKundenaktionsRolle`, aus
 * `user_roles`) und der Kunde (`pruefeKontaktZugriff`). Der zweite sorgt
 * dafür, dass ein Vertriebspartner nur für eigene und vertretene Kunden einen
 * Link sendet oder die Vorschau im Kundenbezug sieht. Geprüft ohne Netz.
 */

import { describe, it, expect } from "vitest";
import { darfKundenaktionen, hatKundenaktionsRolle } from "../../supabase/functions/_shared/kundenaktionen-rollen.ts";
import { pruefeKontaktZugriff, type KontaktZeile } from "../../supabase/functions/_shared/kontakt-signatur-zugriff.ts";

const ICH = "22222222-2222-2222-2222-222222222222";
const ANDERER = "33333333-3333-3333-3333-333333333333";
const KONTAKT = "11111111-1111-1111-1111-111111111111";

function kontakt(zustaendig: string | null): KontaktZeile {
  return { id: KONTAKT, vorname: "Otto", nachname: "Hans", email: "otto@example.de", zustaendig_id: zustaendig, meta: {} };
}

/** Service-Client, der genau diese Kontaktzeile kennt. */
function dienst(zeile: KontaktZeile) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: zeile, error: null }) }) }) }) } as never;
}

/**
 * Client des Aufrufers. `ist_vp_eigen` steht für `is_vp_owner_of_kontakt`,
 * das Eigentum und laufende Vertretung zugleich beantwortet. Alles andere
 * antwortet `null`, also „nicht erlaubt“.
 */
function aufrufer(rollen: { admin?: boolean; intern?: boolean; alle?: boolean; vp?: boolean }, istVpEigen: (zustaendig: unknown) => boolean) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "is_admin_role") return { data: rollen.admin ?? null, error: null };
      if (name === "is_internal_role") return { data: rollen.intern ?? null, error: null };
      if (name === "darf_alle_kunden_sehen") return { data: rollen.alle ?? null, error: null };
      if (name === "has_role") return { data: args._role === "vertriebspartner" ? (rollen.vp ?? null) : null, error: null };
      if (name === "is_vp_owner_of_kontakt") return { data: istVpEigen(args._zustaendig_id), error: null };
      return { data: null, error: null };
    },
  } as never;
}

describe("Kundenaktionen nach Rolle", () => {
  it("gibt sie Admin, Inhaber, Vertriebsleitung und Vertriebspartner, sonst niemandem", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter", "vertriebspartner"]) expect(darfKundenaktionen(rolle), rolle).toBe(true);
    for (const rolle of ["objektpartner", "finanzierungspartner", "backoffice", "buchhaltung", "tippgeber", "kunde", "setterin", "", null, undefined]) {
      expect(darfKundenaktionen(rolle), String(rolle)).toBe(false);
    }
  });

  it("liest auf dem Server nur die zugewiesenen Rollen, nichts aus der Anfrage", () => {
    expect(hatKundenaktionsRolle(["vertriebspartner"])).toBe(true);
    expect(hatKundenaktionsRolle(["kunde", "vertriebsleiter"])).toBe(true);
    expect(hatKundenaktionsRolle(["objektpartner", "finanzierungspartner"])).toBe(false);
    expect(hatKundenaktionsRolle([{ role: "admin" }])).toBe(false);
    expect(hatKundenaktionsRolle("admin")).toBe(false);
    expect(hatKundenaktionsRolle(null)).toBe(false);
  });
});

describe("Server: Vertriebspartner nur für eigene und vertretene Kunden", () => {
  const vp = (eigen: (z: unknown) => boolean) => aufrufer({ intern: true, vp: true }, eigen);

  it("lässt den Partner an seinen eigenen Kunden", async () => {
    const e = await pruefeKontaktZugriff(dienst(kontakt(ICH)), vp((z) => z === ICH), KONTAKT, ICH);
    expect(e.erlaubt).toBe(true);
  });

  it("sperrt den Partner bei einem Kunden eines anderen Partners", async () => {
    const e = await pruefeKontaktZugriff(dienst(kontakt(ANDERER)), vp((z) => z === ICH), KONTAKT, ICH);
    expect(e.erlaubt).toBe(false);
  });

  it("lässt die Vertretung an den Kunden des vertretenen Partners", async () => {
    const e = await pruefeKontaktZugriff(dienst(kontakt(ANDERER)), vp(() => true), KONTAKT, ICH);
    expect(e.erlaubt).toBe(true);
  });

  it("wertet eine unbestimmte Antwort der Datenbank als Sperre", async () => {
    const unbestimmt = { rpc: async () => ({ data: null, error: null }) } as never;
    const e = await pruefeKontaktZugriff(dienst(kontakt(null)), unbestimmt, KONTAKT, ICH);
    expect(e.erlaubt).toBe(false);
  });

  it("lässt die Vertriebsleitung an jeden Kunden", async () => {
    const e = await pruefeKontaktZugriff(dienst(kontakt(ANDERER)), aufrufer({ intern: true, alle: true, vp: false }, () => false), KONTAKT, ICH);
    expect(e.erlaubt).toBe(true);
  });

  it("lässt den Admin an jeden Kunden", async () => {
    const e = await pruefeKontaktZugriff(dienst(kontakt(ANDERER)), aufrufer({ admin: true }, () => false), KONTAKT, ICH);
    expect(e.erlaubt).toBe(true);
  });
});
