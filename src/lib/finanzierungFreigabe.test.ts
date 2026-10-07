import { describe, it, expect } from "vitest";
import { finanzierungFreigabeStand, finanzierungFreigabeText, finanzierungIstFrei } from "./finanzierungFreigabe";

const BENOETIGT = ["Personalausweis", "Letzter Gehaltsnachweis", "Arbeitsvertrag"];

describe("finanzierungFreigabeStand", () => {
  it("gibt frei, wenn jede Unterlage freigegeben ist", () => {
    const stand = finanzierungFreigabeStand({
      benoetigt: BENOETIGT,
      statuses: { Personalausweis: "approved", "Letzter Gehaltsnachweis": "approved", Arbeitsvertrag: "approved" },
    });
    expect(stand.frei).toBe(true);
    expect(stand.fehlend).toEqual([]);
  });

  it("gibt nicht frei, solange eine Unterlage nur hochgeladen ist", () => {
    // Hochgeladen ist nicht geprueft. Genau das war der Punkt: Der
    // Finanzierungspartner soll erst ran, wenn die Freigabe da ist.
    const stand = finanzierungFreigabeStand({
      benoetigt: BENOETIGT,
      statuses: { Personalausweis: "approved", "Letzter Gehaltsnachweis": "uploaded", Arbeitsvertrag: "approved" },
    });
    expect(stand.frei).toBe(false);
    expect(stand.inPruefung).toEqual(["Letzter Gehaltsnachweis"]);
  });

  it("zaehlt fehlende und abgelehnte Unterlagen getrennt", () => {
    const stand = finanzierungFreigabeStand({
      benoetigt: BENOETIGT,
      statuses: { Personalausweis: "rejected", Arbeitsvertrag: "approved" },
    });
    expect(stand.abgelehnt).toEqual(["Personalausweis"]);
    expect(stand.fehlend).toEqual(["Letzter Gehaltsnachweis"]);
    expect(stand.frei).toBe(false);
  });

  it("gibt ohne bekannte Liste nicht frei", () => {
    // "Wir wissen es nicht" darf nie aussehen wie "alles erledigt".
    expect(finanzierungFreigabeStand({ benoetigt: [], statuses: {} }).frei).toBe(false);
  });

  it("kommt mit fehlenden Statusangaben zurecht", () => {
    const stand = finanzierungFreigabeStand({ benoetigt: BENOETIGT, statuses: null });
    expect(stand.frei).toBe(false);
    expect(stand.fehlend).toEqual(BENOETIGT);
  });
});

describe("finanzierungFreigabeText", () => {
  it("nennt die Zahl der fehlenden Unterlagen", () => {
    const stand = finanzierungFreigabeStand({ benoetigt: BENOETIGT, statuses: { Personalausweis: "approved" } });
    expect(finanzierungFreigabeText(stand)).toContain("Es fehlen noch 2 Unterlagen");
  });

  it("sagt bei einer einzigen Unterlage den Singular", () => {
    const stand = finanzierungFreigabeStand({
      benoetigt: BENOETIGT,
      statuses: { Personalausweis: "approved", Arbeitsvertrag: "approved" },
    });
    expect(finanzierungFreigabeText(stand)).toContain("Eine Unterlage fehlt noch.");
  });

  it("unterscheidet Pruefung von Freigabe", () => {
    const stand = finanzierungFreigabeStand({
      benoetigt: BENOETIGT,
      statuses: { Personalausweis: "approved", "Letzter Gehaltsnachweis": "uploaded", Arbeitsvertrag: "approved" },
    });
    expect(finanzierungFreigabeText(stand)).toContain("werden gerade geprüft");
  });
});

describe("finanzierungIstFrei", () => {
  it("ist frei, sobald die Bonitaetsfreigabe gemeldet wurde", () => {
    expect(finanzierungIstFrei({ bonitaetFreigabeGemeldetAm: "2026-09-11T08:00:00Z" })).toBe(true);
  });

  it("ist nicht frei, solange nur die Reservierung unterschrieben ist", () => {
    // Genau das war der Fehler: Die unterschriebene Reservierung hat den
    // Finanzierungspartner gerufen, obwohl die Unterlagen noch fehlten.
    expect(finanzierungIstFrei({ rvSigned: true, pipelineStufe: "reservierung" })).toBe(false);
  });

  it("laesst Altbestand mit vorhandener Bank durch", () => {
    expect(finanzierungIstFrei({ finanzierungsBank: "Sparkasse" })).toBe(true);
    expect(finanzierungIstFrei({ finanzierungsStatus: "bestaetigt" })).toBe(true);
  });

  it("kommt ohne Angaben zurecht", () => {
    expect(finanzierungIstFrei(undefined)).toBe(false);
    expect(finanzierungIstFrei({})).toBe(false);
  });
});

/**
 * Selbstständige haben keine Gehaltsnachweise.
 *
 * Die Automatik im Kundenprofil, die einen Vorgang auf Finanzierung schiebt,
 * übergab bis zum 25.09.2026 nur Merker und Dokumentstände, nicht die
 * Selbstauskunft. Ohne Beschäftigungsart verlangte die Prüfung die vier
 * Gehaltsnachweise, und ein Selbstständiger ohne Merker rückte nie weiter.
 */
describe("finanzierungIstFrei bei Selbstständigen", () => {
  const nurBasis = { Selbstauskunft: "approved", Personalausweis: "approved" };

  it("ist ohne Merker frei, wenn Selbstauskunft und Ausweis freigegeben sind", () => {
    expect(finanzierungIstFrei({ docStatuses: nurBasis, saData: { beschaeftigungsart: "selbstaendig" } })).toBe(true);
  });

  it("liest die Beschäftigungsart auch aus dem Abzug der Selbstauskunft", () => {
    expect(finanzierungIstFrei({ docStatuses: nurBasis, saSnapshot: { beschaeftigungsart: "Selbstständig" } })).toBe(true);
  });

  it("verlangt ohne Beschäftigungsart die Gehaltsnachweise, genau das war der Fehler", () => {
    expect(finanzierungIstFrei({ docStatuses: nurBasis })).toBe(false);
  });

  it("verlangt bei Angestellten weiter die Gehaltsnachweise", () => {
    expect(finanzierungIstFrei({ docStatuses: nurBasis, saData: { beschaeftigungsart: "angestellt" } })).toBe(false);
  });

  it("die Automatik im Kundenprofil gibt die Selbstauskunft mit", async () => {
    const fs = await import("node:fs");
    const quelle = fs.readFileSync("src/pages/KundenDetail.tsx", "utf8");
    const aufruf = quelle.match(/const bonitaetFrei = finanzierungIstFrei\(\{([\s\S]*?)\}\);/);

    expect(aufruf, "der Aufruf der Automatik").toBeTruthy();
    expect(aufruf![1]).toContain('"saData"');
    expect(aufruf![1]).toContain('"saSnapshot"');
  });
});
