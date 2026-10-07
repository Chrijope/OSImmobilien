import { describe, it, expect, beforeEach, vi } from "vitest";

// Nachbau des user_settings-Caches: die Tests steuern über settingsRows,
// welche Einstellungen der Partner hat.
const settingsRows: any[] = [];
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (tabelle: string) => (tabelle === "user_settings" ? settingsRows : []),
}));

import {
  getEffectiveRateInfoForKontakt,
  istProvisionFestgeschrieben,
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
 * Kern von Paket C: Die Festschreibung aus der Nutzerverwaltung
 * (provision_locked) gilt VOR dem am Investment eingefrorenen Satz. Damit kann
 * ein falsch eingefrorener Wert (z. B. 3 % durch fehlende Leserechte beim
 * Anlegen) die Zusage aus der Nutzerverwaltung nicht mehr aushebeln.
 */
describe("Priorität 1: Festschreibung aus der Nutzerverwaltung", () => {
  it("Eigen-Satz aus der Nutzerverwaltung schlägt den am Investment eingefrorenen Satz", () => {
    setzeSettings({ provision_locked: true, custom_provision_rate_eigen: 5 });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt, 3);
    expect(info.rate).toBe(5);
    expect(info.quelle).toBe("nutzerverwaltung");
  });

  it("Lead-Satz aus der Nutzerverwaltung schlägt den am Investment eingefrorenen Satz", () => {
    setzeSettings({ provision_locked: true, custom_provision_rate_setter: 4.5 });
    const info = getEffectiveRateInfoForKontakt(PARTNER, zugewiesenerKontakt, 3);
    expect(info.rate).toBe(4.5);
    expect(info.quelle).toBe("nutzerverwaltung");
  });

  it("fällt auf den allgemeinen individuellen Satz zurück, wenn der fallspezifische fehlt", () => {
    setzeSettings({ provision_locked: true, custom_provision_rate: 4.2 });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt, 3);
    expect(info.rate).toBe(4.2);
    expect(info.quelle).toBe("nutzerverwaltung");
  });

  it("greift auch über den Lock im Kontakt-Meta hinweg", () => {
    setzeSettings({ provision_locked: true, custom_provision_rate_eigen: 5 });
    const kontakt = { ...eigenerKontakt, meta: { lockedProvisionRate: 3 } };
    const info = getEffectiveRateInfoForKontakt(PARTNER, kontakt);
    expect(info.rate).toBe(5);
    expect(info.quelle).toBe("nutzerverwaltung");
  });
});

describe("Festschreibung ohne gepflegten Satz: Stufensatz, als Stufe gekennzeichnet", () => {
  it("löst karriere_override 'vertriebspartner' Kennung-zuerst auf 4 % auf, nicht auf 3 %", () => {
    setzeSettings({ provision_locked: true, karriere_override: "vertriebspartner" });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt, 3);
    expect(info.rate).toBe(4);
    expect(info.quelle).toBe("stufe");
  });

  it("löst den nackten Titel 'Vertriebspartner' auf die einheitliche 4-%-Stufe auf", () => {
    // Seit dem vereinheitlichten Modell ist "Vertriebspartner" der Titel der
    // 4-%-Stufe. Alt-Bestand mit diesem Wert ist über festgeschriebene
    // custom-Sätze abgesichert und landet gar nicht in diesem Zweig.
    setzeSettings({ provision_locked: true, karriere_override: "Vertriebspartner" });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt);
    expect(info.rate).toBe(4);
    expect(info.quelle).toBe("stufe");
  });

  it("löst den Titel 'Vertriebspartner (Alt)' auf die alte 3-%-Stufe auf", () => {
    setzeSettings({ provision_locked: true, karriere_override: "Vertriebspartner (Alt)" });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt);
    expect(info.rate).toBe(3);
    expect(info.quelle).toBe("stufe");
  });

  it("ignoriert den eingefrorenen Investment-Satz auch beim Stufen-Fallback", () => {
    setzeSettings({ provision_locked: true, karriere_override: "manager" });
    const info = getEffectiveRateInfoForKontakt(PARTNER, zugewiesenerKontakt, 3);
    expect(info.rate).toBe(4.5);
    expect(info.quelle).toBe("stufe");
  });
});

describe("Ohne Festschreibung in der Nutzerverwaltung: bisheriges Verhalten", () => {
  it("der am Investment eingefrorene Satz gilt und wird als 'locked' gekennzeichnet", () => {
    setzeSettings({ custom_provision_rate_eigen: 5 });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt, 3);
    expect(info.rate).toBe(3);
    expect(info.quelle).toBe("locked");
    // Der heute gültige Satz weicht ab und wird zum Vergleich mitgeliefert.
    expect(info.heutigerSatz).toBe(5);
  });

  it("ohne Lock gilt der Eigen-Satz", () => {
    setzeSettings({ custom_provision_rate_eigen: 5 });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt);
    expect(info.rate).toBe(5);
    expect(info.quelle).toBe("eigen");
  });

  it("ohne Lock gilt für zugewiesene Leads der Lead-Satz", () => {
    setzeSettings({ custom_provision_rate_setter: 3.5 });
    const info = getEffectiveRateInfoForKontakt(PARTNER, zugewiesenerKontakt);
    expect(info.rate).toBe(3.5);
    expect(info.quelle).toBe("zugewiesen");
  });

  it("ohne jeden gepflegten Satz gilt die Karrierestufe", () => {
    setzeSettings({ karriere_override: "vertriebsfirma" });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt);
    expect(info.rate).toBe(5);
    expect(info.quelle).toBe("stufe");
  });

  it("provision_locked: false verhält sich wie kein Lock", () => {
    setzeSettings({ provision_locked: false, custom_provision_rate_eigen: 5 });
    const info = getEffectiveRateInfoForKontakt(PARTNER, eigenerKontakt, 3);
    expect(info.rate).toBe(3);
    expect(info.quelle).toBe("locked");
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
  it("die neue Satzart 'nutzerverwaltung' hat Label und Erklärung", () => {
    expect(SATZART_LABEL.nutzerverwaltung).toBe("Nutzerverwaltung");
    expect(SATZART_ERKLAERUNG.nutzerverwaltung).toContain("Nutzerverwaltung");
  });
});
