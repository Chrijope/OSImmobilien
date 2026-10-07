import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  TrendingUp, Coins, Banknote, Building2, AlertTriangle,
  Target, Receipt, Home, Users, Sparkles, Landmark,
  ArrowRight, CheckCircle2, XCircle, MapPin, ShieldCheck,
  ChevronDown, Menu, X, Minus, Equal, FileText, Send,
  Star, Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/moreimmo-logo.png";
import { PraesentationPdfButton } from "@/components/presentation/PraesentationPdfButton";
import heroBg from "@/assets/hero-beratung-bg.jpg";
import beratungSzene from "@/assets/beratung-szene.jpg";
import hebelMiete from "@/assets/lp/hebel-miete.jpg";
import hebelSteuer from "@/assets/lp/hebel-steuer.jpg";
import hebelBank from "@/assets/lp/hebel-bank.jpg";
import hebelTilgung from "@/assets/lp/hebel-tilgung.jpg";
import vertrauenErfahrung from "@/assets/lp/vertrauen-erfahrung.jpg";
import vertrauenVolumen from "@/assets/lp/vertrauen-volumen.jpg";
import vertrauenFokus from "@/assets/lp/vertrauen-fokus.jpg";
import vertrauenNetzwerk from "@/assets/lp/vertrauen-netzwerk.jpg";
import modellSaniert from "@/assets/lp/modell-sanierter-bestand.jpg";
import modellWg from "@/assets/lp/modell-wg-coliving.jpg";
import modellKfw from "@/assets/lp/modell-kfw40-neubau.jpg";
import BeforeAfterSection from "@/components/landing/BeforeAfterSection";
import { RATE_EINGANG, rateAnteile } from "@/lib/rateAnteile";
// Liquid Glass fuer die Praesentation, ueberstimmt `.beratung-apple` aus index.css.
import "@/styles/praesentation-liquid.css";

/**
 * Wer trägt die Rate, gerechnet aus der Beispielwohnung Memmingen weiter
 * unten: 56 Prozent Mieter, 23 Prozent Finanzamt, 21 Prozent Eigenanteil.
 * Vorher standen in der Vergleichstabelle 75 und rund 12,5 Prozent, die sich
 * aus keiner Zahl dieser Seite herleiten liessen.
 */
const ANTEILE_MEMMINGEN = rateAnteile(RATE_EINGANG.memmingen);

const NAV = [
  { id: "warum", label: "Warum Immobilien" },
  { id: "ansatz", label: "Unser Ansatz" },
  { id: "modelle", label: "Investmentmodelle" },
  { id: "rechnung", label: "Beispielrechnung" },
  { id: "prozess", label: "Prozess" },
  { id: "referenzen", label: "Referenzen" },
  { id: "kontakt", label: "Kontakt" },
];

/* Agenda → Section-Mapping (für Sprunglinks) */
const AGENDA: { id: string; label: string }[] = [
  { id: "warum",       label: "Warum Immobilien als Vermögenshebel" },
  { id: "problem",     label: "Das Problem klassischer Kapitalanleger" },
  { id: "ansatz",      label: "Der OS Immobilien Ansatz und die Investmentmodelle" },
  { id: "erwartung",   label: "Cashflow oder Qualität — Erwartungsmanagement" },
  { id: "vergleich",   label: "Eigenheim vs. Kapitalanlage" },
  { id: "rechnung",    label: "Steuerliche Hebel und Beispielrechnung" },
  { id: "steuerfrei",  label: "Steuerfrei nach 10 Jahren" },
  { id: "portfolio",   label: "Strategischer Portfolioaufbau über 10 Jahre" },
  { id: "prozess",     label: "Prozess, Risiken und nächste Schritte" },
  { id: "referenzen",  label: "Referenzen unserer Investoren" },
];

/* ─── Mini-Visualisierungen für „Unser Ansatz" (SVG, dezent animiert) ─── */
const VizStandort = () => (
  <svg viewBox="0 0 120 60" className="w-full h-full">
    <circle cx="60" cy="38" r="6" className="fill-primary/20 animate-ping" style={{ animationDuration: "2.4s" }} />
    <circle cx="60" cy="38" r="14" className="fill-none stroke-primary/30" strokeWidth="1" />
    <circle cx="60" cy="38" r="22" className="fill-none stroke-primary/15" strokeWidth="1" />
    <path d="M60 20c-5 0-9 4-9 9 0 7 9 15 9 15s9-8 9-15c0-5-4-9-9-9z" className="fill-primary" />
    <circle cx="60" cy="29" r="3" className="fill-background" />
  </svg>
);
const VizMietrendite = () => (
  <svg viewBox="0 0 120 60" className="w-full h-full">
    {[10, 28, 46, 64, 82, 100].map((x, i) => (
      <rect
        key={x}
        x={x} y={50 - (i + 1) * 6} width="10" height={(i + 1) * 6}
        className="fill-primary/70 animate-pulse"
        style={{ animationDelay: `${i * 150}ms`, animationDuration: "2.4s" }}
      />
    ))}
    <line x1="4" y1="52" x2="116" y2="52" className="stroke-border" strokeWidth="1" />
  </svg>
);
const VizSteuer = () => (
  <svg viewBox="0 0 120 60" className="w-full h-full">
    <text x="60" y="34" textAnchor="middle" className="fill-primary font-bold" fontSize="22">%</text>
    <path d="M30 46 L90 46" className="stroke-primary/40" strokeWidth="2" strokeDasharray="3 3" />
    <path d="M85 42 l6 4 -6 4" className="fill-none stroke-primary animate-pulse" strokeWidth="2" />
    <text x="24" y="18" className="fill-muted-foreground" fontSize="8">−42%</text>
  </svg>
);
const VizFinanzierung = () => (
  <svg viewBox="0 0 120 60" className="w-full h-full">
    <rect x="10" y="20" width="30" height="30" className="fill-primary/30" />
    <rect x="10" y="35" width="30" height="15" className="fill-primary animate-pulse" style={{ animationDuration: "2.2s" }} />
    <text x="25" y="16" textAnchor="middle" className="fill-muted-foreground" fontSize="7">EK</text>
    <rect x="50" y="10" width="60" height="40" className="fill-primary/30" />
    <rect x="50" y="18" width="60" height="32" className="fill-primary animate-pulse" style={{ animationDuration: "2.6s" }} />
    <text x="80" y="7" textAnchor="middle" className="fill-muted-foreground" fontSize="7">Bank</text>
  </svg>
);
const VizCashflow = () => (
  <svg viewBox="0 0 120 60" className="w-full h-full overflow-visible">
    <defs>
      <linearGradient id="cf" x1="0" x2="1">
        <stop offset="0" className="[stop-color:hsl(var(--primary))]" stopOpacity="0" />
        <stop offset=".5" className="[stop-color:hsl(var(--primary))]" />
        <stop offset="1" className="[stop-color:hsl(var(--primary))]" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d="M4 40 Q30 20 60 40 T116 40" className="fill-none stroke-primary/30" strokeWidth="2" />
    {[0, 1, 2].map((k) => (
      <circle key={k} r="4" className="fill-primary">
        <animateMotion dur="3s" repeatCount="indefinite" begin={`${k}s`}
          path="M4 40 Q30 20 60 40 T116 40" />
      </circle>
    ))}
  </svg>
);
const VizWertentwicklung = () => (
  <svg viewBox="0 0 120 60" className="w-full h-full">
    <polyline points="4,50 22,42 40,44 58,30 76,26 94,16 116,8"
      className="fill-none stroke-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray="200" strokeDashoffset="0">
      <animate attributeName="stroke-dashoffset" from="200" to="0" dur="3s" repeatCount="indefinite" />
    </polyline>
    <polyline points="4,50 22,42 40,44 58,30 76,26 94,16 116,8 116,54 4,54"
      className="fill-primary/10" />
    <circle cx="116" cy="8" r="3" className="fill-primary animate-pulse" />
  </svg>
);
const VizVerwaltung = () => (
  <svg viewBox="0 0 120 60" className="w-full h-full">
    <g style={{ transformOrigin: "45px 30px" }} className="animate-spin" >
      <path d="M45 14 v6 M45 40 v6 M29 30 h6 M55 30 h6 M34 19 l4 4 M52 37 l4 4 M56 19 l-4 4 M38 37 l-4 4"
        className="stroke-primary" strokeWidth="2" />
      <circle cx="45" cy="30" r="7" className="fill-none stroke-primary" strokeWidth="2" />
    </g>
    <g style={{ transformOrigin: "85px 40px", animationDuration: "6s", animationDirection: "reverse" }} className="animate-spin">
      <circle cx="85" cy="40" r="5" className="fill-none stroke-primary/60" strokeWidth="2" />
      <path d="M85 32 v3 M85 45 v3 M77 40 h3 M90 40 h3" className="stroke-primary/60" strokeWidth="2" />
    </g>
  </svg>
);
const VizWiederverkauf = () => (
  <svg viewBox="0 0 120 60" className="w-full h-full">
    <rect x="16" y="16" width="60" height="28" rx="4" className="fill-primary/15 stroke-primary/40" strokeWidth="1" transform="rotate(-8 46 30)" />
    <circle cx="26" cy="24" r="2" className="fill-primary" transform="rotate(-8 46 30)" />
    <text x="46" y="34" textAnchor="middle" className="fill-primary font-bold" fontSize="9" transform="rotate(-8 46 30)">+10 J</text>
    <path d="M78 30 h28 m-6 -5 l6 5 -6 5" className="fill-none stroke-primary animate-pulse" strokeWidth="2" />
    <text x="96" y="18" textAnchor="middle" className="fill-muted-foreground" fontSize="7">steuerfrei</text>
  </svg>
);

const ANSATZ_DIMENSIONS: { title: string; viz: JSX.Element }[] = [
  { title: "Standortqualität",     viz: <VizStandort /> },
  { title: "Mietrendite",          viz: <VizMietrendite /> },
  { title: "Steuerliches Potenzial", viz: <VizSteuer /> },
  { title: "Finanzierung",         viz: <VizFinanzierung /> },
  { title: "Cashflow",             viz: <VizCashflow /> },
  { title: "Wertentwicklung",      viz: <VizWertentwicklung /> },
  { title: "Verwaltungsaufwand",   viz: <VizVerwaltung /> },
  { title: "Wiederverkaufbarkeit", viz: <VizWiederverkauf /> },
];

/* ===========================================================
   Bold-Heading nach Vorbild der Hero-Grafik (Bild 5)
   – kräftiges Sans-Serif, zweite Zeile italic in Primary
   =========================================================== */
function BoldHeading({
  lead, accent, className = "",
}: { lead: React.ReactNode; accent: React.ReactNode; className?: string }) {
  return (
    <h2 className={`font-bold tracking-tight text-foreground leading-[1.05] text-3xl md:text-5xl ${className}`}>
      {lead}{" "}
      <span className="block italic font-bold text-primary">{accent}</span>
    </h2>
  );
}

function Section({
  id, eyebrow, lead, accent, subtitle, children, className = "",
}: {
  id?: string;
  eyebrow?: string;
  lead: React.ReactNode;
  accent: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`py-20 md:py-28 px-6 scroll-mt-20 ${className}`}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 md:mb-16 max-w-3xl">
          {eyebrow && (
            <div className="text-xs tracking-[0.25em] uppercase text-primary font-semibold mb-4">
              {eyebrow}
            </div>
          )}
          <BoldHeading lead={lead} accent={accent} />
          {subtitle && (
            <p className="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function NumberCard({
  n, title, text, icon: Icon, bgImage,
}: { n: string; title: string; text: string; icon?: React.ComponentType<{ className?: string }>; bgImage?: string }) {
  return (
    <div className="group relative rounded-2xl border border-border bg-gradient-to-br from-card to-card/40 p-7 transition-all duration-500 hover:border-primary/60 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 overflow-hidden">
      {bgImage && (
        <>
          <img
            src={bgImage}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-[0.08]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-card/92 via-card/90 to-card/88" />
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="relative flex items-start justify-between mb-5">
        <span className="text-xs font-mono text-primary tracking-widest">{n}</span>
        {Icon && (
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
      <h3 className="relative text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="relative text-sm text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

/* Kleines Icon-Bubble */
function IconBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-primary">
      {children}
    </div>
  );
}

/* ===========================================================
   CountUp – animiert Zahlen von 0 bis zum Zielwert sobald
   das Element im Viewport sichtbar wird.
   =========================================================== */
function CountUp({
  end,
  duration = 1800,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}: {
  end: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / duration);
              // easeOutCubic
              const eased = 1 - Math.pow(1 - t, 3);
              setValue(end * eased);
              if (t < 1) requestAnimationFrame(tick);
              else setValue(end);
            };
            requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.35 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, duration]);

  const formatted = value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/* Reveal-Wrapper: blendet Kinder beim Sichtbarwerden ein */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default function Beratungspraesentation() {
  const [navOpen, setNavOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const kundenName = searchParams.get("kunde")?.trim() || "";
  const kundeId = searchParams.get("kundeId")?.trim() || "";
  const investmentId = searchParams.get("investmentId")?.trim() || "";
  const hasKundenKontext = !!(kundeId && investmentId);
  const pageRef = useRef<HTMLDivElement>(null);

  const scrollTo = (id: string) => {
    setNavOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={pageRef} className="min-h-screen bg-background text-foreground font-sans" data-lg="seite" data-praesentation="beratung">
      {/* ─── Sticky Nav ─── */}
      <header data-lg="kopfscheibe" className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/beratungspraesentation" className="flex items-center gap-3">
            <img src={logo} alt="OS Immobilien" className="h-8 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => scrollTo(n.id)}
                className="text-sm text-muted-foreground hover:text-foreground transition"
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <PraesentationPdfButton
              containerRef={pageRef}
              title="Beratungspräsentation · Neubau"
              subtitle={kundenName ? `Für ${kundenName}` : "OS Immobilien · Investment für Kapitalanleger"}
              filename="OS-Immobilien_Beratungspraesentation_Neubau.pdf"
              preset="neubau"
            />
            <Button onClick={() => scrollTo("kontakt")} className="rounded-full px-5">
              Strategiegespräch
            </Button>
          </div>
          <button
            className="md:hidden p-2"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Menü"
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {navOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <div className="px-6 py-4 flex flex-col gap-3">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => scrollTo(n.id)}
                  className="text-sm text-left text-muted-foreground hover:text-foreground"
                >
                  {n.label}
                </button>
              ))}
              <Button onClick={() => scrollTo("kontakt")} className="mt-2 rounded-full">
                Strategiegespräch
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* ─────────────────────────────────────────────
          HERO  –  Bild-4-Style (Herzogpark)
          Einladende Welcome-Karte, zweigeteilte Bilder
         ───────────────────────────────────────────── */}
      <section id="hero" className="relative overflow-hidden">
        {/* Vollflächiges Hintergrundbild */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* dezenter Overlay für Lesbarkeit */}
        <div className="absolute inset-0 bg-foreground/30" />

        <div className="relative max-w-5xl mx-auto px-6 py-20 md:py-28">
          <div className="rounded-3xl bg-card border border-border shadow-2xl p-6 md:p-12">
            {/* Bilder-Zweier */}
            <div className="grid grid-cols-2 gap-3 md:gap-5 mb-10">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted flex items-center justify-center p-8 md:p-12">
                <img
                  src={logo}
                  alt="OS Immobilien"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
                <img
                  src={beratungSzene}
                  alt="Persönliche OS Immobilien Beratung"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-semibold mb-5">
                OS Immobilien · Premium Real Estate Investment
              </div>
              {kundenName && (
                <div className="mb-6 text-2xl md:text-3xl font-medium text-foreground">
                  Herzlich Willkommen <span className="text-primary font-bold">{kundenName}</span>
                </div>
              )}
              <h1 className="text-4xl md:text-6xl font-light leading-[1.1] tracking-tight">
                Strategischer Immobilien-Portfolioaufbau
                <br />
                <span className="italic font-bold text-primary">mit OS Immobilien.</span>
              </h1>
              <p className="mt-7 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Steueroptimiert. Renditestark. Professionell begleitet.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button
                  size="lg"
                  onClick={() => scrollTo("kontakt")}
                  className="rounded-full px-7 h-12"
                >
                  Beratung starten
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => scrollTo("agenda")}
                  className="rounded-full px-7 h-12"
                >
                  Konzept ansehen
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ab hier Apple-Style Wrapper – Hero bleibt unverändert ═══ */}
      <div className="beratung-apple">
      {/* ─── Agenda  (klickbar) ─── */}
      <Section
        id="agenda"
        eyebrow="01 · Agenda"
        lead="Was wir heute"
        accent="gemeinsam durchgehen."
        className="bg-muted/30"
      >
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-2">
          {AGENDA.map((item, i) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="group flex items-center gap-4 py-4 border-b border-border text-left hover:border-primary/60 transition"
            >
              <span className="text-xs font-mono text-primary mt-1.5 w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-base md:text-lg flex-1 group-hover:text-primary transition">
                {item.label}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition shrink-0" />
            </button>
          ))}
        </div>
      </Section>

      {/* ─── Warum Immobilien ─── */}
      <Section
        id="warum"
        eyebrow="02 · Warum Immobilien"
        lead="Die vier"
        accent="Vermögenshebel."
        subtitle="Immobilien wirken auf vier Ebenen gleichzeitig — und das macht sie zur wirkungsvollsten Anlageklasse für strategischen Vermögensaufbau."
      >
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          <NumberCard n="01" icon={Banknote} title="Mieteinnahmen" bgImage={hebelMiete}
            text="Laufender Cashflow direkt vom Mieter — Monat für Monat." />
          <NumberCard n="02" icon={Receipt} title="Steuerliche Entlastung" bgImage={hebelSteuer}
            text="AfA, Erhaltungsaufwand und Zinsen senken deine Steuerlast spürbar." />
          <NumberCard n="03" icon={TrendingUp} title="Fremdkapitalhebel" bgImage={hebelBank}
            text="Die Bank finanziert den Großteil — du arbeitest mit fremdem Geld." />
          <NumberCard n="04" icon={Coins} title="Tilgung & Wertentwicklung" bgImage={hebelTilgung}
            text="Vermögen wächst durch Schuldenabbau und langfristige Wertsteigerung." />
        </div>
      </Section>

      {/* ─── Problem ─── */}
      <Section
        id="problem"
        eyebrow="03 · Das Problem"
        lead="Viele kaufen Immobilien"
        accent="nach Gefühl."
        subtitle="Ohne Strategie wird die Immobilie zur Belastung statt zum Vermögensbaustein."
        className="bg-muted/30"
      >
        <div className="grid md:grid-cols-2 gap-8">
          <div className="rounded-2xl border border-border bg-card p-8">
            <div className="text-xs tracking-widest uppercase text-muted-foreground mb-4">
              Häufige Kaufgründe
            </div>
            <ul className="space-y-3">
              {["Schöne Lage", "Bekannte Stadt", "Niedriger Kaufpreis", "Maklerempfehlung"].map((x) => (
                <li key={x} className="flex items-center gap-3 text-base">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8">
            <div className="text-xs tracking-widest uppercase text-destructive mb-4">
              Was meist fehlt
            </div>
            <ul className="space-y-3">
              {["Steuerliche Strategie", "Mietkonzept", "Portfolio-Plan"].map((x) => (
                <li key={x} className="flex items-center gap-3 text-base">
                  <XCircle className="h-4 w-4 text-destructive" /> {x}
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-6 border-t border-destructive/20 text-sm text-muted-foreground">
              <strong className="text-foreground">Ergebnis:</strong> zu wenig Rendite,
              zu wenig Steuerwirkung, zu wenig Planbarkeit.
            </div>
          </div>
        </div>
      </Section>

      {/* ─── Unser Ansatz ─── */}
      <Section
        id="ansatz"
        eyebrow="04 · Unser Ansatz"
        lead="Immobilien als"
        accent="strategisches Portfolio."
        subtitle="Jede Immobilie wird in acht Dimensionen geprüft, bevor sie zu deinem Portfolio passt."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ANSATZ_DIMENSIONS.map((dim, i) => (
            <div
              key={dim.title}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group rounded-2xl border border-border bg-gradient-to-br from-card to-muted/30 p-5 hover:border-primary/60 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 transition-all duration-500 animate-fade-in flex flex-col"
            >
              <div className="text-xs font-mono text-primary mb-2 group-hover:tracking-[0.3em] transition-all duration-300">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="text-base font-semibold">{dim.title}</div>
              <div className="mt-2 h-0.5 w-6 bg-primary/30 group-hover:w-full group-hover:bg-primary transition-all duration-500" />
              <div className="mt-4 rounded-xl bg-muted/40 border border-border/60 p-3 h-24 flex items-center justify-center overflow-hidden">
                {dim.viz}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 p-6 rounded-2xl bg-primary/10 border border-primary/20">
          <div className="text-xs tracking-widest uppercase text-primary font-semibold mb-2">
            Ziel
          </div>
          <p className="text-lg md:text-xl text-foreground">
            Immobilien, die <strong>heute steuerlich wirken</strong> und{" "}
            <strong>langfristig Vermögen aufbauen.</strong>
          </p>
        </div>
      </Section>

      {/* ─── Erwartungsmanagement: Cashflow oder Qualität ─── */}
      <Section
        id="erwartung"
        eyebrow="04b · Erwartungsmanagement"
        lead="Cashflow oder"
        accent="Qualität — selten beides."
        subtitle="Eine Immobilie, die sich vor Steuern komplett selbst trägt, ist möglich — aber nur über drei Hebel, die jeweils einen klaren Trade-off mitbringen."
        className="bg-muted/30"
      >
        {/* 3 Hebel mit Trade-offs */}
        <div className="grid md:grid-cols-3 gap-5 mb-10">
          {[
            {
              n: "01",
              t: "Sehr hohe Rendite-Lage",
              icon: TrendingUp,
              p: "B-/C-/D-Lagen mit 8–12 % Bruttorendite — klingt stark, bedeutet aber mehr Risiko.",
              tradeoffs: ["Schwächere Lage", "Mehr Leerstand", "Schwierigere Mieterstruktur", "Geringere Wertstabilität"],
            },
            {
              n: "02",
              t: "Besonderes Mietkonzept",
              icon: Users,
              p: "WG, Co-Living, möbliert oder Kurzzeitvermietung — höhere Mieten, aber operativ aufwendiger.",
              tradeoffs: ["Mehr Aufwand", "Mehr Abnutzung", "Mehr Verwaltung", "Höhere Anforderungen"],
            },
            {
              n: "03",
              t: "Sehr günstiger Einkauf",
              icon: Coins,
              p: "Off-Market, Sanierungsstau oder Verkäuferdruck — günstig ist nur gut, wenn das Risiko verstanden ist.",
              tradeoffs: ["Sanierungsstau", "Problematische Ausgangslage", "Hoher Kapitaleinsatz", "Beherrschbares Risiko nötig"],
            },
          ].map((h, idx) => (
            <div
              key={h.n}
              style={{ animationDelay: `${idx * 100}ms` }}
              className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/60 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 transition-all duration-500 animate-fade-in"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-primary tracking-widest">HEBEL {h.n}</span>
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                  <h.icon className="h-5 w-5 text-primary group-hover:text-primary-foreground transition-colors" />
                </div>
              </div>
              <h3 className="text-lg font-bold mb-2">{h.t}</h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{h.p}</p>
              <div className="text-[10px] tracking-widest uppercase text-muted-foreground mb-2">Trade-off</div>
              <ul className="space-y-1.5">
                {h.tradeoffs.map(x => (
                  <li key={x} className="flex items-start gap-2 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

      </Section>

      {/* ─── 04c: Strategie-Vergleich (eigene Seite für PDF) ─── */}
      <Section
        id="strategien"
        eyebrow="04c · Strategie-Vergleich"
        lead="Cashflow-Strategie oder"
        accent="Qualitäts-Strategie?"
        subtitle="Zwei klar unterschiedliche Wege — abhängig davon, was für dich Priorität hat."
      >
        {/* Split-View: Cashflow- vs. Qualitäts-Strategie */}
        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-border bg-card p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Banknote className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold">Cashflow-Strategie</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Maximaler monatlicher Überschuss vor Steuern — auf Kosten von Lage, Komfort oder Aufwand.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Hohe Brutto-Mietrendite</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Schnellere positive Bilanz</li>
              <li className="flex items-start gap-2"><XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" /> Schwächere Lage / Wertstabilität</li>
              <li className="flex items-start gap-2"><XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" /> Mehr Verwaltungs- & Mieter-Risiko</li>
              <li className="flex items-start gap-2"><XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" /> Eingeschränkte Wiederverkaufbarkeit</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Qualitäts-Strategie</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Top-Lage, Neubau/KfW40, ruhige Mieter, wenig Aufwand — der Hebel ist nicht sofortiger Cashflow, sondern langfristiger Vermögensaufbau.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Langfristiger Vermögensaufbau</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Inflationsschutz & Wertstabilität</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Steuerersparnis</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Tilgung durch den Mieter</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Planbarer Kapitalaufbau über 10–20 Jahre</li>
            </ul>
          </div>
        </div>

        {/* Coach-Frage als CTA */}
        <div className="mt-10 p-6 md:p-7 rounded-2xl bg-primary/10 border border-primary/20">
          <div className="text-xs tracking-widest uppercase text-primary font-semibold mb-2">
            Die entscheidende Frage
          </div>
          <p className="text-lg md:text-xl text-foreground leading-relaxed">
            Willst du <strong>maximalen Cashflow</strong> — oder{" "}
            <strong>maximale Qualität, Sicherheit und langfristigen Vermögensaufbau?</strong>{" "}
            <span className="text-muted-foreground">Beides gleichzeitig gibt es nur in Ausnahmefällen.</span>
          </p>
        </div>
      </Section>

      {/* ─── Investmentmodelle ─── */}
      <Section
        id="modelle"
        eyebrow="05 · Investmentmodelle"
        lead="Drei"
        accent="Investmentstrategien."
        subtitle="Welches Modell zu dir passt, entscheiden wir gemeinsam — abhängig von Einkommen, Bonität und Ziel."
        className="bg-muted/30"
      >
        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              n: "01", t: "Sanierter Bestand", icon: Building2, bg: modellSaniert,
              p: "Für Anleger, die solide Rendite, planbare Vermietung und steuerliche Optimierung kombinieren wollen.",
              v: ["Bestehende Lage und etablierte Substanz", "Planbare Miete von Tag eins", "Steuerliche Hebel durch Sanierung", "Oft attraktiver als klassischer Neubau"],
            },
            {
              n: "02", t: "WG & Co-Living", icon: Users, bg: modellWg,
              p: "Bestandswohnungen werden optimiert, möbliert und zimmerweise vermietet.",
              v: ["Höhere Mieteinnahmen als klassische Vermietung", "Bessere Rendite je Quadratmeter", "Möblierte Vermietung mit Inventarabschreibung", "Professionelles Mietmanagement"],
            },
            {
              n: "03", t: "KfW40 Neubau & QNG", icon: Sparkles, bg: modellKfw,
              p: "Für Anleger, die moderne Energieeffizienz, geringen Verwaltungsaufwand und steuerliche Sondermodelle nutzen möchten.",
              v: ["Moderne Bauqualität und Energieeffizienz", "Geringe Instandhaltung zu Beginn", "Mögliche Sonderabschreibungen", "Attraktiv für lang denkende Investoren"],
            },
          ].map((m, idx) => (
            <div
              key={m.n}
              style={{ animationDelay: `${idx * 120}ms` }}
              className="group relative rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-7 flex flex-col hover:border-primary/60 hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-2 transition-all duration-500 animate-fade-in overflow-hidden"
            >
              <img
                src={m.bg}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-[0.08]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-card/92 via-card/90 to-card/88" />
              <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="relative flex items-center justify-between mb-5">
                <span className="text-xs font-mono text-primary tracking-widest">MODELL {m.n}</span>
                <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center group-hover:bg-primary group-hover:scale-110 transition-all duration-300">
                  <m.icon className="h-6 w-6 text-primary group-hover:text-primary-foreground transition-colors" />
                </div>
              </div>
              <h3 className="relative text-2xl font-bold mb-3">{m.t}</h3>
              <p className="relative text-sm text-muted-foreground mb-5 leading-relaxed">{m.p}</p>
              <ul className="relative space-y-2 mt-auto">
                {m.v.map((x) => (
                  <li key={x} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════
          BILD 1 –  Eigenheim vs. Kapitalanlage
         ═══════════════════════════════════════════════ */}
      <Section
        id="vergleich"
        eyebrow="Vergleich"
        lead="Eigenheim vs."
        accent="Kapitalanlage"
        subtitle="Der entscheidende Unterschied liegt in der Lastenverteilung und der steuerlichen Hebelwirkung."
      >
        <div className="rounded-3xl bg-card border border-border overflow-hidden shadow-sm">
          {/* Kopf */}
          <div className="grid grid-cols-3 py-8 px-6 md:px-10 border-b border-border">
            <div />
            <div className="flex flex-col items-center gap-3">
              <IconBubble><Home className="h-5 w-5" /></IconBubble>
              <div className="text-sm font-semibold">Eigenheim</div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <IconBubble><TrendingUp className="h-5 w-5" /></IconBubble>
              <div className="text-sm font-semibold">Kapitalanlage</div>
            </div>
          </div>

          {/* Wer zahlt die Rate: gerechnet aus der Beispielwohnung Memmingen
              weiter unten, nicht geschätzt. 429 Euro Kaltmiete minus 62 Euro
              Hausgeld ergeben 367 Euro vom Mieter, dazu 152 Euro Steuervorteil
              und 141 Euro Eigenaufwand. Zusammen genau die Bankrate von 660
              Euro, also 56, 23 und 21 Prozent. Der Rechenweg steht in
              `src/lib/rateAnteile.ts`, dort auch die Werte der übrigen
              Musterwohnungen. */}
          {[
            [
              "Wer zahlt?",
              "Du: 100 %",
              `Mieter ${ANTEILE_MEMMINGEN.mieter} % + Finanzamt ${ANTEILE_MEMMINGEN.finanzamt} %`,
            ],
            ["Steuerliche Wirkung",   "Keine Abzugsmöglichkeit",   "Zinsen, AfA, Sanierungskosten absetzbar"],
            ["Hebelwirkung",          "Keine",                     "Wertsteigerung auf Gesamtobjekt"],
            ["Monatliche Belastung",  "Volle Rate aus Netto",      "Ab ca. 141 € Eigenaufwand"],
            ["Vermögensaufbau",       "Eigenkapital gebunden",     "Fremdfinanzierter Aufbau"],
          ].map(([label, a, b]) => (
            <div key={label} className="grid grid-cols-3 items-center py-5 px-6 md:px-10 border-b border-border last:border-0">
              <div className="text-sm md:text-base font-semibold">{label}</div>
              <div className="text-center text-sm text-muted-foreground">{a}</div>
              <div className="text-center text-sm font-medium text-foreground">{b}</div>
            </div>
          ))}

          {/* Footer / Resultat */}
          <div className="bg-primary/10 text-center py-5 px-6">
            <span className="text-sm md:text-base font-semibold text-foreground">
              +309 € monatlich durch Steuerersparnis mit Kapitalanlage
            </span>
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════
          BILD 3  –  Transparent & verständlich
          (Beispielrechnung Memmingen 33m²)
         ═══════════════════════════════════════════════ */}
      <Section
        id="rechnung"
        eyebrow="Beispielrechnung"
        lead="Transparent &"
        accent="verständlich."
        subtitle="Anhand einer realen Beispielwohnung zeigen wir dir, wie sich deine Kapitalanlage rechnet."
        className="bg-muted/30"
      >
        {/* Eine kompakte Karte mit allen drei Blöcken */}
        <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden">
          {/* Block 1 – Kaufpreis → Bank → Rate */}
          <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 border-b border-border">
            <div className="flex items-center gap-3">
              <IconBubble><Home className="h-4 w-4" /></IconBubble>
              <div className="text-xs leading-tight">
                <div className="text-muted-foreground">Memmingen 33m²</div>
                <div className="text-lg font-bold"><CountUp end={132000} suffix=" €" /></div>
                <span className="inline-block mt-1 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">Kaufpreis</span>
              </div>
            </div>
            <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground mx-auto" />
            <div className="flex items-center gap-3">
              <IconBubble><Landmark className="h-4 w-4" /></IconBubble>
              <div className="text-xs leading-tight">
                <div className="font-bold text-sm">Bank</div>
                <div className="text-muted-foreground">4,5 % Zinsen + 1,5 % Tilgung</div>
                <div className="font-semibold">= 6,0 % vom KP</div>
              </div>
            </div>
            <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground mx-auto" />
            <div className="rounded-xl bg-muted/50 px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Bankrate</div>
              <div className="text-xs text-muted-foreground"><CountUp end={7920} suffix=" € / Jahr" /></div>
              <div className="text-lg font-bold text-primary"><CountUp end={660} suffix=" € / Monat" /></div>
            </div>
          </div>

          {/* Block 2 – Einnahmen/Ausgaben → Steuervorteil */}
          <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1.4fr_auto_1fr] items-center gap-4 border-b border-border bg-muted/20">
            <div className="flex items-center gap-3">
              <IconBubble><Home className="h-4 w-4" /></IconBubble>
              <div className="text-xs leading-tight">
                <div className="text-muted-foreground">33m² × 13,00 €</div>
                <div className="text-sm"><strong>= <CountUp end={429} suffix=" €" /></strong></div>
                <span className="inline-block mt-1 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">Kaltmiete</span>
              </div>
            </div>
            <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground mx-auto" />
            <div className="rounded-xl border border-border bg-background/60 px-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="font-bold">Einnahmen</span><span className="text-right font-semibold"><CountUp end={5148} suffix=" €" /></span>
                <span className="text-muted-foreground">Zinsen</span><span className="text-right"><CountUp end={5940} suffix=" €" /></span>
                <span className="text-muted-foreground">Hausgeld</span><span className="text-right"><CountUp end={740} suffix=" €" /></span>
                <span className="text-muted-foreground">3,5 % AfA</span><span className="text-right"><CountUp end={3696} suffix=" €" /></span>
              </div>
              <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">Steuerl. Verlust</span>
                <span className="font-bold">= <CountUp end={5228} suffix=" €" /></span>
              </div>
            </div>
            <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground mx-auto" />
            <div className="rounded-xl bg-muted/50 px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-primary font-semibold">Steuervorteil</div>
              <div className="text-lg font-bold mt-1">= <CountUp end={152} suffix=" € / Monat" /></div>
            </div>
          </div>

          {/* Block 3 – Summenrechnung */}
          <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4">
            <div className="rounded-xl border border-border px-4 py-3 text-xs">
              <div className="flex justify-between py-0.5"><span className="text-primary font-semibold">Kaltmiete</span><span className="font-semibold"><CountUp end={429} suffix=" €" /></span></div>
              <div className="flex justify-between py-0.5"><span className="text-primary font-semibold">+ Steuervorteil</span><span className="font-semibold"><CountUp end={152} suffix=" €" /></span></div>
              <div className="mt-1 pt-1 border-t border-border flex justify-between"><span>Mtl. Einnahmen</span><span className="font-bold"><CountUp end={581} suffix=" €" /></span></div>
            </div>
            <Minus className="hidden md:block h-4 w-4 text-muted-foreground mx-auto" />
            <div className="rounded-xl border border-border px-4 py-3 text-xs">
              <div className="flex justify-between py-0.5"><span className="font-semibold">Bank</span><span className="font-semibold"><CountUp end={660} suffix=" €" /></span></div>
              <div className="flex justify-between py-0.5"><span className="font-semibold">+ Hausgeld</span><span className="font-semibold"><CountUp end={62} suffix=" €" /></span></div>
              <div className="mt-1 pt-1 border-t border-border flex justify-between"><span>Mtl. Ausgaben</span><span className="font-bold"><CountUp end={722} suffix=" €" /></span></div>
            </div>
            <Equal className="hidden md:block h-4 w-4 text-muted-foreground mx-auto" />
            <div className="rounded-xl bg-primary/10 border border-primary/30 px-4 py-4 text-center shadow-lg shadow-primary/10 ring-1 ring-primary/20 hover:ring-primary/40 hover:scale-[1.02] transition-all duration-500">
              <div className="text-2xl md:text-3xl font-bold text-primary"><CountUp end={141} suffix=" €" /></div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Mtl. Eigenaufwand</div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Modellrechnung. Tatsächliche Werte hängen von der individuellen Situation
          ab und sind durch einen Steuerberater zu prüfen.
        </p>
      </Section>

      {/* ═══════════════════════════════════════════════
          BILD 2 – Steuerfrei nach 10 Jahren
         ═══════════════════════════════════════════════ */}
      <Section
        id="steuerfrei"
        eyebrow="Beispielrechnung"
        lead="Steuerfrei"
        accent="nach 10 Jahren."
        subtitle="Durch Wertsteigerung und kontinuierliche Tilgung entsteht ein erheblicher Vermögenszuwachs — steuerfrei nach der Haltefrist."
      >
        <div className="rounded-3xl bg-card border border-border p-6 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 items-center">
            <div className="rounded-2xl bg-muted/40 border border-border p-5 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Kaufpreis</div>
              <div className="text-2xl md:text-3xl font-bold mt-2"><CountUp end={132000} suffix=" €" /></div>
            </div>
            <div className="space-y-5">
              <Reveal delay={150} className="flex items-center gap-4">
                <span className="italic text-muted-foreground text-sm w-40 shrink-0">3% Wertsteigerung</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="rounded-2xl border border-border bg-background px-5 py-3">
                  <span className="font-semibold"><CountUp end={177400} suffix=" €" /></span> <span className="text-sm text-muted-foreground">KP in 10 Jahren</span>
                </div>
              </Reveal>

              <Reveal delay={400} className="flex items-center gap-4">
                <span className="text-muted-foreground text-sm w-40 shrink-0">Nach 10 Jahren</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-4">
                  <div className="h-16 w-20 rounded-xl bg-gradient-to-br from-primary to-primary/30 shadow-lg shadow-primary/30 animate-pulse" />
                  <div className="border-l border-border pl-4">
                    <div className="text-3xl md:text-4xl font-bold text-primary"><CountUp end={65200} suffix=" €" duration={2200} /></div>
                    <div className="text-sm font-semibold">Steuerfrei</div>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={650} className="flex items-center gap-4">
                <span className="italic text-muted-foreground text-sm w-40 shrink-0">1,5% Tilgung</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="rounded-2xl border border-border bg-background px-5 py-3">
                  <span className="font-semibold"><CountUp end={112000} suffix=" €" /></span> <span className="text-sm text-muted-foreground">Restschuld nach 10 Jahren</span>
                </div>
              </Reveal>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-border text-center">
            <div className="text-sm text-muted-foreground">Wert nach 10 Jahren – Restschuld = steuerfreier Gewinn</div>
            <Reveal delay={900}>
              <div className="text-2xl md:text-3xl font-bold mt-2">
                <CountUp end={177400} suffix=" €" /> – <CountUp end={112000} suffix=" €" /> ={" "}
                <span className="text-primary"><CountUp end={65200} suffix=" € steuerfrei" duration={2400} /></span>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* ─── Portfolio Timeline ─── */}
      <Section
        id="portfolio"
        eyebrow="06 · Portfolioaufbau"
        lead="Vom Einstieg zum"
        accent="Vermögensportfolio."
        className="bg-muted/30"
      >
        <div className="relative space-y-5">
          {[
            { y: "Jahr 1", t: "Einstieg", d: "Erste steueroptimierte Immobilie. Bonitätsaufbau und Steuerentlastung." },
            { y: "Jahr 2 – 3", t: "Skalierung", d: "Zweite Immobilie auf Basis der neuen Vermögens- und Steuerstruktur." },
            { y: "Jahr 4 – 6", t: "Diversifikation", d: "Portfolio aus Bestand, WG und Neubau. Mehrere Konzepte parallel." },
            { y: "Jahr 7 – 10", t: "Konsolidierung", d: "Refinanzierung, Optimierung, passives Einkommen." },
          ].map((p, i) => (
            <div key={i} className="grid grid-cols-[120px,1fr] md:grid-cols-[180px,1fr] gap-6 items-start rounded-2xl border border-border bg-card p-6 md:p-8">
              <div>
                <div className="text-xs tracking-widest uppercase text-primary font-semibold">Phase {i + 1}</div>
                <div className="mt-1 text-lg md:text-xl font-bold">{p.y}</div>
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-semibold mb-2">{p.t}</h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{p.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── Prozess ─── */}
      <Section
        id="prozess"
        eyebrow="07 · Unser Prozess"
        lead="Acht Schritte vom"
        accent="Erstgespräch zum Review."
      >
        <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
          {[
            { t: "Erstgespräch", d: "Einkommen, Steuerklasse, Eigenkapital, Ziele und Bonität klären." },
            { t: "Strategieabgleich", d: "Welche Immobilienstrategie passt zu deiner Situation?" },
            { t: "Objektvorschläge", d: "Vorgeprüfte Kapitalanlageimmobilien mit klaren Zahlen." },
            { t: "Steuer- & Cashflow-Simulation", d: "Rendite, Steuerwirkung und monatliche Belastung im Detail." },
            { t: "Finanzierungsstruktur", d: "Bankprüfung, Konditionen und Eigenkapitalstrategie." },
            { t: "Kaufabwicklung", d: "Unterlagen, Notar und Koordination — alles aus einer Hand." },
            { t: "Vermietung & Verwaltung", d: "Mietkonzept, Mietverwaltung und laufende Betreuung." },
            { t: "Portfolio-Review", d: "Jährliche Strategieprüfung und nächster Schritt." },
          ].map((s, i) => (
            <div key={i} className="flex gap-5">
              <div className="shrink-0 h-12 w-12 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center text-primary font-mono text-sm">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">{s.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── Vertrauen ─── */}
      <Section
        id="vertrauen"
        eyebrow="08 · Vertrauen"
        lead="Warum Investoren mit"
        accent="OS Immobilien arbeiten."
        className="bg-muted/30"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
          {[
            { v: <><CountUp end={10} />+</>, l: "Jahre Erfahrung", i: ShieldCheck, bg: vertrauenErfahrung },
            { v: "9-stellig", l: "Finanzierungsvolumen", i: Banknote, bg: vertrauenVolumen },
            { v: <CountUp end={100} suffix=" %" />, l: "Fokus Kapitalanlage", i: Target, bg: vertrauenFokus },
            { v: "Netzwerk", l: "Finanzierung · Sanierung · Verwaltung", i: MapPin, bg: vertrauenNetzwerk },
          ].map((s, i) => (
            <div
              key={s.l}
              style={{ animationDelay: `${i * 80}ms` }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-card/40 p-6 hover:border-primary/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-500 animate-fade-in"
            >
              <img
                src={s.bg}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-[0.08]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-card/92 via-card/90 to-card/88" />
              <div className="relative h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:scale-110 transition-all duration-300">
                <s.i className="h-5 w-5 text-primary group-hover:text-primary-foreground transition-colors" />
              </div>
              <div className="relative text-2xl md:text-3xl font-bold text-foreground">{s.v}</div>
              <div className="relative text-xs uppercase tracking-wider text-muted-foreground mt-1">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 w-full">
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Aus Immosparplan wurde OS Immobilien.</strong>{" "}
            Spezialisierung auf renditestarke Konzepte und Begleitung von der Analyse
            bis zur Verwaltung — mit einem festen Ansprechpartner pro Investor.
          </p>
        </div>
      </Section>

      {/* ─── Referenzen / Kundenstimmen ─── */}
      <Section
        id="referenzen"
        eyebrow="09 · Referenzen"
        lead="Was unsere"
        accent="Investoren sagen."
        subtitle="Echte Strategien. Echte Standorte. Messbare Ergebnisse — direkt von Investoren, die mit OS Immobilien Vermögen aufbauen."
      >
        {(() => {
          const MI = "https://osimmobilien.netlify.app/assets";
          const testimonials = [
            { name: "Julian B.", role: "München", text: "Ich arbeite selbst in der Finanzbranche und habe selten einen so sauberen, strukturierten Prozess gesehen. Die Strategie war auf meine Situation zugeschnitten — keine Pauschalempfehlung. Auch steuerlich optimal geplant.", stars: 5, image: `${MI}/person-julian-CWeaPJ4D.webp` },
            { name: "Sandra W.", role: "Nürnberg", text: "Ich hatte schon mit anderen Anbietern gesprochen — vieles wirkte vage. Hier war es ganz anders: kein Verkaufsdruck, sondern echtes Interesse an meiner Situation. Die perfekte Mischung aus persönlicher Begleitung und digitaler Effizienz.", stars: 5, image: `${MI}/person-sandra-D5AeWa2J.webp` },
            { name: "Thomas F.", role: "Augsburg", text: "Was OS Immobilien aufgebaut hat, ist nicht nur ein System, sondern ein echtes Vertrauensgerüst. Ich wusste an jedem Punkt, was als Nächstes passiert. Ich war nicht nur Kunde — ich war Teil einer durchdachten Strategie.", stars: 5, image: `${MI}/person-thomas-DdmKLRIx.webp` },
            { name: "Stefan L.", role: "Regensburg", text: "Meine erste Kapitalanlage-Wohnung über OS Immobilien — und ich hätte mir keinen besseren Start wünschen können. Ehrlich, transparent und ohne typisches Maklergerede.", stars: 5, image: `${MI}/person-stefan-BSeKq4tz.webp` },
            { name: "Miriam K.", role: "Würzburg", text: "Ich habe lange gezögert, in Immobilien zu investieren — zu komplex, dachte ich. OS Immobilien hat mir das Thema so klar erklärt, dass ich endlich Sicherheit hatte. Klare Empfehlung!", stars: 5, image: `${MI}/person-miriam-abCR9oNV.webp` },
            { name: "Markus H.", role: "Ingolstadt", text: "Als Unternehmer war für mich klar, dass Immobilien ins Portfolio gehören — alleine stemmen? Keine Chance. OS Immobilien hat den gesamten Prozess für mich übernommen, von der Objektauswahl bis zum Notar.", stars: 5, image: `${MI}/person-markus-Dx8ljg0O.webp` },
            { name: "Anna T.", role: "Erlangen", text: "Eine Freundin hat es empfohlen und ich bin froh, dass ich den Schritt gegangen bin. In weniger als sechs Wochen war ich Eigentümerin. Das Team war immer erreichbar.", stars: 5, image: `${MI}/person-anna-D47p2u_g.webp` },
            { name: "Daniel R.", role: "Bamberg", text: "Ich habe schon mehrere Investments getätigt, aber die Qualität der Betreuung bei OS Immobilien ist außergewöhnlich. Alles durchdacht, jede Frage beantwortet, kein Detail vergessen.", stars: 5, image: `${MI}/person-daniel-KOfH_w8O.webp` },
            { name: "Claudia B.", role: "Fürth", text: "Ich habe den Schritt erst Ende 40 gewagt — und bereue nur, nicht früher angefangen zu haben. Die Steueroptimierung war ein Game Changer. Es läuft einfach.", stars: 5, image: `${MI}/person-claudia-D_zu2clz.webp` },
          ];
          const marquee = [...testimonials, ...testimonials];
          return (
            <>
              <div
                className="-mx-6 md:-mx-10 overflow-hidden"
                style={{
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent 0, #000 96px, #000 calc(100% - 96px), transparent 100%)",
                  maskImage:
                    "linear-gradient(to right, transparent 0, #000 96px, #000 calc(100% - 96px), transparent 100%)",
                }}
              >
                <div className="lp-marquee-track gap-5 py-4">
                  {marquee.map((t, i) => (
                    <div
                      key={i}
                      className="shrink-0 w-[300px] md:w-[360px] p-6 rounded-2xl bg-card border border-border relative flex flex-col hover:border-primary/50 transition-colors"
                    >
                      <Quote className="w-7 h-7 text-primary/15 absolute top-5 right-5" />
                      <div className="flex gap-1 mb-3">
                        {Array.from({ length: t.stars }).map((_, j) => (
                          <Star key={j} className="w-3.5 h-3.5 fill-primary text-primary" />
                        ))}
                      </div>
                      <p className="text-sm text-foreground/85 leading-relaxed mb-4 flex-1 line-clamp-5">
                        {t.text}
                      </p>
                      <div className="flex items-center gap-3 mt-auto pt-3 border-t border-border">
                        <img
                          src={t.image}
                          alt={t.name}
                          loading="lazy"
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                {[
                  { end: 350, suffix: "+", label: "Betreute Investoren" },
                  { end: 450, suffix: "+", label: "Vermittelte Einheiten" },
                  { end: 20,  suffix: "+", label: "Berater & Mitarbeiter" },
                  { end: 700, suffix: "+", label: "Bankpartner" },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
                    <CountUp end={s.end} suffix={s.suffix} className="text-2xl md:text-3xl font-bold text-primary" />
                    <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </Section>

      {/* ─── Objekt-Referenzen (Carousel mit echten Projekt-Bildern) ─── */}
      <section id="objekt-referenzen" className="bg-muted/30 scroll-mt-20">
        <BeforeAfterSection />
      </section>

      {/* ─── FAQ ─── */}
      <Section
        id="faq"
        eyebrow="10 · Häufige Fragen"
        lead="Antworten auf die"
        accent="fünf häufigsten Einwände."
      >
        <div className="space-y-4">
          {[
            { q: "Was, wenn der Mieter ausfällt?", a: "Vorgeprüfte Standorte mit hoher Nachfrage und optional eine Mietausfallversicherung minimieren das Risiko." },
            { q: "Was, wenn ich die Immobilie verkaufen will?", a: "Nach zehn Jahren Haltedauer ist der Verkaufsgewinn steuerfrei. Wiederverkaufbarkeit ist Teil unserer Objektprüfung." },
            { q: "Was kostet die Beratung?", a: "Das Erstgespräch ist unverbindlich und kostenfrei. Die Beratung wird über die Objektvermittlung vergütet." },
            { q: "Brauche ich Eigenkapital?", a: "Es gibt Konzepte mit und ohne klassisches Eigenkapital. Entscheidend sind Bonität und Einkommen." },
            { q: "Wie viel Zeit muss ich investieren?", a: "Drei bis vier Termine bis zum Kauf. Die Verwaltung übernehmen unsere Partner." },
          ].map((f, i) => (
            <details key={i} className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/40 transition open:border-primary/40">
              <summary className="cursor-pointer flex items-center justify-between gap-4 list-none">
                <h3 className="text-base md:text-lg font-semibold">{f.q}</h3>
                <ChevronDown className="h-5 w-5 text-primary transition-transform group-open:rotate-180 shrink-0" />
              </summary>
              <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ─── Kontakt CTA ─── */}
      <section id="kontakt" className="py-24 md:py-32 px-6 bg-foreground text-background scroll-mt-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs tracking-[0.3em] uppercase text-primary font-semibold mb-6 animate-fade-in">
            11 · Nächster Schritt
          </div>
          {hasKundenKontext ? (
            <>
              <h2 className="text-4xl md:text-6xl font-bold leading-tight mb-6 animate-fade-in">
                Selbstauskunft ausfüllen.
                <br />
                <span className="italic text-primary">Was ist in deiner Situation möglich?</span>
              </h2>
              <p className="text-base md:text-lg text-background/70 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in">
                Mit deiner Selbstauskunft prüfen wir Bonität, Steuerwirkung und Cashflow —
                damit wir dir konkrete Objekte zeigen können, die in deiner Situation
                wirklich funktionieren.
              </p>
              <div className="flex flex-wrap justify-center gap-3 animate-scale-in">
                <button
                  onClick={() => {
                    const url = `/selbstauskunft?kundeId=${kundeId}&investmentId=${investmentId}`;
                    // Die Beratungspräsentation wird i.d.R. in einem neuen Tab geöffnet
                    // (window.open(..., "_blank") aus dem Kundenprofil). Die Selbstauskunft
                    // soll im ursprünglichen Tab (= opener) laden und der Präsentations-Tab
                    // schließt sich. Fallback: gleiche Tab-Navigation.
                    try {
                      const opener = window.opener as Window | null;
                      if (opener && !opener.closed) {
                        opener.location.href = url;
                        opener.focus?.();
                        window.close();
                        return;
                      }
                    } catch {
                      /* cross-origin / blockiert → Fallback unten */
                    }
                    navigate(url);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-7 h-12 font-semibold hover:opacity-90 hover-scale transition shadow-lg shadow-primary/30"
                >
                  <FileText className="h-4 w-4" />
                  Selbstauskunft jetzt ausfüllen
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    window.location.href = `/kunden/${kundeId}?autoSendSA=${investmentId}`;
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-background/30 text-background px-7 h-12 hover:bg-background/10 hover-scale transition"
                >
                  <Send className="h-4 w-4" />
                  Selbstauskunft an Kunde senden
                </button>
              </div>
              <p className="mt-6 text-xs text-background/50 max-w-xl mx-auto">
                „Jetzt ausfüllen" öffnet das Formular direkt. „An Kunde senden" verschickt
                den Einladungslink per E-Mail und springt zurück ins Kundenprofil.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-4xl md:text-6xl font-bold leading-tight mb-6 animate-fade-in">
                Persönliche Investmentanalyse.
                <br />
                <span className="italic text-primary">Kostenfrei. Unverbindlich.</span>
              </h2>
              <p className="text-base md:text-lg text-background/70 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in">
                Im Strategiegespräch klären wir deine individuelle Situation und simulieren
                Steuerwirkung, Cashflow und Vermögensaufbau für deine erste Immobilie.
              </p>
              <div className="flex flex-wrap justify-center gap-3 animate-scale-in">
                <a
                  href="mailto:os@os-immobilien.com?subject=Strategiegespräch%20MOREImmo"
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-7 h-12 font-semibold hover:opacity-90 hover-scale transition shadow-lg shadow-primary/30"
                >
                  Strategiegespräch vereinbaren
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="mailto:os@os-immobilien.com"
                  className="inline-flex items-center gap-2 rounded-full border border-background/30 text-background px-7 h-12 hover:bg-background/10 hover-scale transition"
                >
                  os@os-immobilien.com
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      </div>
      {/* ═══ /Apple-Style Wrapper ═══ */}

      {/* ─── Footer ─── */}
      <footer className="bg-background border-t border-border py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt="OS Immobilien" className="h-7 w-auto" />
            <span className="text-xs text-muted-foreground">
              Strategischer Vermögensaufbau mit Immobilien · osimmobilien.netlify.app
            </span>
          </div>
          <div className="text-xs text-muted-foreground flex gap-5">
            <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
            <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
          </div>
        </div>
        <p className="mt-6 max-w-6xl mx-auto text-[11px] leading-relaxed text-muted-foreground">
          <strong>Wichtiger Hinweis:</strong> Diese Präsentation dient ausschließlich
          zu Informationszwecken und stellt keine Steuer-, Rechts- oder Anlageberatung
          dar. Alle Beispielrechnungen sind Modellrechnungen und können von der
          tatsächlichen Entwicklung abweichen. Steuerliche Effekte hängen von der
          individuellen Situation des Investors ab und sind durch einen Steuerberater
          zu prüfen. Wertentwicklungen der Vergangenheit sind kein Indikator für
          zukünftige Ergebnisse. Stand: 2026 · OS Immobilien · os@os-immobilien.com
        </p>
      </footer>
    </div>
  );
}