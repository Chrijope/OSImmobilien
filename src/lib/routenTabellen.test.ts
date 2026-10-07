import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROUTEN_TABELLEN,
  GLOBALE_TABELLEN,
  RAHMEN_TABELLEN,
  VORLADE_ROUTEN,
  KERNROUTEN,
  routenTabellenFuerPfad,
  routenMusterFuerPfad,
  tabellenFuerPfad,
  startPfadErmitteln,
  ladeplanFuerStart,
} from "./routenTabellen";
import { ALLE_CACHE_TABELLEN } from "./dataCache";

/**
 * Waechter fuer das Laden je Route: Jede Route aus App.tsx braucht einen
 * Eintrag in der Karte, sonst laedt der Cache fuer sie nichts und die Seite
 * bleibt leer. Und jede genannte Tabelle muss der Cache kennen, sonst wird
 * eine Abfrage auf eine Tabelle abgesetzt, die es nicht gibt.
 */
const APP_TSX = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const ROUTEN_IN_APP = Array.from(APP_TSX.matchAll(/<Route\s+path="([^"]+)"/g)).map((m) => m[1]);

describe("routenTabellen: Waechter", () => {
  it("findet die Routen in App.tsx", () => {
    expect(ROUTEN_IN_APP.length).toBeGreaterThan(100);
  });

  it("hat fuer jede Route in App.tsx einen Eintrag", () => {
    const fehlend = ROUTEN_IN_APP.filter((pfad) => !(pfad in ROUTEN_TABELLEN));
    expect(fehlend).toEqual([]);
  });

  it("nennt nur Tabellen, die der Cache kennt", () => {
    const bekannt = new Set(ALLE_CACHE_TABELLEN);
    const unbekannt: string[] = [];
    for (const [pfad, tabellen] of Object.entries(ROUTEN_TABELLEN)) {
      for (const t of tabellen) if (!bekannt.has(t)) unbekannt.push(`${pfad}: ${t}`);
    }
    for (const t of [...GLOBALE_TABELLEN, ...RAHMEN_TABELLEN]) if (!bekannt.has(t)) unbekannt.push(`global: ${t}`);
    expect(unbekannt).toEqual([]);
  });

  it("kennt die Kern- und Vorlade-Routen", () => {
    for (const pfad of [...KERNROUTEN, ...VORLADE_ROUTEN]) expect(ROUTEN_TABELLEN[pfad]).toBeDefined();
  });
});

describe("routenTabellen: Zuordnung", () => {
  it("findet das Muster zu einem konkreten Pfad", () => {
    expect(routenMusterFuerPfad("/kunden/abc-123")).toBe("/kunden/:id");
    expect(routenMusterFuerPfad("/objekte/7/einheiten/3/expose")).toBe("/objekte/:id/einheiten/:weId/expose");
    expect(routenMusterFuerPfad("/gibt-es-nicht")).toBeNull();
  });

  it("liefert globale plus Routen-Tabellen ohne Doppelte", () => {
    const tabellen = tabellenFuerPfad("/bewerberprozess");
    for (const g of GLOBALE_TABELLEN) expect(tabellen).toContain(g);
    expect(tabellen).toContain("bewerbungen");
    expect(tabellen).not.toContain("kontakte");
    expect(new Set(tabellen).size).toBe(tabellen.length);
  });

  it("bleibt bei unbekanntem Pfad bei den globalen Tabellen", () => {
    expect(tabellenFuerPfad("/gibt-es-nicht")).toEqual([...GLOBALE_TABELLEN]);
  });
});

describe("routenTabellen: Startpfad und Ladeplan", () => {
  it("nimmt nach dem Login das redirect-Ziel oder die Startseite", () => {
    expect(startPfadErmitteln("/login", "?redirect=%2Fpipeline%3Fx%3D1", "admin", null)).toBe("/pipeline");
    expect(startPfadErmitteln("/login", "?redirect=//boese.de", "admin", null)).toBe("/");
    expect(startPfadErmitteln("/login", "", "admin", null)).toBe("/");
  });

  it("stellt auf der Startseite die zuletzt geoeffnete Seite nach", () => {
    expect(startPfadErmitteln("/", "", "admin", "/kontakte?tab=2")).toBe("/kontakte");
    // Ausgeschlossene Seiten werden nicht wiederhergestellt.
    expect(startPfadErmitteln("/", "", "admin", "/login")).toBe("/");
  });

  it("leitet Kunden und Tippgeber in ihren Bereich", () => {
    expect(startPfadErmitteln("/", "", "kunde", null)).toBe("/kunde/stammdaten");
    expect(startPfadErmitteln("/pipeline", "", "tippgeber", null)).toBe("/tippgeber-portal");
  });

  it("plant fuer Vertrieb Startroute sofort, Kernseiten danach, Rest spaeter, ohne Doppelte", () => {
    const plan = ladeplanFuerStart("/bewerberprozess", "vertriebspartner");
    expect(plan.sofort).toEqual(tabellenFuerPfad("/bewerberprozess"));
    const alle = [...plan.sofort, ...plan.danach.flat(), ...plan.spaeter.flat()];
    expect(new Set(alle).size).toBe(alle.length);
    expect(plan.danach.flat()).toContain("kontakte");
    expect(plan.danach.flat()).toContain("investments");
    expect(plan.danach.flat()).toContain("objekte");
    expect(plan.spaeter.flat()).toContain("news");
    expect(plan.spaeter.flat()).not.toContain("kontakte");
  });

  it("haelt in der Kernstufe die Reihenfolge Dashboard, Inbox, Kontakte, Pipeline, Objekte ein", () => {
    // Waechter: die Kernrouten selbst muessen in dieser Reihenfolge stehen ...
    expect(KERNROUTEN).toEqual(["/", "/inbox", "/alle-kontakte", "/pipeline", "/objekte"]);
    // ... und die Kernstufe entspricht genau dieser Reihenfolge, jede Tabelle
    // in der ersten Route, die sie braucht, ohne die der Startroute.
    const start = "/einstellungen";
    const plan = ladeplanFuerStart(start, "vertriebspartner");
    const gesehen = new Set(tabellenFuerPfad(start));
    const erwartet: string[][] = [];
    for (const pfad of KERNROUTEN) {
      const neu = routenTabellenFuerPfad(pfad).filter((t) => !gesehen.has(t));
      neu.forEach((t) => gesehen.add(t));
      if (neu.length > 0) erwartet.push(neu);
    }
    expect(plan.danach).toEqual(erwartet);
    // Die Startroute selbst kommt nicht noch einmal vor.
    const plan2 = ladeplanFuerStart("/pipeline", "vertriebspartner");
    for (const t of tabellenFuerPfad("/pipeline")) expect(plan2.danach.flat()).not.toContain(t);
  });

  it("laedt fuer Kunden und Tippgeber nichts vor", () => {
    expect(ladeplanFuerStart("/kunde/stammdaten", "kunde").danach).toEqual([]);
    expect(ladeplanFuerStart("/kunde/stammdaten", "kunde").spaeter).toEqual([]);
    expect(ladeplanFuerStart("/tippgeber-portal", "tippgeber").danach).toEqual([]);
    expect(ladeplanFuerStart("/tippgeber-portal", "tippgeber").spaeter).toEqual([]);
  });

  it("gibt der HR-Rolle ihre eigenen Kernseiten ohne Pipeline und Objekte", () => {
    const plan = ladeplanFuerStart("/einstellungen", "hr");
    // `finanzierungen` braucht nur die Pipeline, die HR nicht sieht.
    expect(plan.danach.flat()).not.toContain("finanzierungen");
    expect(plan.danach.flat()).toContain("bewerbungen");
  });
});
