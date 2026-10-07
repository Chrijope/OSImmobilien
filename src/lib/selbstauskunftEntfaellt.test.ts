import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Vermerk „Kunde finanziert selbst, keine Selbstauskunft nötig".
 *
 * Geprüft wird dreierlei: wer ihn setzen darf, dass er sich zurücknehmen
 * lässt, ohne den bisherigen Stand zu löschen, und dass die
 * Bonitätsunterlagen mit ihm als nicht erforderlich gelten.
 *
 * Der Zwischenspeicher wird ersetzt, damit der Test ohne Supabase auskommt.
 */

const ablage = new Map<string, unknown>();

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMeta: (id: string, key: string, fallback: unknown) =>
    ablage.has(`${id}:${key}`) ? ablage.get(`${id}:${key}`) : fallback,
  setInvestmentMeta: (id: string, key: string, value: unknown) => {
    ablage.set(`${id}:${key}`, value);
  },
}));

import {
  SA_ENTFAELLT_ROLLEN,
  SA_ENTFAELLT_SCHLUESSEL,
  bonitaetsunterlagenErforderlich,
  darfSelbstauskunftEntfallen,
  getSelbstauskunftEntfaellt,
  nimmSelbstauskunftEntfaelltZurueck,
  saEntfaelltText,
  selbstauskunftEntfaellt,
  setzeSelbstauskunftEntfaellt,
} from "@/lib/selbstauskunftEntfaellt";

beforeEach(() => ablage.clear());

describe("Wer den Vermerk setzen darf", () => {
  it("lässt Vertriebspartner und alles darüber zu", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter", "vertriebspartner", "backoffice"]) {
      expect(darfSelbstauskunftEntfallen(rolle)).toBe(true);
    }
  });

  it("lässt die Setterin ausdrücklich nicht zu", () => {
    expect(darfSelbstauskunftEntfallen("setterin")).toBe(false);
    expect(SA_ENTFAELLT_ROLLEN).not.toContain("setterin" as never);
  });

  it("lässt auch Kunde, Tippgeber und leere Rollen nicht zu", () => {
    for (const rolle of ["kunde", "tippgeber", "bewerber", "objektpartner", "hausverwaltung", "", null, undefined]) {
      expect(darfSelbstauskunftEntfallen(rolle as string)).toBe(false);
    }
  });
});

describe("Setzen", () => {
  it("schreibt Zeitpunkt, Name, Kennung und Rolle", () => {
    const vermerk = setzeSelbstauskunftEntfaellt("inv-1", {
      name: "Christian Peetz",
      id: "auth-1",
      rolle: "vertriebspartner",
    });
    expect(vermerk?.aktiv).toBe(true);
    expect(vermerk?.gesetztVonName).toBe("Christian Peetz");
    expect(vermerk?.gesetztVonId).toBe("auth-1");
    expect(vermerk?.gesetztVonRolle).toBe("vertriebspartner");
    expect(vermerk?.gesetztAm).toBeTruthy();
    expect(selbstauskunftEntfaellt("inv-1")).toBe(true);
  });

  it("legt den Vermerk unter dem Schlüssel ab, den auch die Datenbank kennt", () => {
    setzeSelbstauskunftEntfaellt("inv-1", { name: "A", rolle: "admin" });
    expect(ablage.has(`inv-1:${SA_ENTFAELLT_SCHLUESSEL}`)).toBe(true);
    expect(SA_ENTFAELLT_SCHLUESSEL).toBe("selbstauskunftEntfaellt");
  });

  it("schreibt für die Setterin gar nichts", () => {
    const vermerk = setzeSelbstauskunftEntfaellt("inv-1", { name: "S", rolle: "setterin" });
    expect(vermerk).toBeNull();
    expect(selbstauskunftEntfaellt("inv-1")).toBe(false);
    expect(ablage.size).toBe(0);
  });
});

describe("Zurücknehmen", () => {
  it("schaltet ab und hält fest, wer es war", () => {
    setzeSelbstauskunftEntfaellt("inv-1", { name: "Christian", rolle: "vertriebspartner" });
    const zurueck = nimmSelbstauskunftEntfaelltZurueck("inv-1", { name: "Nadine", rolle: "backoffice" });
    expect(zurueck?.aktiv).toBe(false);
    expect(zurueck?.zurueckgenommenVonName).toBe("Nadine");
    expect(zurueck?.zurueckgenommenAm).toBeTruthy();
    expect(selbstauskunftEntfaellt("inv-1")).toBe(false);
  });

  it("löscht nicht, wer ihn ursprünglich gesetzt hat", () => {
    setzeSelbstauskunftEntfaellt("inv-1", { name: "Christian", rolle: "vertriebspartner" });
    nimmSelbstauskunftEntfaelltZurueck("inv-1", { name: "Nadine", rolle: "backoffice" });
    expect(getSelbstauskunftEntfaellt("inv-1").gesetztVonName).toBe("Christian");
  });

  it("darf von der Setterin nicht zurückgenommen werden", () => {
    setzeSelbstauskunftEntfaellt("inv-1", { name: "Christian", rolle: "vertriebspartner" });
    expect(nimmSelbstauskunftEntfaelltZurueck("inv-1", { name: "S", rolle: "setterin" })).toBeNull();
    expect(selbstauskunftEntfaellt("inv-1")).toBe(true);
  });
});

describe("Bonitätsunterlagen", () => {
  it("werden ohne Vermerk erwartet", () => {
    expect(bonitaetsunterlagenErforderlich("inv-1")).toBe(true);
  });

  it("entfallen mit gesetztem Vermerk", () => {
    setzeSelbstauskunftEntfaellt("inv-1", { name: "Christian", rolle: "vertriebspartner" });
    expect(bonitaetsunterlagenErforderlich("inv-1")).toBe(false);
  });

  it("werden nach der Rücknahme wieder erwartet", () => {
    setzeSelbstauskunftEntfaellt("inv-1", { name: "Christian", rolle: "vertriebspartner" });
    nimmSelbstauskunftEntfaelltZurueck("inv-1", { name: "Christian", rolle: "vertriebspartner" });
    expect(bonitaetsunterlagenErforderlich("inv-1")).toBe(true);
  });
});

describe("Sichtbarer Vermerk", () => {
  it("nennt Datum und Person", () => {
    const text = saEntfaelltText({
      aktiv: true,
      gesetztAm: "2026-09-16T10:00:00.000Z",
      gesetztVonName: "Christian Peetz",
    });
    expect(text).toContain("16.09.2026");
    expect(text).toContain("Christian Peetz");
  });

  it("bleibt leer, solange nichts vermerkt ist", () => {
    expect(saEntfaelltText({ aktiv: false })).toBe("");
  });

  it("verwendet keine Gedankenstriche", () => {
    const text = saEntfaelltText({ aktiv: true, gesetztAm: "2026-09-16T10:00:00.000Z", gesetztVonName: "A" });
    expect(text).not.toContain("–");
    expect(text).not.toContain("—");
  });
});

describe("Ohne Investment", () => {
  it("gilt der Vermerk als nicht gesetzt", () => {
    expect(selbstauskunftEntfaellt(null)).toBe(false);
    expect(selbstauskunftEntfaellt(undefined)).toBe(false);
    expect(selbstauskunftEntfaellt("")).toBe(false);
  });
});
