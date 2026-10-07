import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Zahl neben "News" in der Seitenleiste.
 *
 * Sie blieb stehen, obwohl die Meldung gelesen war. Ursache war ein stiller
 * Abbruch beim Merken: Ohne Einstellungszeile im Zwischenspeicher schrieb
 * `setUserSetting` gar nichts, weder lokal noch in die Datenbank. Diese Tests
 * halten die Zaehlung und das Merken fest, weil beides sonst still falsch
 * wird, ohne dass irgendwo ein Fehler erscheint.
 */

const state = vi.hoisted(() => ({
  news: [] as Record<string, unknown>[],
  settings: [] as Record<string, unknown>[],
  patches: [] as Record<string, unknown>[],
  rpcFehler: null as unknown,
}));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (table: string) => (table === "news" ? state.news : state.settings),
  cacheInsert: async () => {},
  cacheUpdate: async () => {},
  cacheDelete: async () => {},
  cacheReload: async () => {},
  isTableLoaded: () => true,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // Bildet `merge_user_settings` nach: legt die Zeile an, wenn es noch
    // keine gibt, und mischt sonst den Ausschnitt hinein.
    rpc: async (_name: string, args: { _user_id: string; _patch: Record<string, unknown> }) => {
      if (state.rpcFehler) return { error: state.rpcFehler };
      state.patches.push(args._patch);
      const zeile = state.settings.find((r) => r.user_id === args._user_id);
      if (zeile) {
        zeile.einstellungen = { ...(zeile.einstellungen as object), ...args._patch };
      } else {
        state.settings.push({ id: "s1", user_id: args._user_id, einstellungen: { ...args._patch } });
      }
      return { error: null };
    },
  },
}));

import {
  getUnreadNewsCount,
  markNewsAsRead,
  markAllNewsAsRead,
  getReadNewsIds,
} from "@/lib/newsStore";

function meldung(id: string, zielrollen?: string[]): Record<string, unknown> {
  return {
    id,
    titel: `Meldung ${id}`,
    inhalt: "Inhalt",
    kategorie: "update",
    veroeffentlicht_am: "2026-09-01T10:00:00.000Z",
    meta: zielrollen ? { zielrollen } : {},
  };
}

/** jsdom bringt hier keinen localStorage mit, deshalb ein In-Memory-Ersatz. */
function stubLocalStorage() {
  const speicher = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (speicher.has(k) ? (speicher.get(k) as string) : null),
      setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
      removeItem: (k: string) => { speicher.delete(k); },
      clear: () => speicher.clear(),
    },
  });
}

/** Wartet die Mikrotasks ab, die `setUserSetting` im Hintergrund startet. */
async function schreibvorgangAbwarten() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  state.news = [];
  state.settings = [];
  state.patches = [];
  state.rpcFehler = null;
  stubLocalStorage();
  window.localStorage.setItem("mi_current_role", "vertriebspartner");
  window.localStorage.setItem("mi_current_user_id", "u1");
});

describe("getUnreadNewsCount", () => {
  it("zaehlt 0, wenn es gar keine Meldung gibt", () => {
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);
  });

  it("zaehlt eine ungelesene Meldung", () => {
    state.news = [meldung("n1")];
    expect(getUnreadNewsCount("vertriebspartner")).toBe(1);
  });

  it("zaehlt 0, wenn alles gelesen ist", () => {
    state.news = [meldung("n1"), meldung("n2")];
    state.settings = [{ id: "s1", user_id: "u1", einstellungen: { news_read_ids: ["n1", "n2"] } }];
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);
  });

  it("zaehlt eine Meldung nicht mit, die nur eine andere Rolle sieht", () => {
    state.news = [meldung("n1", ["admin"])];
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);
    expect(getUnreadNewsCount("admin")).toBe(1);
  });

  it("laesst Systemupdates aussen vor, die gehoeren ins Dashboard", () => {
    state.news = [{ ...meldung("n1"), kategorie: "system" }];
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);
  });
});

describe("Lesen laesst die Zahl verschwinden", () => {
  it("auch dann, wenn es noch keine Einstellungszeile gibt", async () => {
    // Genau der gemeldete Fall: Der Nutzer hat noch nie eine Einstellung
    // gespeichert, also existiert keine Zeile in user_settings.
    state.news = [meldung("n1")];
    expect(getUnreadNewsCount("vertriebspartner")).toBe(1);

    markNewsAsRead(["n1"]);

    // Sofort, ohne auf die Datenbank zu warten.
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);

    await schreibvorgangAbwarten();
    expect(state.patches).toEqual([{ news_read_ids: ["n1"] }]);
    expect(state.settings).toHaveLength(1);
  });

  it("und bleibt auch nach dem Nachladen der Zeile verschwunden", async () => {
    state.news = [meldung("n1")];
    markNewsAsRead(["n1"]);
    await schreibvorgangAbwarten();
    expect(getReadNewsIds()).toEqual(["n1"]);
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);
  });

  it("mit vorhandener Zeile ebenso", async () => {
    state.news = [meldung("n1")];
    state.settings = [{ id: "s1", user_id: "u1", einstellungen: {} }];
    markNewsAsRead(["n1"]);
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);
    await schreibvorgangAbwarten();
    expect(state.patches).toEqual([{ news_read_ids: ["n1"] }]);
  });

  it("schreibt nicht erneut, wenn nichts Neues dazugekommen ist", async () => {
    state.news = [meldung("n1")];
    markNewsAsRead(["n1"]);
    await schreibvorgangAbwarten();
    markNewsAsRead(["n1"]);
    await schreibvorgangAbwarten();
    expect(state.patches).toHaveLength(1);
  });

  it("taeuscht nichts vor, wenn die Datenbank den Schreibvorgang ablehnt", async () => {
    state.news = [meldung("n1")];
    state.rpcFehler = { message: "abgelehnt" };
    const fehlerLog = vi.spyOn(console, "error").mockImplementation(() => {});

    markNewsAsRead(["n1"]);
    await schreibvorgangAbwarten();

    expect(getUnreadNewsCount("vertriebspartner")).toBe(1);
    expect(fehlerLog).toHaveBeenCalled();
    fehlerLog.mockRestore();
  });
});

describe("markAllNewsAsRead und der Rollenwechsel", () => {
  it("merkt nur die Meldungen der uebergebenen Rolle", async () => {
    state.news = [meldung("n1", ["vertriebspartner"]), meldung("n2", ["admin"])];

    markAllNewsAsRead("vertriebspartner");
    await schreibvorgangAbwarten();

    // In der Rolle Vertriebspartner ist nichts mehr offen.
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);
    // Die Meldung fuer die Rolle Admin gilt weiterhin als ungelesen, sie
    // wurde ja nie angezeigt.
    expect(getUnreadNewsCount("admin")).toBe(1);
  });

  it("schreibt nichts, wenn es fuer die Rolle keine Meldung gibt", async () => {
    state.news = [meldung("n1", ["admin"])];
    markAllNewsAsRead("vertriebspartner");
    await schreibvorgangAbwarten();
    expect(state.patches).toHaveLength(0);
  });
});

describe("Meldungen, die spaeter dazukommen", () => {
  it("erscheinen wieder als ungelesen", async () => {
    state.news = [meldung("n1")];
    markNewsAsRead(["n1"]);
    await schreibvorgangAbwarten();
    expect(getUnreadNewsCount("vertriebspartner")).toBe(0);

    state.news = [meldung("n1"), meldung("n2")];
    expect(getUnreadNewsCount("vertriebspartner")).toBe(1);
  });
});
