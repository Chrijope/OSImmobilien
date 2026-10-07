/**
 * Kleine Bausteine der Handbuch-Seite: Diagramm, Symbole, Wortmarke, Thema.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Landmark,
  User,
  Percent,
  Home,
  Euro,
  KeyRound,
  FileText,
  BarChart3,
  PenLine,
  Zap,
  ShieldCheck,
  Mail,
  CalendarDays,
  Check,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCountUp } from "@/hooks/use-count-up";
import { zeichnungAlsSvg, type Zeichnung } from "@/lib/handbuch/diagramme";
import type { SymbolName } from "@/lib/handbuch/bausteine";

export const SYMBOLE: Record<SymbolName, LucideIcon> = {
  bank: Landmark,
  person: User,
  prozent: Percent,
  haus: Home,
  euro: Euro,
  schluessel: KeyRound,
  dokument: FileText,
  diagramm: BarChart3,
  stift: PenLine,
  blitz: Zap,
  schild: ShieldCheck,
  brief: Mail,
  kalender: CalendarDays,
  haken: Check,
  stern: Star,
  x: X,
};

export function Symbol({ name, className }: { name: SymbolName; className?: string }) {
  const Icon = SYMBOLE[name];
  return <Icon className={className} aria-hidden="true" />;
}

/**
 * Ein Diagramm aus der Zeichenliste als eingebettetes SVG.
 *
 * Das Markup entsteht aus festen Formen, alle Texte sind maskiert
 * (`zeichnungAlsSvg`), es kommt nichts vom Besucher hinein.
 */
export function Diagramm({ zeichnung, className }: { zeichnung: Zeichnung; className?: string }) {
  const svg = useMemo(() => zeichnungAlsSvg(zeichnung), [zeichnung]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Bildmarke plus Schriftzug, wie auf dem Deckblatt: auf hellem wie dunklem Grund lesbar. */
export function Wortmarke({ hell = false, groesse = 22 }: { hell?: boolean; groesse?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: groesse, lineHeight: 1 }} aria-label="MOREImmo">
      <img src="/images/moreimmo-icon-blau.png" alt="" style={{ width: groesse * 1.35, height: groesse * 1.35 }} />
      <span>
        <b style={{ color: hell ? "#fff" : "var(--hb-tinte)", fontWeight: 700 }}>MORE</b>
        <span style={{ color: hell ? "#88CFFF" : "var(--hb-muted)", fontWeight: 400 }}>Immo</span>
      </span>
    </span>
  );
}

export type HandbuchThema = "hell" | "dunkel";

/**
 * Hell oder dunkel: Ist das CRM dunkel gestellt (Klasse `dark` an <html>),
 * gilt das. Sonst die Einstellung des Geräts. Reagiert auf beide Wechsel.
 */
export function useHandbuchThema(): HandbuchThema {
  const lesen = (): HandbuchThema => {
    if (typeof document === "undefined") return "hell";
    if (document.documentElement.classList.contains("dark")) return "dunkel";
    try {
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dunkel" : "hell";
    } catch {
      return "hell";
    }
  };
  const [thema, setThema] = useState<HandbuchThema>(lesen);
  useEffect(() => {
    const neu = () => setThema(lesen());
    let medium: MediaQueryList | null = null;
    try {
      medium = window.matchMedia("(prefers-color-scheme: dark)");
      medium.addEventListener?.("change", neu);
    } catch {
      medium = null;
    }
    const beobachter = new MutationObserver(neu);
    beobachter.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      medium?.removeEventListener?.("change", neu);
      beobachter.disconnect();
    };
  }, []);
  return thema;
}

/** Setzt Titel und Beschreibung der Seite für die Dauer des Besuchs. */
export function useSeitenTitel(titel: string, beschreibung?: string) {
  useEffect(() => {
    const vorher = document.title;
    document.title = titel;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const vorherBeschreibung = meta?.getAttribute("content") ?? null;
    if (beschreibung) {
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", beschreibung);
    }
    return () => {
      document.title = vorher;
      if (meta && vorherBeschreibung !== null) meta.setAttribute("content", vorherBeschreibung);
    };
  }, [titel, beschreibung]);
}

/**
 * Blendet Abschnitte beim Hereinscrollen einmal weich ein (CSS `.hb-ein`).
 *
 * Grundsätze wie bei `components/landing/Reveal.tsx`: Sichtbar ist der
 * Normalzustand. Versteckt wird nur, was beim Laden noch unter dem
 * Sichtfeld liegt, und nur, wenn IntersectionObserver da ist, keine
 * reduzierte Bewegung gewünscht ist und kein PDF-Export läuft. Nebeneinander
 * liegende Karten kommen leicht gestaffelt. Nach dem Einblenden wird die
 * Klasse wieder entfernt, damit die Karten ihre eigenen Übergänge (Hover)
 * zurückbekommen.
 *
 * `auswahl` nennt die Ziele; liegt ein Ziel in einem anderen, zählt nur das
 * äußere. `bereit` erlaubt, auf nachgeladene Inhalte zu warten.
 */
export function useEinblenden(auswahl: string, bereit: unknown = true) {
  useEffect(() => {
    if (!bereit || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (document.documentElement.hasAttribute("data-pdf-freezing")) return;

    const alle = Array.from(document.querySelectorAll<HTMLElement>(auswahl));
    const ziele = alle.filter(
      (el) => !alle.some((anderes) => anderes !== el && anderes.contains(el)) && el.getBoundingClientRect().top > window.innerHeight * 0.9,
    );
    if (ziele.length === 0) return;

    const timer: number[] = [];
    const zeigen = (el: HTMLElement) => {
      el.classList.remove("hb-ein-wartet");
      timer.push(window.setTimeout(() => el.classList.remove("hb-ein"), 900));
    };
    for (const el of ziele) {
      const geschwister = ziele.filter((z) => z.parentElement === el.parentElement);
      el.style.setProperty("--hb-verzug", `${Math.min(geschwister.indexOf(el), 5) * 70}ms`);
      el.classList.add("hb-ein", "hb-ein-wartet");
    }
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        for (const e of eintraege) {
          if (!e.isIntersecting) continue;
          beobachter.unobserve(e.target);
          zeigen(e.target as HTMLElement);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    ziele.forEach((z) => beobachter.observe(z));

    return () => {
      beobachter.disconnect();
      timer.forEach((t) => window.clearTimeout(t));
      for (const el of ziele) {
        el.classList.remove("hb-ein", "hb-ein-wartet");
        el.style.removeProperty("--hb-verzug");
      }
    };
  }, [auswahl, bereit]);
}

/**
 * Ein Wert, der einmal hochzählt, wenn er ins Bild kommt. `text` bekommt den
 * Anteil von 0 bis 1 und formatiert selbst, so zählt auch eine Spanne wie
 * „158.000 bis 222.000 €“. Der Endwert ist der Normalzustand (`useCountUp`).
 */
export function Hochzaehlen({ text, auchSichtbar = false }: { text: (anteil: number) => string; auchSichtbar?: boolean }) {
  const { ref, display } = useCountUp({ end: 1000, duration: 1100, format: (w) => text(w / 1000), auchSichtbar });
  return <span ref={ref}>{display}</span>;
}

/** Zwischenwert beim Hochzählen, auf `schritt` gerundet; am Ende exakt. */
export function anteilig(wert: number, anteil: number, schritt = 1000): number {
  return anteil >= 1 ? wert : Math.round((wert * anteil) / schritt) * schritt;
}

/**
 * Ein weicher Lichtkegel im Hintergrund, der dem Mauszeiger folgt. Schreibt
 * nur zwei CSS-Variablen (`--hb-mx`, `--hb-my`) an das Element, gebündelt auf
 * einen Bildaufbau; wie das Licht aussieht, steht im Stil der Seite. Aus bei
 * Touch, bei „weniger Bewegung“ und im PDF-Export. `data-hb-licht` sagt dem
 * Stil, dass das Licht an ist.
 */
export function useMausLicht(ref: { current: HTMLElement | null }, bereit: unknown = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !bereit || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (document.documentElement.hasAttribute("data-pdf-freezing")) return;

    let x = 0;
    let y = 0;
    let geplant = false;
    const zeichne = () => {
      geplant = false;
      el.style.setProperty("--hb-mx", `${x}px`);
      el.style.setProperty("--hb-my", `${y}px`);
      el.setAttribute("data-hb-licht", "");
    };
    const bewegt = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (!geplant) {
        geplant = true;
        requestAnimationFrame(zeichne);
      }
    };
    const weg = () => el.removeAttribute("data-hb-licht");
    document.addEventListener("pointermove", bewegt, { passive: true });
    document.documentElement.addEventListener("pointerleave", weg);
    return () => {
      document.removeEventListener("pointermove", bewegt);
      document.documentElement.removeEventListener("pointerleave", weg);
      weg();
      el.style.removeProperty("--hb-mx");
      el.style.removeProperty("--hb-my");
    };
  }, [ref, bereit]);
}
