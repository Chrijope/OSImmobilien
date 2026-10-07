import { describe, it, expect, vi, beforeEach } from "vitest";

// Die Stores holen sich sonst Daten aus Supabase. Für die Frage, welche
// Quellen berücksichtigt werden, reichen Attrappen.
const aktivitaeten = vi.hoisted(() => ({ liste: [] as any[] }));
const aufgaben = vi.hoisted(() => ({ liste: [] as any[] }));
const offeneAufgaben = vi.hoisted(() => ({
  liste: [] as Array<{ id: string; kontaktId: string; titel: string; faelligAm: string; uhrzeit?: string; typ?: string; status: string }>,
}));
const followUps = vi.hoisted(() => ({
  liste: [] as Array<{ id: string; kundeId: string; status: string; titel: string; faelligAm: string }>,
}));
const inbox = vi.hoisted(() => ({ liste: [] as any[] }));
const investments = vi.hoisted(() => ({
  liste: [] as Array<{ id: string; kontaktId: string; meta?: Record<string, string> }>,
}));

vi.mock("@/lib/followUpStore", () => ({
  getFollowUps: () => followUps.liste,
  getFollowUpsByKunde: (id: string) => followUps.liste.filter((f) => f.kundeId === id),
}));
vi.mock("@/lib/investmentsStore", () => ({ getInvestmentsByKontakt: () => investments.liste }));
vi.mock("@/lib/aufgabenStore", () => ({ getAufgabenFuerKunde: () => offeneAufgaben.liste, getAufgaben: () => aufgaben.liste }));
vi.mock("@/lib/aktivitaetenStore", () => ({
  getInboxTasks: () => inbox.liste,
  getAktivitaeten: () => aktivitaeten.liste,
}));

const { kontaktQuellen, hatVereinbartenKontakt } = await import("@/lib/kontaktTermine");

// Fuer Testkunden, die nur die hier relevanten Felder tragen.
type Kunde = Parameters<typeof kontaktQuellen>[0];
const alsKunde = (k: Record<string, unknown>) => k as unknown as Kunde;
const { naechsterKontakt, hatGeplantenTermin, istVideoTermin } = await import("@/lib/naechsterKontakt");

const kunde = { id: "k1" } as any;
const JETZT = new Date("2026-07-28T12:00:00").getTime();

describe("Termine aus der Aktivitätsübersicht", () => {
  beforeEach(() => {
    aktivitaeten.liste = [];
    aufgaben.liste = [];
    offeneAufgaben.liste = [];
    followUps.liste = [];
    investments.liste = [];
  });

  it("erkennt eine geplante Aufgabe mit Fälligkeit in der Zukunft", () => {
    aktivitaeten.liste = [
      { id: "a1", kundeId: "k1", art: "aufgabe", beschreibung: "Follow-Up Dominik", faelligAm: "2026-11-04" },
    ];
    const quellen = kontaktQuellen(kunde);
    const naechster = naechsterKontakt(quellen, JETZT);
    expect(naechster?.quelle).toBe("aufgabe");
    expect(naechster?.ueberfaellig).toBe(false);
    expect(hatGeplantenTermin(quellen, JETZT)).toBe(true);
  });

  it("erkennt ein geplantes Meeting als Termin", () => {
    aktivitaeten.liste = [
      { id: "a2", kundeId: "k1", art: "meeting", beschreibung: "Beratung vor Ort", faelligAm: "2026-09-15", uhrzeit: "10:00" },
    ];
    const quellen = kontaktQuellen(kunde);
    expect(hatGeplantenTermin(quellen, JETZT)).toBe(true);
    expect(naechsterKontakt(quellen, JETZT)?.quelle).toBe("termin");
  });

  it("zaehlt eine Aufgabe nicht doppelt, wenn es sie als echte Aufgabe gibt", () => {
    // Die Schnellaktion schreibt beides: eine echte Aufgabe und eine Kopie in
    // der Aktivitaetsliste. Nur die echte laesst sich abhaken. Ist sie
    // erledigt, darf die Kopie die Kachel nicht weiter rot faerben.
    aufgaben.liste = [
      { id: "t1", kontaktId: "k1", titel: "Rückruf", faelligAm: "2026-07-22", status: "erledigt" },
    ];
    aktivitaeten.liste = [
      { id: "a9", kundeId: "k1", art: "aufgabe", beschreibung: "Rückruf", faelligAm: "2026-07-22" },
    ];
    const quellen = kontaktQuellen(kunde);
    expect(naechsterKontakt(quellen, JETZT)).toBeNull();
  });

  it("erkennt ein Meeting im eigenen Videoraum als Videotermin", () => {
    aktivitaeten.liste = [
      { id: "a6", kundeId: "k1", art: "meeting", beschreibung: "Beratung online", faelligAm: "2026-09-15", uhrzeit: "10:00", zoomLink: "/raum/abc123" },
    ];
    const quellen = kontaktQuellen(kunde);
    // Seit M20 (04.10.2026) kommen die Schritte zusammengeführt in `geplant`.
    expect(quellen.geplant?.[0]?.quelle).toBe("videotermin");
    expect(naechsterKontakt(quellen, JETZT)?.quelle).toBe("videotermin");
    expect(hatGeplantenTermin(quellen, JETZT)).toBe(true);
  });

  it("erkennt einen fremden Videodienst ebenfalls als Videotermin", () => {
    aktivitaeten.liste = [
      { id: "a7", kundeId: "k1", art: "meeting", beschreibung: "Zoom-Runde", faelligAm: "2026-09-15", uhrzeit: "10:00", zoomLink: "https://zoom.us/j/12345" },
    ];
    expect(naechsterKontakt(kontaktQuellen(kunde), JETZT)?.quelle).toBe("videotermin");
  });

  it("ein Meeting ohne Link bleibt ein gewoehnlicher Termin", () => {
    aktivitaeten.liste = [
      { id: "a8", kundeId: "k1", art: "meeting", beschreibung: "Beratung im Buero", faelligAm: "2026-09-15", uhrzeit: "10:00" },
    ];
    expect(naechsterKontakt(kontaktQuellen(kunde), JETZT)?.quelle).toBe("termin");
  });

  it("istVideoTermin nimmt nur echte Links", () => {
    expect(istVideoTermin("/raum/abc")).toBe(true);
    expect(istVideoTermin("https://zoom.us/j/1")).toBe(true);
    expect(istVideoTermin("www.zoom.us/j/1")).toBe(true);
    expect(istVideoTermin("")).toBe(false);
    expect(istVideoTermin(undefined)).toBe(false);
    expect(istVideoTermin("Raum 3, 2. Stock")).toBe(false);
  });

  it("gibt einem Follow-Up die am Kontakt gemerkte Uhrzeit mit", () => {
    // Die Tabelle follow_ups kennt keine Uhrzeit. Die Dialoge merken sie am
    // Kontakt (meta.followUpAm/followUpUhrzeit). Ein Follow-Up fuer heute
    // 10:00 muss um 12:00 ueberfaellig sein, nicht erst um 23:59.
    followUps.liste = [
      { id: "f1", kundeId: "k1", status: "offen", titel: "FU Heiko", faelligAm: "2026-07-28" },
    ];
    const mitMeta = alsKunde({ id: "k1", meta: { followUpAm: "2026-07-28", followUpUhrzeit: "10:00" } });
    const r = naechsterKontakt(kontaktQuellen(mitMeta), JETZT);
    expect(r?.quelle).toBe("follow_up");
    expect(r?.ueberfaellig).toBe(true);
  });

  it("laesst ein Follow-Up ohne gemerkte Uhrzeit bis zum Tagesende gelten", () => {
    followUps.liste = [
      { id: "f2", kundeId: "k1", status: "offen", titel: "FU anderes Datum", faelligAm: "2026-07-28" },
    ];
    const mitMeta = alsKunde({ id: "k1", meta: { followUpAm: "2026-07-20", followUpUhrzeit: "10:00" } });
    const r = naechsterKontakt(kontaktQuellen(mitMeta), JETZT);
    expect(r?.quelle).toBe("follow_up");
    expect(r?.ueberfaellig).toBe(false);
  });

  it("reicht den Aufgabentyp durch, damit ein Follow-Up auch so heisst", () => {
    offeneAufgaben.liste = [
      { id: "t2", kontaktId: "k1", titel: "FU neuer Termin", faelligAm: "2026-08-05", uhrzeit: "10:00", typ: "follow_up", status: "offen" },
    ];
    const r = naechsterKontakt(kontaktQuellen(kunde), JETZT);
    expect(r?.quelle).toBe("follow_up");
    expect(r?.bezeichnung).toBe("Follow-Up");
  });

  it("sieht einen Termin, der nur am Investment gebucht ist", () => {
    // Die Terminbuchung im Kundenprofil schreibt je Investment in
    // meta.setterTerminDatum. Traegt die Kontakt-Ebene noch einen aelteren
    // Termin, muss trotzdem der Investment-Termin gewinnen, sonst behauptet
    // das Ampel-Badge etwas anderes als die Ereigniskarte (Fall Otto Hans:
    // Badge 31.07. ueberfaellig, Karte 29.08.).
    investments.liste = [
      { id: "inv1", kontaktId: "k1", meta: { setterTerminDatum: "2026-07-30", setterTerminUhrzeit: "18:00" } },
    ];
    const mitAltemTermin = alsKunde({ id: "k1", meta: { beratungsgespraechAm: "2026-07-01" } });
    const r = naechsterKontakt(kontaktQuellen(mitAltemTermin), JETZT);
    expect(r?.quelle).toBe("termin");
    // Der juengere Investment-Termin (30.07.) gewinnt gegen den 01.07.
    expect(new Date(r!.zeitpunkt).getDate()).toBe(30);
  });

  it("beruecksichtigt bei gesetztem investmentId nur dessen Termine", () => {
    investments.liste = [
      { id: "inv1", kontaktId: "k1", meta: { setterTerminDatum: "2026-08-29" } },
      { id: "inv2", kontaktId: "k1", meta: { setterTerminDatum: "2026-07-30" } },
    ];
    const r = naechsterKontakt(kontaktQuellen(kunde, "inv2"), JETZT);
    expect(new Date(r!.zeitpunkt).getMonth()).toBe(6); // Juli
  });

  it("ignoriert erledigte Einträge und solche ohne Fälligkeit", () => {
    aktivitaeten.liste = [
      { id: "a3", kundeId: "k1", art: "aufgabe", beschreibung: "erledigt", faelligAm: "2026-11-04", erledigtAm: "2026-07-01" },
      { id: "a4", kundeId: "k1", art: "aufgabe", beschreibung: "ohne Datum" },
      { id: "a5", kundeId: "k1", art: "notiz", beschreibung: "nur eine Notiz", faelligAm: "2026-12-01" },
    ];
    const quellen = kontaktQuellen(kunde);
    expect(hatGeplantenTermin(quellen, JETZT)).toBe(false);
    expect(naechsterKontakt(quellen, JETZT)).toBeNull();
  });
});

describe("Wie der vom Setter gebuchte Termin heisst", () => {
  /*
   * `setterTerminDatum` traegt zwei verschiedene Termine, siehe
   * setterTerminName. Gemeldet bei Kai Laube und Andre Goller: In "Alle
   * Kontakte" stand "Erstgespraech 14.08.", gemeint war das
   * Beratungsgespraech.
   */
  const mitStufe = (stufe: string) =>
    ({ id: "k1", pipelineStufe: stufe, setterTerminDatum: "2026-08-14", setterTerminUhrzeit: "10:00" }) as any;

  const bezeichnungen = (k: any) => (kontaktQuellen(k).geplant || []).map((t: any) => t.bezeichnung);

  it("heisst Beratungsgespraech, sobald die Stufe dort steht", () => {
    expect(bezeichnungen(mitStufe("beratungsgespraech"))).toContain("Beratungsgespräch");
  });

  it("heisst auch spaeter im Verlauf Beratungsgespraech", () => {
    for (const stufe of ["bg_noshow", "selbstauskunft", "notar", "abgeschlossen"]) {
      expect(bezeichnungen(mitStufe(stufe))).toContain("Beratungsgespräch");
    }
  });

  it("bleibt Erstgespraech, solange das Erstgespraech noch aussteht", () => {
    for (const stufe of ["erstgespraech_geplant", "erstgespraech", "eg_noshow", "neuer_lead"]) {
      expect(bezeichnungen(mitStufe(stufe))).toContain("Erstgespräch");
    }
  });

  it("benennt Ablagen neben dem Verlauf nicht um", () => {
    // "bestandsimport", "archiviert" und "verloren" stehen in PIPELINE_STUFEN
    // hinter "abgeschlossen", sind aber kein spaeterer Schritt. Ein
    // Positionsvergleich haette sie faelschlich umbenannt.
    for (const stufe of ["bestandsimport", "archiviert", "verloren"]) {
      expect(bezeichnungen(mitStufe(stufe))).toContain("Erstgespräch");
    }
  });

  it("laesst das eigene Beratungsgespraechs-Feld unberuehrt", () => {
    const k = { id: "k1", meta: { beratungsgespraechAm: "2026-08-20" } } as any;
    expect(bezeichnungen(k)).toEqual(["Beratungsgespräch"]);
  });
});

describe("Abgehakte feste Termine", () => {
  beforeEach(() => {
    investments.liste = [];
  });

  it("lässt einen als stattgefunden abgehakten Termin weg, an Kontakt und Investment", async () => {
    const { festeTermine } = await import("@/lib/kontaktTermine");
    // Der Fall vom 29.09.2026: Beratungsgespräch 24.06., 12:30 am Kontakt und
    // als Setter-Termin an einem Investment.
    investments.liste = [
      { id: "inv1", kontaktId: "k1", meta: { setterTerminDatum: "2026-06-24", setterTerminUhrzeit: "12:30" } },
    ];
    const offen = alsKunde({ id: "k1", meta: { beratungsgespraechAm: "2026-06-24", beratungsgespraechUhrzeit: "12:30" } });
    expect(festeTermine(offen).length).toBeGreaterThan(0);

    const abgehakt = alsKunde({
      id: "k1",
      meta: { beratungsgespraechAm: "2026-06-24", beratungsgespraechUhrzeit: "12:30", erledigteTermine: ["2026-06-24 12:30"] },
    });
    expect(festeTermine(abgehakt)).toEqual([]);
  });

  it("zeigt einen verlegten Termin wieder, der alte Vermerk passt nicht mehr", async () => {
    const { festeTermine } = await import("@/lib/kontaktTermine");
    const verlegt = alsKunde({
      id: "k1",
      meta: { beratungsgespraechAm: "2026-10-02", beratungsgespraechUhrzeit: "12:30", erledigteTermine: ["2026-06-24 12:30"] },
    });
    expect(festeTermine(verlegt).map((t) => t.datum)).toEqual(["2026-10-02"]);
  });

  it("übergeht unlesbare Vermerke", async () => {
    const { erledigteTermine } = await import("@/lib/kontaktTermine");
    expect(erledigteTermine(alsKunde({ id: "k1", meta: { erledigteTermine: "2026-06-24 12:30" } }))).toEqual([]);
    expect(erledigteTermine(alsKunde({ id: "k1", meta: { erledigteTermine: ["a", 3] } }))).toEqual(["a"]);
  });
});

describe("hatVereinbartenKontakt", () => {
  beforeEach(() => {
    aktivitaeten.liste = [];
    aufgaben.liste = [];
    offeneAufgaben.liste = [];
    followUps.liste = [];
    investments.liste = [];
    inbox.liste = [];
  });

  it("zählt eine vom Partner geplante Aufgabe in der Zukunft", () => {
    aktivitaeten.liste = [
      { id: "a1", kundeId: "k1", art: "aufgabe", beschreibung: "Telefonat", faelligAm: "2026-11-23", uhrzeit: "10:00" },
    ];
    expect(hatVereinbartenKontakt(kunde, JETZT)).toBe(true);
    // 48 Stunden Schonfrist nach dem Termin
    expect(hatVereinbartenKontakt(kunde, new Date("2026-11-25T09:59:00").getTime())).toBe(true);
    expect(hatVereinbartenKontakt(kunde, new Date("2026-11-25T10:00:00").getTime())).toBe(false);
  });

  it("zählt automatische Hinweise aus der persönlichen Liste nicht als Termin", () => {
    inbox.liste = [
      { id: "i1", kundeId: "k1", titel: "Re-Engagement (14 Tage inaktiv): Max", faellig_am: "2026-07-28", uhrzeit: "13:00", typ: "anruf" },
    ];
    expect(hatVereinbartenKontakt(kunde, JETZT)).toBe(false);
  });
});

describe("Eine Sammlung für Kachel, Ampel und Pipeline (M20, 04.10.2026)", () => {
  beforeEach(() => {
    aktivitaeten.liste = [];
    aufgaben.liste = [];
    offeneAufgaben.liste = [];
    followUps.liste = [];
    investments.liste = [];
    inbox.liste = [];
  });

  it("die Ampel nennt denselben nächsten Schritt wie die Kachel im Profil", async () => {
    const { geplanteAktionenFuer } = await import("@/lib/kontaktTermine");
    const { naechsteAktion } = await import("@/lib/kundenNaechsteAktion");
    offeneAufgaben.liste = [
      { id: "m1", kontaktId: "k1", titel: "Beratung", faelligAm: "2026-08-10", uhrzeit: "14:00", typ: "meeting", status: "offen" },
      { id: "t1", kontaktId: "k1", titel: "Unterlagen anfordern", faelligAm: "2026-08-20", status: "offen" },
    ];
    const kachel = naechsteAktion(geplanteAktionenFuer(kunde, undefined, {}, new Date(JETZT)));
    const ampel = naechsterKontakt(kontaktQuellen(kunde), JETZT);
    expect(kachel?.zeitpunkt).toBe(new Date(ampel!.zeitpunkt).getTime());
    // Ein Meeting als Aufgabe heißt jetzt auch in der Ampel Termin.
    expect(kachel?.art).toBe("termin");
    expect(ampel?.quelle).toBe("termin");
  });

  it("die alte persönliche Inbox-Liste zählt nicht mehr als geplanter Kontakt", () => {
    inbox.liste = [{ kundeId: "k1", titel: "Alte Erinnerung", faellig_am: "2026-09-01" }];
    expect(hatGeplantenTermin(kontaktQuellen(kunde), JETZT)).toBe(false);
  });

  it("Wiedervorlagen bleiben für die Ampel Wartephase", () => {
    offeneAufgaben.liste = [
      { id: "w1", kontaktId: "k1", titel: "Erneut anrufen", faelligAm: "2026-08-01", status: "offen", ausloeserSchluessel: "nicht_erreicht:k1" } as never,
    ];
    expect(naechsterKontakt(kontaktQuellen(kunde), JETZT)?.quelle).toBe("wartephase");
    expect(hatGeplantenTermin(kontaktQuellen(kunde), JETZT)).toBe(false);
  });
});
