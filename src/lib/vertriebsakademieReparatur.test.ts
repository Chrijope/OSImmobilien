import { describe, it, expect, vi, beforeEach } from "vitest";

// jsdom bringt hier keinen localStorage mit, der Fortschrittsspeicher braucht ihn.
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ upsert: async () => ({}) }),
    rpc: async () => ({ data: null, error: null }),
  },
}));

const STORAGE_KEY = "vertriebsakademie_progress_v1";
const REPARATUR_KEY = "vertriebsakademie_reparatur_versuche_v1";

type Ergebnis = { versuche: number; geloest: boolean; punkte: number };

function fortschrittAblegen(aufgaben: Record<string, Ergebnis>) {
  speicher.set(STORAGE_KEY, JSON.stringify({
    checks: {}, uebungen: {}, kapitelDone: {}, sectionsDone: {}, answers: {}, aufgaben, abwaegung: {},
  }));
}

/** Laedt das Modul frisch, so wie ein neuer Seitenaufruf im Browser. */
async function moduleFrischLaden() {
  vi.resetModules();
  return await import("@/lib/vertriebsakademieProgress");
}

function gespeicherteAufgaben(): Record<string, Ergebnis> {
  return JSON.parse(speicher.get(STORAGE_KEY) || "{}").aufgaben || {};
}

describe("Einmalige Reparatur der Schleifen-Zaehler", () => {
  beforeEach(() => {
    speicher.clear();
    vi.useRealTimers();
  });

  it("setzt eine nicht geloeste Aufgabe mit unplausibel hoher Versuchszahl zurueck", async () => {
    fortschrittAblegen({
      "grundlagen::quiz-eins": { versuche: 51, geloest: false, punkte: 0 },
    });
    const m = await moduleFrischLaden();
    expect(m.vaProgress.get().aufgaben["grundlagen::quiz-eins"].versuche).toBe(0);
    expect(gespeicherteAufgaben()["grundlagen::quiz-eins"].versuche).toBe(0);
  });

  it("laesst eine geloeste Aufgabe vollstaendig unangetastet, auch bei 51 Versuchen", async () => {
    fortschrittAblegen({
      "grundlagen::quiz-eins": { versuche: 51, geloest: true, punkte: 5 },
    });
    const m = await moduleFrischLaden();
    const e = m.vaProgress.get().aufgaben["grundlagen::quiz-eins"];
    expect(e.versuche).toBe(51);
    expect(e.geloest).toBe(true);
    expect(e.punkte).toBe(5);
  });

  it("laesst eine nicht geloeste Aufgabe mit wenigen Versuchen unveraendert", async () => {
    fortschrittAblegen({
      "grundlagen::quiz-eins": { versuche: 3, geloest: false, punkte: 0 },
    });
    const m = await moduleFrischLaden();
    expect(m.vaProgress.get().aufgaben["grundlagen::quiz-eins"].versuche).toBe(3);
  });

  it("greift genau an der Schwelle und eins darunter nicht", async () => {
    const m0 = await moduleFrischLaden();
    const schwelle = m0.SCHLEIFEN_SCHWELLE;
    speicher.clear();
    fortschrittAblegen({
      "a::knapp-drunter": { versuche: schwelle - 1, geloest: false, punkte: 0 },
      "a::genau-drauf": { versuche: schwelle, geloest: false, punkte: 0 },
    });
    const m = await moduleFrischLaden();
    const s = m.vaProgress.get().aufgaben;
    expect(s["a::knapp-drunter"].versuche).toBe(schwelle - 1);
    expect(s["a::genau-drauf"].versuche).toBe(0);
  });

  it("laeuft nur einmal je Browser, ein zweiter Seitenaufruf repariert nichts mehr", async () => {
    fortschrittAblegen({ "grundlagen::quiz-eins": { versuche: 51, geloest: false, punkte: 0 } });
    const erst = await moduleFrischLaden();
    expect(erst.vaProgress.get().aufgaben["grundlagen::quiz-eins"].versuche).toBe(0);
    expect(speicher.get(REPARATUR_KEY)).toBeTruthy();

    // Neuer hoher Stand, zweiter Seitenaufruf: der Merker verhindert den Lauf.
    fortschrittAblegen({ "grundlagen::quiz-zwei": { versuche: 40, geloest: false, punkte: 0 } });
    const zweit = await moduleFrischLaden();
    expect(zweit.vaProgress.get().aufgaben["grundlagen::quiz-zwei"].versuche).toBe(40);
  });

  it("setzt den Merker auch dann, wenn es nichts zu bereinigen gab", async () => {
    fortschrittAblegen({ "grundlagen::quiz-eins": { versuche: 2, geloest: false, punkte: 0 } });
    await moduleFrischLaden();
    expect(speicher.get(REPARATUR_KEY)).toBeTruthy();
  });

  it("bereinigeSchleifenZaehler laesst den Zustand unveraendert, wenn nichts betroffen ist", async () => {
    const m = await moduleFrischLaden();
    const s = {
      checks: {}, uebungen: {}, kapitelDone: {}, sectionsDone: {}, answers: {}, abwaegung: {}, aktiveTage: [],
      aufgaben: { "a::b": { versuche: 1, geloest: true, punkte: 10 } },
    };
    const { next, bereinigt } = m.bereinigeSchleifenZaehler(s);
    expect(bereinigt).toEqual([]);
    expect(next).toBe(s);
  });
});

describe("Bremse gegen Zaehlerschleifen in setAufgabe", () => {
  beforeEach(() => {
    speicher.clear();
    vi.useRealTimers();
  });

  it("zaehlt denselben Schluessel innerhalb einer Sekunde nur einmal", async () => {
    const m = await moduleFrischLaden();
    m.vaProgress.reset();
    for (let i = 0; i < 51; i++) m.vaProgress.setAufgabe("kap", "quiz", false);
    expect(m.vaProgress.get().aufgaben["kap::quiz"].versuche).toBe(1);
    expect(m.unterdrueckteVersucheGesamt()).toBe(50);
  });

  it("zaehlt einen echten zweiten Versuch nach mehr als einer Sekunde normal", async () => {
    const m = await moduleFrischLaden();
    m.vaProgress.reset();
    vi.useFakeTimers();
    m.vaProgress.setAufgabe("kap", "quiz", false);
    vi.advanceTimersByTime(1500);
    m.vaProgress.setAufgabe("kap", "quiz", false);
    vi.useRealTimers();
    expect(m.vaProgress.get().aufgaben["kap::quiz"].versuche).toBe(2);
  });

  it("speichert das Ergebnis auch dann, wenn der Zaehler gebremst wurde", async () => {
    const m = await moduleFrischLaden();
    m.vaProgress.reset();
    m.vaProgress.setAufgabe("kap", "quiz", false);
    m.vaProgress.setAufgabe("kap", "quiz", true);
    const e = m.vaProgress.get().aufgaben["kap::quiz"];
    expect(e.geloest).toBe(true);
    expect(e.versuche).toBe(1);
  });
});
