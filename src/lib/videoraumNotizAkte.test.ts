import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Christians Testfrage vom 18.09.2026: "Ob wenn man Notizen hinterlegt, die
 * dann auch im Profil als Notiz angelegt werden." Die Antwort war Nein, die
 * Notiz blieb am Raum haengen.
 *
 * Geprueft wird hier die Ablage selbst: ein Eintrag je Gespraech, der beim
 * naechsten Auflegen fortgeschrieben statt verdoppelt wird, und nichts davon
 * darf jemals eine Ausnahme werfen.
 */

const stand = vi.hoisted(() => ({
  raum: null as Record<string, any> | null,
  /** Aktivitaeten, die es laut Datenbank noch gibt. */
  vorhanden: new Set<string>(),
  ladeFehler: null as Error | null,
  /** Antwort von addAktivitaetSicher. Null heisst: hat nicht geklappt. */
  neueId: "akt-1" as string | null,
}));

const ladeRaum = vi.hoisted(() => vi.fn());
const speichereRaumMeta = vi.hoisted(() => vi.fn());
const addAktivitaetSicher = vi.hoisted(() => vi.fn());
const updateAktivitaet = vi.hoisted(() => vi.fn());
const aktivitaetExistiert = vi.hoisted(() => vi.fn());
const getInvestmentById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/videoraumStore", () => ({ ladeRaum, speichereRaumMeta }));
vi.mock("@/lib/aktivitaetenStore", () => ({
  addAktivitaetSicher, updateAktivitaet, aktivitaetExistiert,
}));
vi.mock("@/lib/investmentsStore", () => ({ getInvestmentById }));

import { baueNotizTitel, legeGespraechsnotizAb } from "@/lib/videoraumNotizAkte";

function raumAnlegen(felder: Record<string, any> = {}) {
  stand.raum = {
    id: "raum-1",
    titel: "Beratung Otto Hans",
    art: "beratung",
    kontakt_id: "otto-hans",
    investment_id: null,
    termin_at: "2026-09-18T10:00:00.000Z",
    created_at: "2026-09-17T08:00:00.000Z",
    notiz: null,
    meta: {},
    ...felder,
  };
  return stand.raum;
}

beforeEach(() => {
  vi.clearAllMocks();
  stand.raum = null;
  stand.vorhanden = new Set();
  stand.ladeFehler = null;
  stand.neueId = "akt-1";

  ladeRaum.mockImplementation(async () => {
    if (stand.ladeFehler) throw stand.ladeFehler;
    return stand.raum;
  });
  // Schreibt die Marke zurueck, wie es die Datenbank taete.
  speichereRaumMeta.mockImplementation(async (_id: string, meta: Record<string, unknown>) => {
    if (stand.raum) stand.raum.meta = meta;
    return true;
  });
  addAktivitaetSicher.mockImplementation(async () => {
    if (!stand.neueId) return null;
    stand.vorhanden.add(stand.neueId);
    return { id: stand.neueId };
  });
  updateAktivitaet.mockResolvedValue(undefined);
  aktivitaetExistiert.mockImplementation(async (id: string) => stand.vorhanden.has(id));
  getInvestmentById.mockReturnValue(undefined);
});

describe("Gespraechsnotiz in der Kundenakte", () => {
  it("legt die Notiz beim Auflegen als Notiz am Kontakt ab", async () => {
    raumAnlegen();
    expect(await legeGespraechsnotizAb("raum-1", "Er will im Januar starten", "Nils Haverkamp"))
      .toBe("abgelegt");

    expect(addAktivitaetSicher).toHaveBeenCalledTimes(1);
    expect(addAktivitaetSicher.mock.calls[0][0]).toMatchObject({
      kundeId: "otto-hans",
      art: "notiz",
      details: "Er will im Januar starten",
      von: "Nils Haverkamp",
    });
    // Die Marke haengt danach am Raum und findet den Eintrag wieder.
    expect(stand.raum?.meta?.notizAktivitaet).toEqual({
      aktivitaetId: "akt-1", text: "Er will im Januar starten",
    });
  });

  it("erzeugt beim zweiten Auflegen mit demselben Text keinen zweiten Eintrag", async () => {
    raumAnlegen();
    await legeGespraechsnotizAb("raum-1", "Rueckruf am Montag");
    expect(await legeGespraechsnotizAb("raum-1", "Rueckruf am Montag")).toBe("unveraendert");

    expect(addAktivitaetSicher).toHaveBeenCalledTimes(1);
    expect(updateAktivitaet).not.toHaveBeenCalled();
  });

  it("schreibt den vorhandenen Eintrag fort, wenn der Text ergaenzt wurde", async () => {
    raumAnlegen();
    await legeGespraechsnotizAb("raum-1", "Rueckruf am Montag");
    expect(await legeGespraechsnotizAb("raum-1", "Rueckruf am Montag\nBudget 250.000"))
      .toBe("aktualisiert");

    // Genau ein Eintrag, und zwar mit dem vollstaendigen Text.
    expect(addAktivitaetSicher).toHaveBeenCalledTimes(1);
    expect(updateAktivitaet).toHaveBeenCalledTimes(1);
    expect(updateAktivitaet.mock.calls[0][0]).toBe("akt-1");
    expect(updateAktivitaet.mock.calls[0][1].details).toBe("Rueckruf am Montag\nBudget 250.000");
    // Kein `datum`, sonst spraenge die Notiz im Verlauf nach oben.
    expect(Object.keys(updateAktivitaet.mock.calls[0][1]).sort()).toEqual(["beschreibung", "details"]);
    // Ohne Toast: Der Berater hat diese Aenderung nicht angestossen.
    expect(updateAktivitaet.mock.calls[0][2]).toEqual({ still: true });
  });

  it("legt einen neuen Eintrag an, wenn der gemerkte von Hand geloescht wurde", async () => {
    raumAnlegen();
    await legeGespraechsnotizAb("raum-1", "Erste Fassung");
    stand.vorhanden.delete("akt-1");
    stand.neueId = "akt-2";

    expect(await legeGespraechsnotizAb("raum-1", "Zweite Fassung")).toBe("abgelegt");
    expect(addAktivitaetSicher).toHaveBeenCalledTimes(2);
    expect(stand.raum?.meta?.notizAktivitaet).toEqual({
      aktivitaetId: "akt-2", text: "Zweite Fassung",
    });
  });

  it("legt bei leerer Notiz nichts an und fragt nicht einmal den Raum", async () => {
    raumAnlegen();
    expect(await legeGespraechsnotizAb("raum-1", "   \n ")).toBe("leer");
    expect(ladeRaum).not.toHaveBeenCalled();
    expect(addAktivitaetSicher).not.toHaveBeenCalled();
  });

  it("geht still ueber einen Raum ohne Kontakt hinweg", async () => {
    raumAnlegen({ kontakt_id: null });
    expect(await legeGespraechsnotizAb("raum-1", "Spontanes Gespraech")).toBe("kein_kontakt");
    expect(addAktivitaetSicher).not.toHaveBeenCalled();
    expect(speichereRaumMeta).not.toHaveBeenCalled();
  });

  it("meldet einen Fehlschlag, statt das Auflegen mit einer Ausnahme zu stoppen", async () => {
    raumAnlegen();
    stand.neueId = null;
    expect(await legeGespraechsnotizAb("raum-1", "Geht nicht durch")).toBe("fehlgeschlagen");
    expect(speichereRaumMeta).not.toHaveBeenCalled();
  });

  it("wirft auch dann nicht, wenn die Datenbank beim Laden aussteigt", async () => {
    stand.ladeFehler = new Error("permission denied");
    await expect(legeGespraechsnotizAb("raum-1", "Irgendetwas")).resolves.toBe("fehlgeschlagen");
  });

  it("haengt das Investment ueber den Text, wenn eines am Raum haengt", async () => {
    raumAnlegen({ investment_id: "inv-7" });
    getInvestmentById.mockReturnValue({ id: "inv-7", label: "Investment 1", objektTitel: "Amadio", weNr: "6" });

    await legeGespraechsnotizAb("raum-1", "Objekt gefaellt ihm");
    expect(addAktivitaetSicher.mock.calls[0][0].details)
      .toBe("Investment: Amadio, WE 6\n\nObjekt gefaellt ihm");
  });
});

describe("baueNotizTitel", () => {
  it("nimmt Raumtitel und Termindatum, damit der Titel beim Fortschreiben gleich bleibt", () => {
    expect(baueNotizTitel({
      titel: "Beratung Otto Hans", art: "beratung",
      termin_at: "2026-09-18T10:00:00.000Z", created_at: "2026-09-17T08:00:00.000Z",
    })).toBe("Gesprächsnotiz: Beratung Otto Hans vom 18.9.2026");
  });

  it("faellt ohne Titel auf die Art zurueck und ohne Termin auf das Anlegedatum", () => {
    expect(baueNotizTitel({
      titel: null, art: "objektvorstellung",
      termin_at: null, created_at: "2026-09-17T08:00:00.000Z",
    })).toBe("Gesprächsnotiz: Objektvorstellung vom 17.9.2026");
  });
});
