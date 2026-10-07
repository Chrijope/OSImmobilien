import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ObjektWohnung } from "@/lib/objekteStore";
import { wohnungsSpalten, wohnungsZeilen } from "./kundenTexte";
import { telefonAnzeige } from "@/lib/phoneUtils";

/*
 * Kundenlink auf dem Handy (Befund vom 24.09.2026): In der Tabelle
 * „Verfügbare Wohnungen“ lagen Kaufpreis und Rendite rechts außerhalb des
 * Bildes, die Spalte „Etage“ war leer, der Ansprechpartner füllte den ersten
 * Bildschirm. jsdom rechnet kein Layout, geprüft werden deshalb die Klassen
 * und die Regeln im Stylesheet.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

function we(id: string, teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return {
    id, weNr: `WE ${id}`, etage: "", lage: "", groesse: 60, zimmer: 2, mieteGesamt: 700, vkGesamt: 250000,
    qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile,
  } as ObjektWohnung;
}

describe("Leere Spalten fallen weg", () => {
  it("blendet „Etage“ aus, wenn keine Wohnung eine Etage hat", () => {
    const spalten = wohnungsSpalten(wohnungsZeilen([we("1"), we("2")], "2026-09-24"));
    expect(spalten.etage).toBe(false);
    expect(spalten.kaufpreis).toBe(true);
    expect(spalten.flaeche).toBe(true);
  });

  it("zeigt „Etage“, sobald eine Wohnung eine hat", () => {
    const spalten = wohnungsSpalten(wohnungsZeilen([we("1"), we("2", { etage: "2. OG" })], "2026-09-24"));
    expect(spalten.etage).toBe(true);
  });

  it("blendet Kaufpreis und Rendite aus, wenn nirgends ein Preis steht", () => {
    const spalten = wohnungsSpalten(wohnungsZeilen([we("1", { vkGesamt: 0 })], "2026-09-24"));
    expect(spalten.kaufpreis).toBe(false);
    expect(spalten.rendite).toBe(false);
  });
});

describe("Unter 640 px Karten statt Tabelle", () => {
  const quelle = lies("src/components/kundenansicht/Hausebene.tsx");

  it("die Tabelle erscheint erst ab 640 px", () => {
    expect(quelle).toMatch(/className="hidden overflow-x-auto sm:block" data-testid="kunden-wohnungen-tabelle"/);
  });

  it("die Karten nur darunter, jede als ganzer Knopf mit mindestens 44 px", () => {
    expect(quelle).toMatch(/className="space-y-2 sm:hidden" data-testid="kunden-wohnungen-karten"/);
    expect(quelle).toMatch(/data-testid=\{`karte-\$\{z\.id\}`\}/);
    expect(quelle).toContain("min-h-[44px]");
  });
});

describe("Ansprechpartner", () => {
  it("gruppiert Mobilnummern für die Anzeige", () => {
    expect(telefonAnzeige("+4917612345678")).toBe("+49 176 1234 5678");
    expect(telefonAnzeige("017612345678")).toBe("+49 176 1234 5678");
  });

  it("setzt bei Festnetz nur die Ländervorwahl ab und lässt gepflegte Lücken stehen", () => {
    expect(telefonAnzeige("+4989123456")).toBe("+49 89123456");
    expect(telefonAnzeige("+49 911 123456")).toBe("+49 911 123456");
    expect(telefonAnzeige("")).toBe("");
  });

  it("der Wähl-Link bleibt ohne Leerzeichen", () => {
    const quelle = lies("src/components/kundenansicht/Partnerkasten.tsx");
    expect(quelle).toContain('href={`tel:${person.telefon.replace(/\\s+/g, "")}`}');
    expect(quelle).toContain("telefonAnzeige(person.telefon)");
  });

  it("wird auf dem Handy kompakt, die Wege stehen nebeneinander und bleiben 44 px hoch", () => {
    const css = lies("src/components/kundenansicht/kundenansicht.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const handy = css.slice(css.indexOf("@media (max-width: 639px)"));
    expect(handy).toMatch(/\.kp-wege\s*\{[^}]*flex-direction:\s*row/);
    expect(handy).toMatch(/\.kp-wege \.btn\s*\{[^}]*min-height:\s*44px/);
    expect(handy).toMatch(/\.kp-bild\s*\{[^}]*width:\s*40px/);
  });

  it("Info-Symbole haben mindestens 32 px Tippfläche", () => {
    const css = lies("src/components/kundenansicht/kundenansicht.css");
    expect(css).toMatch(/button\[aria-label="Erklärung"\]\s*\{[^}]*min-width:\s*32px;[^}]*min-height:\s*32px/);
  });
});
