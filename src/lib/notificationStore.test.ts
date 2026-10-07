import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Benachrichtigungen duerfen einen Klick nie zerlegen.
 *
 * Am 16.09.2026 meldete Philipp Pintat, dass er auf der Reservierungsseite
 * einen Fehler sah: "Could not find the 'meta' column of 'benachrichtigungen'
 * in the schema cache". Ursache war, dass `toDb` seit jeher ein Feld `meta`
 * mitschickt, das es als Spalte nicht gab. `cacheInsert` zeigte deshalb einen
 * roten Hinweis und warf danach weiter, obwohl die Reservierung selbst in
 * Ordnung war.
 *
 * Geprueft wird deshalb dreierlei:
 *   1. Im Normalfall wird mit `meta` geschrieben, denn der Lesepfad filtert
 *      danach.
 *   2. Fehlt die Spalte, wird ein zweites Mal ohne `meta` geschrieben, damit
 *      der Nutzer seine Benachrichtigung wenigstens in der Glocke sieht.
 *   3. In keinem Fall dringt ein Fehler nach draussen, und in keinem Fall
 *      erscheint der laute Hinweis: geschrieben wird immer mit `silent`.
 */

const insertAufrufe: Array<{ tabelle: string; zeile: any; opts: any }> = [];
let insertVerhalten: (zeile: any) => void = () => {};

vi.mock("./dataCache", () => ({
  cacheGet: () => [],
  cacheUpdate: vi.fn(),
  cacheInsert: async (tabelle: string, zeile: any, opts: any) => {
    insertAufrufe.push({ tabelle, zeile, opts });
    insertVerhalten(zeile);
    return zeile;
  },
}));

vi.mock("./dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: () => [],
  localSet: () => {},
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));

import { addDocNotification } from "./notificationStore";

/** Der Fehler, den PostgREST bei einer unbekannten Spalte zurueckgibt. */
function spaltenFehler() {
  return {
    code: "PGRST204",
    message: "Could not find the 'meta' column of 'benachrichtigungen' in the schema cache",
  };
}

const docMeldung = {
  type: "alle_hochgeladen" as const,
  kundeId: "k1",
  kundeName: "Jonas Lins",
  investmentId: "i1",
  beraterName: "",
};

describe("Benachrichtigungen schreiben", () => {
  beforeEach(() => {
    insertAufrufe.length = 0;
    insertVerhalten = () => {};
  });

  it("schreibt im Normalfall einmal, mit meta und still", async () => {
    await addDocNotification(docMeldung);

    expect(insertAufrufe).toHaveLength(1);
    expect(insertAufrufe[0].tabelle).toBe("benachrichtigungen");
    expect(insertAufrufe[0].zeile.meta?.notif_type).toBe("doc");
    expect(insertAufrufe[0].zeile.meta?.kundeId).toBe("k1");
    expect(insertAufrufe[0].opts?.silent).toBe(true);
  });

  it("fehlt die Spalte meta, wird ein zweites Mal ohne sie geschrieben", async () => {
    insertVerhalten = (zeile) => {
      if ("meta" in zeile) throw spaltenFehler();
    };

    await addDocNotification(docMeldung);

    expect(insertAufrufe).toHaveLength(2);
    expect(insertAufrufe[0].zeile).toHaveProperty("meta");
    expect(insertAufrufe[1].zeile).not.toHaveProperty("meta");
    // Titel und Text muessen erhalten bleiben, sonst steht eine leere Zeile
    // in der Glocke.
    expect(insertAufrufe[1].zeile.titel).toContain("Jonas Lins");
    expect(insertAufrufe[1].zeile.benutzer_id).toBe("u1");
    expect(insertAufrufe[1].opts?.silent).toBe(true);
  });

  it("ein anderer Fehler wird geschluckt und nicht wiederholt", async () => {
    insertVerhalten = () => {
      throw { code: "42501", message: "new row violates row-level security policy" };
    };

    await expect(addDocNotification(docMeldung)).resolves.toBeUndefined();
    expect(insertAufrufe).toHaveLength(1);
  });

  it("scheitert auch der zweite Versuch, dringt kein Fehler nach draussen", async () => {
    insertVerhalten = () => { throw spaltenFehler(); };

    await expect(addDocNotification(docMeldung)).resolves.toBeUndefined();
    expect(insertAufrufe).toHaveLength(2);
  });
});
