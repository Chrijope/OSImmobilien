import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { REFERENZ_TEXTE, type ReferenzSprache } from "@/lib/referenzenTexte";
import { useSeitenSprache } from "@/components/SeitenSprache";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";

import frankfurtFassade from "@/assets/lp/frankfurt-fassade.jpg.asset.json";
import frankfurtBad from "@/assets/lp/frankfurt-bad.jpg.asset.json";
import frankfurtZimmer1 from "@/assets/lp/frankfurt-zimmer1.jpg.asset.json";
import frankfurtZimmer2 from "@/assets/lp/frankfurt-zimmer2.jpg.asset.json";
import frankfurtZimmer3 from "@/assets/lp/frankfurt-zimmer3.jpg.asset.json";
import frankfurtKueche from "@/assets/lp/frankfurt-kueche.jpg.asset.json";
import projekt3_01 from "@/assets/lp/projekt3-01.jpg.asset.json";
import projekt3_02 from "@/assets/lp/projekt3-02.jpg.asset.json";
import projekt3_03 from "@/assets/lp/projekt3-03.jpg.asset.json";
import projekt3_04 from "@/assets/lp/projekt3-04.jpg.asset.json";
import projekt3_05 from "@/assets/lp/projekt3-05.jpg.asset.json";
import projekt3_06 from "@/assets/lp/projekt3-06.jpg.asset.json";
import projekt3_07 from "@/assets/lp/projekt3-07.jpg.asset.json";
import projekt3_08 from "@/assets/lp/projekt3-08.jpg.asset.json";
import projekt3_09 from "@/assets/lp/projekt3-09.jpg.asset.json";
import projekt3_10 from "@/assets/lp/projekt3-10.jpg.asset.json";
import projekt3_11 from "@/assets/lp/projekt3-11.jpg.asset.json";
import projekt3_12 from "@/assets/lp/projekt3-12.jpg.asset.json";
import projekt3_13 from "@/assets/lp/projekt3-13.jpg.asset.json";
import projekt4_01 from "@/assets/lp/projekt4-01.jpg.asset.json";
import projekt4_02 from "@/assets/lp/projekt4-02.jpg.asset.json";
import projekt4_03 from "@/assets/lp/projekt4-03.jpg.asset.json";
import projekt4_04 from "@/assets/lp/projekt4-04.jpg.asset.json";
import projekt4_05 from "@/assets/lp/projekt4-05.jpg.asset.json";
import projekt4_06 from "@/assets/lp/projekt4-06.jpg.asset.json";
import projekt4_07 from "@/assets/lp/projekt4-07.jpg.asset.json";
import projekt4_08 from "@/assets/lp/projekt4-08.jpg.asset.json";
import projekt4_09 from "@/assets/lp/projekt4-09.jpg.asset.json";
import projekt4_10 from "@/assets/lp/projekt4-10.jpg.asset.json";
import projekt4_11 from "@/assets/lp/projekt4-11.jpg.asset.json";
import projekt5_01 from "@/assets/lp/projekt5-01.jpg.asset.json";
import projekt5_02 from "@/assets/lp/projekt5-02.jpg.asset.json";
import projekt5_03 from "@/assets/lp/projekt5-03.jpg.asset.json";
import projekt5_04 from "@/assets/lp/projekt5-04.jpg.asset.json";
import projekt5_05 from "@/assets/lp/projekt5-05.jpg.asset.json";
import projekt5_06 from "@/assets/lp/projekt5-06.jpg.asset.json";
import projekt5_07 from "@/assets/lp/projekt5-07.jpg.asset.json";
import projekt6_01 from "@/assets/lp/projekt6-01.jpg.asset.json";
import projekt6_02 from "@/assets/lp/projekt6-02.jpg.asset.json";
import projekt6_03 from "@/assets/lp/projekt6-03.jpg.asset.json";
import projekt6_04 from "@/assets/lp/projekt6-04.jpg.asset.json";
import projekt6_05 from "@/assets/lp/projekt6-05.jpg.asset.json";
import projekt6_06 from "@/assets/lp/projekt6-06.jpg.asset.json";
import projekt6_07 from "@/assets/lp/projekt6-07.jpg.asset.json";
import projekt6_08 from "@/assets/lp/projekt6-08.jpg.asset.json";
import projekt6_09 from "@/assets/lp/projekt6-09.jpg.asset.json";
import projekt6_10 from "@/assets/lp/projekt6-10.jpg.asset.json";
import projekt6_11 from "@/assets/lp/projekt6-11.jpg.asset.json";
import projekt6_12 from "@/assets/lp/projekt6-12.jpg.asset.json";
import projekt6_13 from "@/assets/lp/projekt6-13.jpg.asset.json";
import projekt6_14 from "@/assets/lp/projekt6-14.jpg.asset.json";
import projekt6_15 from "@/assets/lp/projekt6-15.jpg.asset.json";
import projekt6_16 from "@/assets/lp/projekt6-16.jpg.asset.json";
import projekt6_17 from "@/assets/lp/projekt6-17.jpg.asset.json";
import projekt7_01 from "@/assets/lp/projekt7-01.jpg.asset.json";
import projekt7_02 from "@/assets/lp/projekt7-02.jpg.asset.json";
import projekt7_03 from "@/assets/lp/projekt7-03.jpg.asset.json";
import projekt7_04 from "@/assets/lp/projekt7-04.jpg.asset.json";
import projekt7_05 from "@/assets/lp/projekt7-05.jpg.asset.json";
import projekt7_06 from "@/assets/lp/projekt7-06.jpg.asset.json";
import projekt7_07 from "@/assets/lp/projekt7-07.jpg.asset.json";
import projekt7_08 from "@/assets/lp/projekt7-08.jpg.asset.json";
import projekt7_09 from "@/assets/lp/projekt7-09.jpg.asset.json";

const projects = [
  {
    images: [frankfurtFassade.url, frankfurtBad.url, frankfurtZimmer1.url, frankfurtZimmer2.url, frankfurtZimmer3.url, frankfurtKueche.url],
  },
  {
    images: [projekt6_01.url, projekt6_02.url, projekt6_03.url, projekt6_04.url, projekt6_05.url, projekt6_06.url, projekt6_07.url, projekt6_08.url, projekt6_09.url, projekt6_10.url, projekt6_11.url, projekt6_12.url, projekt6_13.url, projekt6_14.url, projekt6_15.url, projekt6_16.url, projekt6_17.url],
  },
  {
    images: [projekt7_01.url, projekt7_02.url, projekt7_03.url, projekt7_04.url, projekt7_05.url, projekt7_06.url, projekt7_07.url, projekt7_08.url, projekt7_09.url],
  },
  {
    images: [projekt4_01.url, projekt4_02.url, projekt4_03.url, projekt4_04.url, projekt4_05.url, projekt4_06.url, projekt4_07.url, projekt4_08.url, projekt4_09.url, projekt4_10.url, projekt4_11.url],
  },
  {
    images: [projekt3_01.url, projekt3_02.url, projekt3_03.url, projekt3_04.url, projekt3_05.url, projekt3_06.url, projekt3_07.url, projekt3_08.url, projekt3_09.url, projekt3_10.url, projekt3_11.url, projekt3_12.url, projekt3_13.url],
  },
  {
    images: [projekt5_01.url, projekt5_02.url, projekt5_03.url, projekt5_04.url, projekt5_05.url, projekt5_06.url, projekt5_07.url],
  },
  {
    // Bilder liegen als statische Dateien unter public, deshalb hier direkte Pfade statt Asset-Importe
    images: [
      "/beispielrechnungen/neubau/neubau-01.jpg",
      "/beispielrechnungen/neubau/neubau-02.jpg",
      "/beispielrechnungen/neubau/neubau-08.jpg",
      "/beispielrechnungen/neubau/neubau-06.jpg",
      "/beispielrechnungen/neubau/neubau-07.jpg",
      "/beispielrechnungen/neubau/neubau-05.jpg",
    ],
  },
];

const ImageSlideshow = ({
  images,
  alt,
  autoWechsel = true,
  zurueckLabel,
  weiterLabel,
}: {
  images: string[];
  alt: string;
  /** Bilder alle fuenf Sekunden selbst weiterschalten. */
  autoWechsel?: boolean;
  zurueckLabel: string;
  weiterLabel: string;
}) => {
  const [current, setCurrent] = useState(0);
  const next = useCallback(() => setCurrent((c) => (c + 1) % images.length), [images.length]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + images.length) % images.length), [images.length]);

  useEffect(() => {
    // In der Beratungspraesentation laeuft der Wechsel nicht automatisch: Der
    // Berater spricht zu einem Bild und soll das Tempo selbst bestimmen, statt
    // mitten im Satz vom naechsten Bild ueberholt zu werden.
    if (!autoWechsel) return;
    if (images.length <= 1) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [autoWechsel, images.length, next]);

  return (
    <div className="relative w-full h-[240px] md:h-[280px]">
      {images.map((img, i) => (
        <img
          key={i}
          src={img}
          alt={`${alt} ${i + 1}`}
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === current ? "opacity-100" : "opacity-0"}`}
          onError={(e) => {
            // Selbstheilung fuer Live-Praesentationen: Bricht ein Bild beim
            // Laden ab (etwa bei knapper Bandbreite waehrend eines Videocalls
            // mit Bildschirmfreigabe), bleibt ein <img> sonst dauerhaft leer.
            // Zwei erneute Versuche mit Wartezeit, dann aufgeben.
            const ziel = e.currentTarget;
            const versuch = Number(ziel.dataset.retry || "0");
            if (versuch >= 2) return;
            ziel.dataset.retry = String(versuch + 1);
            const quelle = img;
            window.setTimeout(() => {
              ziel.src = `${quelle}${quelle.includes("?") ? "&" : "?"}retry=${versuch + 1}`;
            }, 1500 * (versuch + 1));
          }}
        />
      ))}
      {images.length > 1 && (
        <>
          <button onClick={prev} aria-label={zurueckLabel} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/85 hover:bg-white shadow-md backdrop-blur-sm transition-colors z-10">
            <ChevronLeft className="w-4 h-4 text-[hsl(30,8%,16%)]" />
          </button>
          <button onClick={next} aria-label={weiterLabel} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/85 hover:bg-white shadow-md backdrop-blur-sm transition-colors z-10">
            <ChevronRight className="w-4 h-4 text-[hsl(30,8%,16%)]" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {images.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === current ? "bg-white w-4" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Die Sprache kommt vom Aufrufer (Beratungspräsentation OS Immobilien) oder, wenn
 * keiner sie nennt, von der öffentlichen Seite (`SeitenSpracheProvider`).
 * Ohne beides bleibt es Deutsch, wie in der Beratungspräsentation und im CRM.
 */
const BeforeAfterSection = ({
  autoWechsel = true,
  sprache,
}: { autoWechsel?: boolean; sprache?: ReferenzSprache } = {}) => {
  const seitenSprache = useSeitenSprache();
  const texte = REFERENZ_TEXTE[sprache ?? seitenSprache];
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <section className="py-16 md:py-28 lp-section-light">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-10 md:mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-4 h-1 rounded-full bg-primary/40" />
          </div>
          <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">{texte.kicker}</span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-4 tracking-tight">
            {texte.titel}{" "}
            <span className="lp-text-gradient">{texte.titelBetont}</span>
          </h2>
          <p className="text-[hsl(220,10%,46%)] max-w-2xl mx-auto text-sm md:text-base">
            {texte.text}
          </p>
        </div>

        <Carousel opts={{ align: "start", loop: false }} setApi={setApi} className="w-full">
          <CarouselContent className="-ml-4 md:-ml-6">
            {projects.map((project, idx) => {
              const text = texte.projekte[idx];
              return (
              <CarouselItem
                key={`${text.name}-${idx}`}
                className="pl-4 md:pl-6 basis-full md:basis-1/2 lg:basis-1/3"
              >
                <div className="h-full rounded-xl overflow-hidden bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)] border border-[hsl(40,15%,88%)] hover:shadow-[0_12px_40px_-8px_hsla(220,20%,14%,0.12)] transition-shadow duration-300 flex flex-col">
                  <ImageSlideshow
                    images={project.images}
                    alt={text.name}
                    autoWechsel={autoWechsel}
                    zurueckLabel={texte.bildZurueck}
                    weiterLabel={texte.bildWeiter}
                  />
                  <div className="p-5 md:p-6 flex flex-col flex-1">
                    <div className="inline-block self-start px-3 py-1 rounded-full bg-primary/10 text-foreground text-xs font-medium tracking-wider mb-3">
                      {text.location}
                    </div>
                    <h3 className="text-lg md:text-xl font-semibold text-[hsl(220,20%,14%)] mb-2">
                      {text.name}
                    </h3>
                    <p className="text-sm text-[hsl(220,10%,46%)] leading-relaxed">
                      {text.desc}
                    </p>
                  </div>
                </div>
              </CarouselItem>
              );
            })}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex -left-4 lg:-left-12" aria-label={texte.projektZurueck} />
          <CarouselNext className="hidden md:flex -right-4 lg:-right-12" aria-label={texte.projektWeiter} />
        </Carousel>

        {/* Mobile slider controls */}
        {count > 1 && (
          <div className="flex md:hidden items-center justify-center gap-4 mt-6">
            <button
              onClick={() => api?.scrollPrev()}
              aria-label={texte.projektZurueck}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-[hsl(40,15%,88%)] shadow-sm hover:bg-primary/5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-[hsl(30,8%,16%)]" />
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: count }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => api?.scrollTo(i)}
                  aria-label={`${texte.projekt} ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? "bg-primary w-5" : "bg-[hsl(220,10%,70%)] w-1.5"}`}
                />
              ))}
            </div>
            <button
              onClick={() => api?.scrollNext()}
              aria-label={texte.projektWeiter}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-[hsl(40,15%,88%)] shadow-sm hover:bg-primary/5 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-[hsl(30,8%,16%)]" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default BeforeAfterSection;
