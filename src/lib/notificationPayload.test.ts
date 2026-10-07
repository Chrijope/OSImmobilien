import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Eine Benachrichtigung muss das anzeigen, was in ihr steht.
 *
 * Christian bekam am 16.09.2026 diese Glockenmeldung:
 *
 *   „Pflichtunterlagen fehlen: undefined“
 *   „0 Pflichtunterlagen von undefined fehlen noch (seit 2+ Tagen).“
 *   „Vor NaN Tagen“
 *
 * In der Datenbank stand zur selben Zeile: „Dokumente vollständig: Jonas
 * Lins“. Die Anzeige sagte also das GEGENTEIL der gespeicherten Meldung.
 *
 * Ursache: `toDb` legt die vollständigen Daten unter `meta.payload` ab und
 * hebt nur einige Schlüssel zum Suchen auf die obere Ebene. `fromDbByType`
 * las ausschließlich diese obere Ebene. Damit fehlten `kundeName`,
 * `timestamp` und vor allem `type`, und ohne `type` fiel die Anzeige in den
 * Zweig für die gegenteilige Meldung.
 */

const zeilen: Array<Record<string, unknown>> = [];

vi.mock("./dataCache", () => ({
  cacheGet: () => zeilen,
  cacheInsert: vi.fn(),
  cacheUpdate: vi.fn(),
  cacheDelete: vi.fn(),
  cacheFilter: () => [],
  cacheSet: vi.fn(),
}));

vi.mock("./dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_k: string, f: unknown) => f,
  localSet: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ data: [] }) }) }) }) }) }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));

import { getDocNotifications, getUnreadDocNotifCount } from "./notificationStore";

/** Genau die Zeile, die Christian gemeldet hat. */
const echteZeile = {
  id: "0ad3991a-b767-4b6c-8529-bb7524537f6e",
  gelesen: false,
  erstellt_am: "2026-09-16T16:38:28.116936+00:00",
  titel: "Dokumente vollständig: Jonas Lins",
  meta: {
    docType: "alle_hochgeladen",
    investmentId: "b634f45d-d1ef-4e84-b319-b0b79e3d8ef7",
    kundeId: "c5a83d7a-2eab-4152-bdff-5543008eef00",
    notif_type: "doc",
    payload: {
      beraterName: "",
      id: "0ad3991a-b767-4b6c-8529-bb7524537f6e",
      investmentId: "b634f45d-d1ef-4e84-b319-b0b79e3d8ef7",
      kundeId: "c5a83d7a-2eab-4152-bdff-5543008eef00",
      kundeName: "Jonas Lins",
      read: false,
      timestamp: "2026-09-16T16:38:26.872Z",
      type: "alle_hochgeladen",
    },
  },
};

describe("Benachrichtigungen: der Payload wird gelesen", () => {
  beforeEach(() => { zeilen.length = 0; });

  it("holt Name, Zeitpunkt und Art aus dem Payload", () => {
    zeilen.push(echteZeile);
    const [meldung] = getDocNotifications();
    expect(meldung.kundeName).toBe("Jonas Lins");
    expect(meldung.timestamp).toBe("2026-09-16T16:38:26.872Z");
    expect(meldung.type).toBe("alle_hochgeladen");
  });

  /*
   * Der eigentliche Schaden: Ohne `type` fiel die Anzeige in den Zweig für
   * „Pflichtunterlagen fehlen", obwohl die Meldung das Gegenteil sagt.
   */
  it("verwechselt eine Vollzugsmeldung nicht mit einer Mahnung", () => {
    zeilen.push(echteZeile);
    const art = getDocNotifications()[0].type;
    /*
     * Auf den GENAUEN Wert pruefen, nicht nur darauf, dass er nicht der
     * falsche ist. Die alte Fassung lieferte `undefined`, und das ist
     * ebenfalls nicht „pflichtdocs_fehlen" gewesen. Die Anzeige entscheidet
     * aber mit `type === "alle_hochgeladen"`, und ein fehlender Wert fiel
     * genau deshalb in den Zweig fuer die gegenteilige Meldung.
     */
    expect(art).toBe("alle_hochgeladen");
  });

  it("behält Kennung und Gelesen-Zustand aus der Tabellenzeile", () => {
    zeilen.push({ ...echteZeile, gelesen: true });
    const [meldung] = getDocNotifications();
    expect(meldung.id).toBe("0ad3991a-b767-4b6c-8529-bb7524537f6e");
    expect(meldung.read).toBe(true);
  });

  /*
   * Die Tabellenspalte `erstellt_am` lag die ganze Zeit ungenutzt daneben,
   * während die Anzeige mit einem leeren Wert rechnete und „Vor NaN Tagen"
   * schrieb.
   */
  it("nimmt den Zeitpunkt aus der Tabelle, wenn er im Payload fehlt", () => {
    zeilen.push({
      ...echteZeile,
      meta: { notif_type: "doc", payload: { kundeName: "Ohne Zeitstempel", type: "alle_hochgeladen" } },
    });
    expect(getDocNotifications()[0].timestamp).toBe("2026-09-16T16:38:28.116936+00:00");
  });

  it("kommt ohne Payload zurecht, ohne zu werfen", () => {
    zeilen.push({ id: "x", gelesen: false, erstellt_am: "2026-09-16T10:00:00Z", meta: { notif_type: "doc" } });
    expect(() => getDocNotifications()).not.toThrow();
    expect(getDocNotifications()[0].timestamp).toBe("2026-09-16T10:00:00Z");
  });

  it("verwechselt einen Payload, der keiner ist, nicht mit einem", () => {
    zeilen.push({ id: "x", gelesen: false, erstellt_am: "2026-09-16T10:00:00Z", meta: { notif_type: "doc", payload: "kein Objekt" } });
    expect(() => getDocNotifications()).not.toThrow();
    zeilen.length = 0;
    zeilen.push({ id: "y", gelesen: false, erstellt_am: "2026-09-16T10:00:00Z", meta: { notif_type: "doc", payload: [1, 2] } });
    expect(() => getDocNotifications()).not.toThrow();
  });

  it("lässt fremde Meldungsarten liegen", () => {
    zeilen.push({ id: "m", gelesen: false, erstellt_am: "2026-09-16T10:00:00Z", meta: { notif_type: "mention", payload: { chatId: "c1" } } });
    expect(getDocNotifications()).toHaveLength(0);
  });
});

/*
 * Eine versandte Reservierung ist keine vollstaendige Aktenlage.
 *
 * Bis zum 16.09.2026 benutzte das Reservierungsformular die Art
 * `alle_hochgeladen` mit, weil es fuer diesen Fall gar keine gab. In der
 * Glocke stand dann „Alle Pflichtunterlagen wurden hochgeladen, bitte pruefen
 * und freigeben“. Christian ist es bei Jonas Lins aufgefallen: Im Investment
 * lag ausser der Selbstauskunft keine einzige Unterlage, und eingereicht war
 * auch nichts.
 */
describe("Benachrichtigungen: die versandte Reservierung hat eine eigene Art", () => {
  beforeEach(() => { zeilen.length = 0; });

  it("liest die neue Art aus dem Payload", () => {
    zeilen.push({
      id: "r1", gelesen: false, erstellt_am: "2026-09-16T17:00:00Z",
      meta: {
        notif_type: "doc", docType: "reservierung_versandt",
        payload: { type: "reservierung_versandt", kundeName: "Jonas Lins", timestamp: "2026-09-16T17:00:00Z" },
      },
    });
    const [meldung] = getDocNotifications();
    expect(meldung.type).toBe("reservierung_versandt");
    expect(meldung.kundeName).toBe("Jonas Lins");
  });

  it("verwechselt sie nicht mit einer Vollzugsmeldung", () => {
    zeilen.push({
      id: "r2", gelesen: false, erstellt_am: "2026-09-16T17:00:00Z",
      meta: { notif_type: "doc", payload: { type: "reservierung_versandt", kundeName: "Jonas Lins" } },
    });
    expect(getDocNotifications()[0].type).not.toBe("alle_hochgeladen");
  });
});

/*
 * Fremde Meldungen gehoeren nicht in die eigene Glocke.
 *
 * Christian meldete am 17.09.2026: „Warum bekomme ich dauernd die
 * Reservierung versandt Jonas Lins angezeigt? Ich habe es jetzt schon einige
 * Male als gelesen markiert, es ploppt aber immer wieder auf."
 *
 * Als Inhaber darf er laut Zeilensicherheit ALLE Benachrichtigungen lesen,
 * aendern aber nur die eigenen. Die fremde Meldung stand deshalb in seiner
 * Liste, liess sich nicht wegklicken (die Datenbank lehnte das UPDATE ab)
 * und war beim naechsten Laden wieder da.
 */
describe("Benachrichtigungen: nur die eigenen", () => {
  beforeEach(() => { zeilen.length = 0; });

  const meldung = (id: string, empfaenger: string) => ({
    id, gelesen: false, erstellt_am: "2026-09-16T17:00:00Z", benutzer_id: empfaenger,
    meta: { notif_type: "doc", payload: { type: "reservierung_versandt", kundeName: "Jonas Lins" } },
  });

  it("laesst die Meldung eines Kollegen weg", () => {
    zeilen.push(meldung("fremd", "uid-philipp"), meldung("eigen", "uid-christian"));
    const meine = getDocNotifications("uid-christian");
    expect(meine).toHaveLength(1);
    expect(meine[0].id).toBe("eigen");
  });

  it("zeigt ohne Angabe weiterhin alles", () => {
    zeilen.push(meldung("fremd", "uid-philipp"), meldung("eigen", "uid-christian"));
    expect(getDocNotifications()).toHaveLength(2);
  });

  it("zaehlt auch die ungelesenen nur fuer den Empfaenger", () => {
    zeilen.push(meldung("fremd", "uid-philipp"), meldung("eigen", "uid-christian"));
    expect(getUnreadDocNotifCount("uid-christian")).toBe(1);
  });

  it("kommt mit einer Zeile ohne Empfaenger zurecht", () => {
    zeilen.push({ id: "ohne", gelesen: false, erstellt_am: "2026-09-16T17:00:00Z", meta: { notif_type: "doc", payload: {} } });
    expect(getDocNotifications("uid-christian")).toHaveLength(0);
  });
});
