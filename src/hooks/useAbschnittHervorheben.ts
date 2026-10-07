import { useCallback, useEffect, useRef } from "react";

/**
 * Springt zu einem Abschnitt der Seite und hebt ihn kurz hervor.
 *
 * Ablauf: eingeklappten Abschnitt aufklappen, weich hinscrollen (unterhalb
 * der schwebenden Kopfleiste), drei Sekunden einen Rahmen in Projekt-Orange
 * zeigen und den Fokus auf die Überschrift legen, damit Screenreader und
 * Tastatur mitkommen. Das Aussehen steht in `index.css` unter
 * `[data-abschnitt-hervorgehoben]`.
 *
 * Es gibt immer nur eine Hervorhebung auf einmal, auch wenn mehrere Stellen
 * den Hook benutzen (Kasten „Als Nächstes", Phasenleiste, Tiefenlink). Ein
 * erneuter Klick startet die drei Sekunden neu, statt eine zweite Zeitschaltung
 * daneben zu legen, die den Rahmen dann zu früh wieder abnimmt.
 */

export const HERVORHEBUNG_DAUER_MS = 3000;
export const HERVORHEBUNG_ATTRIBUT = "data-abschnitt-hervorgehoben";

/** Abstand zwischen Unterkante der Kopfleiste und Abschnitt, in Pixeln. */
const LUFT_UNTER_KOPFLEISTE = 16;
/** Wenn keine Kopfleiste gefunden wird, etwa außerhalb des Portals. */
const VERSATZ_OHNE_KOPFLEISTE = 96;
const STANDARD_KOPFLEISTE = ".portal-header";

export interface HervorhebenOptionen {
  dauerMs?: number;
  /** CSS-Selektor der schwebenden Kopfleiste, die nichts verdecken darf. */
  kopfleiste?: string;
  /**
   * Für Abschnitte, deren Klappzustand in React liegt. Wird aufgerufen,
   * bevor gescrollt wird. `<details>` und Radix-Klappbereiche
   * (`data-state="closed"`) klappt der Helfer selbst auf.
   */
  aufklappen?: (ziel: HTMLElement) => void;
}

let aktuellesZiel: HTMLElement | null = null;
let abnehmTimer: ReturnType<typeof setTimeout> | null = null;

/** Nimmt eine laufende Hervorhebung sofort ab. */
export function hervorhebungBeenden(): void {
  if (abnehmTimer) clearTimeout(abnehmTimer);
  abnehmTimer = null;
  aktuellesZiel?.removeAttribute(HERVORHEBUNG_ATTRIBUT);
  aktuellesZiel = null;
}

function bewegungReduziert(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Klappt das Ziel und alle umgebenden Klappbereiche auf.
 * Liefert, ob etwas aufgeklappt wurde; dann muss erst neu gezeichnet werden.
 */
function klappeAuf(ziel: HTMLElement, aufklappen?: (ziel: HTMLElement) => void): boolean {
  let aufgeklappt = false;

  for (let el: HTMLElement | null = ziel; el; el = el.parentElement) {
    if (el instanceof HTMLDetailsElement && !el.open) {
      el.open = true;
      aufgeklappt = true;
    }
  }

  if (ziel.getAttribute("data-state") === "closed") {
    // Radix Collapsible und Accordion: Der Auslöser trägt aria-expanded.
    const ausloeser = ziel.querySelector<HTMLElement>('[aria-expanded="false"]');
    if (ausloeser) {
      ausloeser.click();
      aufgeklappt = true;
    }
  }

  if (aufklappen) {
    aufklappen(ziel);
    aufgeklappt = true;
  }
  return aufgeklappt;
}

/** Oberkante, unter der der Abschnitt nach dem Scrollen stehen soll. */
function versatzOben(kopfleisteSelektor: string): number {
  const kopfleiste = document.querySelector<HTMLElement>(kopfleisteSelektor);
  if (!kopfleiste) return VERSATZ_OHNE_KOPFLEISTE;
  const unterkante = kopfleiste.getBoundingClientRect().bottom;
  return Math.max(0, Math.round(unterkante)) + LUFT_UNTER_KOPFLEISTE;
}

function scrolleHin(ziel: HTMLElement, kopfleisteSelektor: string): void {
  // scroll-margin-top wirkt direkt bei scrollIntoView. Gemessen statt fest
  // verdrahtet, weil die Kopfleiste am Handy, am Rechner und im Liquid-Glass
  // verschieden hoch ist.
  ziel.style.scrollMarginTop = `${versatzOben(kopfleisteSelektor)}px`;
  try {
    ziel.scrollIntoView({ behavior: bewegungReduziert() ? "auto" : "smooth", block: "start" });
  } catch {
    /* ältere Umgebungen ohne Optionsobjekt: dann eben ohne Sprung */
  }
}

function fokussiere(ziel: HTMLElement): void {
  const ueberschrift =
    ziel.querySelector<HTMLElement>("[data-abschnitt-titel]") ??
    ziel.querySelector<HTMLElement>("h1, h2, h3, h4") ??
    ziel;
  if (!ueberschrift.hasAttribute("tabindex")) ueberschrift.setAttribute("tabindex", "-1");
  try {
    // Ohne preventScroll springt der Browser hart und das weiche Scrollen bricht ab.
    ueberschrift.focus({ preventScroll: true });
  } catch {
    ueberschrift.focus();
  }
}

function setzeRahmen(ziel: HTMLElement, dauerMs: number): void {
  if (aktuellesZiel && aktuellesZiel !== ziel) aktuellesZiel.removeAttribute(HERVORHEBUNG_ATTRIBUT);
  if (abnehmTimer) clearTimeout(abnehmTimer);

  // Abnehmen und neu setzen startet die Ausblend-Animation von vorn.
  ziel.removeAttribute(HERVORHEBUNG_ATTRIBUT);
  void ziel.offsetWidth;
  ziel.setAttribute(HERVORHEBUNG_ATTRIBUT, "");

  aktuellesZiel = ziel;
  abnehmTimer = setTimeout(() => {
    ziel.removeAttribute(HERVORHEBUNG_ATTRIBUT);
    if (aktuellesZiel === ziel) aktuellesZiel = null;
    abnehmTimer = null;
  }, dauerMs);
}

/**
 * Springt zum Abschnitt und hebt ihn hervor. Nimmt eine DOM-Kennung oder das
 * Element selbst. Liefert `false`, wenn es das Ziel nicht gibt; dann ist
 * nichts passiert und der Aufrufer entscheidet, was stattdessen geschieht.
 */
export function abschnittHervorheben(
  zielOderId: string | HTMLElement | null | undefined,
  optionen: HervorhebenOptionen = {},
): boolean {
  if (typeof document === "undefined" || !zielOderId) return false;
  const ziel = typeof zielOderId === "string" ? document.getElementById(zielOderId) : zielOderId;
  if (!ziel) return false;

  const kopfleiste = optionen.kopfleiste ?? STANDARD_KOPFLEISTE;
  const dauerMs = optionen.dauerMs ?? HERVORHEBUNG_DAUER_MS;

  setzeRahmen(ziel, dauerMs);
  fokussiere(ziel);

  if (klappeAuf(ziel, optionen.aufklappen)) {
    // Erst nach dem Neuzeichnen scrollen, sonst stimmt die Höhe nicht.
    setTimeout(() => scrolleHin(ziel, kopfleiste), 0);
  } else {
    scrolleHin(ziel, kopfleiste);
  }
  return true;
}

/**
 * Hook-Hülle um `abschnittHervorheben`. Zusätzlich `hervorhebenSobaldDa` für
 * Tiefenlinks: Dort ist der Abschnitt beim Aufruf oft noch nicht gezeichnet,
 * weil die Daten erst laden. Das Warten wird beim Verlassen der Seite
 * abgebrochen.
 */
export function useAbschnittHervorheben(optionen: HervorhebenOptionen = {}) {
  const optionenRef = useRef(optionen);
  optionenRef.current = optionen;
  const warteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (warteTimer.current) clearTimeout(warteTimer.current);
    },
    [],
  );

  const hervorheben = useCallback(
    (zielOderId: string | HTMLElement | null | undefined) => abschnittHervorheben(zielOderId, optionenRef.current),
    [],
  );

  const hervorhebenSobaldDa = useCallback((id: string, maxWarteMs = 3000) => {
    if (warteTimer.current) clearTimeout(warteTimer.current);
    const intervall = 120;
    let gewartet = 0;
    const versuch = () => {
      warteTimer.current = null;
      if (abschnittHervorheben(id, optionenRef.current)) return;
      gewartet += intervall;
      if (gewartet <= maxWarteMs) warteTimer.current = setTimeout(versuch, intervall);
    };
    warteTimer.current = setTimeout(versuch, intervall);
  }, []);

  return { hervorheben, hervorhebenSobaldDa };
}
