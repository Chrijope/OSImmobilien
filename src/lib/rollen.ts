/**
 * Rollen (Scrollen) an einer Stelle, gueltig innerhalb und ausserhalb des
 * Dashboards.
 *
 * Warum es diese Datei gibt: Im CRM rollt nicht das Browserfenster. Die Huelle
 * in `AppShell` (siehe `components/DashboardLayout.tsx`) ist
 * `h-screen overflow-hidden`, das Fenster hat also gar keinen Rollweg. Gerollt
 * wird der Inhaltskasten `<main>` darin. Ein `window.scrollTo` bleibt dort
 * still wirkungslos: kein Fehler, keine Warnung, es passiert nur nichts.
 *
 * Auf oeffentlichen Seiten ohne diese Huelle ist es umgekehrt, dort rollt das
 * Fenster. Deshalb suchen die Helfer erst den Kasten, der wirklich rollt, und
 * fallen sonst auf das Fenster zurueck. Damit traegt derselbe Aufruf an beiden
 * Orten und niemand muss beim Schreiben darueber nachdenken.
 *
 * Achtung bei der Suche: `src/App.tsx` legt eine aeussere `<main>`-Klammer um
 * saemtliche Routen. Ein blosses `document.querySelector("main")` findet also
 * diese Klammer und nicht den Inhaltskasten des Dashboards, und die Klammer
 * rollt nicht. Deshalb wird von innen nach aussen gesucht und geprueft, ob der
 * Kasten tatsaechlich einen Rollweg hat.
 */

/** Hat der Nutzer weiche Bewegung abgeschaltet? */
function weicheBewegungAus(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Rollt dieser Kasten wirklich, oder sieht er nur so aus? */
function rolltWirklich(el: HTMLElement): boolean {
  if (typeof el.scrollTo !== "function") return false;
  // Kein Rollweg heisst: es gibt nichts zu rollen.
  if (el.scrollHeight <= el.clientHeight) return false;
  const stil =
    typeof window !== "undefined" && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(el)
      : null;
  const senkrecht = stil?.overflowY ?? "";
  return senkrecht === "auto" || senkrecht === "scroll" || senkrecht === "overlay";
}

/**
 * Der Kasten, der die Seite tatsaechlich rollt, oder `null`, wenn keiner da
 * ist. `null` heisst: das Fenster ist zustaendig.
 */
export function seitenRoller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const kaesten = Array.from(document.querySelectorAll<HTMLElement>("main"));
  // Von innen nach aussen: der innerste Kasten gehoert zur Seite, der
  // aeusserste ist nur die Klammer um alle Routen.
  for (let i = kaesten.length - 1; i >= 0; i--) {
    if (rolltWirklich(kaesten[i])) return kaesten[i];
  }
  return null;
}

/**
 * Die Seite an den Anfang rollen.
 *
 * Wer weiche Bewegung abgeschaltet hat (`prefers-reduced-motion`), steht
 * sofort oben, statt einen Rollvorgang zu sehen. Mit `verhalten` laesst sich
 * das Gleiten ausdruecklich abschalten, etwa beim Wechsel auf eine ganz neue
 * Ansicht, die ohnehin von vorn beginnt.
 */
export function rolleSeiteNachOben(verhalten?: ScrollBehavior) {
  const gewaehlt: ScrollBehavior = verhalten ?? (weicheBewegungAus() ? "auto" : "smooth");
  const roller = seitenRoller();
  if (roller) {
    roller.scrollTo({ top: 0, left: 0, behavior: gewaehlt });
    return;
  }
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: gewaehlt });
  }
}

/**
 * Nach oben rollen, aber erst wenn die neue Ansicht steht.
 *
 * Wer sofort rollt, rollt noch die alte Ansicht: React tauscht den Inhalt erst
 * danach aus, und dann steht man wieder falsch. Ein fester `setTimeout` mit
 * geratener Millisekundenzahl waere Glueckssache. Deshalb zwei Bildschirmbilder
 * abwarten, das erste kommt nach dem Einbau der neuen Ansicht, das zweite nach
 * ihrem ersten Aufbau.
 */
export function rolleNachDemZeichnenNachOben() {
  if (typeof requestAnimationFrame !== "function") {
    rolleSeiteNachOben();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => rolleSeiteNachOben()));
}

/**
 * Einen Kasten im Blick behalten, ohne die Seite sonst anzufassen.
 *
 * Gedacht fuer einen Schrittwechsel, bei dem der Inhalt ausgetauscht wird, die
 * Seite aber stehen bleiben soll. Ein Sprung an den Seitenanfang ist dort die
 * haeufigste Verschlimmbesserung: Wer einmal richtig steht, wird bei jedem
 * Klick wieder nach oben geworfen und muss erneut hinunterrollen.
 *
 * Gerollt wird deshalb NUR, wenn der Kasten aus dem Bild gerutscht ist. Das
 * kann passieren, wenn der naechste Schritt kuerzer ist als der vorige: Die
 * Rollposition bleibt, der Kasten endet aber frueher und liegt dann ganz oder
 * fast ganz oberhalb des Sichtfensters.
 *
 * Das Mass dafuer ist die sichtbare Ueberlappung, nicht die Oberkante. Die
 * Oberkante waere zu streng: Auf dem Handy ist der Fragenkasten hoeher als der
 * Bildschirm, wer den Weiter-Knopf sieht, hat die Ueberschrift ohnehin schon
 * ueber dem Rand. Nach der Oberkante zu rollen hiesse, bei JEDEM Klick zu
 * springen, also genau das, was hier abgestellt werden soll. Verlangt wird
 * darum die Haelfte dessen, was ueberhaupt gleichzeitig zu sehen sein kann,
 * also der kleinere Wert aus Kastenhoehe und Sichtfensterhoehe.
 *
 * Zurueck kommt, ob wirklich gerollt wurde. Das braucht der Aufrufer nicht,
 * der Test schon.
 */
const IM_BLICK_ANTEIL = 0.5;

export function halteImBlick(el: HTMLElement | null): boolean {
  if (!el || typeof el.getBoundingClientRect !== "function") return false;
  if (typeof el.scrollIntoView !== "function") return false;

  const kasten = el.getBoundingClientRect();
  const roller = seitenRoller();
  const sicht = roller
    ? roller.getBoundingClientRect()
    : { top: 0, bottom: typeof window !== "undefined" ? window.innerHeight : 0 };
  const sichtHoehe = sicht.bottom - sicht.top;
  if (sichtHoehe <= 0 || kasten.height <= 0) return false;

  const sichtbar = Math.min(kasten.bottom, sicht.bottom) - Math.max(kasten.top, sicht.top);
  const noetig = Math.min(kasten.height, sichtHoehe) * IM_BLICK_ANTEIL;
  if (sichtbar >= noetig) return false;

  el.scrollIntoView({
    behavior: weicheBewegungAus() ? "auto" : "smooth",
    block: "start",
  });
  return true;
}

/**
 * Wie `halteImBlick`, aber erst nachdem die neue Ansicht steht.
 *
 * Aus demselben Grund wie bei `rolleNachDemZeichnenNachOben`: Wer sofort misst,
 * misst noch die alte Ansicht, und die alte Hoehe ist genau die Groesse, um die
 * es hier geht.
 */
export function halteNachDemZeichnenImBlick(hole: () => HTMLElement | null) {
  if (typeof requestAnimationFrame !== "function") {
    halteImBlick(hole());
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => halteImBlick(hole())));
}

/** Die aktuelle Rollposition, egal ob Kasten oder Fenster rollt. */
export function aktuelleRollposition(): number {
  const roller = seitenRoller();
  if (roller) return roller.scrollTop;
  return typeof window !== "undefined" ? window.scrollY : 0;
}

/** Eine gemerkte Rollposition wieder einnehmen. */
export function rolleZu(y: number, verhalten: ScrollBehavior = "auto") {
  const roller = seitenRoller();
  if (roller) {
    roller.scrollTo({ top: y, left: 0, behavior: verhalten });
    return;
  }
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: y, left: 0, behavior: verhalten });
  }
}
