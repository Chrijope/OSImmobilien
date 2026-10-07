import { describe, it, expect, vi, beforeEach } from "vitest";
import { darfVorruecken, istEndzustand, stufeErreicht } from "@/lib/pipelineStufen";

/**
 * Das Eintragen der Objektdaten hebt den Vorgang auf "Objektauswahl".
 *
 * Zwei Dinge dürfen dabei nicht passieren, und beide sind hier abgesichert:
 *
 *   1. Ein beendeter Vorgang darf nicht wiederbelebt werden. "verloren",
 *      "archiviert" und "bestandsimport" haben in der Fortschrittsleiste
 *      keinen Rang, `fortschrittsRang` liefert für sie null. Wer nur den Rang
 *      vergleicht, hält einen verlorenen Kunden für einen frischen Lead und
 *      zieht ihn beim nächsten Anlass zurück in den Verkaufsprozess.
 *   2. Ein Vorgang, der schon weiter ist, darf nicht zurückfallen. Wer beim
 *      Notar steht und dessen Adresse jemand korrigiert, bleibt beim Notar.
 */

const ENDZUSTAENDE = ["verloren", "archiviert", "bestandsimport"];

describe("Endzustände sind kein Fortschritt", () => {
  it("erkennt die drei beendeten Zustände", () => {
    for (const s of ENDZUSTAENDE) expect(istEndzustand(s)).toBe(true);
  });

  it("hält laufende Stufen nicht für beendet", () => {
    for (const s of ["neuer_lead", "beratungsgespraech", "objektauswahl", "notar", "abgeschlossen"]) {
      expect(istEndzustand(s)).toBe(false);
    }
  });
});

describe("Vorrücken auf Objektauswahl", () => {
  it("rückt aus den Stufen davor vor", () => {
    for (const s of ["neuer_lead", "nicht_erreicht", "erreicht", "follow_up",
                     "erstgespraech_geplant", "beratungsgespraech", "selbstauskunft"]) {
      expect(darfVorruecken(s, "objektauswahl")).toBe(true);
    }
  });

  it("rückt auch bei fehlender Stufe vor", () => {
    expect(darfVorruecken(undefined, "objektauswahl")).toBe(true);
    expect(darfVorruecken(null, "objektauswahl")).toBe(true);
    expect(darfVorruecken("", "objektauswahl")).toBe(true);
  });

  it("zieht einen weiter fortgeschrittenen Vorgang nicht zurück", () => {
    for (const s of ["follow_up_objekt", "reservierung", "bonitaetsunterlagen",
                     "finanzierung", "notar", "faelligkeit", "abrechnung", "abgeschlossen"]) {
      expect(darfVorruecken(s, "objektauswahl")).toBe(false);
    }
  });

  it("setzt eine bereits erreichte Stufe nicht erneut", () => {
    expect(darfVorruecken("objektauswahl", "objektauswahl")).toBe(false);
  });

  it("belebt einen beendeten Vorgang nicht wieder", () => {
    for (const s of ENDZUSTAENDE) {
      expect(darfVorruecken(s, "objektauswahl")).toBe(false);
    }
  });

  it("bildet NoShow-Stufen auf das zugehörige Gespräch ab und rückt von dort vor", () => {
    expect(darfVorruecken("eg_noshow", "objektauswahl")).toBe(true);
    expect(darfVorruecken("bg_noshow", "objektauswahl")).toBe(true);
  });
});

describe("stufeErreicht ersetzt die handgepflegten Listen", () => {
  /*
   * Die alten Aufzählungen hatten jede eine andere Lücke. In der Objektauswahl
   * fehlten "bonitaetsunterlagen" und "faelligkeit", weshalb dort wieder alle
   * freien Wohnungen erschienen, obwohl das Objekt längst gesetzt war.
   */
  it("kennt ab der Reservierung alle folgenden Stufen, auch die früher vergessenen", () => {
    for (const s of ["reservierung", "bonitaetsunterlagen", "finanzierung",
                     "notar", "faelligkeit", "abrechnung", "abgeschlossen"]) {
      expect(stufeErreicht(s, "reservierung")).toBe(true);
    }
  });

  it("gilt vor der Reservierung nicht", () => {
    for (const s of ["selbstauskunft", "objektauswahl", "follow_up_objekt"]) {
      expect(stufeErreicht(s, "reservierung")).toBe(false);
    }
  });

  it("zählt ab der Objektauswahl auch die Bonitätsunterlagen mit", () => {
    expect(stufeErreicht("bonitaetsunterlagen", "objektauswahl")).toBe(true);
    expect(stufeErreicht("faelligkeit", "objektauswahl")).toBe(true);
  });

  it("gilt für beendete Vorgänge nie", () => {
    for (const s of ENDZUSTAENDE) {
      expect(stufeErreicht(s, "objektauswahl")).toBe(false);
      expect(stufeErreicht(s, "neuer_lead")).toBe(false);
    }
  });
});

// ── Die Regel im Zusammenspiel mit dem Speichern ──

const investment: Record<string, any> = {};
const metaFelder: Record<string, any> = {};
const updateInvestment = vi.fn();
const objekte: any[] = [];

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (investment.id === id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: any) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, any>) => {
    Object.assign(metaFelder, felder);
  },
  updateInvestment: (...args: any[]) => updateInvestment(...args),
  getInvestmentsByKontakt: () => [],
}));

vi.mock("@/lib/objekteStore", () => ({
  getWohnungKurz: (objektId?: string | null, wohnungId?: string | null) => {
    const objekt = objektId
      ? objekte.find((o) => o.id === objektId)
      : objekte.find((o) => o.wohnungen?.some((w: any) => w.id === wohnungId));
    if (!objekt) return null;
    const w = objekt.wohnungen?.find((x: any) => x.id === wohnungId);
    return {
      objektId: objekt.id, titel: objekt.titel || "", adresse: objekt.adresse,
      plz: objekt.plz, ort: objekt.ort,
      weNr: w?.weNr || "", vkGesamt: w?.vkGesamt || 0, groesse: w?.groesse || 0,
    };
  },
}));

const {
  speichereObjektDaten, objektDatenFehlen, vorhandeneObjektDaten, hatBestandsWohnung,
  BESTANDSWOHNUNG_AKTIV,
} = await import("@/lib/objektDatenPflicht");

const DATEN = {
  strasse: "Musterweg 1",
  plz: "12345",
  ort: "Musterstadt",
  weNr: "3",
  kaufpreis: 200000,
};

beforeEach(() => {
  updateInvestment.mockClear();
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
  for (const k of Object.keys(investment)) delete investment[k];
  objekte.length = 0;
  Object.assign(investment, { id: "inv-1", kontaktId: "k-1", pipelineStufe: "beratungsgespraech" });
});

/** Die Stufe, mit der `updateInvestment` zuletzt aufgerufen wurde. */
const gesetzteStufe = () => updateInvestment.mock.calls.at(-1)?.[1]?.pipelineStufe;

describe("speichereObjektDaten hebt die Stufe", () => {
  /*
   * Seit dem 21.09.2026 genuegt der Rangvergleich nicht mehr.
   *
   * Christian hatte einen Vorgang in der Objektauswahl, dessen Selbstauskunft
   * erst zu achtzig Prozent ausgefuellt und nicht unterschrieben war. Das
   * Speichern der Objektdaten war einer der Wege dorthin: Es prueft, ob
   * Objektauswahl weiter vorne liegt, aber nicht, ob der Vorgang dort
   * hingehoert. Jetzt entscheidet zusaetzlich `darfAufObjektauswahl`.
   *
   * Der dritte Weg auf die Objektauswahl, der Vermerk "Kunde finanziert
   * selbst", steht nicht hier, sondern in objektauswahlWaechter.test.ts. Er
   * laeuft ueber `getSelbstauskunftEntfaellt`.
   */
  it("setzt Objektauswahl, wenn die Selbstauskunft unterschrieben ist", () => {
    // In der Meta-Ablage, wie im echten Speicher; `investment.meta` gibt es dort nicht.
    metaFelder.saSigned = true;
    speichereObjektDaten("inv-1", DATEN);
    expect(gesetzteStufe()).toBe("objektauswahl");
  });

  it("laesst die Stufe stehen, solange die Selbstauskunft nicht unterschrieben ist", () => {
    // Genau Christians Fall: Objektdaten werden eingetragen, die Unterschrift
    // fehlt. Die Daten werden gespeichert, die Stufe bleibt.
    investment.meta = {};
    speichereObjektDaten("inv-1", DATEN);
    expect(gesetzteStufe()).toBeUndefined();
  });


  it("lässt einen Vorgang beim Notar in Ruhe", () => {
    investment.pipelineStufe = "notar";
    speichereObjektDaten("inv-1", DATEN);
    expect(gesetzteStufe()).toBeUndefined();
  });

  it("belebt einen verlorenen Vorgang nicht wieder", () => {
    investment.pipelineStufe = "verloren";
    speichereObjektDaten("inv-1", DATEN);
    expect(gesetzteStufe()).toBeUndefined();
  });

  it("schreibt Adresse und Kaufpreis trotzdem, auch ohne Stufenwechsel", () => {
    investment.pipelineStufe = "notar";
    speichereObjektDaten("inv-1", DATEN);
    expect(metaFelder.kaufpreis).toBe(200000);
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Musterweg 1");
    expect(updateInvestment.mock.calls.at(-1)?.[1]?.objektTitel).toBe("Musterweg 1, 12345 Musterstadt");
  });

  it("ist beim zweiten Aufruf still, weil die Stufe schon steht", () => {
    speichereObjektDaten("inv-1", DATEN);
    investment.pipelineStufe = "objektauswahl";
    updateInvestment.mockClear();
    speichereObjektDaten("inv-1", DATEN);
    expect(gesetzteStufe()).toBeUndefined();
  });
});

describe("Wohnung aus dem eigenen Bestand", () => {
  /*
   * Der Bestandsweg ist abgeschaltet, siehe `BESTANDSWOHNUNG_AKTIV`. Es gibt
   * heute keine Wohnungen im eigenen Bestand, jedes Objekt kommt von
   * Investagon und wird am Investment gepflegt.
   *
   * Die Prüfungen bleiben deshalb stehen und beschreiben beide Zustände. So
   * greifen sie beim Wiedereinschalten sofort wieder und sichern zugleich ab,
   * dass der Schalter heute wirklich wirkt.
   *
   * Was sie im eingeschalteten Zustand sichern: Vorher galten die Objektdaten
   * bei einer sauber reservierten Bestandswohnung als leer. Der Dialog
   * verlangte dann eine Adresse, die längst feststand, und wer sie eintippte,
   * erzeugte eine zweite Fassung neben der reservierten Wohnung.
   */
  beforeEach(() => {
    Object.assign(investment, { objektId: "obj-1", wohnungId: "wo-1" });
    objekte.push({
      id: "obj-1",
      adresse: "Bestandsstraße 7",
      plz: "54321",
      ort: "Beispielort",
      wohnungen: [{ id: "wo-1", weNr: "12", vkGesamt: 189000, groesse: 62 }],
    });
  });

  it("wird nur als Quelle erkannt, solange der Bestandsweg an ist", () => {
    expect(hatBestandsWohnung("inv-1")).toBe(BESTANDSWOHNUNG_AKTIV);
  });

  it("liefert Adresse, Einheit und Preis aus dem Objekt", () => {
    const d = vorhandeneObjektDaten("inv-1");
    if (!BESTANDSWOHNUNG_AKTIV) {
      // Abgeschaltet: Der Verweis bleibt am Investment gespeichert, er ist
      // nur keine Quelle für die Objektdaten mehr.
      expect(d.strasse).toBe("");
      expect(d.weNr).toBe("");
      expect(d.kaufpreis).toBe(0);
      expect(investment.wohnungId).toBe("wo-1");
      return;
    }
    expect(d.strasse).toBe("Bestandsstraße 7");
    expect(d.ort).toBe("Beispielort");
    expect(d.weNr).toBe("12");
    expect(d.kaufpreis).toBe(189000);
    expect(d.wohnflaeche).toBe(62);
  });

  it("gilt damit nicht mehr als unvollständig", () => {
    // Abgeschaltet fehlen die Angaben wieder, und genau deshalb bietet die
    // Objektauswahl das Eintragen von Hand an.
    expect(objektDatenFehlen("inv-1")).toBe(!BESTANDSWOHNUNG_AKTIV);
  });

  it("hat Vorrang vor einer von Hand eingetragenen Abschrift", () => {
    metaFelder.rvVirtualWohnung = { objAdresse: "Alte Abschrift 1", objOrt: "Anderswo", weNr: "99" };
    const d = vorhandeneObjektDaten("inv-1");
    if (!BESTANDSWOHNUNG_AKTIV) {
      // Abgeschaltet gibt es keinen Vorrang mehr: Es gilt, was am Investment
      // steht.
      expect(d.strasse).toBe("Alte Abschrift 1");
      expect(d.weNr).toBe("99");
      return;
    }
    expect(d.strasse).toBe("Bestandsstraße 7");
    expect(d.weNr).toBe("12");
  });
});

describe("Ohne Bestandswohnung bleibt es bei den eingetragenen Angaben", () => {
  it("meldet fehlende Objektdaten, solange nichts hinterlegt ist", () => {
    expect(objektDatenFehlen("inv-1")).toBe(true);
    expect(hatBestandsWohnung("inv-1")).toBe(false);
  });

  it("meldet sie als vollständig, sobald sie eingetragen wurden", () => {
    speichereObjektDaten("inv-1", DATEN);
    expect(objektDatenFehlen("inv-1")).toBe(false);
  });
});
