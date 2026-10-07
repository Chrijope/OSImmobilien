/**
 * Der Schalter fuer Liquid Glass, die dritte Designschicht.
 *
 * Liquid Glass liegt in `styles/design-liquid.css` und haengt vollstaendig an
 * `data-glas="liquid"` am Wurzelelement. In `index.html` steht dort `"an"`,
 * also die heutige Glasschicht. Erst dieser Schalter tauscht den Wert aus.
 *
 * Seit Christians Freigabe am 23.09.2026 ist Liquid Glass fuer alle AN
 * (`LIQUID_GLASS_STANDARD` unten). Mit `?design=heute` an der Adresse schaltet
 * man es im eigenen Browser ab, mit `?design=liquid` wieder an; der Browser
 * merkt sich die Wahl. Wer sich `?design=heute` gemerkt hat, behaelt deshalb
 * das vorige Aussehen, bis er `?design=liquid` aufruft.
 */
import { starteGlasLicht } from "./glasLicht";

/** Die eine Zeile fuer die Umstellung. `true` heisst: Liquid Glass fuer alle. */
export const LIQUID_GLASS_STANDARD = true;

export type Design = "heute" | "liquid";

export const DESIGN_SPEICHER_SCHLUESSEL = "moreimmo.design";

function alsDesign(wert: string | null | undefined): Design | null {
  return wert === "liquid" || wert === "heute" ? wert : null;
}

/** Der Wunsch aus der Adresse, `?design=liquid` oder `?design=heute`. */
export function designAusAdresse(suche: string): Design | null {
  try {
    return alsDesign(new URLSearchParams(suche).get("design"));
  } catch {
    return null;
  }
}

/**
 * Welches Aussehen gilt. Reihenfolge: die Adresse, dann das Gemerkte, dann der
 * Standard. Rein, ohne Zugriff auf Fenster oder Speicher, damit es sich
 * pruefen laesst.
 */
export function bestimmeDesign(
  ausAdresse: Design | null,
  gemerkt: string | null,
  standard: boolean = LIQUID_GLASS_STANDARD,
): Design {
  return ausAdresse ?? alsDesign(gemerkt) ?? (standard ? "liquid" : "heute");
}

/*
 * Der Speicher kann fehlen oder werfen: privates Fenster, gesperrte
 * Websitedaten, Vorschau in einem fremden Rahmen. Dann gilt eben der Standard,
 * aber die Seite startet.
 */
function leseGemerkt(): string | null {
  try {
    return window.localStorage.getItem(DESIGN_SPEICHER_SCHLUESSEL);
  } catch {
    return null;
  }
}

function merke(design: Design): void {
  try {
    window.localStorage.setItem(DESIGN_SPEICHER_SCHLUESSEL, design);
  } catch {
    /* Ohne Speicher gilt der Wunsch nur fuer diesen Aufruf. */
  }
}

/** Ob Liquid Glass gerade gilt. Fuer Stellen, die nur dann etwas tun. */
export function istLiquidGlas(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.glas === "liquid";
}

/*
 * Der farbige Grund, auf dem das Glas liegt: eine fest stehende Ebene ganz
 * hinten mit den Farbwolken. Sie haengt direkt am `body`, neben `#root`, damit
 * sie auf jeder Seite liegt, im CRM wie auf den oeffentlichen Seiten, ohne
 * dass eine Seite davon wissen muss. Aussehen und Bewegung stehen im CSS.
 */
function legeGrundAn(): void {
  if (document.querySelector(".lg-grund")) return;
  const grund = document.createElement("div");
  grund.className = "lg-grund";
  grund.setAttribute("aria-hidden", "true");
  const wolken = document.createElement("div");
  wolken.className = "lg-grund-wolken";
  grund.appendChild(wolken);
  document.body.prepend(grund);
}

/**
 * Liest den Wunsch, merkt ihn sich und setzt das Aussehen. Laeuft einmal in
 * `main.tsx`, bevor React zeichnet.
 */
export function wendeDesignAn(): Design {
  const ausAdresse = designAusAdresse(window.location.search);
  if (ausAdresse) merke(ausAdresse);
  const design = bestimmeDesign(ausAdresse, leseGemerkt());
  if (design === "liquid") {
    document.documentElement.dataset.glas = "liquid";
    legeGrundAn();
    starteGlasLicht();
  }
  return design;
}

/**
 * Fuer Exporte, die den Bildschirm abfotografieren (html2canvas): In der
 * Kopie, die fotografiert wird, gilt das heutige Aussehen. html2canvas kennt
 * keine Weichzeichnung hinter Flaechen und malte sonst halbdurchsichtige
 * Schleier ins PDF. Die Seite selbst, die der Nutzer sieht, bleibt unberuehrt.
 */
export function ohneLiquidGlasInKopie(kopie: Document): void {
  if (kopie.documentElement.dataset.glas === "liquid") {
    kopie.documentElement.dataset.glas = "an";
  }
  kopie.querySelectorAll(".lg-grund").forEach((el) => el.remove());
}
