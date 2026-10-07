/**
 * Ausgeblendete und fremde Exklusivobjekte für Vertriebspartner (05.10.2026):
 * Kennung vor Name, Rückfall Name nur ohne Kennung, und dieselbe Regel in
 * Suche, Direktlink, Kundenlink und Kundenansicht.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { einheitExklusivSichtbar, objektAdresseGesperrt, objektExklusivSichtbar, objektSichtbarFuer } from "./objektZugang";
import {
  EXKLUSIV_KENNUNG_SCHLUESSEL,
  ausgeschlosseneEinheiten,
  exklusivKennungenFuerNamen,
  objektFuerBetrachter,
  objektSichtAusZeile,
} from "../../supabase/functions/_shared/objekt-zugang.ts";
import type { ObjektData } from "./objekteStore";
import { wohnungsAuswahl } from "../../supabase/functions/get-kundenansicht/antwort.ts";

const lies = (pfad: string) => readFileSync(join(resolve(__dirname, "../.."), pfad), "utf8");

const ICH = "11111111-1111-1111-1111-111111111111";
const ANDERER = "22222222-2222-2222-2222-222222222222";
const OBJ = "33333333-3333-3333-3333-333333333333";
const WE = "44444444-4444-4444-4444-444444444444";
const vp = { rolle: "vertriebspartner", benutzerId: ICH, name: "Max Muster" };

const objekt = (o: Partial<ObjektData> = {}) =>
  ({ id: OBJ, sichtbar: true, exklusivPartner: [], meta: {}, wohnungen: [], ...o }) as unknown as ObjektData;

describe("Exklusivpartner am Objekt", () => {
  it("ohne Kennung zählt wie bisher der Name", () => {
    expect(objektExklusivSichtbar(objekt({ exklusivPartner: ["Max Muster"] }), vp)).toBe(true);
    expect(objektExklusivSichtbar(objekt({ exklusivPartner: ["Erika Muster"] }), vp)).toBe(false);
  });

  it("mit Kennung zählt nur die Kennung, ein gleicher Name reicht nicht", () => {
    const o = objekt({ exklusivPartner: ["Max Muster"], meta: { [EXKLUSIV_KENNUNG_SCHLUESSEL]: { "Max Muster": ANDERER } } });
    expect(objektExklusivSichtbar(o, vp)).toBe(false);
    expect(objektExklusivSichtbar(o, { ...vp, benutzerId: ANDERER, name: "Umbenannt" })).toBe(true);
  });

  it("Admin, Inhaber und Objektpartner sehen jedes Objekt", () => {
    for (const rolle of ["admin", "inhaber", "objektpartner"]) {
      expect(objektSichtbarFuer(objekt({ sichtbar: false, exklusivPartner: ["Jemand"] }), { rolle })).toBe(true);
    }
  });

  it("ausgeblendet sieht der Vertriebspartner nicht", () => {
    expect(objektSichtbarFuer(objekt({ sichtbar: false }), vp)).toBe(false);
    expect(objektSichtbarFuer(objekt(), vp)).toBe(true);
  });

  it("Einheiten über die Kennung", () => {
    expect(einheitExklusivSichtbar({ exklusivNutzer: [ANDERER] }, vp)).toBe(false);
    expect(einheitExklusivSichtbar({ exklusivNutzer: [ICH] }, vp)).toBe(true);
    expect(einheitExklusivSichtbar({ exklusivNutzer: [] }, vp)).toBe(true);
  });
});

describe("Kennungen beim Speichern", () => {
  const profile = [{ id: ICH, name: "Max Muster" }, { id: ANDERER, name: "Erika" }, { id: "x", name: "Doppelt" }, { id: "y", name: "Doppelt" }];

  it("ergänzt eindeutige Namen, lässt doppelte und unbekannte als Rückfall", () => {
    expect(exklusivKennungenFuerNamen(["Max Muster", "Doppelt", "Unbekannt"], {}, profile)).toEqual({ "Max Muster": ICH });
  });

  it("behält gespeicherte Kennungen, solange der Name eingetragen ist", () => {
    expect(exklusivKennungenFuerNamen(["Max Muster"], { "Max Muster": ANDERER, Weg: ICH }, profile)).toEqual({ "Max Muster": ANDERER });
  });

  it("saveObjekt schreibt die Kennungen mit, die Namen bleiben", () => {
    const q = lies("src/lib/objekteStore.ts");
    expect(q).toContain('mitExklusivKennungen(mitAllenEinheiten(eingabe), cacheGet("profiles"))');
  });
});

describe("Direktlink für Vertriebspartner", () => {
  const finde = (o: ObjektData) => (id: string) => (id === OBJ ? o : undefined);

  it("sperrt ausgeblendete und fremde Exklusivobjekte auf jeder Unterseite", () => {
    for (const pfad of [`/objekte/${OBJ}`, `/objekte/${OBJ}/verwaltung`, `/objekte/${OBJ}/einheiten/${WE}`, `/objekte/${OBJ}/expose`]) {
      expect(objektAdresseGesperrt(pfad, vp, finde(objekt({ sichtbar: false })))).toBe(true);
      expect(objektAdresseGesperrt(pfad, vp, finde(objekt({ exklusivPartner: ["Erika"] })))).toBe(true);
      expect(objektAdresseGesperrt(pfad, vp, finde(objekt()))).toBe(false);
    }
  });

  it("sperrt eine fremd-exklusive Einheit", () => {
    const o = objekt({ wohnungen: [{ id: WE, exklusivNutzer: [ANDERER] }] as never });
    expect(objektAdresseGesperrt(`/objekte/${OBJ}/einheiten/${WE}`, vp, finde(o))).toBe(true);
    expect(objektAdresseGesperrt(`/objekte/${OBJ}`, vp, finde(o))).toBe(false);
  });

  it("prüft dekodierte und groß geschriebene Adressteile, auch für die Vertriebsleitung", () => {
    const o = finde(objekt({ sichtbar: false, wohnungen: [{ id: WE, exklusivNutzer: [ANDERER] }] as never }));
    expect(objektAdresseGesperrt(`/objekte/${encodeURIComponent(OBJ.toUpperCase())}`, vp, o)).toBe(true);
    expect(objektAdresseGesperrt(`/objekte/${OBJ}`, { rolle: "vertriebsleiter", benutzerId: ICH }, o)).toBe(true);
    const nurEinheit = finde(objekt({ wohnungen: [{ id: WE, exklusivNutzer: [ANDERER] }] as never }));
    expect(objektAdresseGesperrt(`/objekte/${OBJ}/einheiten/${WE.toUpperCase()}?x=1`, vp, nurEinheit)).toBe(true);
  });

  it("betrifft andere Rollen, /objekte/neu und unbekannte Objekte nicht", () => {
    const o = finde(objekt({ sichtbar: false }));
    expect(objektAdresseGesperrt(`/objekte/${OBJ}`, { rolle: "admin" }, o)).toBe(false);
    expect(objektAdresseGesperrt("/objekte/neu", vp, o)).toBe(false);
    expect(objektAdresseGesperrt(`/objekte/${ANDERER}`, vp, o)).toBe(false);
  });

  it("AppShell, Objektseiten-Wächter und globale Suche nutzen die Regel", () => {
    expect(lies("src/components/DashboardLayout.tsx")).toContain("!allowed || objekteZu || objektAdresseZu");
    expect(lies("src/components/objektseite/ObjektseiteZugang.tsx")).toContain("if (objektZu) return <Navigate");
    expect(lies("src/components/GlobaleSuche.tsx")).toContain(".filter((o) => objektSichtbarFuer(o, nutzer))");
  });
});

describe("Server: Kundenlink und Kundenansicht", () => {
  it("fremd-exklusive Einheiten fehlen nur in der Verkaufsliste, Struktur und Globalobjekt bleiben vollständig", () => {
    const w = (id: string, exklusivNutzer?: string[]) => ({ id, status: "frei", meta: exklusivNutzer ? { exklusivNutzer } : {} });
    const wohnungen = [w(WE, [ANDERER]), w(OBJ)];
    const aus = ausgeschlosseneEinheiten(wohnungen, [{ rollen: ["vertriebspartner"], benutzerId: ICH }]);
    expect([...aus]).toEqual([WE]);
    expect(ausgeschlosseneEinheiten(wohnungen, [{ rollen: ["vertriebspartner"], benutzerId: ICH }, { rollen: [], benutzerId: ANDERER }]).size).toBe(0);
    expect(ausgeschlosseneEinheiten(wohnungen, []).size).toBe(0);
    const liste = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: {}, wohnungen, kontaktId: null, einstiegId: null, ausgeschlossen: aus });
    expect(liste.sichtbar.map((s) => s.zeile.id)).toEqual([OBJ]);
    const haus = wohnungsAuswahl({ struktur: "globalobjekt", objekt: { global_objekt: true }, wohnungen, kontaktId: null, einstiegId: null, ausgeschlossen: aus });
    expect(haus.sichtbar).toHaveLength(2);
  });

  it("die Datenbankzeile folgt derselben Regel, Kennung vor Name", () => {
    const zeile = { sichtbar: true, exklusiv_partner: ["Max Muster"], meta: { [EXKLUSIV_KENNUNG_SCHLUESSEL]: { "Max Muster": ANDERER } } };
    expect(objektFuerBetrachter(objektSichtAusZeile(zeile), { rollen: ["vertriebspartner"], benutzerId: ICH, name: "Max Muster" })).toBe(false);
    expect(objektFuerBetrachter(objektSichtAusZeile(zeile), { rollen: ["vertriebspartner", "admin"], benutzerId: ICH })).toBe(true);
    expect(objektFuerBetrachter(objektSichtAusZeile({ sichtbar: false }), { rollen: ["vertriebsleiter"] })).toBe(false);
  });

  it("send-kunden-expose prüft Objekt, Einheit und Auswahl", () => {
    const q = lies("supabase/functions/send-kunden-expose/index.ts");
    expect(q).toContain("objektFuerBetrachter(objektSichtAusZeile(objekt as Record<string, unknown>), betrachter)");
    expect(q.match(/einheitExklusivFrei\(/g)?.length).toBe(2);
  });

  it("get-kundenansicht prüft die Vorschau und übernimmt die Kundensprache", () => {
    const q = lies("supabase/functions/get-kundenansicht/index.ts");
    expect(q).toContain("objektFuerBetrachter(objektSichtAusZeile(objekt as Record<string, unknown>), vorschau)");
    expect(q).toContain('betrachter.art === "vorschau" ? [betrachter.zugang] : await linkBetrachter(db, betrachter)');
    expect(q).toContain("sprache = spracheAusMeta(kontakt.meta);");
    expect(lies("src/pages/KundenansichtVorschau.tsx")).toContain("<SeitenSpracheProvider sprache={sprache}>");
  });
});
