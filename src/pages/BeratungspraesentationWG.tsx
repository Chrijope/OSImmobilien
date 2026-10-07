import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  TrendingUp, Building2, Users, Sparkles, Landmark,
  ArrowRight, CheckCircle2, ChevronDown, Menu, X,
  Shield, Clock, Coins, Home, FileText, Send,
  Star, Quote, Briefcase, Wrench, Banknote, KeyRound,
  HandCoins, Calendar, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/moreimmo-logo.png";
import { PraesentationPdfButton } from "@/components/presentation/PraesentationPdfButton";
import { PartnerLogo } from "@/components/presentation/PartnerLogo";
import { BERATUNG_TEXTE, inAnrede } from "@/lib/beratungspraesentationTexte";
import heroBg from "@/assets/hero-beratung-bg.jpg";
import beratungSzene from "@/assets/beratung-szene.jpg";
import modellWg from "@/assets/lp/modell-wg-coliving.jpg";
import modellSaniert from "@/assets/lp/modell-sanierter-bestand.jpg";
import modellKfw from "@/assets/lp/modell-kfw40-neubau.jpg";
import vertrauenErfahrung from "@/assets/lp/vertrauen-erfahrung.jpg";
import vertrauenVolumen from "@/assets/lp/vertrauen-volumen.jpg";
import vertrauenFokus from "@/assets/lp/vertrauen-fokus.jpg";
import vertrauenNetzwerk from "@/assets/lp/vertrauen-netzwerk.jpg";
import frankfurtFassade from "@/assets/lp/frankfurt-fassade.jpg.asset.json";
import frankfurtKueche from "@/assets/lp/frankfurt-kueche.jpg.asset.json";
import frankfurtBad from "@/assets/lp/frankfurt-bad.jpg.asset.json";
import frankfurtZimmer1 from "@/assets/lp/frankfurt-zimmer1.jpg.asset.json";
import frankfurtZimmer2 from "@/assets/lp/frankfurt-zimmer2.jpg.asset.json";
import frankfurtZimmer3 from "@/assets/lp/frankfurt-zimmer3.jpg.asset.json";
import pressWohnkonzepte from "@/assets/lp/presse-wohnkonzepte-2026.png.asset.json";
import pressColiving from "@/assets/lp/presse-coliving-gemeinsam-allein.png.asset.json";
import grundrissBeispiel from "@/assets/grundriss-beispiel.png";
import { MarktlageStyles, MARKTLAGE_VISUALS } from "@/components/presentation/MarktlageVisuals";
// Liquid Glass fuer die Praesentation, ueberstimmt `.beratung-apple` aus index.css.
import "@/styles/praesentation-liquid.css";

const NAV = [
  { id: "ueber", label: "Über MOREImmo" },
  { id: "konzept", label: "Konzept" },
  { id: "coliving", label: "Co-Living" },
  { id: "portfolio", label: "Portfolio" },
  { id: "rechnung", label: "Beispielrechnung" },
  { id: "prozess", label: "Prozess" },
  { id: "kontakt", label: "Kontakt" },
];

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

// Partnerhinweise aus den Texten der MOREImmo-Präsentation. Diese Seite kennt
// keinen Sprachschalter und spricht immer Deutsch, in Du-Form.
const partnerVon = (marke: string) => {
  for (const l of BERATUNG_TEXTE.de.ueberUns.leistungen) {
    if ("partner" in l && l.partner.marke === marke) {
      return { marke, rolle: inAnrede(l.partner.rolle, "du"), satz: inAnrede(l.partner.satz, "du") };
    }
  }
  return undefined;
};
const PARTNER_IMMO = partnerVon("MORE Immo");
const PARTNER_FINANCE = partnerVon("MORE Finance");

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

/* CountUp ohne externe Lib */
function CountUp({ end, suffix = "", className = "" }: { end: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const start = performance.now();
          const dur = 1400;
          const tick = (t: number) => {
            const p = Math.min(1, (t - start) / dur);
            setVal(Math.round(p * end));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          obs.disconnect();
        }
      });
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end]);
  return (
    <span ref={ref} className={className}>
      {val.toLocaleString("de-DE")}{suffix}
    </span>
  );
}

function Reveal({
  children, delay = 0, className = "",
}: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
      });
    }, { threshold: 0.15 });
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

const fmtEUR = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function BeratungspraesentationWG() {
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
          <Link to="/beratungspraesentation-wg" className="flex items-center gap-3">
            <img src={logo} alt="MOREImmo" className="h-8 w-auto" />
            <span className="hidden md:inline text-xs tracking-[0.25em] uppercase text-muted-foreground font-semibold">
              WG · Co-Living
            </span>
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
              title="Beratungspräsentation · Co-Living / WG"
              subtitle={kundenName ? `Für ${kundenName}` : "MOREImmo · Investment für Kapitalanleger"}
              filename="MOREImmo_Beratungspraesentation_WG.pdf"
              preset="wg"
            />
            <Button onClick={() => scrollTo("kontakt")} className="rounded-full px-5">
              Beratung starten
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
                Beratung starten
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* ─── HERO ─── */}
      <section id="hero" className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-foreground/40" />

        <div className="relative max-w-5xl mx-auto px-6 py-20 md:py-28">
          <div className="rounded-3xl bg-card border border-border shadow-2xl p-6 md:p-12">
            <div className="grid grid-cols-2 gap-3 md:gap-5 mb-10">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted flex items-center justify-center p-8 md:p-12">
                <img src={logo} alt="MOREImmo" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
                <img src={modellWg} alt="WG & Co-Living mit MOREImmo" className="w-full h-full object-cover" />
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs tracking-[0.3em] uppercase text-primary font-semibold mb-5">
                MOREImmo · WG &amp; Co-Living Investment
              </div>
              {kundenName && (
                <div className="mb-6 text-2xl md:text-3xl font-medium text-foreground">
                  Herzlich Willkommen <span className="text-primary font-bold">{kundenName}</span>
                </div>
              )}
              <h1 className="text-4xl md:text-6xl font-light leading-[1.1] tracking-tight">
                Bezahlbarer Wohnraum.
                <br />
                <span className="italic font-bold text-primary">Maximale Rendite.</span>
              </h1>
              <p className="mt-7 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Co-Living verbindet die gesellschaftliche Antwort auf knappen Wohnraum mit
                der profitabelsten Asset-Klasse der letzten Jahre — professionell strukturiert
                und steueroptimiert über MOREImmo.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={() => scrollTo("kontakt")} className="rounded-full px-7 h-12">
                  Beratung starten
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => scrollTo("konzept")} className="rounded-full px-7 h-12">
                  Konzept ansehen
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="beratung-apple">

      {/* ─── ÜBER MOREImmo ─── */}
      <Section
        id="ueber"
        eyebrow="01 · Über uns"
        lead="Über MOREImmo"
        accent="Real Estate."
        subtitle="Wir sind spezialisiert auf renditestarke Kapitalanlagen in deutschen Wachstumsregionen — mit klarem Fokus auf WG- und Co-Living-Konzepte."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-12">
          {[
            { icon: Home,     end: 450, suffix: "+", label: "Vermittelte Einheiten" },
            { icon: Users,    end: 350, suffix: "+", label: "Betreute Investoren" },
            { icon: Briefcase,end: 20,  suffix: "+", label: "Berater & Mitarbeiter" },
            { icon: HandCoins,end: 120, suffix: " Mio +", label: "Transaktionsvolumen" },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="rounded-2xl border border-border bg-card p-6 text-center h-full">
                <div className="h-12 w-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <s.icon className="h-6 w-6 text-primary" />
                </div>
                <CountUp end={s.end} suffix={s.suffix} className="text-3xl md:text-4xl font-bold text-primary" />
                <p className="text-xs text-muted-foreground mt-2">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-6">
          <div className="text-xs tracking-[0.25em] uppercase text-muted-foreground font-semibold mb-4">
            Bekannt aus
          </div>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3 text-sm md:text-base text-foreground/70 font-medium">
            <span>Gewinnermagazin</span>
            <span>Unternehmer Journal</span>
            <span>Süddeutsche Zeitung</span>
            <span>Handelsblatt</span>
            <span>FOCUS Online</span>
          </div>
        </div>
      </Section>

      {/* ─── KONZEPT ─── */}
      <Section
        id="konzept"
        eyebrow="02 · MOREImmo Konzept"
        lead="Alles aus einer Hand —"
        accent="vom Erstgespräch bis zur Verwaltung."
        className="bg-muted/30"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: Sparkles,   title: "Consulting",        text: "Individuelle Strategieanalyse, Bonitätsprüfung und steueroptimierte Konzeption deines Investments." },
            { icon: Building2,  title: "MOREImmo Immobilie",text: "Geprüfte Co-Living-Objekte in deutschen A- und B-Lagen mit nachgewiesener Mieternachfrage.", partner: PARTNER_IMMO },
            { icon: Banknote,   title: "Finanzierung",      text: "Zugang zu 700+ Bankpartnern — wir holen für dich die besten Konditionen.", partner: PARTNER_FINANCE },
            { icon: KeyRound,   title: "Verwaltung",        text: "Sonderverwaltung übernimmt Mieterkontakt, Abrechnung und Erstvermietungsgarantie." },
          ].map((c, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="flex flex-col rounded-2xl border border-border bg-card p-6 h-full hover:border-primary/50 hover:-translate-y-1 transition-all duration-500">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <c.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2">{c.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
                {"partner" in c && c.partner && <PartnerLogo {...c.partner} />}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ─── IMMOBILIENMARKT IM WANDEL ─── */}
      <Section
        id="marktlage"
        eyebrow="03 · Marktlage"
        lead="Immobilienmarkt"
        accent="im Wandel."
        subtitle="Bauzinsen, Baukosten und Genehmigungs­stau treffen auf rekord­hohe Mieternachfrage. Wer jetzt richtig positioniert ist, profitiert doppelt — von sinkenden Einstiegspreisen und steigenden Mieten."
      >
        <MarktlageStyles />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: TrendingUp, k: "+ 8,1 %", t: "Mietsteigerung",
              d: "Neuvertragsmieten in deutschen Top-7-Städten 2024 vs. 2023.",
              src: "JLL Wohnmarktüberblick Q4/2024",
              srcUrl: "https://www.jll.de/de/trends-and-insights/research/wohnungsmarktueberblick",
            },
            {
              icon: Clock, k: "– 16,8 %", t: "Baugenehmigungen",
              d: "Genehmigte Wohnungen in Deutschland 2024 gegenüber 2023 — der Bauboom bleibt aus.",
              src: "Statistisches Bundesamt (Destatis), Pressemitteilung 03/2025",
              srcUrl: "https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/03/PD25_098_31121.html",
            },
            {
              icon: Shield, k: "≈ 800.000", t: "Fehlende Wohnungen",
              d: "Bundesweit fehlender Wohnraum laut Pestel-Institut — Lücke wächst jährlich weiter.",
              src: "Pestel-Institut / Verbändebündnis Wohnungsbau 2024",
              srcUrl: "https://pestel-institut.de/",
            },
            {
              icon: TrendingUp, k: "+ 4,7 %", t: "Kaufpreise Wohnungen",
              d: "Bestandswohnungen in deutschen A-Städten Q2/2025 ggü. Vorjahr — Trendwende nach oben.",
              src: "vdp-Immobilienpreisindex, Verband deutscher Pfandbriefbanken Q2/2025",
              srcUrl: "https://www.pfandbrief.de/site/de/vdp/immobilie/immobilienpreisindex.html",
            },
            {
              icon: Users, k: "84,7 Mio.", t: "Einwohner Deutschland",
              d: "Höchststand der Bevölkerung — Zuzug in Ballungsräume verschärft Wohnungsnot.",
              src: "Destatis, Bevölkerungsfortschreibung 2024",
              srcUrl: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Bevoelkerungsstand/_inhalt.html",
            },
            {
              icon: Clock, k: "3,45 %", t: "Bauzins 10 J.",
              d: "Effektivzins für 10-jährige Immobilienfinanzierungen — stabiles Zinsniveau Q2/2025.",
              src: "Interhyp Bauzins-Trendbarometer 2025",
              srcUrl: "https://www.interhyp.de/ratgeber/was-muss-ich-wissen/bauzinsen/",
            },
          ].map((m, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="rounded-2xl border border-border bg-card p-6 h-full flex flex-col">
                {(() => { const V = MARKTLAGE_VISUALS[i]; return V ? <V /> : <m.icon className="h-6 w-6 text-primary mb-4" />; })()}
                <div className="text-2xl md:text-3xl font-bold text-primary mb-1 tracking-tight">{m.k}</div>
                <div className="text-sm font-semibold mb-1">{m.t}</div>
                <p className="text-sm text-muted-foreground mb-4">{m.d}</p>
                <a
                  href={m.srcUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto text-[11px] uppercase tracking-wide text-muted-foreground/80 hover:text-primary transition-colors border-t border-border/60 pt-3"
                >
                  Quelle: {m.src} ↗
                </a>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/70 mt-6 text-center">
          Alle Daten Stand 2024/2025 · Werte gerundet · Verlinkung führt zur jeweiligen Originalquelle.
        </p>
      </Section>

      {/* ─── INVESTMENTMODELLE ─── */}
      <Section
        id="modelle"
        eyebrow="04 · Investmentmodelle"
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
          ].map((m, idx) => {
            const isFeatured = m.n === "02";
            return (
            <div
              key={m.n}
              style={{ animationDelay: `${idx * 120}ms` }}
              className={`group relative rounded-2xl border p-7 flex flex-col transition-all duration-500 animate-fade-in overflow-hidden ${
                isFeatured
                  ? "border-primary bg-gradient-to-br from-primary/10 via-card to-primary/15 shadow-2xl shadow-primary/30 md:-translate-y-3 md:scale-[1.03] ring-2 ring-primary/40 hover:-translate-y-4"
                  : "border-border bg-gradient-to-br from-card via-card to-primary/5 hover:border-primary/60 hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-2"
              }`}
            >
              {isFeatured && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tracking-widest uppercase shadow-lg">
                  ★ Unser Fokus
                </div>
              )}
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
            );
          })}
        </div>
      </Section>

      {/* ─── CO-LIVING GRUNDRISS-BEISPIEL ─── */}
      <Section
        id="grundriss"
        eyebrow="Grundriss · Beispiel"
        lead="So funktioniert Co-Living —"
        accent="aus 1 Wohnung werden 3 Mieter."
        subtitle="Eine klassische 3-Zimmer-Wohnung mit Bad, Küche und Balkon — jedes Zimmer wird einzeln möbliert vermietet. Gemeinschaftsflächen (Bad, Küche, Flur) werden geteilt."
      >
        <div className="rounded-3xl border border-border bg-card p-6 md:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8 items-center">
            {/* Linke Seite: Legende */}
            <div className="space-y-5">
              <div>
                <div className="text-xs font-mono text-primary tracking-widest mb-2">CO-LIVING</div>
                <h3 className="text-2xl md:text-3xl font-bold leading-tight">
                  3 Zimmer = 3 unabhängige Mietverhältnisse
                </h3>
              </div>
              <ul className="space-y-3 text-sm">
                {[
                  { c: "bg-red-500",    n: "Zimmer 1", m: "ca. 12,31 m²" },
                  { c: "bg-green-500",  n: "Zimmer 2", m: "ca. 10,33 m²" },
                  { c: "bg-yellow-400", n: "Zimmer 3", m: "ca. 10,08 m²" },
                ].map((z, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <span className={`h-4 w-4 rounded-sm ${z.c} ring-2 ring-background shadow`} />
                    <span className="font-semibold">{z.n}</span>
                    <span className="text-muted-foreground ml-auto">{z.m}</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border text-center">
                <div>
                  <div className="text-xs text-muted-foreground">Bad</div>
                  <div className="text-sm font-bold">2,71 m²</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Küche</div>
                  <div className="text-sm font-bold">5,40 m²</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Balkon</div>
                  <div className="text-sm font-bold">3,58 m²</div>
                </div>
              </div>
            </div>

            {/* Rechte Seite: Echter Grundriss */}
            {/* Rechte Seite: Animierter SVG-Grundriss (alternatives Layout, gleiche m²) */}
            <div className="relative w-full rounded-xl overflow-hidden border border-border bg-white p-4">
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes gr-pulse { 0%,100%{opacity:.55} 50%{opacity:1} }
                @keyframes gr-fade  { 0%,100%{opacity:.35} 50%{opacity:.85} }
                @keyframes gr-dash  { to { stroke-dashoffset: 0 } }
                .gr-room  { animation: gr-pulse 3.2s ease-in-out infinite; transform-origin: center; }
                .gr-share { animation: gr-fade  3.6s ease-in-out infinite; }
                .gr-wall  { stroke-dasharray: 900; stroke-dashoffset: 900; animation: gr-dash 2.4s ease-out forwards; }
              ` }} />
              <svg viewBox="0 0 560 460" className="w-full h-auto" role="img" aria-label="Grundriss Beispiel — realistische 3-Zimmer Co-Living Wohnung mit Balkon an Zimmer 1">
                {/* Aussenwand der Wohnung */}
                <rect x="20" y="20" width="520" height="360" rx="4" fill="#f8fafc" stroke="#0f172a" strokeWidth="4" className="gr-wall" />

                {/* ── OBERE ZEILE ── Bad · Küche · Zimmer 3 ── */}
                {/* Bad · 2,71 m² */}
                <g className="gr-share">
                  <rect x="24" y="24" width="100" height="90" fill="#e0f2fe" stroke="#64748b" strokeWidth="2" />
                  <text x="74" y="58" textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155" fontFamily="ui-sans-serif, system-ui">Bad</text>
                  <text x="74" y="74" textAnchor="middle" fontSize="10" fill="#334155" fontFamily="ui-sans-serif, system-ui">2,71 m²</text>
                  {/* Dusche */}
                  <rect x="30" y="82" width="26" height="26" fill="none" stroke="#64748b" strokeWidth="1" />
                  <circle cx="43" cy="95" r="2" fill="#64748b" />
                  {/* WC */}
                  <ellipse cx="70" cy="95" rx="6" ry="8" fill="none" stroke="#64748b" strokeWidth="1" />
                  {/* Waschbecken */}
                  <rect x="92" y="90" width="24" height="12" rx="2" fill="none" stroke="#64748b" strokeWidth="1" />
                </g>

                {/* Küche · 5,40 m² */}
                <g className="gr-share" style={{ animationDelay: ".8s" }}>
                  <rect x="128" y="24" width="160" height="90" fill="#fef3c7" stroke="#64748b" strokeWidth="2" />
                  <text x="208" y="58" textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155" fontFamily="ui-sans-serif, system-ui">Küche</text>
                  <text x="208" y="74" textAnchor="middle" fontSize="10" fill="#334155" fontFamily="ui-sans-serif, system-ui">5,40 m²</text>
                  {/* Küchenzeile oben */}
                  <rect x="132" y="88" width="152" height="22" fill="none" stroke="#64748b" strokeWidth="1" />
                  {/* Herd */}
                  <rect x="140" y="92" width="20" height="16" fill="none" stroke="#64748b" strokeWidth="1" />
                  <circle cx="145" cy="100" r="1.5" fill="#64748b" />
                  <circle cx="155" cy="100" r="1.5" fill="#64748b" />
                  {/* Spüle */}
                  <rect x="220" y="92" width="24" height="16" rx="2" fill="none" stroke="#64748b" strokeWidth="1" />
                  {/* Kühlschrank */}
                  <rect x="260" y="92" width="20" height="16" fill="none" stroke="#64748b" strokeWidth="1" />
                </g>

                {/* Zimmer 3 · gelb · ca. 10,08 m² (oben rechts) */}
                <g>
                  <rect x="292" y="24" width="244" height="140" fill="#facc15" fillOpacity="0.18" stroke="#eab308" strokeWidth="3" className="gr-room" style={{ animationDelay: "1.2s" }} />
                  <text x="414" y="78" textAnchor="middle" fontSize="16" fontWeight="700" fill="#a16207" fontFamily="ui-sans-serif, system-ui">Zimmer 3</text>
                  <text x="414" y="98" textAnchor="middle" fontSize="12" fill="#a16207" fontFamily="ui-sans-serif, system-ui">ca. 10,08 m²</text>
                  {/* Bett */}
                  <rect x="306" y="114" width="70" height="42" rx="3" fill="#eab308" fillOpacity="0.35" />
                  <rect x="310" y="118" width="24" height="34" rx="2" fill="#fff" fillOpacity="0.7" />
                  {/* Schreibtisch */}
                  <rect x="470" y="118" width="50" height="20" fill="none" stroke="#a16207" strokeWidth="1" opacity="0.6" />
                </g>

                {/* ── FLUR (Verbindung) ── */}
                <g className="gr-share" style={{ animationDelay: "1.4s" }}>
                  <rect x="24" y="118" width="264" height="80" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
                  <text x="156" y="163" textAnchor="middle" fontSize="12" fill="#64748b" fontFamily="ui-sans-serif, system-ui" letterSpacing="0.15em">FLUR</text>
                  {/* Eingangstür (links außen) */}
                  <path d="M 20 158 A 20 20 0 0 1 40 178" fill="none" stroke="#0f172a" strokeWidth="1.5" />
                  <line x1="20" y1="158" x2="20" y2="140" stroke="#0f172a" strokeWidth="3" />
                  <line x1="20" y1="178" x2="20" y2="196" stroke="#0f172a" strokeWidth="3" />
                </g>

                {/* ── UNTERE ZEILE ── Zimmer 2 · Zimmer 1 (mit Balkon) ── */}
                {/* Zimmer 2 · grün · ca. 10,33 m² (unten links) */}
                <g>
                  <rect x="24" y="202" width="264" height="174" fill="#22c55e" fillOpacity="0.14" stroke="#22c55e" strokeWidth="3" className="gr-room" style={{ animationDelay: ".6s" }} />
                  <text x="156" y="270" textAnchor="middle" fontSize="16" fontWeight="700" fill="#15803d" fontFamily="ui-sans-serif, system-ui">Zimmer 2</text>
                  <text x="156" y="290" textAnchor="middle" fontSize="12" fill="#15803d" fontFamily="ui-sans-serif, system-ui">ca. 10,33 m²</text>
                  {/* Bett */}
                  <rect x="40" y="316" width="72" height="44" rx="3" fill="#22c55e" fillOpacity="0.35" />
                  <rect x="44" y="320" width="26" height="36" rx="2" fill="#fff" fillOpacity="0.7" />
                  {/* Schrank */}
                  <rect x="220" y="316" width="60" height="16" fill="none" stroke="#15803d" strokeWidth="1" opacity="0.6" />
                </g>

                {/* Zimmer 1 · rot · ca. 12,31 m² (unten rechts, größter Raum, mit Balkon) */}
                <g>
                  <rect x="292" y="168" width="244" height="208" fill="#ef4444" fillOpacity="0.14" stroke="#ef4444" strokeWidth="3" className="gr-room" />
                  <text x="414" y="252" textAnchor="middle" fontSize="16" fontWeight="700" fill="#b91c1c" fontFamily="ui-sans-serif, system-ui">Zimmer 1</text>
                  <text x="414" y="272" textAnchor="middle" fontSize="12" fill="#b91c1c" fontFamily="ui-sans-serif, system-ui">ca. 12,31 m²</text>
                  {/* Doppelbett */}
                  <rect x="308" y="298" width="80" height="52" rx="3" fill="#ef4444" fillOpacity="0.35" />
                  <rect x="312" y="302" width="30" height="44" rx="2" fill="#fff" fillOpacity="0.7" />
                  <rect x="346" y="302" width="30" height="44" rx="2" fill="#fff" fillOpacity="0.7" />
                  {/* Schrank */}
                  <rect x="450" y="298" width="70" height="18" fill="none" stroke="#b91c1c" strokeWidth="1" opacity="0.6" />
                  {/* Balkontür (Wand unten) */}
                  <line x1="360" y1="376" x2="470" y2="376" stroke="#f8fafc" strokeWidth="6" />
                </g>

                {/* Balkon · 3,58 m² — außerhalb, angehängt an Zimmer 1 unten */}
                <g className="gr-share" style={{ animationDelay: "1.6s" }}>
                  <rect x="360" y="380" width="110" height="52" fill="#ecfeff" stroke="#0891b2" strokeWidth="2" strokeDasharray="4 3" />
                  <text x="415" y="410" textAnchor="middle" fontSize="12" fontWeight="600" fill="#0e7490" fontFamily="ui-sans-serif, system-ui">Balkon</text>
                  <text x="415" y="424" textAnchor="middle" fontSize="10" fill="#0e7490" fontFamily="ui-sans-serif, system-ui">3,58 m²</text>
                  {/* Geländer-Striche */}
                  <g stroke="#0891b2" strokeWidth="0.6" opacity="0.6">
                    {[370,380,390,400,410,420,430,440,450,460].map(x => (
                      <line key={x} x1={x} y1="380" x2={x} y2="432" />
                    ))}
                  </g>
                </g>

                {/* Türöffnungen (Wand-Lücken + Türblatt-Bögen) */}
                <g stroke="#0f172a" strokeWidth="1.5" fill="none" opacity="0.55">
                  {/* Bad → Flur */}
                  <line x1="74" y1="114" x2="94" y2="114" stroke="#f8fafc" strokeWidth="5" />
                  <path d="M74 114 A 20 20 0 0 1 94 134" />
                  {/* Küche → Flur */}
                  <line x1="200" y1="114" x2="220" y2="114" stroke="#f8fafc" strokeWidth="5" />
                  <path d="M200 114 A 20 20 0 0 1 220 134" />
                  {/* Zimmer 3 → Flur (Wand 164) */}
                  <line x1="370" y1="164" x2="390" y2="164" stroke="#f8fafc" strokeWidth="5" />
                  <path d="M370 164 A 20 20 0 0 0 390 184" />
                  {/* Flur → Zimmer 1 */}
                  <line x1="292" y1="180" x2="292" y2="200" stroke="#f8fafc" strokeWidth="5" />
                  <path d="M292 180 A 20 20 0 0 1 312 200" />
                  {/* Flur → Zimmer 2 */}
                  <line x1="140" y1="198" x2="160" y2="198" stroke="#f8fafc" strokeWidth="5" />
                  <path d="M140 198 A 20 20 0 0 1 160 218" />
                </g>

                {/* Kompass */}
                <g transform="translate(504 44)" opacity="0.55">
                  <circle r="14" fill="none" stroke="#0f172a" strokeWidth="1" />
                  <path d="M0 -12 L4 0 L0 12 L-4 0 Z" fill="#0f172a" />
                  <text y="-17" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0f172a">N</text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── CO-LIVING ist im Fokus ─── */}
      <Section
        id="coliving"
        eyebrow="05 · Trend"
        lead="Co-Living ist bei professionellen"
        accent="Investoren längst im Fokus."
        subtitle="Wo die Politik versagt hat, schaffen wir bezahlbaren Wohnraum in Ballungsräumen — und institutionelle Player ziehen mit Milliarden­volumen nach."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          <Reveal>
            <div className="relative h-full min-h-[420px] md:min-h-[520px]">
              {/* Hinterer Artikel */}
              <div className="absolute top-0 left-0 w-[78%] rounded-xl overflow-hidden border border-border shadow-xl bg-card rotate-[-3deg] transition-transform duration-500 hover:rotate-0 hover:scale-[1.02]">
                <img
                  src={pressWohnkonzepte.url}
                  alt="Presseartikel: So wohnen wir 2026 — Wohnkonzepte der Zukunft"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </div>
              {/* Vorderer Artikel — überlappend rechts unten */}
              <div className="absolute bottom-0 right-0 w-[78%] rounded-xl overflow-hidden border border-border shadow-2xl bg-card rotate-[3deg] transition-transform duration-500 hover:rotate-0 hover:scale-[1.02]">
                <img
                  src={pressColiving.url}
                  alt="Presseartikel: Gemeinsam allein — Co-Living"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-2xl border border-border bg-card p-7 h-full flex flex-col gap-5">
              <Quote className="h-7 w-7 text-primary" />
              <h3 className="text-xl md:text-2xl font-bold leading-snug">
                Co-Living ist in der Mitte der Gesellschaft angekommen.
              </h3>
              <div className="space-y-4">
                <div className="border-l-2 border-primary/60 pl-4">
                  <div className="text-[11px] uppercase tracking-wider text-primary font-semibold mb-1">
                    Wohnkonzepte 2026
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    „Von Tiny Houses über Co-Living bis zu smarten Apartments — die
                    Wohnkonzepte der Zukunft sind nachhaltig, flexibel und auf moderne
                    Bedürfnisse zugeschnitten." Steigende Mieten und knappe Flächen
                    treiben den Wandel.
                  </p>
                </div>
                <div className="border-l-2 border-primary/60 pl-4">
                  <div className="text-[11px] uppercase tracking-wider text-primary font-semibold mb-1">
                    Gemeinsam allein · Urban Living
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Co-Living verdichtet das Private und erweitert das Gemeinsame —
                    eine Antwort auf Wohnungsdruck und neue Lebensentwürfe. Flexible,
                    mobile und international vernetzte Menschen sind die Zielgruppe.
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground tracking-wide">
                Quellen: Fachpresse · Handelsblatt Inside · Energie &amp; Immobilien
              </div>
              <div className="mt-auto grid grid-cols-3 gap-3 pt-4 border-t border-border">
                {[
                  { v: "4–6 %", l: "höhere Bruttorendite" },
                  { v: "≈ 0 %", l: "Leerstand A-Lagen" },
                  { v: "12 M.", l: "ø Mietdauer/Zimmer" },
                ].map((k, i) => (
                  <div key={i} className="text-center">
                    <div className="text-lg font-bold text-primary">{k.v}</div>
                    <div className="text-[11px] text-muted-foreground">{k.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ─── INVESTMENTFAKTOREN ─── */}
      <Section
        id="logik"
        eyebrow="06 · Logik"
        lead="Investmentfaktoren —"
        accent="Zeit, Sicherheit, Rendite."
        className="bg-muted/30"
      >
        {/* Dreiecks-Visualisierung */}
        <div className="mb-8 rounded-3xl border border-border bg-card p-6 md:p-12">
          <div className="relative w-full max-w-[760px] mx-auto px-4 pt-12 pb-16">
            {/* Label oben */}
            <div className="text-center mb-3">
              <div className="inline-block text-xs md:text-sm font-bold tracking-[0.25em] text-foreground">
                ZEITAUFWAND
              </div>
            </div>

            {/* Dreieck + Kreise */}
            <div className="relative w-full aspect-[16/10]">
              <svg viewBox="0 0 800 500" className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="triFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <polygon
                  points="400,40 760,460 40,460"
                  fill="url(#triFill)"
                  stroke="hsl(var(--primary))"
                  strokeWidth="1.5"
                  strokeOpacity="0.5"
                />
                {/* Vertex-Dots */}
                <circle cx="400" cy="40" r="6" fill="hsl(var(--primary))" />
                <circle cx="40" cy="460" r="6" fill="hsl(var(--primary))" />
                <circle cx="760" cy="460" r="6" fill="hsl(var(--primary))" />
              </svg>

              {/* Kreis oben: Zeitaufwand */}
              <div className="absolute left-1/2 top-0 -translate-x-1/2 translate-y-2 w-28 h-28 md:w-36 md:h-36 rounded-full bg-card border-2 border-primary/40 flex flex-col items-center justify-center text-center px-3 shadow-xl ring-4 ring-background">
                <div className="text-2xl md:text-3xl text-foreground leading-none mb-1.5">⚙</div>
                <div className="text-[10px] md:text-[11px] text-muted-foreground leading-tight">
                  Verwaltung übernimmt<br/>MOREImmo
                </div>
              </div>

              {/* Kreis links unten: Sicherheit */}
              <div className="absolute left-0 bottom-0 -translate-x-2 translate-y-2 w-28 h-28 md:w-36 md:h-36 rounded-full bg-card border-2 border-red-500/40 flex flex-col items-center justify-center text-center px-3 shadow-xl ring-4 ring-background">
                <div className="text-2xl md:text-3xl font-bold text-red-500 leading-none mb-1.5">!!</div>
                <div className="text-[10px] md:text-[11px] text-foreground leading-tight font-medium">
                  Modernisierungs-<br/>kosten · Mietausfall
                </div>
              </div>

              {/* Kreis rechts unten: Rendite */}
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 w-28 h-28 md:w-36 md:h-36 rounded-full bg-card border-2 border-emerald-500/40 flex flex-col items-center justify-center text-center px-2 shadow-xl ring-4 ring-background">
                <div className="text-2xl md:text-3xl font-bold text-emerald-500 leading-none mb-1.5">+</div>
                <div className="text-[9px] md:text-[10px] text-foreground leading-tight font-medium">
                  Mieteinnahmen<br/>Wertsteigerung<br/>Steuervorteile
                </div>
              </div>
            </div>

            {/* Labels unten */}
            <div className="flex justify-between mt-6 px-2">
              <div className="text-xs md:text-sm font-bold tracking-[0.25em] text-foreground">
                SICHERHEIT
              </div>
              <div className="text-xs md:text-sm font-bold tracking-[0.25em] text-foreground">
                RENDITE
              </div>
            </div>
          </div>

          <div className="text-center mt-6 text-xs md:text-sm text-muted-foreground italic max-w-2xl mx-auto">
            Die drei Spannungsfelder jeder Immobilien-Kapitalanlage — bei Co-Living gezielt austariert.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: Clock, title: "Zeitaufwand",
              points: ["Sonderverwaltung übernimmt Mieterkontakt", "Erstvermietungsgarantie", "Komplette Abwicklung durch MOREImmo"],
            },
            {
              icon: Shield, title: "Sicherheit",
              points: ["Geprüfte A-/B-Standorte", "Mehrere Zimmer = Risikoverteilung", "Hohe Nachfrage = stabile Mieter"],
            },
            {
              icon: TrendingUp, title: "Rendite",
              points: ["Mieteinnahmen + Mietsteigerungen", "Wertsteigerung der Immobilie", "Steuerrückerstattungen & Abschreibung"],
            },
          ].map((b, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="rounded-2xl border border-border bg-card p-6 h-full">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <b.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-4">{b.title}</h3>
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  {b.points.map((p, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ─── NACHFRAGE WG-WOHNRAUM ─── */}
      <Section
        id="nachfrage"
        eyebrow="07 · Nachfrage"
        lead="Sehr hohe Nachfrage"
        accent="nach WG-Wohnraum."
        subtitle="In vielen Universitäts- und Großstädten übersteigt die Nachfrage nach WG-Zimmern das Angebot deutlich. Attraktive Wohnungen finden deshalb häufig innerhalb kurzer Zeit neue Mieter."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <Reveal>
            <div className="flex justify-center">
              {/* Mobile-Mockup: WG-Gesucht "Meine Anzeigen" */}
              <div className="relative w-full max-w-[340px] rounded-[2.2rem] border-[10px] border-foreground/90 bg-background shadow-2xl overflow-hidden">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-foreground/90 rounded-b-2xl z-10" />
                {/* App Header */}
                <div className="bg-[#f08c2b] text-white px-4 py-3 pt-6 flex items-center gap-3">
                  <ArrowRight className="h-5 w-5 rotate-180" />
                  <div className="flex-1 text-center font-semibold tracking-wide text-[15px]">Meine Anzeigen</div>
                  <div className="w-5" />
                </div>
                {/* Tabs */}
                <div className="grid grid-cols-2 border-b border-border bg-card">
                  <div className="text-center py-2.5 text-[13px] font-semibold text-[#f08c2b] border-b-2 border-[#f08c2b]">Angebote</div>
                  <div className="text-center py-2.5 text-[13px] text-muted-foreground">Gesuche</div>
                </div>
                {/* Status Label */}
                <div className="px-4 pt-4 pb-2 text-[11px] tracking-[0.18em] font-semibold text-foreground/70">
                  VERÖFFENTLICHT
                </div>
                {/* Card */}
                <div className="mx-3 mb-4 rounded-md border border-border overflow-hidden bg-card shadow-sm">
                  {/* Stats Strip */}
                  <div className="relative bg-foreground/70 text-background text-[11px] px-3 py-1.5">
                    Anfragen in 30 Tagen: <span className="font-bold">218</span> | Besucher in 30 Tagen: <span className="font-bold">1334</span>
                    <div className="absolute top-0 right-0 bg-foreground/85 text-background text-[9px] px-3 py-0.5 rotate-[20deg] origin-top-right translate-x-2 translate-y-1 tracking-wider">
                      deaktiviert
                    </div>
                  </div>
                  {/* Photo */}
                  <div className="relative aspect-[4/3] bg-muted">
                    <img
                      src={frankfurtZimmer1.url}
                      alt="WG-Zimmer München Bogenhausen"
                      className="w-full h-full object-cover grayscale-[0.15]"
                      loading="lazy"
                    />
                    <div className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-background/95 flex items-center justify-center text-foreground text-base font-bold leading-none">⋯</div>
                  </div>
                  {/* Title */}
                  <div className="px-3 pt-3 pb-2 text-[13px] font-semibold text-foreground leading-snug">
                    WG-Neugründung Frisch renovierte 3er-WG in Boge…
                  </div>
                  {/* Meta */}
                  <div className="px-3 pb-3 space-y-1.5 text-[12px] text-muted-foreground">
                    <div className="flex items-center gap-2"><Home className="h-3.5 w-3.5" /> WG-Zimmer</div>
                    <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /> unbefristet</div>
                    <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> München</div>
                  </div>
                </div>
                {/* CountUp Banner */}
                <div className="px-4 pb-5 text-center">
                  <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-semibold mb-1">
                    Innerhalb von 72 Stunden
                  </div>
                  <CountUp end={218} className="text-4xl font-bold text-primary block leading-none" />
                  <div className="mt-1 text-[11px] text-muted-foreground">Anfragen für 1 Zimmer · Quelle: wg-gesucht.de</div>
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="space-y-4">
              {[
                "Studierende, Pendler, Young Professionals — ein riesiger, dauerhafter Mieterpool.",
                "Jeder Zimmer-Mietvertrag wird separat abgeschlossen → Diversifikation auf 3–6 Mieter pro Wohnung.",
                "Bei Auszug eines Mieters läuft die Wohnung weiter — kein 100 % Mietausfall mehr.",
                "Höhere Quadratmeter-Miete als bei klassischer Komplett­vermietung.",
              ].map((t, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{t}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ─── GALERIE: Zimmer / Küche / Bad ─── */}
      <Section
        id="impressionen"
        eyebrow="08 · Impressionen"
        lead="Zimmer · Küche · Bad —"
        accent="vollausgestattet & sofort vermietbar."
        className="bg-muted/30"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { src: frankfurtZimmer1.url, label: "Zimmer" },
            { src: frankfurtZimmer2.url, label: "Zimmer" },
            { src: frankfurtZimmer3.url, label: "Zimmer" },
            { src: frankfurtKueche.url,  label: "Küche" },
            { src: frankfurtBad.url,     label: "Bad" },
            { src: frankfurtFassade.url, label: "Eingangsbereich" },
          ].map((p, i) => (
            <Reveal key={i} delay={i * 60}>
              <div className="group relative aspect-square rounded-2xl overflow-hidden bg-muted">
                <img src={p.src} alt={p.label} loading="lazy" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-3 left-3 text-background text-xs font-semibold tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                  {p.label}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ─── BEISPIELRECHNUNG ─── */}
      <Section
        id="rechnung"
        eyebrow="09 · Beispielrechnung"
        lead="Beispielrechnung —"
        accent="Kapitalanlage Co-Living."
        subtitle="Modellrechnung auf Basis: Kaufpreis 365.000 €, Kaufnebenkosten 5,5 % aus Eigenkapital, Zins 4,5 % p. a., Laufzeit 38 Jahre."
      >
        {/* Eckdaten */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { k: "Kaufpreis", v: fmtEUR(365000) },
            { k: "Kaufnebenkosten 5,5 %", v: fmtEUR(20075) },
            { k: "Zinssatz p. a.", v: "4,5 %" },
            { k: "Laufzeit", v: "38 Jahre" },
          ].map((c, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">{c.k}</div>
              <div className="text-base md:text-lg font-bold text-foreground mt-1">{c.v}</div>
            </div>
          ))}
        </div>

        {/* Einnahmen vs. Ausgaben */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">+</span>
              <h3 className="font-bold">Einnahmen / Monat</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border/60 pb-2"><span>Miete</span><span className="font-semibold">{fmtEUR(1200)}</span></div>
              <div className="flex justify-between border-b border-border/60 pb-2"><span>Steuervorteil</span><span className="font-semibold">{fmtEUR(406)}</span></div>
              <div className="flex justify-between pt-2 text-base"><span className="font-bold">Summe</span><span className="font-bold text-primary">{fmtEUR(1606)}</span></div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold">−</span>
              <h3 className="font-bold">Ausgaben / Monat</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border/60 pb-2"><span>Finanzierung</span><span className="font-semibold">{fmtEUR(1673)}</span></div>
              <div className="flex justify-between border-b border-border/60 pb-2"><span>Rücklagen</span><span className="font-semibold">{fmtEUR(52)}</span></div>
              <div className="flex justify-between border-b border-border/60 pb-2"><span>Bewirtschaftung</span><span className="font-semibold">{fmtEUR(104)}</span></div>
              <div className="flex justify-between pt-2 text-base"><span className="font-bold">Summe</span><span className="font-bold">{fmtEUR(1829)}</span></div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-foreground text-background p-6 md:p-8 text-center">
          <div className="text-xs tracking-[0.3em] uppercase text-primary font-semibold mb-3">Monatliche Eigeninvestition</div>
          <div className="text-4xl md:text-5xl font-bold">{fmtEUR(223)}</div>
          <p className="text-sm text-background/70 mt-3 max-w-xl mx-auto">
            Der reale monatliche Aufwand nach Berücksichtigung von Miete und Steuervorteil.
          </p>
        </div>

        {/* Boni-Kennzahlen */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { k: "Steuerabschreibung (einmalig)", v: fmtEUR(31286) },
            { k: "Steuer-Cashback (einmalig)",   v: fmtEUR(13140) },
            { k: "Beitragsfreie Jahre",          v: "5,08 Jahre" },
          ].map((c, i) => (
            <div key={i} className="rounded-xl border border-primary/30 bg-primary/5 p-5">
              <div className="text-xs text-muted-foreground">{c.k}</div>
              <div className="text-2xl font-bold text-primary mt-1">{c.v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── OPTION 1: LANGFRISTIG HALTEN ─── */}
      <Section
        id="halten"
        eyebrow="10 · Option 1"
        lead="Langfristig halten —"
        accent="Kreditrate sinkt, Mieten verdoppeln sich."
        className="bg-muted/30"
      >
        {/* Crossover-Diagramm: Kreditrate vs. Mieteinnahmen über 30 Jahre */}
        <Reveal>
          <div className="rounded-2xl border border-border bg-card p-5 md:p-8 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-5 text-xs md:text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-[3px] rounded-full bg-rose-500" />
                  <span className="font-semibold tracking-wide uppercase text-muted-foreground">Kreditrate</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-[3px] rounded-full bg-emerald-500" />
                  <span className="font-semibold tracking-wide uppercase text-muted-foreground">Mieteinnahmen</span>
                </div>
              </div>
              <div className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground">
                Beispielrechnung · 365.000 € Kapitalanlage
              </div>
            </div>

            <div className="relative w-full" style={{ aspectRatio: "16 / 8" }}>
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes wg-draw   { to { stroke-dashoffset: 0 } }
                @keyframes wg-area   { 0%{opacity:0} 60%{opacity:1} 100%{opacity:1} }
                @keyframes wg-pulse  { 0%,100%{ r: 6; opacity:.9 } 50%{ r: 9; opacity:1 } }
                @keyframes wg-glow   { 0%,100%{opacity:.2} 50%{opacity:.55} }
                @keyframes wg-move   { 0%{offset-distance:0%} 100%{offset-distance:100%} }
                @keyframes wg-fadein { 0%{opacity:0; transform:translateY(4px)} 100%{opacity:1; transform:translateY(0)} }
                .wg-line   { stroke-dasharray: 900; stroke-dashoffset: 900; animation: wg-draw 2.4s ease-out forwards; }
                .wg-line2  { stroke-dasharray: 900; stroke-dashoffset: 900; animation: wg-draw 2.6s .3s ease-out forwards; }
                .wg-area   { opacity:0; animation: wg-area 2.6s .8s ease-out forwards; }
                .wg-cross  { transform-origin: center; animation: wg-pulse 2.4s ease-in-out infinite; }
                .wg-glow   { animation: wg-glow 2.8s ease-in-out infinite; }
                .wg-dot    { offset-path: path('M 60 270 L 240 215 L 470 130 L 720 50'); animation: wg-move 6s ease-in-out infinite alternate; }
                .wg-label  { opacity:0; animation: wg-fadein .6s ease-out forwards; }
              ` }} />
              <svg
                viewBox="0 0 800 400"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="mietFillWG" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgb(16,185,129)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="kreditFillWG" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgb(244,63,94)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="rgb(244,63,94)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Horizontale Grid-Linien */}
                {[80, 140, 200, 260, 320].map((y) => (
                  <line key={y} x1="60" y1={y} x2="760" y2={y} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 4" />
                ))}

                {/* Achsen */}
                <line x1="60" y1="340" x2="760" y2="340" stroke="currentColor" strokeOpacity="0.3" />
                <line x1="60" y1="20"  x2="60"  y2="340" stroke="currentColor" strokeOpacity="0.3" />

                {/* Vertikale Marker */}
                {[
                  { x: 240, label: "10 Jahre" },
                  { x: 470, label: "20 Jahre" },
                  { x: 720, label: "30 Jahre" },
                ].map((m) => (
                  <g key={m.x}>
                    <line x1={m.x} y1="20" x2={m.x} y2="340" stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 4" />
                    <text x={m.x} y="362" textAnchor="middle" className="fill-current" fontSize="13" fontWeight="600">{m.label}</text>
                  </g>
                ))}

                <text x="50" y="32" textAnchor="end" className="fill-current" fontSize="13" opacity="0.6">€</text>
                <text x="770" y="180" textAnchor="middle" className="fill-current" fontSize="11" opacity="0.6" style={{ letterSpacing: "0.3em" }}>JAHRE</text>

                {/* Mieteinnahmen-Fläche */}
                <path
                  d="M 60 270 L 240 215 L 470 130 L 720 50 L 720 340 L 60 340 Z"
                  fill="url(#mietFillWG)"
                  className="wg-area"
                />
                {/* Kreditrate-Fläche (dezent) */}
                <path
                  d="M 60 195 L 720 225 L 720 340 L 60 340 Z"
                  fill="url(#kreditFillWG)"
                  className="wg-area"
                />

                {/* Glow-Layer unter den Linien */}
                <line x1="60" y1="195" x2="720" y2="225" stroke="rgb(244,63,94)" strokeWidth="8" strokeLinecap="round" className="wg-glow" opacity="0.3" />
                <line x1="60" y1="270" x2="720" y2="50"  stroke="rgb(16,185,129)" strokeWidth="8" strokeLinecap="round" className="wg-glow" opacity="0.3" />

                {/* Kreditrate */}
                <line x1="60" y1="195" x2="720" y2="225"
                  stroke="rgb(244,63,94)" strokeWidth="3" strokeLinecap="round" className="wg-line" />
                {/* Mieteinnahmen */}
                <line x1="60" y1="270" x2="720" y2="50"
                  stroke="rgb(16,185,129)" strokeWidth="3" strokeLinecap="round" className="wg-line2" />

                {/* Stützpunkte auf Mieteinnahmen-Linie */}
                {[
                  { x: 240, y: 215 },
                  { x: 470, y: 130 },
                  { x: 720, y: 50  },
                ].map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4" fill="rgb(16,185,129)" stroke="#fff" strokeWidth="2" className="wg-label" style={{ animationDelay: `${1.6 + i*0.3}s` }} />
                ))}

                {/* Crossover-Punkt (~Jahr 8) — pulsierend */}
                <circle cx="200" cy="205" r="6" fill="rgb(16,185,129)" stroke="hsl(var(--background))" strokeWidth="2" className="wg-cross" />

                {/* Wandernder Dot entlang Mieteinnahmen-Linie */}
                <circle r="6" fill="rgb(16,185,129)" stroke="#fff" strokeWidth="2" className="wg-dot" />

                {/* × Marker bei Verdopplung */}
                <text x="490" y="115" textAnchor="middle" className="fill-current wg-label" fontSize="22" fontWeight="700" style={{ animationDelay: "2.2s" }}>×</text>

                {/* Inline-Labels */}
                <text x="80" y="184" fontSize="13" fontWeight="700" fill="rgb(244,63,94)" className="wg-label" style={{ letterSpacing: "0.08em", animationDelay: "1s" }}>KREDITRATE</text>
                <text x="80" y="295" fontSize="13" fontWeight="700" fill="rgb(16,185,129)" className="wg-label" style={{ letterSpacing: "0.08em", animationDelay: "1.2s" }}>MIETEINNAHMEN</text>
                <text x="500" y="100" fontSize="12" fontWeight="700" fill="rgb(16,185,129)" className="wg-label" style={{ letterSpacing: "0.06em", animationDelay: "2s" }}>MIETEINNAHMEN VERDOPPELN</text>
              </svg>
            </div>

            {/* Kontext-Werte je Stützjahr */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-border">
              {[
              { y: "10 Jahre", k: "1.460 €", m: "1.980 €" },
              { y: "20 Jahre", k: "1.095 €", m: "3.180 €" },
              { y: "30 Jahre", k: "520 €",   m: "5.215 €" },
              ].map((s) => (
                <div key={s.y} className="text-center">
                  <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">{s.y}</div>
                  <div className="text-sm">
                    <span className="text-rose-500 font-semibold">Kreditrate</span> · {s.k}
                  </div>
                  <div className="text-sm">
                    <span className="text-emerald-500 font-semibold">Mieteinnahme</span> · {s.m}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-left">
                <th className="p-4 font-semibold"></th>
                <th className="p-4 font-semibold">Heute</th>
                <th className="p-4 font-semibold">10 Jahre</th>
                <th className="p-4 font-semibold">20 Jahre</th>
                <th className="p-4 font-semibold">30 Jahre</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="p-4 font-semibold">Kreditrate</td>
                <td className="p-4">{fmtEUR(1673)}</td>
                <td className="p-4">{fmtEUR(1460)}</td>
                <td className="p-4">{fmtEUR(1095)}</td>
                <td className="p-4">{fmtEUR(520)}</td>
              </tr>
              <tr className="border-t border-border bg-primary/5">
                <td className="p-4 font-semibold">Mieteinnahme</td>
                <td className="p-4">{fmtEUR(1200)}</td>
                <td className="p-4">{fmtEUR(1980)}</td>
                <td className="p-4">{fmtEUR(3180)}</td>
                <td className="p-4 font-bold text-primary">{fmtEUR(5215)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Mit zunehmender Tilgung sinkt deine monatliche Belastung — gleichzeitig steigen die Mieten kontinuierlich.
          Ab Jahr 15–20 finanziert die Wohnung sich selbst und produziert echten Cashflow.
        </p>
      </Section>

      {/* ─── OPTION 2: STEUERFREIER VERKAUF ─── */}
      <Section
        id="verkauf"
        eyebrow="11 · Option 2"
        lead="Steuerfreier Verkauf"
        accent="nach 10 Jahren."
        subtitle="2 % Wertsteigerung p. a. + 1 % Tilgung sind konservativ. Was nach 10 Jahren übrig bleibt, ist steuerfreier Vermögensaufbau."
      >
        {/* Fächer-Diagramm: 350.000 € → Wertsteigerung / Tilgung */}
        <Reveal>
          <div className="rounded-2xl border border-border bg-card p-6 md:p-10 mb-6">
            <div className="relative w-full" style={{ aspectRatio: "16 / 8" }}>
              <svg
                viewBox="0 0 900 450"
                preserveAspectRatio="xMidYMid meet"
                className="absolute inset-0 w-full h-full"
                aria-hidden="true"
              >
                {/* Mittellinie 10 JAHRE */}
                <line x1="220" y1="225" x2="700" y2="225" stroke="rgb(202,138,4)" strokeWidth="1.5" />
                <text x="460" y="215" textAnchor="middle" className="fill-current" fontSize="15" fontWeight="600" style={{ letterSpacing: "0.18em" }}>
                  10 JAHRE
                </text>

                {/* Obere Linie: Wertsteigerung */}
                <line x1="220" y1="225" x2="700" y2="80" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.85" />
                <text x="460" y="135" textAnchor="middle" className="fill-current" fontSize="15" fontWeight="700" style={{ letterSpacing: "0.12em" }} transform="rotate(-16 460 135)">
                  2 % WERTSTEIGERUNG
                </text>

                {/* Untere Linie: Tilgung */}
                <line x1="220" y1="225" x2="700" y2="370" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.85" />
                <text x="460" y="335" textAnchor="middle" className="fill-current" fontSize="15" fontWeight="700" style={{ letterSpacing: "0.12em" }} transform="rotate(16 460 335)">
                  1 % TILGUNG
                </text>

                {/* Startknoten 350.000 € */}
                <circle cx="220" cy="225" r="6" fill="hsl(var(--primary))" />
                <text x="205" y="232" textAnchor="end" className="fill-current" fontSize="22" fontWeight="700">
                  365.000,00 €
                </text>

                {/* Rechte Klammer */}
                <path d="M 720 80 Q 740 80 740 100 L 740 350 Q 740 370 720 370" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />

                {/* Immobilienwert oben rechts */}
                <text x="755" y="75" className="fill-current" fontSize="22" fontWeight="700">444.932,00 €</text>
                <text x="755" y="100" className="fill-current" fontSize="13" fontWeight="600" style={{ letterSpacing: "0.14em" }} opacity="0.75">
                  IMMOBILIENWERT
                </text>

                {/* Restschuld unten rechts */}
                <text x="755" y="370" className="fill-current" fontSize="22" fontWeight="700">319.020,00 €</text>
                <text x="755" y="392" className="fill-current" fontSize="13" fontWeight="600" style={{ letterSpacing: "0.14em" }} opacity="0.55">
                  RESTSCHULD
                </text>
              </svg>
            </div>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {[
            { k: "Kaufpreis heute",       v: fmtEUR(365000),  hint: "Ausgangswert" },
            { k: "Immobilienwert in 10 J.", v: fmtEUR(444932), hint: "2 % Wertsteigerung p. a." },
            { k: "Restschuld in 10 J.",   v: fmtEUR(319020),  hint: "Nach 1 % Tilgung" },
          ].map((c, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-6">
              <div className="text-xs text-muted-foreground tracking-wide">{c.hint}</div>
              <div className="text-base font-semibold mt-1">{c.k}</div>
              <div className="text-3xl md:text-4xl font-bold text-foreground mt-3">{c.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-primary text-primary-foreground p-8 text-center">
          <div className="text-xs tracking-[0.3em] uppercase font-semibold mb-3 opacity-90">
            Vermögensaufbau · Steuerfreier Verkauf in 10 Jahren
          </div>
          <div className="text-5xl md:text-6xl font-bold">{fmtEUR(125912)}</div>
        </div>
      </Section>

      {/* ─── STEUERLAST IN VERMÖGEN UMWANDELN ─── */}
      <Section
        id="steuerwirkung"
        eyebrow="12 · Steuerwirkung"
        lead="Steuerlast"
        accent="in Vermögen umwandeln."
        className="bg-muted/30"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs tracking-[0.25em] uppercase text-muted-foreground font-semibold mb-4">
              Vor Investition
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border/60 pb-2"><span>Brutto-Jahreseinkommen</span><span className="font-semibold">{fmtEUR(100000)}</span></div>
              <div className="flex justify-between pt-2 text-base"><span className="font-bold">Zu zahlende Steuern</span><span className="font-bold">{fmtEUR(30000)}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
            <div className="text-xs tracking-[0.25em] uppercase text-primary font-semibold mb-4">
              Nach Investition
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span>Brutto-Jahreseinkommen (alt)</span><span>{fmtEUR(100000)}</span></div>
              <div className="flex justify-between text-primary"><span>+ Mieteinnahmen</span><span>{fmtEUR(14400)}</span></div>
              <div className="flex justify-between"><span>− AfA</span><span>−{fmtEUR(6132)}</span></div>
              <div className="flex justify-between"><span>− Möbel (10 J.)</span><span>−{fmtEUR(1560)}</span></div>
              <div className="flex justify-between"><span>− Sonstige Kosten</span><span>−{fmtEUR(1560)}</span></div>
              <div className="flex justify-between"><span>− Zinsen (zu Beginn)</span><span>−{fmtEUR(16425)}</span></div>
              <div className="flex justify-between"><span>− Erhaltungsaufwand</span><span>−{fmtEUR(31290)}</span></div>
              <div className="flex justify-between border-t border-border pt-2 mt-2 text-base"><span className="font-bold">Zu versteuerndes Einkommen</span><span className="font-bold">{fmtEUR(57433)}</span></div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-foreground text-background p-6 md:p-8 text-center">
          <div className="text-xs tracking-[0.3em] uppercase text-primary font-semibold mb-3">Steuerrückerstattung</div>
          <div className="text-4xl md:text-5xl font-bold">{fmtEUR(17878)}</div>
          <p className="text-sm text-background/70 mt-3 max-w-xl mx-auto">
            Geld, das sonst ans Finanzamt geflossen wäre, stärkt jetzt deinen Vermögensaufbau.
          </p>
        </div>
      </Section>

      {/* ─── VERMÖGENSAUFBAU ZUSAMMENFASSUNG ─── */}
      <Section
        id="hebel"
        eyebrow="13 · Hebel-Effekt"
        lead="Für jeden eingesetzten Euro —"
        accent="3,71 € Vermögensaufbau."
      >
        <div className="rounded-2xl border border-border bg-card p-6 md:p-10">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
            {/* Spalte 1: Kapital / Vermögen */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-muted/40 p-5 text-center">
                <div className="text-xs text-muted-foreground leading-tight">Eingesetztes Kapital<br/>nach 10 Jahren</div>
                <div className="text-xl md:text-2xl font-bold mt-3">{fmtEUR(33891)}</div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-5 text-center">
                <div className="text-xs text-muted-foreground leading-tight">Aufgebautes Vermögen<br/>durch steuerfreien Verkauf</div>
                <div className="text-xl md:text-2xl font-bold mt-3">{fmtEUR(125912)}</div>
              </div>
            </div>

            {/* Pfeil 1 */}
            <div className="flex items-center justify-center text-primary shrink-0 rotate-90 md:rotate-0">
              <svg width="56" height="24" viewBox="0 0 56 24" fill="none">
                <path d="M2 12h48m0 0l-8-8m8 8l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Spalte 2: Pro Monat */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-muted/40 p-5 text-center">
                <div className="text-xs text-muted-foreground leading-tight">Investition pro Monat</div>
                <div className="text-xl md:text-2xl font-bold mt-3">{fmtEUR(223)}</div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-5 text-center">
                <div className="text-xs text-muted-foreground leading-tight">Vermögensaufbau pro Monat</div>
                <div className="text-xl md:text-2xl font-bold mt-3">{fmtEUR(1049)}</div>
              </div>
            </div>

            {/* Pfeil 2 */}
            <div className="flex items-center justify-center text-primary shrink-0 rotate-90 md:rotate-0">
              <svg width="56" height="24" viewBox="0 0 56 24" fill="none">
                <path d="M2 12h48m0 0l-8-8m8 8l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Ergebnis */}
            <div className="flex-1 rounded-xl border-2 border-primary/50 bg-primary/10 p-6 text-center">
              <div className="text-xs text-muted-foreground leading-tight">Für jeden<br/>eingesetzten Euro</div>
              <div className="text-3xl md:text-4xl font-bold mt-3 text-primary">3,71 €</div>
              <div className="text-sm font-semibold mt-1">Vermögensaufbau</div>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── BERATUNGSPROZESS ─── */}
      <Section
        id="prozess"
        eyebrow="14 · Beratungsprozess"
        lead="In 6 Schritten —"
        accent="von der Beratung zur Investition."
        className="bg-muted/30"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { n: "01", t: "Beratung",                  d: "Beratungsgespräch und Analyse inkl. Wünsche und konkrete Ziele." },
            { n: "02", t: "Machbarkeitsprüfung",       d: "Bonitätscheck und Besichtigung eines Referenzobjekts — Co-Living vor Ort kennenlernen." },
            { n: "03", t: "Business Case",             d: "Wir teilen alle relevanten Zahlen und füllen gemeinsam die Reservierung aus." },
            { n: "04", t: "Investmentchance sichern",  d: "Auswahl der attraktivsten Finanzierungskonditionen und Festlegung des Notartermins." },
            { n: "05", t: "Kaufvertrag",               d: "Wir garantieren die Herstellung des Objekts und die Erstvermietung der Zimmer." },
            { n: "06", t: "Notar & Übergabe",          d: "Besichtigung des Objekts und notarielle Beurkundung vor Ort." },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="rounded-2xl border border-border bg-card p-6 h-full hover:border-primary/50 transition-all duration-500 hover:-translate-y-1">
                <div className="text-xs font-mono text-primary tracking-widest mb-3">{s.n}</div>
                <h3 className="text-lg font-bold mb-2">{s.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ─── TESTIMONIAL ─── */}
      <Section
        id="stimmen"
        eyebrow="15 · Stimmen"
        lead="„Hervorragende Entscheidung —"
        accent="ich empfehle MOREImmo weiter."
      >
        {/* Haupt-Stimme */}
        <div className="rounded-3xl border border-border bg-card p-8 md:p-12">
          <Quote className="h-10 w-10 text-primary mb-6" />
          <p className="text-lg md:text-2xl leading-relaxed text-foreground italic">
            „Als selbstständiger Zahnarzt fehlt mir schlicht die Zeit, mich um Mieter,
            Handwerker oder Nebenkostenabrechnungen zu kümmern. Genau deshalb hat mich
            das Co-Living-Modell von MOREImmo überzeugt: mehrere Mietverträge pro
            Wohnung sorgen dafür, dass ein einzelner Ausfall meinen Cashflow nicht
            gefährdet, und die Sondereigentumsverwaltung nimmt mir den kompletten
            operativen Teil ab. Die Nettomietrendite liegt spürbar über dem, was mir
            klassische Eigentumswohnungen gebracht hätten. Meine erste Einheit in
            Leipzig war innerhalb weniger Wochen komplett vermietet — die zweite in
            Nürnberg ist bereits in Planung."
          </p>
          <div className="mt-8 flex items-center gap-4 pt-6 border-t border-border">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Star className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-bold">Dr. Andreas K.</div>
              <div className="text-sm text-muted-foreground">Zahnarzt · Leipzig · 1 Co-Living-Objekt seit 2024</div>
            </div>
          </div>
        </div>

        {/* Weitere Stimmen — Laufband rechts → links */}
        <style>{`
          @keyframes wg-marquee-rtl {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .wg-marquee-track { animation: wg-marquee-rtl 80s linear infinite; }
          .wg-marquee:hover .wg-marquee-track { animation-play-state: paused; }
          .wg-marquee-mask {
            mask-image: linear-gradient(to right, transparent 0, #000 80px, #000 calc(100% - 80px), transparent 100%);
            -webkit-mask-image: linear-gradient(to right, transparent 0, #000 80px, #000 calc(100% - 80px), transparent 100%);
          }
        `}</style>
        <div className="wg-marquee wg-marquee-mask mt-6 overflow-hidden py-2">
          <div className="wg-marquee-track flex gap-5 w-max px-4">
          {(() => { const items = [
            {
              t: "Wir haben lange nach einer Kapitalanlage gesucht, die wirklich planbar ist. Bei klassischer Single-Vermietung hatten wir Sorge vor Leerstand. Mit dem Co-Living-Modell verteilen sich die Mieten auf 4 Personen — selbst wenn ein Zimmer mal zwei Wochen leer steht, läuft der Cashflow weiter. Genau das, was wir wollten.",
              n: "Sandra & Markus W.",
              r: "Ingenieur-Ehepaar · Stuttgart · Co-Living Leipzig",
            },
            {
              t: "Ich bin Anfang 30 und wollte mit kleinem Eigenkapital starten. MOREImmo hat mir gezeigt, dass das mit einem WG-Objekt realistisch ist — höhere Mieteinnahmen pro m² als bei normaler Vermietung, und die Kaufnebenkosten waren mit Förderkredit überschaubar. Heute habe ich meine erste Wohnung und plane die zweite.",
              n: "Daniel K.",
              r: "Software-Entwickler · Köln · Co-Living Dresden",
            },
            {
              t: "Als Ärztin habe ich keine Zeit, mich um Mieter, Anzeigen oder Nebenkostenabrechnungen zu kümmern. Die Sonderverwaltung von MOREImmo regelt wirklich alles — von der Möblierung bis zur Mieterauswahl. Ich bekomme einmal im Monat eine saubere Abrechnung, mehr nicht.",
              n: "Dr. Katharina H.",
              r: "Fachärztin · Hamburg · Co-Living Hannover",
            },
            {
              t: "Ich war skeptisch wegen WG-Vermietung — Stichwort hohe Fluktuation. Nach 14 Monaten kann ich sagen: alle 4 Zimmer durchgehend belegt, Wechsel sauber organisiert, keine Mietausfälle. Das Konzept funktioniert genau so, wie es uns präsentiert wurde.",
              n: "Thomas B.",
              r: "Vertriebsleiter · Nürnberg · Co-Living München",
            },
            {
              t: "Was mich überzeugt hat: die Zahlen halten der Prüfung stand. Ich habe die Kalkulation mit meinem Steuerberater durchgegangen — AfA, Sonder-AfA, Mietkalkulation — alles realistisch und konservativ gerechnet. Kein Schönfärben, keine Luftschlösser.",
              n: "Stefan R.",
              r: "Geschäftsführer Mittelstand · Frankfurt · Co-Living Berlin",
            },
            {
              t: "Für mich war wichtig, dass meine Immobilie auch in 10 Jahren noch verkäuflich ist. MOREImmo hat das Objekt auf eine klassische Familienwohnung zurückbaubar geplant — beste Lage, gute Verkehrsanbindung. So habe ich heute starke Rendite und später volle Flexibilität.",
              n: "Julia M.",
              r: "Marketing-Direktorin · Düsseldorf · Co-Living Köln",
            },
            {
              t: "Ehrliche Beratung war mir am wichtigsten. Bei MOREImmo wurde mir auch klar gesagt, wo die Risiken liegen und welche Objekte für mich nicht passen. Das war ein anderer Stil als bei den üblichen Vertrieben — und genau deshalb habe ich unterschrieben.",
              n: "Andreas P.",
              r: "Selbstständiger Unternehmer · München · Co-Living Augsburg",
            },
          ]; return [...items, ...items].map((s, i) => (
            <div key={i} className="w-[320px] md:w-[360px] shrink-0 rounded-2xl border border-border bg-card p-6 hover:border-primary/40 transition">
              <Quote className="h-6 w-6 text-primary mb-3" />
              <p className="text-sm leading-relaxed text-muted-foreground italic">„{s.t}"</p>
              <div className="mt-5 pt-4 border-t border-border flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Star className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{s.n}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{s.r}</div>
                </div>
              </div>
            </div>
          )); })()}
          </div>
        </div>
      </Section>

      {/* ─── FAQ ─── */}
      <Section
        id="faq"
        eyebrow="16 · FAQ"
        lead="Häufige Fragen"
        accent="zu WG & Co-Living."
        className="bg-muted/30"
      >
        <div className="space-y-4">
          {[
            { q: "Was passiert, wenn ein Zimmer leer steht?", a: "Bei 3–5 Mietern pro Wohnung fällt nie 100 % der Miete weg. Zusätzlich greift unsere Erstvermietungs­garantie und auf Wunsch eine Mietausfall­versicherung." },
            { q: "Wer kümmert sich um die Mieter?",          a: "Eine spezialisierte Sonderverwaltung übernimmt Mieterkontakt, Abrechnungen und Auszüge — du hast keinen operativen Aufwand." },
            { q: "Wie hoch ist mein Eigenkapital­bedarf?",   a: "Üblicherweise reichen die Kaufnebenkosten (5,5–10 %) — abhängig von Bundesland und Bonität. In vielen Fällen ist sogar eine 100 %-Finanzierung möglich." },
            { q: "Was ist mit der Wiederverkaufbarkeit?",    a: "Nach 10 Jahren ist der Gewinn steuerfrei. Wir prüfen jedes Objekt vorab auf marktgängige Standorte und Grundrisse." },
            { q: "Wie viel Zeit muss ich investieren?",      a: "Im Schnitt 3–4 Termine bis zum Notar. Alles danach übernehmen MOREImmo und unsere Verwaltungspartner." },
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

      {/* ─── KONTAKT CTA ─── */}
      <section id="kontakt" className="py-24 md:py-32 px-6 bg-foreground text-background scroll-mt-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs tracking-[0.3em] uppercase text-primary font-semibold mb-6 animate-fade-in">
            17 · Nächster Schritt
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
                damit wir dir konkrete Co-Living-Objekte zeigen können, die in deiner
                Situation wirklich funktionieren.
              </p>
              <div className="flex flex-wrap justify-center gap-3 animate-scale-in">
                <button
                  onClick={() => {
                    const url = `/selbstauskunft?kundeId=${kundeId}&investmentId=${investmentId}`;
                    try {
                      const opener = window.opener as Window | null;
                      if (opener && !opener.closed) {
                        opener.location.href = url;
                        opener.focus?.();
                        window.close();
                        return;
                      }
                    } catch { /* fallback below */ }
                    navigate(url);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-7 h-12 font-semibold hover:opacity-90 hover-scale transition shadow-lg shadow-primary/30"
                >
                  <FileText className="h-4 w-4" />
                  Selbstauskunft jetzt ausfüllen
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-6 text-xs text-background/50 max-w-xl mx-auto">
                „Jetzt ausfüllen" öffnet das Formular direkt im ursprünglichen Tab.
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
                Im Strategiegespräch klären wir deine individuelle Situation und zeigen,
                wie WG &amp; Co-Living deinen Vermögensaufbau beschleunigt.
              </p>
              <div className="flex flex-wrap justify-center gap-3 animate-scale-in">
                <a
                  href="mailto:info@more.immo?subject=WG%20Co-Living%20Beratung%20MOREImmo"
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-7 h-12 font-semibold hover:opacity-90 hover-scale transition shadow-lg shadow-primary/30"
                >
                  Beratungstermin vereinbaren
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="mailto:info@more.immo"
                  className="inline-flex items-center gap-2 rounded-full border border-background/30 text-background px-7 h-12 hover:bg-background/10 hover-scale transition"
                >
                  info@more.immo
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      </div>

      {/* ─── Footer ─── */}
      <footer className="bg-background border-t border-border py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt="MOREImmo" className="h-7 w-auto" />
            <span className="text-xs text-muted-foreground">
              WG &amp; Co-Living Investments mit MOREImmo · more.immo
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
          zukünftige Ergebnisse. Stand: 2026 · MOREImmo · info@more.immo
        </p>
      </footer>
    </div>
  );
}