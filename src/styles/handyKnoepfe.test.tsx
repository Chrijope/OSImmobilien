/**
 * Wächter über die Knopf-Regeln der Handy-Schicht in `index.css`.
 *
 * Christian am 23.09.2026: Mehrere Agenten meldeten dieselben Fehlerbilder
 * auf dem Handy. Der Schalter wurde zur Pille mit verrutschtem Knopf, der
 * Auswahlkreis zum Oval, das große Foto der Galerie zum 32-Pixel-Streifen,
 * Auswahlkarten mit `role="radio"` so hoch wie breit. Ursache waren vier
 * Regeln, die mehr trafen, als sie sollten:
 *
 * - die 40-Pixel-Regel für Knöpfe (Tap-Targets) schlug jede eigene
 *   `min-h-`-Klasse und machte runde Symbolknöpfe oval,
 * - die Regel für Filter-Pillen traf alles mit `rounded-full`, auch Schalter,
 *   Auswahlkreise und Bildpunkte,
 * - die Karten-Regel für kleine Knöpfe suchte „h-8“ als Teilstring und fand
 *   es in `sm:h-80` der Galerie,
 * - die Regel „Kästchen bleiben quadratisch“ traf auch ganze Auswahlkarten.
 *
 * Geprüft wird mit `matches()` an den echten Komponenten, nicht am Aussehen:
 * jsdom rechnet kein Layout, aber welche Regel auf welches Element passt,
 * entscheidet der Selektor allein. Der Zweck jeder Regel wird mitgeprüft,
 * damit eine künftige Verschärfung sie nicht stillschweigend abschaltet.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { KachelEinzel } from "@/components/bewerberformular/FragebogenBausteine";
import { Galerie } from "@/components/objektseite/Galerie";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/maps/UmgebungsKarte", () => ({ UmgebungsKarte: () => <div>Karte</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** Die Datei ohne Kommentare: In den Kommentaren stehen absichtlich die alten, falschen Selektoren. */
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Alle innersten Regeln der Datei als Selektor und Rumpf. */
const regeln = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selektor: m[1].trim().replace(/\s+/g, " "),
  rumpf: m[2],
}));

function regel(beschreibung: string, passt: (r: { selektor: string; rumpf: string }) => boolean): string {
  const treffer = regeln.filter(passt);
  // Genau eine: Wer die Regel verdoppelt, soll diesen Test mit anpassen.
  expect(treffer, beschreibung).toHaveLength(1);
  return treffer[0].selektor;
}

const tapRegel = regel("40-Pixel-Regel", (r) => r.rumpf.includes("min-height: 40px") && r.selektor.includes('a[role="button"]'));
const pillenRegel = regel("Pillen-Regel", (r) => r.rumpf.includes("padding-left: 0.85rem"));
const kartenRegel = regel("Karten-Regel", (r) => r.selektor.startsWith(".bg-card button"));
const auswahlRegel = regel("Kästchen-Regel", (r) => r.rumpf.includes("aspect-ratio: 1 / 1") && r.selektor.includes('[role="checkbox"]'));

/** Rendert in eine Karte, wie auf den Seiten des CRM. */
function inKarte(ui: ReactElement): HTMLElement {
  const { container } = render(<div className="bg-card">{ui}</div>);
  return container;
}

describe("Knopf-Regeln der Handy-Schicht", () => {
  it("sucht Klassen nicht mehr als Teilstring", () => {
    // [class*="h-8"] traf sm:h-80. Erlaubt bleibt nur die Präfixprüfung
    // [class*=" h-"] mit Leerzeichen, die einen Klassenanfang erkennt.
    for (const s of [tapRegel, pillenRegel, kartenRegel]) {
      expect(s).not.toMatch(/\[class\*="[^ ]/);
    }
  });

  it("lässt den Schalter in Ruhe", () => {
    const schalter = inKarte(<Switch />).querySelector('[role="switch"]')!;
    expect(schalter.matches(tapRegel)).toBe(false);
    expect(schalter.matches(pillenRegel)).toBe(false);
    expect(schalter.matches(kartenRegel)).toBe(false);
  });

  it("lässt den Auswahlkreis rund und das Kästchen quadratisch", () => {
    const ort = inKarte(
      <>
        <RadioGroup defaultValue="a"><RadioGroupItem value="a" /></RadioGroup>
        <Checkbox />
      </>,
    );
    const kreis = ort.querySelector('[role="radio"]')!;
    const kaestchen = ort.querySelector('[role="checkbox"]')!;
    expect(kreis.matches(pillenRegel)).toBe(false);
    expect(kreis.matches(tapRegel)).toBe(false);
    // Zweck der Kästchen-Regel: nicht stauchen, quadratisch halten.
    expect(kreis.matches(auswahlRegel)).toBe(true);
    expect(kaestchen.matches(auswahlRegel)).toBe(true);
  });

  it("macht aus einer Auswahlkarte mit role=radio kein Quadrat", () => {
    const ort = inKarte(
      <KachelEinzel
        labelId="frage"
        frage={{ key: "f", optionen: [{ value: "a", label: "Vollzeit" }, { value: "b", label: "Teilzeit" }] }}
        wert="a"
        onWaehle={() => {}}
      />,
    );
    const karten = ort.querySelectorAll('[role="radio"]');
    expect(karten).toHaveLength(2);
    karten.forEach((karte) => expect(karte.matches(auswahlRegel)).toBe(false));
  });

  it("lässt runde Symbolknöpfe und Bildpunkte rund", () => {
    const ort = inKarte(
      <>
        <Button size="icon" className="h-8 w-8 rounded-full" aria-label="Weiter">+</Button>
        <button type="button" className="h-2 w-2 rounded-full" aria-label="Bild 1" />
      </>,
    );
    ort.querySelectorAll("button").forEach((knopf) => {
      expect(knopf.matches(tapRegel)).toBe(false);
      expect(knopf.matches(pillenRegel)).toBe(false);
      expect(knopf.matches(kartenRegel)).toBe(false);
    });
  });

  it("drückt das große Foto der Galerie nicht auf 32 Pixel", () => {
    // Vorgabe der Galerie ist „h-64 sm:h-80 lg:h-96“, darin steckt „h-8“ und „h-9“.
    const ort = inKarte(
      <Galerie
        bilder={[1, 2].map((i) => ({ id: `b${i}`, url: `https://beispiel.test/${i}.jpg`, alt: "", reihenfolge: i }))}
        adresse="Musterweg 1, 12345 Musterstadt"
        titel="Musterhaus"
      />,
    );
    const grossesFoto = ort.querySelector('[aria-label^="Vollbild öffnen"]')!;
    expect(grossesFoto.className).toContain("sm:h-80");
    expect(grossesFoto.matches(kartenRegel)).toBe(false);
  });

  it("lässt eine eigene Mindesthöhe am Knopf gelten", () => {
    const knopf = inKarte(<button type="button" className="min-h-[44px] rounded-lg px-3">Laden</button>).querySelector("button")!;
    expect(knopf.matches(tapRegel)).toBe(false);
  });

  it("behält den Zweck: 40 Pixel für Knöpfe, 32 für Pillen und kleine Kartenknöpfe", () => {
    const ort = inKarte(
      <>
        <Button data-fall="standard">Speichern</Button>
        <Button size="sm" data-fall="klein">Filter</Button>
        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" data-fall="pille">Alle (12)</button>
        <Button className="rounded-full" data-fall="runder-knopf">Neu anlegen</Button>
      </>,
    );
    const fall = (name: string) => ort.querySelector(`[data-fall="${name}"]`)!;
    expect(fall("standard").matches(tapRegel)).toBe(true);
    expect(fall("klein").matches(kartenRegel)).toBe(true);
    expect(fall("pille").matches(pillenRegel)).toBe(true);
    expect(fall("runder-knopf").matches(pillenRegel)).toBe(true);
  });
});
