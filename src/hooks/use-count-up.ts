import { useEffect, useRef, useState } from "react";

interface UseCountUpOptions {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  /**
   * Formatiert den Zwischenwert selbst, etwa als Eurobetrag in der Sprache
   * des Kundenportals. Ohne Angabe bleibt es beim deutschen Zahlenformat mit
   * `prefix` und `suffix`, so wie die Landingpages es erwarten.
   */
  format?: (wert: number) => string;
  /**
   * Auch zählen, wenn das Element beim Laden schon sichtbar ist (etwa eine
   * Zahl im Einstieg). Dann einmal sofort ab 0, sonst wie gehabt erst beim
   * Hereinscrollen. Nur mit IntersectionObserver, als Zeichen, dass der
   * Browser Animationen verlässlich ausführt; das Sicherheitsnetz gilt auch hier.
   */
  auchSichtbar?: boolean;
}

/**
 * Hochzähl-Animation für Kennzahlen.
 *
 * WICHTIG — Grundsatz: Der echte Wert ist der Standard, die Animation ist reine
 * Verschönerung. Früher startete der Zähler bei 0 und wurde erst durch einen
 * IntersectionObserver hochgezählt; wenn der nicht auslöste (kleine Inline-
 * Spans, PDF-Export, reduzierte Bewegung, langsame Geräte), blieben auf der
 * Landingpage dauerhaft Werte wie „0 €" oder „0+ betreute Investoren" stehen.
 *
 * Jetzt gilt: `count` startet auf dem Endwert. Nur wenn das Element beim
 * Mounten nachweislich UNTERHALB des Viewports liegt — der Nutzer es also
 * ohnehin noch nicht sehen kann —, setzen wir auf 0 zurück und zählen beim
 * Hereinscrollen hoch. Zusätzlich sichert ein Timeout ab, dass der Endwert
 * auch dann erscheint, wenn der Observer nie feuert.
 */
export function useCountUp({ end, duration = 2000, prefix = "", suffix = "", format, auchSichtbar = false }: UseCountUpOptions) {
  // Startwert = Endwert. Kein Zustand, in dem eine echte Zahl als 0 erscheint.
  const [count, setCount] = useState(end);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Endwert-Änderungen (z. B. dynamische Daten) immer übernehmen.
  useEffect(() => {
    setCount((prev) => (shouldAnimate ? prev : end));
  }, [end, shouldAnimate]);

  // PDF-Export: sofort finalisieren, damit der Snapshot echte Zahlen zeigt.
  useEffect(() => {
    const finalize = () => {
      setShouldAnimate(false);
      setCount(end);
    };
    window.addEventListener("pdf:finalize-all", finalize);
    return () => window.removeEventListener("pdf:finalize-all", finalize);
  }, [end]);

  // Entscheiden, ob überhaupt animiert wird — einmalig beim Mounten.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-pdf-freezing")) {
      return; // PDF-Export: Endwert stehen lassen
    }
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    // Nur animieren, wenn das Element noch unterhalb des sichtbaren Bereichs
    // liegt. Alles andere hat der Nutzer bereits gesehen — dort wäre ein
    // Rücksprung auf 0 ein Fehler, kein Effekt.
    const rect = element.getBoundingClientRect();
    const liegtUnterhalb = rect.top > window.innerHeight;
    const sofort = !liegtUnterhalb && auchSichtbar && typeof IntersectionObserver !== "undefined";
    if (!liegtUnterhalb && !sofort) return;

    setCount(0);
    setShouldAnimate(!sofort);

    let raf = 0;
    let observer: IntersectionObserver | null = null;
    const startAnimation = () => {
      const startTime = performance.now();
      const step = (currentTime: number) => {
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.floor(eased * end));
        if (progress < 1) raf = requestAnimationFrame(step);
        else setCount(end);
      };
      raf = requestAnimationFrame(step);
    };

    // Sicherheitsnetz: Feuert der Observer aus irgendeinem Grund nicht (oder
    // läuft die sofortige Zählung nicht), steht nach spätestens 2,5 s
    // trotzdem der echte Wert da.
    const fallback = window.setTimeout(() => {
      observer?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      setShouldAnimate(false);
      setCount(end);
    }, 2500);

    if (sofort) {
      startAnimation();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          // Der Beobachter meldet sich beim Beobachten sofort einmal. Damit
          // ist klar, dass er arbeitet, und das Sicherheitsnetz entfällt:
          // Die Zahl zählt dann, wenn sie wirklich ins Bild kommt.
          window.clearTimeout(fallback);
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            setShouldAnimate(false);
            startAnimation();
          }
        },
        { threshold: 0 },
      );
      observer.observe(element);
    }

    return () => {
      observer?.disconnect();
      window.clearTimeout(fallback);
      if (raf) cancelAnimationFrame(raf);
    };
    // Absichtlich nur beim Mounten bzw. bei Wertänderung entscheiden.
  }, [end, duration, auchSichtbar]);

  const display = format ? format(count) : `${prefix}${count.toLocaleString("de-DE")}${suffix}`;

  return { ref, display };
}
