import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Stille Ablehnung (H6, 04.10.2026).
 *
 * Eine Zeilenregel trifft bei einem verbotenen UPDATE oder DELETE einfach
 * null Zeilen, ein Wächter-Auslöser setzt still den alten Wert. Beides sah
 * bis dahin wie „gespeichert“ aus.
 */

const db = vi.hoisted(() => ({
  /** Antwort auf update(...).eq(...).select(...) */
  updateAntwort: { data: [] as unknown[] | null, error: null as unknown },
  /** Antwort auf delete(...).eq(...).select(...) */
  deleteAntwort: { data: [] as unknown[] | null, error: null as unknown },
  /** Antwort auf select("id").eq().maybeSingle() nach einem leeren Delete */
  nochDa: null as unknown,
  zeilen: [] as Record<string, unknown>[],
  rpcAufrufe: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcAntwort: { data: null as unknown, error: null as unknown },
}));

const toastFehler = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastFehler } }));

vi.mock("@/integrations/supabase/client", () => {
  class Abfrage {
    private art: "lesen" | "update" | "delete" = "lesen";
    select() { return this; }
    update() { this.art = "update"; return this; }
    delete() { this.art = "delete"; return this; }
    eq() { return this; }
    or() { return this; }
    order() { return this; }
    limit() { return this; }
    range() { return this; }
    abortSignal() { return this; }
    maybeSingle() { return Promise.resolve({ data: db.nochDa, error: null }); }
    then(resolve: (r: unknown) => void) {
      if (this.art === "update") return resolve(db.updateAntwort);
      if (this.art === "delete") return resolve(db.deleteAntwort);
      return resolve({ data: db.zeilen, error: null, count: db.zeilen.length });
    }
  }
  const kanal = { on: () => kanal, subscribe: () => kanal };
  return {
    supabase: {
      from: () => new Abfrage(),
      channel: () => kanal,
      removeChannel: () => {},
      rpc: async (name: string, args: Record<string, unknown>) => {
        db.rpcAufrufe.push({ name, args });
        return db.rpcAntwort;
      },
    },
  };
});

const {
  cacheUpdate, cacheDelete, cacheGet, initDataCache, resetCache, istAbgelehnt, nichtUebernommeneFelder,
  cacheMetaZusammenfuehren, metaUnterschied, tiefZusammenfuehren, cacheZeileSchreiben,
} = await import("./dataCache");

beforeEach(async () => {
  resetCache();
  toastFehler.mockClear();
  db.zeilen = [{ id: "i1", meta: { pipelineStufe: "notar", notiz: "alt" }, status: "offen" }];
  db.rpcAufrufe = [];
  await initDataCache({ sofort: ["investments"] });
});

describe("cacheUpdate erkennt stille Ablehnung", () => {
  it("null Zeilen: Fehler, Zwischenspeicher zurück, Meldung ohne „erneut versuchen“", async () => {
    db.updateAntwort = { data: [], error: null };
    const fehler = await cacheUpdate("investments", "i1", { status: "erledigt" }).catch((e) => e);
    expect(istAbgelehnt(fehler)).toBe(true);
    expect(cacheGet("investments")[0].status).toBe("offen");
    expect(toastFehler).toHaveBeenCalledTimes(1);
    expect(toastFehler.mock.calls[0][0]).toBe("Das Investment wurde nicht aktualisiert.");
  });

  it("Wächter hält die Stufe fest: Fehler mit Feldnamen, Zwischenspeicher zeigt den Stand der Datenbank", async () => {
    db.updateAntwort = { data: [{ id: "i1", meta: { notiz: "neu", pipelineStufe: "notar" } }], error: null };
    const fehler = await cacheUpdate("investments", "i1", {
      meta: { pipelineStufe: "abgeschlossen", notiz: "neu" },
    }).catch((e) => e);
    expect(istAbgelehnt(fehler)).toBe(true);
    expect(fehler.felder).toEqual(["meta.pipelineStufe"]);
    expect(cacheGet("investments")[0].meta).toEqual({ notiz: "neu", pipelineStufe: "notar" });
  });

  it("übernommen: kein Fehler, auch wenn die Datenbank die Schlüssel anders sortiert", async () => {
    db.updateAntwort = { data: [{ id: "i1", meta: { notiz: "alt", pipelineStufe: "faelligkeit" } }], error: null };
    await expect(cacheUpdate("investments", "i1", { meta: { pipelineStufe: "faelligkeit", notiz: "alt" } })).resolves.toBe(true);
    expect(toastFehler).not.toHaveBeenCalled();
  });
});

describe("cacheDelete erkennt stille Ablehnung", () => {
  it("null Zeilen und die Zeile ist noch lesbar: Fehler, Zeile bleibt", async () => {
    db.deleteAntwort = { data: [], error: null };
    db.nochDa = { id: "i1" };
    const fehler = await cacheDelete("investments", "i1").catch((e) => e);
    expect(istAbgelehnt(fehler)).toBe(true);
    expect(cacheGet("investments")).toHaveLength(1);
  });

  it("null Zeilen und die Zeile ist nicht mehr sichtbar: kein bestätigtes Löschen (Prüfung Codex)", async () => {
    db.deleteAntwort = { data: [], error: null };
    db.nochDa = null;
    const fehler = await cacheDelete("investments", "i1").catch((e) => e);
    expect(istAbgelehnt(fehler)).toBe(true);
    expect(cacheGet("investments")).toHaveLength(1);
  });
});

describe("nichtUebernommeneFelder", () => {
  it("vergleicht nur, was sich ändern sollte, und keine Zeitstempel", () => {
    expect(nichtUebernommeneFelder(
      { meta: { a: 1, b: 2 }, aktualisiert_am: "2026-10-04T10:00:00.000Z", berater: "Neu" },
      { meta: { a: 1, b: 1 }, aktualisiert_am: "x", berater: "Alt" },
      { meta: { a: 9, b: 2 }, aktualisiert_am: "2026-10-04 10:00:00+00", berater: "Alt" },
    )).toEqual(["berater"]);
  });
});

describe("H11: nur geänderte meta-Schlüssel schreiben", () => {
  it("metaUnterschied liefert nur Geändertes; ein fehlender Schlüssel heißt nicht erwähnt", () => {
    expect(metaUnterschied(
      { a: 1, b: { x: 1, y: 2 }, c: "bleibt stehen", d: "bleibt" },
      { a: 1, b: { y: 2, x: 1 }, d: "bleibt", e: "neu", f: undefined },
    )).toEqual({ e: "neu" });
  });

  it("cacheMetaZusammenfuehren schickt nur den Patch und übernimmt den Stand der Datenbank", async () => {
    db.rpcAntwort = { data: { pipelineStufe: "faelligkeit", notiz: "alt", vonFunction: "frisch" }, error: null };
    await cacheMetaZusammenfuehren("investments", "i1", { pipelineStufe: "faelligkeit" });
    expect(db.rpcAufrufe).toEqual([{ name: "merge_investment_meta", args: { _investment_id: "i1", _updates: { pipelineStufe: "faelligkeit" } } }]);
    expect(cacheGet("investments")[0].meta).toEqual({ pipelineStufe: "faelligkeit", notiz: "alt", vonFunction: "frisch" });
  });

  it("verworfener Schlüssel gilt als Ablehnung, der Speicher zeigt den Stand der Datenbank", async () => {
    db.rpcAntwort = { data: { pipelineStufe: "notar", notiz: "alt" }, error: null };
    const fehler = await cacheMetaZusammenfuehren("investments", "i1", { pipelineStufe: "abgeschlossen" }).catch((e) => e);
    expect(istAbgelehnt(fehler)).toBe(true);
    expect(cacheGet("investments")[0].meta.pipelineStufe).toBe("notar");
  });

  it("Fehler der Datenbank: Patch zurückgenommen, Meldung, Wurf", async () => {
    db.rpcAntwort = { data: null, error: { code: "XX000", message: "kaputt" } };
    await expect(cacheMetaZusammenfuehren("investments", "i1", { notiz: "neu" })).rejects.toBeTruthy();
    expect(cacheGet("investments")[0].meta.notiz).toBe("alt");
    expect(toastFehler).toHaveBeenCalled();
  });

  it("zusammengeführte Unterobjekte mit älteren Unterschlüsseln gelten als übernommen", async () => {
    db.zeilen = [{ id: "k1", meta: { person2: { vorname: "A", email: "a@x" } } }];
    resetCache();
    await initDataCache({ sofort: ["kontakte"] });
    db.rpcAntwort = { data: { person2: { vorname: "B", email: "a@x" } }, error: null };
    await expect(cacheMetaZusammenfuehren("kontakte", "k1", { person2: { vorname: "B" } })).resolves.toBeTruthy();
    expect(db.rpcAufrufe[0].name).toBe("merge_kontakt_meta");
  });
});

describe("Prüfung Codex, zweiter Durchgang: Patch ohne Löschsemantik, kein Zurückschreiben", () => {
  it("tief: nur geänderte Blätter, ein fehlender Unterschlüssel heißt „nicht erwähnt“", () => {
    expect(metaUnterschied(
      { person2: { vorname: "A", email: "a@x", telefon: "1" }, liste: [1, 2] },
      { person2: { vorname: "B", email: "a@x" }, liste: [1] },
      { tief: true },
    )).toEqual({ person2: { vorname: "B" }, liste: [1] });
  });

  it("person2 ohne authUserId neu aufgebaut: authUserId bleibt unberührt", () => {
    const alt = { person2: { authUserId: "u-2", vorname: "Eva", email: "e@x" } };
    const neu = { person2: { vorname: "Eva", email: "eva@x" } };
    const patch = metaUnterschied(alt, neu, { tief: true });
    expect(patch).toEqual({ person2: { email: "eva@x" } });
    expect(tiefZusammenfuehren(alt, patch)).toEqual({ person2: { authUserId: "u-2", vorname: "Eva", email: "eva@x" } });
  });

  it("oben ausdrücklich undefined heißt leeren, fehlend heißt nicht erwähnt", () => {
    expect(metaUnterschied({ objektId: "o1", label: "x" }, { objektId: undefined })).toEqual({ objektId: null });
  });

  it("flach (investments): das geänderte Unterobjekt geht ganz", () => {
    expect(metaUnterschied({ rvData: { a: 1, b: 2 } }, { rvData: { a: 1, b: 3 } })).toEqual({ rvData: { a: 1, b: 3 } });
  });

  it("tiefZusammenfuehren wie jsonb_deep_merge, null bleibt als Wert", () => {
    expect(tiefZusammenfuehren({ p: { a: 1, b: 2 }, c: 1 }, { p: { b: null }, d: 2 })).toEqual({ p: { a: 1, b: null }, c: 1, d: 2 });
  });

  it("erst die Spalten; lehnen sie ab, geht meta gar nicht hinaus", async () => {
    db.updateAntwort = { data: [], error: null };
    const fehler = await cacheZeileSchreiben("investments", "i1", { status: "erledigt" }, { pipelineStufe: "faelligkeit" }).catch((e) => e);
    expect(istAbgelehnt(fehler)).toBe(true);
    expect(db.rpcAufrufe).toEqual([]);
    expect(cacheGet("investments")[0].status).toBe("offen");
  });

  it("Spalten gespeichert, meta-Schlüssel abgelehnt: Teilweise gespeichert, Speicher zeigt die Rückgabe, kein Gegen-Patch", async () => {
    db.updateAntwort = { data: [{ id: "i1", status: "erledigt" }], error: null };
    db.rpcAntwort = { data: { pipelineStufe: "notar", notiz: "alt" }, error: null };
    const fehler = await cacheZeileSchreiben("investments", "i1", { status: "erledigt" }, { pipelineStufe: "abgeschlossen" }).catch((e) => e);
    expect(istAbgelehnt(fehler)).toBe(true);
    expect(db.rpcAufrufe).toHaveLength(1);
    expect(cacheGet("investments")[0].status).toBe("erledigt");
    expect(cacheGet("investments")[0].meta.pipelineStufe).toBe("notar");
    expect(toastFehler).toHaveBeenCalledWith("Teilweise gespeichert", expect.objectContaining({
      description: "Das Investment: pipelineStufe wurde nicht übernommen. Der Rest ist gespeichert.",
    }));
  });

  it("verglichen werden nur die gesendeten Blätter mit der Rückgabe, nicht mit dem Speicher", async () => {
    // Der Speicher zeigt den Wert schon (etwa durch eine frühere Anzeige),
    // die Datenbank gibt ihn nicht zurück: Das ist eine Ablehnung.
    db.zeilen = [{ id: "i1", meta: { pipelineStufe: "abgeschlossen" }, status: "offen" }];
    resetCache();
    await initDataCache({ sofort: ["investments"] });
    db.rpcAntwort = { data: { pipelineStufe: "notar" }, error: null };
    const fehler = await cacheMetaZusammenfuehren("investments", "i1", { pipelineStufe: "abgeschlossen" }).catch((e) => e);
    expect(istAbgelehnt(fehler)).toBe(true);
    expect(cacheGet("investments")[0].meta.pipelineStufe).toBe("notar");
  });
});
