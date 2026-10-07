import { describe, it, expect } from "vitest";
import { istVerfuegbar, objektGruppen, type GruppierbaresObjekt } from "./objektFavoritenGruppen";
import type { BelegungsEinheit } from "./einheitBelegung";

const frei: BelegungsEinheit = { status: "frei" };
const reserviert: BelegungsEinheit = { status: "reserviert", investagonStatusText: "Reserviert" };
const notar: BelegungsEinheit = { status: "reserviert", investagonStatusText: "Notartermin" };
const verkauft: BelegungsEinheit = { status: "verkauft" };

/** Ein sichtbares Objekt mit einer freien Einheit, sofern nichts anderes gesagt ist. */
const obj = (id: string, anders: Partial<GruppierbaresObjekt> = {}): GruppierbaresObjekt => ({
  id,
  sichtbar: true,
  wohnungen: [frei],
  ...anders,
});
const belegt = (id: string) => obj(id, { wohnungen: [reserviert, notar] });
const ausgeblendet = (id: string) => obj(id, { sichtbar: false });

/**
 * Sichtbar, mit Einheiten, von denen aber keine angeboten ist: So sieht ein in
 * Investagon offline gestelltes Objekt in der Angebotssicht aus, seit der
 * Import es nicht mehr ausblendet.
 */
const offline = (id: string) => obj(id, { wohnungen: [], wohnungenNichtImAngebot: [frei, reserviert] });

const favoritenAus = (...ids: string[]) => (id: string) => ids.includes(id);

const titel = (gruppen: { titel: string | null }[]) => gruppen.map((g) => g.titel);
const ids = (gruppe: { objekte: { id: string }[] }) => gruppe.objekte.map((o) => o.id);

describe("Was als verfuegbar gilt", () => {
  it("ein sichtbares Objekt mit mindestens einer freien Einheit", () => {
    expect(istVerfuegbar(obj("a", { wohnungen: [reserviert, frei] }))).toBe(true);
  });

  it("nicht, wenn keine angebotene Einheit mehr frei ist", () => {
    expect(istVerfuegbar(obj("a", { wohnungen: [reserviert, notar] }))).toBe(false);
  });

  it("nicht, wenn das Objekt ausgeblendet ist, auch mit freier Einheit", () => {
    expect(istVerfuegbar(obj("a", { sichtbar: false, wohnungen: [frei] }))).toBe(false);
  });

  /*
   * Die Angebotssicht hat hier schon alles herausgenommen, was Investagon
   * nicht anbietet. Bleibt nichts uebrig, ist das Objekt ausverkauft oder
   * nicht mehr im Angebot, nicht etwa unfertig.
   */
  it("nicht, wenn alle Einheiten aus dem Angebot genommen sind", () => {
    expect(istVerfuegbar(obj("a", { wohnungen: [], wohnungenNichtImAngebot: [verkauft] }))).toBe(false);
    expect(istVerfuegbar(obj("a", { wohnungen: [], wohnungenNichtImAngebot: [frei] }))).toBe(false);
  });

  /*
   * Dieselbe Haltung wie `angebotsBelegung`: Ein Objekt ganz ohne Einheit ist
   * unfertig. Genauso sieht jedes Objekt aus, solange die Einheiten noch
   * laden, und dann darf nicht alles kurz unter "Nicht verfuegbar" springen.
   */
  it("ein sichtbares Objekt ganz ohne Einheit bleibt verfuegbar", () => {
    expect(istVerfuegbar(obj("a", { wohnungen: [] }))).toBe(true);
  });
});

describe("Favoriten, Gesamtportfolio und Nicht verfuegbar", () => {
  it("zeigt alle drei Bloecke in dieser Reihenfolge", () => {
    const gruppen = objektGruppen(
      [obj("a"), belegt("b"), obj("c"), ausgeblendet("d")],
      favoritenAus("c"),
    );
    expect(titel(gruppen)).toEqual(["Favoriten", "Gesamtportfolio", "Nicht verfügbar"]);
    expect(ids(gruppen[0])).toEqual(["c"]);
    expect(ids(gruppen[1])).toEqual(["a"]);
    expect(ids(gruppen[2])).toEqual(["b", "d"]);
  });

  it("legt ein belegtes Objekt nach Nicht verfuegbar", () => {
    const gruppen = objektGruppen([obj("a"), belegt("b")], favoritenAus());
    expect(titel(gruppen)).toEqual(["Gesamtportfolio", "Nicht verfügbar"]);
    expect(ids(gruppen[1])).toEqual(["b"]);
  });

  it("legt ein ausgeblendetes Objekt nach Nicht verfuegbar", () => {
    const gruppen = objektGruppen([obj("a"), ausgeblendet("b")], favoritenAus());
    expect(titel(gruppen)).toEqual(["Gesamtportfolio", "Nicht verfügbar"]);
    expect(ids(gruppen[1])).toEqual(["b"]);
  });

  /*
   * Die Markierung hat Vorrang: Wer ein Objekt mit Stern verfolgt, soll es
   * oben wiederfinden, auch wenn es inzwischen reserviert oder ausgeblendet
   * ist.
   */
  it("laesst einen Favoriten oben, auch wenn er belegt oder ausgeblendet ist", () => {
    const gruppen = objektGruppen(
      [obj("a"), belegt("b"), ausgeblendet("c")],
      favoritenAus("b", "c"),
    );
    expect(titel(gruppen)).toEqual(["Favoriten", "Gesamtportfolio"]);
    expect(ids(gruppen[0])).toEqual(["b", "c"]);
  });

  /*
   * Die Falle seit dem 23.09.2026: Der Import blendet Offline-Objekte nicht
   * mehr aus. In der Angebotssicht haben sie keine Einheit in `wohnungen`,
   * genau wie ein Objekt ganz ohne Einheit. Das eine gehoert nach unten, das
   * andere bleibt im Portfolio.
   */
  it("legt ein sichtbares Offline-Objekt nach Nicht verfuegbar, ein leeres nicht", () => {
    const gruppen = objektGruppen([offline("a"), obj("b", { wohnungen: [] }), obj("c")], favoritenAus());
    expect(titel(gruppen)).toEqual(["Gesamtportfolio", "Nicht verfügbar"]);
    expect(ids(gruppen[0])).toEqual(["b", "c"]);
    expect(ids(gruppen[1])).toEqual(["a"]);
  });

  it("hat nur unter Nicht verfuegbar eine Unterzeile, fuer alle dieselbe", () => {
    const gruppen = objektGruppen([obj("a"), belegt("b"), obj("c")], favoritenAus("c"));
    expect(gruppen.map((g) => g.unterzeile)).toEqual([
      undefined,
      undefined,
      "reserviert, beim Notar oder nicht mehr im Angebot",
    ]);
  });

  it("laesst sich nur Nicht verfuegbar einklappen", () => {
    const gruppen = objektGruppen([obj("a"), belegt("b"), obj("c")], favoritenAus("c"));
    expect(gruppen.map((g) => g.einklappbar === true)).toEqual([false, false, true]);
    const ungeteilt = objektGruppen([obj("a")], favoritenAus());
    expect(ungeteilt[0].einklappbar).toBeUndefined();
  });
});

describe("Keine leere Ueberschrift", () => {
  /*
   * Der Kern der Anforderung: Eine Ueberschrift ueber nichts sieht aus wie
   * ein Fehler, und "Gesamtportfolio" allein trennt auch nichts mehr.
   */
  it("laesst ohne Favoriten und ohne Nicht verfuegbares jede Ueberschrift weg", () => {
    const gruppen = objektGruppen([obj("a"), obj("b", { wohnungen: [] })], favoritenAus());
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].titel).toBeNull();
    expect(ids(gruppen[0])).toEqual(["a", "b"]);
  });

  it("laesst Gesamtportfolio weg, wenn alles Favorit ist", () => {
    const gruppen = objektGruppen([obj("a"), obj("b")], favoritenAus("a", "b"));
    expect(titel(gruppen)).toEqual(["Favoriten"]);
    expect(ids(gruppen[0])).toEqual(["a", "b"]);
  });

  it("laesst Gesamtportfolio weg, wenn ausser Favoriten nichts verfuegbar ist", () => {
    const gruppen = objektGruppen([obj("a"), belegt("b")], favoritenAus("a"));
    expect(titel(gruppen)).toEqual(["Favoriten", "Nicht verfügbar"]);
  });

  it("zeigt nur Nicht verfuegbar, wenn sonst nichts da ist", () => {
    const gruppen = objektGruppen([belegt("a"), ausgeblendet("b")], favoritenAus());
    expect(titel(gruppen)).toEqual(["Nicht verfügbar"]);
    expect(ids(gruppen[0])).toEqual(["a", "b"]);
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    const gruppen = objektGruppen([], favoritenAus("a"));
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].titel).toBeNull();
    expect(gruppen[0].objekte).toEqual([]);
  });
});

describe("Reihenfolge und Vollstaendigkeit", () => {
  /*
   * Die Seite sortiert vorher nach Belegung und Anlagedatum. Wuerde hier noch
   * einmal sortiert, haetten Kachel- und Listenansicht eine andere Reihenfolge
   * als die Karte, die dieselbe Liste bekommt.
   */
  it("sortiert nicht um, sondern behaelt die Reihenfolge je Block", () => {
    const gruppen = objektGruppen(
      [obj("a"), belegt("b"), obj("c"), ausgeblendet("d"), obj("e"), belegt("f")],
      favoritenAus("e", "a"),
    );
    expect(ids(gruppen[0])).toEqual(["a", "e"]);
    expect(ids(gruppen[1])).toEqual(["c"]);
    expect(ids(gruppen[2])).toEqual(["b", "d", "f"]);
  });

  it("zaehlt jedes Objekt genau einmal", () => {
    const liste = [obj("a"), belegt("b"), obj("c"), ausgeblendet("d"), obj("e")];
    const gruppen = objektGruppen(liste, favoritenAus("b", "e"));
    const alle = gruppen.flatMap((g) => ids(g));
    expect(alle.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("Neue Objekte stehen im Gesamtportfolio vorn", () => {
  /** Der Anlagezeitpunkt, wenn das Objekt neu ist, sonst null. */
  const neuSeitAus = (seit: Record<string, number>) => (o: { id: string }) => seit[o.id] ?? null;

  it("stellt neue nach vorn, das juengste Anlegen zuerst, der Rest bleibt", () => {
    const gruppen = objektGruppen(
      [obj("a"), obj("b"), belegt("x"), obj("c"), obj("d")],
      favoritenAus(),
      neuSeitAus({ c: 100, d: 200 }),
    );
    expect(titel(gruppen)).toEqual(["Gesamtportfolio", "Nicht verfügbar"]);
    expect(ids(gruppen[0])).toEqual(["d", "c", "a", "b"]);
  });

  /*
   * Im Favoritenblock und unter Nicht verfuegbar bleibt die Reihenfolge, auch
   * wenn dort ein neues Objekt steht. Das Kennzeichen zeigt die Seite dort
   * trotzdem.
   */
  it("laesst Favoriten und Nicht verfuegbar in ihrer Reihenfolge", () => {
    const gruppen = objektGruppen(
      [obj("a"), obj("f1"), belegt("x1"), obj("f2"), belegt("x2"), obj("b")],
      favoritenAus("f1", "f2"),
      neuSeitAus({ f2: 100, x2: 100, b: 50 }),
    );
    expect(ids(gruppen[0])).toEqual(["f1", "f2"]);
    expect(ids(gruppen[1])).toEqual(["b", "a"]);
    expect(ids(gruppen[2])).toEqual(["x1", "x2"]);
  });

  it("sortiert auch die ungeteilte Liste, die ja das Portfolio ist", () => {
    const gruppen = objektGruppen([obj("a"), obj("b")], favoritenAus(), neuSeitAus({ b: 1 }));
    expect(gruppen[0].titel).toBeNull();
    expect(ids(gruppen[0])).toEqual(["b", "a"]);
  });

  it("aendert ohne Angabe nichts an der Reihenfolge", () => {
    const gruppen = objektGruppen([obj("a"), obj("b")], favoritenAus());
    expect(ids(gruppen[0])).toEqual(["a", "b"]);
  });
});
