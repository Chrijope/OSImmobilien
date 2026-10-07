import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Prüft die beiden Stellen im Buchungsspeicher, an denen eine falsche
 * Entscheidung echten Schaden anrichtet:
 *
 *   * Der Wochenplan darf beim Speichern nie leer zurückbleiben. Vorher lief
 *     erst ein Löschen und dann ein Einfügen. Scheiterte das Einfügen, stand
 *     der Mitarbeiter ohne jede Verfügbarkeit da und niemand konnte mehr bei
 *     ihm buchen.
 *   * Der Rückfall auf den alten Weg darf nur greifen, wenn die
 *     Datenbankfunktion fehlt, also solange die Migration nicht gelaufen ist.
 *     Bei jedem anderen Fehler wäre er genau der Schaden, den er verhindern
 *     soll.
 */

const stand = vi.hoisted(() => ({
  rpcFehler: null as { code?: string; message?: string } | null,
  rpcAufrufe: [] as Array<{ name: string; args: unknown }>,
  geloescht: 0,
  eingefuegt: [] as unknown[],
  insertFehler: null as { message: string } | null,
  aktualisiert: [] as unknown[],
  updateZeilen: [{ id: "b1" }] as Array<{ id: string }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: async (name: string, args: unknown) => {
      stand.rpcAufrufe.push({ name, args });
      return { data: null, error: stand.rpcFehler };
    },
    from: () => ({
      delete: () => ({
        eq: () => ({
          is: async () => {
            stand.geloescht += 1;
            return { error: null };
          },
        }),
      }),
      update: (felder: unknown) => ({
        eq: () => ({
          select: async () => {
            stand.aktualisiert.push(felder);
            return { data: stand.updateZeilen, error: null };
          },
        }),
      }),
      insert: async (zeilen: unknown) => {
        stand.eingefuegt.push(zeilen);
        return { error: stand.insertFehler };
      },
    }),
  },
}));

import { setzeBuchungStatus, setzeWochenplan, funktionFehlt, spalteFehlt, verschiebeBuchungIntern, type Buchung } from "@/lib/buchungStore";

const PLAN = [{ wochentag: 1, von: "09:00", bis: "17:00" }];

beforeEach(() => {
  stand.rpcFehler = null;
  stand.rpcAufrufe = [];
  stand.geloescht = 0;
  stand.eingefuegt = [];
  stand.insertFehler = null;
  stand.aktualisiert = [];
  stand.updateZeilen = [{ id: "b1" }];
});

describe("setzeBuchungStatus: Ergebnis auch dann, wenn die Funktion scheitert (01.10.2026)", () => {
  it("nimmt fuer Stattgefunden den Ersatzweg und reicht den Fehler weiter", async () => {
    stand.rpcFehler = { message: "irgendein Folgefehler" };
    const r = await setzeBuchungStatus("b1", "wahrgenommen");
    expect(r).toMatchObject({ ok: true, ersatzweg: true });
    expect(stand.aktualisiert).toEqual([{ status: "wahrgenommen" }]);
  });

  it("meldet Misserfolg, wenn auch der Ersatzweg keine Zeile trifft", async () => {
    stand.rpcFehler = { message: "Keine Berechtigung fuer diese Buchung" };
    stand.updateZeilen = [];
    const r = await setzeBuchungStatus("b1", "nicht_erschienen");
    expect(r.ok).toBe(false);
    expect(r.fehler).toEqual({ message: "Keine Berechtigung fuer diese Buchung" });
  });

  it("laesst Absagen bei der Funktion", async () => {
    stand.rpcFehler = { message: "x" };
    expect((await setzeBuchungStatus("b1", "abgesagt")).ok).toBe(false);
    expect(stand.aktualisiert).toEqual([]);
  });

  it("nimmt ohne Fehler keinen Ersatzweg", async () => {
    expect(await setzeBuchungStatus("b1", "wahrgenommen")).toEqual({ ok: true, fehler: null });
    expect(stand.aktualisiert).toEqual([]);
  });
});

describe("Wochenplan speichern", () => {
  it("geht über die Datenbankfunktion und rührt die Tabelle nicht an", async () => {
    expect((await setzeWochenplan(PLAN)).ok).toBe(true);
    expect(stand.rpcAufrufe[0].name).toBe("buchung_wochenplan_setzen");
    expect(stand.geloescht).toBe(0);
    expect(stand.eingefuegt).toHaveLength(0);
  });

  it("löscht nichts, wenn das Speichern fehlschlägt", async () => {
    stand.rpcFehler = { code: "P0001", message: "Der Wochenplan muss eine Liste sein" };
    expect((await setzeWochenplan(PLAN)).ok).toBe(false);
    // Das ist der Kern: Der alte Plan steht noch.
    expect(stand.geloescht).toBe(0);
  });

  it("behält den Wochenplan auch bei fehlender Migration unverändert", async () => {
    stand.rpcFehler = { code: "PGRST202", message: "Could not find the function in the schema cache" };
    expect((await setzeWochenplan(PLAN)).ok).toBe(false);
    expect(stand.geloescht).toBe(0);
    expect(stand.eingefuegt).toHaveLength(0);
  });

  it("gibt den Grund mit zurück, damit die Maske ihn nennen kann", async () => {
    // Ohne diesen Weg steht im Browser nur „hat nicht geklappt". Genau daran
    // ist die HR-Managerin haengen geblieben: Die Zeilensicherheit verweigerte
    // das Einfuegen, und niemand erfuhr es.
    stand.rpcFehler = { code: "42501", message: "new row violates row-level security policy" };
    const ergebnis = await setzeWochenplan(PLAN);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehler).toEqual(stand.rpcFehler);
    expect(stand.geloescht).toBe(0);
  });

  it("meldet fehlende Infrastruktur ohne Tabellenänderung", async () => {
    stand.rpcFehler = { code: "PGRST202", message: "schema cache" };
    stand.insertFehler = { message: "Netz weg" };
    expect((await setzeWochenplan(PLAN)).ok).toBe(false);
  });
});

describe("Fehlende Datenbankfunktion erkennen", () => {
  it("erkennt die beiden Meldungen für eine unbekannte Funktion", () => {
    expect(funktionFehlt({ code: "PGRST202" })).toBe(true);
    expect(funktionFehlt({ code: "42883", message: "function public.buchung_status_setzen(uuid) does not exist" })).toBe(true);
    expect(funktionFehlt({ message: "function public.buchung_status_setzen does not exist" })).toBe(true);
  });

  /*
    Seit 29.09.2026: 42883 steht auch für einen fehlenden Operator, und PGRST002
    erwähnt den Schema-Cache, obwohl nur die Verbindung gestört war. Beides ist
    keine fehlende Migration.
  */
  it("hält einen fehlenden Operator und eine gestörte Verbindung nicht für eine fehlende Funktion", () => {
    expect(funktionFehlt({ code: "42883", message: "operator does not exist: text = uuid" })).toBe(false);
    expect(funktionFehlt({ code: "42883" })).toBe(false);
    expect(funktionFehlt({ code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." })).toBe(false);
  });

  it("hält einen echten Fehler auseinander", () => {
    expect(funktionFehlt({ code: "P0001", message: "Keine Berechtigung fuer diese Buchung" })).toBe(false);
    expect(funktionFehlt({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(funktionFehlt(null)).toBe(false);
    expect(funktionFehlt("kaputt")).toBe(false);
  });

  /**
   * Der Fall, an dem es am 21.09.2026 gescheitert ist.
   *
   * Eine neue Datenbankfunktion schrieb auf die Spalte `updated_at`, die es in
   * `bewerbungen` nicht gibt. Postgres meldet das mit denselben Worten wie eine
   * fehlende Funktion: „does not exist". Der Aufrufer hielt es deshalb für eine
   * nicht gelaufene Migration und fiel beruhigt zurueck.
   *
   * Auf der Terminseite las ein Bewerber daraufhin „wir notieren uns den Termin
   * selbst", und notiert wurde nichts. In der Konsole stand nichts, denn der
   * Fehler galt als erwartet.
   */
  it("haelt eine fehlende Spalte nicht fuer eine fehlende Funktion", () => {
    const spaltenfehler = {
      code: "42703",
      message: 'column "updated_at" of relation "bewerbungen" does not exist',
    };

    expect(funktionFehlt(spaltenfehler)).toBe(false);
    expect(spalteFehlt(spaltenfehler)).toBe(true);
  });

  it("erkennt die Spaltenmeldung auch ohne Code", () => {
    expect(spalteFehlt({ message: 'column "foo" does not exist' })).toBe(true);
    expect(spalteFehlt({ code: "PGRST204" })).toBe(true);
  });

  it("haelt eine fehlende Funktion nicht fuer eine fehlende Spalte", () => {
    expect(spalteFehlt({ code: "PGRST202" })).toBe(false);
    expect(spalteFehlt({ code: "42883" })).toBe(false);
    expect(spalteFehlt({ message: "function public.irgendwas does not exist" })).toBe(false);
    expect(spalteFehlt(null)).toBe(false);
  });
});

describe("Intern verschieben", () => {
 it("verwendet den atomaren, serverseitig geprüften Weg", async () => {
   expect(await verschiebeBuchungIntern({id:"b1"} as Buchung,"2026-12-01T10:00:00Z")).toBe(true);
   expect(stand.rpcAufrufe).toEqual([{name:"buchung_intern_verschieben",args:{_buchung_id:"b1",_start:"2026-12-01T10:00:00.000Z"}}]);
 });
 it("fällt bei fehlender Funktion nicht auf einen unvollständigen Update zurück", async () => {
   stand.rpcFehler={code:"PGRST202"};
   expect(await verschiebeBuchungIntern({id:"b1"} as Buchung,"2026-12-01T10:00:00Z")).toBe(false);
   expect(stand.geloescht).toBe(0);
 });
});
