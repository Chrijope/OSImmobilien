import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Der Durchgang über alle Objekte für Admin und Inhaber.
 *
 * Christian am 23.09.2026: „Alle Objekte durchgehen und bei allen eine
 * Beschreibung und fünf Standortargumente hinterlegen, sodass es bei allen
 * angezeigt wird.“ Geprüft wird das, was im Ernstfall Geld kostet oder ein
 * Objekt ohne Text zurücklässt:
 *
 *   1. Das höhere Kontingent bekommt nur, wer Admin oder Inhaber ist, und das
 *      entscheidet die Function aus `user_roles`, nicht aus der Anfrage.
 *   2. Angefasst wird, was einen Lauf braucht, und nur das.
 *   3. Der Durchgang hört nicht nach zwanzig auf, aber an jeder Grenze.
 *   4. Anhalten und „nur die Fehlgeschlagenen“ tun, was sie sagen.
 *   5. Der Stand „58 von 91 fertig“ zählt richtig.
 */

import {
  OBJEKT_TEXTE_META_SCHLUESSEL,
  OBJEKT_TEXTE_SCHEMA,
  type ObjektTexte,
} from "../../supabase/functions/_shared/objekt-texte";
import {
  istLeitung,
  KONTINGENT_LEITUNG,
  KONTINGENT_STANDARD,
  kontingentFuer,
  LEITUNGSROLLEN,
} from "../../supabase/functions/_shared/objekt-texte-kontingent";
import type { SammellaufObjekt } from "@/lib/objektTexteSammellauf";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) } },
}));

vi.mock("@/lib/objekteStore", () => ({
  updateObjektFieldFast: vi.fn(async () => undefined),
  getObjektById: vi.fn(() => undefined),
}));

const cache = vi.hoisted(() => ({
  objekte: [] as Array<{ id: string; meta: Record<string, unknown> }>,
  neuGeladen: 0,
}));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: vi.fn(() => cache.objekte),
  cacheReload: vi.fn(async () => { cache.neuGeladen += 1; }),
}));

const meldungen = vi.hoisted(() => ({ liste: [] as Array<Record<string, unknown>> }));
vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn((m: Record<string, unknown>) => { meldungen.liste.push(m); }),
}));

const {
  FEHLER_IN_FOLGE_MAX,
  GRUND_OHNE_ANGABEN,
  objektTexteGesamtlauf,
  texteFertig,
  waehleGesamtlauf,
  zaehleTexteStand,
} = await import("@/lib/objektTexteGesamtlauf");
const {
  KONTINGENT_STUNDE,
  KONTINGENT_TAG,
  KONTINGENT_STUNDE_LEITUNG,
  KONTINGENT_TAG_LEITUNG,
  grenzeSatz,
} = await import("@/lib/objektTexteSammellauf");
const store = await import("@/lib/objektTexteGesamtlaufStore");

// ── Bausteine ───────────────────────────────────────────────────────────────

const FUENF = ["Eins.", "Zwei.", "Drei.", "Vier.", "Fünf."];

function stand(teil: Partial<ObjektTexte> = {}): ObjektTexte {
  return {
    schema: OBJEKT_TEXTE_SCHEMA,
    kurzbeschreibung: "Ein Haus von 1962 in Augsburg.",
    standortargumente: FUENF.map((argument) => ({ argument, beleg: "Beleg" })),
    sanierungen: [],
    erzeugtAm: "2026-09-23T10:00:00.000Z",
    modell: "google/gemini-2.5-flash",
    quellenStand: "abc",
    quellen: ["Titel: X"],
    beanstandungen: [],
    ...teil,
  };
}

const vermerk = () => stand({ kurzbeschreibung: "", standortargumente: [], ohneErgebnis: "Die Umgebung fehlt." });

type TestObjekt = SammellaufObjekt & { meta: Record<string, unknown> };

/** Ein Objekt; ohne `meta` ganz ohne Text. */
function objekt(id: string, meta: Record<string, unknown> = {}, titel = `Haus ${id}`): TestObjekt {
  return { id, titel, meta, dokumente: [], beschreibung: "" };
}

/** Ein Objekt mit gespeichertem Stand, so wie die Function ihn ablegt: Stand plus gepflegte Felder. */
function mitStand(id: string, texte: ObjektTexte, felder = true) {
  const meta: Record<string, unknown> = { [OBJEKT_TEXTE_META_SCHLUESSEL]: texte };
  if (felder && texte.kurzbeschreibung) meta.kurzbeschreibung = texte.kurzbeschreibung;
  if (felder && texte.standortargumente.length > 0) meta.standortargumente = texte.standortargumente.map((a) => a.argument);
  return objekt(id, meta);
}

const gelungen = (texte: ObjektTexte = stand()) => ({ texte, neu: true, gespeichert: true, fehler: "" });

function ohneWartezeit() {
  const pausen: number[] = [];
  return { pausen, warte: async (ms: number) => { pausen.push(ms); } };
}

beforeEach(() => {
  cache.objekte = [];
  cache.neuGeladen = 0;
  meldungen.liste = [];
  store.vergissGesamtlauf();
});

// ── 1. Kontingent je Rolle ──────────────────────────────────────────────────

describe("Das Kontingent je Rolle", () => {
  it("gibt Admin und Inhaber 150 je Stunde und 400 je Tag, allen anderen 20 und 100", () => {
    expect(KONTINGENT_LEITUNG).toEqual({ stunde: 150, tag: 400 });
    expect(KONTINGENT_STANDARD).toEqual({ stunde: 20, tag: 100 });
    expect(kontingentFuer(true)).toBe(KONTINGENT_LEITUNG);
    expect(kontingentFuer(false)).toBe(KONTINGENT_STANDARD);
    expect([...LEITUNGSROLLEN].sort()).toEqual(["admin", "inhaber"]);
  });

  it("erkennt die Leitung nur an den Rollen admin und inhaber", () => {
    expect(istLeitung(["admin"])).toBe(true);
    expect(istLeitung(["vertriebspartner", "inhaber"])).toBe(true);
    expect(istLeitung(["objektpartner"])).toBe(false);
    expect(istLeitung(["vertriebsleiter", "backoffice"])).toBe(false);
    // Kaputte oder fehlende Angaben ergeben das normale Kontingent.
    expect(istLeitung([])).toBe(false);
    expect(istLeitung(null)).toBe(false);
    expect(istLeitung("admin")).toBe(false);
    expect(istLeitung([{ role: "admin" }])).toBe(false);
  });

  it("liest im Browser dieselben Zahlen wie die Function", () => {
    expect(KONTINGENT_STUNDE).toBe(KONTINGENT_STANDARD.stunde);
    expect(KONTINGENT_TAG).toBe(KONTINGENT_STANDARD.tag);
    expect(KONTINGENT_STUNDE_LEITUNG).toBe(KONTINGENT_LEITUNG.stunde);
    expect(KONTINGENT_TAG_LEITUNG).toBe(KONTINGENT_LEITUNG.tag);
  });

  it("nennt an der Grenze die Zahl der jeweiligen Rolle", () => {
    expect(grenzeSatz("stunde")).toContain("von 20 Läufen");
    expect(grenzeSatz("stunde", KONTINGENT_LEITUNG)).toContain("von 150 Läufen");
    expect(grenzeSatz("tag", KONTINGENT_LEITUNG)).toContain("von 400 Läufen");
  });

  describe("in der Function, am Quelltext geprüft", () => {
    const quelle = readFileSync(resolve(process.cwd(), "supabase/functions/objekt-texte-ki/index.ts"), "utf8");
    const handler = quelle.slice(quelle.indexOf("Deno.serve("));

    it("hat keine feste 20/100 mehr, sondern das Kontingent je Rolle", () => {
      expect(handler).not.toMatch(/perHour:\s*20/);
      expect(handler).toMatch(/const leitung = await aufruferIstLeitung\(db, nutzerId\);\s*const grenzen = kontingentFuer\(leitung\)/);
      expect(handler).toMatch(/perHour:\s*grenzen\.stunde/);
      expect(handler).toMatch(/perDay:\s*grenzen\.tag/);
    });

    it("bestimmt die Rolle erst nach der Anmeldung und vor der Kontingentprüfung", () => {
      const anmeldung = handler.indexOf("db.auth.getUser()");
      const rolle = handler.indexOf("aufruferIstLeitung(db, nutzerId)");
      const pruefung = handler.indexOf('scope: "objekt-texte-ki"');
      expect(anmeldung).toBeGreaterThan(-1);
      expect(rolle).toBeGreaterThan(anmeldung);
      expect(pruefung).toBeGreaterThan(rolle);
    });

    it("liest die Rollen aus user_roles mit dem Nutzertoken, nie aus dem Rumpf", () => {
      const beginn = quelle.indexOf("async function aufruferIstLeitung");
      const hilfe = quelle.slice(beginn, quelle.indexOf("\n}\n", beginn) + 2);
      expect(beginn).toBeGreaterThan(-1);
      expect(hilfe).toContain('db.from("user_roles").select("role").eq("user_id", nutzerId)');
      expect(hilfe).not.toContain("rumpf");
      // Kann die Rolle nicht gelesen werden, gilt das normale Kontingent.
      expect(hilfe).toMatch(/if \(error\) \{[\s\S]*?return false;/);
      expect(handler).not.toMatch(/rumpf\??\.(rolle|role|leitung|admin)/i);
    });
  });
});

// ── 2. Was der Durchgang anfasst ────────────────────────────────────────────

describe("Welche Objekte der Durchgang anfasst", () => {
  it("nimmt Objekte ohne Stand ohne Neuerzeugen, damit ein inzwischen gefülltes nichts kostet", () => {
    const auswahl = waehleGesamtlauf([objekt("a")]);
    expect(auswahl.auftraege).toHaveLength(1);
    expect(auswahl.auftraege[0]).toMatchObject({ anlass: "ohne-stand", neuErzeugen: false });
  });

  it("nimmt einen Stand der Fassung 1 wie fehlend", () => {
    const alt = mitStand("a", { ...stand(), schema: 1 });
    expect(waehleGesamtlauf([alt]).auftraege[0]?.anlass).toBe("ohne-stand");
  });

  it("nimmt Objekte mit Handtexten trotzdem einmal mit, wegen Sanierungen und Standortanalyse", () => {
    const vonHand = objekt("a", { kurzbeschreibung: "Selbst geschrieben.", standortargumente: FUENF });
    expect(waehleGesamtlauf([vonHand]).auftraege[0]?.anlass).toBe("ohne-stand");
  });

  it("erzeugt einen Vermerk ohne Ergebnis neu", () => {
    const auswahl = waehleGesamtlauf([mitStand("a", vermerk())]);
    expect(auswahl.auftraege[0]).toMatchObject({ anlass: "vermerk", neuErzeugen: true });
  });

  it("erzeugt neu, wenn weniger als fünf erzeugte Argumente oder keine Beschreibung zu sehen sind", () => {
    const dreiArgumente = mitStand("a", stand({ standortargumente: FUENF.slice(0, 3).map((argument) => ({ argument, beleg: "B" })) }));
    const ohneBeschreibung = mitStand("b", stand({ kurzbeschreibung: "" }));
    const auswahl = waehleGesamtlauf([dreiArgumente, ohneBeschreibung]);
    expect(auswahl.auftraege.map((a) => [a.objekt.id, a.anlass, a.neuErzeugen])).toEqual([
      ["a", "unvollstaendig", true],
      ["b", "unvollstaendig", true],
    ]);
  });

  it("lässt fertige Objekte liegen, ohne aufzurufen", () => {
    const auswahl = waehleGesamtlauf([mitStand("a", stand())]);
    expect(auswahl.auftraege).toHaveLength(0);
    expect(auswahl.vorhanden.map((o) => o.id)).toEqual(["a"]);
  });

  it("überspringt mit Grund, wenn die Lücke in von Hand gepflegten Argumenten liegt", () => {
    const o = mitStand("a", stand());
    o.meta.standortargumente = ["Selbst eins.", "Selbst zwei."];
    const auswahl = waehleGesamtlauf([o]);
    expect(auswahl.auftraege).toHaveLength(0);
    expect(auswahl.uebersprungen[0].grund).toContain("nur 2 Standortargumente");
  });

  it("überspringt mit Grund, wenn zum Objekt gar keine Angaben stehen", () => {
    const leer = mitStand("a", vermerk());
    leer.titel = "";
    const auswahl = waehleGesamtlauf([leer]);
    expect(auswahl.auftraege).toHaveLength(0);
    expect(auswahl.uebersprungen[0].grund).toBe(GRUND_OHNE_ANGABEN);
  });

  it("nimmt die ganz ohne Text zuerst, dann die unvollständigen, zuletzt die Vermerke", () => {
    const auswahl = waehleGesamtlauf([
      mitStand("v", vermerk()),
      mitStand("u", stand({ kurzbeschreibung: "" })),
      objekt("o1"),
      objekt("o2"),
      { ...objekt("x"), id: "" },
    ]);
    expect(auswahl.auftraege.map((a) => a.objekt.id)).toEqual(["o1", "o2", "u", "v"]);
  });
});

// ── 3. Der Durchgang ────────────────────────────────────────────────────────

describe("Der Durchgang", () => {
  it("arbeitet mehr als zwanzig Objekte in einem Rutsch ab, nacheinander", async () => {
    const viele = Array.from({ length: 45 }, (_, i) => objekt(`o${i}`));
    const gerufen: string[] = [];
    let gleichzeitig = 0;
    let hoechstens = 0;
    const { pausen, warte } = ohneWartezeit();

    const bericht = await objektTexteGesamtlauf(viele, {
      erzeuge: async (id) => {
        gleichzeitig += 1;
        hoechstens = Math.max(hoechstens, gleichzeitig);
        gerufen.push(id);
        await new Promise((fertig) => setTimeout(fertig, 0));
        gleichzeitig -= 1;
        return gelungen();
      },
      warte,
    });

    expect(gerufen).toHaveLength(45);
    expect(hoechstens).toBe(1);
    expect(bericht.erzeugt).toBe(45);
    expect(bericht.ende).toBe("fertig");
    expect(bericht.offen).toEqual([]);
    // Zwischen 45 Aufrufen liegen 44 Pausen.
    expect(pausen).toHaveLength(44);
  });

  it("schickt Neuerzeugen nur, wo ein vorhandener Stand ersetzt werden soll", async () => {
    const wie: Array<[string, boolean]> = [];
    await objektTexteGesamtlauf([objekt("neu"), mitStand("v", vermerk())], {
      erzeuge: async (id, w) => { wie.push([id, w.neuErzeugen]); return gelungen(); },
      warte: ohneWartezeit().warte,
    });
    expect(wie).toEqual([["neu", false], ["v", true]]);
  });

  it("fasst erst gar nicht an, was vorab fertig oder ohne Grundlage ist", async () => {
    const leer = objekt("leer");
    leer.titel = "";
    let gerufen = 0;
    const bericht = await objektTexteGesamtlauf([mitStand("fertig", stand()), leer], {
      erzeuge: async () => { gerufen += 1; return gelungen(); },
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toBe(0);
    expect(bericht.schonVorhanden).toBe(1);
    expect(bericht.uebersprungen).toHaveLength(1);
  });

  it("sieht vor jedem Objekt nach, ob der Server es inzwischen gefüllt hat", async () => {
    const gerufen: string[] = [];
    const bericht = await objektTexteGesamtlauf([objekt("a"), objekt("b")], {
      erzeuge: async (id) => { gerufen.push(id); return gelungen(); },
      aktuellesMeta: (id) => (id === "b" ? mitStand("b", stand()).meta : undefined),
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toEqual(["a"]);
    expect(bericht.erzeugt).toBe(1);
    expect(bericht.schonVorhanden).toBe(1);
  });

  it("zählt eine unveränderte Rückgabe als schon vorhanden, nicht als erzeugt", async () => {
    const bericht = await objektTexteGesamtlauf([objekt("a")], {
      erzeuge: async () => ({ texte: stand(), neu: false, gespeichert: true, fehler: "" }),
      warte: ohneWartezeit().warte,
    });
    expect(bericht.erzeugt).toBe(0);
    expect(bericht.schonVorhanden).toBe(1);
  });

  it("zählt eine fehlende Grundlage (422) als übersprungen, nicht als Fehler", async () => {
    const bericht = await objektTexteGesamtlauf([mitStand("v", vermerk())], {
      erzeuge: async () => ({ neu: false, gespeichert: false, fehler: "Keine Angaben gepflegt.", status: 422 }),
      warte: ohneWartezeit().warte,
    });
    expect(bericht.fehlgeschlagen).toEqual([]);
    expect(bericht.uebersprungen[0]).toMatchObject({ id: "v", grund: "Keine Angaben gepflegt." });
  });

  it("meldet, wenn nach dem Lauf noch Argumente fehlen, und sagt, ob es an den Handtexten liegt", async () => {
    const drei = stand({ standortargumente: FUENF.slice(0, 3).map((argument) => ({ argument, beleg: "B" })) });
    const vonHand = objekt("h", { kurzbeschreibung: "Selbst.", standortargumente: ["Nur eins."] });
    const bericht = await objektTexteGesamtlauf([objekt("a"), vonHand], {
      erzeuge: async (id) => gelungen(id === "a" ? drei : stand()),
      warte: ohneWartezeit().warte,
    });
    expect(bericht.erzeugt).toBe(2);
    expect(bericht.unvollstaendig.find((e) => e.id === "a")?.grund).toContain("Nur 3 von 5");
    expect(bericht.unvollstaendig.find((e) => e.id === "h")?.grund).toContain("nur ein Standortargument");
  });

  it("hält vorsorglich am stündlichen Kontingent an und nennt, was offen bleibt", async () => {
    const viele = Array.from({ length: 5 }, (_, i) => objekt(`o${i}`));
    let gerufen = 0;
    const bericht = await objektTexteGesamtlauf(viele, {
      erzeuge: async () => { gerufen += 1; return gelungen(); },
      kontingent: { stunde: 3, tag: 10 },
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toBe(3);
    expect(bericht.ende).toBe("kontingent");
    expect(bericht.offen.map((e) => e.id)).toEqual(["o3", "o4"]);
    expect(bericht.grenzeText).toContain("2 Objekte bleiben");
  });
});

// ── 4. Grenzen, Störung, Anhalten ───────────────────────────────────────────

describe("An einer Grenze hält der Durchgang an", () => {
  const grenzfaelle = [
    ["stunde", "stündliche Kontingent von 150"],
    ["tag", "Tageskontingent von 400"],
    ["gateway", "bremst"],
    ["guthaben", "Guthaben"],
  ] as const;

  for (const [grenze, satz] of grenzfaelle) {
    it(`bei „${grenze}“, und das betroffene Objekt bleibt offen`, async () => {
      let gerufen = 0;
      const bericht = await objektTexteGesamtlauf([objekt("a"), objekt("b"), objekt("c"), objekt("d")], {
        erzeuge: async () => {
          gerufen += 1;
          return gerufen === 2 ? { neu: false, gespeichert: false, fehler: "Grenze.", grenze } : gelungen();
        },
        warte: ohneWartezeit().warte,
      });
      expect(gerufen).toBe(2);
      expect(bericht.ende).toBe("kontingent");
      expect(bericht.grenzeText).toContain(satz);
      expect(bericht.erzeugt).toBe(1);
      expect(bericht.fehlgeschlagen).toEqual([]);
      expect(bericht.offen.map((e) => e.id)).toEqual(["b", "c", "d"]);
    });
  }

  it("läuft an einzelnen Fehlschlägen vorbei, hält aber nach mehreren in Folge an", async () => {
    const viele = Array.from({ length: 12 }, (_, i) => objekt(`o${i}`));
    let gerufen = 0;
    const bericht = await objektTexteGesamtlauf(viele, {
      erzeuge: async () => {
        gerufen += 1;
        // Das erste gelingt, danach geht alles schief.
        return gerufen === 1 ? gelungen() : { neu: false, gespeichert: false, fehler: "Serverfehler.", status: 500 };
      },
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toBe(1 + FEHLER_IN_FOLGE_MAX);
    expect(bericht.ende).toBe("stoerung");
    expect(bericht.fehlgeschlagen).toHaveLength(FEHLER_IN_FOLGE_MAX);
    expect(bericht.offen).toHaveLength(12 - 1 - FEHLER_IN_FOLGE_MAX);
  });

  it("zählt einen Fehlschlag zwischen Erfolgen nicht als Störung", async () => {
    let gerufen = 0;
    const bericht = await objektTexteGesamtlauf(Array.from({ length: 10 }, (_, i) => objekt(`o${i}`)), {
      erzeuge: async () => {
        gerufen += 1;
        return gerufen % 2 === 0 ? { neu: false, gespeichert: false, fehler: "Einzeln kaputt." } : gelungen();
      },
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toBe(10);
    expect(bericht.ende).toBe("fertig");
    expect(bericht.fehlgeschlagen).toHaveLength(5);
  });
});

describe("Anhalten", () => {
  it("hält vor dem nächsten Objekt an und behält, was geschrieben wurde", async () => {
    let anhalten = false;
    const gerufen: string[] = [];
    const bericht = await objektTexteGesamtlauf([objekt("a"), objekt("b"), objekt("c")], {
      erzeuge: async (id) => { gerufen.push(id); anhalten = true; return gelungen(); },
      abgebrochen: () => anhalten,
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toEqual(["a"]);
    expect(bericht.ende).toBe("abgebrochen");
    expect(bericht.erzeugt).toBe(1);
    expect(bericht.offen.map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("hält auch während der Pause an, ohne noch ein Objekt zu starten", async () => {
    let anhalten = false;
    const gerufen: string[] = [];
    const bericht = await objektTexteGesamtlauf([objekt("a"), objekt("b")], {
      erzeuge: async (id) => { gerufen.push(id); return gelungen(); },
      abgebrochen: () => anhalten,
      warte: async () => { anhalten = true; },
    });
    expect(gerufen).toEqual(["a"]);
    expect(bericht.ende).toBe("abgebrochen");
    expect(bericht.offen.map((e) => e.id)).toEqual(["b"]);
  });
});

// ── 5. Der Lauf außerhalb der Komponente ────────────────────────────────────

describe("Der Durchgang im Modul, über Seitenwechsel hinweg", () => {
  it("nimmt beim erneuten Versuch nur die Fehlgeschlagenen", async () => {
    const liste = [objekt("a"), objekt("b"), objekt("c"), objekt("d")];
    const ersteRunde = await store.starteGesamtlauf(liste, "alle", {
      erzeuge: async (id) => (id === "b" || id === "d" ? { neu: false, gespeichert: false, fehler: "Kaputt." } : gelungen()),
      warte: ohneWartezeit().warte,
    });
    const fehlgeschlagen = new Set(ersteRunde!.fehlgeschlagen.map((e) => e.id));
    expect([...fehlgeschlagen]).toEqual(["b", "d"]);

    const gerufen: string[] = [];
    const zweiteRunde = await store.starteGesamtlauf(liste.filter((o) => fehlgeschlagen.has(o.id)), "fehlgeschlagene", {
      erzeuge: async (id) => { gerufen.push(id); return gelungen(); },
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toEqual(["b", "d"]);
    expect(zweiteRunde!.erzeugt).toBe(2);
    expect(store.gesamtlaufZustand().art).toBe("fehlgeschlagene");
  });

  it("hält den Zustand im Modul, startet keinen zweiten Durchgang und lässt sich anhalten", async () => {
    let freigeben: () => void = () => undefined;
    const gerufen: string[] = [];
    const erster = store.starteGesamtlauf([objekt("a"), objekt("b"), objekt("c")], "alle", {
      erzeuge: async (id) => {
        gerufen.push(id);
        await new Promise<void>((fertig) => { freigeben = fertig; });
        return gelungen();
      },
      warte: ohneWartezeit().warte,
    });

    // Unterwegs: Jede Komponente, die jetzt neu aufgebaut wird, liest denselben Stand.
    await Promise.resolve();
    expect(store.gesamtlaufZustand().laeuft).toBe(true);
    expect(store.gesamtlaufZustand().fortschritt).toMatchObject({ nummer: 1, gesamt: 3 });
    expect(await store.starteGesamtlauf([objekt("x")], "alle")).toBeUndefined();

    store.halteGesamtlaufAn();
    expect(store.gesamtlaufZustand().haeltAn).toBe(true);
    freigeben();
    const bericht = await erster;

    expect(gerufen).toEqual(["a"]);
    expect(bericht!.ende).toBe("abgebrochen");
    expect(store.gesamtlaufZustand()).toMatchObject({ laeuft: false, haeltAn: false });
    expect(store.gesamtlaufZustand().bericht?.erzeugt).toBe(1);
  });

  it("lädt am Ende den Zwischenspeicher neu und meldet das Ergebnis", async () => {
    await store.starteGesamtlauf([objekt("a")], "alle", {
      erzeuge: async () => gelungen(),
      warte: ohneWartezeit().warte,
    });
    expect(cache.neuGeladen).toBe(1);
    expect(meldungen.liste.at(-1)?.title).toBe("Ein Objekt hat jetzt Texte.");
  });

  it("liest vor jedem Objekt aus dem Zwischenspeicher, was der Server inzwischen geschrieben hat", async () => {
    cache.objekte = [{ id: "a", meta: mitStand("a", stand()).meta }];
    const gerufen: string[] = [];
    const bericht = await store.starteGesamtlauf([objekt("a"), objekt("b")], "alle", {
      erzeuge: async (id) => { gerufen.push(id); return gelungen(); },
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toEqual(["b"]);
    expect(bericht!.schonVorhanden).toBe(1);
  });
});

// ── 6. Der Stand in der Objektübersicht ─────────────────────────────────────

describe("Der Stand „Texte: 58 von 91 Objekten fertig“", () => {
  it("zählt Stand der Fassung 2 mit Beschreibung und fünf Argumenten oder gepflegte Handtexte", () => {
    const fertigErzeugt = mitStand("a", stand());
    // Die Function konnte die Felder nicht füllen, der Stand allein zählt trotzdem.
    const nurImStand = mitStand("b", stand(), false);
    const vonHand = objekt("c", { kurzbeschreibung: "Selbst geschrieben.", standortargumente: FUENF });
    const dreiArgumente = mitStand("d", stand({ standortargumente: FUENF.slice(0, 3).map((argument) => ({ argument, beleg: "B" })) }));
    const nurVermerk = mitStand("e", vermerk());
    const nichts = objekt("f");
    // Ein Text der Fassung 1 steht zwar da, gilt aber nicht als fertig.
    const alt = mitStand("g", { ...stand(), schema: 1 });
    const halbVonHand = objekt("h", { kurzbeschreibung: "Selbst geschrieben." });

    const liste = [fertigErzeugt, nurImStand, vonHand, dreiArgumente, nurVermerk, nichts, alt, halbVonHand];
    expect(liste.map((o) => texteFertig(o))).toEqual([true, true, true, false, false, false, false, false]);
    expect(zaehleTexteStand(liste)).toEqual({ fertig: 3, gesamt: 8 });
  });

  it("zählt Einträge ohne Kennung nicht mit und verträgt eine leere Liste", () => {
    expect(zaehleTexteStand([{ ...mitStand("a", stand()), id: "" }])).toEqual({ fertig: 0, gesamt: 0 });
    expect(zaehleTexteStand([])).toEqual({ fertig: 0, gesamt: 0 });
  });
});

// ── 7. Fassung 3, Function nicht ausgerollt, Fehlergrund ────────────────────

describe("Ist die Function nicht ausgerollt, hält der Durchgang sofort an", () => {
  const nichtAusgerollt = {
    neu: false,
    gespeichert: false,
    fehler: "Die Function objekt-texte-ki ist noch nicht ausgerollt, auf dem Server gibt es sie noch nicht.",
    funktion: "fehlt" as const,
  };

  it("zählt kein Objekt als fehlgeschlagen und lässt alle offen", async () => {
    let gerufen = 0;
    const bericht = await objektTexteGesamtlauf([objekt("a"), objekt("b"), objekt("c")], {
      erzeuge: async () => { gerufen += 1; return nichtAusgerollt; },
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toBe(1);
    expect(bericht.ende).toBe("nicht-ausgerollt");
    expect(bericht.fehlgeschlagen).toEqual([]);
    expect(bericht.offen.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(bericht.grenzeText).toContain("noch nicht ausgerollt");
  });

  it("meldet das am Ende rot und ohne Zahlenrauschen", async () => {
    await store.starteGesamtlauf([objekt("a")], "alle", { erzeuge: async () => nichtAusgerollt, warte: ohneWartezeit().warte });
    expect(meldungen.liste.at(-1)).toMatchObject({
      title: "Der Durchgang konnte nicht starten.",
      variant: "destructive",
    });
    expect(String(meldungen.liste.at(-1)?.description)).toContain("noch nicht ausgerollt");
  });
});

describe("Bei mehreren Fehlschlägen in Folge steht der Grund dabei", () => {
  it("nennt den Grund des letzten Fehlschlags im Satz", async () => {
    const grund = "Die KI-Schnittstelle hat die Anfrage abgelehnt (Status 400: Request too large).";
    const bericht = await objektTexteGesamtlauf(Array.from({ length: 8 }, (_, i) => objekt(`o${i}`)), {
      erzeuge: async () => ({ neu: false, gespeichert: false, fehler: grund, status: 502 }),
      warte: ohneWartezeit().warte,
    });
    expect(bericht.ende).toBe("stoerung");
    expect(bericht.grenzeText).toContain(`Zuletzt: ${grund}`);
    // Und je Objekt steht er in der Liste der Fehlgeschlagenen.
    expect(bericht.fehlgeschlagen[0]).toMatchObject({ id: "o0", titel: "Haus o0", grund });
  });
});

describe("Die Anhebung auf Fassung 4", () => {
  const FASSUNG_2 = { ...stand(), schema: 2 };
  const FASSUNG_3 = { ...stand(), schema: 3 };

  it("zählt jedes Objekt mit einem Stand der vorigen Fassung wieder als offen", () => {
    const liste = Array.from({ length: 4 }, (_, i) => mitStand(`o${i}`, i % 2 ? FASSUNG_3 : FASSUNG_2));
    expect(OBJEKT_TEXTE_SCHEMA).toBe(5);
    expect(zaehleTexteStand(liste)).toEqual({ fertig: 0, gesamt: 4 });
    const auswahl = waehleGesamtlauf(liste);
    expect(auswahl.auftraege).toHaveLength(4);
    expect(auswahl.auftraege.every((a) => a.anlass === "ohne-stand" && a.neuErzeugen === false)).toBe(true);
  });

  it("nimmt auch Objekte mit Handtexten und solche mit bloßem Fehlervermerk mit", () => {
    const selbst = FUENF.map((a) => `Selbst: ${a}`);
    const vonHand = objekt("h", { kurzbeschreibung: "Selbst geschrieben.", standortargumente: selbst, [OBJEKT_TEXTE_META_SCHLUESSEL]: FASSUNG_2 });
    const nurFehler = objekt("f", { [OBJEKT_TEXTE_META_SCHLUESSEL]: { letzterFehler: { zeitpunkt: "2026-09-23T18:00:00Z", grund: "Status 400", version: 3 } } });
    const auswahl = waehleGesamtlauf([vonHand, nurFehler]);
    expect(auswahl.auftraege.map((a) => a.objekt.id)).toEqual(["h", "f"]);
    // Die Handtexte bleiben dabei stehen, das regelt `texteInGepflegteFelder`.
    expect(texteFertig(vonHand)).toBe(true);
    expect(texteFertig(nurFehler)).toBe(false);
  });
});

describe("Fassung 4: Objekte ohne gemessene Umgebung", () => {
  it("nimmt ein fertiges Objekt noch einmal, wenn die Messung an einem Dienst scheiterte", () => {
    const ohneMessung = mitStand("m", stand({ umgebung: { gemessen: false, grund: "Overpass weg.", art: "dienst" } }));
    const falscheAdresse = mitStand("a", stand({ umgebung: { gemessen: false, grund: "Adresse unbekannt.", art: "adresse" } }));
    const gemessen = mitStand("g", stand({ umgebung: { gemessen: true, genauigkeit: "adresse" } }));
    const auswahl = waehleGesamtlauf([ohneMessung, falscheAdresse, gemessen]);
    expect(auswahl.auftraege).toEqual([{ objekt: ohneMessung, anlass: "ohne-messung", neuErzeugen: true }]);
    // An der Adresse ändert ein neuer Lauf nichts, das Objekt gilt als fertig.
    expect(auswahl.vorhanden.map((o) => o.id)).toEqual(["a", "g"]);
    expect(texteFertig(ohneMessung)).toBe(true);
  });
});
