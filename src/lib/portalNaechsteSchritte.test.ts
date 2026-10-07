import { describe, it, expect, beforeAll } from "vitest";
import i18n from "@/i18n";
import { sammleNaechsteSchritte } from "./portalNaechsteSchritte";

/**
 * Die Startseite des Kundenportals zeigt eine einzige Liste ueber alle
 * Investments. Diese Tests halten fest, was darin steht und in welcher
 * Reihenfolge.
 */

const JETZT = new Date("2026-09-10T09:00:00");

/**
 * Die Spracherkennung waehlt in der Testumgebung sonst Englisch. Geprueft
 * werden hier die deutschen Saetze, die der Kunde liest.
 */
beforeAll(async () => {
  await i18n.changeLanguage("de");
});

/** Alle Pflichtunterlagen freigegeben, es liegt nichts mehr beim Kunden. */
const ALLE_DOCS_FREIGEGEBEN = {
  Personalausweis: "approved",
  "Letzter Gehaltsnachweis": "approved",
  "Vorletzter Gehaltsnachweis": "approved",
  "Vorvorletzter Gehaltsnachweis": "approved",
  "Gehaltsnachweis Dezember Vorjahr": "approved",
};

/** Ein Kauf, bei dem der Kunde alles Noetige erledigt hat. */
function fertigesInvestment(id: string, objekt: string, stufe = "finanzierung") {
  return {
    id,
    objekt,
    wohnung: "",
    meta: {
      pipelineStufe: stufe,
      saSigned: true,
      docStatuses: { ...ALLE_DOCS_FREIGEGEBEN },
    },
  };
}

describe("sammleNaechsteSchritte", () => {
  it("ohne Investments bleibt die Liste leer", () => {
    expect(sammleNaechsteSchritte({ investments: [], jetzt: JETZT })).toEqual([]);
  });

  it("nichts offen: nur der ruhige Statushinweis zur Phase, keine Aufgabe", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [fertigesInvestment("i1", "Amadio")],
      kontaktMeta: {},
      jetzt: JETZT,
    });

    expect(schritte.every((s) => s.art === "hinweis")).toBe(true);
    expect(schritte.some((s) => s.art === "aufgabe")).toBe(false);
    expect(schritte.some((s) => s.art === "termin")).toBe(false);
  });

  it("eine fehlende Unterlage nennt die Zahl in Kundensprache", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: {
            pipelineStufe: "bonitaetsunterlagen",
            saSigned: true,
            docStatuses: {
              ...ALLE_DOCS_FREIGEGEBEN,
              "Gehaltsnachweis Dezember Vorjahr": "none",
            },
          },
        },
      ],
      kontaktMeta: {},
      jetzt: JETZT,
    });

    const aufgaben = schritte.filter((s) => s.art === "aufgabe");
    expect(aufgaben).toHaveLength(1);
    expect(aufgaben[0].titel).toBe("Eine Unterlage fehlt noch");
    expect(aufgaben[0].text).toContain("Portal hochladen");
    expect(aufgaben[0].abschnitt).toBe("bonitaetsunterlagen");
    // Solange etwas offen ist, kommt kein zusaetzlicher Statushinweis dazu.
    expect(schritte.filter((s) => s.art === "hinweis")).toHaveLength(0);
  });

  it("mehrere fehlende Unterlagen erscheinen als eine Zeile mit Anzahl", () => {
    // Vor der Freischaltung durch den Vertriebspartner werden nur die zwei
    // Startunterlagen verlangt, nicht die vollstaendige Liste.
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: {
            pipelineStufe: "bonitaetsunterlagen",
            saData: { unterschrift: "Max Mustermann" },
            docStatuses: {},
          },
        },
      ],
      jetzt: JETZT,
    });

    const aufgaben = schritte.filter((s) => s.art === "aufgabe");
    expect(aufgaben).toHaveLength(1);
    expect(aufgaben[0].titel).toBe("2 Unterlagen fehlen noch");
  });

  it("fehlende Selbstauskunft steht vor den fehlenden Unterlagen", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: { pipelineStufe: "selbstauskunft", saData: { gehalt: "3000" }, docStatuses: {} },
        },
      ],
      jetzt: JETZT,
    });

    expect(schritte.map((s) => s.titel)).toEqual([
      "Selbstauskunft ausfüllen",
      "2 Unterlagen fehlen noch",
    ]);
  });

  /*
   * Vermerk „Kunde finanziert selbst“ (05.10.2026): Weder Selbstauskunft
   * noch Bonitäts- oder Bankunterlagen werden verlangt.
   */
  it("beim Vermerk „Kunde finanziert selbst“ fordert die Startseite keine Unterlagen an", () => {
    const eingabe = (vermerk: boolean) => ({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: {
            pipelineStufe: "reservierung",
            saData: { gehalt: "3000" },
            docStatuses: {},
            ...(vermerk ? { selbstauskunftEntfaellt: { aktiv: true } } : {}),
          },
        },
      ],
      jetzt: JETZT,
    });

    const ohne = sammleNaechsteSchritte(eingabe(false)).filter((s) => s.art === "aufgabe");
    expect(ohne.map((s) => s.titel)).toEqual(["Selbstauskunft ausfüllen", "2 Unterlagen fehlen noch"]);

    const mit = sammleNaechsteSchritte(eingabe(true));
    expect(mit.some((s) => s.art === "aufgabe")).toBe(false);
  });

  it("vor dem Selbstauskunfts-Vorgang wird nichts vom Kunden verlangt", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        { id: "i1", objekt: "Amadio", meta: { pipelineStufe: "erstgespraech_geplant" } },
      ],
      jetzt: JETZT,
    });

    expect(schritte.some((s) => s.art === "aufgabe")).toBe(false);
    expect(schritte.map((s) => s.art)).toEqual(["hinweis"]);
  });

  it("mehrere Investments ergeben EINE Liste, jede Zeile mit Objektnamen", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: { pipelineStufe: "bonitaetsunterlagen", saPdf: "sa.pdf", docStatuses: {} },
        },
        fertigesInvestment("i2", "Alexanderstraße", "reservierung"),
      ],
      kontaktMeta: {},
      jetzt: JETZT,
    });

    // Erst die Aufgabe des einen Kaufs, dann der Statushinweis des anderen.
    expect(schritte.map((s) => s.art)).toEqual(["aufgabe", "hinweis"]);
    expect(schritte[0].investmentLabel).toBe("Amadio");
    expect(schritte[1].investmentLabel).toBe("Alexanderstraße");
  });

  it("bei nur einem Investment bleibt der Objektname weg", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: { pipelineStufe: "bonitaetsunterlagen", saPdf: "sa.pdf", docStatuses: {} },
        },
      ],
      jetzt: JETZT,
    });

    expect(schritte[0].investmentLabel).toBe("");
  });

  it("kein Termin: die Liste enthaelt keinen Terminpunkt", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [fertigesInvestment("i1", "Amadio")],
      kontaktMeta: { setterTerminDatum: "2026-08-01", setterTerminUhrzeit: "10:00" },
      jetzt: JETZT,
    });

    // Der Termin liegt in der Vergangenheit und zaehlt deshalb nicht mehr.
    expect(schritte.some((s) => s.art === "termin")).toBe(false);
  });

  it("anstehende Termine stehen nach den Aufgaben, der naechste zuerst", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: {
            pipelineStufe: "notar_mit_gs",
            saSigned: true,
            docStatuses: { ...ALLE_DOCS_FREIGEGEBEN },
            kaufvertragPdf: "aufnahmebogen.pdf",
            notarTerminPortalFreigabe: true,
            notarData: { datum: "2026-10-01", uhrzeit: "14:00" },
          },
        },
      ],
      kontaktMeta: { beratungsgespraechAm: "2026-09-20", beratungsgespraechUhrzeit: "11:00" },
      jetzt: JETZT,
    });

    const termine = schritte.filter((s) => s.art === "termin");
    expect(termine.map((s) => s.titel)).toEqual(["Dein Beratungsgespräch", "Dein Notartermin"]);
    expect(termine[0].text).toBe("Am 20.09.2026 um 11:00 Uhr.");
    expect(termine[1].text).toBe("Am 01.10.2026 um 14:00 Uhr.");
  });

  it("derselbe Termin an Kontakt und Investment erscheint nur einmal", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: {
            pipelineStufe: "beratungsgespraech",
            beratungsgespraechAm: "2026-09-20",
            beratungsgespraechUhrzeit: "11:00",
          },
        },
      ],
      kontaktMeta: { beratungsgespraechAm: "2026-09-20", beratungsgespraechUhrzeit: "11:00" },
      jetzt: JETZT,
    });

    expect(schritte.filter((s) => s.art === "termin")).toHaveLength(1);
  });

  it("freigegebene Notartermin-Vorschlaege werden als Aufgabe gefuehrt", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: {
            pipelineStufe: "notar_mit_gs",
            saSigned: true,
            docStatuses: { ...ALLE_DOCS_FREIGEGEBEN },
            kaufvertragPdf: "aufnahmebogen.pdf",
            notarTerminModus: "vorschlaege",
            notarTerminPortalFreigabe: true,
            notarTerminVorschlaegeFreigegeben: [{ datum: "2026-10-01", uhrzeit: "14:00" }],
          },
        },
      ],
      jetzt: JETZT,
    });

    expect(schritte[0].titel).toBe("Notartermin auswählen");
    expect(schritte[0].abschnitt).toBe("notar");
  });

  it("nach dem Notartermin werden keine Unterlagen mehr verlangt", () => {
    // Ein Bestandskunde aus dem Import hat oft gar keine Dokumente im System.
    // Er darf trotzdem nicht lesen, es fehlten noch Nachweise.
    for (const stufe of ["faelligkeit", "abgeschlossen", "bestandsimport"]) {
      const schritte = sammleNaechsteSchritte({
        investments: [{ id: "i1", objekt: "Amadio", meta: { pipelineStufe: stufe, docStatuses: {} } }],
        jetzt: JETZT,
      });
      expect(schritte.some((s) => s.art === "aufgabe"), stufe).toBe(false);
    }
  });

  it("archivierte und verlorene Investments bleiben aussen vor", () => {
    const schritte = sammleNaechsteSchritte({
      investments: [
        {
          id: "i1",
          objekt: "Amadio",
          meta: { pipelineStufe: "archiviert", saPdf: "sa.pdf", docStatuses: {} },
        },
        {
          id: "i2",
          objekt: "Alexanderstraße",
          meta: { pipelineStufe: "verloren", saPdf: "sa.pdf", docStatuses: {} },
        },
      ],
      jetzt: JETZT,
    });

    expect(schritte).toEqual([]);
  });
});
