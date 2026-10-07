import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  zeilen: [] as any[],
  rpcAufrufe: [] as { name: string; args: any }[],
  rpcAntwort: { data: { portal_konflikt: false, nicht_umgehaengt: [] }, error: null } as any,
  invokeAufrufe: [] as { name: string; body: any }[],
  invokeAntwort: { data: { ok: true, verschoben: 0, nichtVerschoben: [] }, error: null } as any,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async (_spalte: string, ids: string[]) => ({ data: db.zeilen.filter((z) => ids.includes(z.id)), error: null }),
      }),
    }),
    rpc: vi.fn(async (name: string, args: any) => {
      db.rpcAufrufe.push({ name, args });
      return db.rpcAntwort;
    }),
    functions: {
      invoke: vi.fn(async (name: string, opts: any) => {
        db.invokeAufrufe.push({ name, body: opts?.body });
        if (db.invokeAntwort instanceof Error) throw db.invokeAntwort;
        return db.invokeAntwort;
      }),
    },
  },
}));
vi.mock("./dbStoreHelper", () => ({ isTestAccount: () => false }));

import {
  kontakteZusammenfuehren, planeZusammenfuehrung, vergleicheAlter,
  ZusammenfuehrenMigrationFehlt, zusammengefuehrteDateienVerschieben, type KontaktZeile,
} from "./kontaktZusammenfuehren";

const JETZT = new Date("2026-09-26T12:00:00Z");

/** Ausgedachte Testkontakte, keine echten Personen. */
function alt(extra: Partial<KontaktZeile> = {}): KontaktZeile {
  return {
    id: "00000000-0000-4000-8000-00000000000a",
    erstellt_am: "2026-03-01T10:00:00Z",
    aktualisiert_am: "2026-09-01T10:00:00.123456+00:00",
    vorname: "Erika", nachname: "Beispiel",
    email: "erika@beispiel.test", telefon: "", ort: "",
    zustaendig_id: null, berater: null, notizen: "",
    meta: { moreId: 7 },
    ...extra,
  };
}
function neu(extra: Partial<KontaktZeile> = {}): KontaktZeile {
  return {
    id: "00000000-0000-4000-8000-00000000000b",
    erstellt_am: "2026-09-20T10:00:00Z",
    aktualisiert_am: "2026-09-20T10:00:00+00:00",
    vorname: "Erika", nachname: "Beispiel",
    email: "erika@beispiel.test", telefon: "0170 1234567", ort: "Hamburg",
    zustaendig_id: null, berater: null, notizen: "",
    meta: { moreId: 42 },
    ...extra,
  };
}

describe("planeZusammenfuehrung", () => {
  it("behält den älteren, egal in welcher Reihenfolge die Kontakte kommen", () => {
    const a = planeZusammenfuehrung(alt(), neu(), JETZT);
    const b = planeZusammenfuehrung(neu(), alt(), JETZT);
    expect(a.behaltenId).toBe(alt().id);
    expect(a.aufloesenId).toBe(neu().id);
    expect(b).toEqual(a);
  });

  it("nimmt bei gleichem Anlagezeitpunkt die kleinere MORE-Nummer", () => {
    const gleich = "2026-05-05T05:05:05Z";
    const klein = neu({ erstellt_am: gleich, meta: { moreId: 3 } });
    const gross = alt({ erstellt_am: gleich, meta: { moreId: 9 } });
    expect(planeZusammenfuehrung(gross, klein, JETZT).behaltenId).toBe(klein.id);
    expect(vergleicheAlter(klein, gross)).toBeLessThan(0);
  });

  it("füllt leere Felder des älteren aus dem neueren", () => {
    const plan = planeZusammenfuehrung(alt(), neu(), JETZT);
    expect(plan.felder).toEqual({ telefon: "0170 1234567", ort: "Hamburg" });
  });

  it("behält bei Widerspruch den Wert des älteren und vermerkt den anderen als Notiz", () => {
    const plan = planeZusammenfuehrung(alt({ telefon: "040 998877" }), neu(), JETZT);
    expect(plan.felder.telefon).toBeUndefined();
    expect(plan.abweichend.telefon).toBe("0170 1234567");
    expect(plan.notiz).toContain("Beim Zusammenführen am 26.09.2026");
    expect(plan.notiz).toContain("Telefon: 0170 1234567");
    expect(plan.notiz).toContain("MI-00042");
    expect(plan.meta.zusammenfuehrungen).toHaveLength(1);
    expect(plan.meta.zusammenfuehrungen[0]).toMatchObject({ ausKontaktId: neu().id, abweichend: { telefon: "0170 1234567" } });
  });

  it("sieht dieselbe Nummer in anderer Schreibweise nicht als Widerspruch", () => {
    const plan = planeZusammenfuehrung(alt({ telefon: "+49 170 1234567" }), neu(), JETZT);
    expect(plan.abweichend.telefon).toBeUndefined();
    expect(plan.notiz).not.toContain("Telefon:");
  });

  it("ersetzt eine Platzhalter-E-Mail des älteren durch die echte des neueren", () => {
    const plan = planeZusammenfuehrung(alt({ email: "x@placeholder.local" }), neu({ email: "echt@beispiel.test" }), JETZT);
    expect(plan.felder.email).toBe("echt@beispiel.test");
  });

  it("hängt die Notizen des neueren an, statt sie zu verwerfen", () => {
    const plan = planeZusammenfuehrung(alt({ notizen: "ruft abends zurück" }), neu({ notizen: "hat Handbuch geladen" }), JETZT);
    expect(plan.felder.notizen).toBe("ruft abends zurück\n\nAus MI-00042 übernommen:\nhat Handbuch geladen");
  });

  it("führt meta zusammen: ältere Werte gewinnen, Listen vereinigt, Fehlendes ergänzt", () => {
    const plan = planeZusammenfuehrung(
      alt({ meta: { moreId: 7, kampagne: { utmSource: "alt" }, weitereAnfragen: [{ am: "1" }], einwilligung: { version: "a" } } }),
      neu({ meta: { moreId: 42, kampagne: { utmSource: "neu" }, weitereAnfragen: [{ am: "1" }, { am: "2" }], handbuchFunnel: { ausgang: "x" }, deletionRequest: { status: "confirmed" } } }),
      JETZT,
    );
    expect(plan.meta.moreId).toBe(7);
    expect(plan.meta.kampagne).toEqual({ utmSource: "alt" });
    expect(plan.meta.einwilligung).toEqual({ version: "a" });
    expect(plan.meta.handbuchFunnel).toEqual({ ausgang: "x" });
    expect(plan.meta.weitereAnfragen).toEqual([{ am: "1" }, { am: "2" }]);
    expect(plan.meta.deletionRequest).toBeUndefined();
    expect(plan.abweichend.kampagne).toEqual({ utmSource: "neu" });
    expect(plan.notiz).toContain("1 weitere abweichende Zusatzangabe am Kontakt gesichert.");
  });

  it("übernimmt die Zuständigkeit nur, wenn der ältere keine hat", () => {
    const ohne = planeZusammenfuehrung(alt(), neu({ zustaendig_id: "vp-2", berater: "Partner Zwei" }), JETZT);
    expect(ohne.felder).toMatchObject({ zustaendig_id: "vp-2", berater: "Partner Zwei" });
    const mit = planeZusammenfuehrung(alt({ zustaendig_id: "vp-1", berater: "Partner Eins" }), neu({ zustaendig_id: "vp-2", berater: "Partner Zwei" }), JETZT);
    expect(mit.felder.zustaendig_id).toBeUndefined();
    expect(mit.notiz).toContain("Zuständig: Partner Zwei");
  });

  it("übernimmt den Portalzugang, wenn nur der neuere einen hat", () => {
    const plan = planeZusammenfuehrung(alt(), neu({ meta: { moreId: 42, authUserId: "u-neu" } }), JETZT);
    expect(plan.meta.authUserId).toBe("u-neu");
    expect(plan.portalKonflikt).toBe(false);
  });

  it("meldet einen Konflikt, wenn beide einen eigenen Portalzugang haben, und überschreibt nichts", () => {
    const plan = planeZusammenfuehrung(
      alt({ meta: { moreId: 7, authUserId: "u-alt" } }),
      neu({ meta: { moreId: 42, authUserId: "u-neu" } }),
      JETZT,
    );
    expect(plan.meta.authUserId).toBe("u-alt");
    expect(plan.portalKonflikt).toBe(true);
    expect(plan.notiz).toContain("Kundenportal");
  });

  it("hat keine Gedankenstriche im Notiztext", () => {
    const plan = planeZusammenfuehrung(alt({ telefon: "040 1" }), neu({ meta: { moreId: 42, authUserId: "x" }, zustaendig_id: "v" }), JETZT);
    expect(plan.notiz).not.toMatch(/[–—]/);
  });
});

describe("kontakteZusammenfuehren", () => {
  beforeEach(() => {
    db.zeilen = [alt(), neu()];
    db.rpcAufrufe = [];
    db.rpcAntwort = { data: { portal_konflikt: false, nicht_umgehaengt: [] }, error: null };
    db.invokeAufrufe = [];
    db.invokeAntwort = { data: { ok: true, verschoben: 0, nichtVerschoben: [] }, error: null };
  });

  it("schickt den älteren als _behalten, auch wenn vom neueren aus geklickt wurde", async () => {
    const ergebnis = await kontakteZusammenfuehren(neu().id, alt().id);
    expect(db.rpcAufrufe).toHaveLength(1);
    const { name, args } = db.rpcAufrufe[0];
    expect(name).toBe("kontakte_zusammenfuehren");
    expect(args._behalten).toBe(alt().id);
    expect(args._aufloesen).toBe(neu().id);
    expect(args._felder).toEqual({ telefon: "0170 1234567", ort: "Hamburg" });
    expect(args._stand).toEqual({ [alt().id]: alt().aktualisiert_am, [neu().id]: neu().aktualisiert_am });
    expect(ergebnis.behaltenId).toBe(alt().id);
  });

  it("meldet eine fehlende Migration, statt etwas zu löschen", async () => {
    db.rpcAntwort = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    await expect(kontakteZusammenfuehren(alt().id, neu().id)).rejects.toBeInstanceOf(ZusammenfuehrenMigrationFehlt);
  });

  it("gibt Konflikte der Datenbank weiter", async () => {
    db.rpcAntwort = { data: { portal_konflikt: true, nicht_umgehaengt: ["vp_bewertungen.kontakt_id"] }, error: null };
    const ergebnis = await kontakteZusammenfuehren(alt().id, neu().id);
    expect(ergebnis.portalKonflikt).toBe(true);
    expect(ergebnis.nichtUmgehaengt).toEqual(["vp_bewertungen.kontakt_id"]);
  });

  it("weigert sich, wenn einer schon im Papierkorb liegt", async () => {
    db.zeilen = [alt(), neu({ geloescht: true })];
    await expect(kontakteZusammenfuehren(alt().id, neu().id)).rejects.toThrow("Papierkorb");
    expect(db.rpcAufrufe).toHaveLength(0);
  });
});

describe("Dateien wandern nach dem Zusammenführen mit", () => {
  beforeEach(() => {
    db.zeilen = [alt(), neu()];
    db.rpcAufrufe = [];
    db.rpcAntwort = { data: { portal_konflikt: false, nicht_umgehaengt: [] }, error: null };
    db.invokeAufrufe = [];
    db.invokeAntwort = { data: { ok: true, verschoben: 3, nichtVerschoben: [] }, error: null };
  });

  it("ruft die Function erst nach dem Zusammenführen mit behaltenem und aufgelöstem Kontakt", async () => {
    const ergebnis = await kontakteZusammenfuehren(neu().id, alt().id);
    expect(db.invokeAufrufe).toEqual([{ name: "kontakte-zusammenfuehren-dateien", body: { behaltenId: alt().id, aufgeloestId: neu().id } }]);
    expect(ergebnis.dateienProblem).toBeNull();
  });

  it("verschiebt nichts, wenn das Zusammenführen scheitert", async () => {
    db.rpcAntwort = { data: null, error: { code: "42501", message: "Du darfst diese beiden Kontakte nicht zusammenführen." } };
    await expect(kontakteZusammenfuehren(alt().id, neu().id)).rejects.toThrow("nicht zusammenführen");
    expect(db.invokeAufrufe).toEqual([]);
  });

  it("meldet nicht verschobene Dateien, ohne das Zusammenführen zu kippen", async () => {
    db.invokeAntwort = { data: { ok: false, verschoben: 1, nichtVerschoben: [{ pfad: "x", grund: "y" }, { pfad: "z", grund: "y" }] }, error: null };
    expect(await zusammengefuehrteDateienVerschieben(alt().id, neu().id)).toBe("2 Dateien liegen noch am alten Ort.");
  });

  it("nennt die fehlende Migration", async () => {
    db.invokeAntwort = { data: { ok: false, migrationFehlt: true }, error: null };
    expect(await zusammengefuehrteDateienVerschieben(alt().id, neu().id)).toContain("20260927000000");
  });

  it("wirft nie, auch wenn die Function nicht erreichbar ist", async () => {
    db.invokeAntwort = { data: null, error: { message: "Failed to send a request" } };
    expect(await zusammengefuehrteDateienVerschieben(alt().id, neu().id)).toBe("Der Dienst zum Verschieben hat nicht geantwortet.");
    db.invokeAntwort = new Error("offline");
    expect(await zusammengefuehrteDateienVerschieben(alt().id, neu().id)).toBe("Der Dienst zum Verschieben hat nicht geantwortet.");
  });
});
