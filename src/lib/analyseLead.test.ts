import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendeAnalyseLead } from "@/lib/analyseLead";
import { calculateScore, type AnalysisData } from "@/lib/scoringEngine";

const DATEN: AnalysisData = {
  age: 38,
  familyStatus: "verheiratet",
  householdSize: 2,
  dependents: 0,
  livingSituation: "miete",
  profession: "angestellt",
  employmentType: "unbefristet",
  employmentDuration: 8,
  netIncome: 4500,
  additionalIncome: 0,
  savingsRate: 600,
  equity: 40000,
  liquidityReserve: 15000,
  existingLoans: 0,
  monthlyFixedCosts: 1800,
  existingProperties: 0,
  investmentExperience: "wenig",
  realEstateExperience: "keine",
  goals: ["vermoegensaufbau"],
  incomeClass: "50k_80k",
  taxOptimizationInterest: true,
  financingWillingness: "ja",
} as AnalysisData;

const ERGEBNIS = calculateScore(DATEN);

const EINGABE = {
  vorname: " Max ",
  nachname: "Mustermann",
  email: " max@example.com ",
  telefon: "0170 1234567",
  strasse: "Musterstraße 12a",
  plz: "80331",
  ort: "München",
  notizen: "  Bitte vormittags anrufen  ",
};

let letzterAufruf: { url: string; body: Record<string, unknown> } | null = null;

beforeEach(() => {
  letzterAufruf = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      letzterAufruf = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ kontaktId: "kontakt-1" }) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Lead aus dem Analysetool", () => {
  it("meldet Erfolg und reicht keine Kontakt-ID durch (HB-002)", async () => {
    const r = await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN, { name: "Christian Peetz", userId: "u-1" } as never);
    expect(r).toEqual({ ok: true });
  });

  it("setzt die Quelle Analysetool", async () => {
    await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN);
    expect(letzterAufruf?.body.quelle).toBe("Analysetool");
  });

  it("ordnet den Lead dem Vertriebspartner zu", async () => {
    await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN, { name: "Christian Peetz", userId: "u-1" } as never);
    expect(letzterAufruf?.body.beraterUserId).toBe("u-1");
    expect(letzterAufruf?.body.beraterName).toBe("Christian Peetz");
  });

  it("schickt beim Link mit Kuerzel das Kuerzel und keine Kennung", async () => {
    // Der Server ermittelt den Partner seit dem 24.09.2026 selbst aus dem
    // Kuerzel. Eine Kennung daneben wuerde nichts entscheiden.
    await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN, {
      name: "Christian Peetz",
      userId: "u-1",
      slug: "christian-peetz",
    } as never);
    expect(letzterAufruf?.body.beraterSlug).toBe("christian-peetz");
    expect(letzterAufruf?.body.beraterUserId).toBe("");
  });

  it("trimmt die Eingaben", async () => {
    await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN);
    expect(letzterAufruf?.body.vorname).toBe("Max");
    expect(letzterAufruf?.body.email).toBe("max@example.com");
    expect(letzterAufruf?.body.notizen).toBe("Bitte vormittags anrufen");
  });

  it("zerlegt die Straße in Name und Hausnummer", async () => {
    await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN);
    expect(letzterAufruf?.body.strasse).toBe("Musterstraße");
    expect(letzterAufruf?.body.hausnummer).toBe("12a");
  });

  it("kommt mit einer Straße ohne Hausnummer zurecht", async () => {
    await sendeAnalyseLead({ ...EINGABE, strasse: "Am Anger" }, ERGEBNIS, DATEN);
    expect(letzterAufruf?.body.strasse).toBe("Am Anger");
    expect(letzterAufruf?.body.hausnummer).toBe("");
  });

  it("hängt Qualität und Schnappschuss an", async () => {
    await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN);
    const meta = letzterAufruf?.body.meta as Record<string, unknown>;
    expect(meta.leadQuality).toBe(ERGEBNIS.leadQuality);
    expect(meta.analyseScore).toBe(ERGEBNIS.totalScore);
    expect(meta.analyseSnapshot).toBeTruthy();
  });

  it("gibt keine Pipelinestufe mehr vor", async () => {
    // Die Stufe entscheidet der Server nach der Herkunft. Solange hier fest
    // "neuer_lead" stand, landete auch der Lead eines Partners in der
    // Lead-Verwaltung statt bei ihm.
    await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN, { name: "X", userId: "u-1" } as never);
    const meta = letzterAufruf?.body.meta as Record<string, unknown>;
    expect(meta.pipelineStufe).toBeUndefined();
  });

  it("schickt den Einwilligungsnachweis mit Wortlaut und Zeitpunkt mit", async () => {
    await sendeAnalyseLead({ ...EINGABE, einwilligung: true }, ERGEBNIS, DATEN);
    const nachweis = letzterAufruf?.body.dsgvo_consent as Record<string, unknown>;
    expect(nachweis?.erteilt).toBe(true);
    expect(String(nachweis?.text)).toContain("MOREImmo");
    expect(nachweis?.am).toBeTruthy();
    expect(nachweis?.werbung).toBeUndefined();
  });

  it("führt die freiwillige Werbeeinwilligung getrennt", async () => {
    await sendeAnalyseLead(
      { ...EINGABE, einwilligung: true, werbeeinwilligung: true },
      ERGEBNIS,
      DATEN,
    );
    const nachweis = letzterAufruf?.body.dsgvo_consent as Record<string, any>;
    expect(nachweis?.werbung?.erteilt).toBe(true);
    expect(nachweis.werbung.text).not.toBe(nachweis.text);
  });

  it("schickt ohne Pflichthaken keinen Nachweis mit", async () => {
    await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN);
    expect(letzterAufruf?.body.dsgvo_consent).toBeNull();
  });

  it("meldet einen Serverfehler verständlich zurück", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    const r = await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN);
    expect(r.ok).toBe(false);
    expect(r.fehler).toMatch(/nicht geklappt/);
  });

  it("unterscheidet das Rate-Limit vom Serverfehler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "3600" }),
        json: async () => ({ error: "rate_limited" }),
      }) as Response),
    );
    const r = await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
    expect(r.fehler).toContain("viele Anfragen");
    expect(r.fehler).toContain("einer Stunde");
  });

  it("meldet einen Netzfehler verständlich zurück", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const r = await sendeAnalyseLead(EINGABE, ERGEBNIS, DATEN);
    expect(r.ok).toBe(false);
    expect(r.fehler).toMatch(/Internetverbindung/);
  });
});

describe("Der Lead übernimmt die Seitensprache (Plan Kundensprache, Etappe 6)", () => {
  const MIT_EINWILLIGUNG = { ...EINGABE, einwilligung: true };

  it("Englisch: `sprache` geht mit, die Einwilligung trägt den englischen Wortlaut", async () => {
    await sendeAnalyseLead(MIT_EINWILLIGUNG, ERGEBNIS, DATEN, undefined, "en");
    expect(letzterAufruf?.body.sprache).toBe("en");
    expect((letzterAufruf?.body.dsgvo_consent as { version: string }).version).toBe("2026-09-v1-en");
    // Was ins CRM geht, bleibt deutsch.
    expect(letzterAufruf?.body.finanzierbarkeit).toBe(ERGEBNIS.categoryLabel);
  });

  it("ohne Angabe Deutsch, mit deutscher Einwilligung", async () => {
    await sendeAnalyseLead(MIT_EINWILLIGUNG, ERGEBNIS, DATEN);
    expect(letzterAufruf?.body.sprache).toBe("de");
    expect((letzterAufruf?.body.dsgvo_consent as { version: string }).version).toBe("2026-09-v1");
  });
});
