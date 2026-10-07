import { describe, expect, it, vi } from "vitest";
type Zeile = Record<string, unknown>;
const { rows } = vi.hoisted(() => ({ rows: {} as Record<string, Zeile[]> }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (table: string) => rows[table] || [],
  cacheFilter: (table: string, filter: (row: Zeile) => boolean) => (rows[table] || []).filter(filter),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/userSettingsCache", () => ({}));
import {
  einheitAngebot,
  istImAngebot,
} from "../../supabase/functions/_shared/einheit-angebot";
import { getObjekteImAngebot, getObjekte, mitAllenEinheiten, objektImAngebot } from "@/lib/objekteStore";
import { einheitImAngebot, weitereEinheiten } from "@/lib/objektKennzahlen";
import { angebotsBelegung } from "@/lib/einheitBelegung";

/*
 * Christians Regel vom 23.09.2026: Im CRM angeboten wird nur, was in
 * Investagon online und nicht verkauft ist. Verkaufte und nicht angebotene
 * Einheiten verschwinden aus Objektuebersicht, Objektseite und allem, womit
 * ein Partner anbietet, bleiben aber im Kundenprofil und werden nie
 * geloescht.
 */

describe("Die Einheitenregel (gemeinsam für Import und Anzeige)", () => {
  it("liest die dokumentierten Werte von Investagon", () => {
    expect(einheitAngebot({ visibility: 1, active: 1 })).toBe("angeboten");
    expect(einheitAngebot({ visibility: 1, active: 6 })).toBe("angeboten");
    expect(einheitAngebot({ visibility: -1, active: 1 })).toBe("offline");
    expect(einheitAngebot({ visibility: 0, active: 1 })).toBe("pruefung");
    expect(einheitAngebot({ visibility: 1, active: 1, draft: 1 })).toBe("entwurf");
    expect(einheitAngebot({ visibility: 1, active: 1, draft: true })).toBe("entwurf");
    expect(einheitAngebot({ visibility: "-1", active: "1" })).toBe("offline");
  });

  it("stellt Verkauft vor alles andere, auch wenn die Einheit zugleich offline ist", () => {
    expect(einheitAngebot({ visibility: 1, active: 0 })).toBe("verkauft");
    expect(einheitAngebot({ visibility: -1, active: 0 })).toBe("verkauft");
    expect(einheitAngebot({ visibility: 0, active: "0", draft: 1 })).toBe("verkauft");
  });

  it("macht aus fehlenden Angaben nie eine Ausblendung", () => {
    expect(einheitAngebot(undefined)).toBe("unbekannt");
    expect(einheitAngebot({})).toBe("unbekannt");
    expect(einheitAngebot({ visibility: null, active: null })).toBe("unbekannt");
    expect(einheitAngebot({ visibility: 2 })).toBe("unbekannt");
    expect(einheitAngebot({ draft: 0, draft2: 1 })).toBe("unbekannt");
    expect(istImAngebot("frei", undefined)).toBe(true);
    expect(istImAngebot("frei", {})).toBe(true);
  });

  it("nimmt im CRM verkaufte Einheiten heraus, auch ohne Investagon", () => {
    expect(istImAngebot("verkauft", undefined)).toBe(false);
    expect(istImAngebot("Verkauft", { visibility: 1, active: 1 })).toBe(false);
    expect(istImAngebot("reserviert", undefined)).toBe(true);
  });

  it("nimmt heraus, was Investagon verkauft, offline, in Überprüfung oder als Entwurf führt", () => {
    for (const roh of [
      { visibility: 1, active: 0 },
      { visibility: -1, active: 1 },
      { visibility: 0, active: 1 },
      { visibility: 1, active: 1, draft: 1 },
    ]) {
      expect(istImAngebot("frei", roh)).toBe(false);
    }
    expect(istImAngebot("frei", { visibility: 1, active: 1 })).toBe(true);
    // Reserviert in Investagon bleibt angeboten, nur eben als reserviert.
    expect(istImAngebot("reserviert", { visibility: 1, active: 6 })).toBe(true);
  });
});

function ladeBestand() {
  rows.objekte = [{ id: "o1", titel: "Brandenburgische Straße 5-9" }, { id: "o2", titel: "Ausverkauft" }];
  rows.wohnungen = [
    { id: "frei", objekt_id: "o1", we_nr: "1", status: "frei", meta: { investagonRaw: { visibility: 1, active: 1 } } },
    { id: "pruefung", objekt_id: "o1", we_nr: "2", status: "frei", meta: { investagonRaw: { visibility: 0, active: 1 } } },
    { id: "iv-verkauft", objekt_id: "o1", we_nr: "3", status: "reserviert", kunde_id: "k1", meta: { investagonRaw: { visibility: 1, active: 0 } } },
    { id: "crm-verkauft", objekt_id: "o1", we_nr: "4", status: "verkauft", meta: {} },
    { id: "von-hand", objekt_id: "o1", we_nr: "5", status: "reserviert", meta: {} },
    { id: "weg1", objekt_id: "o2", we_nr: "1", status: "verkauft", meta: {} },
    { id: "weg2", objekt_id: "o2", we_nr: "2", status: "verkauft", meta: {} },
  ];
  rows.objekt_bilder = [];
  rows.objekt_dokumente = [];
  rows.wohnungs_bilder = [];
  rows.wohnungs_dokumente = [];
}

describe("Die Angebotssicht im Store", () => {
  it("kuerzt die Einheiten auf das Angebot und hebt den Rest getrennt auf", () => {
    ladeBestand();
    const [o1] = getObjekteImAngebot();
    expect(o1.wohnungen.map((w) => w.id)).toEqual(["frei", "von-hand"]);
    expect(o1.wohnungenNichtImAngebot?.map((w) => w.id)).toEqual(["pruefung", "iv-verkauft", "crm-verkauft"]);
  });

  it("laesst getObjekte unangetastet, das Kundenprofil sieht den Kauf weiter", () => {
    ladeBestand();
    const [o1] = getObjekte();
    expect(o1.wohnungen).toHaveLength(5);
    expect(o1.wohnungenNichtImAngebot).toBeUndefined();
  });

  it("loescht beim Speichern nichts: die herausgenommenen Einheiten kommen wieder dazu", () => {
    ladeBestand();
    const [sicht] = getObjekteImAngebot();
    const gespeichert = mitAllenEinheiten(sicht);
    expect(gespeichert.wohnungen.map((w) => w.id).sort()).toEqual(
      ["crm-verkauft", "frei", "iv-verkauft", "pruefung", "von-hand"],
    );
    expect(gespeichert).not.toHaveProperty("wohnungenNichtImAngebot");
  });

  it("verdoppelt keine Einheit, die in beiden Listen steht", () => {
    ladeBestand();
    const [o1] = getObjekte();
    const sicht = objektImAngebot(o1);
    const doppelt = { ...sicht, wohnungen: [...sicht.wohnungen, ...sicht.wohnungenNichtImAngebot!] };
    expect(mitAllenEinheiten(doppelt).wohnungen).toHaveLength(5);
  });

  it("gibt ein vollstaendiges Objekt unveraendert weiter", () => {
    ladeBestand();
    const [o1] = getObjekte();
    expect(mitAllenEinheiten(o1).wohnungen).toHaveLength(5);
  });

  it("zeigt in der Liste der weiteren Einheiten und beim Exposé nur das Angebot", () => {
    ladeBestand();
    const [o1] = getObjekte();
    expect(weitereEinheiten(o1.wohnungen).map((w) => w.id)).toEqual(["frei", "von-hand"]);
    expect(o1.wohnungen.filter(einheitImAngebot)).toHaveLength(2);
  });
});

describe("Grau und Aufdruck in der Objektliste", () => {
  it("haelt ein ausverkauftes Objekt grau, auch wenn keine Einheit mehr in der Liste steht", () => {
    ladeBestand();
    const o2 = getObjekteImAngebot()[1];
    expect(o2.wohnungen).toHaveLength(0);
    const b = angebotsBelegung(o2.wohnungen, o2.wohnungenNichtImAngebot);
    expect(b.vollBelegt).toBe(true);
    expect(b.aufdruck).toBe("Verkauft");
  });

  it("nennt ein Objekt ohne Angebot, das nicht verkauft ist, nicht im Angebot", () => {
    const b = angebotsBelegung([], [{ status: "frei" }, { status: "verkauft" }]);
    expect(b.vollBelegt).toBe(true);
    expect(b.aufdruck).toBe("Nicht im Angebot");
  });

  it("laesst ein Objekt ohne jede Einheit oben, es ist unfertig und nicht ausverkauft", () => {
    expect(angebotsBelegung([], []).vollBelegt).toBe(false);
  });

  it("zaehlt bei vorhandenem Angebot wie bisher", () => {
    const b = angebotsBelegung([{ status: "frei" }, { status: "reserviert" }], [{ status: "verkauft" }]);
    expect(b).toMatchObject({ frei: 1, belegt: 1, gesamt: 2, vollBelegt: false });
  });
});
