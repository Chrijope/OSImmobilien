import "@testing-library/jest-dom";
import { afterAll } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/*
 * nwsapi 2.2.27, die Selektor-Engine von jsdom, prüft `:modal`,
 * `:fullscreen` und `:popover-open`, indem es `node.matches` erneut aufruft,
 * also sich selbst, bis zum Stapelüberlauf, den es still abfängt. floating-ui
 * (Radix Popover, Select, Tooltip) fragt genau diese Zustände bei jeder
 * Positionierung ab. Ein Test mit geöffnetem Popover brauchte so rund
 * 20 Sekunden (gemessen am 29.09.2026 an der Terminseite). jsdom kennt weder
 * modale Dialoge noch Vollbild noch die Popover-API, die Antwort ist dort
 * immer false.
 */
const OBERSTE_EBENE = new Set([":modal", ":fullscreen", ":popover-open"]);
const matchesOriginal = Element.prototype.matches;
Element.prototype.matches = function (this: Element, selektor: string) {
  return OBERSTE_EBENE.has(selektor) ? false : matchesOriginal.call(this, selektor);
} as typeof Element.prototype.matches;

/*
 * jsdom kennt keinen ResizeObserver. input-otp (CodeEingabe, Zwei-Faktor)
 * ruft ihn beim Einhängen auf, ohne ihn stürzt der ganze Baum ab. Nur eine
 * leere Attrappe, falls ein Test keine eigene setzt (21.10.2026).
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

/*
 * input-otp setzt nach dem Aushängen noch Zeitgeber (bis 50 ms). Feuern sie
 * erst nach dem Abbau von jsdom, meldet Vitest „window is not defined“ als
 * Fehler. Einmal je Testdatei kurz warten reicht.
 */
afterAll(() => new Promise<void>((fertig) => setTimeout(fertig, 60)));
