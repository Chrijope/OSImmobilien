import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hinweis an den Finanzierungspartner, wenn eine Pflicht-Bonitätsunterlage
 * nach der Freigabe abgelehnt oder gelöscht wird (Christian, 25.09.2026).
 * Keine neue Sperre, keine Dopplung, kein Hinweis vor der Freigabe.
 */

const zustand = vi.hoisted(() => ({
  meta: {} as Record<string, Record<string, unknown>>,
  rollen: [] as { user_id: string; role: string }[],
  warteschlange: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/bellNotifications", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/dataCache", () => ({ cacheGet: () => zustand.rollen }));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMeta: (id: string, schluessel: string, standard: unknown) => zustand.meta[id]?.[schluessel] ?? standard,
  setInvestmentMeta: vi.fn((id: string, schluessel: string, wert: unknown) => {
    zustand.meta[id] = { ...(zustand.meta[id] || {}), [schluessel]: wert };
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabelle: string) => {
      if (tabelle === "user_roles") {
        return { select: () => ({ in: async () => ({ data: zustand.rollen, error: null }) }) };
      }
      // scheduled_notifications mit eindeutigem dedupe_key, wie in der Datenbank.
      return {
        insert: async (zeile: Record<string, unknown>) => {
          if (zustand.warteschlange.some((z) => z.dedupe_key === zeile.dedupe_key)) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          zustand.warteschlange.push(zeile);
          return { error: null };
        },
      };
    },
  },
}));

const {
  meldeBonitaetNachFreigabe,
  meldeBonitaetNachFreigabeAusPortal,
  hinweisNoetig,
  empfaengerAusRollen,
  HINWEIS_MERKER,
} = await import("./bonitaetNachFreigabe");
const { notifyUser } = await import("@/lib/bellNotifications");

const INV = "44444444-4444-4444-4444-444444444444";
const FREI = {
  pipelineStufe: "finanzierung",
  bonitaetFreigabeGemeldetAm: "2026-09-20T10:00:00Z",
  docStatuses: { Personalausweis: "approved" },
  docFileUrls: { Personalausweis: "kontakt-1/ausweis_1758362400000.pdf" },
};
const eingabe = (ueberschreiben: Record<string, unknown> = {}) => ({
  investmentId: INV,
  kundeId: "kontakt-1",
  kundeName: "Otto Hans",
  docName: "Personalausweis",
  aktion: "abgelehnt" as const,
  metaVorher: FREI,
  ...ueberschreiben,
});

beforeEach(() => {
  zustand.meta = {};
  zustand.rollen = [
    { user_id: "fp-1", role: "finanzierungspartner" },
    { user_id: "admin-1", role: "admin" },
    { user_id: "inhaber-1", role: "inhaber" },
  ];
  zustand.warteschlange = [];
  vi.mocked(notifyUser).mockClear();
});

describe("wann ein Hinweis nötig ist", () => {
  it("nach der Freigabe über den Merker", () => {
    expect(hinweisNoetig("Personalausweis", { bonitaetFreigabeGemeldetAm: "2026-09-20", pipelineStufe: "bonitaetsunterlagen" })).toBe(true);
  });

  it("nach der Freigabe über die Stufe Finanzierung oder später", () => {
    expect(hinweisNoetig("Personalausweis", { pipelineStufe: "notar" })).toBe(true);
  });

  it("nicht vor der Freigabe", () => {
    expect(hinweisNoetig("Personalausweis", { pipelineStufe: "bonitaetsunterlagen" })).toBe(false);
  });

  it("nicht für freiwillige Unterlagen", () => {
    expect(hinweisNoetig("Schufa-Bonitätsauskunft", FREI)).toBe(false);
  });

  it("nicht für Gehaltsnachweise bei Selbstständigen", () => {
    const meta = { ...FREI, saData: { beschaeftigungsart: "selbstaendig" } };
    expect(hinweisNoetig("Letzter Gehaltsnachweis", meta)).toBe(false);
    expect(hinweisNoetig("Personalausweis", meta)).toBe(true);
  });

  it("nicht beim Vermerk „Kunde finanziert selbst“", () => {
    expect(hinweisNoetig("Personalausweis", { ...FREI, selbstauskunftEntfaellt: { aktiv: true } })).toBe(false);
  });
});

describe("wer die Glocke bekommt", () => {
  it("die Finanzierungspartner, nicht Admin und Inhaber", () => {
    expect(empfaengerAusRollen(zustand.rollen)).toEqual(["fp-1"]);
  });

  it("Admin und Inhaber nur, wenn es keinen Finanzierungspartner gibt", () => {
    expect(empfaengerAusRollen(zustand.rollen.filter((r) => r.role !== "finanzierungspartner"))).toEqual(["admin-1", "inhaber-1"]);
  });
});

describe("Hinweis aus dem Kundenprofil", () => {
  it("meldet eine Ablehnung nach der Freigabe an den Finanzierungspartner, mit Link ins Kundenprofil", async () => {
    expect(await meldeBonitaetNachFreigabe(eingabe())).toBe(true);

    expect(notifyUser).toHaveBeenCalledTimes(1);
    const [empfaenger, inhalt] = vi.mocked(notifyUser).mock.calls[0];
    expect(empfaenger).toBe("fp-1");
    expect(inhalt.nachricht).toContain("Bonitätsunterlage nach der Freigabe abgelehnt: Personalausweis bei Otto Hans");
    expect(inhalt.link).toBe(`/kunden/kontakt-1?tab=investments&investment=${INV}`);
  });

  it("meldet eine Löschung nach der Freigabe", async () => {
    expect(await meldeBonitaetNachFreigabe(eingabe({ aktion: "geloescht" }))).toBe(true);

    expect(vi.mocked(notifyUser).mock.calls[0][1].titel).toBe("Bonitätsunterlage nach der Freigabe gelöscht");
  });

  it("meldet dieselbe Fassung nur einmal, auch wenn sie erst abgelehnt und dann gelöscht wird", async () => {
    await meldeBonitaetNachFreigabe(eingabe());
    expect(await meldeBonitaetNachFreigabe(eingabe())).toBe(false);
    expect(await meldeBonitaetNachFreigabe(eingabe({ aktion: "geloescht" }))).toBe(false);

    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(Object.keys(zustand.meta[INV][HINWEIS_MERKER] as object)).toEqual(["Personalausweis|ausweis_1758362400000.pdf"]);
  });

  it("meldet eine neu hochgeladene Fassung erneut", async () => {
    await meldeBonitaetNachFreigabe(eingabe());
    const neu = { ...FREI, docFileUrls: { Personalausweis: "kontakt-1/ausweis_1758900000000.pdf" } };
    expect(await meldeBonitaetNachFreigabe(eingabe({ metaVorher: neu }))).toBe(true);

    expect(notifyUser).toHaveBeenCalledTimes(2);
  });

  it("meldet nichts vor der Freigabe und setzt keine Marke", async () => {
    const vorher = { pipelineStufe: "bonitaetsunterlagen", docStatuses: { Personalausweis: "uploaded" } };
    expect(await meldeBonitaetNachFreigabe(eingabe({ metaVorher: vorher }))).toBe(false);

    expect(notifyUser).not.toHaveBeenCalled();
    expect(zustand.meta[INV]).toBeUndefined();
  });

  it("geht an Admin und Inhaber, wenn niemand die Rolle Finanzierungspartner hat", async () => {
    zustand.rollen = zustand.rollen.filter((r) => r.role !== "finanzierungspartner");
    await meldeBonitaetNachFreigabe(eingabe());

    expect(vi.mocked(notifyUser).mock.calls.map((c) => c[0])).toEqual(["admin-1", "inhaber-1"]);
  });
});

describe("Hinweis aus dem Kundenportal", () => {
  it("reiht eine Löschung für die Rolle Finanzierungspartner ein, genau einmal", async () => {
    const portal = eingabe({ aktion: "geloescht" });
    expect(await meldeBonitaetNachFreigabeAusPortal(portal)).toBe(true);
    expect(await meldeBonitaetNachFreigabeAusPortal(portal)).toBe(false);

    expect(zustand.warteschlange).toHaveLength(1);
    expect(zustand.warteschlange[0]).toMatchObject({
      target_role: "finanzierungspartner",
      investment_id: INV,
      link: `/kunden/kontakt-1?tab=investments&investment=${INV}`,
    });
  });

  it("reiht vor der Freigabe nichts ein", async () => {
    const vorher = { pipelineStufe: "bonitaetsunterlagen", docFileUrls: FREI.docFileUrls };
    expect(await meldeBonitaetNachFreigabeAusPortal(eingabe({ metaVorher: vorher, aktion: "geloescht" }))).toBe(false);

    expect(zustand.warteschlange).toHaveLength(0);
  });
});

describe("die drei Aufrufstellen", () => {
  it("Ablehnen und Löschen im Kundenprofil, Löschen im Kundenportal", async () => {
    const fs = await import("node:fs");
    const profil = fs.readFileSync("src/pages/KundenDetail.tsx", "utf8");
    const portal = fs.readFileSync("src/pages/KundeInvestments.tsx", "utf8");

    expect(profil).toMatch(/meldeBonitaetNachFreigabe\(\{[\s\S]{0,400}aktion: "abgelehnt"/);
    expect(profil).toMatch(/meldeBonitaetNachFreigabe\(\{[\s\S]{0,400}aktion: "geloescht"/);
    expect(portal).toMatch(/meldeBonitaetNachFreigabeAusPortal\(\{[\s\S]{0,400}aktion: "geloescht"/);
  });
});
