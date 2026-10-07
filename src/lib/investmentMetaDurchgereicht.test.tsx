import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

/**
 * `fromDb` liefert `investments.meta` mit (seit dem 29.09.2026).
 *
 * Vorher fehlte es am umgewandelten Investment, und rund fünfzehn Stellen, die
 * `inv.meta.…` lesen, bekamen still immer ein leeres Objekt. Die Tests hier
 * laufen deshalb gegen den echten `investmentsStore`; nachgebildet ist nur der
 * Zwischenspeicher darunter, mit Zeilen, wie sie aus der Datenbank kommen.
 *
 * Das Hauptrisiko der Korrektur steht ganz oben: Ein umgewandeltes Investment
 * trägt jetzt ein `meta`, das veralten kann. Es darf beim Zurückschreiben nie
 * gewinnen.
 */

type Zeile = Record<string, unknown>;
type Geschrieben = { meta: Record<string, unknown> } & Record<string, unknown>;

const cache = vi.hoisted(() => ({
  investments: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; felder: { meta: Record<string, unknown> } & Record<string, unknown> }>,
  /** Seit H11 (04.10.2026) geht meta nur noch als Patch über merge_investment_meta. */
  patches: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));

vi.mock("@/lib/dataCache", async (original) => ({
  gleicherWert: ((await original()) as { gleicherWert: unknown }).gleicherWert,
  metaUnterschied: ((await original()) as { metaUnterschied: unknown }).metaUnterschied,
  cacheMetaZusammenfuehren: async (t: string, id: string, patch: Record<string, unknown>) => {
    if (t === "investments") cache.patches.push({ id, patch });
    return null;
  },
  cacheZeileSchreiben: async (t: string, id: string, spalten: Record<string, unknown>, patch: Record<string, unknown>) => {
    if (t === "investments" && Object.keys(patch).length > 0) cache.patches.push({ id, patch });
    if (t === "investments" && Object.keys(spalten).length > 0) cache.updates.push({ id, felder: spalten as never });
    return true;
  },
  cacheGet: (t: string) => (t === "investments" ? cache.investments : []),
  cacheInsert: () => {},
  cacheUpdate: (t: string, id: string, felder: Geschrieben) => {
    if (t === "investments") cache.updates.push({ id, felder });
  },
  cacheDelete: () => {},
  // Wie der echte Speicher: ein neues Feld, damit der Index neu aufbaut.
  cacheSet: (t: string, zeilen: Zeile[]) => {
    if (t === "investments") cache.investments = zeilen;
  },
  onCacheChange: () => () => {},
}));
vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_k: string, fallback: unknown) => fallback,
  localSet: () => {},
}));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: <T,>(_k: string, fallback: T) => fallback,
  setUserSetting: () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async () => ({ data: null, error: null }), functions: { invoke: async () => ({ data: null, error: null }) } },
}));
vi.mock("@/lib/kundenStore", () => ({
  getKontakte: () => [],
  getKontaktById: () => null,
  updateKontakt: () => {},
}));

const store = await import("@/lib/investmentsStore");

function zeile(id: string, meta: Zeile, kundeId = "k-1") {
  return { id, kunde_id: kundeId, erstellt_am: "2026-09-01T08:00:00.000Z", meta: { nummer: 1, ...meta } };
}

beforeEach(() => {
  cache.investments = [];
  cache.updates = [];
  cache.patches = [];
  store.invalidateInvestmentsCache();
});

describe("Die Wurzel: fromDb liefert meta", () => {
  it("getInvestmentById, getInvestmentsByKontakt und getInvestments tragen das Meta", () => {
    cache.investments = [zeile("inv-1", { pipelineStufe: "reservierung", rvSignedAt: "2026-09-20" })];
    expect(store.getInvestmentById("inv-1")?.meta?.rvSignedAt).toBe("2026-09-20");
    expect(store.getInvestmentsByKontakt("k-1")[0].meta?.rvSignedAt).toBe("2026-09-20");
    expect(store.getInvestments()[0].meta?.rvSignedAt).toBe("2026-09-20");
  });

  it("zeigt nach setInvestmentMetaFields den neuen Stand", () => {
    cache.investments = [zeile("inv-1", { reserviertAm: "2026-09-01" })];
    expect(store.getInvestmentById("inv-1")?.meta?.reserviertAm).toBe("2026-09-01");
    store.setInvestmentMetaFields("inv-1", { reserviertAm: "2026-09-05" });
    expect(store.getInvestmentById("inv-1")?.meta?.reserviertAm).toBe("2026-09-05");
  });
});

describe("Hauptrisiko: ein veraltetes meta wird nie zurückgeschrieben", () => {
  it("updateInvestment mit gespreiztem, veraltetem Investment behält den neueren Stand", () => {
    cache.investments = [zeile("inv-1", { pipelineStufe: "objektauswahl", saSigned: false, notiz: "alt" })];
    const alt = store.getInvestmentById("inv-1")!;

    // Inzwischen schreibt jemand anderes ins Meta.
    store.setInvestmentMetaFields("inv-1", { saSigned: true, notiz: "neu", rvData: { iban: "DE02" } });

    // Und jemand reicht das alte Objekt komplett zurück.
    store.updateInvestment("inv-1", { ...alt, pipelineStufe: "reservierung" });

    // Seit H11 geht nur der geänderte Schlüssel hinaus, der neuere Stand
    // anderer Schlüssel wird gar nicht erst mitgeschickt.
    const geschrieben = cache.patches.at(-1)!.patch;
    expect(geschrieben).toEqual(expect.objectContaining({ pipelineStufe: "reservierung" }));
    expect(geschrieben).not.toHaveProperty("saSigned");
    expect(geschrieben).not.toHaveProperty("notiz");
    expect(geschrieben).not.toHaveProperty("rvData");
    // Kein verschachteltes meta im meta.
    expect(geschrieben).not.toHaveProperty("meta");
  });

  it("updateInvestment ohne meta-Feld ändert am übrigen Meta nichts", () => {
    cache.investments = [zeile("inv-1", { pipelineStufe: "objektauswahl", lockedProvisionRate: 4, saData: { steuerId: "1" } })];
    store.updateInvestment("inv-1", { notarName: "Dr. Beispiel" });
    const patch = cache.patches.at(-1)!.patch;
    expect(patch.notarName).toBe("Dr. Beispiel");
    expect(patch).not.toHaveProperty("lockedProvisionRate");
    expect(patch).not.toHaveProperty("saData");
    expect(cache.updates.some((u) => "meta" in u.felder)).toBe(false);
  });
});

describe("Anzeigen, die jetzt Daten bekommen", () => {
  it("Ampel-Badge: Termine am Investment kommen an", async () => {
    const { festeTermine } = await import("@/lib/kontaktTermine");
    cache.investments = [zeile("inv-1", { setterTerminDatum: "2026-10-02", setterTerminUhrzeit: "10:00", beratungsgespraechAm: "2026-10-05" })];
    const termine = festeTermine({ id: "k-1", vorname: "A", nachname: "B" } as never, "inv-1");
    const daten = termine.map((t) => t.datum);
    expect(daten).toContain("2026-10-02");
    expect(daten).toContain("2026-10-05");
  });

  it("Spalte „Reserviert am“ nimmt das Datum aus dem Meta", async () => {
    const { getColumnDef } = await import("@/components/kunden/KundenColumnConfig");
    cache.investments = [zeile("inv-1", { wohnungId: "w-1", reserviertAm: "2026-09-15T09:00:00.000Z" })];
    const spalte = getColumnDef("reserviertAm")!;
    const { container } = render(<>{spalte.render({ id: "k-1" } as never)}</>);
    expect(container.textContent).toContain("15.09.2026");
  });

  it("Steuer-ID im Selbstauskunftsformular kommt aus der Reservierung oder der Selbstauskunft", async () => {
    const { lookupSteuerIdFromInvestments } = await import("@/components/selbstauskunft/SelbstauskunftForm");
    cache.investments = [zeile("inv-1", { saData: { steuerId: "12345678901", person2Data: { steuerId: "10987654321" } } })];
    expect(lookupSteuerIdFromInvestments("k-1")).toEqual({ p1: "12345678901", p2: "10987654321" });
  });

  it("Finanzierungs-Performance rechnet die Tage von der Reservierung bis zum Angebot", async () => {
    const { computeFinanzierungsPerformance } = await import("@/components/dashboard/FinanzierungsPerformanceBlock");
    cache.investments = [zeile("inv-1", {
      pipelineStufe: "finanzierung",
      reserviertAm: "2026-09-01T00:00:00.000Z",
      finanzierungAngebotGesendetAm: "2026-09-11T00:00:00.000Z",
    })];
    expect(computeFinanzierungsPerformance().avgTageRvAngebot).toBe(10);
  });

  it("Pipeline, Aftersales und Verkäufer-Rückfall lesen dieselbe Quelle", () => {
    cache.investments = [zeile("inv-1", {
      rvSignedAt: "2026-09-20",
      aftersalesBeratung: { status: "offen" },
      einreichungData: { eigentuemer_name: "Musterbau GmbH" },
    })];
    const inv = store.getInvestmentsByKontakt("k-1")[0];
    expect(inv.meta?.rvSignedAt).toBe("2026-09-20");
    expect(inv.meta?.aftersalesBeratung).toEqual({ status: "offen" });
    expect((inv.meta?.einreichungData as { eigentuemer_name: string }).eigentuemer_name).toBe("Musterbau GmbH");
  });
});

describe("Provision: festgeschriebener Satz und Fälligkeit wirken (Entscheidung 29.09.2026)", () => {
  it("solange der Schalter aus ist, rechnen die Abrechnungen mit dem aktuellen Satz", async () => {
    const { festgeschriebenerSatz, FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG } = await import("@/lib/karriereStufeHelper");
    if (FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG) return;
    expect(festgeschriebenerSatz({ lockedProvisionRate: 5 })).toBeNull();
  });

  it("der festgeschriebene Satz aus dem Meta gilt vor dem aktuellen", async () => {
    const { festgeschriebenerSatz, getEffectiveRateInfoForKontakt, FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG } = await import("@/lib/karriereStufeHelper");
    // Gilt erst mit eingeschaltetem Schalter, siehe karriereStufeHelper.ts.
    if (!FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG) return;
    // 2,5 Prozent, damit er sich sicher vom Stufensatz unterscheidet.
    cache.investments = [zeile("inv-1", { pipelineStufe: "faelligkeit", lockedProvisionRate: 2.5 })];
    const inv = store.getInvestments()[0];
    expect(festgeschriebenerSatz(inv.meta)).toBe(2.5);

    const kontakt = { id: "k-1", zustaendig_id: "u-1" };
    const info = getEffectiveRateInfoForKontakt("u-1", kontakt, festgeschriebenerSatz(inv.meta));
    expect(info.rate).toBe(2.5);
    expect(info.quelle).toBe("locked");
    // Ohne festgeschriebenen Satz gilt der aktuelle, und der ist hier ein anderer.
    const ohne = getEffectiveRateInfoForKontakt("u-1", kontakt, null);
    expect(ohne.rate).not.toBe(2.5);
    expect(info.heutigerSatz).toBe(ohne.rate);
  });

  it("nur eine Zahl größer null ist ein festgeschriebener Satz", async () => {
    const { festgeschriebenerSatz, FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG } = await import("@/lib/karriereStufeHelper");
    if (!FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG) return;
    expect(festgeschriebenerSatz(undefined)).toBeNull();
    expect(festgeschriebenerSatz({})).toBeNull();
    expect(festgeschriebenerSatz({ lockedProvisionRate: 0 })).toBeNull();
    expect(festgeschriebenerSatz({ lockedProvisionRate: "4" })).toBeNull();
    expect(festgeschriebenerSatz({ lockedProvisionRate: 4 })).toBe(4);
  });

  it("Provision ist Satz mal Kaufpreis des Investments, abrechenbar ab dem Fälligkeitsdatum", async () => {
    const { abwicklungAusMeta } = await import("@/lib/abwicklungStore");
    const { istAbrechenbar, postenProvision } = await import("@/lib/abrechnungRechnung");
    const { festgeschriebenerSatz, getEffectiveRateInfoForKontakt } = await import("@/lib/karriereStufeHelper");
    cache.investments = [zeile("inv-1", {
      pipelineStufe: "faelligkeit",
      lockedProvisionRate: 3,
      kaufpreis: 200000,
      abwicklung: { kaufpreisfaelligkeitDatum: "2026-09-10" },
    })];
    const inv = store.getInvestments()[0];
    const faelligAm = abwicklungAusMeta(inv.meta).kaufpreisfaelligkeitDatum || "";
    expect(faelligAm).toBe("2026-09-10");
    const satz = getEffectiveRateInfoForKontakt("u-1", { id: "k-1" }, festgeschriebenerSatz(inv.meta)).rate;
    const posten = { kaufpreis: Number(inv.meta?.kaufpreis), stufe: inv.pipelineStufe, satz, kaufpreisfaelligAm: faelligAm };
    expect(postenProvision(posten)).toBe(6000);
    expect(istAbrechenbar(posten, new Date("2026-09-09T12:00:00"))).toBe(false);
    expect(istAbrechenbar(posten, new Date("2026-09-11T12:00:00"))).toBe(true);
  });

  it("Abrechnungen und Provisionsabrechnung reichen den festgeschriebenen Satz durch", () => {
    const abrechnungen = readFileSync(resolve(process.cwd(), "src/pages/Abrechnungen.tsx"), "utf8");
    expect(abrechnungen).toContain("getEffectiveRateInfoForKontakt(u.id, k, festgeschriebenerSatz(inv.meta))");
    const bescheide = readFileSync(resolve(process.cwd(), "src/pages/Provisionsabrechnung.tsx"), "utf8");
    // Seit dem 04.10.2026 je Investment: der Satz genau dieses Investments.
    expect(bescheide).toContain("getEffectiveRateInfoForKontakt(u.id, k, festgeschriebenerSatz(inv.meta))");
  });
});

describe("Kundenprofil im Quelltext", () => {
  const kundenDetail = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");

  it("fragt vor dem Löschen des Notartermins mit „Termin löschen“ und „Behalten“", () => {
    const abschnitt = kundenDetail.slice(kundenDetail.indexOf("const setModus = async"), kundenDetail.indexOf("switchNotarTerminModus(inv.id, next)"));
    expect(abschnitt).toContain("const m = inv.meta || {};");
    expect(abschnitt).toContain("confirmDialog(");
    expect(abschnitt).toContain('confirmText: nurVorschlaege ? "Vorschläge löschen" : "Termin löschen"');
    expect(abschnitt).toContain('cancelText: "Behalten"');
  });

  it("zeigt den Investagon-Hinweis nur zu einem eingetragenen Objekt", () => {
    expect(kundenDetail).toContain('if (m.quelle !== "investagon" || !(inv.objektId || !objektDatenFehlen(inv.id))) return null;');
    expect(kundenDetail).toContain('if (m.quelle !== "investagon" || !(kvInv.objektId || !objektDatenFehlen(kvInv.id))) return null;');
    expect(kundenDetail).not.toContain("Investagon-Reservierung – ");
  });

  it("der Setter-Abgleich füllt nur leere Stammdaten", () => {
    expect(kundenDetail).toContain('if (beruf && !(kunde.qualBeruflicheSituation || "").trim()) {');
    expect(kundenDetail).toContain('if (zielJoined && !(kunde.qualZiel || "").trim()) {');
  });
});

describe("Blanko-Reservierung abgeschaltet", () => {
  it("die Reservierungsseite reicht keinen Investagon-Modus mehr durch", () => {
    const seite = readFileSync(resolve(process.cwd(), "src/pages/Reservierung.tsx"), "utf8");
    const formular = readFileSync(resolve(process.cwd(), "src/components/reservierung/ReservierungsForm.tsx"), "utf8");
    expect(seite).not.toContain('searchParams.get("quelle")');
    expect(formular).not.toContain("investagonRef");
    expect(formular).not.toContain('quelle === "investagon"');
  });
});

describe("Investagon-Link nur als https-Adresse", () => {
  it("zeigt den Link nur, wenn die Adresse mit https:// beginnt", () => {
    const kd = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");
    const fw = readFileSync(resolve(process.cwd(), "src/components/kunden/FreieWohnungenCard.tsx"), "utf8");
    expect(kd.match(/\/\^https:\\\/\\\/\/i\.test\(m\.investagonRef\.trim\(\)\)/g)?.length).toBe(2);
    expect(fw).toContain("investagonRef && /^https:\\/\\//i.test(investagonRef.trim())");
  });
});
