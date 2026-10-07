import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Star, Quote, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KUNDENSTIMMEN_FULL, KUNDENSTIMMEN_KURZ } from "@/lib/kundenstimmenData";

export function KundenstimmenSection() {
  const bandRef1 = useRef<HTMLDivElement>(null);
  const bandRef2 = useRef<HTMLDivElement>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Slideshow Auto-Advance (alle 7 Sekunden)
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setSlideIdx((i) => (i + 1) % KUNDENSTIMMEN_FULL.length);
    }, 7000);
    return () => clearInterval(id);
  }, [paused]);

  // Auto-scroll loop für die zwei Bänder (rechts→links und links→rechts)
  useEffect(() => {
    let raf: number;
    let pos1 = 0;
    let pos2 = 0;
    const speed = 0.4;

    const tick = () => {
      if (bandRef1.current) {
        pos1 -= speed;
        const half = bandRef1.current.scrollWidth / 2;
        if (Math.abs(pos1) >= half) pos1 = 0;
        bandRef1.current.style.transform = `translate3d(${pos1}px,0,0)`;
      }
      if (bandRef2.current) {
        pos2 += speed;
        const half = bandRef2.current.scrollWidth / 2;
        if (pos2 >= half) pos2 = 0;
        bandRef2.current.style.transform = `translate3d(${pos2 - half}px,0,0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const band1 = [...KUNDENSTIMMEN_KURZ.slice(0, 15), ...KUNDENSTIMMEN_KURZ.slice(0, 15)];
  const band2 = [...KUNDENSTIMMEN_KURZ.slice(15), ...KUNDENSTIMMEN_KURZ.slice(15)];

  const current = KUNDENSTIMMEN_FULL[slideIdx];
  const goPrev = () => setSlideIdx((i) => (i - 1 + KUNDENSTIMMEN_FULL.length) % KUNDENSTIMMEN_FULL.length);
  const goNext = () => setSlideIdx((i) => (i + 1) % KUNDENSTIMMEN_FULL.length);

  return (
    <div className="space-y-6">
      {/* Slideshow der 5 großen Stimmen */}
      <div
        className="relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <Card key={current.id} className="p-6 lg:p-8 transition-all duration-500 animate-in fade-in">
          <div className="flex items-start gap-4 mb-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xl shrink-0">
              {current.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base">{current.name}</div>
              <div className="text-sm text-muted-foreground">
                {current.alter} J. · {current.beruf} · {current.ort}
              </div>
            </div>
            <div className="flex">
              {Array.from({ length: current.rating }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-destructive/5 border border-destructive/20 rounded-md p-4">
              <div className="text-xs uppercase tracking-wider text-destructive font-semibold mb-2">
                Vorher
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{current.vorher}</p>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-md p-4">
              <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2 flex items-center gap-1">
                <ArrowRight className="h-3 w-3" /> Nachher
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{current.nachher}</p>
            </div>
          </div>

          <div className="border-l-2 border-primary pl-4 py-1">
            <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-primary font-semibold mb-1">
              <Quote className="h-3 w-3" /> Wie MOREImmo geholfen hat
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.hilfe}</p>
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-3">
          <Button variant="outline" size="sm" onClick={goPrev} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Zurück
          </Button>

          <div className="flex items-center gap-1.5">
            {KUNDENSTIMMEN_FULL.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIdx(i)}
                className={`h-2 rounded-full transition-all ${
                  i === slideIdx ? "w-6 bg-primary" : "w-2 bg-muted hover:bg-muted-foreground/40"
                }`}
                aria-label={`Stimme ${i + 1}`}
              />
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={goNext} className="gap-1">
            Weiter <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 30 kleine Bewertungen in 2 gegenläufigen Bändern */}
      <div className="space-y-3 pt-2">
        <div className="text-xs text-muted-foreground text-center">Weitere Bewertungen unserer Kunden</div>

        <div className="relative overflow-hidden py-2">
          <div ref={bandRef1} className="flex gap-3 will-change-transform" style={{ width: "max-content" }}>
            {band1.map((k, i) => (
              <KleinKachel key={`b1-${i}`} k={k} />
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden py-2">
          <div ref={bandRef2} className="flex gap-3 will-change-transform" style={{ width: "max-content" }}>
            {band2.map((k, i) => (
              <KleinKachel key={`b2-${i}`} k={k} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KleinKachel({ k }: { k: { name: string; text: string; rating: number } }) {
  return (
    <div className="shrink-0 w-72 bg-card border rounded-lg p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold shrink-0">
          {k.name.charAt(0)}
        </div>
        <div className="text-xs font-semibold flex-1 truncate">{k.name}</div>
        <div className="flex">
          {Array.from({ length: k.rating }).map((_, i) => (
            <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">"{k.text}"</p>
    </div>
  );
}
