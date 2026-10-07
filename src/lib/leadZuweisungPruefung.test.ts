import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * M21 (04.10.2026): Die Zuweisung an Dritte prüft nach dem Nachlesen, dass
 * der Lead wirklich bei der Zielperson liegt. Vorher galt eine still
 * abgelehnte Zuweisung (Zeile lesbar, weiter ohne Zuständigen) als Erfolg.
 */

const db = vi.hoisted(() => ({
  updateAntwort: { data: [] as unknown[], error: null as unknown },
  jetzt: null as unknown,
  lesefehler: null as unknown,
  rpc: vi.fn(async () => ({ data: {}, error: null })),
  invoke: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock("@/integrations/supabase/client", () => {
  class Abfrage {
    private art = "lesen";
    update() { this.art = "update"; return this; }
    select() { return this; }
    eq() { return this; }
    is() { return this; }
    maybeSingle() { return Promise.resolve({ data: db.jetzt, error: db.lesefehler }); }
    then(resolve: (r: unknown) => void) {
      return resolve(this.art === "update" ? db.updateAntwort : { data: [], error: null });
    }
  }
  return {
    supabase: {
      from: () => new Abfrage(),
      rpc: db.rpc,
      auth: { getUser: async () => ({ data: { user: { id: "ich" } } }) },
      functions: { invoke: db.invoke },
    },
  };
});
vi.mock("./abwesenheitStore", () => ({
  ladeAktiveAbwesenheiten: async () => ({ eintraege: [], migrationFehlt: true, fehler: null }),
  abwesenheitAmTag: () => null,
  abwesenheitGrundText: () => "",
}));
vi.mock("./beraterHistorie", async (original) => ({
  ...((await original()) as object),
  sendeLeadPartnerMail: vi.fn(async () => {}),
}));
vi.mock("./dataCache", async (original) => ({
  ...((await original()) as object),
  cacheRefreshTable: vi.fn(async () => {}),
}));

const { leadZuweisenWennFrei } = await import("./kundenStore");
const ZIEL = { id: "partner-b", name: "Partner B" };

beforeEach(() => {
  db.rpc.mockClear();
  db.invoke.mockClear();
  db.jetzt = null;
  db.lesefehler = null;
});

describe("leadZuweisenWennFrei an Dritte", () => {
  it("lesbar, aber weiter ohne Zuständigen: Fehler statt Erfolg", async () => {
    db.updateAntwort = { data: [], error: null };
    db.jetzt = { zustaendig_id: null, berater: "" };
    const ergebnis = await leadZuweisenWennFrei("k-1", ZIEL, { mailUnterdruecken: true });
    expect(ergebnis.status).toBe("fehler");
    expect(db.invoke).not.toHaveBeenCalled();
  });

  it("ein Wächter hält die Zuständigkeit fest: Fehler", async () => {
    db.updateAntwort = { data: [{ id: "k-1", zustaendig_id: "jemand-anders" }], error: null };
    const ergebnis = await leadZuweisenWennFrei("k-1", ZIEL, { mailUnterdruecken: true });
    expect(ergebnis.status).toBe("fehler");
  });

  it("schon vergeben: vergeben mit Name", async () => {
    db.updateAntwort = { data: [], error: null };
    db.jetzt = { zustaendig_id: "partner-c", berater: "Partner C" };
    await expect(leadZuweisenWennFrei("k-1", ZIEL)).resolves.toEqual({ status: "vergeben", belegtVon: "Partner C" });
  });

  it("nicht mehr lesbar: kein bestätigter Erfolg, keine Mail (Prüfung Codex)", async () => {
    db.updateAntwort = { data: [], error: null };
    db.jetzt = null;
    const ergebnis = await leadZuweisenWennFrei("k-1", ZIEL, { mailUnterdruecken: true });
    expect(ergebnis.status).toBe("fehler");
    expect(db.invoke).not.toHaveBeenCalled();
  });

  it("ein Lesefehler beim Nachlesen kommt als Fehler an", async () => {
    db.updateAntwort = { data: [], error: null };
    db.lesefehler = { message: "permission denied" };
    await expect(leadZuweisenWennFrei("k-1", ZIEL, { mailUnterdruecken: true })).resolves.toEqual({ status: "fehler", meldung: "permission denied" });
  });

  it("bestätigt: Angaben und Willkommensmail gehen mit", async () => {
    db.updateAntwort = { data: [{ id: "k-1", zustaendig_id: "partner-b" }], error: null };
    await expect(leadZuweisenWennFrei("k-1", ZIEL, { mailUnterdruecken: true })).resolves.toEqual({ status: "ok" });
    expect(db.rpc).toHaveBeenCalledWith("merge_kontakt_meta", expect.objectContaining({
      _kontakt_id: "k-1",
      _updates: expect.objectContaining({ offenerLead: false }),
    }));
    expect(db.invoke).toHaveBeenCalledWith("send-lead-zuweisung-mail", { body: { kontaktId: "k-1" } });
  });

  it("übernommen und bestätigt: ok", async () => {
    db.updateAntwort = { data: [{ id: "k-1", zustaendig_id: "partner-b" }], error: null };
    await expect(leadZuweisenWennFrei("k-1", ZIEL, { mailUnterdruecken: true })).resolves.toEqual({ status: "ok" });
  });
});
