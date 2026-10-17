/**
 * Abwicklung speichern (30.09.2026): Kaufpreiseingang, Provisionsrechnung und
 * Auszahlung gehen über `investment_abwicklung_speichern`, nicht mehr über
 * das freie Schreiben ins Investment. Der alte Weg nur, solange die Migration
 * fehlt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  speichern: vi.fn(),
  lokal: vi.fn(),
  felder: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("./investmentGepruefteWege", async () => {
  const echt = await vi.importActual<typeof import("./investmentGepruefteWege")>("./investmentGepruefteWege");
  return { AktionVerweigert: echt.AktionVerweigert, abwicklungSpeichernMitStand: mock.speichern };
});
vi.mock("./investmentsStore", () => ({
  getInvestmentMetaField: vi.fn(),
  setInvestmentMetaNurLokal: mock.lokal,
}));
// Der alte Weg schreibt seit der Prüfung durch Codex abgewartet über merge_investment_meta.
vi.mock("./dataCache", () => ({
  cacheMetaZusammenfuehren: mock.felder,
  gleicherWert: (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null),
}));

/** Die Datenbank übernimmt alles, was kommt. */
const allesUebernommen = async (_id: string, daten: Record<string, unknown>) => ({ weg: "ok", meta: { abwicklung: daten } });
vi.mock("./dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/hooks/use-toast", () => ({ toast: mock.toast }));

import { abwicklungGespeichert, saveAbwicklungDaten } from "./abwicklungStore";
import { AktionVerweigert } from "./investmentGepruefteWege";

beforeEach(() => {
  mock.speichern.mockReset();
  mock.lokal.mockReset();
  mock.felder.mockReset();
  mock.toast.mockReset();
});

describe("saveAbwicklungDaten", () => {
  it("zeigt sofort an und schreibt über die Datenbankfunktion", async () => {
    mock.speichern.mockImplementation(allesUebernommen);
    saveAbwicklungDaten("inv-1", { kaufpreisEingegangen: true, kaufpreisEingegangenDatum: "2026-09-30" });
    expect(mock.lokal).toHaveBeenCalledWith("inv-1", "kaufpreisEingegangen", true);
    expect(mock.lokal).toHaveBeenCalledWith("inv-1", "abwicklung", { kaufpreisEingegangen: true, kaufpreisEingegangenDatum: "2026-09-30" });
    await expect(abwicklungGespeichert("inv-1")).resolves.toBe(true);
    expect(mock.speichern).toHaveBeenCalledWith("inv-1", { kaufpreisEingegangen: true, kaufpreisEingegangenDatum: "2026-09-30" });
    expect(mock.felder).not.toHaveBeenCalled();
  });

  it("schnelle Eingaben ergeben einen Aufruf mit dem letzten Stand", async () => {
    mock.speichern.mockImplementation(allesUebernommen);
    saveAbwicklungDaten("inv-2", { anmerkungen: "a" });
    saveAbwicklungDaten("inv-2", { anmerkungen: "ab" });
    await abwicklungGespeichert("inv-2");
    expect(mock.speichern).toHaveBeenCalledTimes(1);
    expect(mock.speichern).toHaveBeenCalledWith("inv-2", { anmerkungen: "ab" });
  });

  it("ohne Migration der alte Weg mit Spiegel fürs Kundenportal", async () => {
    mock.speichern.mockResolvedValue({ weg: "alterWeg", meta: null });
    mock.felder.mockImplementation(async (_t: string, _id: string, felder: Record<string, unknown>) => felder);
    saveAbwicklungDaten("inv-3", { grundbuchEingetragen: true, grundbuchDatum: "2026-10-01" });
    await abwicklungGespeichert("inv-3");
    expect(mock.felder).toHaveBeenCalledWith("investments", "inv-3", expect.objectContaining({
      abwicklung: { grundbuchEingetragen: true, grundbuchDatum: "2026-10-01" },
      grundbuchEingetragen: true,
      grundbuchDatum: "2026-10-01",
    }), { silent: true });
  });

  it("ohne Migration: scheitert das Schreiben, meldet abwicklungGespeichert false", async () => {
    mock.speichern.mockResolvedValue({ weg: "alterWeg", meta: null });
    mock.felder.mockRejectedValueOnce(new Error("Not authorized"));
    saveAbwicklungDaten("inv-5", { grundbuchEingetragen: true });
    await expect(abwicklungGespeichert("inv-5")).resolves.toBe(false);
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("eine Ablehnung erscheint als Hinweis mit dem Satz der Datenbank", async () => {
    mock.speichern.mockRejectedValue(new AktionVerweigert("Die Abwicklung pflegen Admin, Inhaber und der zuständige Partner ab dem Notartermin."));
    saveAbwicklungDaten("inv-4", { auszahlungBestaetigt: true });
    // M19: Der Aufrufer erfährt den Fehlschlag und setzt dann keine Stufe.
    await expect(abwicklungGespeichert("inv-4")).resolves.toBe(false);
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      description: "Die Abwicklung pflegen Admin, Inhaber und der zuständige Partner ab dem Notartermin.",
      variant: "destructive",
    }));
    expect(mock.felder).not.toHaveBeenCalled();
  });
});

describe("Stufe nach der Abwicklung (M19, seit 17.10.2026 ohne Provisionshaken)", () => {
  it("setzt die Stufe erst nach gespeicherter Abwicklung und meldet dem Kunden danach", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const regel = readFileSync(resolve(__dirname, "abwicklungStufe.ts"), "utf-8");
    const gespeichert = regel.indexOf("if (!(await abwicklungGespeichert(inv.id))) return null;");
    const stufe = regel.indexOf("if (!(await updateInvestment(inv.id, { pipelineStufe: ziel }))) return null;");
    const kunde = regel.indexOf('if (ziel === "abgeschlossen") notifyKundePipelineStufe(inv.kontaktId, "abgeschlossen");');
    expect(gespeichert).toBeGreaterThan(-1);
    expect(stufe).toBeGreaterThan(gespeichert);
    expect(kunde).toBeGreaterThan(stufe);
    // Kundenprofil und Objektdaten nutzen dieselbe Regel.
    const profil = readFileSync(resolve(__dirname, "../pages/KundenDetail.tsx"), "utf-8");
    expect(profil).toContain("abwicklungStufeNachziehen(");
    expect(profil).not.toContain("Provisionsrechnung gestellt</Label>");
    expect(profil).not.toContain("Auszahlung bestätigt</Label>");
  });

});

describe("Abwicklung: verglichen wird mit der Rückgabe der Datenbank (zweite Prüfung Codex)", () => {
  it("ein still verworfenes Geldfeld meldet false und zeigt den Stand der Datenbank", async () => {
    mock.speichern.mockImplementation(async () => ({
      weg: "ok",
      meta: { abwicklung: { auszahlungBestaetigt: false, anmerkungen: "x" } },
    }));
    saveAbwicklungDaten("inv-6", { auszahlungBestaetigt: true, anmerkungen: "x" });
    await expect(abwicklungGespeichert("inv-6")).resolves.toBe(false);
    expect(mock.lokal).toHaveBeenLastCalledWith("inv-6", "grundbuchEingetragen", undefined);
    expect(mock.lokal).toHaveBeenCalledWith("inv-6", "abwicklung", { auszahlungBestaetigt: false, anmerkungen: "x" });
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Teilweise gespeichert",
      description: expect.stringContaining("auszahlungBestaetigt"),
    }));
  });

  it("ohne Rückgabe kein Erfolg", async () => {
    mock.speichern.mockResolvedValue({ weg: "ok", meta: null });
    saveAbwicklungDaten("inv-7", { anmerkungen: "y" });
    await expect(abwicklungGespeichert("inv-7")).resolves.toBe(false);
  });
});
