import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import {
  getNextStepAbschnitt,
  getNextStepSentence,
  investmentAbschnittRoute,
  investmentBezeichnung,
  massgeblichePipelineStufe,
  portalAbschnittId,
} from "@/lib/portalCopy";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";

beforeAll(async () => {
  await i18n.changeLanguage("de");
});

/*
 * Die Begrüßung im Portal je Pipeline-Stufe. Jede Stufe bekommt einen
 * kurzen Satz in Du-Form ohne Gedankenstrich (Entscheidung Christian,
 * 24.09.2026).
 */
const ERWARTET: Record<string, string> = {
  neuer_lead: "Wir melden uns in Kürze persönlich bei dir.",
  nicht_erreicht: "Wir melden uns in Kürze persönlich bei dir.",
  erreicht: "Wir melden uns in Kürze persönlich bei dir.",
  follow_up: "Wir melden uns in Kürze persönlich bei dir.",
  erstgespraech_geplant: "Dein Erstgespräch mit deinem Vertriebspartner ist geplant.",
  eg_noshow: "Dein Erstgespräch mit deinem Vertriebspartner ist geplant.",
  beratungsgespraech: "Als Nächstes: dein persönliches Beratungsgespräch mit deinem Berater.",
  bg_noshow: "Als Nächstes: dein persönliches Beratungsgespräch mit deinem Berater.",
  selbstauskunft: "Als Nächstes: deine Selbstauskunft ausfüllen und unterschreiben.",
  objektauswahl: "Wir suchen aktuell deine passende Wohnung aus.",
  follow_up_objekt: "Wir suchen aktuell deine passende Wohnung aus.",
  reservierung: "Wir halten deine Wunschwohnung gerade für dich frei.",
  bonitaetsunterlagen: "Als Nächstes: deine Bonitätsunterlagen hochladen, ca. 5 Min.",
  finanzierung: "Deine Finanzierung wird vorbereitet, wir halten dich auf dem Laufenden.",
  notar: "Dein Notartermin steht kurz bevor, alles ist organisiert.",
  faelligkeit: "Die Fälligkeit deines Kaufpreises wird begleitet.",
  abrechnung: "Herzlichen Glückwunsch, du bist Eigentümer.",
  abgeschlossen: "Herzlichen Glückwunsch, du bist Eigentümer.",
};

describe("Begrüßung je Pipeline-Stufe", () => {
  for (const [stufe, satz] of Object.entries(ERWARTET)) {
    it(`${stufe}: ${satz}`, () => {
      expect(getNextStepSentence(stufe)).toBe(satz);
    });
  }

  it("jede aktive Stufe der Pipeline hat einen Satz ohne Gedankenstrich", () => {
    const aktiv = PIPELINE_STUFEN.map((s) => s.key).filter(
      (k) => !["verloren", "archiviert", "bestandsimport", "zugewiesen", "kontaktversuche", "vermoegensaufbau"].includes(k),
    );
    for (const stufe of aktiv) {
      expect(ERWARTET[stufe], `Stufe ${stufe} fehlt im Test`).toBeDefined();
      const satz = getNextStepSentence(stufe);
      expect(satz.length).toBeGreaterThan(10);
      expect(satz).not.toMatch(/[–—]/);
    }
  });
});

describe("massgeblichePipelineStufe", () => {
  it("nimmt das am weitesten fortgeschrittene Investment, nicht das zuletzt angelegte", () => {
    const stufe = massgeblichePipelineStufe([
      { objekt: "Weitlstraße 138, 80995 München", meta: { pipelineStufe: "reservierung" } },
      { objekt: "", meta: { pipelineStufe: "objektauswahl" } },
    ]);
    expect(stufe).toBe("reservierung");
    expect(getNextStepSentence(stufe)).toBe("Wir halten deine Wunschwohnung gerade für dich frei.");
  });

  it("lässt beendete Vorgänge aus", () => {
    expect(
      massgeblichePipelineStufe([
        { objekt: "A", meta: { pipelineStufe: "verloren" } },
        { objekt: "B", meta: { pipelineStufe: "selbstauskunft" } },
      ]),
    ).toBe("selbstauskunft");
  });

  it("ein abgeschlossener Kauf zählt nur, wenn nichts anderes läuft", () => {
    expect(
      massgeblichePipelineStufe([
        { objekt: "Alt", meta: { pipelineStufe: "abgeschlossen" } },
        { objekt: "Neu", meta: { pipelineStufe: "reservierung" } },
      ]),
    ).toBe("reservierung");
    expect(
      massgeblichePipelineStufe([{ objekt: "Alt", meta: { pipelineStufe: "abgeschlossen" } }]),
    ).toBe("abgeschlossen");
  });

  it("fällt ohne Investments auf die Stufe am Kontakt zurück", () => {
    expect(massgeblichePipelineStufe([], "beratungsgespraech")).toBe("beratungsgespraech");
    expect(massgeblichePipelineStufe([])).toBe("erstgespraech_geplant");
  });
});

describe("investmentBezeichnung", () => {
  it("setzt „Wohnung“ vor eine nackte Nummer und trennt mit Komma", () => {
    expect(investmentBezeichnung("Weitlstraße 138, 80995 München", "80")).toBe(
      "Weitlstraße 138, 80995 München, Wohnung 80",
    );
  });
  it("lässt eine sprechende Bezeichnung stehen", () => {
    expect(investmentBezeichnung("Haus A", "WE 3")).toBe("Haus A, WE 3");
  });
  it("kommt ohne Wohnung oder Objekt aus", () => {
    expect(investmentBezeichnung("Haus A", null)).toBe("Haus A");
    expect(investmentBezeichnung(null, null)).toBe("");
  });
});

/*
 * Wohin der Knopf im „Als Nächstes"-Kasten springt. Jede Stufe, die einen
 * Satz hat (ERWARTET oben), braucht auch ein Ziel oder ausdrücklich keins.
 */
const SPRUNGZIEL: Record<string, string | null> = {
  neuer_lead: "erstgespraech",
  nicht_erreicht: "erstgespraech",
  erreicht: "erstgespraech",
  follow_up: "erstgespraech",
  erstgespraech_geplant: "erstgespraech",
  eg_noshow: "erstgespraech",
  beratungsgespraech: "erstgespraech",
  bg_noshow: "erstgespraech",
  // Die Selbstauskunft ist die erste Zeile im Kästchen Bonität.
  selbstauskunft: "bonitaetsunterlagen",
  objektauswahl: "objektauswahl",
  follow_up_objekt: "objektauswahl",
  reservierung: "reservierung",
  bonitaetsunterlagen: "bonitaetsunterlagen",
  finanzierung: "finanzierung",
  notar: "notar",
  faelligkeit: "faelligkeit",
  // Kauf durch: Der Kasten erscheint gar nicht, es gibt kein Ziel.
  abrechnung: null,
  abgeschlossen: null,
};

/** Die Phasen-Kästchen, die KundeInvestments tatsächlich zeichnet. */
const KAESTCHEN = ["erstgespraech", "objektauswahl", "reservierung", "bonitaetsunterlagen", "finanzierung", "notar", "faelligkeit"];

describe("Sprungziel des Knopfs im Kasten „Als Nächstes“", () => {
  for (const [stufe, ziel] of Object.entries(SPRUNGZIEL)) {
    it(`${stufe} springt nach ${ziel ?? "nirgends"}`, () => {
      expect(getNextStepAbschnitt(stufe)).toBe(ziel);
    });
  }

  it("jede Stufe mit Satz hat eine Festlegung, und jedes Ziel ist ein echtes Kästchen", () => {
    for (const stufe of Object.keys(ERWARTET)) {
      expect(stufe in SPRUNGZIEL, `Stufe ${stufe} fehlt bei den Sprungzielen`).toBe(true);
      const ziel = getNextStepAbschnitt(stufe);
      if (ziel) expect(KAESTCHEN).toContain(ziel);
    }
  });

  it("alte Schreibweisen und leere Stufe landen sicher", () => {
    expect(getNextStepAbschnitt("closing")).toBe("objektauswahl");
    expect(getNextStepAbschnitt("Bonität")).toBe("bonitaetsunterlagen");
    expect(getNextStepAbschnitt(undefined)).toBe("erstgespraech");
  });

  it("baut Kennung und Tiefenlink passend zur Detailseite", () => {
    expect(portalAbschnittId("reservierung")).toBe("section-reservierung");
    expect(investmentAbschnittRoute("inv-1", "finanzierung")).toBe(
      "/kunde/investments?tab=moreimmo&inv=inv-1&highlight=finanzierung",
    );
  });
});
