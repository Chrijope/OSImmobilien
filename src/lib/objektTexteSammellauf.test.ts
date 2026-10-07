import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Sammellauf für Kurzbeschreibung und Standortargumente.
 *
 * Geprüft wird das, was im Ernstfall Geld oder Daten kostet:
 *
 *   1. Die Objekte laufen nacheinander, nie zwei gleichzeitig.
 *   2. Angefasst wird nur, was wirklich einen Lauf braucht. Jeder Aufruf zählt
 *      gegen das Kontingent, auch einer, der nichts zu tun findet.
 *   3. An einer Grenze hört der Lauf auf, statt weiterzufeuern, und sagt, wie
 *      viele offen bleiben.
 *   4. Ein Abbruch hält an, verwirft aber nichts, was schon geschrieben wurde.
 *   5. Wer keinen Text bekommen hat, steht am Ende mit Grund in der Liste.
 */

import {
  OBJEKT_TEXTE_FUNKTION_VERSION,
  OBJEKT_TEXTE_META_SCHLUESSEL,
  OBJEKT_TEXTE_SCHEMA,
  type ObjektTexte,
} from "../../supabase/functions/_shared/objekt-texte";

/** Die Antwort, die die nachgebildete Edge Function liefern soll. */
const stand = vi.hoisted(() => ({
  antwort: { data: {} as any, error: null as any },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn(async () => stand.antwort) },
  },
}));

vi.mock("@/lib/objekteStore", () => ({
  updateObjektFieldFast: vi.fn(async () => undefined),
  getObjektById: vi.fn(() => undefined),
}));

const { erzeugeObjektTexte } = await import("@/lib/objektTexteKi");
const {
  KONTINGENT_STUNDE,
  objektTexteSammellauf,
  teileObjekteAuf,
} = await import("@/lib/objektTexteSammellauf");

const fertigeTexte: ObjektTexte = {
  schema: OBJEKT_TEXTE_SCHEMA,
  kurzbeschreibung: "Ein Haus von 1962 in Augsburg.",
  standortargumente: [{ argument: "Supermarkt in 280 m.", beleg: "Einkaufen in der Nähe" }],
  sanierungen: [],
  erzeugtAm: "2026-09-22T10:00:00.000Z",
  modell: "google/gemini-2.5-flash",
  quellenStand: "abc",
  quellen: ["Titel: X"],
  beanstandungen: [],
};

const gelungen = { texte: fertigeTexte, neu: true, gespeichert: true, fehler: "" };

type Art = "offen" | "hat-texte" | "grundlage-fehlt";

/**
 * Ein Objekt in einem der drei Zustände.
 *
 * Seit dem 23.09.2026 genügen Objektangaben als Grundlage. „Ohne Grundlage“
 * heißt deshalb: ohne Titel, ohne Adresse, ohne Beschreibung, ohne Unterlage.
 * Der Titel im Aufruf dient dann nur der Lesbarkeit des Tests.
 */
function objekt(id: string, titel = `Haus ${id}`, art: Art = "offen") {
  const meta: Record<string, unknown> = {};
  if (art === "hat-texte") meta[OBJEKT_TEXTE_META_SCHLUESSEL] = fertigeTexte;
  return {
    id,
    titel: art === "grundlage-fehlt" ? "" : titel,
    meta,
    dokumente: [],
  } as any;
}

/** Nie warten, aber mitschreiben, dass gewartet worden wäre. */
function ohneWartezeit() {
  const pausen: number[] = [];
  return { pausen, warte: async (ms: number) => { pausen.push(ms); } };
}

beforeEach(() => {
  stand.antwort = { data: {}, error: null };
});

describe("Was der Sammellauf überhaupt anfasst", () => {
  it("teilt in offen, schon versorgt und ohne Grundlage", () => {
    const aufteilung = teileObjekteAuf([
      objekt("a"),
      objekt("b", "Haus b", "hat-texte"),
      objekt("c", "Haus c", "grundlage-fehlt"),
      objekt("d"),
    ]);
    expect(aufteilung.offen.map((o) => o.id)).toEqual(["a", "d"]);
    expect(aufteilung.hatTexte.map((o) => o.id)).toEqual(["b"]);
    expect(aufteilung.ohneGrundlage.map((o) => o.id)).toEqual(["c"]);
  });

  /*
   * Bis zum 23.09.2026 galt ein von Hand gepflegtes Paar als versorgt. Seither
   * liefert der Lauf auch die Sanierungen, und die gibt es nur aus ihm. Die
   * gepflegten Texte bleiben dabei unangetastet.
   */
  it("nimmt auch Objekte mit von Hand gepflegten Texten mit, wegen der Sanierungen", () => {
    const vonHand = objekt("e");
    vonHand.meta = { kurzbeschreibung: "Selbst geschrieben.", standortargumente: ["Eins", "Zwei"] };
    expect(teileObjekteAuf([vonHand]).offen).toHaveLength(1);
  });

  it("zieht ein Objekt mit einem Stand der Fassung 1 neu nach", () => {
    const alt = objekt("g");
    alt.meta = { [OBJEKT_TEXTE_META_SCHLUESSEL]: { ...fertigeTexte, schema: 1 } };
    expect(teileObjekteAuf([alt]).offen).toHaveLength(1);
  });

  it("überspringt Einträge ohne Kennung, statt ins Leere zu rufen", () => {
    const ohneId = { ...objekt("f"), id: "" };
    expect(teileObjekteAuf([ohneId]).offen).toHaveLength(0);
  });

  it("ruft für übersprungene Objekte gar nicht erst an", async () => {
    const gerufen: string[] = [];
    const bericht = await objektTexteSammellauf(
      [objekt("a", "Haus a", "hat-texte"), objekt("b", "Haus b", "grundlage-fehlt")],
      { erzeuge: async (id) => { gerufen.push(id); return gelungen; }, warte: ohneWartezeit().warte },
    );
    expect(gerufen).toEqual([]);
    expect(bericht.angefasst).toBe(0);
    expect(bericht.uebersprungenHatTexte).toBe(1);
    expect(bericht.uebersprungenOhneGrundlage).toBe(1);
    expect(bericht.ende).toBe("fertig");
  });
});

describe("Einer nach dem anderen", () => {
  it("startet nie zwei Läufe gleichzeitig und hält die Reihenfolge", async () => {
    let gleichzeitig = 0;
    let hoechstens = 0;
    const reihenfolge: string[] = [];
    const { pausen, warte } = ohneWartezeit();

    const bericht = await objektTexteSammellauf([objekt("a"), objekt("b"), objekt("c")], {
      erzeuge: async (id) => {
        gleichzeitig += 1;
        hoechstens = Math.max(hoechstens, gleichzeitig);
        reihenfolge.push(id);
        await new Promise((fertig) => setTimeout(fertig, 0));
        gleichzeitig -= 1;
        return gelungen;
      },
      warte,
    });

    expect(hoechstens).toBe(1);
    expect(reihenfolge).toEqual(["a", "b", "c"]);
    expect(bericht.fertig).toBe(3);
    expect(bericht.nochOffen).toBe(0);
    // Zwischen drei Läufen liegen zwei Pausen, hinter dem letzten keine.
    expect(pausen).toHaveLength(2);
  });

  it("meldet den Fortschritt mit Nummer, Titel und Zwischenstand", async () => {
    const meldungen: string[] = [];
    await objektTexteSammellauf([objekt("a", "Alpha"), objekt("b", "Beta")], {
      erzeuge: async () => gelungen,
      warte: ohneWartezeit().warte,
      melde: (f) => meldungen.push(`${f.nummer}/${f.gesamt} ${f.titel} fertig=${f.fertig}`),
    });
    expect(meldungen).toEqual([
      "1/2 Alpha fertig=0",
      "1/2 Alpha fertig=1",
      "2/2 Beta fertig=1",
      "2/2 Beta fertig=2",
    ]);
  });
});

describe("Die Kontingente", () => {
  /*
   * Der Lauf soll die Grenze nicht durch schnelles Nachfeuern reißen. Er hört
   * von selbst nach dem stündlichen Kontingent auf.
   */
  it("hält von selbst vor der stündlichen Grenze an", async () => {
    const viele = Array.from({ length: KONTINGENT_STUNDE + 5 }, (_, i) => objekt(`o${i}`));
    let gerufen = 0;
    const bericht = await objektTexteSammellauf(viele, {
      erzeuge: async () => { gerufen += 1; return gelungen; },
      warte: ohneWartezeit().warte,
    });

    expect(gerufen).toBe(KONTINGENT_STUNDE);
    expect(bericht.fertig).toBe(KONTINGENT_STUNDE);
    expect(bericht.ende).toBe("kontingent");
    expect(bericht.nochOffen).toBe(5);
    expect(bericht.grenzeText).toContain("5 Objekte bleiben");
  });

  it("hört beim ersten abgewiesenen Aufruf auf und nennt die Stunde", async () => {
    let gerufen = 0;
    const bericht = await objektTexteSammellauf([objekt("a"), objekt("b"), objekt("c")], {
      erzeuge: async () => {
        gerufen += 1;
        if (gerufen === 2) {
          return { neu: false, gespeichert: false, fehler: "Stündliches Limit erreicht.", grenze: "stunde" as const };
        }
        return gelungen;
      },
      warte: ohneWartezeit().warte,
    });

    expect(gerufen).toBe(2);
    expect(bericht.ende).toBe("kontingent");
    expect(bericht.grenzeText).toContain("stündliche Kontingent");
    expect(bericht.fertig).toBe(1);
    // Das abgewiesene und das nie versuchte Objekt bleiben beide offen.
    expect(bericht.nochOffen).toBe(2);
    expect(bericht.ohneText).toHaveLength(1);
  });

  it("nennt beim Tageskontingent den nächsten Tag", async () => {
    const bericht = await objektTexteSammellauf([objekt("a")], {
      erzeuge: async () => ({ neu: false, gespeichert: false, fehler: "Tageslimit.", grenze: "tag" as const }),
      warte: ohneWartezeit().warte,
    });
    expect(bericht.grenzeText).toContain("Tageskontingent");
    expect(bericht.grenzeText).toContain("Morgen");
  });
});

describe("Der Abbruch", () => {
  it("hält vor dem nächsten Objekt an und behält, was geschrieben wurde", async () => {
    let gerufen = 0;
    let abbrechen = false;
    const bericht = await objektTexteSammellauf([objekt("a"), objekt("b"), objekt("c")], {
      erzeuge: async () => { gerufen += 1; abbrechen = true; return gelungen; },
      abgebrochen: () => abbrechen,
      warte: ohneWartezeit().warte,
    });

    expect(gerufen).toBe(1);
    expect(bericht.ende).toBe("abgebrochen");
    // Der eine fertige Text bleibt gezählt, er steht ja schon am Objekt.
    expect(bericht.fertig).toBe(1);
    expect(bericht.nochOffen).toBe(2);
  });

  it("startet gar nichts, wenn schon vor dem ersten Objekt abgebrochen wird", async () => {
    let gerufen = 0;
    const bericht = await objektTexteSammellauf([objekt("a")], {
      erzeuge: async () => { gerufen += 1; return gelungen; },
      abgebrochen: () => true,
      warte: ohneWartezeit().warte,
    });
    expect(gerufen).toBe(0);
    expect(bericht.ende).toBe("abgebrochen");
    expect(bericht.nochOffen).toBe(1);
  });
});

describe("Wer keinen Text bekommen hat, und warum", () => {
  it("nennt den Fehler im Klartext und zählt ihn als fehlgeschlagen", async () => {
    const bericht = await objektTexteSammellauf([objekt("a", "Alpha")], {
      erzeuge: async () => ({ neu: false, gespeichert: false, fehler: "Das Objekt wurde nicht gefunden." }),
      warte: ohneWartezeit().warte,
    });
    expect(bericht.fehlgeschlagen).toBe(1);
    expect(bericht.ohneText).toEqual([{ titel: "Alpha", grund: "Das Objekt wurde nicht gefunden." }]);
    // Ohne Vermerk am Objekt bleibt es für einen späteren Lauf offen.
    expect(bericht.nochOffen).toBe(1);
  });

  /*
   * Die Function erkennt die fehlende Grundlage erst beim Sammeln der
   * Tatsachen und legt dann einen Vermerk ab. Das Objekt ist damit erledigt,
   * ein zweiter Lauf würde es nicht mehr anfassen.
   */
  it("zählt einen Vermerk ohne Ergebnis zur fehlenden Grundlage, nicht zu den Fehlern", async () => {
    const vermerk: ObjektTexte = { ...fertigeTexte, kurzbeschreibung: "", standortargumente: [], ohneErgebnis: "Für die Standortargumente fehlt die Grundlage." };
    const bericht = await objektTexteSammellauf([objekt("a", "Alpha")], {
      erzeuge: async () => ({ texte: vermerk, neu: true, gespeichert: true, fehler: "" }),
      warte: ohneWartezeit().warte,
    });
    expect(bericht.fehlgeschlagen).toBe(0);
    expect(bericht.uebersprungenOhneGrundlage).toBe(1);
    expect(bericht.ohneText[0].grund).toContain("fehlt die Grundlage");
    expect(bericht.nochOffen).toBe(0);
  });

  it("meldet einen Text, der nicht gespeichert werden konnte", async () => {
    const bericht = await objektTexteSammellauf([objekt("a", "Alpha")], {
      erzeuge: async () => ({ texte: fertigeTexte, neu: true, gespeichert: false, fehler: "" }),
      warte: ohneWartezeit().warte,
    });
    expect(bericht.fertig).toBe(0);
    expect(bericht.fehlgeschlagen).toBe(1);
    expect(bericht.ohneText[0].grund).toContain("nicht am Objekt gespeichert");
  });
});

/**
 * Die Grenze muss der Browser erkennen, sonst hört der Sammellauf nicht auf.
 *
 * `supabase.functions.invoke` wirft bei jedem Status ab 400 denselben Fehler.
 * Woran es lag, steht nur im Rumpf der Antwort, und der hängt ungelesen am
 * Fehler.
 */
describe("Eine abgewiesene Antwort einordnen", () => {
  /** So antwortet die ausgerollte Function: jede Antwort trägt ihre Fassung. */
  function abgelehnt(status: number, rumpf: Record<string, unknown>) {
    const text = async () => JSON.stringify({ version: OBJEKT_TEXTE_FUNKTION_VERSION, ...rumpf });
    const kontext = { status, text, clone: () => ({ status, text }) };
    return { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: kontext }) };
  }

  it("erkennt das stündliche Kontingent", async () => {
    stand.antwort = abgelehnt(429, { error: "Stündliches Limit erreicht. Bitte später erneut versuchen.", rate_limited: true, reason: "hour" });
    const ergebnis = await erzeugeObjektTexte("o1");
    expect(ergebnis.grenze).toBe("stunde");
    expect(ergebnis.fehler).toContain("Stündliches Limit");
  });

  it("erkennt das Tageskontingent", async () => {
    stand.antwort = abgelehnt(429, { error: "Tageslimit erreicht.", rate_limited: true, reason: "day" });
    expect((await erzeugeObjektTexte("o1")).grenze).toBe("tag");
  });

  it("erkennt die Bremse des Gateways als eigene Grenze", async () => {
    stand.antwort = abgelehnt(429, { error: "Zu viele Anfragen. Bitte in einer Minute erneut versuchen." });
    expect((await erzeugeObjektTexte("o1")).grenze).toBe("gateway");
  });

  it("erkennt ein aufgebrauchtes Guthaben", async () => {
    stand.antwort = abgelehnt(402, { error: "Das KI-Kontingent ist erschöpft." });
    expect((await erzeugeObjektTexte("o1")).grenze).toBe("guthaben");
  });

  /*
   * Ein gewöhnlicher Fehlschlag ist keine Grenze. Würde er als eine gezählt,
   * bliebe der Sammellauf an einem einzelnen kaputten Objekt hängen.
   */
  it("macht aus einem gewöhnlichen Fehler keine Grenze", async () => {
    stand.antwort = abgelehnt(500, { error: "Das Objekt konnte nicht geladen werden." });
    const ergebnis = await erzeugeObjektTexte("o1");
    expect(ergebnis.grenze).toBeUndefined();
    expect(ergebnis.fehler).toContain("nicht geladen");
  });
});

/*
 * Am 23.09.2026 endete jedes Objekt als fehlgeschlagen, und niemand sah,
 * warum. Liegt es an der Function selbst, weil sie fehlt oder eine ältere
 * Fassung läuft, soll genau das dastehen, und der Lauf soll sofort aufhören.
 */
describe("Ist die Function ausgerollt?", () => {
  function antwortOhneGlueck(status: number, rumpf: unknown, name = "FunctionsHttpError") {
    const text = async () => (typeof rumpf === "string" ? rumpf : JSON.stringify(rumpf));
    const kontext = { status, text, clone: () => ({ status, text }) };
    const fehler = Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: kontext });
    fehler.name = name;
    return { data: null, error: fehler };
  }

  it("erkennt eine ältere Fassung an der fehlenden Nummer, auch wenn sie Texte liefert", async () => {
    // So antwortet die Fassung von vor dem 23.09.2026: Stand der Fassung 2, keine `version`.
    stand.antwort = { data: { texte: { ...fertigeTexte, schema: 2 }, neu: false, gespeichert: true }, error: null };
    const ergebnis = await erzeugeObjektTexte("o1");
    expect(ergebnis.funktion).toBe("veraltet");
    expect(ergebnis.fehler).toContain("Die Function objekt-texte-ki ist noch nicht ausgerollt");
  });

  it("erkennt eine ältere Fassung auch an einem Fehler ohne Nummer", async () => {
    stand.antwort = antwortOhneGlueck(502, { error: "Die Texte konnten nicht erzeugt werden." });
    expect((await erzeugeObjektTexte("o1")).funktion).toBe("veraltet");
  });

  it("erkennt eine fehlende Function an der Absage der Plattform", async () => {
    stand.antwort = antwortOhneGlueck(404, { code: "NOT_FOUND", message: "Requested function was not found" });
    const ergebnis = await erzeugeObjektTexte("o1");
    expect(ergebnis.funktion).toBe("fehlt");
    expect(ergebnis.fehler).toContain("noch nicht ausgerollt");
  });

  it("erkennt eine Function, die nicht hochfährt", async () => {
    stand.antwort = antwortOhneGlueck(503, { code: "BOOT_ERROR", message: "Function failed to start (please check logs)" });
    expect((await erzeugeObjektTexte("o1")).funktion).toBe("startet-nicht");
  });

  it("erkennt eine Anfrage, die gar nicht ankommt", async () => {
    const fehler = Object.assign(new Error("Failed to send a request to the Edge Function"), { context: new TypeError("Failed to fetch") });
    fehler.name = "FunctionsFetchError";
    stand.antwort = { data: null, error: fehler };
    expect((await erzeugeObjektTexte("o1")).funktion).toBe("nicht-erreichbar");
  });

  it("hält die aktuelle Fassung nicht für veraltet, weder bei Erfolg noch bei Fehler", async () => {
    stand.antwort = { data: { texte: fertigeTexte, neu: true, gespeichert: true, version: OBJEKT_TEXTE_FUNKTION_VERSION }, error: null };
    const gut = await erzeugeObjektTexte("o1");
    expect(gut.funktion).toBeUndefined();
    expect(gut.texte?.kurzbeschreibung).toBe(fertigeTexte.kurzbeschreibung);

    stand.antwort = antwortOhneGlueck(502, {
      error: "Die KI-Schnittstelle hat die Anfrage abgelehnt (Status 400: Unsupported MIME type).",
      version: OBJEKT_TEXTE_FUNKTION_VERSION,
    });
    const schlecht = await erzeugeObjektTexte("o1");
    expect(schlecht.funktion).toBeUndefined();
    expect(schlecht.fehler).toContain("Unsupported MIME type");
  });

  it("hält die Absage des eigenen Kontingents für eine Grenze, nicht für eine alte Function", async () => {
    // Die Absage kommt aus einem gemeinsamen Helfer und trägt keine Nummer.
    stand.antwort = antwortOhneGlueck(429, { error: "Stündliches Limit erreicht.", rate_limited: true, reason: "hour" });
    const ergebnis = await erzeugeObjektTexte("o1");
    expect(ergebnis.funktion).toBeUndefined();
    expect(ergebnis.grenze).toBe("stunde");
  });

  it("übersetzt das Speicherlimit der Plattform in einen verständlichen Satz", async () => {
    stand.antwort = antwortOhneGlueck(546, { code: "WORKER_LIMIT", message: "Function failed due to not having enough compute resources" });
    const ergebnis = await erzeugeObjektTexte("o1");
    expect(ergebnis.funktion).toBeUndefined();
    expect(ergebnis.fehler).toContain("Speicher- oder Rechenlimit");
  });

  it("lässt den Sammellauf beim ersten Objekt anhalten, statt alle als fehlgeschlagen zu zählen", async () => {
    let gerufen = 0;
    const bericht = await objektTexteSammellauf([objekt("a"), objekt("b"), objekt("c")], {
      erzeuge: async () => {
        gerufen += 1;
        return { neu: false, gespeichert: false, fehler: "Die Function objekt-texte-ki ist noch nicht ausgerollt.", funktion: "fehlt" };
      },
      warte: async () => undefined,
    });
    expect(gerufen).toBe(1);
    expect(bericht.ende).toBe("nicht-ausgerollt");
    expect(bericht.fehlgeschlagen).toBe(0);
    expect(bericht.grenzeText).toContain("noch nicht ausgerollt");
  });
});
