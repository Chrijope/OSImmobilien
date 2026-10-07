import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Was in der Glocke steht und in welcher Reihenfolge.
 *
 * Christian meldete am 21.09.2026 zwei Dinge auf einem Bild: Vier vollkommen
 * gleiche Erwaehnungen aus dem Chat "Otto Hans (Intern)", und darunter erst
 * der neuere Lead. Dahinter steckten zwei getrennte Fehler.
 *
 * ERSTENS, DIE FREMDEN ERWAEHNUNGEN
 *
 * Eine Erwaehnung gilt genau einer Person. Die Zeilensicherheit laesst
 * Verwaltende aber ALLE Benachrichtigungen lesen, und `getMentionNotifications`
 * fragte ohne Empfaengerfilter ab. Christian sah deshalb die Meldungen, die an
 * Christian Kurz gingen, und konnte sie nicht einmal wegklicken: Geaendert
 * werden duerfen nur eigene Zeilen.
 *
 * ZWEITENS, DIE REIHENFOLGE
 *
 * Die Glocke haengte ihre Quellen aneinander, statt nach Zeit zu sortieren.
 * Erwaehnungen standen im Array vor den Datenbankmeldungen und damit immer
 * oben, egal wie alt sie waren. Von aussen sah das aus, als waeren sie
 * angeheftet.
 */

const zeilen: any[] = [];

vi.mock("./dataCache", () => ({
  cacheGet: () => zeilen,
  cacheUpdate: vi.fn(),
  cacheInsert: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));

const ICH = "11111111-1111-1111-1111-111111111111";
const ANDERER = "22222222-2222-2222-2222-222222222222";

/** Eine Zeile, wie sie in `benachrichtigungen` steht. */
function erwaehnung(id: string, empfaenger: string, wann: string) {
  return {
    id,
    benutzer_id: empfaenger,
    gelesen: false,
    erstellt_am: wann,
    titel: "Erwähnung",
    nachricht: "",
    meta: {
      notif_type: "mention",
      payload: {
        chatId: "chat-1",
        chatName: "Otto Hans (Intern)",
        mentionedByName: "Christian Peetz",
        messageText: "@Christian Kurz test",
        timestamp: wann,
      },
    },
  };
}

beforeEach(() => {
  zeilen.length = 0;
  vi.resetModules();
});

describe("Erwaehnungen in der Glocke", () => {
  it("zeigt nur die Erwaehnungen, die mir gelten", async () => {
    zeilen.push(
      erwaehnung("a", ANDERER, "2026-09-20T09:00:00Z"),
      erwaehnung("b", ANDERER, "2026-09-20T09:01:00Z"),
      erwaehnung("c", ICH, "2026-09-20T09:02:00Z"),
    );
    const { getMentionNotifications } = await import("./notificationStore");

    const meine = getMentionNotifications(ICH);
    expect(meine.map((m: any) => m.id)).toEqual(["c"]);
  });

  it("zeigt ohne Kennung weiterhin alles, statt still leer zu laufen", async () => {
    zeilen.push(erwaehnung("a", ANDERER, "2026-09-20T09:00:00Z"));
    const { getMentionNotifications } = await import("./notificationStore");

    expect(getMentionNotifications()).toHaveLength(1);
  });

  it("zaehlt nur die eigenen ungelesenen", async () => {
    zeilen.push(
      erwaehnung("a", ANDERER, "2026-09-20T09:00:00Z"),
      erwaehnung("b", ICH, "2026-09-20T09:01:00Z"),
    );
    const { getUnreadMentionCount } = await import("./notificationStore");

    expect(getUnreadMentionCount(ICH)).toBe(1);
  });
});

/**
 * Die Sortierung selbst liegt in `HeaderBar`, weil dort die Quellen
 * zusammenlaufen. Geprueft wird hier die Rechenregel: neueste zuerst, und ein
 * fehlender Zeitpunkt darf die Liste nicht zerlegen.
 */
describe("Reihenfolge der Glocke", () => {
  const nachZeit = (a: { ts: number }, b: { ts: number }) => b.ts - a.ts;

  it("stellt die neueste Meldung nach oben, quer ueber die Quellen", () => {
    const liste = [
      { id: "erwaehnung", ts: Date.parse("2026-09-20T07:00:00Z") },
      { id: "lead", ts: Date.parse("2026-09-20T21:00:00Z") },
      { id: "loeschanfrage", ts: Date.parse("2026-09-20T10:00:00Z") },
    ];

    expect([...liste].sort(nachZeit).map((n) => n.id)).toEqual([
      "lead",
      "loeschanfrage",
      "erwaehnung",
    ]);
  });

  it("schiebt eine Meldung ohne Zeitpunkt ans Ende, statt die Liste zu zerlegen", () => {
    const liste = [
      { id: "ohne", ts: 0 },
      { id: "alt", ts: Date.parse("2026-09-19T07:00:00Z") },
      { id: "neu", ts: Date.parse("2026-09-20T07:00:00Z") },
    ];

    expect([...liste].sort(nachZeit).map((n) => n.id)).toEqual(["neu", "alt", "ohne"]);
  });
});
