/**
 * Die Dublettenwache des Investagon-Imports.
 *
 * Die Logik liegt in `supabase/functions/investagon-import/dublettenwache.ts`,
 * weil sie dort gebraucht wird. Geprueft wird sie hier, weil Vitest nur unter
 * `src/**` sucht und weil dieselbe Regel auch ohne Datenbank vollstaendig
 * beurteilbar ist. Dasselbe Muster wie bei `signaturFrist.test.ts` und
 * `avatarSignieren.test.ts`.
 *
 * Der wichtigste Teil steht ganz unten: Neun Paare im Bestand teilen sich die
 * Adresse und sind trotzdem zwei echte Angebote. Wuerde die Wache sie
 * anfassen, waere ein halbes Angebot weg. Sie werden hier in beide Richtungen
 * geprueft, damit die Reihenfolge der beiden Objekte nichts aendert.
 */
import { describe, expect, it } from "vitest";
import {
  beurteile,
  findeGruppen,
  HOECHSTENS_JE_LAUF,
  NOTBREMSE_KANDIDATEN,
  planeWache,
  type WacheObjekt,
} from "../../supabase/functions/investagon-import/dublettenwache.ts";

let laufendeNummer = 0;

/** Ein Objekt, bei dem alle Bedingungen zum Entfernen erfuellt sind. */
function objekt(teile: Partial<WacheObjekt> = {}): WacheObjekt {
  laufendeNummer++;
  return {
    id: `obj-${laufendeNummer}`,
    titel: "01. Hof, Ossecker Straße 42",
    adresse: "Ossecker Straße 42",
    plz: "95030",
    erstellt_am: "2026-01-01T10:00:00Z",
    meta: { investagonSlug: `slug-${laufendeNummer}` },
    einheiten: 6,
    gebundeneEinheiten: 0,
    bilder: 4,
    dokumente: 2,
    beschreibung: "Text",
    exklusivPartner: [],
    highlights: [],
    videoUrl: null,
    ...teile,
  };
}

/** Das echte Paar: gleiches Haus, gleicher Titel, alt und neu. */
function echtesPaar(teile: Partial<WacheObjekt> = {}): [WacheObjekt, WacheObjekt] {
  const alt = objekt({ erstellt_am: "2026-01-01T10:00:00Z", ...teile });
  const neu = objekt({ erstellt_am: "2026-09-16T10:00:00Z", einheiten: 8 });
  return [alt, neu];
}

describe("echte Dubletten", () => {
  it("entfernt das aeltere und behaelt das neuere", () => {
    const [alt, neu] = echtesPaar();
    const befund = beurteile([alt, neu]);
    expect(befund.hindernisse).toEqual([]);
    expect(befund.entfernen?.id).toBe(alt.id);
    expect(befund.behalten?.id).toBe(neu.id);
  });

  it("urteilt gleich, egal in welcher Reihenfolge die beiden kommen", () => {
    const [alt, neu] = echtesPaar();
    const befund = beurteile([neu, alt]);
    expect(befund.hindernisse).toEqual([]);
    expect(befund.entfernen?.id).toBe(alt.id);
    expect(befund.behalten?.id).toBe(neu.id);
  });

  it("erkennt dasselbe Haus trotz abweichender Schreibweise", () => {
    const alt = objekt({
      titel: "01. Hof, Ossecker Str. 42",
      adresse: "Ossecker Str. 42",
      erstellt_am: "2026-01-01T10:00:00Z",
    });
    const neu = objekt({
      titel: "01. Hof, Ossecker Straße 42",
      adresse: "Ossecker Straße 42",
      erstellt_am: "2026-09-16T10:00:00Z",
    });
    expect(findeGruppen([alt, neu])).toHaveLength(1);
    expect(beurteile([alt, neu]).entfernen?.id).toBe(alt.id);
  });
});

describe("die Bedingungen, von denen jede einzeln genuegt", () => {
  it("(a) drei Objekte mit demselben Schluessel werden nur gemeldet", () => {
    const befund = beurteile([objekt(), objekt(), objekt()]);
    expect(befund.entfernen).toBeNull();
    expect(befund.hindernisse.join(" ")).toContain("3 Objekte");
  });

  it("(b) ohne Postleitzahl entsteht gar keine Gruppe", () => {
    const a = objekt({ plz: null });
    const b = objekt({ plz: null, erstellt_am: "2026-09-16T10:00:00Z" });
    expect(findeGruppen([a, b])).toEqual([]);
  });

  it("(b) ohne Titel entsteht gar keine Gruppe", () => {
    const a = objekt({ titel: "" });
    const b = objekt({ titel: "", erstellt_am: "2026-09-16T10:00:00Z" });
    expect(findeGruppen([a, b])).toEqual([]);
  });

  it("(c) ein von Hand angelegtes Objekt wird nie entfernt", () => {
    const alt = objekt({ meta: {}, erstellt_am: "2026-01-01T10:00:00Z" });
    const neu = objekt({ erstellt_am: "2026-09-16T10:00:00Z" });
    const befund = beurteile([alt, neu]);
    expect(befund.entfernen).toBeNull();
    expect(befund.hindernisse.join(" ")).toContain("ohne Investagon-Kennung");
  });

  it("(c) auch wenn das neuere von Hand angelegt ist, bleibt es beim Melden", () => {
    const alt = objekt({ erstellt_am: "2026-01-01T10:00:00Z" });
    const neu = objekt({ meta: null, erstellt_am: "2026-09-16T10:00:00Z" });
    expect(beurteile([alt, neu]).entfernen).toBeNull();
  });

  it("(d) ein Kunde am aelteren Objekt haelt es fest", () => {
    const alt = objekt({
      erstellt_am: "2026-01-01T10:00:00Z",
      gebundeneEinheiten: 1,
    });
    const neu = objekt({ erstellt_am: "2026-09-16T10:00:00Z" });
    const befund = beurteile([alt, neu]);
    expect(befund.entfernen).toBeNull();
    expect(befund.hindernisse.join(" ")).toContain("mit Kunde");
  });

  it("(d) ein Kunde am neueren Objekt stoert nicht, es bleibt ohnehin", () => {
    const alt = objekt({ erstellt_am: "2026-01-01T10:00:00Z" });
    const neu = objekt({
      erstellt_am: "2026-09-16T10:00:00Z",
      gebundeneEinheiten: 3,
    });
    expect(beurteile([alt, neu]).entfernen?.id).toBe(alt.id);
  });

  it("(e) mehr Bilder am aelteren Objekt halten es fest", () => {
    const alt = objekt({ erstellt_am: "2026-01-01T10:00:00Z", bilder: 9 });
    const neu = objekt({ erstellt_am: "2026-09-16T10:00:00Z", bilder: 4 });
    const befund = beurteile([alt, neu]);
    expect(befund.entfernen).toBeNull();
    expect(befund.hindernisse.join(" ")).toContain("Bilder");
  });

  it("(e) ein Exklusivpartner, den das neuere nicht kennt, haelt es fest", () => {
    const alt = objekt({
      erstellt_am: "2026-01-01T10:00:00Z",
      exklusivPartner: ["Hermann Vogl"],
    });
    const neu = objekt({ erstellt_am: "2026-09-16T10:00:00Z" });
    const befund = beurteile([alt, neu]);
    expect(befund.entfernen).toBeNull();
    expect(befund.hindernisse.join(" ")).toContain("Hermann Vogl");
  });

  it("(e) ein Beschreibungstext, der drueben fehlt, haelt es fest", () => {
    const alt = objekt({
      erstellt_am: "2026-01-01T10:00:00Z",
      beschreibung: "Von Hand geschrieben",
    });
    const neu = objekt({ erstellt_am: "2026-09-16T10:00:00Z", beschreibung: "" });
    const befund = beurteile([alt, neu]);
    expect(befund.entfernen).toBeNull();
    expect(befund.hindernisse.join(" ")).toContain("Beschreibungstext");
  });

  it("(e) gleich viel auf beiden Seiten ist kein Verlust", () => {
    const alt = objekt({ erstellt_am: "2026-01-01T10:00:00Z", dokumente: 2 });
    const neu = objekt({ erstellt_am: "2026-09-16T10:00:00Z", dokumente: 2 });
    expect(beurteile([alt, neu]).entfernen?.id).toBe(alt.id);
  });

  it("(f) ohne Anlagedatum wird nur gemeldet", () => {
    const a = objekt({ erstellt_am: null });
    const b = objekt({ erstellt_am: "2026-09-16T10:00:00Z" });
    const befund = beurteile([a, b]);
    expect(befund.entfernen).toBeNull();
    expect(befund.hindernisse.join(" ")).toContain("Anlagedatum");
  });

  it("(f) bei gleichem Anlagedatum wird nur gemeldet", () => {
    const a = objekt({ erstellt_am: "2026-05-05T08:00:00Z" });
    const b = objekt({ erstellt_am: "2026-05-05T08:00:00Z" });
    expect(beurteile([a, b]).entfernen).toBeNull();
  });

  it("(f) hat ausgerechnet das aeltere mehr Einheiten, wird nur gemeldet", () => {
    const alt = objekt({ erstellt_am: "2026-01-01T10:00:00Z", einheiten: 12 });
    const neu = objekt({ erstellt_am: "2026-09-16T10:00:00Z", einheiten: 6 });
    const befund = beurteile([alt, neu]);
    expect(befund.entfernen).toBeNull();
    expect(befund.hindernisse.join(" ")).toContain("mehr Einheiten");
  });

  it("entfernt immer nur eines der beiden", () => {
    const [alt, neu] = echtesPaar();
    const plan = planeWache([alt, neu]);
    expect(plan.entfernen).toHaveLength(1);
    expect(plan.entfernen[0].entfernen?.id).toBe(alt.id);
    expect(plan.entfernen[0].behalten?.id).toBe(neu.id);
  });
});

describe("Bremsen", () => {
  function paare(anzahl: number): WacheObjekt[] {
    const alle: WacheObjekt[] = [];
    for (let i = 0; i < anzahl; i++) {
      const titel = `${i}. Musterstadt, Musterweg ${i}`;
      alle.push(objekt({
        titel,
        adresse: `Musterweg ${i}`,
        erstellt_am: "2026-01-01T10:00:00Z",
      }));
      alle.push(objekt({
        titel,
        adresse: `Musterweg ${i}`,
        erstellt_am: "2026-09-16T10:00:00Z",
        einheiten: 8,
      }));
    }
    return alle;
  }

  it("entfernt hoechstens die Obergrenze je Lauf und vertagt den Rest", () => {
    const plan = planeWache(paare(10));
    expect(plan.befunde).toHaveLength(10);
    expect(plan.entfernen).toHaveLength(HOECHSTENS_JE_LAUF);
    expect(plan.vertagt).toBe(10 - HOECHSTENS_JE_LAUF);
    expect(plan.notbremse).toBeNull();
  });

  it("laesst den bekannten Rueckstand von 35 Paaren durch", () => {
    const plan = planeWache(paare(35));
    expect(plan.notbremse).toBeNull();
    expect(plan.entfernen).toHaveLength(HOECHSTENS_JE_LAUF);
  });

  it("zieht oberhalb der Notbremse alles zurueck und meldet nur", () => {
    const plan = planeWache(paare(NOTBREMSE_KANDIDATEN + 1));
    expect(plan.notbremse).not.toBeNull();
    expect(plan.entfernen).toEqual([]);
    expect(plan.befunde).toHaveLength(NOTBREMSE_KANDIDATEN + 1);
  });

  it("die Obergrenze je Lauf ist kleiner als die Notbremse", () => {
    expect(HOECHSTENS_JE_LAUF).toBeLessThan(NOTBREMSE_KANDIDATEN);
  });
});

/**
 * Die neun Paare, die keine Dubletten sind.
 *
 * Dasselbe Haus in zwei Vermarktungsmodellen. Gleiche Adresse, gleiche
 * Postleitzahl, verschiedener Titel. Sie duerfen weder in eine Gruppe geraten
 * noch beurteilt werden.
 */
describe("die neun Modellvarianten bleiben unangetastet", () => {
  const varianten: [string, string, string, string][] = [
    [
      "01. Hof, Ossecker Straße 42 (Standard-Modell)",
      "01. Hof, Ossecker Straße 42 (All-inclusive-Modell)",
      "Ossecker Straße 42",
      "95030",
    ],
    [
      "01. Hof, Ossecker Straße 46 (Standard-Modell)",
      "01. Hof, Ossecker Straße 46 (All-inclusive-Modell)",
      "Ossecker Straße 46",
      "95030",
    ],
    [
      "01. Hof, Scharnhorststraße 1 (Standard-Modell)",
      "01. Hof, Scharnhorststraße 1 (All-inclusive-Modell)",
      "Scharnhorststraße 1",
      "95030",
    ],
    [
      "01. Hof, Scharnhorststraße 3 (Standard-Modell)",
      "01. Hof, Scharnhorststraße 3 (All-inclusive-Modell)",
      "Scharnhorststraße 3",
      "95030",
    ],
    [
      "01. Hof, Scharnhorststraße 5 (Standard-Modell)",
      "01. Hof, Scharnhorststraße 5 (All-inclusive-Modell)",
      "Scharnhorststraße 5",
      "95030",
    ],
    [
      "12. Nürnberg, Breitscheidstraße 18 (Standard-Modell)",
      "12. Nürnberg, Breitscheidstraße 18 (All-inclusive-Modell)",
      "Breitscheidstraße 18",
      "90459",
    ],
    [
      "15. Nürnberg, Gebhard-Ott-Straße 5 (Standard-Modell)",
      "15. Nürnberg, Gebhard-Ott-Straße 5 (All-inclusive-Modell)",
      "Gebhard-Ott-Straße 5",
      "90459",
    ],
    [
      "13. Landsbergerstraße 22a, 82210 Germering",
      "13. Landsbergerstraße 22a, 82210 Germering (Co-Living)",
      "Landsbergerstraße 22a",
      "82210",
    ],
    [
      "Quartier Würzburg - Co-Living",
      "Quartier Würzburg - Bestandswohnungen",
      "Nürnberger Straße 40",
      "97076",
    ],
  ];

  it("es sind wirklich neun", () => {
    expect(varianten).toHaveLength(9);
  });

  for (const [einer, anderer, adresse, plz] of varianten) {
    for (const [erst, zweit] of [[einer, anderer], [anderer, einer]]) {
      it(`"${erst}" neben "${zweit}" ergibt keine Gruppe`, () => {
        const a = objekt({
          titel: erst,
          adresse,
          plz,
          erstellt_am: "2026-01-01T10:00:00Z",
        });
        const b = objekt({
          titel: zweit,
          adresse,
          plz,
          erstellt_am: "2026-09-16T10:00:00Z",
        });
        expect(findeGruppen([a, b])).toEqual([]);
        const plan = planeWache([a, b]);
        expect(plan.befunde).toEqual([]);
        expect(plan.entfernen).toEqual([]);
      });
    }
  }

  it("eine echte Dublette neben einer Modellvariante trifft nur die Dublette", () => {
    const standard = objekt({
      titel: "01. Hof, Ossecker Straße 42 (Standard-Modell)",
      erstellt_am: "2026-01-01T10:00:00Z",
    });
    const allInclusive = objekt({
      titel: "01. Hof, Ossecker Straße 42 (All-inclusive-Modell)",
      erstellt_am: "2026-02-01T10:00:00Z",
    });
    const standardKopie = objekt({
      titel: "01. Hof, Ossecker Straße 42 (Standard-Modell)",
      erstellt_am: "2026-09-16T10:00:00Z",
      einheiten: 8,
    });

    const plan = planeWache([standard, allInclusive, standardKopie]);
    expect(plan.befunde).toHaveLength(1);
    expect(plan.entfernen).toHaveLength(1);
    expect(plan.entfernen[0].entfernen?.id).toBe(standard.id);
    expect(plan.entfernen[0].behalten?.id).toBe(standardKopie.id);
    // Die All-inclusive-Fassung kommt in keinem Befund vor.
    expect(
      plan.befunde.flatMap((b) => b.objekte).map((o) => o.id),
    ).not.toContain(allInclusive.id);
  });
});
