import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pipeline am Investment (11.10.2026): Aktionen am Kontakt setzen die Stufe
 * an den Investments, nie am Kontakt. Im Testkonto-Modus, dort liegen die
 * Investments im localStorage und lassen sich ohne Datenbank pruefen.
 */
vi.mock("./dbStoreHelper", async (orig) => ({
  ...(await orig<typeof import("./dbStoreHelper")>()),
  isTestAccount: () => true,
}));

import {
  getInvestmentsByKontakt,
  setzeStufeFruehePhase,
  kontaktVerlorenAnInvestments,
  kontaktWiederaufnahmeAnInvestments,
  createInvestment,
} from "./investmentsStore";
import { updateKontakt } from "./kundenStore";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";

const K = "k-1";

function lege(...stufen: string[]) {
  const invs = stufen.map((s, i) => ({
    id: `inv-${i + 1}`, kontaktId: K, nummer: i + 1, label: `Investment ${i + 1}`,
    pipelineStufe: s, erstellt_am: `2026-10-0${i + 1}T00:00:00Z`,
  }));
  localStorage.setItem("osimmo_investments", JSON.stringify(invs));
}
const stufen = () => getInvestmentsByKontakt(K).map((i) => i.pipelineStufe);

beforeEach(() => { setzeSpeicherAttrappe(); });

describe("setzeStufeFruehePhase", () => {
  it("setzt nur Investments vor der Selbstauskunft, ein Kauf beim Notar bleibt", () => {
    lege("notar", "neuer_lead", "verloren");
    expect(setzeStufeFruehePhase(K, "follow_up")).toBe(1);
    expect(stufen()).toEqual(["notar", "follow_up", "verloren"]);
  });

  it("laesst abgeschlossene und Bestandsimport-Investments in Ruhe", () => {
    lege("abgeschlossen", "bestandsimport");
    expect(setzeStufeFruehePhase(K, "kontaktversuche")).toBe(0);
    expect(stufen()).toEqual(["abgeschlossen", "bestandsimport"]);
  });
});

describe("Kontakt verloren und wieder aufgenommen", () => {
  it("verliert alle laufenden Investments und holt genau diese in ihre Stufe zurueck", () => {
    lege("reservierung", "erreicht", "abgeschlossen", "verloren");
    kontaktVerlorenAnInvestments(K, "kb_kein_interesse", "2026-10-11T10:00:00Z");
    expect(stufen()).toEqual(["verloren", "verloren", "abgeschlossen", "verloren"]);

    kontaktWiederaufnahmeAnInvestments(K, "erreicht");
    // Das schon vorher einzeln verlorene Investment 4 bleibt verloren.
    expect(stufen()).toEqual(["reservierung", "erreicht", "abgeschlossen", "verloren"]);
  });

  it("Altfall ohne Merker: das juengste beendete Investment kommt zurueck", () => {
    lege("verloren", "verloren");
    kontaktWiederaufnahmeAnInvestments(K, "follow_up");
    expect(stufen()).toEqual(["verloren", "follow_up"]);
  });
});

describe("Bestandskunde aktivieren", () => {
  it("hebt das vorhandene Bestandsimport-Investment ins Beratungsgespraech, statt ein zweites anzulegen", async () => {
    lege("bestandsimport");
    const inv = await createInvestment(K);
    expect(inv.id).toBe("inv-1");
    expect(stufen()).toEqual(["beratungsgespraech"]);
  });

  it("ein weiteres Investment eines laufenden Kunden beginnt als eigene Karte vorne", async () => {
    lege("notar");
    const inv = await createInvestment(K);
    expect(inv.nummer).toBe(2);
    expect(stufen()).toEqual(["notar", "neuer_lead"]);
  });
});

describe("updateKontakt", () => {
  it("schreibt keine Pipeline-Stufe an den Kontakt", async () => {
    localStorage.setItem("osimmo_kontakte", JSON.stringify([{ id: K, vorname: "A", nachname: "B", pipelineStufe: "neuer_lead" }]));
    await updateKontakt(K, { pipelineStufe: "notar", status: "kontaktiert" } as never);
    const k = JSON.parse(localStorage.getItem("osimmo_kontakte") || "[]")[0];
    expect(k.pipelineStufe).toBe("neuer_lead");
    expect(k.status).toBe("kontaktiert");
  });
});

describe("Anzeige: die Stufe kommt vom Investment", () => {
  const kunde = (teil: Record<string, unknown> = {}) =>
    ({ id: K, vorname: "A", nachname: "B", status: "neu", archiviert: false, pipelineStufe: "beratungsgespraech", ...teil }) as never;

  it("ein Investment in einer fruehen Stufe schlaegt die Kontaktstufe", async () => {
    const { getEffectivePipelineStufe } = await import("./kontaktPipeline");
    lege("erreicht");
    // Bis 11.10.2026 gewann hier die Kontaktstufe "beratungsgespraech".
    expect(getEffectivePipelineStufe(kunde())).toBe("erreicht");
  });

  it("Liste je Kontakt nennt die Stufen aller laufenden Investments", async () => {
    const { getInvestmentStufenFuerKunde, investmentStufenText } = await import("./kontaktPipeline");
    lege("notar", "neuer_lead", "verloren");
    expect(getInvestmentStufenFuerKunde(kunde()).map((e) => e.stufe)).toEqual(["notar", "neuer_lead"]);
    expect(investmentStufenText(kunde())).toBe("Inv. 1: Notar · Inv. 2: Neuer Lead");
  });

  it("ein verlorener Kontakt bleibt als Ganzes verloren", async () => {
    const { getInvestmentStufenFuerKunde } = await import("./kontaktPipeline");
    lege("notar");
    expect(getInvestmentStufenFuerKunde(kunde({ status: "verloren" }))).toEqual([{ stufe: "verloren" }]);
  });

  it("die Automatik prueft nur das eigene Investment", async () => {
    const { calculateLogicalPipelineStufe } = await import("./kontaktPipeline");
    lege("neuer_lead", "notar");
    const invs = JSON.parse(localStorage.getItem("osimmo_investments") || "[]");
    invs[1].notarTermin = "2099-01-01";
    localStorage.setItem("osimmo_investments", JSON.stringify(invs));
    expect(calculateLogicalPipelineStufe(kunde(), "inv-2")).toBe("notar");
    expect(calculateLogicalPipelineStufe(kunde(), "inv-1")).toBeNull();
  });
});
