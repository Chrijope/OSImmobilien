import { describe, it, expect } from "vitest";
import {
  ERST_GESEHEN_AUFRAEUMEN_NACH_TAGEN,
  INVESTAGON_ERSTELLT_META_SCHLUESSEL,
  NEU_ANGELEGT_META_SCHLUESSEL,
  investagonErstelltAm,
  istNeuFuerNutzer,
  leseErstGesehen,
  merkeErstesSehen,
  neuAngelegtAm,
  neuSeit,
  neueZuerst,
  type NeuPruefbar,
} from "./objekteNeu";
import { INVESTAGON_ERSTELLT_META_SCHLUESSEL as IMPORT_SCHLUESSEL } from "../../supabase/functions/investagon-import/mapping";

const TAG = 24 * 60 * 60 * 1000;
const JETZT = Date.parse("2026-09-23T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const vor = (tage: number, extraMs = 0) => iso(JETZT - tage * TAG - extraMs);

/** Ein Objekt, das der Import vor so vielen Tagen neu angelegt hat. */
const angelegt = (id: string, zeit: unknown): NeuPruefbar => ({ id, meta: { [NEU_ANGELEGT_META_SCHLUESSEL]: zeit } });
const bestand = (id: string): NeuPruefbar => ({ id, meta: {} });

describe("Was als neu angelegt gilt", () => {
  it("liest den Zeitpunkt aus meta", () => {
    expect(neuAngelegtAm(angelegt("a", vor(2)))).toBe(JETZT - 2 * TAG);
  });

  /*
   * Alles von vor dieser Regel hat den Schluessel nicht und ist nie neu.
   * Sonst stuende am ersten Tag der ganze Bestand als neu da.
   */
  it("ohne Schluessel ist ein Objekt nie neu", () => {
    expect(istNeuFuerNutzer(bestand("a"), {}, JETZT)).toBe(false);
    expect(istNeuFuerNutzer({ id: "a" }, {}, JETZT)).toBe(false);
    expect(istNeuFuerNutzer({ id: "a", meta: null }, {}, JETZT)).toBe(false);
  });

  it("mit kaputtem Wert ist ein Objekt nicht neu", () => {
    for (const wert of ["", "  ", "kaputt", "2026-13-45", 1727000000000, null, true, {}, []]) {
      expect(istNeuFuerNutzer(angelegt("a", wert), {}, JETZT)).toBe(false);
    }
  });
});

describe("Die Grenze von 30 Tagen nach dem Anlegen", () => {
  it("heute angelegt und nie gesehen ist neu", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(0)), {}, JETZT)).toBe(true);
  });

  it("genau 30 Tage her ist noch neu", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(30)), {}, JETZT)).toBe(true);
  });

  /*
   * Schutz fuer den Partner, der erst spaeter dazukommt: Er hat nichts davon
   * gesehen und soll trotzdem nicht alles der letzten Monate als neu sehen.
   */
  it("einen Augenblick mehr als 30 Tage ist nicht mehr neu, auch nie gesehen", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(30, 1)), {}, JETZT)).toBe(false);
    expect(istNeuFuerNutzer(angelegt("a", vor(90)), {}, JETZT)).toBe(false);
  });

  it("die 30 Tage gelten auch, wenn das erste Sehen erst kurz her ist", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(31)), { a: vor(1) }, JETZT)).toBe(false);
  });

  it("vertraegt eine Rechneruhr, die etwas nachgeht", () => {
    expect(istNeuFuerNutzer(angelegt("a", iso(JETZT + 60 * 60 * 1000)), {}, JETZT)).toBe(true);
  });

  it("nimmt einen Zeitpunkt weit in der Zukunft als kaputt", () => {
    expect(istNeuFuerNutzer(angelegt("a", iso(JETZT + 2 * TAG)), {}, JETZT)).toBe(false);
  });
});

describe("Die Grenze von 7 Tagen nach dem ersten Sehen", () => {
  it("gerade eben zum ersten Mal gesehen ist neu", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(3)), { a: iso(JETZT) }, JETZT)).toBe(true);
  });

  it("genau 7 Tage nach dem ersten Sehen ist noch neu", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(10)), { a: vor(7) }, JETZT)).toBe(true);
  });

  it("einen Augenblick mehr als 7 Tage ist nicht mehr neu", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(10)), { a: vor(7, 1) }, JETZT)).toBe(false);
  });

  it("der Eintrag eines anderen Objekts zaehlt nicht", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(10)), { b: vor(8) }, JETZT)).toBe(true);
  });

  it("ein kaputter Eintrag gilt als noch nie gesehen", () => {
    expect(istNeuFuerNutzer(angelegt("a", vor(10)), { a: "kaputt" }, JETZT)).toBe(true);
  });

  it("neuSeit liefert den Anlagezeitpunkt oder null", () => {
    expect(neuSeit(angelegt("a", vor(2)), {}, JETZT)).toBe(JETZT - 2 * TAG);
    expect(neuSeit(angelegt("a", vor(10)), { a: vor(8) }, JETZT)).toBeNull();
    expect(neuSeit(bestand("a"), {}, JETZT)).toBeNull();
  });
});

describe("Die gespeicherte Merkliste wird geprueft", () => {
  it("nimmt nur ein echtes Objekt", () => {
    for (const wert of [null, undefined, "x", 1, true, [], [["a", vor(1)]]]) {
      expect(leseErstGesehen(wert)).toEqual({});
    }
  });

  it("laesst Eintraege ohne lesbaren Zeitpunkt weg", () => {
    expect(leseErstGesehen({ a: vor(1), b: "kaputt", c: 5, d: null, e: "" })).toEqual({ a: vor(1) });
  });
});

describe("Das erste Sehen merken", () => {
  it("traegt ein neues, noch nie gesehenes Objekt mit dem jetzigen Zeitpunkt ein", () => {
    expect(merkeErstesSehen({}, [angelegt("a", vor(1))], JETZT)).toEqual({ a: iso(JETZT) });
  });

  it("liefert null, wenn nichts dazukommt, damit nicht geschrieben wird", () => {
    expect(merkeErstesSehen({ a: vor(2) }, [angelegt("a", vor(3))], JETZT)).toBeNull();
    expect(merkeErstesSehen({}, [bestand("b")], JETZT)).toBeNull();
    expect(merkeErstesSehen({}, [], JETZT)).toBeNull();
  });

  it("ueberschreibt ein vorhandenes erstes Sehen nie", () => {
    const naechste = merkeErstesSehen({ a: vor(2) }, [angelegt("a", vor(3)), angelegt("b", vor(1))], JETZT);
    expect(naechste).toEqual({ a: vor(2), b: iso(JETZT) });
  });

  /*
   * Nur was ueberhaupt neu sein kann, kommt in die Liste. Sonst stuende dort
   * nach dem ersten Besuch der ganze Bestand.
   */
  it("traegt Bestand, zu alte und kaputte Objekte nicht ein", () => {
    expect(merkeErstesSehen({}, [bestand("a"), angelegt("b", vor(31)), angelegt("c", "kaputt")], JETZT)).toBeNull();
  });

  it("raeumt beim Schreiben Eintraege weg, die aelter als 40 Tage sind", () => {
    const tage = ERST_GESEHEN_AUFRAEUMEN_NACH_TAGEN;
    const naechste = merkeErstesSehen(
      { alt: vor(tage, 1), grenze: vor(tage), frisch: vor(5) },
      [angelegt("neu", vor(0))],
      JETZT,
    );
    expect(naechste).toEqual({ grenze: vor(tage), frisch: vor(5), neu: iso(JETZT) });
  });

  it("raeumt nicht auf, wenn nichts dazukommt, und schreibt damit auch nicht", () => {
    expect(merkeErstesSehen({ alt: vor(100) }, [bestand("a")], JETZT)).toBeNull();
  });
});

describe("Neue Objekte zuerst", () => {
  const seit: Record<string, number | null> = { a: null, b: 10, c: null, d: 30, e: 10 };
  const reihenfolge = (ids: string[]) => neueZuerst(ids, (id) => seit[id]);

  it("stellt neue nach vorn, das juengste Anlegen zuerst", () => {
    expect(reihenfolge(["a", "b", "c", "d"])).toEqual(["d", "b", "a", "c"]);
  });

  it("laesst die uebrigen und gleich alte in ihrer Reihenfolge", () => {
    expect(reihenfolge(["c", "e", "a", "b"])).toEqual(["e", "b", "c", "a"]);
  });

  it("aendert ohne neue Objekte nichts", () => {
    expect(reihenfolge(["c", "a"])).toEqual(["c", "a"]);
  });
});

/*
 * Weg 1: Investagon fuehrt das Objekt als neu. Der Import legt dafuer das
 * frueheste Anlagedatum der Einheiten als `investagonErstelltAm` ans Objekt.
 * Die sieben Tage zaehlen ab diesem Datum, fuer alle Nutzer gleich.
 */
describe("Neu, weil Investagon es als neu fuehrt", () => {
  /** Ein Objekt mit Anlagedatum in Investagon, im CRM ohne Neu-Anlage. */
  const ausInvestagon = (id: string, zeit: unknown, meta: Record<string, unknown> = {}): NeuPruefbar => ({
    id,
    meta: { ...meta, [INVESTAGON_ERSTELLT_META_SCHLUESSEL]: zeit },
  });

  it("nutzt denselben Schluessel wie der Import", () => {
    expect(INVESTAGON_ERSTELLT_META_SCHLUESSEL).toBe(IMPORT_SCHLUESSEL);
  });

  it("liest das Datum aus meta", () => {
    expect(investagonErstelltAm(ausInvestagon("a", vor(2)))).toBe(JETZT - 2 * TAG);
    expect(investagonErstelltAm(bestand("a"))).toBeNull();
  });

  /*
   * Das ist der Kern: Ein Objekt, das schon vor der Neu-Regel im CRM lag, hat
   * keine Anlage-Kennung aus dem Import. Fuehrt Investagon es als neu, ist es
   * trotzdem neu.
   */
  it("ist neu, auch ohne Anlage-Kennung aus dem Import", () => {
    expect(neuSeit(ausInvestagon("a", vor(2)), {}, JETZT)).toBe(JETZT - 2 * TAG);
  });

  it("genau 7 Tage nach dem Datum ist noch neu, einen Augenblick mehr nicht", () => {
    expect(istNeuFuerNutzer(ausInvestagon("a", vor(7)), {}, JETZT)).toBe(true);
    expect(istNeuFuerNutzer(ausInvestagon("a", vor(7, 1)), {}, JETZT)).toBe(false);
  });

  it("zaehlt ab dem Datum, nicht ab dem ersten Sehen", () => {
    // Vor acht Tagen gesehen, in Investagon vor drei Tagen angelegt: neu.
    expect(istNeuFuerNutzer(ausInvestagon("a", vor(3)), { a: vor(8) }, JETZT)).toBe(true);
    // Gerade eben zum ersten Mal gesehen, in Investagon vor zehn Tagen: nicht neu.
    expect(istNeuFuerNutzer(ausInvestagon("a", vor(10)), { a: iso(JETZT) }, JETZT)).toBe(false);
  });

  it("nimmt ein kaputtes Datum oder eines weit in der Zukunft nicht als neu", () => {
    for (const wert of ["", "kaputt", 1727000000000, null, {}, iso(JETZT + 2 * TAG)]) {
      expect(istNeuFuerNutzer(ausInvestagon("a", wert), {}, JETZT)).toBe(false);
    }
    expect(istNeuFuerNutzer(ausInvestagon("a", iso(JETZT + 60 * 60 * 1000)), {}, JETZT)).toBe(true);
  });

  it("braucht kein erstes Sehen und traegt deshalb nichts in die Merkliste ein", () => {
    expect(merkeErstesSehen({}, [ausInvestagon("a", vor(1))], JETZT)).toBeNull();
  });
});

/*
 * Christian: Verschwindet das Kennzeichen in Investagon, endet "Neu" auch im
 * CRM, ausser die bisherige Regel greift noch.
 */
describe("Nach dem Wegfall in Investagon", () => {
  const beides = (id: string, investagonTage: number, crmTage: number): NeuPruefbar => ({
    id,
    meta: {
      [INVESTAGON_ERSTELLT_META_SCHLUESSEL]: vor(investagonTage),
      [NEU_ANGELEGT_META_SCHLUESSEL]: vor(crmTage),
    },
  });

  it("ist nicht mehr neu, wenn nur Investagon es getragen hat", () => {
    const objekt: NeuPruefbar = { id: "a", meta: { [INVESTAGON_ERSTELLT_META_SCHLUESSEL]: vor(8) } };
    expect(neuSeit(objekt, {}, JETZT)).toBeNull();
  });

  /*
   * Die Wartestellung: Investagon hat das Haus vor zehn Tagen angelegt, es
   * bot aber nichts an. Der Import hat es erst gestern ins CRM geholt. Dann
   * greift die bisherige Regel und das Objekt ist neu.
   */
  it("bleibt neu, solange die bisherige Regel greift", () => {
    expect(neuSeit(beides("a", 10, 1), {}, JETZT)).toBe(JETZT - 1 * TAG);
    expect(neuSeit(beides("a", 10, 1), { a: vor(1) }, JETZT)).toBe(JETZT - 1 * TAG);
  });

  it("endet, wenn auch die bisherige Regel abgelaufen ist", () => {
    expect(neuSeit(beides("a", 12, 10), { a: vor(8) }, JETZT)).toBeNull();
  });

  it("nimmt bei beiden Wegen den juengeren Zeitpunkt", () => {
    expect(neuSeit(beides("a", 3, 1), {}, JETZT)).toBe(JETZT - 1 * TAG);
    expect(neuSeit(beides("a", 1, 3), {}, JETZT)).toBe(JETZT - 1 * TAG);
  });
});

describe("Sortierung mit beiden Wegen", () => {
  it("stellt neue aus Investagon und aus dem CRM gemeinsam vorn, das juengste zuerst", () => {
    const objekte: NeuPruefbar[] = [
      bestand("alt"),
      { id: "inv5", meta: { [INVESTAGON_ERSTELLT_META_SCHLUESSEL]: vor(5) } },
      angelegt("crm3", vor(3)),
      { id: "inv9", meta: { [INVESTAGON_ERSTELLT_META_SCHLUESSEL]: vor(9) } },
      { id: "inv1", meta: { [INVESTAGON_ERSTELLT_META_SCHLUESSEL]: vor(1) } },
    ];
    const reihenfolge = neueZuerst(objekte, (o) => neuSeit(o, {}, JETZT)).map((o) => o.id);
    // inv9 ist in Investagon abgelaufen und bleibt hinten in alter Reihenfolge.
    expect(reihenfolge).toEqual(["inv1", "crm3", "inv5", "alt", "inv9"]);
  });
});
