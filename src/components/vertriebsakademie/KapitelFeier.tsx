// Konfetti und Einblender, wenn ein Kapitel auf 100 Prozent springt.
//
// Der Geschäftsführer wollte genau das: Konfetti und einen Glückwunsch, der
// nach drei Sekunden von selbst verschwindet. Einmal je Kapitel, nicht je
// Aufgabe, sonst nutzt es sich nach zehn Aufgaben ab. Wann gefeiert wird,
// entscheidet `feierEntscheiden` in `vertriebsakademieFeier.ts`, gemerkt
// wird es im Fortschrittsspeicher (`gefeiert`), damit es auf keinem Gerät
// ein zweites Mal kommt.
//
// Das Konfetti ist ein eigenes Canvas, keine Abhängigkeit. Wer reduzierte
// Bewegung eingestellt hat, sieht nur den Einblender.

import { useEffect, useRef, useState } from "react";
import { PartyPopper, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GEFEIERT_AKADEMIE, useVaFortschrittGeladen, useVaProgress, vaProgress,
} from "@/lib/vertriebsakademieProgress";
import {
  EINBLENDER_MS, KONFETTI, feierEntscheiden, feierText, type FeierArt,
} from "@/lib/vertriebsakademieFeier";
import { reduzierteBewegung } from "@/components/vertriebsakademie/aufgaben/AufgabenHelfer";

interface Props {
  slug: string;
  titel: string;
  /** Kapitelstand aus `computeKapitelStats(...).pct`. */
  pct: number;
  /** Stehen alle Kapitel auf 100 Prozent? */
  alleKapitelFertig: boolean;
}

/** Die Seite hängt sie mit `key={slug}` ein, damit jedes Kapitel bei null anfängt. */
export function KapitelFeier({ slug, titel, pct, alleKapitelFertig }: Props) {
  const state = useVaProgress();
  const geladen = useVaFortschrittGeladen();
  const vorherPct = useRef<number | null>(null);
  const [anzeige, setAnzeige] = useState<Exclude<FeierArt, "keine"> | null>(null);

  const kapitelGefeiert = !!state.gefeiert?.[slug];
  const akademieGefeiert = !!state.gefeiert?.[GEFEIERT_AKADEMIE];

  useEffect(() => {
    // Vor dem ersten Abgleich mit der Datenbank nur zusehen: Der geladene
    // Stand kann das Kapitel auf 100 setzen, das ist kein Erfolg von eben.
    if (!geladen) return;

    if (vorherPct.current === null) {
      vorherPct.current = pct;
      // Ein Kapitel, das beim Öffnen schon fertig ist, wurde früher
      // abgeschlossen. Still als gefeiert merken, sonst käme das Konfetti
      // beim nächsten Auf- und Zumachen nachträglich.
      if (pct >= 100 && !kapitelGefeiert) vaProgress.setGefeiert(slug);
      if (pct >= 100 && alleKapitelFertig && !akademieGefeiert) vaProgress.setGefeiert(GEFEIERT_AKADEMIE);
      return;
    }

    const art = feierEntscheiden({
      vorherPct: vorherPct.current,
      nachherPct: pct,
      kapitelGefeiert,
      alleKapitelFertig,
      akademieGefeiert,
    });
    vorherPct.current = pct;
    if (art === "keine") return;
    vaProgress.setGefeiert(slug);
    if (art === "akademie") vaProgress.setGefeiert(GEFEIERT_AKADEMIE);
    setAnzeige(art);
  }, [pct, geladen, slug, kapitelGefeiert, akademieGefeiert, alleKapitelFertig]);

  useEffect(() => {
    if (!anzeige) return;
    const t = setTimeout(() => setAnzeige(null), EINBLENDER_MS);
    return () => clearTimeout(t);
  }, [anzeige]);

  if (!anzeige) return null;
  const gross = anzeige === "akademie";

  return (
    <>
      {!reduzierteBewegung() && <Konfetti anzahl={KONFETTI[anzeige].anzahl} dauerMs={KONFETTI[anzeige].dauerMs} />}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "va-einblender fixed left-1/2 top-4 z-[71] flex items-center gap-2.5 rounded-xl border bg-card shadow-xl",
          gross
            ? "border-amber-400/60 px-5 py-3.5 text-sm md:text-base font-semibold"
            : "border-emerald-500/40 px-4 py-2.5 text-sm font-medium",
        )}
        style={{ maxWidth: "calc(100vw - 2rem)" }}
      >
        {gross
          ? <Trophy className="h-5 w-5 shrink-0 text-amber-500" />
          : <PartyPopper className="h-4 w-4 shrink-0 text-emerald-600" />}
        <span>{feierText(anzeige, titel)}</span>
      </div>
    </>
  );
}

// ── Konfetti ──────────────────────────────────────────────────────────────

interface Teilchen {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; drehung: number; drehTempo: number;
  farbe: string;
}

/** Hausfarben: Markenblau aus den Design-Tokens, dazu Hellblau, Grün, Bernstein, Weiß. */
function farben(): string[] {
  let primary = "204 92% 41%";
  try {
    const wert = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    if (wert) primary = wert;
  } catch { /* ohne Stylesheet bleibt der Standard */ }
  return [`hsl(${primary})`, "hsl(204 100% 77%)", "rgb(16 185 129)", "#F59E0B", "#FFFFFF"];
}

function Konfetti({ anzahl, dauerMs }: { anzahl: number; dauerMs: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const b = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = b * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const palette = farben();
    const teilchen: Teilchen[] = Array.from({ length: anzahl }, () => ({
      // Zwei Quellen links und rechts unten, die nach oben in die Mitte schießen.
      x: Math.random() < 0.5 ? b * 0.15 : b * 0.85,
      y: h * 0.75,
      vx: (Math.random() - 0.5) * 14,
      vy: -(10 + Math.random() * 12),
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      drehung: Math.random() * Math.PI,
      drehTempo: (Math.random() - 0.5) * 0.3,
      farbe: palette[Math.floor(Math.random() * palette.length)],
    }));
    for (const t of teilchen) t.vx += t.x < b / 2 ? 4 : -4;

    let raf = 0;
    const start = performance.now();
    const zeichnen = (jetzt: number) => {
      const anteil = Math.min(1, (jetzt - start) / dauerMs);
      ctx.clearRect(0, 0, b, h);
      const alpha = anteil > 0.7 ? 1 - (anteil - 0.7) / 0.3 : 1;
      for (const t of teilchen) {
        t.vy += 0.45;          // Schwerkraft
        t.vx *= 0.99;          // Luftwiderstand
        t.x += t.vx;
        t.y += t.vy;
        t.drehung += t.drehTempo;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(t.x, t.y);
        ctx.rotate(t.drehung);
        ctx.fillStyle = t.farbe;
        ctx.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
        ctx.restore();
      }
      if (anteil < 1) raf = requestAnimationFrame(zeichnen);
      else ctx.clearRect(0, 0, b, h);
    };
    raf = requestAnimationFrame(zeichnen);
    return () => cancelAnimationFrame(raf);
  }, [anzahl, dauerMs]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70]"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
