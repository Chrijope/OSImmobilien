import { ArrowRight, Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { BeraterInfo } from "@/components/landing/FloatingBeraterBadge";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";
import building from "@/assets/lp/solution-building-new.png";
import TypewriterHeadline from "./TypewriterHeadline";

interface Props {
  berater: BeraterInfo;
  onOpenFunnel: () => void;
}

/** Persönlicher Einstieg mit den Kontaktdaten des jeweils geladenen Beraters. */
const AppleHeroSection = ({ berater, onOpenFunnel }: Props) => {
  const texte = useSeitenTexte(MIKROSEITE_TEXTE);
  const t = texte.hero;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  /*
   * Beim Hochladen entstehen zwei Dateien: eine kleine Vorschau (avatar.webp,
   * rund 400 px) und das Original bis 1600 px (avatar_original.jpg). Im Profil
   * steht die Vorschau — die reicht fuer eine Liste, nicht fuer die
   * Portraetkarte im Hero: dort wird sie auf 156 x 185 im Hochformat
   * beschnitten und wirkt auf einem Retina-Schirm unscharf.
   *
   * Deshalb hier das Original ueber die Bildtransformation von Supabase, auf
   * genau die gebrauchte Groesse zugeschnitten: 420 x 500 kosten so 32 KB
   * statt 1,5 MB. Existiert kein Original, faengt onError das ab und die
   * Vorschau uebernimmt.
   */
  const scharfesPortraet = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const ohneParameter = url.split("?")[0];
    if (!ohneParameter.includes("/object/public/avatars/")) return null;
    const original = ohneParameter.replace(/\/avatar\.[a-z0-9]+$/i, "/avatar_original.jpg");
    if (original === ohneParameter) return null;
    return (
      original.replace("/object/public/", "/render/image/public/") +
      "?width=420&height=500&resize=cover&quality=80"
    );
  };
  const [portraetQuelle, setPortraetQuelle] = useState<string | null>(null);
  useEffect(() => {
    setPortraetQuelle(scharfesPortraet(berater.bild) ?? berater.bild ?? null);
  }, [berater.bild]);
  const showPortrait = !!berater.bild && failedImage !== berater.bild;
  const bullets = t.punkte;
  const stats = t.kennzahlen;
  const initial = (berater.name || "?").charAt(0).toUpperCase();

  return (
    <section className="design-hero">
      <div className="hero-copy">
        {/*
          Der Kasten mit dem persönlichen Ansprechpartner (Abzug, "Dein Berater · Name",
          Position und die Verweise Telefon, Mail, Erstgespräch buchen) wurde am 16.09.2026
          auf Christians Wunsch aus dem Hero genommen. Bitte hier nicht wieder einbauen.
          Die Kontaktwege stehen weiterhin in der schwebenden Leiste (FloatingBeraterBadge),
          in der Ansprechpartner-Karte der FAQ und im Fußbereich (CTASection).
        */}

        {/* Headline */}
        <h1
          className="font-semibold text-[hsl(var(--foreground))] mx-auto max-w-[16ch]"
          style={{
            fontSize: "clamp(40px, 7.2vw, 96px)",
            lineHeight: 1.04,
            letterSpacing: "-0.038em",
            textAlign: "center",
          }}
        >
          {t.titelVor}{" "}
          <TypewriterHeadline
            ausrichtung="links"
            varianten={t.titelVarianten}
            style={{
              background:
                "linear-gradient(135deg, hsl(212 100% 60%), hsl(212 100% 45%))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          />
        </h1>

        {/* Subline */}
        <p
          className="mx-auto mt-6 md:mt-8 max-w-[58ch] text-[17px] md:text-[21px] leading-snug"
          style={{ color: "hsl(var(--muted-foreground))", letterSpacing: "-0.012em" }}
        >
          {t.unterzeile}
        </p>

        <p
          className="mx-auto mt-3 max-w-[60ch] text-[14px] md:text-[15px]"
          style={{ color: "hsl(var(--muted-foreground) / 0.8)" }}
        >
          {t.zielgruppe}
        </p>

        {/* Bullets */}
        <ul className="mt-9 md:mt-11 grid sm:grid-cols-2 gap-x-10 gap-y-3 max-w-2xl mx-auto text-left">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                style={{
                  background: "hsl(var(--primary) / 0.10)",
                  color: "hsl(var(--primary))",
                }}
              >
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              <span
                className="text-[14px] md:text-[15px]"
                style={{ color: "hsl(var(--foreground))", letterSpacing: "-0.01em" }}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div className="mt-10 md:mt-12 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#steuer-check"
            className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[15px] md:text-[17px] font-medium transition-all hover:opacity-90"
            style={{ boxShadow: "0 8px 28px -8px hsl(var(--primary) / 0.5)" }}
          >
            {t.rechnerLink}
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <button
            onClick={onOpenFunnel}
            className="lp-cta inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[15px] md:text-[17px] font-medium"
          >
            {texte.allgemein.erstberatung}
          </button>
        </div>

        {/* Trust strip */}
        <div className="mt-12 md:mt-14 flex flex-wrap justify-center gap-x-6 md:gap-x-8 gap-y-2 text-[13px] md:text-[14px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          {stats.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[hsl(var(--primary))]" strokeWidth={3} />
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="hero-media">
        <img className="hero-building" src={building} alt={t.gebaeudeAlt} loading="eager" />
        <div className="portrait-card">
          {showPortrait ? (
            <img
              src={portraetQuelle ?? berater.bild!}
              alt={berater.name}
              width={420}
              height={500}
              onError={() => {
                // Erst auf die Vorschau zurueckfallen, erst danach aufgeben.
                if (portraetQuelle && portraetQuelle !== berater.bild) setPortraetQuelle(berater.bild!);
                else setFailedImage(berater.bild!);
              }}
            />
          )
            : <div className="portrait-initials" aria-label={berater.name}>{initial}</div>}
          <div><small>{t.portraetUeber}</small><strong>{berater.name}</strong><span>{t.beruf}</span></div>
        </div>
      </div>

      {/*
        Hinweis zum Weiterscrollen. Unter dem Hero folgt viel heller Raum,
        bevor der naechste Abschnitt einsetzt — ohne Zeichen wirkt das wie ein
        Ladefehler statt wie eine Pause. Bewusst zurueckhaltend: ein grau
        hinterlegter Balken, in dem ein Punkt langsam nach unten wandert.
        Er sitzt unten im Hero und scrollt mit ihm aus dem Bild — ein eigenes
        Ausblenden braucht es nicht. Ein erster Versuch ueber window.scrollY
        lief ins Leere: die Mikroseite scrollt einen eigenen Container, nicht
        das Fenster. Bei "Bewegung reduzieren" steht der Punkt still.
      */}
      <div className="hero-scrollhinweis" aria-hidden>
        <span className="hero-scrollhinweis-spur">
          <span className="hero-scrollhinweis-punkt" />
        </span>
        <span className="hero-scrollhinweis-text">{t.weiter}</span>
      </div>
    </section>
  );
};

export default AppleHeroSection;