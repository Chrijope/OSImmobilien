/**
 * Maßvolle Bewegung für die Beratungspräsentation (Wunsch Christian,
 * 20.10.2026): Einblenden beim Scrollen, Zahlen hochzählen, Balken wachsen,
 * Linien zeichnen sich. Nur CSS und IntersectionObserver, keine Bibliothek.
 *
 * Die Klassen stehen in `src/styles/beratung-os.css` und wirken nur ohne
 * „Bewegung reduzieren“ (prefers-reduced-motion). Ohne IntersectionObserver
 * (alte Browser, Tests) ist alles sofort sichtbar und steht auf dem Endwert.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/*
 * Sicherheitsnetz: Das CSS versteckt Inhalte nur unter [data-bewegung="an"].
 * Das Merkmal setzt erst die erste Meldung eines echten Beobachters. Meldet
 * er nie (eingebettete Ansicht, Drucken, Attrappe im Test), bleibt alles
 * sichtbar statt unsichtbar.
 */
if (typeof window !== "undefined" && typeof IntersectionObserver !== "undefined") {
  try {
    const probe = new IntersectionObserver(() => {
      document.documentElement.dataset.bewegung = "an";
      probe.disconnect();
    });
    probe.observe(document.documentElement);
  } catch {
    /* ohne Beobachter keine Bewegung */
  }
}

function ohneBewegung(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/** `sichtbar` wird einmal wahr, sobald das Element ins Bild kommt, und bleibt es. */
export function useSichtbar<T extends Element>(schwelle = 0.15, rand = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [sichtbar, setSichtbar] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || sichtbar) return;
    if (typeof IntersectionObserver === "undefined") {
      setSichtbar(true);
      return;
    }
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) {
          setSichtbar(true);
          beobachter.disconnect();
        }
      },
      { threshold: schwelle, rootMargin: rand },
    );
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [sichtbar, schwelle, rand]);
  return [ref, sichtbar] as const;
}

/** Merkmal für CSS: Kinder mit `bos-wachsen-x`, `bos-linie` usw. starten, wenn es „ja“ ist. */
export const sichtbarAttr = (sichtbar: boolean) => ({ "data-sichtbar": sichtbar ? "ja" : "nein" });

/** Hülle, ab deren Erscheinen die Bewegungen darin starten (Balken, Linien, Punkte). */
export function Sichtbar({
  children,
  className,
  style,
  schwelle = 0.3,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  schwelle?: number;
}) {
  const [ref, sichtbar] = useSichtbar<HTMLDivElement>(schwelle);
  return (
    <div ref={ref} className={className} style={style} {...sichtbarAttr(sichtbar)}>
      {children}
    </div>
  );
}

/** Verzögerung für eine Bewegung, als CSS-Variable --v. */
export const verzoegert = (ms: number) => ({ "--v": `${Math.round(ms)}ms` }) as CSSProperties;

/**
 * Ein Wert wie „529.900 €“, „≈ 1,44 Mio. €“ oder „+274 € netto“: zählt die
 * Zahl darin hoch und lässt Vorsatz und Rest stehen. Texte ohne Zahl am
 * Anfang („mit 58 Jahren“) bleiben, wie sie sind.
 */
export function ZahlText({ text }: { text: string }) {
  const teile = /^(\D*?)(\d+(?:\.\d{3})*(?:,\d+)?)(.*)$/s.exec(text);
  if (!teile) return <>{text}</>;
  const [, vorne, zahl, hinten] = teile;
  const stellen = zahl.split(",")[1]?.length ?? 0;
  const ziel = Number(zahl.replace(/\./g, "").replace(",", "."));
  // Ohne Tausenderpunkt im Original (Jahreszahl) auch beim Zählen ohne.
  const gruppen = zahl.includes(".");
  const format = (n: number) =>
    `${vorne}${n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen, useGrouping: gruppen })}${hinten}`;
  return <Hochzaehlen ziel={ziel} format={format} />;
}

/**
 * Zählt eine Zahl von 0 auf `ziel` hoch, sobald sie zu sehen ist. Ohne
 * Beobachter oder mit „Bewegung reduzieren“ steht sofort der Endwert da.
 */
export function Hochzaehlen({ ziel, format, dauer = 1400 }: { ziel: number; format: (n: number) => string; dauer?: number }) {
  // Startet, sobald die Zahl ins Bild kommt; bis dahin steht der Endwert da (auch wenn kein Beobachter je meldet).
  const [ref, sichtbar] = useSichtbar<HTMLSpanElement>(0, "0px");
  const sofort = typeof IntersectionObserver === "undefined" || typeof requestAnimationFrame === "undefined";
  const [wert, setWert] = useState(ziel);
  useEffect(() => {
    if (!sichtbar) return;
    if (sofort || ohneBewegung()) {
      setWert(ziel);
      return;
    }
    let kennung = 0;
    const start = performance.now();
    const schritt = (jetzt: number) => {
      const t = Math.min(1, (jetzt - start) / dauer);
      // Sanft auslaufen, damit die letzte Stelle nicht springt.
      setWert(ziel * (1 - Math.pow(1 - t, 3)));
      if (t < 1) kennung = requestAnimationFrame(schritt);
    };
    kennung = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(kennung);
  }, [sichtbar, ziel, dauer, sofort]);
  return (
    <span ref={ref} className="tabular-nums">
      {format(wert)}
    </span>
  );
}
