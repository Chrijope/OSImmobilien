import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Prozess-Glocken ohne Zustaendigen gehen an die Leitung (Admin, Inhaber,
 * Vertriebsleitung), nie an alle Vertriebspartner und nicht ans Backoffice
 * (Entscheidung vom 28.09.2026). Jede Rueckgabe an die Zentrale meldet genau
 * einmal an Admin, Inhaber und Vertriebsleitung, seit dem 29.09.2026 nicht
 * mehr ans Backoffice.
 */

const cache = vi.hoisted(() => ({
  insert: vi.fn(),
  geplant: [] as Array<Record<string, unknown>>,
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
vi.mock("./currentUser", () => ({ getCurrentUserId: () => "jemand" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: async (zeile: Record<string, unknown>) => {
        cache.geplant.push(zeile);
        return { error: null };
      },
    }),
  },
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));

import {
  notifyDokumenteVollstaendig,
  notifyReservierungEingegangen,
  notifyRueckgabeAnZentrale,
  scheduleNotarfotoReminders,
} from "./bellNotifications";

const ZENTRALE = ["id-admin", "id-inhaber", "id-backoffice"];
const LEITUNG = ["id-admin", "id-inhaber", "id-leitung"];

/** Empfaenger aller Glocken, in Aufrufreihenfolge. */
const empfaenger = () => cache.insert.mock.calls.map((c) => (c[1] as { benutzer_id: string }).benutzer_id);
const eintraege = () => cache.insert.mock.calls.map((c) => c[1] as { benutzer_id: string; titel: string; nachricht: string; link: string });

beforeEach(() => {
  cache.insert.mockClear();
  cache.geplant.length = 0;
  cache.tabellen = {
    benachrichtigungen: [],
    user_roles: [
      { user_id: "id-admin", role: "admin" },
      { user_id: "id-inhaber", role: "inhaber" },
      // Wer zwei Rollen hat, bekommt trotzdem nur eine Glocke.
      { user_id: "id-inhaber", role: "admin" },
      { user_id: "id-backoffice", role: "backoffice" },
      { user_id: "id-partner-a", role: "vertriebspartner" },
      { user_id: "id-partner-b", role: "vertriebspartner" },
      { user_id: "id-leitung", role: "vertriebsleiter" },
    ],
  };
});

describe("Prozess-Glocken ohne Zustaendigen", () => {
  it("gehen an die Leitung, an keinen Vertriebspartner und nicht ans Backoffice", () => {
    notifyDokumenteVollstaendig("Lea Muster", "k1");
    expect(empfaenger().sort()).toEqual([...LEITUNG].sort());
  });

  it("jede Person der Leitung genau einmal, auch mit mehreren Rollen", () => {
    cache.tabellen.user_roles.push({ user_id: "id-leitung", role: "admin" });
    notifyDokumenteVollstaendig("Lea Muster", "k1");
    expect(empfaenger().length).toBe(new Set(empfaenger()).size);
  });

  it("gehen mit Zustaendigem nur an ihn", () => {
    notifyDokumenteVollstaendig("Lea Muster", "k1", "id-partner-a");
    expect(empfaenger()).toEqual(["id-partner-a"]);
  });

  it("Reservierung: ohne Zustaendigen die Leitung, das Backoffice wie immer, jede Person einmal", () => {
    notifyReservierungEingegangen("Lea Muster", "k1");
    expect(empfaenger().sort()).toEqual(["id-admin", "id-backoffice", "id-inhaber", "id-leitung"]);
    // Die Leitung bekommt die Prozess-Glocke, das Backoffice seine feste Meldung.
    const texte = Object.fromEntries(eintraege().map((e) => [e.benutzer_id, e.nachricht]));
    expect(texte["id-leitung"]).toBe("Lea Muster hat die Reservierungsvereinbarung unterschrieben.");
    expect(texte["id-backoffice"]).toBe("Die Reservierungsvereinbarung von Lea Muster ist unterschrieben eingegangen.");
  });

  it("Reservierung: mit Zustaendigem er und die Zentrale, kein anderer Partner", () => {
    notifyReservierungEingegangen("Lea Muster", "k1", "id-partner-a");
    expect(empfaenger().sort()).toEqual(["id-partner-a", ...ZENTRALE].sort());
  });

  it("geplante Erinnerungen gehen einzeln an die Leitung, nie an eine Rolle", async () => {
    scheduleNotarfotoReminders("Lea Muster", "k1", "2030-01-15", "10:00");
    await Promise.resolve();
    expect(cache.geplant.length).toBe(4 * LEITUNG.length);
    expect(cache.geplant.every((z) => !("target_role" in z) || z.target_role == null)).toBe(true);
    expect(new Set(cache.geplant.map((z) => z.target_user_id))).toEqual(new Set(LEITUNG));
    // Dedupe je Person, damit die drei Zeilen sich nicht gegenseitig sperren.
    expect(new Set(cache.geplant.map((z) => z.dedupe_key)).size).toBe(cache.geplant.length);
  });
});

describe("Rueckgabe an die Zentrale", () => {
  it("meldet drei Kontakte mit genau einer Glocke je Person der Leitung, nicht ans Backoffice", () => {
    notifyRueckgabeAnZentrale(
      [
        { kontaktId: "k1", name: "Lea Eins", grund: "Auslastung" },
        { kontaktId: "k2", name: "Lea Zwei", grund: "Auslastung", stufeAbReservierung: "Notar" },
        { kontaktId: "k3", name: "Lea Drei", grund: "Auslastung" },
      ],
      { durch: "Partner A", durchId: "id-partner-a" },
    );
    expect(empfaenger().sort()).toEqual([...LEITUNG].sort());
    expect(empfaenger()).not.toContain("id-backoffice");
    expect(empfaenger()).not.toContain("id-partner-b");
    const [e] = eintraege();
    expect(e.titel).toBe("3 Kontakte an die Zentrale zurückgegeben, 1 ab Reservierung");
    expect(e.nachricht).toContain("von Partner A");
    expect(e.nachricht).toContain("Bereits ab Reservierung: Lea Zwei (Notar).");
    expect(e.nachricht).toContain("Grund: Auslastung");
    expect(e.link).toBe("/lead-verwaltung");
  });

  it("verlinkt bei einem Kontakt auf dessen Profil", () => {
    notifyRueckgabeAnZentrale([{ kontaktId: "k9", name: "Lea Neun", grund: "Kein Kontakt" }], { durch: "Partner A" });
    const [e] = eintraege();
    expect(e.titel).toBe("Kontakt an die Zentrale zurückgegeben");
    expect(e.link).toBe("/kunden/k9");
  });

  it("meldet dem Zurueckgebenden nichts, auch wenn er zur Zentrale gehoert", () => {
    notifyRueckgabeAnZentrale([{ kontaktId: "k1", name: "Lea Eins" }], { durchId: "id-admin" });
    expect(empfaenger().sort()).toEqual(["id-inhaber", "id-leitung"]);
  });

  it("meldet nichts, wenn nichts zurueckgegangen ist", () => {
    notifyRueckgabeAnZentrale([], { durchId: "id-partner-a" });
    expect(cache.insert).not.toHaveBeenCalled();
  });
});
