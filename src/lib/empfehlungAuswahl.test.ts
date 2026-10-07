import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

// sidebarPermissions zieht den Supabase-Client an, im Test genügt eine Attrappe.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));

const daten = vi.hoisted(() => ({
  investments: {} as Record<string, { id: string; kontaktId: string }>,
  kontakte: {} as Record<string, { id: string; vorname: string; nachname: string }>,
  sa: {} as Record<string, unknown>,
}));

vi.mock("@/lib/investmentsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentsStore")>()),
  getInvestmentById: (id: string) => daten.investments[id],
  getEigeneSaData: (id: string) => daten.sa[id] ?? null,
}));
vi.mock("@/lib/kundenStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kundenStore")>()),
  getKontaktById: (id: string) => daten.kontakte[id],
}));
vi.mock("@/lib/finanzierbarkeitUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finanzierbarkeitUtils")>()),
  // Der Rahmen selbst ist hier nicht Thema, er kommt fest aus der Attrappe.
  calculateFinanzierbarkeitFromSaData: (sa: { min: number; max: number }) => ({ minRahmen: sa.min, maxRahmen: sa.max }),
}));

const {
  einheitOeffnenLink, objektOeffnenLink, mitEmpfehlung, empfehlungAusSuche, ohneEmpfehlung,
  empfehlungsAuswahlFuerObjekt, nutztNeueObjektseiten,
  kundenRueckweg, mitRueckweg, kundenRueckwegAusSuche, kundeIdAusRueckweg, rueckwegImVerlaufMerken,
} = await import("@/lib/empfehlungAuswahl");

/** Pfad und Parameter getrennt, damit die Kodierung des Rückwegs nicht stört. */
function zerlege(link: string) {
  const [pfad, suche = ""] = link.split("?");
  return { pfad, p: new URLSearchParams(suche) };
}
const RUECKWEG = "/kunden/kunde-1?tab=investments&investment=inv-1#objektauswahl";
const { willVerwaltungsansicht } = await import("@/lib/objektseiteDaten");

function we(id: string, teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return { id, weNr: "1", etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800, vkGesamt: 260000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile };
}

function objekt(id: string, wohnungen: ObjektWohnung[], teile: Partial<ObjektData> = {}): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {}, ...teile,
  } as ObjektData;
}

const bezug = (rolle: string) => ({ rolle, kundeId: "kunde-1", investmentId: "inv-1" });
// Die Vertriebsleitung sieht seit dem 04.10.2026 die neuen Seiten wie der Admin.
const ANDERE_ROLLEN = ["vertriebspartner", "backoffice", "finanzierungspartner"];

describe("Wo welche Rolle landet", () => {
  it("Admin, Inhaber und Vertriebsleitung auf der neuen Einheitsseite mit ?empfehlung=", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter"]) {
      expect(nutztNeueObjektseiten(rolle)).toBe(true);
      const { pfad, p } = zerlege(einheitOeffnenLink("o1", "w1", bezug(rolle)));
      expect(pfad).toBe("/objekte/o1/einheiten/w1");
      expect(p.get("empfehlung")).toBe("inv-1");
      // Seit dem 24.09.2026 reist der Rückweg ins Kundenprofil mit.
      expect(p.get("zurueck")).toBe(RUECKWEG);
    }
  });

  it("alle anderen in der alten Wohnungsansicht mit kundeId und investmentId", () => {
    for (const rolle of ANDERE_ROLLEN) {
      expect(nutztNeueObjektseiten(rolle)).toBe(false);
      expect(einheitOeffnenLink("o1", "w1", bezug(rolle))).toBe("/objekte/o1/wohnung/w1?kundeId=kunde-1&investmentId=inv-1");
    }
  });

  it("Objekt öffnen: Admin auf die Objektseite, ein Einzelobjekt gleich in seine Einheit", () => {
    const haus = objekt("o1", [we("w1"), we("w2")]);
    const einzel = objekt("o2", [we("w3")]);
    const global = objekt("o3", [we("w4")], { globalObjekt: true });
    const pruefe = (link: string, erwartet: string) => {
      const { pfad, p } = zerlege(link);
      expect(pfad).toBe(erwartet);
      expect(p.get("empfehlung")).toBe("inv-1");
      expect(p.get("zurueck")).toBe(RUECKWEG);
    };
    pruefe(objektOeffnenLink(haus, bezug("admin")), "/objekte/o1");
    pruefe(objektOeffnenLink(einzel, bezug("inhaber")), "/objekte/o2/einheiten/w3");
    pruefe(objektOeffnenLink(global, bezug("admin")), "/objekte/o3");
  });

  it("Objekt öffnen: alle anderen in die Verwaltungsansicht mit Kundenbezug", () => {
    for (const rolle of ANDERE_ROLLEN) {
      const link = objektOeffnenLink(objekt("o1", [we("w1"), we("w2")]), bezug(rolle));
      expect(link).toBe("/objekte/o1/verwaltung?kundeId=kunde-1&investmentId=inv-1");
      // Dieselben Parameter, an denen die Objektseite die Verwaltungsansicht erkennt.
      expect(willVerwaltungsansicht(link.slice(link.indexOf("?")))).toBe(true);
    }
  });

  it("in keiner Adresse stehen Namen oder Beträge", () => {
    const links = [
      ...["admin", ...ANDERE_ROLLEN].map((r) => einheitOeffnenLink("o1", "w1", bezug(r))),
      ...["admin", ...ANDERE_ROLLEN].map((r) => objektOeffnenLink(objekt("o1", [we("w1"), we("w2")]), bezug(r))),
    ];
    for (const link of links) {
      const schluessel = [...new URLSearchParams(link.split("?")[1] || "").keys()];
      expect(schluessel.every((k) => ["empfehlung", "kundeId", "investmentId", "zurueck"].includes(k))).toBe(true);
    }
  });
});

describe("Der Parameter ?empfehlung=", () => {
  it("wird angehängt, ohne vorhandene Parameter zu verlieren", () => {
    expect(mitEmpfehlung("/objekte/o1", "inv-1")).toBe("/objekte/o1?empfehlung=inv-1");
    expect(mitEmpfehlung("/objekte/o1?tab=2", "inv-1")).toBe("/objekte/o1?tab=2&empfehlung=inv-1");
    expect(mitEmpfehlung("/objekte/o1", null)).toBe("/objekte/o1");
  });

  it("wird gelesen und beim Beenden entfernt", () => {
    expect(empfehlungAusSuche("?empfehlung=inv-1")).toBe("inv-1");
    expect(empfehlungAusSuche("?empfehlung=")).toBeNull();
    expect(empfehlungAusSuche("")).toBeNull();
    expect(ohneEmpfehlung("?empfehlung=inv-1")).toBe("");
    expect(ohneEmpfehlung("?tab=2&empfehlung=inv-1")).toBe("?tab=2");
  });
});

describe("Die Auswahl auf der Objektseite", () => {
  beforeEach(() => {
    daten.investments = { "inv-1": { id: "inv-1", kontaktId: "kunde-1" } };
    daten.kontakte = { "kunde-1": { id: "kunde-1", vorname: "Max", nachname: "Muster" } };
    daten.sa = { "inv-1": { min: 250000, max: 300000 } };
  });

  const nutzer = { rolle: "admin" };

  it("liefert Vorname, Rahmen, Kaufpreisrahmen dieses Bundeslands und die passenden Einheiten", () => {
    const o = objekt("o1", [we("passt", { vkGesamt: 270000 }), we("zuTeuer", { vkGesamt: 310000 }), we("belegt", { status: "reserviert" })]);
    const a = empfehlungsAuswahlFuerObjekt("inv-1", o, nutzer)!;
    expect(a.vorname).toBe("Max");
    expect(a.kontaktId).toBe("kunde-1");
    expect(a.rahmen).toEqual({ von: 250000, bis: 300000 });
    expect(a.nebenkostenProzent).toBe(5);
    // Seit dem 23.09.2026 zählt nur der Kaufpreis: der Kaufpreisrahmen ist der Rahmen.
    expect(a.kaufpreisRahmen).toEqual({ von: 250000, bis: 300000 });
    expect(a.empfohleneIds).toEqual(["passt"]);
    // Kein Nachname in der Auswahl, nur was die Leiste zeigt.
    expect(JSON.stringify(a)).not.toContain("Muster");
  });

  it("beim Globalobjekt: passt das Haus als Ganzes", () => {
    const g = objekt("g", [we("w1")], { globalObjekt: true, globalDaten: { verkaufspreis: 270000 } as ObjektData["globalDaten"] });
    const a = empfehlungsAuswahlFuerObjekt("inv-1", g, nutzer)!;
    expect(a.gesamtobjektPasst).toBe(true);
    expect(a.empfohleneIds).toEqual([]);
  });

  it("ohne Selbstauskunft kein Rahmen und nichts empfohlen", () => {
    daten.sa = {};
    const a = empfehlungsAuswahlFuerObjekt("inv-1", objekt("o1", [we("w1")]), nutzer)!;
    expect(a.rahmen).toBeNull();
    expect(a.kaufpreisRahmen).toBeNull();
    expect(a.empfohleneIds).toEqual([]);
  });

  it("wer den Kunden nicht sehen darf, bekommt nichts", () => {
    daten.investments = {};
    expect(empfehlungsAuswahlFuerObjekt("inv-1", objekt("o1", [we("w1")]), nutzer)).toBeNull();
    daten.investments = { "inv-1": { id: "inv-1", kontaktId: "kunde-1" } };
    daten.kontakte = {};
    expect(empfehlungsAuswahlFuerObjekt("inv-1", objekt("o1", [we("w1")]), nutzer)).toBeNull();
  });
});

describe("Der Rückweg ins Kundenprofil (?zurueck=)", () => {
  it("führt in den Reiter Investments, ins richtige Investment und zur Objektauswahl", () => {
    expect(kundenRueckweg("kunde-1", "inv-1")).toBe(RUECKWEG);
    expect(kundenRueckweg("kunde-1")).toBe("/kunden/kunde-1?tab=investments#objektauswahl");
  });

  it("wird gelesen, samt Kundenkennung", () => {
    const suche = `?${new URLSearchParams({ zurueck: RUECKWEG }).toString()}`;
    expect(kundenRueckwegAusSuche(suche)).toBe(RUECKWEG);
    expect(kundeIdAusRueckweg(RUECKWEG)).toBe("kunde-1");
  });

  it("nimmt keine fremden Adressen an, keine offene Weiterleitung", () => {
    for (const fremd of [
      "https://fremd.example/kunden/x",
      "//fremd.example/kunden/x",
      "/\\fremd.example/kunden/x",
      "javascript:alert(1)",
      "kunden/x",
    ]) {
      const suche = `?${new URLSearchParams({ zurueck: fremd }).toString()}`;
      expect(kundenRueckwegAusSuche(suche), fremd).toBeNull();
      expect(mitRueckweg("/objekte/o1", fremd), fremd).toBe("/objekte/o1");
    }
  });

  it("nimmt nur Pfade ins Kundenprofil an, keine anderen internen Seiten", () => {
    const suche = `?${new URLSearchParams({ zurueck: "/einstellungen" }).toString()}`;
    expect(kundenRueckwegAusSuche(suche)).toBeNull();
    expect(kundenRueckwegAusSuche("")).toBeNull();
  });

  it("hängt an vorhandene Parameter an", () => {
    const { pfad, p } = zerlege(mitRueckweg("/objekte/o1?empfehlung=inv-1", RUECKWEG));
    expect(pfad).toBe("/objekte/o1");
    expect(p.get("empfehlung")).toBe("inv-1");
    expect(p.get("zurueck")).toBe(RUECKWEG);
  });
});

describe("Der Zurück-Knopf des Browsers", () => {
  it("setzt den Verlaufseintrag auf den Rückweg, so wie ihn das Kundenprofil beim Laden liest", () => {
    window.history.replaceState({ idx: 3, key: "k" }, "", "/kunden/kunde-1?investment=inv-1&anruf=1");
    rueckwegImVerlaufMerken("kunde-1", "inv-1");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(RUECKWEG);
    // Genau das wertet der Ankersprung in KundenDetail aus.
    expect(new URLSearchParams(window.location.search).get("investment")).toBe("inv-1");
    expect(window.location.hash.replace("#", "")).toBe("objektauswahl");
    // Der Zustand des Routers bleibt, sonst verliert er beim Zurück die Zählung.
    expect(window.history.state).toEqual({ idx: 3, key: "k" });
  });

  it("fasst außerhalb des Kundenprofils nichts an", () => {
    window.history.replaceState(null, "", "/objekte/o1?x=1");
    rueckwegImVerlaufMerken("kunde-1", "inv-1");
    expect(window.location.pathname + window.location.search).toBe("/objekte/o1?x=1");
    window.history.replaceState(null, "", "/kunden/anderer");
    rueckwegImVerlaufMerken("kunde-1", "inv-1");
    expect(window.location.pathname + window.location.hash).toBe("/kunden/anderer");
  });
});

describe("hatKundenParameter (Runde 6)", () => {
  it("zählt schon die Parameter, ohne den Kontakt aufzulösen", async () => {
    const { hatKundenParameter } = await import("./empfehlungAuswahl");
    for (const suche of [
      "?empfehlung=inv1",
      `?zurueck=${encodeURIComponent("/kunden/k1?tab=investments")}`,
      "?kundeId=k1",
      "?kunde=k1",
      "?investmentId=inv1",
    ]) expect(hatKundenParameter(suche), suche).toBe(true);
    for (const suche of ["", "?tab=finanzen", `?zurueck=${encodeURIComponent("/objekte/o1")}`, "?empfehlung="]) {
      expect(hatKundenParameter(suche), suche).toBe(false);
    }
  });
});
