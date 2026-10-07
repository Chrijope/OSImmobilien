import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

/* ─── Bewegungs-Helfer für die Vertriebspartner-Landingpage ───
   Alle Effekte laufen ohne zusätzliche Abhängigkeiten: CSS-Keyframes (vp-*
   in index.css), IntersectionObserver für Scroll-Einsätze und Pausen,
   requestAnimationFrame nur im vorhandenen useCountUp. Bei
   prefers-reduced-motion steht alles (CSS) und Inhalte sind sofort sichtbar. */

export const nutztReduzierteBewegung = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Blendet Kinder beim Hereinscrollen ein. Ohne Bewegungswunsch: sofort sichtbar.
 *
 * `art="auf"` laesst die Flaeche stattdessen aufgehen: ein Zuschnitt, der sich
 * von innen nach aussen oeffnet. Das ist die betonte Fassung und gehoert an
 * wenige Stellen, sonst hebt sie nichts mehr hervor.
 */
export const Reveal = ({
  children,
  className,
  delay = 0,
  art = "steigen",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  art?: "steigen" | "auf";
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drin, setDrin] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (nutztReduzierteBewegung()) {
      setDrin(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setDrin(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${art === "auf" ? "vp-auf" : "vp-reveal"} ${drin ? "vp-in" : ""} ${className ?? ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};

/** Bühne für Dauerschleifen: pausiert alle CSS-Animationen der Kinder,
    solange die Bühne nicht im Sichtfenster ist (Akku und Ladezeit). */
export const LoopBuehne = ({ children, className, dekorativ = false }: { children: ReactNode; className?: string; dekorativ?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [sichtbar, setSichtbar] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setSichtbar(e.isIntersecting), { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden={dekorativ || undefined}
      className={`vp-loop ${sichtbar ? "" : "vp-loop-pausiert"} ${className ?? ""}`}
    >
      {children}
    </div>
  );
};

/** Bühne für Grafiken, die sich genau einmal zeichnen (stroke-dashoffset).
    Fügt die Klasse vp-in hinzu, sobald der Anteil `schwelle` sichtbar ist,
    und pausiert enthaltene Dauerbewegungen (etwa den Anstoß-Ring) außerhalb
    des Sichtfensters. Bei reduzierter Bewegung steht alles sofort. */
export const ZeichnenBuehne = ({
  children,
  className,
  schwelle = 0.3,
  dekorativ = true,
}: { children: ReactNode; className?: string; schwelle?: number; dekorativ?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drin, setDrin] = useState(false);
  const [sichtbar, setSichtbar] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (nutztReduzierteBewegung()) {
      setDrin(true);
      setSichtbar(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        setSichtbar(e.isIntersecting);
        if (e.isIntersecting) setDrin(true);
      },
      { threshold: schwelle },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [schwelle]);

  return (
    <div
      ref={ref}
      aria-hidden={dekorativ || undefined}
      className={`vp-zeichnen vp-loop ${drin ? "vp-in" : ""} ${sichtbar ? "" : "vp-loop-pausiert"} ${className ?? ""}`}
    >
      {children}
    </div>
  );
};

/** Wortweises Aufblenden einer Zeile (Hero und Finale). */
export const Worte = ({ text, className, offset = 0 }: { text: string; className?: string; offset?: number }) => {
  const woerter = text.split(" ");
  return (
    <>
      {woerter.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span
            className={`vp-wort ${className ?? ""}`}
            style={{ animationDelay: `${offset + i * 70}ms` }}
          >
            {w}
          </span>
          {/* Leerzeichen außerhalb des Inline-Block-Spans, sonst kollabiert es */}
          {i < woerter.length - 1 ? " " : ""}
        </Fragment>
      ))}
    </>
  );
};

/* ─── G1 · Partnernetz aus Lichtpunkten (Hero-Hintergrund) ───
   TG: „Dein Netzwerk ist mehr wert, als Du denkst."
   VP: „Ein Partnernetz, kein Einzelkampf." */
export const NetzwerkSchleife = () => {
  const punkte: Array<[number, number]> = [
    [80, 120], [220, 60], [380, 150], [560, 80], [700, 190],
    [140, 320], [320, 280], [520, 330], [680, 420], [240, 460],
    [440, 470], [620, 540], [90, 540], [760, 320],
  ];
  const linien: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 4], [2, 6], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [7, 10], [4, 13], [8, 13], [12, 9], [0, 5], [3, 7],
  ];
  return (
    <svg viewBox="0 0 800 600" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      {linien.map(([a, b], i) => (
        <line
          key={i}
          x1={punkte[a][0]} y1={punkte[a][1]} x2={punkte[b][0]} y2={punkte[b][1]}
          stroke="hsl(var(--primary))" strokeOpacity={0.16} strokeWidth={1.2}
          className="vp-netz-linie"
          style={{ animationDelay: `${-(i * 0.7)}s` }}
        />
      ))}
      {punkte.map(([x, y], i) => (
        <circle
          key={i}
          cx={x} cy={y} r={i % 3 === 0 ? 3.5 : 2.5}
          fill="hsl(var(--primary))"
          className="vp-netz-punkt"
          style={{ animationDelay: `${-(i * 0.5)}s` }}
        />
      ))}
    </svg>
  );
};

/* ─── Hero-Kachel: das Beratungsvideo, eingebunden wie in der
   Beratungspräsentation (BeratungspraesentationHV.tsx) ───
   Das Video läuft stumm und in Schleife. Die Tonspur ist bereits in der
   Datei entfernt, `muted` ist zusätzlich nötig, weil Browser sonst nicht
   automatisch starten. `playsInline` verhindert, dass iOS in den
   Vollbildmodus wechselt. Das Poster (Standbild aus dem Video) dient als
   Vorschau, solange das Video lädt, und ist bei reduzierter Bewegung die
   einzige Darstellung. Außerhalb des Sichtfensters pausiert die Schleife.
   HINWEIS FÜR SPÄTER: Sobald ein echtes Teamfoto oder ein eigenes Video
   vorliegt, hier nur `src` und `poster` austauschen (gleicher Container,
   gleiche Rundung), dann steht das neue Material mit einem Handgriff drin. */
export const HeroVideo = () => {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduziert] = useState(nutztReduzierteBewegung);
  const [zeigeKnopf, setZeigeKnopf] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || reduziert) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          // Wenn Autoplay scheitert (etwa Stromsparmodus auf Mobilgeräten),
          // bleibt das Poster stehen und ein Abspielknopf erscheint.
          video.play().then(() => setZeigeKnopf(false)).catch(() => setZeigeKnopf(true));
        } else {
          video.pause();
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(video);
    return () => obs.disconnect();
  }, [reduziert]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={ref}
        src="/video/beratung-hero.mp4"
        poster="/images/beratung-hero-poster.jpg"
        autoPlay={!reduziert}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Persönliche MOREImmo Beratung"
        className="h-full w-full object-cover"
      />
      {zeigeKnopf && (
        <button
          type="button"
          onClick={() => {
            ref.current?.play().then(() => setZeigeKnopf(false)).catch(() => undefined);
          }}
          aria-label="Video abspielen"
          className="absolute inset-0 flex items-center justify-center bg-black/20"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-[hsl(204_75%_35%)]" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
};

/* Abstrakte Premium-Bühne (Stadt und Partnernetz), aktuell nicht im Einsatz:
   der Hero zeigt das Beratungsvideo. Bleibt als Reserve erhalten. */
export const HeroBuehne = () => (
  <svg viewBox="0 0 640 640" className="h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Abstrakte Stadtsilhouette mit Partnernetz">
    <defs>
      <linearGradient id="vpHimmel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(204 75% 22%)" />
        <stop offset="55%" stopColor="hsl(204 70% 32%)" />
        <stop offset="100%" stopColor="hsl(204 62% 44%)" />
      </linearGradient>
      <linearGradient id="vpStadtFern" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(204 45% 36%)" />
        <stop offset="100%" stopColor="hsl(204 50% 28%)" />
      </linearGradient>
      <linearGradient id="vpStadtNah" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(207 45% 20%)" />
        <stop offset="100%" stopColor="hsl(210 45% 13%)" />
      </linearGradient>
      <radialGradient id="vpGlanz" cx="0.5" cy="0.32" r="0.6">
        <stop offset="0%" stopColor="hsl(199 90% 72% / 0.5)" />
        <stop offset="100%" stopColor="hsl(199 90% 72% / 0)" />
      </radialGradient>
    </defs>

    <rect width="640" height="640" fill="url(#vpHimmel)" />
    <rect width="640" height="640" fill="url(#vpGlanz)" />

    {/* ferne Stadtreihe */}
    <path
      d="M0 430 L0 380 L50 380 L50 350 L95 350 L95 395 L140 395 L140 330 L175 330 L175 300 L215 300 L215 360 L265 360 L265 320 L310 320 L310 375 L360 375 L360 335 L400 335 L400 290 L440 290 L440 355 L490 355 L490 315 L535 315 L535 370 L585 370 L585 340 L640 340 L640 430 Z"
      fill="url(#vpStadtFern)" opacity="0.85"
    />
    {/* nahe Stadtreihe */}
    <path
      d="M0 640 L0 470 L60 470 L60 420 L120 420 L120 480 L180 480 L180 400 L230 400 L230 370 L290 370 L290 460 L350 460 L350 410 L410 410 L410 445 L470 445 L470 380 L530 380 L530 455 L590 455 L590 420 L640 420 L640 640 Z"
      fill="url(#vpStadtNah)"
    />
    {/* Fensterlichter der nahen Reihe */}
    {(
      [
        [78, 445], [96, 445], [78, 500], [96, 500], [198, 425], [214, 425],
        [246, 395], [264, 395], [246, 430], [366, 432], [384, 432], [486, 405],
        [504, 405], [486, 440], [546, 470], [564, 470], [198, 460], [604, 445],
      ] as Array<[number, number]>
    ).map(([x, y], i) => (
      <rect
        key={i}
        x={x} y={y} width="9" height="12" rx="1.5"
        fill="hsl(199 90% 72%)"
        className="vp-netz-punkt"
        style={{ animationDelay: `${-(i * 0.9)}s` }}
      />
    ))}

    {/* Partnernetz über der Stadt */}
    {(
      [
        [[90, 150], [230, 90]], [[230, 90], [400, 140]], [[400, 140], [560, 80]],
        [[560, 80], [520, 210]], [[230, 90], [310, 220]], [[90, 150], [310, 220]],
        [[310, 220], [520, 210]], [[400, 140], [310, 220]],
      ] as Array<[[number, number], [number, number]]>
    ).map(([[x1, y1], [x2, y2]], i) => (
      <line
        key={i}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="hsl(199 90% 78%)" strokeOpacity="0.35" strokeWidth="1.2"
        className="vp-netz-linie"
        style={{ animationDelay: `${-(i * 0.8)}s` }}
      />
    ))}
    {(
      [[90, 150], [230, 90], [400, 140], [560, 80], [310, 220], [520, 210]] as Array<[number, number]>
    ).map(([x, y], i) => (
      <circle
        key={i}
        cx={x} cy={y} r={i % 2 === 0 ? 4 : 3}
        fill="hsl(199 90% 82%)"
        className="vp-netz-punkt"
        style={{ animationDelay: `${-(i * 0.6)}s` }}
      />
    ))}
  </svg>
);

/* ─── G2 (VP-E und neutral) · Kurve stößt an die Decke ───
   „Dein Können" steigt, „Die Decke Deines Systems" hält es auf.
   Zeichnet sich einmalig, nur der Anstoß-Ring pulsiert als Schleife. */
export const KurveGedeckelt = () => (
  <svg viewBox="0 0 560 300" className="mx-auto w-full max-w-xl">
    <line x1="40" y1="90" x2="520" y2="90" stroke="hsl(215 16% 55%)" strokeDasharray="7 7" strokeWidth="1.5" />
    <text x="48" y="76" fontSize="13" fill="hsl(215 16% 48%)">Die Decke Deines Systems</text>
    <path
      d="M40 260 C 140 242, 200 190, 258 142 C 300 108, 380 97, 496 95"
      fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round"
      pathLength={100} className="vp-pfad"
    />
    <text x="120" y="212" fontSize="13" fill="hsl(var(--primary))">Dein Können</text>
    <circle cx="496" cy="93" r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" className="vp-anstoss-loop" />
    <circle cx="496" cy="95" r="4" fill="hsl(var(--primary))" />
    <line x1="40" y1="266" x2="520" y2="266" stroke="hsl(215 16% 70%)" strokeWidth="1" />
  </svg>
);

/* ─── G2 (VP-Q) · flache Gehaltstreppe ───
   Winzige Jahresstufen auf einer langen Geraden: „Zeit gegen Geld." */
export const GehaltsTreppe = () => (
  <svg viewBox="0 0 560 300" className="mx-auto w-full max-w-xl">
    <path
      d="M40 252 H130 V244 H220 V237 H310 V231 H400 V226 H490"
      fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      pathLength={100} className="vp-pfad"
    />
    <text x="40" y="286" fontSize="13" fill="hsl(215 16% 48%)">Zeit gegen Geld: jedes Jahr eine winzige Stufe</text>
    <circle cx="490" cy="226" r="4" fill="hsl(var(--primary))" />
    <line x1="40" y1="266" x2="520" y2="266" stroke="hsl(215 16% 70%)" strokeWidth="1" />
  </svg>
);

/* ─── G2/G5 (TG) · die Empfehlung wandert ───
   Ohne Rückfluss (Abschnitt 2): Dein Tipp löst beim anderen den Ertrag aus.
   Mit Rückfluss (Abschnitt 4): die Vergütung kommt zu Deinem Punkt zurück.
   Sanfte Schleife, pausiert über die LoopBuehne. */
export const TippWanderung = ({ rueckfluss = false }: { rueckfluss?: boolean }) => (
  <svg viewBox="0 0 560 260" className="mx-auto w-full max-w-xl">
    <line x1="95" y1="185" x2="450" y2="105" stroke="hsl(var(--primary))" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 8" />
    {/* Dein Punkt */}
    <circle cx="95" cy="185" r="7" fill="hsl(var(--primary))" />
    <text x="95" y="222" textAnchor="middle" fontSize="13" fill="hsl(215 16% 48%)">Du</text>
    {/* der andere Punkt */}
    <circle cx="450" cy="105" r="7" fill="hsl(215 16% 60%)" />
    <text x="450" y="142" textAnchor="middle" fontSize="13" fill="hsl(215 16% 48%)">Dein Kontakt</text>
    {/* die wandernde Empfehlung */}
    <circle cx="95" cy="185" r="4.5" fill="hsl(var(--primary))" className="vp-tipp-hin" />
    {/* Ertragsimpuls beim anderen */}
    <circle cx="450" cy="105" r="11" fill="none" stroke="hsl(215 16% 55%)" strokeWidth="1.5" className="vp-tipp-impuls" />
    {rueckfluss && (
      <>
        {/* Vergütungsimpuls zurück zu Dir */}
        <circle cx="450" cy="105" r="4.5" fill="hsl(199 90% 60%)" className="vp-tipp-zurueck" />
        <circle cx="95" cy="185" r="12" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.8" className="vp-tipp-ankunft" />
      </>
    )}
  </svg>
);

/* ─── G3 · Uhr, die Zeit frisst („Das Schlimmste") ───
   Die Zeit läuft weiter, ob Du entscheidest oder nicht. */
export const ZeitSchleife = () => (
  <svg viewBox="0 0 120 120" className="mx-auto h-24 w-24">
    <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(215 16% 32%)" strokeWidth="2" />
    <circle cx="60" cy="60" r="52" fill="none" stroke="#88CFFF" strokeWidth="1.5" className="vp-ring-puls" />
    {Array.from({ length: 12 }).map((_, i) => (
      <line
        key={i}
        x1="60" y1="13" x2="60" y2="19"
        stroke="hsl(215 16% 45%)" strokeWidth="2" strokeLinecap="round"
        transform={`rotate(${i * 30} 60 60)`}
      />
    ))}
    <g className="vp-zeiger-langsam" style={{ transformOrigin: "60px 60px" }}>
      <line x1="60" y1="60" x2="60" y2="34" stroke="hsl(215 16% 60%)" strokeWidth="3.5" strokeLinecap="round" />
    </g>
    <g className="vp-zeiger-schnell" style={{ transformOrigin: "60px 60px" }}>
      <line x1="60" y1="60" x2="60" y2="23" stroke="#88CFFF" strokeWidth="2.5" strokeLinecap="round" />
    </g>
    <circle cx="60" cy="60" r="3.5" fill="#88CFFF" />
  </svg>
);

/* ─── G4 · Zwei Pfade ab heute, bewusst skalenlos ───
   Keine Achsenwerte, keine Zahlen: „Bleiben ist auch eine Entscheidung."
   Der Bleiben-Pfad hört einfach auf, der Wechseln-Pfad läuft aus dem Bild. */
export const ZweiPfade = () => (
  <svg viewBox="0 0 560 280" className="mx-auto w-full max-w-xl">
    <circle cx="70" cy="150" r="5" fill="#88CFFF" />
    <text x="70" y="184" textAnchor="middle" fontSize="13" fill="hsl(215 16% 62%)">Heute</text>
    <path
      d="M70 150 C 180 152, 280 158, 400 166"
      fill="none" stroke="hsl(215 16% 52%)" strokeWidth="2.5" strokeLinecap="round"
      pathLength={100} className="vp-pfad"
    />
    <text x="418" y="171" fontSize="13" fill="hsl(215 16% 62%)">bleiben</text>
    <path
      d="M70 150 C 180 138, 300 96, 420 48 C 470 29, 520 14, 556 6"
      fill="none" stroke="#88CFFF" strokeWidth="3" strokeLinecap="round"
      pathLength={100} className="vp-pfad" style={{ transitionDelay: "0.35s" }}
    />
    <text x="410" y="34" fontSize="13" fill="#88CFFF">wechseln</text>
  </svg>
);

/* ─── G5 · dieselbe Bühne wie G2, aber die Kurve durchbricht die Decke ───
   Der Payoff der Bildklammer: „Gleiches Können. Anderes System."
   Einmaliges Ereignis, die Decke zerfällt an der Durchbruchstelle in Punkte. */
/* ─── G4b · Ein Jahr als zwoelf Felder ───
   Ersetzt seit dem 19.09.2026 die "Zwei Pfade" an dieser Stelle. Die alte
   Grafik war eine steigende Kurve auf einer Grundlinie, und genau so eine
   kommt einen Abschnitt spaeter noch einmal (KurveDurchbruch). Zwei fast
   gleiche Bilder kurz hintereinander lesen sich wie ein Versehen.

   Der Tippgeber wechselt nichts, er empfiehlt zusaetzlich. Deshalb heissen
   die beiden Reihen bei ihm anders.

   Hier steht dasselbe in anderer Form: zwoelf Felder, ein Jahr. Oben bleibt
   jedes Feld so grau wie das davor. Unten faerbt sich eins nach dem anderen.
   Bewusst ohne Zahlen, ohne Skala und ohne Versprechen, es geht nur um den
   Unterschied zwischen "gleich" und "anders". */
export const JahrInFeldern = ({ tippgeber = false }: { tippgeber?: boolean }) => (
  <svg viewBox="0 0 560 210" className="mx-auto w-full max-w-xl">
    <text x="12" y="26" fontSize="13" fill="hsl(215 16% 62%)">
      {tippgeber ? "Weiterhin verschenken" : "Bleiben"}
    </text>
    {Array.from({ length: 12 }).map((_, i) => (
      <rect
        key={`b${i}`}
        x={12 + i * 45} y={38} width={36} height={36} rx={6}
        fill="hsl(220 20% 20%)" stroke="hsl(215 16% 32%)" strokeWidth="1"
      />
    ))}
    <text x="12" y="104" fontSize="12" fill="hsl(215 16% 48%)">
      Zwölf Monate, und jeder sieht aus wie der davor.
    </text>

    <text x="12" y="146" fontSize="13" fill="#88CFFF">
      {tippgeber ? "Abrechnen lassen" : "Wechseln"}
    </text>
    {Array.from({ length: 12 }).map((_, i) => (
      <rect
        key={`w${i}`}
        x={12 + i * 45} y={158} width={36} height={36} rx={6}
        fill="#88CFFF" stroke="#88CFFF" strokeWidth="1"
        className="vp-feld"
        style={{ transitionDelay: `${0.25 + i * 0.09}s` } as React.CSSProperties}
      />
    ))}
  </svg>
);

export const KurveDurchbruch = ({ sofort = false }: { sofort?: boolean }) => (
  <svg viewBox="0 0 560 300" className={`mx-auto w-full max-w-xl ${sofort ? "vp-sofort" : ""}`}>
    {/* Decke, links und rechts der Durchbruchstelle */}
    <line x1="40" y1="90" x2="322" y2="90" stroke="hsl(215 16% 55%)" strokeDasharray="7 7" strokeWidth="1.5" />
    <line x1="398" y1="90" x2="520" y2="90" stroke="hsl(215 16% 55%)" strokeDasharray="7 7" strokeWidth="1.5" />
    {/* die Durchbruchstelle zerfällt in sechs Punkte */}
    {(
      [
        [332, 90, -26, -20], [344, 88, -10, -32], [356, 92, 8, -26],
        [368, 88, 22, -16], [380, 92, 30, 6], [388, 88, 14, 24],
      ] as Array<[number, number, number, number]>
    ).map(([x, y, dx, dy], i) => (
      <circle
        key={i}
        cx={x} cy={y} r="3"
        fill="hsl(215 16% 55%)"
        className="vp-decke-punkt"
        style={{ "--vp-dx": `${dx}px`, "--vp-dy": `${dy}px`, animationDelay: `${1.15 + i * 0.05}s` } as React.CSSProperties}
      />
    ))}
    {/* dieselbe Kurvenform wie in G2, diesmal durch die Decke hindurch */}
    <path
      d="M40 260 C 140 242, 200 190, 258 142 C 300 110, 330 102, 358 86 C 400 62, 452 44, 504 28"
      fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round"
      pathLength={100} className="vp-pfad"
    />
    <circle cx="504" cy="28" r="4.5" fill="hsl(var(--primary))" />
    <text x="120" y="212" fontSize="13" fill="hsl(var(--primary))">Dein Können</text>
    <text x="48" y="76" fontSize="13" fill="hsl(215 16% 48%)">Dieselbe Decke</text>
    <line x1="40" y1="266" x2="520" y2="266" stroke="hsl(215 16% 70%)" strokeWidth="1" />
  </svg>
);
