import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Ziehen und Ablegen ohne Bibliothek, für Zuordnen und Sortieren.
 *
 * Technik: Zeigerereignisse (`pointerdown`, `pointermove`, `pointerup`), die
 * Maus, Finger und Stift gleich behandeln. Beim Anfassen wird der Zeiger mit
 * `setPointerCapture` an das Element gebunden, damit die Bewegung auch dann
 * ankommt, wenn der Finger die Karte verlässt. Die Karte selbst bleibt an
 * ihrem Platz und wird blass, ein Geist (`position: fixed`) folgt dem Zeiger.
 * Das Ziel unter dem Zeiger wird über `elementFromPoint` und das Attribut
 * `data-va-ziel` bestimmt. Der Geist ist für Zeiger durchlässig, sonst würde
 * er sich selbst finden.
 *
 * Das eingebaute HTML-Drag des Browsers wird bewusst nicht genutzt, es
 * funktioniert auf iPhone und iPad nicht.
 *
 * Touch und Scrollen: Wer am Handy eine Karte anfasst, will meist scrollen.
 * Deshalb zieht ein Finger nur am Griff (`griffProps`), dort ist das Scrollen
 * über `touch-action: none` abgeschaltet. Die Maus darf die ganze Karte
 * anfassen (`kartenProps`), sie hat kein Scrollproblem. Antippen bleibt in
 * beiden Komponenten als zweiter Weg erhalten, Ziehen kommt obendrauf.
 */

/** Ab dieser Bewegung in Pixeln gilt ein Druck als Ziehen und nicht mehr als Tippen. */
const SCHWELLE_PX = 6;
/** Innerhalb dieses Abstands zum Rand des Sichtfensters scrollt die Seite von selbst mit. */
const RAND_SCROLL_PX = 56;
const RAND_SCROLL_SCHRITT = 7;

export interface ZiehStatus {
  /** Kennung der gezogenen Karte, `null` wenn nichts gezogen wird. */
  id: string | null;
  /** Zeigerposition im Sichtfenster. */
  x: number;
  y: number;
  /** Abstand des Zeigers zur linken oberen Ecke der Karte beim Anfassen. */
  dx: number;
  dy: number;
  /** Größe der angefassten Karte, damit der Geist gleich aussieht. */
  breite: number;
  hoehe: number;
  /** Ziel unter dem Zeiger, aus `data-va-ziel`. */
  zielId: string | null;
}

const RUHE: ZiehStatus = { id: null, x: 0, y: 0, dx: 0, dy: 0, breite: 0, hoehe: 0, zielId: null };

interface Optionen {
  /** Wird beim Loslassen gerufen. `zielId` ist `null`, wenn die Karte ins Leere fiel. */
  onAblegen: (id: string, zielId: string | null) => void;
  /** Wird gerufen, sobald sich das Ziel unter dem Zeiger ändert. Für lebendiges Umsortieren. */
  onZielWechsel?: (id: string, zielId: string | null) => void;
  /** Alles aus, etwa nach der Prüfung. */
  deaktiviert?: boolean;
}

/** Das Ziel unter einem Punkt im Sichtfenster. */
export function zielUnterPunkt(x: number, y: number): string | null {
  if (typeof document === "undefined" || !document.elementFromPoint) return null;
  const el = document.elementFromPoint(x, y);
  const ziel = el?.closest?.("[data-va-ziel]");
  return ziel?.getAttribute("data-va-ziel") ?? null;
}

export function useZiehen({ onAblegen, onZielWechsel, deaktiviert }: Optionen) {
  const [status, setStatus] = useState<ZiehStatus>(RUHE);
  // Alles, was sich zwischen zwei Ereignissen merken muss, ohne neu zu rendern.
  const start = useRef<{ id: string; x: number; y: number; dx: number; dy: number; breite: number; hoehe: number } | null>(null);
  const aktiv = useRef(false);
  const zielRef = useRef<string | null>(null);
  const klickUnterdruecken = useRef(false);
  const scrollRichtung = useRef(0);
  const scrollRaf = useRef<number | null>(null);

  const onAblegenRef = useRef(onAblegen);
  onAblegenRef.current = onAblegen;
  const onZielWechselRef = useRef(onZielWechsel);
  onZielWechselRef.current = onZielWechsel;

  const scrollStoppen = useCallback(() => {
    scrollRichtung.current = 0;
    if (scrollRaf.current !== null) {
      cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = null;
    }
  }, []);

  /** Scrollt den Seiteninhalt weiter, solange der Zeiger am Rand steht. */
  const scrollLaufen = useCallback(() => {
    if (scrollRichtung.current === 0) { scrollRaf.current = null; return; }
    const main = document.querySelector("main");
    const schritt = scrollRichtung.current * RAND_SCROLL_SCHRITT;
    if (main && main.scrollHeight > main.clientHeight) main.scrollTop += schritt;
    else window.scrollBy(0, schritt);
    scrollRaf.current = requestAnimationFrame(scrollLaufen);
  }, []);

  const beenden = useCallback((abgelegt: boolean) => {
    const s = start.current;
    const warAktiv = aktiv.current;
    start.current = null;
    aktiv.current = false;
    scrollStoppen();
    if (!s || !warAktiv) return;
    // Der Klick, der auf das Loslassen folgt, wird abgefangen. Kommt keiner,
    // darf der Merker nicht den nächsten echten Klick schlucken.
    klickUnterdruecken.current = true;
    setTimeout(() => { klickUnterdruecken.current = false; }, 80);
    const ziel = zielRef.current;
    zielRef.current = null;
    setStatus(RUHE);
    if (abgelegt) onAblegenRef.current(s.id, ziel);
    else onZielWechselRef.current?.(s.id, null);
  }, [scrollStoppen]);

  // Escape bricht ab, die Karte springt zurück.
  useEffect(() => {
    if (!status.id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") beenden(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status.id, beenden]);

  useEffect(() => () => scrollStoppen(), [scrollStoppen]);

  function anfassen(e: ReactPointerEvent<HTMLElement>, id: string) {
    if (deaktiviert || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    start.current = {
      id, x: e.clientX, y: e.clientY,
      dx: e.clientX - rect.left, dy: e.clientY - rect.top,
      breite: rect.width, hoehe: rect.height,
    };
    aktiv.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* alte Browser */ }
  }

  function bewegen(e: ReactPointerEvent<HTMLElement>) {
    const s = start.current;
    if (!s) return;
    if (!aktiv.current) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < SCHWELLE_PX) return;
      aktiv.current = true;
    }
    e.preventDefault();
    const ziel = zielUnterPunkt(e.clientX, e.clientY);
    if (ziel !== zielRef.current) {
      zielRef.current = ziel;
      onZielWechselRef.current?.(s.id, ziel);
    }
    setStatus({ id: s.id, x: e.clientX, y: e.clientY, dx: s.dx, dy: s.dy, breite: s.breite, hoehe: s.hoehe, zielId: ziel });

    // Am Rand des Sichtfensters weiterscrollen, sonst kommt man bei langen
    // Listen nicht ans Ziel.
    const h = window.innerHeight;
    const richtung = e.clientY < RAND_SCROLL_PX ? -1 : e.clientY > h - RAND_SCROLL_PX ? 1 : 0;
    scrollRichtung.current = richtung;
    if (richtung !== 0 && scrollRaf.current === null) scrollRaf.current = requestAnimationFrame(scrollLaufen);
  }

  function loslassen(e: ReactPointerEvent<HTMLElement>) {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* egal */ }
    beenden(true);
  }

  function abbrechen() {
    beenden(false);
  }

  /** Ein Klick direkt nach dem Ziehen darf nicht als Antippen zählen. */
  function klickFilter(e: React.MouseEvent) {
    if (klickUnterdruecken.current) {
      klickUnterdruecken.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  /** Für die ganze Karte: nur die Maus zieht, Finger und Stift scrollen oder tippen. */
  function kartenProps(id: string) {
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => { if (e.pointerType === "mouse") anfassen(e, id); },
      onPointerMove: bewegen,
      onPointerUp: loslassen,
      onPointerCancel: abbrechen,
      onClickCapture: klickFilter,
    };
  }

  /**
   * Für den Griff: jeder Zeiger zieht, das Scrollen ist dort abgeschaltet.
   * Der Griff liegt in der Karte, deshalb bleiben seine Ereignisse bei ihm,
   * sonst würde die Karte dieselbe Bewegung ein zweites Mal verarbeiten.
   */
  function griffProps(id: string) {
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => { e.stopPropagation(); anfassen(e, id); },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => { e.stopPropagation(); bewegen(e); },
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => { e.stopPropagation(); loslassen(e); },
      onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => { e.stopPropagation(); abbrechen(); },
      onClickCapture: klickFilter,
      style: { touchAction: "none" } as CSSProperties,
    };
  }

  /** Position und Größe des Geists, der dem Zeiger folgt. */
  const geistStyle: CSSProperties | null = status.id
    ? {
        position: "fixed",
        left: status.x - status.dx,
        top: status.y - status.dy,
        width: status.breite,
        pointerEvents: "none",
        zIndex: 60,
      }
    : null;

  return { status, kartenProps, griffProps, geistStyle };
}
