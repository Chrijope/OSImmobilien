import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Adresse und Kaufpreis aus der Objektauswahl kommen in der Pipeline an.
 *
 * Zwei Fragen, die sonst alle paar Wochen neu gestellt werden:
 *
 *   1. Steht das, was jemand im Fenster „Objektdaten“ eintippt, danach auch
 *      auf der Karte in der Pipeline? Die Adresse als Titel des Investments,
 *      der Kaufpreis als Betrag darunter.
 *   2. Zählt derselbe Kaufpreis in die Summe unter der Spalte mit?
 *
 * Geprüft wird der ganze Weg und nicht nur der Umwandler: Eingabetext →
 * `speichereObjektDaten` → Ablage am Investment → `investmentKaufpreis` →
 * dieselbe Rechnung, die die Summenzeile der Pipeline macht.
 *
 * Die Falle mit der Zahl ist ausdrücklich mit drin. Im Feld steht „650.000“
 * mit Tausenderpunkt. Wer das mit `Number` liest, bekommt 650, und genau das
 * ist in dieser Woche zweimal passiert. Die Umwandlung gehört deshalb in den
 * Durchlauf und nicht in einen eigenen kleinen Test daneben.
 */

/* ── Die Ablage, die alle Stationen teilen ── */

type Inv = Record<string, any>;

const investments: Inv[] = [];
const metaAblage = new Map<string, Record<string, any>>();

const meta = (id: string) => {
  if (!metaAblage.has(id)) metaAblage.set(id, {});
  return metaAblage.get(id)!;
};

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => investments.find((i) => i.id === id),
  getInvestmentMetaField: (id: string, key: string, fallback: any) =>
    meta(id)[key] ?? fallback,
  setInvestmentMetaFields: (id: string, felder: Record<string, any>) => {
    Object.assign(meta(id), felder);
  },
  updateInvestment: (id: string, felder: Record<string, any>) => {
    const inv = investments.find((i) => i.id === id);
    if (inv) Object.assign(inv, felder);
  },
  getInvestmentsByKontakt: (kontaktId: string) =>
    investments.filter((i) => i.kontaktId === kontaktId),
}));

vi.mock("@/lib/objekteStore", () => ({ getWohnungKurz: () => null }));

const { speichereObjektDaten, investmentKaufpreis, kontaktKaufpreis } =
  await import("@/lib/objektDatenPflicht");
const { zahlAusText } = await import("@/lib/zahlAusText");

/** Ein Investment anlegen, wie die Pipeline es vorfindet. */
function neuesInvestment(id: string, kontaktId = "k-1", stufe = "beratungsgespraech") {
  /*
   * `saSigned` gehoert seit dem 21.09.2026 dazu.
   *
   * Seither hebt das Speichern der Objektdaten die Stufe nur noch, wenn die
   * Selbstauskunft unterschrieben ist. Hier geht es um den Kaufpreis auf der
   * Pipelinekarte, und die Karte liegt nur dann in der Spalte Objektauswahl.
   * Ohne die Unterschrift bliebe der Vorgang stehen und der Test pruefte eine
   * Spalte, in der die Karte gar nicht haengt.
   */
  // Wie im echten Speicher liegt `saSigned` in der Meta-Ablage, nicht am
  // umgewandelten Investment (dort gibt es kein `meta`).
  investments.push({
    id, kontaktId, pipelineStufe: stufe, nummer: investments.length + 1,
  });
  meta(id).saSigned = true;
  return id;
}

/**
 * Genau die Rechnung, die unter der Pipelinespalte steht.
 *
 * Bewusst nachgebaut und nicht importiert: Die Summe ist ein Einzeiler in
 * `Pipeline.tsx` und lässt sich von dort nicht herausrufen. Damit die Kopie
 * nicht davonläuft, prüft der letzte Abschnitt unten die Fundstelle im Text
 * der Seite mit.
 */
const spaltenSumme = (investmentIds: (string | undefined)[]) =>
  investmentIds.reduce((s, id) => s + (investmentKaufpreis(id) || 0), 0);

/** Ein vollständig ausgefülltes Fenster, so wie der Dialog es abliefert. */
const objektAus = (felder: Record<string, any>) => ({
  strasse: "", plz: "", ort: "", weNr: "", kaufpreis: 0, ...felder,
} as any);

beforeEach(() => {
  investments.length = 0;
  metaAblage.clear();
});

describe("Punkt 1: Adresse und Kaufpreis stehen auf der Karte", () => {
  beforeEach(() => {
    neuesInvestment("inv-1");
    speichereObjektDaten("inv-1", objektAus({
      strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6",
      // So kommt der Betrag aus dem Eingabefeld: mit Tausenderpunkt.
      kaufpreis: zahlAusText("650.000"),
    }));
  });

  it("legt die Adresse als Titel des Investments ab, den die Karte zeigt", () => {
    // Die Karte schreibt „Investment 1 · {objektTitel}“.
    const inv = investments.find((i) => i.id === "inv-1")!;
    expect(inv.objektTitel).toBe("Roonstraße 3, 95028 Hof");
  });

  it("liest den Kaufpreis unverfälscht zurück, auch mit Tausenderpunkt", () => {
    // Der alte Fehler hätte hier 650 ergeben.
    expect(investmentKaufpreis("inv-1")).toBe(650000);
  });

  it("schiebt den Vorgang auf die Stufe Objektauswahl", () => {
    // Nur so landet die Karte überhaupt in der Spalte, unter der die Summe steht.
    expect(investments.find((i) => i.id === "inv-1")!.pipelineStufe).toBe("objektauswahl");
  });

  it("merkt sich die Einheit am Investment", () => {
    expect(investments.find((i) => i.id === "inv-1")!.weNr).toBe("6");
  });
});

describe("Punkt 2: Der Kaufpreis zählt in die Summe unter der Spalte", () => {
  it("addiert genau den eingetragenen Betrag", () => {
    neuesInvestment("inv-1");
    speichereObjektDaten("inv-1", objektAus({
      strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6",
      kaufpreis: zahlAusText("650.000"),
    }));
    expect(spaltenSumme(["inv-1"])).toBe(650000);
  });

  it("addiert mehrere Karten derselben Spalte", () => {
    neuesInvestment("inv-1", "k-1");
    neuesInvestment("inv-2", "k-2");
    speichereObjektDaten("inv-1", objektAus({
      strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6",
      kaufpreis: zahlAusText("650.000"),
    }));
    speichereObjektDaten("inv-2", objektAus({
      strasse: "Bahnhofstraße 12", plz: "83022", ort: "Rosenheim", weNr: "3",
      kaufpreis: zahlAusText("189.000"),
    }));
    expect(spaltenSumme(["inv-1", "inv-2"])).toBe(839000);
  });

  it("verrechnet einen krummen Betrag als Zahl und nicht als Text", () => {
    // Der Rückweg aus derselben Woche: aus 650000,50 wurde 6.500.005.
    neuesInvestment("inv-1");
    speichereObjektDaten("inv-1", objektAus({
      strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6",
      kaufpreis: zahlAusText("650.000,50"),
    }));
    const summe = spaltenSumme(["inv-1"]);
    expect(typeof summe).toBe("number");
    expect(summe).toBe(650000.5);
  });
});

describe("Punkt 3: Die Fälle, in denen es schiefgehen kann", () => {
  it("zählt bei einem Kunden mit zwei Investments beide Objekte, jedes einmal", () => {
    neuesInvestment("inv-1", "k-1");
    neuesInvestment("inv-2", "k-1");
    speichereObjektDaten("inv-1", objektAus({
      strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6", kaufpreis: 650000,
    }));
    speichereObjektDaten("inv-2", objektAus({
      strasse: "Bahnhofstraße 12", plz: "83022", ort: "Rosenheim", weNr: "3", kaufpreis: 189000,
    }));

    // Jede Karte trägt ihren eigenen Preis, nicht zweimal denselben.
    expect(investmentKaufpreis("inv-1")).toBe(650000);
    expect(investmentKaufpreis("inv-2")).toBe(189000);
    // Stehen beide in derselben Spalte, steht darunter die Summe von beiden.
    expect(spaltenSumme(["inv-1", "inv-2"])).toBe(839000);
    // Und jede Karte nennt ihr eigenes Objekt.
    expect(investments[0].objektTitel).toBe("Roonstraße 3, 95028 Hof");
    expect(investments[1].objektTitel).toBe("Bahnhofstraße 12, 83022 Rosenheim");
    // Der Kundenwert über beide Vorgänge, für Listen außerhalb der Pipeline.
    expect(kontaktKaufpreis("k-1")).toBe(839000);
  });

  it("bleibt bei einem Investment ohne Objekt bei null, statt zu stolpern", () => {
    neuesInvestment("inv-leer");
    expect(investmentKaufpreis("inv-leer")).toBe(0);
    expect(spaltenSumme(["inv-leer"])).toBe(0);
    // Auch ganz ohne Investment, etwa bei einem Kontakt vor dem ersten Vorgang.
    expect(spaltenSumme([undefined])).toBe(0);
  });

  it("zeigt nach einem Objektwechsel das neue Objekt und den neuen Preis", () => {
    neuesInvestment("inv-1");
    speichereObjektDaten("inv-1", objektAus({
      strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6", kaufpreis: 650000,
    }));
    speichereObjektDaten("inv-1", objektAus({
      strasse: "Bahnhofstraße 12", plz: "83022", ort: "Rosenheim", weNr: "3", kaufpreis: 189000,
    }));

    expect(investmentKaufpreis("inv-1")).toBe(189000);
    expect(investments[0].objektTitel).toBe("Bahnhofstraße 12, 83022 Rosenheim");
    // Das alte Objekt ist nicht spurlos weg, es zählt nur nicht mehr mit.
    expect(meta("inv-1").objektVerlauf?.[0]?.strasse).toBe("Roonstraße 3");
    expect(spaltenSumme(["inv-1"])).toBe(189000);
  });

  it("findet den Preis eines Altvorgangs, der nur in der Reservierungsablage steht", () => {
    // Vor 09/2026 schrieb allein die Reservierungsvereinbarung, und zwar nach
    // `rvVirtualWohnung`. `meta.kaufpreis` gab es dort noch nicht.
    neuesInvestment("inv-alt");
    Object.assign(meta("inv-alt"), {
      rvVirtualWohnung: {
        objAdresse: "Altweg 1", objPlz: "80331", objOrt: "München",
        weNr: "2", kaufpreis: 420000,
      },
    });
    expect(investmentKaufpreis("inv-alt")).toBe(420000);
    expect(spaltenSumme(["inv-alt"])).toBe(420000);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Die Summenzeile in der Pipeline selbst
 * ──────────────────────────────────────────────────────────────────────────── */

const pipeline = readFileSync(resolve(process.cwd(), "src/pages/Pipeline.tsx"), "utf8");

describe("Die Summenzeile liest den Kaufpreis des Investments", () => {
  it("rechnet je Karte und nicht je Kontakt", () => {
    // Der Kontaktwert existiert nur einmal, jede Karte steht aber für ein
    // Investment. Mit ihm zählte ein Kunde mit zwei Wohnungen doppelt.
    expect(pipeline).toContain("investmentKaufpreis(e.investmentId)");
  });

  it("nimmt auf der Karte denselben Wert wie in der Summe", () => {
    // Sonst zeigen Kachel und Spaltenfuß verschiedene Zahlen für denselben Vorgang.
    expect(pipeline).toContain("investmentKaufpreis(investmentId)");
  });

  it("zeigt die Summe ab der Objektauswahl, also ab der Stufe mit dem Preis", () => {
    // Ab hier steht ein echter Kaufpreis am Investment. Vorher wäre die Zahl
    // nur die Summe von Potenzialwerten, und genau das soll sie nicht sein.
    const abschnitt = pipeline.slice(pipeline.indexOf("const GESAMT_STUFEN"));
    const menge = abschnitt.slice(0, abschnitt.indexOf("]);"));
    for (const stufe of [
      "objektauswahl", "follow_up_objekt", "reservierung", "bonitaetsunterlagen",
      "finanzierung", "notar", "faelligkeit", "abrechnung", "abgeschlossen",
    ]) {
      expect(menge).toContain(`"${stufe}"`);
    }
  });

  it("zeigt sie nicht vor der Objektauswahl", () => {
    const abschnitt = pipeline.slice(pipeline.indexOf("const GESAMT_STUFEN"));
    const menge = abschnitt.slice(0, abschnitt.indexOf("]);"));
    for (const stufe of ["neuer_lead", "erstgespraech_geplant", "beratungsgespraech", "selbstauskunft"]) {
      expect(menge).not.toContain(`"${stufe}"`);
    }
  });
});
