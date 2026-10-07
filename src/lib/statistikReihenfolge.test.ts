import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import { AUSSERHALB_TRICHTER, TRICHTER_STUFEN, normalizeStufe } from "@/lib/statistikTrichter";

/**
 * Die Statistik zählt in derselben Reihenfolge, in der die Pipeline führt.
 *
 * Anlass: `Statistiken.tsx` hielt eine eigene, von Hand gepflegte Liste, die
 * die Bonitätsunterlagen noch VOR die Objektauswahl stellte. Die Pipeline
 * führt sie seit dem 06.08.2026 HINTER die Reservierung. Ein Kunde in
 * "Objektauswahl" galt in der Statistik damit als "Bonität erreicht", im
 * Kundenprofil nicht. Der Geschäftsführer hat entschieden: Die Pipeline hat
 * recht, die Statistik zieht nach.
 *
 * Dieselbe Falle steht im Kopf von `bundeslandGrEst.ts` beschrieben: Zwei
 * Listen derselben Sache laufen auseinander, und niemand merkt es, weil beide
 * für sich plausibel aussehen. Deshalb prüft dieser Test nicht nur die eine
 * bekannte Vertauschung, sondern jedes Paar.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

const statistiken = lies("src/pages/Statistiken.tsx");
const funnelReport = lies("src/components/auswertungen/FunnelReport.tsx");
const kundenprofilseite = lies("src/pages/Kundenprofilseite.tsx");

/** Position einer Stufe in der maßgeblichen Liste. */
const pipelinePos = (key: string) => PIPELINE_STUFEN.findIndex((s) => s.key === key);

/**
 * Prüft eine abgeleitete Liste gegen die maßgebliche: Keine Stufe darf hier
 * vor einer anderen stehen, die in `PIPELINE_STUFEN` dahinter kommt.
 *
 * Bewusst jedes Paar und nicht nur benachbarte: Eine Liste kann paarweise
 * benachbart stimmen und trotzdem über eine ausgelassene Stufe hinweg falsch
 * sein.
 */
function pruefeReihenfolge(liste: string[], name: string) {
  for (let i = 0; i < liste.length; i++) {
    for (let j = i + 1; j < liste.length; j++) {
      const vorne = pipelinePos(liste[i]);
      const hinten = pipelinePos(liste[j]);
      expect(vorne, `${liste[i]} kennt ${name}, aber nicht die Pipeline`).toBeGreaterThanOrEqual(0);
      expect(hinten, `${liste[j]} kennt ${name}, aber nicht die Pipeline`).toBeGreaterThanOrEqual(0);
      expect(
        vorne,
        `${name}: "${liste[i]}" steht vor "${liste[j]}", in der Pipeline aber dahinter`,
      ).toBeLessThan(hinten);
    }
  }
}

describe("Der Trichter der Statistik folgt der Pipeline", () => {
  it("hält jedes Stufenpaar in derselben Richtung wie PIPELINE_STUFEN", () => {
    pruefeReihenfolge(TRICHTER_STUFEN, "TRICHTER_STUFEN");
  });

  it("führt Objektauswahl und Reservierung vor der Bonität", () => {
    // Der Kern des Widerspruchs, ausdrücklich benannt, damit der Grund im
    // Fehlertext steht und nicht nur in der Schleife darüber.
    const pos = (k: string) => TRICHTER_STUFEN.indexOf(k);
    expect(pos("objektauswahl")).toBeLessThan(pos("bonitaetsunterlagen"));
    expect(pos("reservierung")).toBeLessThan(pos("bonitaetsunterlagen"));
    expect(pos("selbstauskunft")).toBeLessThan(pos("objektauswahl"));
  });

  it("lässt keine Stufe aus, die im Trichter einen Balken bekommt", () => {
    // Was hier fehlt, fällt in der Statistik still auf "neuer_lead" zurück.
    const erwartet = PIPELINE_STUFEN.map((s) => s.key as string).filter(
      (key) => normalizeStufe(key) === key && !AUSSERHALB_TRICHTER.includes(key),
    );
    expect(TRICHTER_STUFEN).toEqual(erwartet);
  });

  it("hält die Zustände ohne Abschlusserwartung heraus", () => {
    for (const stufe of AUSSERHALB_TRICHTER) {
      expect(TRICHTER_STUFEN).not.toContain(stufe);
    }
  });

  it("führt keine Legacy-Schlüssel als eigenen Balken", () => {
    for (const alt of ["zugewiesen", "kontaktversuche", "vermoegensaufbau"]) {
      expect(TRICHTER_STUFEN).not.toContain(alt);
    }
  });
});

describe("Keine zweite Liste neben der maßgeblichen", () => {
  it("hält in Statistiken.tsx keine eigene Reihenfolge mehr", () => {
    // Genau diese Konstante war der Widerspruch. Sie darf nicht zurückkommen.
    expect(statistiken).not.toMatch(/const\s+PIPELINE_ORDER\s*=\s*\[/);
    expect(statistiken).toContain('TRICHTER_STUFEN, normalizeStufe } from "@/lib/statistikTrichter"');
  });
});

/**
 * Liest eine Stufenliste aus dem Quelltext einer Datei.
 *
 * Der Funnel der Auswertungen fasst Stufen zusammen und lässt welche aus, er
 * kann deshalb nicht einfach `TRICHTER_STUFEN` benutzen. Seine Auswahl ist
 * eine Anzeigefrage, seine Reihenfolge nicht. Also wird sie hier gelesen und
 * gegen die maßgebliche Liste gehalten.
 */
function leseListe(quelle: string, name: string): string[] {
  const treffer = quelle.match(new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`));
  expect(treffer, `${name} nicht im Quelltext gefunden`).toBeTruthy();
  return Array.from(treffer![1].matchAll(/"([a-z_]+)"/g)).map((m) => m[1]);
}

describe("Der Funnel der Auswertungen folgt derselben Reihenfolge", () => {
  it("führt seine Etappen in der Richtung der Pipeline", () => {
    const etappen = leseListe(funnelReport, "FUNNEL_STUFEN");
    expect(etappen.length).toBeGreaterThan(5);
    pruefeReihenfolge(etappen, "FUNNEL_STUFEN");
  });

  it("kennt die Bonität erst hinter der Reservierung", () => {
    const etappen = leseListe(funnelReport, "FUNNEL_STUFEN");
    expect(etappen.indexOf("reservierung")).toBeLessThan(etappen.indexOf("bonitaetsunterlagen"));
  });
});

describe("Die Fortschrittsleiste der Kundenprofilseite folgt derselben Reihenfolge", () => {
  it("zeigt dem Kunden die Bonität erst hinter der Reservierung", () => {
    /*
     * Diese Leiste teilt den Notar in zwei Schritte und lässt Stufen aus, sie
     * kann deshalb nicht aus `FORTSCHRITT_STUFEN` abgeleitet werden. Geprüft
     * werden die Stufen, die es in beiden Listen gibt.
     */
    const schritte = leseListe(kundenprofilseite, "PIPELINE_STEPS").filter(
      (key) => pipelinePos(key) >= 0,
    );
    expect(schritte).toContain("objektauswahl");
    expect(schritte).toContain("bonitaetsunterlagen");
    pruefeReihenfolge(schritte, "PIPELINE_STEPS der Kundenprofilseite");
  });
});

describe("Die Controller-Statistik verwendet die kanonischen Stufen", () => {
  it("übernimmt jede normalisierte Stufe genau einmal und bewahrt deren Reihenfolge", async () => {
    const { pipeline } = await import("./statistikController");
    const rows = pipeline([], []).rows.map(r => r.key).filter(k => TRICHTER_STUFEN.includes(k));
    expect(rows).toEqual(TRICHTER_STUFEN);
  });
});
