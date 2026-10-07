import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Verzögerung in ms — für gestaffelte Reihen (z. B. index * 80). */
  delay?: number;
  /** Bewegungsrichtung beim Einblenden. */
  from?: "unten" | "links" | "rechts";
  /** Weg in px. Bewusst kurz: teuer wirkt kurz, nicht weit. */
  distance?: number;
  className?: string;
  as?: "div" | "section" | "li";
}

/**
 * Sanftes Einblenden beim Hereinscrollen.
 *
 * Zwei Grundsätze, die hier nicht verhandelbar sind:
 *  1. Sichtbarkeit ist der Normalzustand. Wenn IntersectionObserver fehlt,
 *     nicht feuert oder der Nutzer reduzierte Bewegung eingestellt hat, ist der
 *     Inhalt sofort da. Eine Animation darf nie darüber entscheiden, ob etwas
 *     lesbar ist — dieselbe Lehre wie beim Zahlen-Zähler.
 *  2. Kurze Wege, weiche Kurve. 16 px und 700 ms wirken hochwertig;
 *     große Sprünge wirken billig.
 */
export function Reveal({
  children,
  delay = 0,
  from = "unten",
  distance = 16,
  className = "",
  as = "div",
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Standard: sichtbar. Nur wenn wir sicher animieren können, blenden wir aus.
  const [sichtbar, setSichtbar] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (document.documentElement.hasAttribute("data-pdf-freezing")) return;

    // Nur ausblenden, was ohnehin noch unter dem Sichtfeld liegt.
    const rect = el.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 0.9) return;

    setSichtbar(false);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          window.clearTimeout(fallback);
          setSichtbar(true);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);

    // Sicherheitsnetz: nach 3 s ist der Inhalt in jedem Fall sichtbar.
    const fallback = window.setTimeout(() => {
      observer.disconnect();
      setSichtbar(true);
    }, 3000);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  const versatz =
    from === "links" ? `translate3d(-${distance}px,0,0)`
    : from === "rechts" ? `translate3d(${distance}px,0,0)`
    : `translate3d(0,${distance}px,0)`;

  const Tag = as as "div";

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: sichtbar ? 1 : 0,
        transform: sichtbar ? "translate3d(0,0,0)" : versatz,
        transition: `opacity 700ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 700ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        willChange: sichtbar ? undefined : "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
