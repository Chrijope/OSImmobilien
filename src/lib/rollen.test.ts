import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  aktuelleRollposition,
  halteImBlick,
  rolleSeiteNachOben,
  rolleZu,
  seitenRoller,
} from "@/lib/rollen";

/**
 * jsdom rechnet kein Layout aus, `scrollHeight` und `clientHeight` sind dort
 * immer 0. Deshalb wird ein rollender Kasten von Hand nachgestellt: Masse
 * festlegen, `overflow-y` setzen und `scrollTo` als Attrappe anhaengen.
 */
function baueMain(optionen: { rollt: boolean; overflow?: string }) {
  const el = document.createElement("main");
  if (optionen.overflow) el.style.overflowY = optionen.overflow;
  Object.defineProperty(el, "scrollHeight", { value: optionen.rollt ? 2000 : 500, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 500, configurable: true });
  el.scrollTo = vi.fn() as unknown as typeof el.scrollTo;
  document.body.appendChild(el);
  return el;
}

let fensterRollen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = "";
  fensterRollen = vi.fn();
  window.scrollTo = fensterRollen as unknown as typeof window.scrollTo;
  // Standard: weiche Bewegung ist erlaubt.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("seitenRoller", () => {
  it("findet den Kasten, der wirklich rollt, und nicht die aeussere Klammer", () => {
    // So sieht es im CRM aus: aussen die Klammer aus App.tsx, innen der
    // Inhaltskasten des Dashboards.
    const klammer = baueMain({ rollt: false });
    const inhalt = baueMain({ rollt: true, overflow: "auto" });
    klammer.appendChild(inhalt);

    expect(seitenRoller()).toBe(inhalt);
  });

  it("liefert nichts, wenn kein Kasten rollt", () => {
    baueMain({ rollt: false });
    expect(seitenRoller()).toBeNull();
  });
});

describe("rolleSeiteNachOben", () => {
  it("rollt den vorhandenen Kasten und laesst das Fenster in Ruhe", () => {
    const inhalt = baueMain({ rollt: true, overflow: "auto" });

    rolleSeiteNachOben();

    expect(inhalt.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "smooth" });
    expect(fensterRollen).not.toHaveBeenCalled();
  });

  it("faellt auf das Fenster zurueck, wenn kein Kasten rollt", () => {
    rolleSeiteNachOben();

    expect(fensterRollen).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "smooth" });
  });

  it("steht sofort oben, wenn weiche Bewegung abgeschaltet ist", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const inhalt = baueMain({ rollt: true, overflow: "auto" });

    rolleSeiteNachOben();

    expect(inhalt.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("nimmt ein ausdruecklich gewuenschtes Verhalten", () => {
    const inhalt = baueMain({ rollt: true, overflow: "auto" });

    rolleSeiteNachOben("auto");

    expect(inhalt.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });
});

describe("Rollposition merken und wieder einnehmen", () => {
  it("liest und setzt den Kasten, wenn einer rollt", () => {
    const inhalt = baueMain({ rollt: true, overflow: "auto" });
    inhalt.scrollTop = 320;

    expect(aktuelleRollposition()).toBe(320);

    rolleZu(320);
    expect(inhalt.scrollTo).toHaveBeenCalledWith({ top: 320, left: 0, behavior: "auto" });
  });

  it("nutzt das Fenster, wenn kein Kasten rollt", () => {
    rolleZu(120);
    expect(fensterRollen).toHaveBeenCalledWith({ top: 120, left: 0, behavior: "auto" });
  });
});

/**
 * Die Notbremse beim Schrittwechsel.
 *
 * Christian am 17.09.2026: „wenn ich mich durchklicke, springt es sonst immer
 * nach oben und das nervt.“ Seither bleibt die Seite beim Schrittwechsel
 * stehen. `halteImBlick` ist die einzige Ausnahme davon, und diese Tests
 * halten fest, wann sie greift und wann eben nicht.
 *
 * jsdom rechnet kein Layout aus, `getBoundingClientRect` liefert dort nur
 * Nullen. Das Rechteck wird deshalb von Hand gesetzt.
 */
function baueKasten(oben: number, hoehe: number) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ top: oben, bottom: oben + hoehe, height: hoehe, left: 0, right: 0, width: 0, x: 0, y: oben, toJSON: () => ({}) }) as DOMRect;
  el.scrollIntoView = vi.fn();
  document.body.appendChild(el);
  return el;
}

describe("halteImBlick", () => {
  beforeEach(() => {
    // Ein Fenster von 800 Pixeln Hoehe, kein rollender Kasten darin.
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  });

  it("laesst die Seite stehen, solange der Kasten gut zu sehen ist", () => {
    const el = baueKasten(100, 500);
    expect(halteImBlick(el)).toBe(false);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("laesst die Seite auch dann stehen, wenn nur die Ueberschrift ueber dem Rand liegt", () => {
    // Genau der Handyfall: Der Kasten ist hoeher als der Bildschirm, wer den
    // Weiter-Knopf sieht, hat die Ueberschrift ohnehin oben hinausgeschoben.
    // Wuerde hier gerollt, spraenge es bei JEDEM Klick.
    const el = baueKasten(-150, 700);
    expect(halteImBlick(el)).toBe(false);
  });

  it("holt den Kasten herein, wenn er nach oben aus dem Bild gerutscht ist", () => {
    // Der naechste Schritt ist kuerzer: Die Rollposition blieb, der Kasten
    // endet aber frueher und steht fast ganz oberhalb des Bildes.
    const el = baueKasten(-420, 460);
    expect(halteImBlick(el)).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("holt den Kasten herein, wenn er unter dem Bild liegt", () => {
    const el = baueKasten(760, 460);
    expect(halteImBlick(el)).toBe(true);
  });

  it("rollt ohne weiche Bewegung, wenn der Nutzer sie abgestellt hat", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const el = baueKasten(-420, 460);
    halteImBlick(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("misst im CRM am rollenden Inhaltskasten, nicht am Fenster", () => {
    // Dort beginnt der Sichtbereich nicht bei null, sondern unter der
    // Kopfleiste. Ein Kasten bei 60 Pixeln ist am Fenster gemessen sichtbar,
    // im Inhaltskasten ab 600 Pixeln aber laengst darueber hinaus.
    const inhalt = baueMain({ rollt: true, overflow: "auto" });
    inhalt.getBoundingClientRect = () =>
      ({ top: 600, bottom: 1000, height: 400, left: 0, right: 0, width: 0, x: 0, y: 600, toJSON: () => ({}) }) as DOMRect;
    const el = baueKasten(60, 400);
    expect(halteImBlick(el)).toBe(true);
  });

  it("tut nichts ohne Element", () => {
    expect(halteImBlick(null)).toBe(false);
  });
});
