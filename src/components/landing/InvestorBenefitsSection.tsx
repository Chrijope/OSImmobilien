import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Briefcase, TrendingUp, Rocket, ShieldCheck, Check } from "lucide-react";
import TypewriterHeadline from "./apple/TypewriterHeadline";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";
import bgUnternehmer from "@/assets/lp/profile-unternehmer.jpg";
import bgGutverdiener from "@/assets/lp/profile-gutverdiener.jpg";
import bgSelbststaendige from "@/assets/lp/profile-selbststaendige.jpg";
import bgAngestellte from "@/assets/lp/profile-angestellte.jpg";

/** Symbol und Hintergrund je Profil, in derselben Reihenfolge wie die Texte. */
const PROFIL_MEDIEN = [
  { icon: Briefcase, bg: bgUnternehmer },
  { icon: TrendingUp, bg: bgGutverdiener },
  { icon: Rocket, bg: bgSelbststaendige },
  { icon: ShieldCheck, bg: bgAngestellte },
];

const InvestorBenefitsSection = () => {
  const t = useSeitenTexte(MIKROSEITE_TEXTE).investoren;
  const profiles = t.profile.map((p, i) => ({
    ...PROFIL_MEDIEN[i],
    kicker: p.kicker,
    title: p.titel,
    desc: p.text,
    bullets: p.punkte,
    hint: p.hinweis,
  }));

  /*
   * Kartenbahn auf dem Telefon, ergänzt am 16.09.2026.
   *
   * Vorher standen die vier Kästen untereinander, der Abschnitt war dadurch
   * sehr lang und niemand sah, dass es vier gleichwertige Profile sind.
   * Jetzt liegen sie nebeneinander in einer Bahn. Die Bahn steckt in einer
   * hohen Hülle, die Bühne darin klebt oben fest: Solange man durch die Hülle
   * scrollt, bleibt der Abschnitt stehen und die Karten wandern seitlich mit.
   * Danach geht es normal weiter.
   *
   * Drei Dinge sind dabei bewusst so gebaut:
   *  - Es wird kein Scrollen abgefangen, kein preventDefault, kein Sperren.
   *    Die Hülle ist nur ein hoher Kasten. Wer weiterscrollt, kommt weiter,
   *    auch wenn das Skript gar nicht läuft.
   *  - Die Bahn ist ein echter Scrollbereich. Wischen und Pfeiltasten wirken
   *    daher auch ohne Maus und ohne unser Zutun. Sobald jemand selbst
   *    blättert, hört das Mitwandern auf, sonst würde die Bahn zurückspringen.
   *  - Bei „prefers-reduced-motion" wird die Bahn gar nicht erst gebaut, dann
   *    bleibt es beim einfachen Untereinander.
   */
  const [bahnAktiv, setBahnAktiv] = useState(false);
  const [aktuell, setAktuell] = useState(0);
  const [selbstGefuehrt, setSelbstGefuehrt] = useState(false);
  const huelleRef = useRef<HTMLDivElement>(null);
  const buehneRef = useRef<HTMLDivElement>(null);
  const bahnRef = useRef<HTMLDivElement>(null);
  const manuell = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const schmal = window.matchMedia("(max-width: 767px)");
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pruefen = () => setBahnAktiv(schmal.matches && !ruhig.matches);
    pruefen();
    schmal.addEventListener?.("change", pruefen);
    ruhig.addEventListener?.("change", pruefen);
    return () => {
      schmal.removeEventListener?.("change", pruefen);
      ruhig.removeEventListener?.("change", pruefen);
    };
  }, []);

  /** Merkt sich, welche Karte gerade mittig steht (für die Punktleiste). */
  const merkeKarte = useCallback((bahn: HTMLDivElement) => {
    const breite = bahn.scrollWidth / Math.max(1, bahn.childElementCount);
    if (breite <= 0) return;
    const naechste = Math.round(bahn.scrollLeft / breite);
    setAktuell(Math.max(0, Math.min(bahn.childElementCount - 1, naechste)));
  }, []);

  // Die senkrechte Leseposition führt die Bahn, solange niemand selbst blättert.
  useEffect(() => {
    if (!bahnAktiv) return;
    const huelle = huelleRef.current;
    const buehne = buehneRef.current;
    const bahn = bahnRef.current;
    if (!huelle || !buehne || !bahn) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      merkeKarte(bahn);
      if (manuell.current) return;
      const weg = huelle.offsetHeight - buehne.offsetHeight;
      const strecke = bahn.scrollWidth - bahn.clientWidth;
      if (weg <= 0 || strecke <= 0) return;
      const anteil = Math.max(0, Math.min(1, -huelle.getBoundingClientRect().top / weg));
      const ziel = strecke * anteil;
      if (Math.abs(bahn.scrollLeft - ziel) > 1) bahn.scrollLeft = ziel;
    };
    const planen = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    // Ab der ersten eigenen Bedienung führt der Nutzer, nicht mehr der Scrollweg.
    const uebernehmen = () => {
      manuell.current = true;
      setSelbstGefuehrt(true);
    };

    update();
    // Capture erfasst auch den scrollbaren Bereich der internen Vorschau.
    window.addEventListener("scroll", planen, { passive: true, capture: true });
    window.addEventListener("resize", planen);
    bahn.addEventListener("scroll", planen, { passive: true });
    bahn.addEventListener("pointerdown", uebernehmen);
    bahn.addEventListener("touchstart", uebernehmen, { passive: true });
    const beobachter = typeof ResizeObserver !== "undefined" ? new ResizeObserver(planen) : null;
    beobachter?.observe(bahn);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", planen, true);
      window.removeEventListener("resize", planen);
      bahn.removeEventListener("scroll", planen);
      bahn.removeEventListener("pointerdown", uebernehmen);
      bahn.removeEventListener("touchstart", uebernehmen);
      beobachter?.disconnect();
    };
  }, [bahnAktiv, merkeKarte]);

  /** Springt zu einer Karte. Danach führt der Nutzer die Bahn. */
  const zuKarte = useCallback((nummer: number) => {
    const bahn = bahnRef.current;
    const kachel = bahn?.children[nummer] as HTMLElement | undefined;
    if (!bahn || !kachel) return;
    manuell.current = true;
    setSelbstGefuehrt(true);
    const ziel = kachel.offsetLeft - (bahn.clientWidth - kachel.clientWidth) / 2;
    if (typeof bahn.scrollTo === "function") bahn.scrollTo({ left: ziel, behavior: "smooth" });
    else bahn.scrollLeft = ziel;
    setAktuell(nummer);
  }, []);

  const tastatur = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    zuKarte(Math.max(0, Math.min(profiles.length - 1, aktuell + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const profilKarte = (p: (typeof profiles)[number]) => (
    <div key={p.kicker} className="investor-profile-card relative overflow-hidden p-6 md:p-8 rounded-xl bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)] border border-[hsl(40,15%,88%)] hover:shadow-[0_12px_40px_-8px_hsla(220,20%,14%,0.12)] transition-shadow duration-300">
      <img
        src={p.bg}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-[0.08]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/92 via-white/92 to-white/92" />
      <div className="relative flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/30">
          <p.icon className="w-5 h-5 text-primary" strokeWidth={1.75} />
        </div>
        <span className="text-xs uppercase tracking-wider text-primary font-semibold">{p.kicker}</span>
      </div>
      <h3 className="relative text-lg md:text-xl font-semibold text-[hsl(30,8%,16%)] mb-2">{p.title}</h3>
      <p className="relative text-sm text-[hsl(220,10%,46%)] mb-4 leading-relaxed">{p.desc}</p>
      <ul className="relative space-y-2 mb-4">
        {p.bullets.map((bl, j) => (
          <li key={j} className="flex items-start gap-2 text-sm text-[hsl(30,8%,16%)]">
            <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>{bl}</span>
          </li>
        ))}
      </ul>
      <p className="relative text-xs text-[hsl(220,10%,46%)] italic">{p.hint}</p>
    </div>
  );

  return (
    <section className="py-16 md:py-28 lp-section-light">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="text-center mb-10 md:mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-4 h-1 rounded-full bg-primary/40" />
          </div>
          <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">{t.kicker}</span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-4 tracking-tight">
            {t.titelVor}{" "}
            {/* Am 16.09.2026 von zentriert auf links gestellt: Bei gleicher
                reservierter Breite rückte jede Variante anders ein, der Text
                wirkte dadurch, als springe er hin und her. „einzeilig" hält
                „eine klare Strategie" ab Tablet-Breite in einer Zeile. */}
            <TypewriterHeadline
              className="lp-text-gradient"
              ausrichtung="links"
              einzeilig
              erstBeimScrollen
              varianten={t.titelVarianten}
            />
          </h2>
          <p className="text-base md:text-lg text-[hsl(220,10%,46%)] max-w-2xl mx-auto">
            {t.intro}
          </p>
        </div>

        {bahnAktiv ? (
          <div
            ref={huelleRef}
            className="profil-bahn-huelle"
            style={{ "--profil-anzahl": profiles.length } as CSSProperties}
          >
            <div ref={buehneRef} className="profil-bahn-buehne">
              <div
                ref={bahnRef}
                className={`profil-bahn ${selbstGefuehrt ? "profil-bahn-selbst" : ""}`}
                tabIndex={0}
                role="group"
                aria-label={t.bahnLabel}
                onKeyDown={tastatur}
              >
                {profiles.map(profilKarte)}
              </div>
              <div className="profil-bahn-punkte">
                {profiles.map((p, i) => (
                  <button
                    key={p.kicker}
                    type="button"
                    className="profil-bahn-punkt"
                    aria-current={i === aktuell}
                    aria-label={p.kicker}
                    onClick={() => zuKarte(i)}
                  >
                    <span aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 md:gap-6">{profiles.map(profilKarte)}</div>
        )}
      </div>
    </section>
  );
};

export default InvestorBenefitsSection;
