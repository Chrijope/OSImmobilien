import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { VERTRIEBSHANDBUCH, PROZESS_KETTE } from "./vertriebshandbuch";
import { sucheImHandbuch, zerlegeFrage } from "./vertriebshandbuchSuche";

describe("zerlegeFrage", () => {
  it("wirft Fuellwoerter weg", () => {
    expect(zerlegeFrage("Wann bekomme ich eine Glocke?")).toEqual(["bekomme", "glocke"]);
  });

  it("versteht Umlaute in beiden Schreibweisen", () => {
    expect(zerlegeFrage("Fälligkeit")).toEqual(zerlegeFrage("Faelligkeit"));
  });

  it("gibt bei leerer Eingabe nichts zurueck", () => {
    expect(zerlegeFrage("   ")).toEqual([]);
    expect(zerlegeFrage("ich")).toEqual([]);
  });
});

describe("sucheImHandbuch", () => {
  it("findet bei leerer Frage nichts, statt alles zu zeigen", () => {
    // Eine Trefferliste mit dem ganzen Handbuch darin ist keine Antwort.
    expect(sucheImHandbuch("")).toEqual([]);
    expect(sucheImHandbuch(" ")).toEqual([]);
  });

  const faelle: [string, string][] = [
    ["Wann bekomme ich eine Glocke?", "glocke-wann"],
    ["Was bedeutet der farbige Punkt hinter dem Namen?", "ampel-bedeutung"],
    ["Was ist bei Aktion erstellen zu beachten?", "aktion-arten"],
    ["Nach wie vielen Tagen eskaliert ein Vorgang?", "esk-schwellen"],
    ["Wie kommen die Bonitaetsunterlagen ins System?", "bon-wege"],
    ["Kann der Kunde seine eigene Bank mitbringen?", "fin-wege"],
    ["Welche E-Mails bekommt der Kunde?", "kunde-mails"],
    ["Wie reserviere ich eine Einheit?", "res-ablauf"],
    ["Wie fuelle ich die Selbstauskunft aus?", "sa-wege"],
    ["Wie wird der Notartermin abgestimmt?", "notar-termin"],
  ];

  for (const [frage, erwarteterBlock] of faelle) {
    it(`beantwortet "${frage}" mit dem richtigen Block`, () => {
      const treffer = sucheImHandbuch(frage);
      expect(treffer.length).toBeGreaterThan(0);
      expect(treffer[0].block.id).toBe(erwarteterBlock);
    });
  }

  it("sagt nichts, wenn es nichts zu sagen gibt", () => {
    expect(sucheImHandbuch("Zebrastreifen Quallensuppe")).toEqual([]);
  });
});

describe("Der Inhalt selbst", () => {
  it("hat ueberall eindeutige Kennungen", () => {
    const ids = VERTRIEBSHANDBUCH.flatMap((a) => [a.id, ...a.bloecke.map((b) => b.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hat keine Gedankenstriche in Texten, die Nutzer sehen", () => {
    // Projektregel: keine Gedankenstriche in Nutzertexten.
    const alles = VERTRIEBSHANDBUCH.flatMap((a) => [
      a.titel, a.kurz,
      ...a.bloecke.flatMap((b) => [
        b.titel, b.frage || "", ...b.absaetze, ...(b.liste || []), b.achtung || "",
        ...(b.tabelle ? [...b.tabelle.kopf, ...b.tabelle.zeilen.flat()] : []),
      ]),
    ]).join(" ");
    expect(alles).not.toMatch(/[–—]/);
  });

  it("schreibt Umlaute als Umlaute, nicht als ae, oe, ue", () => {
    /*
      Christian hat das am 11.09.2026 gemeldet: Der Text war durchgehend mit
      "ae" und "ue" geschrieben, weil er aus einer Werkzeugkette kam, die keine
      Umlaute mochte. Im Handbuch liest ihn ein Mensch, und dort gehoeren
      Umlaute hin. Diese Pruefung haelt sie fest.

      Die Ausnahmen sind echte deutsche Woerter, in denen die Buchstabenfolge
      zufaellig vorkommt.
    */
    const ERLAUBT = /^(dauernd|neue|neuen|neuer|steuer[\wäöüß]*|zuerst|auswertung[\wäöüß]*|feuer[\wäöüß]*)$/i;
    const sichtbar = VERTRIEBSHANDBUCH.flatMap((a) => [
      a.titel, a.kurz,
      ...a.bloecke.flatMap((b) => [
        b.titel, b.frage || "", ...b.absaetze, ...(b.liste || []), b.achtung || "",
        ...(b.tabelle ? [...b.tabelle.kopf, ...b.tabelle.zeilen.flat()] : []),
      ]),
    ]);
    const verdaechtig = sichtbar
      .flatMap((t) => t.match(/[A-Za-zäöüÄÖÜß]+/g) || [])
      .filter((w) => /ae|oe|ue/i.test(w) && !ERLAUBT.test(w));
    expect(verdaechtig).toEqual([]);
  });

  it("gibt jedem Abschnitt mindestens einen Block", () => {
    for (const a of VERTRIEBSHANDBUCH) {
      expect(a.bloecke.length).toBeGreaterThan(0);
    }
  });
});

describe("Sprungknoepfe und Ablaufbild", () => {
  /*
    Christian hat am 11.09.2026 ausdruecklich verlangt, dass die Knoepfe
    wirklich dorthin fuehren, wo sie hinfuehren sollen. Deshalb wird hier gegen
    die echte Routenliste geprueft und nicht gegen eine Abschrift: Ein Knopf,
    der ins Leere zeigt, wirft den Partner auf das Dashboard zurueck, und das
    merkt sonst erst er.
  */
  const app = readFileSync("src/App.tsx", "utf8");
  const routen = new Set(
    [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]),
  );

  it("kennt ueberhaupt Routen, sonst prueft der Test nichts", () => {
    expect(routen.size).toBeGreaterThan(50);
    expect(routen.has("/pipeline")).toBe(true);
  });

  it("fuehrt jeden Sprungknopf auf eine Adresse, die es wirklich gibt", () => {
    const kaputt: string[] = [];
    for (const abschnitt of VERTRIEBSHANDBUCH) {
      for (const ziel of abschnitt.ziele || []) {
        if (!routen.has(ziel.url)) kaputt.push(`${abschnitt.id}: ${ziel.url}`);
      }
    }
    expect(kaputt).toEqual([]);
  });

  it("gibt jedem Abschnitt mindestens einen Sprungknopf", () => {
    const ohne = VERTRIEBSHANDBUCH.filter((a) => !a.ziele || a.ziele.length === 0);
    expect(ohne.map((a) => a.id)).toEqual([]);
  });

  it("laesst keinen Knopf zweimal im selben Abschnitt stehen", () => {
    for (const a of VERTRIEBSHANDBUCH) {
      const urls = (a.ziele || []).map((z) => z.url);
      expect(new Set(urls).size, a.id).toBe(urls.length);
    }
  });

  it("springt aus dem Ablaufbild nur in Abschnitte, die es gibt", () => {
    const ids = new Set(VERTRIEBSHANDBUCH.map((a) => a.id));
    const kaputt = PROZESS_KETTE.filter((s) => !ids.has(s.abschnitt));
    expect(kaputt.map((s) => s.titel)).toEqual([]);
  });

  it("bildet die Kette in der Reihenfolge des Prozesses ab", () => {
    const titel = PROZESS_KETTE.map((s) => s.titel);
    // Die drei Stellen, an denen die Reihenfolge frueher falsch war.
    expect(titel.indexOf("Reservierung")).toBeLessThan(titel.indexOf("Bonitätsunterlagen"));
    expect(titel.indexOf("Bonitätsunterlagen")).toBeLessThan(titel.indexOf("Finanzierung"));
    expect(titel.indexOf("Finanzierung")).toBeLessThan(titel.indexOf("Notar"));
    expect(titel[0]).toBe("Lead");
    expect(titel[titel.length - 1]).toBe("Abgeschlossen");
  });
});
