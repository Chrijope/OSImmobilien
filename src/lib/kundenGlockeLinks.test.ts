import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { matchPath } from "react-router-dom";

/**
 * Wächter: Keine Kunden-Glocke verlinkt auf eine Adresse, die es im Portal
 * nicht gibt.
 *
 * Anlass (25.09.2026): Drei Kunden-Glocken zeigten auf `/profil`. Die Route
 * gibt es nicht, der Klick landete auf der Startseite. Geprüft wird zweifach:
 *
 * 1. Jede Kunden-Glocke aus `bellNotifications.ts` wird ausgelöst und ihr Link
 *    gegen die Routen in `App.tsx` und die Freigaben der Rolle Kunde gelegt.
 * 2. Jede Portaladresse `/kunde/…`, die irgendwo im Code als Text steht (auch
 *    in Edge Functions, etwa den Erinnerungen), muss eine Route in `App.tsx`
 *    sein. Und kein Link darf mehr `/profil` lauten.
 */

const WURZEL = resolve(__dirname, "../..");
const APP_TSX = readFileSync(resolve(WURZEL, "src/App.tsx"), "utf8");
// Ohne die Auffangroute `*`: Sie zeigt die Seite „nicht gefunden" und passt auf alles.
const ROUTEN = Array.from(APP_TSX.matchAll(/<Route\s+path="([^"]+)"/g))
  .map((m) => m[1])
  .filter((muster) => muster !== "*");

function istRoute(link: string): boolean {
  const pfad = link.split("?")[0].split("#")[0];
  return ROUTEN.some((muster) => matchPath({ path: muster, end: true }, pfad) !== null);
}

const KONTAKT = "11111111-1111-1111-1111-111111111111";
const INVESTMENT = "33333333-3333-3333-3333-333333333333";

const cache = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock("./dataCache", () => ({
  cacheGet: (tabelle: string) =>
    tabelle === "kontakte" ? [{ id: KONTAKT, meta: { authUserId: "auth-kunde" } }] : [],
  cacheInsert: cache.insert,
}));
vi.mock("./dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_s: string, standard: unknown) => standard,
  localSet: vi.fn(),
}));
vi.mock("./pushNotifications", () => ({ showPushNotification: vi.fn() }));
vi.mock("./userSettingsCache", () => ({ getUserSetting: (_k: string, standard: unknown) => standard }));
vi.mock("./currentUser", () => ({ getCurrentUserId: () => "mitarbeiter-1" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

import * as glocken from "./bellNotifications";
import { isUrlAllowedForRole } from "./sidebarPermissions";

/** Alle Links, die die Kunden-Glocken schreiben. */
function kundenLinks(): string[] {
  cache.insert.mockClear();
  const kundenFunktionen = Object.entries(glocken).filter(
    ([name, wert]) => /^notifyKunde.+/.test(name) && typeof wert === "function",
  );
  for (const [name, funktion] of kundenFunktionen) {
    if (name === "notifyKundePipelineStufe") {
      for (const stufe of ["reservierung", "finanzierung", "notar", "faelligkeit", "abgeschlossen"]) {
        (funktion as (...a: unknown[]) => void)(KONTAKT, stufe);
      }
      continue;
    }
    // Zweites und drittes Argument: Dokumentname, Datum, Uhrzeit oder Investment.
    (funktion as (...a: unknown[]) => void)(KONTAKT, "Dokument", "10:00");
    (funktion as (...a: unknown[]) => void)(KONTAKT, INVESTMENT);
  }
  return cache.insert.mock.calls.map((c) => (c[1] as { link: string }).link);
}

describe("Kunden-Glocken verlinken nur auf vorhandene Portalseiten", () => {
  beforeEach(() => cache.insert.mockClear());

  it("findet die Routen in App.tsx", () => {
    expect(ROUTEN.length).toBeGreaterThan(100);
    expect(ROUTEN).toContain("/kunde/investments");
  });

  it("löst jede Kunden-Glocke aus und bekommt Links zurück", () => {
    const links = kundenLinks();
    // Acht Glockenarten, fünf Stufen; jede Art mindestens einmal.
    expect(links.length).toBeGreaterThanOrEqual(8);
    expect(links.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
  });

  it("jeder Link ist eine Route in App.tsx", () => {
    const tot = kundenLinks().filter((l) => !istRoute(l));
    expect(tot).toEqual([]);
  });

  it("jeder Link ist für die Rolle Kunde freigegeben", () => {
    const gesperrt = kundenLinks().filter((l) => !isUrlAllowedForRole(l, "kunde"));
    expect(gesperrt).toEqual([]);
  });

  it("Bonität und Selbstauskunft springen zum Abschnitt, mit Investment wenn bekannt", () => {
    glocken.notifyKundeSelbstauskunft(KONTAKT, INVESTMENT);
    glocken.notifyKundeBonitaetFreigegeben(KONTAKT);
    const [mitInvestment, ohne] = cache.insert.mock.calls.map((c) => (c[1] as { link: string }).link);
    expect(mitInvestment).toBe(`/kunde/investments?tab=moreimmo&inv=${INVESTMENT}&highlight=bonitaetsunterlagen`);
    expect(ohne).toBe("/kunde/investments?tab=moreimmo&highlight=bonitaetsunterlagen");
  });

  it("das Empfehlungsprogramm führt zu den Empfehlungen", () => {
    glocken.notifyKundeEmpfehlungsprogramm(KONTAKT);
    expect((cache.insert.mock.calls[0][1] as { link: string }).link).toBe("/kunde/empfehlungen");
  });
});

/** Alle Quelldateien unter `ordner`, ohne Tests. */
function quellDateien(ordner: string): string[] {
  const ergebnis: string[] = [];
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) {
      if (name === "node_modules") continue;
      ergebnis.push(...quellDateien(pfad));
    } else if (/\.(ts|tsx)$/.test(name) && !/(\.test\.|_test\.)/.test(name)) {
      ergebnis.push(pfad);
    }
  }
  return ergebnis;
}

describe("Portaladressen im ganzen Code", () => {
  const dateien = [
    ...quellDateien(resolve(WURZEL, "src")),
    ...quellDateien(resolve(WURZEL, "supabase/functions")),
  ];

  it("jede Adresse /kunde/… im Code ist eine Route in App.tsx", () => {
    const tot: string[] = [];
    for (const datei of dateien) {
      const text = readFileSync(datei, "utf8");
      for (const m of text.matchAll(/["'`](\/kunde\/[a-z0-9-]+)/g)) {
        if (!istRoute(m[1]) && !istRoute(`${m[1]}/x`)) tot.push(`${datei.replace(WURZEL, "")}: ${m[1]}`);
      }
    }
    expect(tot).toEqual([]);
  });

  it("kein Link zeigt mehr auf /profil", () => {
    const treffer: string[] = [];
    for (const datei of dateien) {
      const text = readFileSync(datei, "utf8");
      if (/link\s*:\s*["'`]\/profil["'`?#]/.test(text)) treffer.push(datei.replace(WURZEL, ""));
    }
    expect(treffer).toEqual([]);
  });
});
