import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Die Pflichtangabe bei der Lead-Uebergabe.
 *
 * Geprueft wird das Verhalten von `reassignBerater` und
 * `reassignBeraterBulk`:
 *  - Uebergabe ohne Grund geht nicht durch,
 *  - Erstverteilung aus dem offenen Pool braucht keinen,
 *  - ein gemeinsamer Grund gilt fuer die ganze Auswahl,
 *  - ein eigener Grund sticht ihn fuer einzelne Kontakte aus,
 *  - der Grund landet in der Verlaufsspur und in der Glocke.
 *
 * Der Datenspeicher ist ein kleines Abbild im Arbeitsspeicher. Es geht hier
 * um die Regel, nicht um Supabase.
 */

interface FakeKontakt {
  id: string;
  vorname: string;
  nachname: string;
  berater?: string;
  zustaendig_id?: string;
  erstellt_am?: string;
  pipelineStufe?: string;
  beraterHistorie?: any[];
}

const kontakte = new Map<string, FakeKontakt>();
/** Kontakte, bei denen die Datenbank das Schreiben ablehnt (Zeilensicherheit). */
const abgelehnt = new Set<string>();
/** Kontakte, bei denen das UPDATE ohne Fehler keine Zeile trifft. */
const nichtGetroffen = new Set<string>();

const meldungen: Array<{ beraterId: string; nachricht: string }> = [];
/** Je Aufruf der Sammelglocke an die Zentrale: die gemeldeten Kontakte und wer zurueckgab. */
const zentraleMeldungen: Array<{
  kontakte: Array<{ kontaktId: string; stufeAbReservierung?: string; grund?: string }>;
  durchId?: string;
}> = [];
const abgabeMeldungen: Array<{ beraterId: string; nachricht: string }> = [];

vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => kontakte.get(id) || null,
  updateKontakt: (id: string, patch: Record<string, unknown>) => {
    if (abgelehnt.has(id)) return Promise.reject(new Error("new row violates row-level security policy"));
    if (nichtGetroffen.has(id)) return Promise.resolve(true);
    const vorher = kontakte.get(id);
    if (vorher) kontakte.set(id, { ...vorher, ...patch } as FakeKontakt);
    return Promise.resolve(true);
  },
  // Nicht mehr lesbar zaehlt als geleert, wie im echten Store.
  kontaktZustaendigkeitGeleert: async (id: string) => !kontakte.get(id)?.zustaendig_id,
  // Die Datenbankfunktion lead_an_zentrale_zurueckgeben. null: fehlt noch.
  kontaktPerFunktionZurueckgeben: async (id: string, historie: any[]) => {
    if (funktion.antwort === null) return null;
    funktion.aufrufe.push({ id, historie });
    const vorher = kontakte.get(id);
    if (funktion.antwort && vorher) {
      kontakte.set(id, { ...vorher, berater: "", zustaendig_id: "", beraterHistorie: historie });
    }
    return funktion.antwort;
  },
}));

/** Antwort der Datenbankfunktion; null heisst, die Migration fehlt noch. */
const funktion: { antwort: boolean | null; aufrufe: Array<{ id: string; historie: any[] }> } = {
  antwort: null,
  aufrufe: [],
};

vi.mock("@/lib/loadAllUsers", () => ({
  loadAllUsers: () => [
    { id: "id-anna", name: "Anna Berg" },
    { id: "id-bodo", name: "Bodo Klein" },
  ],
}));

vi.mock("@/lib/bellNotifications", () => ({
  notifyRueckgabeAnZentrale: (
    kontakte: Array<{ kontaktId: string; stufeAbReservierung?: string; grund?: string }>,
    angaben: { durchId?: string },
  ) => {
    zentraleMeldungen.push({
      kontakte: kontakte.map(({ kontaktId, stufeAbReservierung, grund }) => ({ kontaktId, stufeAbReservierung, grund })),
      durchId: angaben.durchId,
    });
  },
  notifyLeadZugewiesen: (
    _leadName: string,
    _beraterName: string,
    beraterId: string,
    _kundeId: string,
    uebergabe?: { vonName?: string; grund?: string },
  ) => {
    const teile = ["zugewiesen"];
    if (uebergabe?.vonName) teile.push(`Übergabe von ${uebergabe.vonName}.`);
    if (uebergabe?.grund) teile.push(`Grund: ${uebergabe.grund}`);
    meldungen.push({ beraterId, nachricht: teile.join(" ") });
  },
  notifyLeadAbgegeben: (leadName: string, bisherigerBeraterId: string) => {
    abgabeMeldungen.push({ beraterId: bisherigerBeraterId, nachricht: leadName });
  },
  LEITUNG_ROLLEN: ["admin", "inhaber", "vertriebsleiter"],
}));

/** Die Glocken gehen erst nach der Antwort der Datenbank raus. */
const gemeldet = () => new Promise((r) => setTimeout(r, 0));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async () => ({ data: null, error: null }) } },
}));

const {
  reassignBerater,
  reassignBeraterBulk,
  leadAnZentraleZurueckgeben,
  leadsAnZentraleZurueckgeben,
  getUebergaben,
  istUebergabe,
  GRUND_FEHLT_MELDUNG,
} = await import("./beraterHistorie");
const { istRuecklaeufer, rueckgabeInfo } = await import("./leadRueckgabe");

const lege = (id: string, felder: Partial<FakeKontakt> = {}) => {
  kontakte.set(id, {
    id,
    vorname: "Lea",
    nachname: `Muster${id}`,
    erstellt_am: "2026-01-01T09:00:00.000Z",
    ...felder,
  });
};

beforeEach(() => {
  kontakte.clear();
  abgelehnt.clear();
  nichtGetroffen.clear();
  funktion.antwort = null;
  funktion.aufrufe.length = 0;
  zentraleMeldungen.length = 0;
  meldungen.length = 0;
  abgabeMeldungen.length = 0;
});

describe("Übergabe oder Erstverteilung", () => {
  it("erkennt einen Lead, der schon jemandem gehört", () => {
    expect(istUebergabe({ berater: "Anna Berg", zustaendig_id: "" })).toBe(true);
    expect(istUebergabe({ berater: "", zustaendig_id: "id-anna" })).toBe(true);
  });

  it("erkennt den Lead aus dem offenen Pool", () => {
    expect(istUebergabe({ berater: "", zustaendig_id: "" })).toBe(false);
    expect(istUebergabe(null)).toBe(false);
  });
});

describe("Der Grund ist bei jeder Übergabe Pflicht", () => {
  it("weist eine Übergabe ohne Grund ab und ändert nichts", () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    expect(() => reassignBerater("k1", "Bodo Klein")).toThrow(GRUND_FEHLT_MELDUNG);
    expect(kontakte.get("k1")?.berater).toBe("Anna Berg");
    expect(kontakte.get("k1")?.zustaendig_id).toBe("id-anna");
  });

  it("weist einen Grund ab, der nur aus Sonstiges ohne Text besteht", () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    expect(() => reassignBerater("k1", "Bodo Klein", { grund: { key: "sonstiges" } })).toThrow();
    expect(kontakte.get("k1")?.berater).toBe("Anna Berg");
  });

  it("lässt die Übergabe mit Grund durch", () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    const geaendert = reassignBerater("k1", "Bodo Klein", { grund: { key: "abwesenheit" } });
    expect(geaendert).toBe(true);
    expect(kontakte.get("k1")?.berater).toBe("Bodo Klein");
    expect(kontakte.get("k1")?.zustaendig_id).toBe("id-bodo");
  });

  it("verlangt bei der Erstverteilung aus dem offenen Pool keinen Grund", () => {
    // Dort gibt es kein „von Partner A“, also auch nichts zu begründen.
    lege("k2", { berater: "", zustaendig_id: "" });
    expect(reassignBerater("k2", "Bodo Klein")).toBe(true);
    expect(kontakte.get("k2")?.berater).toBe("Bodo Klein");
  });
});

describe("Der Grund bleibt am Kontakt stehen", () => {
  it("schreibt ihn in die vorhandene Verlaufsspur, nicht in ein neues Feld", () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    reassignBerater("k1", "Bodo Klein", {
      grund: { key: "region", text: "wohnt zehn Minuten entfernt" },
      changedByName: "Christian",
    });

    const kunde = kontakte.get("k1") as any;
    const offen = kunde.beraterHistorie.find((e: any) => !e.bis);
    expect(offen.name).toBe("Bodo Klein");
    expect(offen.grund).toBe("region");
    expect(offen.grundText).toBe("wohnt zehn Minuten entfernt");
    expect(offen.vonName).toBe("Anna Berg");
  });

  it("gibt die Übergaben als Paare zurück, neueste zuerst", () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    reassignBerater("k1", "Bodo Klein", { grund: { key: "auslastung" } });

    const uebergaben = getUebergaben(kontakte.get("k1") as any);
    expect(uebergaben).toHaveLength(1);
    expect(uebergaben[0].von).toBe("Anna Berg");
    expect(uebergaben[0].an).toBe("Bodo Klein");
    expect(uebergaben[0].grund).toBe("auslastung");
  });

  it("merkt sich bei der Erstverteilung keinen Grund", () => {
    lege("k2", { berater: "", zustaendig_id: "" });
    reassignBerater("k2", "Bodo Klein", { grund: { key: "auslastung" } });
    const offen = (kontakte.get("k2") as any).beraterHistorie.find((e: any) => !e.bis);
    expect(offen.grund).toBeUndefined();
  });
});

describe("Der Empfänger erfährt den Grund", () => {
  it("nennt in der Glocke den bisherigen Partner und den Grund", async () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    reassignBerater("k1", "Bodo Klein", {
      grund: { key: "abwesenheit", text: "bis 30.09. im Urlaub" },
      changedById: "id-chef",
    });
    await gemeldet();

    expect(meldungen).toHaveLength(1);
    expect(meldungen[0].beraterId).toBe("id-bodo");
    expect(meldungen[0].nachricht).toContain("Übergabe von Anna Berg.");
    expect(meldungen[0].nachricht).toContain("Grund: Urlaub oder Abwesenheit: bis 30.09. im Urlaub");
  });
});

describe("Umhaengen: wer eine Glocke bekommt (Regel vom 29.09.2026)", () => {
  it("1c: die Leitung haengt von A nach B um, A erfaehrt es, B bekommt den Lead", async () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter"]) {
      meldungen.length = 0;
      abgabeMeldungen.length = 0;
      lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
      reassignBerater("k1", "Bodo Klein", {
        grund: { key: "auslastung" },
        changedById: "id-chef",
        changedByName: "Christian",
        changedByRole: rolle,
      });
      await gemeldet();
      expect(abgabeMeldungen).toEqual([{ beraterId: "id-anna", nachricht: "Lea Musterk1" }]);
      expect(meldungen.map((m) => m.beraterId)).toEqual(["id-bodo"]);
    }
  });

  it("1b: ein Partner gibt direkt an einen Kollegen, nur B bekommt eine Glocke", async () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    reassignBerater("k1", "Bodo Klein", {
      grund: { key: "abwesenheit" },
      changedById: "id-anna",
      changedByName: "Anna Berg",
      changedByRole: "vertriebspartner",
    });
    await gemeldet();
    expect(abgabeMeldungen).toHaveLength(0);
    expect(meldungen.map((m) => m.beraterId)).toEqual(["id-bodo"]);
  });

  it("zaehlt die aktive Rolle, nicht die Person: dieselbe Person als Partner meldet A nichts", async () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    reassignBerater("k1", "Bodo Klein", {
      grund: { key: "auslastung" },
      changedById: "id-chef",
      changedByRole: "vertriebspartner",
    });
    await gemeldet();
    expect(abgabeMeldungen).toHaveLength(0);
  });

  it("1d: Erstverteilung aus dem Pool durch die Leitung, nur B", async () => {
    lege("k2", { berater: "", zustaendig_id: "" });
    reassignBerater("k2", "Bodo Klein", { changedById: "id-chef", changedByRole: "admin" });
    await gemeldet();
    expect(abgabeMeldungen).toHaveLength(0);
    expect(meldungen.map((m) => m.beraterId)).toEqual(["id-bodo"]);
  });

  it("lehnt die Datenbank ab, gibt es keine Glocke", async () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    abgelehnt.add("k1");
    reassignBerater("k1", "Bodo Klein", {
      grund: { key: "auslastung" },
      changedById: "id-chef",
      changedByRole: "admin",
    });
    await gemeldet();
    expect(meldungen).toHaveLength(0);
    expect(abgabeMeldungen).toHaveLength(0);
  });
});

describe("Mehrere Leads auf einmal", () => {
  const dreiLeads = () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    lege("k2", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    lege("k3", { berater: "Anna Berg", zustaendig_id: "id-anna" });
  };

  it("nimmt einen gemeinsamen Grund für die ganze Auswahl", () => {
    dreiLeads();
    const anzahl = reassignBeraterBulk(["k1", "k2", "k3"], "Bodo Klein", {
      grund: { key: "abwesenheit" },
      changedById: "id-chef",
    });
    expect(anzahl).toBe(3);
    for (const id of ["k1", "k2", "k3"]) {
      const offen = (kontakte.get(id) as any).beraterHistorie.find((e: any) => !e.bis);
      expect(offen.grund).toBe("abwesenheit");
    }
  });

  it("lässt einzelne davon abweichend begründen", () => {
    dreiLeads();
    reassignBeraterBulk(["k1", "k2", "k3"], "Bodo Klein", {
      grund: { key: "abwesenheit" },
      grundJeKontakt: { k2: { key: "kundenwunsch", text: "Kunde kennt Bodo" } },
      changedById: "id-chef",
    });

    const grundVon = (id: string) =>
      (kontakte.get(id) as any).beraterHistorie.find((e: any) => !e.bis);
    expect(grundVon("k1").grund).toBe("abwesenheit");
    expect(grundVon("k2").grund).toBe("kundenwunsch");
    expect(grundVon("k2").grundText).toBe("Kunde kennt Bodo");
    expect(grundVon("k3").grund).toBe("abwesenheit");
  });

  it("hängt gar nichts um, wenn für einen einzigen der Grund fehlt", () => {
    // Eine halb umgehängte Auswahl kann hinterher niemand mehr auseinander
    // sortieren, deshalb wird vor dem ersten Schreibvorgang geprüft.
    dreiLeads();
    expect(() =>
      reassignBeraterBulk(["k1", "k2", "k3"], "Bodo Klein", {
        grund: { key: "abwesenheit" },
        grundJeKontakt: { k2: { key: "sonstiges" } },
      }),
    ).toThrow(GRUND_FEHLT_MELDUNG);

    for (const id of ["k1", "k2", "k3"]) {
      expect(kontakte.get(id)?.berater).toBe("Anna Berg");
    }
  });

  it("verlangt einen Grund, auch wenn nur der gemeinsame fehlt", () => {
    dreiLeads();
    expect(() => reassignBeraterBulk(["k1", "k2"], "Bodo Klein", {})).toThrow(GRUND_FEHLT_MELDUNG);
    expect(kontakte.get("k1")?.berater).toBe("Anna Berg");
  });
});

describe("An die Zentrale zurückgeben wartet auf die Datenbank", () => {
  it("meldet Erfolg erst, wenn die Datenbank angenommen hat", async () => {
    lege("k1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    const ok = await leadAnZentraleZurueckgeben("k1", {
      changedByName: "Anna Berg",
      grund: { key: "kein_kontakt" },
    });
    expect(ok).toBe(true);
    expect(kontakte.get("k1")?.zustaendig_id).toBe("");
    expect(kontakte.get("k1")?.berater).toBe("");
  });

  it("meldet false, wenn die Datenbank ablehnt, statt „zurückgegeben“ zu behaupten", async () => {
    lege("k2", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    abgelehnt.add("k2");
    const ok = await leadAnZentraleZurueckgeben("k2", { grund: { key: "kein_kontakt" } });
    expect(ok).toBe(false);
  });

  it("meldet false für einen Lead, der niemandem gehört", async () => {
    lege("k3", { berater: "", zustaendig_id: "" });
    const grund = { key: "kein_kontakt" };
    expect(await leadAnZentraleZurueckgeben("k3", { grund })).toBe(false);
    expect(await leadAnZentraleZurueckgeben("gibt-es-nicht", { grund })).toBe(false);
  });
});

describe("Vertriebsleiter gibt an die Zentrale zurück", () => {
  const leiter = { changedById: "id-leitung", changedByName: "Leitung" };

  it("gibt einen Lead seines Bereichs in den Pool", async () => {
    lege("v1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    const ok = await leadAnZentraleZurueckgeben("v1", { ...leiter, grund: { key: "auslastung" } });
    expect(ok).toBe(true);
    expect(kontakte.get("v1")?.zustaendig_id).toBe("");
    const eintrag = kontakte.get("v1")?.beraterHistorie?.at(-1);
    expect(eintrag?.grund).toBe("auslastung");
    expect(eintrag?.geaendertVonName).toBe("Leitung");
    // Die Kennung des bisherigen Partners steht im Eintrag, nicht nur der
    // Name. Daran erkennt die Lead-Verwaltung, wer zurückgegeben hat.
    expect(eintrag?.id).toBe("id-anna");
    expect(eintrag?.name).toBe("Anna Berg");
    expect(eintrag?.bis).toBeTruthy();
  });

  it("meldet einen Lead außerhalb seines Bereichs als abgelehnt, er bleibt, wo er ist", async () => {
    // Die Datenbank lehnt ab, etwa die Vertretungssperre des Triggers.
    lege("v2", { berater: "Bodo Klein", zustaendig_id: "id-bodo" });
    abgelehnt.add("v2");
    const ok = await leadAnZentraleZurueckgeben("v2", { ...leiter, grund: { key: "auslastung" } });
    expect(ok).toBe(false);
    expect(kontakte.get("v2")?.zustaendig_id).toBe("id-bodo");
  });

  it("verlangt einen Grund und schreibt ohne ihn nichts", async () => {
    lege("v3", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    await expect(leadAnZentraleZurueckgeben("v3", leiter)).rejects.toThrow(GRUND_FEHLT_MELDUNG);
    await expect(leadAnZentraleZurueckgeben("v3", { ...leiter, grund: { key: "sonstiges", text: " " } })).rejects.toThrow(GRUND_FEHLT_MELDUNG);
    expect(kontakte.get("v3")?.zustaendig_id).toBe("id-anna");
  });
});

describe("Rückgabe zählt nur tatsächlich geänderte Zeilen", () => {
  it("meldet false, wenn das Schreiben ohne Fehler keine Zeile getroffen hat", async () => {
    lege("z1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    nichtGetroffen.add("z1");
    expect(await leadAnZentraleZurueckgeben("z1", { grund: { key: "kein_kontakt" } })).toBe(false);
  });
});

describe("Rückgabe an die Zentrale: genau eine Glocke je Aktion", () => {
  const partner = { changedById: "id-anna", changedByName: "Anna Berg" };

  it("meldet jede gelungene Rückgabe in einer Glocke, Kunden ab Reservierung kenntlich", async () => {
    lege("r1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    lege("r2", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    lege("r3", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    const ok = await leadsAnZentraleZurueckgeben(
      [
        { kontaktId: "r1", grund: { key: "auslastung" }, stufe: "notar" },
        { kontaktId: "r2", grund: { key: "kein_kontakt" }, stufe: "erreicht" },
        { kontaktId: "r3", grund: { key: "auslastung" } },
      ],
      partner,
    );
    expect(ok).toEqual([true, true, true]);
    expect(zentraleMeldungen).toEqual([{
      durchId: "id-anna",
      kontakte: [
        { kontaktId: "r1", stufeAbReservierung: "Notar", grund: "Auslastung" },
        { kontaktId: "r2", stufeAbReservierung: undefined, grund: "Kein Kontakt zustande gekommen" },
        { kontaktId: "r3", stufeAbReservierung: undefined, grund: "Auslastung" },
      ],
    }]);
    // Keine Glocke an Partner, weder an den neuen noch an den alten.
    expect(meldungen).toHaveLength(0);
    expect(abgabeMeldungen).toHaveLength(0);
  });

  it("meldet auch vor der Reservierung", async () => {
    lege("r4", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    await leadsAnZentraleZurueckgeben([{ kontaktId: "r4", grund: { key: "kein_kontakt" }, stufe: "erreicht" }], partner);
    expect(zentraleMeldungen).toHaveLength(1);
    expect(zentraleMeldungen[0].kontakte.map((k) => k.kontaktId)).toEqual(["r4"]);
  });

  it("meldet nur, was angekommen ist", async () => {
    lege("r5", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    lege("r6", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    abgelehnt.add("r6");
    const ok = await leadsAnZentraleZurueckgeben(
      [{ kontaktId: "r5", grund: { key: "auslastung" } }, { kontaktId: "r6", grund: { key: "auslastung" }, stufe: "reservierung" }],
      partner,
    );
    expect(ok).toEqual([true, false]);
    expect(zentraleMeldungen[0].kontakte.map((k) => k.kontaktId)).toEqual(["r5"]);
  });

  it("schreibt nichts, wenn bei einem Kontakt der Grund fehlt", async () => {
    lege("r7", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    lege("r8", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    await expect(leadsAnZentraleZurueckgeben(
      [{ kontaktId: "r7", grund: { key: "auslastung" } }, { kontaktId: "r8" }],
      partner,
    )).rejects.toThrow(GRUND_FEHLT_MELDUNG);
    expect(kontakte.get("r7")?.zustaendig_id).toBe("id-anna");
    expect(zentraleMeldungen).toHaveLength(0);
  });

  it("die einzelne Rückgabe meldet selbst nichts", async () => {
    lege("r9", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    await leadAnZentraleZurueckgeben("r9", { grund: { key: "auslastung" } });
    expect(zentraleMeldungen).toHaveLength(0);
  });
});

describe("Neuzuweisung nach der Rückgabe", () => {
  it("meldet nur den neuen Partner, nicht den alten", async () => {
    lege("w1", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    await leadsAnZentraleZurueckgeben([{ kontaktId: "w1", grund: { key: "auslastung" } }], {
      changedById: "id-anna",
      changedByName: "Anna Berg",
    });
    // Die Zentrale verteilt neu.
    reassignBerater("w1", "Bodo Klein", { changedById: "id-zentrale", changedByName: "Zentrale", changedByRole: "admin" });
    await gemeldet();
    expect(meldungen).toEqual([{ beraterId: "id-bodo", nachricht: "zugewiesen" }]);
    expect(abgabeMeldungen).toHaveLength(0);
  });
});

describe("Rückgabe ohne Beraternamen", () => {
  it("schreibt den Historieneintrag auch, wenn nur die Zuständigkeit gesetzt war", async () => {
    // Bis 28.09.2026 entstand hier kein Eintrag, und der Kontakt galt danach
    // nicht als Rückläufer.
    lege("n1", { berater: "", zustaendig_id: "id-anna" });
    const ok = await leadAnZentraleZurueckgeben("n1", { grund: { key: "kein_kontakt" } });
    expect(ok).toBe(true);
    const historie = kontakte.get("n1")?.beraterHistorie || [];
    expect(historie).toHaveLength(1);
    // Der Name kommt über die Kennung aus den Profilen.
    expect(historie[0]).toMatchObject({ name: "Anna Berg", grund: "kein_kontakt" });
    expect(historie[0].bis).toBeTruthy();
    expect(istRuecklaeufer(kontakte.get("n1") as any)).toBe(true);
  });

  it("schließt einen offenen Eintrag, statt einen zweiten anzulegen", async () => {
    lege("n2", {
      berater: "",
      zustaendig_id: "id-bodo",
      beraterHistorie: [{ name: "Bodo Klein", von: "2026-02-01T00:00:00.000Z" }],
    });
    await leadAnZentraleZurueckgeben("n2", { grund: { key: "auslastung" } });
    const historie = kontakte.get("n2")?.beraterHistorie || [];
    expect(historie).toHaveLength(1);
    expect(historie[0]).toMatchObject({ name: "Bodo Klein", grund: "auslastung" });
    expect(rueckgabeInfo(kontakte.get("n2") as any)?.vonName).toBe("Bodo Klein");
  });

  it("lässt keinen veralteten offenen Eintrag stehen, der die Erkennung blockiert", async () => {
    lege("n3", {
      berater: "Anna Berg",
      zustaendig_id: "id-anna",
      beraterHistorie: [{ name: "Alter Name", von: "2026-01-01T00:00:00.000Z" }],
    });
    await leadAnZentraleZurueckgeben("n3", { grund: { key: "kein_kontakt" } });
    const k = kontakte.get("n3") as any;
    expect(k.beraterHistorie.every((e: any) => !!e.bis)).toBe(true);
    expect(istRuecklaeufer(k)).toBe(true);
    expect(rueckgabeInfo(k)?.vonName).toBe("Anna Berg");
  });
});

describe("Rückgabe über die Datenbankfunktion (Migration 20260928190000)", () => {
  // Ein UPDATE des Partners scheitert an seiner eigenen Leseregel, sobald der
  // Lead ihm nicht mehr gehört. Deshalb geht die Rückgabe über die Funktion.
  it("gibt einen zugeteilten Lead über die Funktion zurück, ohne updateKontakt", async () => {
    funktion.antwort = true;
    lege("f1", {
      berater: "Anna Berg",
      zustaendig_id: "id-anna",
      beraterHistorie: [{ name: "Anna Berg", von: "2026-02-01T00:00:00.000Z" }],
    });
    abgelehnt.add("f1"); // Das alte UPDATE würde abgelehnt.
    const ok = await leadAnZentraleZurueckgeben("f1", { changedById: "id-anna", grund: { key: "kein_kontakt" } });
    expect(ok).toBe(true);
    expect(funktion.aufrufe).toHaveLength(1);
    expect(funktion.aufrufe[0].historie).toEqual([
      expect.objectContaining({ name: "Anna Berg", grund: "kein_kontakt", geaendertVonId: "id-anna", bis: expect.any(String) }),
    ]);
    expect(istRuecklaeufer(kontakte.get("f1") as any)).toBe(true);
  });

  it("meldet false, wenn die Funktion ablehnt, und lässt die Verlaufsspur im Speicher offen", async () => {
    funktion.antwort = false;
    lege("f2", {
      berater: "Bodo Klein",
      zustaendig_id: "id-bodo",
      beraterHistorie: [{ name: "Bodo Klein", von: "2026-02-01T00:00:00.000Z" }],
    });
    expect(await leadAnZentraleZurueckgeben("f2", { grund: { key: "auslastung" } })).toBe(false);
    const k = kontakte.get("f2") as any;
    expect(k.zustaendig_id).toBe("id-bodo");
    expect(k.beraterHistorie[0].bis).toBeUndefined();
  });

  it("fällt auf das bisherige Schreiben zurück, solange die Funktion fehlt", async () => {
    lege("f3", { berater: "Anna Berg", zustaendig_id: "id-anna" });
    expect(await leadAnZentraleZurueckgeben("f3", { grund: { key: "auslastung" } })).toBe(true);
    expect(funktion.aufrufe).toHaveLength(0);
    expect(kontakte.get("f3")?.zustaendig_id).toBe("");
  });
});
