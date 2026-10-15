import { describe, it, expect, beforeEach, vi } from "vitest";

// Nachbau des user_settings-Caches: die Tests steuern über settingsRows,
// welche Einstellungen der Partner hat.
const settingsRows: any[] = [];
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (tabelle: string) => (tabelle === "user_settings" ? settingsRows : []),
}));

import {
  getEffectiveRate,
  getEffectiveRateInfoForKontakt,
  festgeschriebenerSatz,
  istProvisionFestgeschrieben,
  provisionssaetze,
  mischsatz,
  SATZART_LABEL,
  SATZART_ERKLAERUNG,
} from "@/lib/karriereStufeHelper";

const PARTNER = "11111111-1111-1111-1111-111111111111";
const ANDERER = "22222222-2222-2222-2222-222222222222";

function setzeSettings(einstellungen: Record<string, unknown>) {
  settingsRows.length = 0;
  settingsRows.push({ user_id: PARTNER, einstellungen });
}

/** Vom Partner selbst angelegter Kontakt (Eigen-Satz). */
const eigenerKontakt = { erstelltVonId: PARTNER, berater: "Max Muster" };
/** Zugewiesener Lead: von jemand anderem angelegt (Lead-Satz). */
const zugewiesenerKontakt = { erstelltVonId: ANDERER, berater: "Max Muster" };

beforeEach(() => {
  settingsRows.length = 0;
});

/**
 * Seit 15.10.2026 (Christian): ein fester Satz je Partner aus der
 * Nutzerverwaltung, getrennt nach Lead und Eigen. Keine Karrierestufe.
 */
describe("Satz aus der Nutzerverwaltung", () => {
  it("eigener Kontakt: Eigen-Satz", () => {
    setzeSettings({ custom_provision_rate_eigen: 10, custom_provision_rate_setter: 8 });
    expect(getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt)).toMatchObject({ rate: 10, quelle: "eigen" });
  });

  it("zugewiesener Lead: Lead-Satz", () => {
    setzeSettings({ custom_provision_rate_eigen: 10, custom_provision_rate_setter: 8 });
    expect(getEffectiveRateInfoForKontakt(PARTNER, zugewiesenerKontakt)).toMatchObject({ rate: 8, quelle: "zugewiesen" });
  });

  it("allgemeiner Satz füllt eine fehlende Seite (Altbestand)", () => {
    setzeSettings({ custom_provision_rate: 7, custom_provision_rate_setter: 8 });
    expect(getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt)).toMatchObject({ rate: 7, quelle: "eigen" });
    expect(provisionssaetze(PARTNER)).toEqual({ lead: 8, eigen: 7 });
  });

  it("Karrierestufe liefert keinen Satz mehr: ohne Satz null und 'fehlt'", () => {
    setzeSettings({ karriere_override: "vertriebsfirma" });
    expect(getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt)).toMatchObject({ rate: null, quelle: "fehlt" });
    expect(getEffectiveRate(PARTNER)).toBeNull();
  });

  it("Mischsatz für Planungen, ohne Satz null", () => {
    setzeSettings({ custom_provision_rate_setter: 8, custom_provision_rate_eigen: 12 });
    expect(mischsatz(PARTNER, 50)).toBe(10);
    expect(mischsatz(PARTNER, 100)).toBe(12);
    setzeSettings({ karriere_override: "manager" });
    expect(mischsatz(PARTNER, 50)).toBeNull();
  });

  it("provision_locked ändert die Rechnung nicht", () => {
    setzeSettings({ provision_locked: true, custom_provision_rate_eigen: 5 });
    expect(getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt)).toMatchObject({ rate: 5, quelle: "eigen" });
  });
});

describe("Festgeschriebener Satz am Investment gilt unverändert", () => {
  it("schlägt den heutigen Satz und meldet die Abweichung", () => {
    setzeSettings({ custom_provision_rate_eigen: 10 });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt, 8);
    expect(info).toMatchObject({ rate: 8, quelle: "locked", heutigerSatz: 10 });
  });

  it("schlägt auch einen in der Nutzerverwaltung festgeschriebenen Satz (keine Rückwirkung)", () => {
    setzeSettings({ provision_locked: true, custom_provision_rate_eigen: 12 });
    expect(getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt, 8)).toMatchObject({ rate: 8, quelle: "locked" });
  });

  it("gilt auch, wenn der Partner heute gar keinen Satz mehr hat", () => {
    setzeSettings({});
    expect(getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt, 8)).toMatchObject({ rate: 8, quelle: "locked" });
  });

  it("ein alter Satz im Kontakt-Meta zählt nicht, nur der vom Investment", () => {
    setzeSettings({ custom_provision_rate_eigen: 10 });
    const kontakt = { ...eigenerKontakt, meta: { lockedProvisionRate: 3 } };
    expect(getEffectiveRateInfoForKontakt(PARTNER, kontakt)).toMatchObject({ rate: 10, quelle: "eigen" });
  });
});

describe("festgeschriebenerSatz", () => {
  it("liest lockedProvisionRate aus dem Investment", () => {
    expect(festgeschriebenerSatz({ lockedProvisionRate: 8 })).toBe(8);
    expect(festgeschriebenerSatz({ lockedProvisionRate: 8, lockedProvisionRatePartner: PARTNER }, PARTNER)).toBe(8);
  });

  it("gilt nicht für einen anderen Partner als den, für den er geschrieben wurde", () => {
    expect(festgeschriebenerSatz({ lockedProvisionRate: 8, lockedProvisionRatePartner: ANDERER }, PARTNER)).toBeNull();
  });

  it("nur Zahlen größer null", () => {
    expect(festgeschriebenerSatz({ lockedProvisionRate: 0 })).toBeNull();
    expect(festgeschriebenerSatz({ lockedProvisionRate: "8" })).toBeNull();
    expect(festgeschriebenerSatz(null)).toBeNull();
  });
});

describe("istProvisionFestgeschrieben", () => {
  it("erkennt nur ein echtes true", () => {
    setzeSettings({ provision_locked: true });
    expect(istProvisionFestgeschrieben(PARTNER)).toBe(true);
    setzeSettings({ provision_locked: "true" });
    expect(istProvisionFestgeschrieben(PARTNER)).toBe(false);
    setzeSettings({});
    expect(istProvisionFestgeschrieben(PARTNER)).toBe(false);
    expect(istProvisionFestgeschrieben(undefined)).toBe(false);
  });
});

describe("Satzart-Kennzeichnung", () => {
  it("'fehlt' hat Label und Erklärung", () => {
    expect(SATZART_LABEL.fehlt).toBe("Kein Satz hinterlegt");
    expect(SATZART_ERKLAERUNG.fehlt).toContain("Nutzerverwaltung");
  });
});
