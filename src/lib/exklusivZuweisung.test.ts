import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [] }));
vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));

const { exklusivKandidaten, exklusivKennungenInMeta, exklusivMeldungen, exklusivStand, EXKLUSIV_KENNUNG_SCHLUESSEL } = await import("./exklusivZuweisung");
const { objektFuerBetrachter, einheitExklusivFrei } = await import("../../supabase/functions/_shared/objekt-zugang.ts");

const nutzer = [
  { id: "u-zoe", name: "Zoe Vertrieb", rollen: ["vertriebspartner"] },
  { id: "u-ali", name: "Ali Leitung", rollen: ["kunde", "vertriebsleiter"] },
  { id: "u-bo", name: "Bo Backoffice", rollen: ["backoffice"] },
  { id: "u-ad", name: "Ada Admin", rollen: ["admin"] },
  { id: "u-ge", name: "Gesperrt Gerd", rollen: ["vertriebspartner"] },
  { id: "u-leer", name: "  ", rollen: ["vertriebspartner"] },
];

describe("Exklusive Freischaltung: wer zur Auswahl steht", () => {
  it("nur angelegte, nicht gesperrte Vertriebspartner, Vertriebsleiter und Admins, nach Name", () => {
    expect(exklusivKandidaten(nutzer, new Set(["u-ge"]))).toEqual([
      { id: "u-ad", name: "Ada Admin", rolle: "admin" },
      { id: "u-ali", name: "Ali Leitung", rolle: "vertriebsleiter" },
      { id: "u-zoe", name: "Zoe Vertrieb", rolle: "vertriebspartner" },
    ]);
  });
});

describe("Exklusive Freischaltung: Speichern und Wirkung", () => {
  it("schreibt die Kennungen nur für eingetragene Namen, ohne Auswahl fällt der Schlüssel weg", () => {
    const meta = exklusivKennungenInMeta({ x: 1, [EXKLUSIV_KENNUNG_SCHLUESSEL]: { Alt: "u-alt" } }, ["Zoe Vertrieb"], { "Zoe Vertrieb": "u-zoe", Weg: "u-weg" });
    expect(meta).toEqual({ x: 1, [EXKLUSIV_KENNUNG_SCHLUESSEL]: { "Zoe Vertrieb": "u-zoe" } });
    expect(exklusivKennungenInMeta({ x: 1, [EXKLUSIV_KENNUNG_SCHLUESSEL]: { A: "b" } }, [], {})).toEqual({ x: 1 });
  });

  it("ein exklusives Objekt sieht nur der Zugewiesene, dazu Admin, Inhaber und Objektpartner", () => {
    const objekt = {
      sichtbar: true,
      exklusivPartner: ["Zoe Vertrieb"],
      meta: exklusivKennungenInMeta({}, ["Zoe Vertrieb"], { "Zoe Vertrieb": "u-zoe" }),
    };
    expect(objektFuerBetrachter(objekt, { rollen: ["vertriebspartner"], benutzerId: "u-zoe" })).toBe(true);
    // Gleicher Name, andere Person: Die Kennung entscheidet.
    expect(objektFuerBetrachter(objekt, { rollen: ["vertriebspartner"], benutzerId: "u-andere", name: "Zoe Vertrieb" })).toBe(false);
    expect(objektFuerBetrachter(objekt, { rollen: ["vertriebsleiter"], benutzerId: "u-ali" })).toBe(false);
    for (const r of ["admin", "inhaber", "objektpartner"]) expect(objektFuerBetrachter(objekt, { rollen: [r], benutzerId: "x" })).toBe(true);
  });

  it("eine exklusive Einheit sieht nur der Zugewiesene", () => {
    expect(einheitExklusivFrei(["u-ali"], { rollen: ["vertriebsleiter"], benutzerId: "u-ali" })).toBe(true);
    expect(einheitExklusivFrei(["u-ali"], { rollen: ["vertriebspartner"], benutzerId: "u-zoe" })).toBe(false);
    expect(einheitExklusivFrei(["u-ali"], { rollen: ["inhaber"], benutzerId: "u-chef" })).toBe(true);
  });
});

describe("Exklusive Freischaltung: Glocke", () => {
  const objekt = { id: "o-1", titel: "Brückstraße 12" };
  const rolle = (id: string) => (id === "u-ali" ? "vertriebsleiter" : "vertriebspartner");

  it("meldet nur neu Zugewiesene, für Objekt und Einheit, mit Rolle für die Glocke", () => {
    const vorher = exklusivStand({ meta: { [EXKLUSIV_KENNUNG_SCHLUESSEL]: { Zoe: "u-zoe" } }, wohnungen: [{ weNr: "3", exklusivNutzer: ["u-zoe"] }] });
    const nachher = exklusivStand({
      meta: { [EXKLUSIV_KENNUNG_SCHLUESSEL]: { Zoe: "u-zoe", Ali: "u-ali" } },
      wohnungen: [{ weNr: "3", exklusivNutzer: ["u-zoe", "u-ali"] }, { weNr: "4", exklusivNutzer: [] }],
    });
    expect(exklusivMeldungen(objekt, vorher, nachher, rolle)).toEqual([
      { benutzer_id: "u-ali", titel: "Objekt exklusiv zugewiesen", nachricht: "Dir wurde das Objekt „Brückstraße 12“ exklusiv zugewiesen.", link: "/objekte/o-1", ziel_rolle: "vertriebsleiter" },
      { benutzer_id: "u-ali", titel: "Wohnung exklusiv zugewiesen", nachricht: "Dir wurde Wohnung 3 im Objekt „Brückstraße 12“ exklusiv zugewiesen.", link: "/objekte/o-1", ziel_rolle: "vertriebsleiter" },
    ]);
  });

  it("ohne Änderung keine Meldung, neues Objekt meldet alle", () => {
    const stand = exklusivStand({ meta: { [EXKLUSIV_KENNUNG_SCHLUESSEL]: { Zoe: "u-zoe" } }, wohnungen: [] });
    expect(exklusivMeldungen(objekt, stand, stand, rolle)).toEqual([]);
    expect(exklusivMeldungen(objekt, exklusivStand(undefined), stand, rolle)).toHaveLength(1);
  });
});
