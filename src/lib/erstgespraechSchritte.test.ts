import { describe, it, expect, beforeEach } from "vitest";
import {
  baueErstgespraechSchritte, teil2Abschnitte, teil1Punkte, schrittZustand, zaehleErledigt,
  felderStand, startSchrittId, leseSchrittMerker, schreibeSchrittMerker, punktId, abschnittId,
  schrittBezeichnung, TEIL_2_ANZAHL,
  type ZustandsKontext,
} from "./erstgespraechSchritte";
import { baueModerationsSchritte } from "./praesentationsDeck";
import { CLOSING_DIREKT_ABSCHNITTE } from "./closingDirektSkript";
import { ASSESSMENT_STATIONEN } from "./assessmentSkript";

// jsdom bringt hier keinen sessionStorage mit.
const speicher = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

beforeEach(() => speicher.clear());

const leererKontext = (aktuelleId: string, teil: Partial<ZustandsKontext> = {}): ZustandsKontext => ({
  aktuelleId,
  verlassen: [],
  abgeschlossen: false,
  assessment: {},
  closingDirekt: {},
  closingDatum: "",
  closingUhrzeit: "",
  ...teil,
});

describe("erstgespraechSchritte: Reihenfolge", () => {
  it("Schalter aus: die zehn Punkte von Teil 1 in Stationsreihenfolge", () => {
    const schritte = baueErstgespraechSchritte(false);
    expect(schritte).toHaveLength(10);
    expect(schritte.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(punktId));
    expect(schritte.every((s) => s.art === "punkt")).toBe(true);
  });

  it("Schalter an: Punkt 9 steht VOR Teil 2, Punkt 10 entfällt, 16 Abschnitte folgen", () => {
    const schritte = baueErstgespraechSchritte(true);
    expect(schritte).toHaveLength(9 + TEIL_2_ANZAHL);
    expect(schritte.slice(0, 9).map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(punktId));
    expect(schritte.some((s) => s.id === punktId(10))).toBe(false);
    const teil2 = schritte.slice(9);
    expect(teil2.every((s) => s.art === "abschnitt")).toBe(true);
    expect(teil2[0].id).toBe(abschnittId("einstieg"));
    expect(teil2[teil2.length - 1].id).toBe(abschnittId("gespraechsabschluss"));
    expect(teil2.map((s) => s.nummer)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("Teil 2 folgt der Dramaturgie des Decks und deckt alle 16 Abschnitte ab", () => {
    const abschnitte = teil2Abschnitte();
    expect(abschnitte).toHaveLength(CLOSING_DIREKT_ABSCHNITTE.length);
    expect(new Set(abschnitte.map((a) => a.key)).size).toBe(CLOSING_DIREKT_ABSCHNITTE.length);
    // Die Folien-Reihenfolge der Moderation (teil=2) ist dieselbe.
    const moderation = baueModerationsSchritte(2, true)
      .map((s) => (s.art === "folie" ? s.folie.id : ""))
      .filter(Boolean);
    const reiter: string[] = [];
    for (const a of abschnitte) if (reiter[reiter.length - 1] !== a.folieId) reiter.push(a.folieId);
    // Die Moderation lässt bedingte Folien (Partnerstimmen, Kennzahlen) weg,
    // wenn sie nicht gepflegt sind; der Reiter zeigt immer alle Abschnitte.
    expect(reiter.filter((id) => moderation.includes(id))).toEqual(moderation.filter((id) => reiter.includes(id)));
  });

  it("Teil 1 hat dieselbe Stationsreihenfolge wie die Moderation, Einschätzung nach Einwänden", () => {
    const moderation = baueModerationsSchritte(1, false);
    const folienStationen = moderation
      .map((s) => (s.art === "folie" && s.folie.skript.art === "station" ? s.folie.skript.key : null))
      .filter((k): k is string => !!k);
    const reiter = teil1Punkte().map((p) => (p.art === "punkt" ? p.station.key : ""));
    expect(reiter.filter((k) => folienStationen.includes(k))).toEqual(folienStationen);
    // Der Zwischenstopp der Moderation sitzt nach der Folie „einwaende", der
    // Reiter zeigt Punkt 9 direkt nach Punkt 8.
    expect(reiter.indexOf("einschaetzung")).toBe(reiter.indexOf("einwaende") + 1);
    expect(ASSESSMENT_STATIONEN.find((s) => s.key === "einschaetzung")?.nummer).toBe(9);
  });

  it("Bezeichnungen tragen Nummer und Kurztitel", () => {
    const schritte = baueErstgespraechSchritte(true);
    expect(schrittBezeichnung(schritte[4])).toBe("Punkt 5 · Motivation");
    expect(schrittBezeichnung(schritte[9 + 11])).toBe("Abschnitt 12 · Preis und Paket");
  });
});

describe("erstgespraechSchritte: Zustände", () => {
  const schritte = baueErstgespraechSchritte(false);
  const p = (n: number) => schritte.find((s) => s.id === punktId(n))!;

  it("aktuell, offen, angefangen und erledigt", () => {
    const k = leererKontext(punktId(5), {
      verlassen: [punktId(1), punktId(2)],
      assessment: { ziele: "Freiheit" },
    });
    expect(schrittZustand(p(5), k)).toBe("aktuell");
    expect(schrittZustand(p(1), k)).toBe("erledigt");
    expect(schrittZustand(p(2), k)).toBe("erledigt");
    expect(schrittZustand(p(4), k)).toBe("angefangen");
    expect(schrittZustand(p(6), k)).toBe("offen");
    expect(zaehleErledigt(schritte, k)).toEqual({ teil1: 2, teil2: 0 });
  });

  it("nach dem Abschließen gilt Teil 1 komplett als erledigt", () => {
    const k = leererKontext(punktId(10), { abgeschlossen: true });
    expect(schrittZustand(p(1), k)).toBe("erledigt");
    expect(schrittZustand(p(9), k)).toBe("erledigt");
    expect(zaehleErledigt(schritte, k).teil1).toBe(9);
  });

  it("Punkt 3 zählt die Pfadwahl, Punkt 10 Datum und Uhrzeit", () => {
    const q = leererKontext(punktId(1), { assessment: { pfade: ["immo"] }, closingDatum: "08.09.2026" });
    expect(felderStand(p(3), q)).toEqual({ erfasst: 1, gesamt: 1 });
    expect(felderStand(p(10), q)).toEqual({ erfasst: 1, gesamt: 2 });
    expect(schrittZustand(p(10), q)).toBe("angefangen");
  });

  it("Teil 2: erledigt heißt abgehakt, angefangen heißt Notiz vorhanden", () => {
    const mitTeil2 = baueErstgespraechSchritte(true);
    const a = (key: string) => mitTeil2.find((s) => s.id === abschnittId(key))!;
    const k = leererKontext(abschnittId("preis"), {
      closingDirekt: { aktiv: true, abgehakt: ["einstieg"], notizen: { chaosNotiz: "kennt er" } },
    });
    expect(schrittZustand(a("einstieg"), k)).toBe("erledigt");
    expect(schrittZustand(a("einzelkaempfer"), k)).toBe("angefangen");
    expect(schrittZustand(a("vision"), k)).toBe("offen");
    expect(schrittZustand(a("preis"), k)).toBe("aktuell");
    expect(zaehleErledigt(mitTeil2, k)).toEqual({ teil1: 0, teil2: 1 });
  });
});

describe("erstgespraechSchritte: Merker im Browser", () => {
  it("merkt Schritt und verlassene Punkte je Bewerber", () => {
    schreibeSchrittMerker("b1", { schrittId: punktId(4), verlassen: [punktId(1)], begonnenAm: "2026-09-02T13:02:00.000Z" });
    expect(leseSchrittMerker("b1")).toEqual({ schrittId: punktId(4), verlassen: [punktId(1)], begonnenAm: "2026-09-02T13:02:00.000Z" });
    expect(leseSchrittMerker("b2")).toEqual({});
  });

  it("Startschritt: gemerkt, sonst letzter bei abgeschlossenem Gespräch, sonst Punkt 1", () => {
    const aus = baueErstgespraechSchritte(false);
    const an = baueErstgespraechSchritte(true);
    expect(startSchrittId(aus, undefined, false)).toBe(punktId(1));
    expect(startSchrittId(aus, undefined, true)).toBe(punktId(10));
    expect(startSchrittId(an, undefined, true)).toBe(abschnittId("gespraechsabschluss"));
    expect(startSchrittId(aus, punktId(7), false)).toBe(punktId(7));
    // Gemerkter Teil-2-Abschnitt, aber Schalter inzwischen aus: zurück zu Punkt 9.
    expect(startSchrittId(aus, abschnittId("preis"), false)).toBe(punktId(9));
    // Kaputter Merker fällt auf Punkt 1 zurück.
    expect(startSchrittId(aus, "unbekannt", false)).toBe(punktId(1));
  });
});
