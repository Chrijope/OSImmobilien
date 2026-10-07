import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { getStellen, type Stelle } from "@/lib/bewerbungStore";
import { ChaosZuOrdnung, type ChaosPaar } from "@/components/landing/vp/ChaosZuOrdnung";
import { PartnerBewerbungFormular } from "@/components/landing/PartnerBewerbungFormular";
import { SpamHinweis } from "@/components/bewerbung/SpamHinweis";
import { LIZENZ_PAKETE, OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import logoImg from "@/assets/moreimmo-logo.png";
import test1Img from "@/assets/vp-testimonial-1.jpg";
import test2Img from "@/assets/vp-testimonial-2.jpg";
import test3Img from "@/assets/vp-testimonial-3.jpg";
import test4Img from "@/assets/vp-testimonial-4.jpg";
import test5Img from "@/assets/vp-testimonial-5.jpg";
import danielImg from "@/assets/vp-testimonial-daniel.jpg";
import {
  ArrowRight, CheckCircle, Users, Target, Sparkles,
  GraduationCap, Euro, Trophy, ShieldCheck, Rocket, Heart,
  Clock, Star, X,
  Building, Handshake, Layers, Network,
  Gift, Zap, Award, ChevronRight, ChevronDown,
} from "lucide-react";
import { useCountUp } from "@/hooks/use-count-up";
import {
  nutztReduzierteBewegung, Reveal, LoopBuehne, ZeichnenBuehne, Worte,
  NetzwerkSchleife, HeroVideo, KurveGedeckelt, GehaltsTreppe, TippWanderung,
  ZeitSchleife, JahrInFeldern, KurveDurchbruch,
} from "@/components/landing/vp/VpBausteine";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

/* ─── Typen ─── */
type PartnerWeg = "tippgeber" | "vertriebspartner";
type PartnerProfil = "quereinsteiger" | "erfahren" | null;
/** Die drei Lesarten der Seite plus die neutrale VP-Fassung ohne Sub-Wahl. */
type Lesart = "tg" | "vpq" | "vpe" | "vp";

// partner_2 (Partner-Vertrag 2 % Honorar) und tippgeber (nur interne Aktivierung
// im Closing) werden in der öffentlichen Auswahl ausgeblendet
/**
 * Die drei Vertraege, die heute wirklich neu vergeben werden.
 *
 * Bis zum 19.09.2026 zeigte die Seite vier Stufen: Vertriebspartner, Lead
 * Partner, Team Lead und Lizenzpartner. Drei davon stehen in
 * `src/lib/lizenzPakete.ts` laengst auf `waehlbar: false`, sie gelten nur noch
 * fuer Bestandspartner. Die Seite hat also Pakete beworben, die niemand mehr
 * bekommt.
 *
 * Die Reihenfolge ist Christians (19.09.2026): erst der Tippgeber, dann der
 * Vertriebspartner, dann der Lead-Berater. Sie folgt der Tiefe der
 * Zusammenarbeit, nicht einem Rang.
 */
const WEGE_REIHENFOLGE = ["tippgeber", "junior", "lead_berater"] as const;

/**
 * Die kleine Zeile oben rechts auf jeder Karte.
 *
 * Sie sagt, WIE eng die Zusammenarbeit ist, und nicht mehr, auf welcher Stufe
 * jemand steht. "Stufe 1 bis 4" war beim alten Paketmodell richtig und ist es
 * heute nicht mehr.
 */
const WEG_MARKE: Record<string, string> = {
  tippgeber: "Empfehlen",
  junior: "Beraten",
  lead_berater: "Beraten mit Leads",
};
const SICHTBARE_PAKETE = WEGE_REIHENFOLGE.map(
  (id) => LIZENZ_PAKETE.find((p) => p.id === id)!,
).filter(Boolean);

/* ─── Paket-Feature-Kurationen für die öffentliche Landingpage ─── */
/* Preise und Provisionssätze werden bewusst NICHT gezeigt.
   Diese Details werden erst im persönlichen Gespräch besprochen. */
const PAKET_FEATURES: Record<string, string[]> = {
  tippgeber: [
    "Kontakte empfehlen, ohne selbst zu beraten",
    "Kostenfrei, kein laufendes Entgelt",
    "Eigenes Tippgeberportal mit Status jedes Kontakts",
    "Vergütung je vermitteltem Abschluss, individuell vereinbart",
    "Keine Gewerbeerlaubnis nötig, weil keine Beratung stattfindet",
  ],
  junior: [
    "Vollzugriff CRM, Pipeline und geprüfte Objekte",
    "CRM, Exposés, Skripte und Pflichtschulungen werden gestellt",
    "Academy mit Grundkursen und Zertifikaten",
    "Persönlicher Mentor beim Start",
    "Leadpaket buchbar, wann Du willst, keine Pflicht",
    "Kein laufendes Entgelt, keine Mindestlaufzeit",
  ],
  lead_berater: [
    "Alles aus dem Vertriebspartner",
    "Leads werden Dir zur Unterstützung gestellt, nach Verfügbarkeit und ohne feste Stückzahl",
    "Kein Leadpaket nötig, Du kaufst keine Kontakte",
    "Derselbe Provisionssatz wie beim Vertriebspartner",
    "Eigene Akquise bleibt jederzeit möglich",
  ],
};

/* ─── Vorbelegung über URL-Parameter ───
   ?weg=tippgeber|vertriebspartner und ?profil=quereinsteiger|erfahren,
   damit Anzeigen und Posts direkt in die passende Lesart führen. */
const liesUrlVorbelegung = (): { weg: PartnerWeg; profil: PartnerProfil; gewaehlt: boolean } => {
  if (typeof window === "undefined") return { weg: "vertriebspartner", profil: null, gewaehlt: false };
  const params = new URLSearchParams(window.location.search);
  const wegParam = params.get("weg");
  const profilParam = params.get("profil");
  const weg: PartnerWeg = wegParam === "tippgeber" ? "tippgeber" : "vertriebspartner";
  const profil: PartnerProfil =
    profilParam === "quereinsteiger" ? "quereinsteiger" : profilParam === "erfahren" ? "erfahren" : null;
  return { weg, profil, gewaehlt: wegParam !== null || profilParam !== null };
};

/* ─── Wort-Reveal erst bei Sichtbarkeit (Klammer Hero und Finale) ─── */
const WortRevealBeiSicht = ({ text, className, offset = 0 }: { text: string; className?: string; offset?: number }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [an, setAn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (nutztReduzierteBewegung()) {
      setAn(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setAn(true);
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <span ref={ref}>
      {an ? <Worte text={text} className={className} offset={offset} /> : <span className={`opacity-0 ${className ?? ""}`}>{text}</span>}
    </span>
  );
};

/* ─── Animated Chat (G10) ─── */
const ChatAnimation = () => {
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setIsVisible(true); }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (nutztReduzierteBewegung()) {
      setVisibleMessages(6);
      return;
    }
    const msgs = [0, 1, 2, 3, 4, 5];
    msgs.forEach((i) => {
      setTimeout(() => setVisibleMessages(i + 1), 600 * (i + 1));
    });
  }, [isVisible]);

  const messages = [
    { from: "team", name: "Christian", text: "Neuer Lead aus München rein 🔥", time: "09:42" },
    { from: "you", text: "Top, Erstgespräch?", time: "09:43" },
    { from: "team", name: "Christian", text: "Heute 14h. Bonität geprüft, läuft.", time: "09:44" },
    { from: "you", text: "Alles vorbereitet?", time: "09:45" },
    { from: "team", name: "Christian", text: "Klar. Unterlagen und Objekte liegen bereit.", time: "09:46" },
    { from: "you", text: "Perfekt. So muss Vertrieb sein. 💪", time: "09:47" },
  ];

  return (
    <div ref={ref} className="mx-auto max-w-md rounded-2xl border border-border/60 bg-card p-5 shadow-xl">
      <div className="mb-4 flex items-center gap-2 border-b border-border/40 pb-3">
        <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
        <span className="text-sm font-semibold text-foreground">OS Immobilien Team Chat</span>
        <span className="ml-auto text-xs text-muted-foreground">Ohne Warteschleife</span>
      </div>
      <div className="min-h-[280px] space-y-3">
        {messages.slice(0, visibleMessages).map((m, i) => (
          <div key={i} className={`flex ${m.from === "you" ? "justify-end" : "justify-start"} animate-fade-in`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              m.from === "you"
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-muted text-foreground"
            }`}>
              {m.from === "team" && <div className="mb-0.5 text-xs font-semibold text-primary">{m.name}</div>}
              <p>{m.text}</p>
              <div className={`mt-1 text-[10px] ${m.from === "you" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{m.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── G6 · Arbeitsteilung: Aufgaben-Chips wandern von „Du" zu „Wir" ───
   Zahlenfreie Fassung der Arbeitsteilung. Die Zuordnung stammt aus den
   Aufgaben, die die Seite dem Backoffice schon immer zuschreibt (Chat,
   Leads, Objekte, Unterlagen, CRM, Abrechnung). Die Wanderung ist rein
   dekorativ, die Zuordnung steht als echte Liste im DOM. */
const ArbeitsteilungGrafik = ({ variante }: { variante: "vp" | "tg" }) => {
  const du = variante === "tg"
    ? ["Kontakt empfehlen"]
    : ["Gespräche führen", "Beziehungen halten", "Abschließen"];
  const wir = variante === "tg"
    ? ["Beratung und Termine", "Objekte und Unterlagen", "Abschlussbegleitung", "Abrechnung Deiner Vergütung"]
    : ["Objekte prüfen", "Unterlagen vorbereiten", "Bonität und Finanzierung begleiten", "Termine koordinieren", "Leads vorqualifizieren", "CRM und Abrechnung"];

  return (
    <ZeichnenBuehne dekorativ={false} className="vp-chips mx-auto max-w-3xl">
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Du machst</h3>
          <ul className="flex flex-wrap gap-2.5">
            {du.map((chip) => (
              <li key={chip} className="rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                {chip}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/70 p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Wir machen</h3>
          <ul className="flex flex-wrap gap-2.5">
            {wir.map((chip, i) => (
              <li
                key={chip}
                className="vp-chip-wandert rounded-full border border-border/60 bg-muted/60 px-4 py-2 text-sm font-medium text-foreground"
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ZeichnenBuehne>
  );
};

/* ─── G8 · Weg-Linie: zeichnet sich mit dem Leser, ohne Pinnung ───
   Der Scrollfortschritt des Abschnitts steuert den stroke-dashoffset,
   Stationen blenden auf, wenn die Linie sie erreicht. Bei reduzierter
   Bewegung steht alles sofort im Endzustand. */
interface WegStation {
  marke: string;
  titel: string;
  text: string;
  hoehepunkt?: boolean;
}

const STATION_SCHWELLEN = [0.12, 0.38, 0.62, 0.85];

const WegLinie = ({ stationen }: { stationen: WegStation[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [fortschritt, setFortschritt] = useState(0);

  useEffect(() => {
    if (nutztReduzierteBewegung()) {
      setFortschritt(1);
      return;
    }
    let raf = 0;
    const messen = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.9 - r.top) / (r.height + vh * 0.35)));
      setFortschritt(p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(messen);
    };
    messen();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const stationsInhalt = (s: WegStation, aktiv: boolean) => (
    <div
      className={`transition-all duration-500 ${aktiv ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
    >
      <Badge variant="outline" className={`mb-2 text-xs ${s.hoehepunkt ? "border-primary/50 bg-primary/10 font-semibold text-primary" : ""}`}>
        {s.marke}
      </Badge>
      <h3 className="mb-1.5 text-base font-bold">{s.titel}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>
    </div>
  );

  return (
    <div ref={ref}>
      {/* Desktop: Linie von links unten nach rechts oben */}
      <div className="relative hidden lg:block">
        <svg
          aria-hidden="true"
          viewBox="0 0 1000 300"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-2 h-[240px] w-full"
        >
          <path
            d="M30 268 C 220 258, 360 224, 500 168 C 640 112, 800 66, 970 34"
            fill="none" stroke="hsl(var(--border))" strokeWidth="2"
          />
          <path
            d="M30 268 C 220 258, 360 224, 500 168 C 640 112, 800 66, 970 34"
            fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round"
            pathLength={100}
            style={{ strokeDasharray: 100, strokeDashoffset: 100 - fortschritt * 100 }}
          />
        </svg>
        <ol className="relative grid grid-cols-4 gap-6 pt-[150px]">
          {stationen.map((s, i) => {
            const aktiv = fortschritt >= STATION_SCHWELLEN[i];
            const versatz = ["lg:mt-16", "lg:mt-10", "lg:mt-4", "lg:mt-0"][i];
            return (
              <li key={s.marke} className={versatz}>
                <div className="relative mb-4 flex justify-center" aria-hidden="true">
                  <span
                    className={`${s.hoehepunkt && aktiv ? "vp-halo" : ""} relative flex h-4 w-4 rounded-full ring-4 ring-background transition-colors duration-500 ${aktiv ? "bg-primary" : "bg-border"}`}
                  />
                </div>
                <div className="text-center">{stationsInhalt(s, aktiv)}</div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Mobil: vertikale Linie am linken Rand, ruhige Fassung */}
      <div className="relative pl-8 lg:hidden">
        <div aria-hidden="true" className="absolute bottom-2 left-[7px] top-2 w-0.5 rounded-full bg-border">
          <div
            className="w-full rounded-full bg-primary"
            style={{ height: `${fortschritt * 100}%` }}
          />
        </div>
        <ol className="space-y-10">
          {stationen.map((s, i) => {
            const aktiv = fortschritt >= STATION_SCHWELLEN[i];
            return (
              <li key={s.marke} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[29px] top-1 h-4 w-4 rounded-full ring-4 ring-background transition-colors duration-500 ${aktiv ? "bg-primary" : "bg-border"}`}
                />
                {stationsInhalt(s, aktiv)}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

/* ─── G9 · Drei Wege statt einer Treppe ───
   Bis zum 19.09.2026 stand hier eine Treppe mit aufsteigenden Sockeln und
   "Stufe 1" bis "Stufe 4". Das stimmt fuer die heutigen Vertraege nicht mehr:
   Vertriebspartner und Lead-Berater haben denselben Provisionssatz und
   unterscheiden sich nur darin, woher die Kontakte kommen. Der Tippgeber ist
   keine Vorstufe, sondern eine andere Rolle ganz ohne Beratung. Eine Treppe
   haette einen Aufstieg behauptet, den es so nicht gibt.
   Vorausgewaehlt ist der Vertriebspartner: der Regelfall, nicht das teuerste
   Paket. */
const KarriereTreppe = ({ scrollToForm }: { scrollToForm: () => void }) => {
  const [aktiv, setAktiv] = useState<string>("junior");
  const [aufgeklappt, setAufgeklappt] = useState<Record<string, boolean>>({});
  const knopfRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const schalten = (richtung: 1 | -1) => {
    const idx = SICHTBARE_PAKETE.findIndex((p) => p.id === aktiv);
    const next = Math.min(SICHTBARE_PAKETE.length - 1, Math.max(0, idx + richtung));
    setAktiv(SICHTBARE_PAKETE[next].id);
    knopfRefs.current[next]?.focus();
  };

  return (
    <ol
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-3 lg:items-stretch lg:overflow-visible lg:pb-0"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); schalten(1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); schalten(-1); }
      }}
    >
      {SICHTBARE_PAKETE.map((p, idx) => {
        const istAktiv = aktiv === p.id;
        const features = PAKET_FEATURES[p.id] ?? [];
        const kern = features.slice(0, 3);
        const rest = features.slice(3);
        const offen = !!aufgeklappt[p.id];
        return (
          <li
            key={p.id}
            aria-current={istAktiv ? "step" : undefined}
            className="min-w-[270px] snap-center lg:min-w-0"
          >
            <Reveal delay={idx * 100}>
              <Card
                className={`flex h-full flex-col gap-3 border-2 p-5 transition-all duration-300 ${
                  istAktiv
                    ? "-translate-y-2 border-primary bg-gradient-to-b from-primary/10 to-card shadow-xl"
                    : "border-border/40 bg-card/70"
                }`}
              >
                <button
                  ref={(el) => { knopfRefs.current[idx] = el; }}
                  type="button"
                  onClick={() => setAktiv(p.id)}
                  className="rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl" aria-hidden="true">{p.emoji}</span>
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{WEG_MARKE[p.id] ?? ""}</span>
                  </div>
                  <h3 className="mt-1 text-lg font-bold">{p.titel}</h3>
                  <p className="text-sm text-muted-foreground">{p.kurz}</p>
                </button>
                <ul className="flex-1 space-y-2 text-sm">
                  {kern.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                  {offen && rest.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {rest.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAufgeklappt((a) => ({ ...a, [p.id]: !a[p.id] }))}
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    {offen ? "Weniger anzeigen" : "Alle Punkte anzeigen"}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${offen ? "rotate-180" : ""}`} />
                  </button>
                )}
                <Button
                  onClick={scrollToForm}
                  variant={istAktiv ? "default" : "outline"}
                  size="sm"
                  className="w-full gap-2"
                >
                  {p.titel} wählen <ArrowRight className="h-4 w-4" />
                </Button>
              </Card>
            </Reveal>
          </li>
        );
      })}
    </ol>
  );
};

/* ─── G11 · 98-%-Ring mit sichtbarer Lücke (dunkle Beweis-Insel) ─── */
const ZufriedenheitsRing = () => {
  const { ref, display } = useCountUp({ end: 98, suffix: " %", duration: 1200 });
  return (
    <ZeichnenBuehne dekorativ={false} schwelle={0.4} className="flex flex-col items-center">
      <div className="relative h-44 w-44">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(215 16% 28%)" strokeWidth="7" />
          <circle
            cx="60" cy="60" r="52" fill="none"
            stroke="#30E19E" strokeWidth="7" strokeLinecap="round"
            pathLength={100} className="vp-ring-bogen"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span ref={ref} className="text-3xl font-bold text-[#30E19E]">{display}</span>
        </div>
      </div>
      <div className="mt-2 text-sm text-slate-400">Partnerzufriedenheit</div>
    </ZeichnenBuehne>
  );
};

/* ─── Abschnitt 4 · Der Schnitt: Lichtschalter von Nacht auf Hell ─── */
const SchnittAbschnitt = ({ lesart }: { lesart: Lesart }) => {
  const kopfRef = useRef<HTMLDivElement>(null);
  const [hell, setHell] = useState(false);

  useEffect(() => {
    const el = kopfRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setHell(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const istTG = lesart === "tg";

  return (
    <section
      className={`border-b border-border/40 py-20 transition-colors duration-200 ${hell ? "bg-background" : "bg-[hsl(219_32%_9%)]"}`}
    >
      <div className="mx-auto max-w-5xl px-6">
        <div ref={kopfRef} className="mx-auto mb-12 max-w-3xl text-center">
          <Badge
            variant="outline"
            className={`mb-3 transition-colors duration-200 ${hell ? "" : "border-white/20 text-slate-300"}`}
          >
            Der Schnitt
          </Badge>
          <h2 className={`text-3xl font-bold tracking-tight transition-colors duration-200 md:text-4xl ${hell ? "text-foreground" : "text-white"}`}>
            {istTG ? (
              <>Empfehlen kannst Du schon. <span className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent">Ab jetzt lohnt es sich.</span></>
            ) : (
              <>Es liegt nicht an Dir. <span className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent">Es liegt am System.</span></>
            )}
          </h2>
          <p className={`mt-4 leading-relaxed transition-colors duration-200 ${hell ? "text-muted-foreground" : "text-slate-400"}`}>
            {istTG
              ? "Deine Empfehlungen haben immer schon Wert geschaffen. Ab jetzt fließt ein Teil davon zu Dir zurück."
              : "Dieselbe Person, dieselbe Arbeit, ein anderes System. Und damit ein anderes Ergebnis. Genau dafür haben wir OS Immobilien gebaut."}
          </p>
        </div>

        {/* G5: die Bühne aus Abschnitt 2 kehrt zurück, die Kurve durchbricht die Decke */}
        <div className="mx-auto max-w-2xl">
          <ZeichnenBuehne schwelle={0.35}>
            {istTG ? <TippWanderung rueckfluss /> : <KurveDurchbruch />}
          </ZeichnenBuehne>
          <p className={`mt-2 text-center text-sm font-medium transition-colors duration-200 ${hell ? "text-muted-foreground" : "text-slate-400"}`}>
            {istTG ? "Deine Empfehlung wandert. Die Vergütung kommt zurück." : "Gleiches Können. Anderes System."}
          </p>
        </div>

        {!istTG && (
          <p className={`mx-auto mt-10 max-w-2xl text-center leading-relaxed transition-colors duration-200 ${hell ? "text-muted-foreground" : "text-slate-400"}`}>
            Du brauchst keinen Coach, der Dir sagt, was Du tun sollst. Du brauchst ein funktionierendes
            System und ein Team, das abnimmt, wenn Du anrufst.
          </p>
        )}
      </div>
    </section>
  );
};

/* ─── Hauptseite ─── */
const VertriebspartnerLanding = () => {
  const [vorbelegung] = useState(liesUrlVorbelegung);
  const [weg, setWeg] = useState<PartnerWeg>(vorbelegung.weg);
  const [profil, setProfil] = useState<PartnerProfil>(vorbelegung.profil);
  const [gewaehlt, setGewaehlt] = useState(vorbelegung.gewaehlt);
  const [stelle, setStelle] = useState<Stelle | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  // reCAPTCHA v3 lädt erst, wenn jemand das Formular benutzt, nicht schon
  // beim Seitenaufruf (`PartnerBewerbungFormular`, onFocusCapture). Wer die
  // Seite nur liest, schickt Google nichts. Seit dem 26.09.2026.

  useEffect(() => {
    const all = getStellen();
    const vp = all.find(s =>
      s.titel.toLowerCase().includes("vertriebspartner") &&
      s.titel.toLowerCase().includes("immobilien")
    ) || all.find(s => s.titel.toLowerCase().includes("vertriebspartner"));
    setStelle(vp || null);
  }, []);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const scrollToWeiche = () => {
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Umschalten ohne Scroll-Sprung: misst die Position des geklickten Buttons
  // vor und nach dem State-Update und korrigiert den Scroll, sodass der
  // Button visuell an Ort und Stelle bleibt.
  const mitScrollAusgleich = (btn: HTMLElement | null, update: () => void) => {
    const before = btn?.getBoundingClientRect().top ?? null;
    flushSync(update);
    if (btn && before !== null) {
      const after = btn.getBoundingClientRect().top;
      const delta = after - before;
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
    }
  };

  const handleSetWeg = (next: PartnerWeg, btn: HTMLElement | null) => {
    if (next === weg) return;
    mitScrollAusgleich(btn, () => {
      setWeg(next);
      setGewaehlt(true);
    });
  };

  const handleSetProfil = (next: PartnerProfil, btn: HTMLElement | null) => {
    if (next === profil) return;
    mitScrollAusgleich(btn, () => {
      setProfil(next);
      setGewaehlt(true);
    });
  };

  // Das Formular selbst liegt seit dem 24.09.2026 in
  // `components/landing/PartnerBewerbungFormular.tsx`, damit die Stellenanzeige
  // dasselbe benutzt. Hier bleibt nur, was die Seite nach dem Absenden tut.
  const nachAbsenden = () => {
    setSubmitted(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const isTG = weg === "tippgeber";
  const lesart: Lesart = isTG ? "tg" : profil === "quereinsteiger" ? "vpq" : profil === "erfahren" ? "vpe" : "vp";

  /* ─── Inhalte je Lesart ─── */

  const profilName =
    lesart === "tg" ? "Tippgeber"
    : lesart === "vpq" ? "Vertriebspartner · Quereinsteiger"
    : lesart === "vpe" ? "Vertriebspartner · Erfahren"
    : "Vertriebspartner";

  // Abschnitt 2 · Wo Du heute stehst
  const statusSzene =
    lesart === "tg"
      ? "Die letzte war es jedenfalls. Nur nicht für Dich. Der Makler hat verdient, die Bank hat verdient. Du hast ein Dankeschön bekommen."
      : lesart === "vpq"
        ? "Du tauschst Zeit gegen Geld. Jeden Monat dasselbe Gehalt, jedes Jahr ein kleiner Sprung, wenn überhaupt. Du weißt, dass mehr in Dir steckt. Aber niemand zeigt Dir, wo Du anfangen sollst."
        : lesart === "vpe"
          ? "Du machst Deine Abschlüsse. Und trotzdem: Die Provision teilt sich über Ebenen, die Du nie siehst. Das Produkt hast Du Dir nicht ausgesucht. Die Leads bezahlst Du selbst. Und über Deinem Einkommen liegt eine Linie, die Du nicht gezogen hast."
          : "Du gibst jeden Tag Leistung ab. Und trotzdem entscheidet nicht Dein Können über Dein Ergebnis, sondern das System, in dem Du steckst. Über Deinem Einkommen liegt eine Linie, die Du nicht gezogen hast.";

  const statusBildunterschrift =
    lesart === "tg" ? "Dein Tipp. Deren Ertrag."
    : lesart === "vpq" ? "Jedes Jahr eine winzige Stufe."
    : "Dein Können. Die Decke Deines Systems.";

  // Abschnitt 3 · „Kennst Du das?"-Karten (zahlenfrei)
  /*
    Fuenf Saetze, und zu jedem die Antwort, die bei uns an dieser Stelle steht.
    Sie gehoeren zusammen: Der Abschnitt zeigt erst den Haufen und dreht dann
    jede Karte um, siehe ChaosZuOrdnung. Ein Satz ohne Antwort waere nur ein
    Vorwurf, eine Antwort ohne Satz nur eine Behauptung.
  */
  const kennstDuDas: ChaosPaar[] =
    lesart === "vpq"
      ? [
          {
            problem: "Dein Gehalt ist verhandelt, nicht verdient.",
            antwort: "Deine Provision hängt an Deinem Abschluss, nicht an einem Gespräch im Frühjahr.",
          },
          {
            problem: "Deine beste Leistung gehört Deinem Arbeitgeber.",
            antwort: "Jeder Abschluss läuft auf Deinen Namen und bleibt in Deinem Kundenstamm.",
          },
          {
            problem: "Weiterbildung gibt es, wenn das Budget reicht.",
            antwort: "Academy, Skripte und Pflichtschulungen werden gestellt, ab dem ersten Tag.",
          },
          {
            problem: "Nach dem Start warst Du plötzlich allein.",
            antwort: "Ein Mentor beim Start, Backoffice und Finanzierung dauerhaft im Rücken.",
          },
          {
            problem: "Und irgendwann hörst Du auf zu fragen, ob das alles war.",
            antwort: "Kein Monatsbeitrag, keine Laufzeit. Du siehst am ersten Abschluss, ob es trägt.",
          },
        ]
      : [
          {
            problem: "Das Produkt bestimmt jemand anderes. Du darfst es nur verteidigen.",
            antwort: "Du siehst jedes Objekt vor dem Kunden. Was nicht hält, nimmst Du nicht mit.",
          },
          {
            problem: "Je mehr Ebenen über Dir, desto kleiner Dein Anteil.",
            antwort: "Ein Satz für alle, auf Lead- und auf Eigenkontakte gleich.",
          },
          {
            problem: "Die Schulung war Hochglanz. Der Alltag ist Kaltakquise.",
            antwort: "Kontakte kommen aus dem System. Kaltakquise ist kein Teil des Modells.",
          },
          {
            problem: "Nach dem Start warst Du plötzlich allein.",
            antwort: "Backoffice, Finanzierung und Abwicklung laufen weiter, auch wenn Du auflegst.",
          },
          {
            problem: "Und irgendwann hörst Du auf zu fragen, ob das alles war.",
            antwort: "Kein Monatsbeitrag, keine Laufzeit. Was Du aufbaust, bleibt Deins.",
          },
        ];

  // Abschnitt 5 · Vorteile, gekürzt auf die vier stärksten je Lesart
  const alleVpVorteile = {
    karriere: { icon: Trophy, title: "Kein Einkauf, keine Laufzeit", desc: "Du zahlst nichts im Monat und bindest Dich an keine Frist. CRM, Objekte, Exposés und Schulungen werden gestellt." },
    crm: { icon: Rocket, title: "Die Technik stellen wir", desc: "Kontaktverwaltung, Investitionsrechner und Exposés, die Du dem Kunden direkt schicken kannst." },
    academy: { icon: GraduationCap, title: "Eigene Academy", desc: "Strukturierte Ausbildung mit Zertifikat, auch für Quereinsteiger geeignet." },
    microseite: { icon: Sparkles, title: "Eigene Microseite", desc: "Persönliche Landingpage und Online-Auftritt für Deine Kundenakquise." },
    objekte: { icon: ShieldCheck, title: "Geprüfte Objekte", desc: "Jedes Objekt ist vorher rechtlich, baulich und wirtschaftlich durchgesehen. Du verkaufst, was hält." },
    modell: { icon: Award, title: "Attraktives Modell", desc: "Faire Vergütung ohne Deckelung. Die konkreten Konditionen besprechen wir im persönlichen Gespräch." },
  };

  const vorteile =
    lesart === "tg"
      ? [
          { icon: Gift, title: "Kein Risiko", desc: "Du empfiehlst weiter und verdienst. Ohne Investition, ohne Verpflichtung." },
          { icon: Euro, title: "Faire Vergütung", desc: "Für jeden vermittelten Kontakt, der zum Abschluss kommt. Transparent und ohne Deckelung. Konditionen im persönlichen Gespräch." },
          { icon: Clock, title: "Zeitlich flexibel", desc: "Ob wenige Stunden pro Woche oder deutlich mehr. Du entscheidest das Tempo." },
          { icon: Zap, title: "Schnell startklar", desc: "Keine Grundgebühr, keine lange Einarbeitung. Formular ausfüllen, kurz sprechen, loslegen." },
        ]
      : lesart === "vpq"
        ? [alleVpVorteile.academy, alleVpVorteile.crm, alleVpVorteile.objekte, alleVpVorteile.karriere]
        : lesart === "vpe"
          ? [alleVpVorteile.objekte, alleVpVorteile.modell, alleVpVorteile.karriere, alleVpVorteile.crm]
          : [alleVpVorteile.karriere, alleVpVorteile.crm, alleVpVorteile.academy, alleVpVorteile.objekte];

  const wertschoepfung = [
    { icon: Building, title: "Ankauf oder Kooperation", desc: "Wir kaufen Bestandsobjekte selbst an oder beziehen Neubauten direkt aus exklusiven Kooperationen mit Bauträgern." },
    { icon: Layers, title: "Projektierung", desc: "Nur bei eigenem Ankauf: Architekten und Bauteam entwickeln das Objekt strategisch weiter." },
    { icon: Handshake, title: "Sanierung", desc: "Nur bei eigenem Ankauf: energetische Komplettsanierung unter eigener Bauleitung." },
    { icon: Network, title: "Vertrieb", desc: "In jedem Fall verkaufen ausschließlich unsere eigenen Partner, niemand sonst." },
  ];

  // Abschnitt 6 · Timeline je Lesart (die einzige belastbare Prozesszahl: Ø 8 Wochen)
  const wegStationen: WegStation[] =
    lesart === "vpe"
      ? [
          { marke: "Tag 1", titel: "Zugang und erstes Gespräch", text: "Du startest mit vollem Zugang zu CRM, Academy und den geprüften Objekten." },
          { marke: "Woche 1", titel: "Erste eigene Termine im neuen System", text: "Du führst Deine Gespräche wie bisher, nur mit Backoffice im Rücken." },
          { marke: "Ø Woche 8", titel: "Der erste Abschluss", text: "So lange hat es bei unseren Partnern im Schnitt gedauert.", hoehepunkt: true },
          { marke: "Jahr 1", titel: "Dein eigener Kundenstamm", text: "Aus den ersten Abschlüssen werden Empfehlungen, und aus Empfehlungen wird Dein eigener Kreis." },
        ]
      : lesart === "vpq"
        ? [
            { marke: "Tag 1", titel: "Ankommen und Mentor", text: "Du lernst Dein Team kennen und bekommst einen persönlichen Mentor an die Seite." },
            { marke: "Woche 1 bis 4", titel: "Academy und erste Begleittermine", text: "Strukturierte Ausbildung, erste Termine gemeinsam mit erfahrenen Partnern." },
            { marke: "Ø Woche 8", titel: "Erster eigener Abschluss", text: "Im Schnitt steht nach acht Wochen der erste eigene Abschluss.", hoehepunkt: true },
            { marke: "Jahr 1", titel: "Eigene Pipeline, eigenes Standbein", text: "Du arbeitest aus einer belastbaren Pipeline und baust Dein Standbein aus." },
          ]
        : [
            { marke: "Tag 1", titel: "Ankommen und Mentor", text: "Du lernst Dein Team persönlich kennen und startest mit klarem Plan." },
            { marke: "Woche 1 bis 4", titel: "Academy und erste Termine", text: "Ausbildung und Praxis laufen von Anfang an parallel." },
            { marke: "Ø Woche 8", titel: "Erster eigener Abschluss", text: "Im Schnitt steht nach acht Wochen der erste eigene Abschluss.", hoehepunkt: true },
            { marke: "Jahr 1", titel: "Eigene Kunden, eigenes Standbein", text: "Ein belastbares Netzwerk, eine gefüllte Pipeline und, wenn Du willst, mehr davon." },
          ];

  const tgDreischritt = [
    { step: "1", title: "Bewerben", desc: "Formular ausfüllen. In wenigen Minuten erledigt." },
    { step: "2", title: "Kontakt empfehlen", desc: "Teile Deinen persönlichen Link oder melde Kontakte direkt." },
    { step: "3", title: "Erfolgshonorar", desc: "Bei Abschluss erhältst Du Deine Vergütung. Transparent und pünktlich." },
  ];

  // Abschnitt 7 · Testimonials, profilabhängig sortiert (keine neuen Stimmen)
  const testimonials = useMemo(() => {
    const alle = [
      {
        id: "daniel",
        img: danielImg,
        name: "Daniel B.",
        rolle: "Vertriebspartner seit 2024",
        vorher: "Vorher: Versicherungsmakler. Viele Produkte, wenig Substanz. Provisionen oft Wochen hinterhergerannt.",
        jetzt: "Heute: Fokus auf Immobilien-Kapitalanlage. Geprüfte Objekte, Provision punktgenau nach Notar.",
      },
      {
        id: "marco",
        img: test1Img,
        name: "Marco S.",
        rolle: "Vertriebspartner seit 2025",
        vorher: "Vorher: Quereinsteiger aus dem Außendienst. Null Plan vom Immobilienvertrieb, dafür Lust auf etwas Echtes.",
        jetzt: "Heute: Erster Abschluss nach 4 Monaten, zweiter im selben Quartal. Academy + Mentor haben mich getragen.",
      },
      {
        id: "julia",
        img: test2Img,
        name: "Julia W.",
        rolle: "Vertriebspartnerin seit 2024",
        vorher: "Vorher: Bankberaterin in der Filiale. Eingesperrt in Produktkataloge und Quartalsziele.",
        jetzt: "Heute: Eigene Pipeline, geprüfte Objekte vom Bauträger, faires Provisionsmodell. Vertrieb mit gutem Gewissen.",
      },
      {
        id: "stefan",
        img: test3Img,
        name: "Dr. Stefan K.",
        rolle: "Senior Partner seit 2023",
        vorher: "Vorher: 20 Jahre Bankenvertrieb, am Ende ausgebrannt und desillusioniert. Wollte alles hinwerfen.",
        jetzt: "Heute: OS Immobilien ist mein Hauptstandbein. Qualität der Objekte und Kultur im Team haben mich zurückgeholt.",
      },
      {
        id: "anna",
        img: test4Img,
        name: "Anna B.",
        rolle: "Tippgeberin seit 2024",
        vorher: "Vorher: Steuerfachangestellte mit großem Netzwerk, aber kein Weg, Empfehlungen sauber zu monetarisieren.",
        jetzt: "Heute: Nebenberuflich aktiv, 2. Einkommen aufgebaut. Microseite, CRM, Abrechnung: alles digital, null Stress.",
      },
      {
        id: "tobias",
        img: test5Img,
        name: "Tobias R.",
        rolle: "Vertriebspartner seit 2025",
        vorher: "Vorher: Selbstständiger Finanzberater. Allein unterwegs, ohne Team, ohne Backoffice, ohne Mentor.",
        jetzt: "Heute: Persönlicher Mentor, festes Team, klare Prozesse. Ich hatte nie das Gefühl, allein dazustehen.",
      },
    ];
    const zuerst =
      lesart === "tg" ? ["anna"]
      : lesart === "vpq" ? ["marco", "tobias"]
      : lesart === "vpe" ? ["daniel", "julia", "stefan"]
      : [];
    return [
      ...zuerst.map((id) => alle.find((t) => t.id === id)!),
      ...alle.filter((t) => !zuerst.includes(t.id)),
    ];
  }, [lesart]);

  // Abschnitt 8 · Match-Check, eine Karte wird je Profil getauscht
  const matchKarten = [
    { icon: Users, title: "Du redest gern mit Menschen", desc: "Auch mit Fremden. Kein Cold-Call-Theater. Warme Vorstellung reicht." },
    lesart === "vpq"
      ? { icon: Target, title: "Du bringst Ernsthaftigkeit mit, mehr nicht", desc: "Verkaufen bringen wir Dir bei. Skripte, Prozesse, Übergaben: alles dokumentiert." }
      : lesart === "vpe"
        ? { icon: Target, title: "Du willst, dass Deine Erfahrung zählt", desc: "Du willst Deine Erfahrung endlich in einem System einsetzen, das sie bezahlt." }
        : { icon: Target, title: "Du willst ein System lernen", desc: "Skripte, Prozesse, Übergaben. Alles dokumentiert. Kein Geheimrezept." },
    { icon: Handshake, title: "Du machst, was Du sagst", desc: "Verbindlichkeit ist alles. Von uns bekommst Du dasselbe zurück." },
    { icon: Heart, title: "Du willst Teil eines Teams sein", desc: "Nicht nur eine Nummer. Jeder Vertriebspartner kennt jeden im Team." },
    { icon: ShieldCheck, title: "Du willst hinter dem Produkt stehen", desc: "Eine Immobilie, die wirklich Vermögen aufbaut. Kein Hochglanz ohne Substanz." },
    { icon: Rocket, title: "Du willst jetzt anfangen", desc: "Nicht in einem halben Jahr. Das Formular dauert ein paar Minuten, den Rest besprechen wir persönlich." },
  ];

  const faqItems = isTG
    ? [
        { q: "Was genau macht ein Tippgeber?", a: "Du empfiehlst Menschen aus Deinem Umfeld, die sich für eine Immobilien-Kapitalanlage interessieren. Wenn ein Kontakt zum Abschluss kommt, erhältst Du eine Provision, ohne selbst verkaufen zu müssen." },
        { q: "Muss ich etwas investieren?", a: "Nein. Als Tippgeber gibt es keine Kosten, keine Grundgebühr und keine Verpflichtung. Du registrierst Dich kostenlos." },
        { q: "Brauche ich Fachwissen?", a: "Nein. Du brauchst lediglich Kontakte und die Bereitschaft, diese an uns weiterzuleiten. Die fachliche Beratung übernimmt unser Team." },
        { q: "Wie hoch ist die Vergütung?", a: "Für jeden erfolgreich vermittelten Abschluss erhältst Du eine faire, transparente Vergütung ohne Deckelung. Die konkrete Höhe besprechen wir im persönlichen Gespräch." },
        { q: "Kann ich später Vertriebspartner werden?", a: "Absolut. Viele unserer Vertriebspartner haben als Tippgeber angefangen und sich dann für den nächsten Schritt entschieden." },
      ]
    : [
        { q: "Brauche ich eine §34c-Gewerbeerlaubnis?", a: "Ja, für die selbstständige Vermittlung ist eine §34c-Erlaubnis erforderlich. Wir unterstützen Dich beim Antragsprozess." },
        { q: "Wie ist das Partnermodell aufgebaut?", a: "Es gibt drei Wege: Tippgeber, wenn Du nur empfehlen willst. Vertriebspartner, wenn Du selbst berätst und Deine Kontakte selbst gewinnst. Lead-Berater, wenn wir Dich dabei mit Kontakten unterstützen. Beraten heißt in beiden Fällen derselbe Provisionssatz." },
        { q: "Kann ich neben- oder hauptberuflich starten?", a: "Beides ist möglich. Viele starten nebenberuflich und wechseln nach den ersten Abschlüssen in die Hauptberuflichkeit." },
        { q: "Brauche ich Vorerfahrung?", a: "Nein. Quereinsteiger aus Finanz-, Versicherungs- oder Beratungsumfeld sind willkommen. Das nötige Know-how vermitteln wir über unsere Academy." },
        { q: "Wie schnell kann ich starten?", a: "Nach Deiner Bewerbung melden wir uns schnell und persönlich, meist noch am selben Tag. Bei positiver Entscheidung kannst Du innerhalb weniger Wochen starten." },
        { q: "Wie sieht das Vergütungsmodell aus?", a: "Du bekommst eine Provision je Abschluss, einheitlich und ohne Deckelung, egal ob der Kontakt von uns kam oder von Dir. Kein Monatsbeitrag, keine Mindestlaufzeit. Die genaue Höhe besprechen wir im persönlichen Gespräch." },
        { q: "Bekomme ich Leads?", a: "Du erhältst Zugang zu Off-Market-Objekten und kannst eigene Kunden akquirieren, mit Setter-Team, Marketingmaterialien und eigener Microsite." },
      ];

  // Abschnitt 9 · profilabhängige Schlusszeile
  const schlusszeile =
    lesart === "tg" ? "Deine nächste Empfehlung kann die erste bezahlte sein."
    : lesart === "vpq" ? "In einem Jahr bist Du kein Quereinsteiger mehr."
    : lesart === "vpe" ? "Dein nächster Abschluss kann schon im neuen System stattfinden."
    : null;

  const erfahrungPlaceholder =
    lesart === "vpe" ? "z. B. 5 Jahre Versicherungsvertrieb"
    : lesart === "vpq" ? "z. B. Quereinsteiger aus dem Handwerk"
    : "z. B. 3 Jahre Vertrieb, Quereinsteiger, Immobilienkaufmann";

  /* ─── Weiche als Radiogruppe (Hero und Formular) ───
     Bewusst einfache Render-Funktionen statt Inline-Komponenten: so bleibt
     der DOM beim Umschalten erhalten und der Scroll-Ausgleich misst stabil. */
  const wegWeiche = (kompakt = false) => (
    <div
      role="radiogroup"
      aria-label="Was passt zu Dir?"
      className="grid gap-3 sm:grid-cols-2"
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          handleSetWeg(isTG ? "vertriebspartner" : "tippgeber", e.currentTarget.querySelector<HTMLElement>('[aria-checked="true"]'));
        }
      }}
    >
      {([
        {
          wert: "tippgeber" as PartnerWeg,
          icon: Handshake,
          titel: "Empfehlen",
          satz: "Ich kenne Menschen, die investieren wollen. Ich empfehle, ihr macht den Rest.",
        },
        {
          wert: "vertriebspartner" as PartnerWeg,
          icon: Target,
          titel: "Verkaufen",
          satz: "Ich will selbst beraten und abschließen. Hauptberuflich oder auf dem Weg dahin.",
        },
      ]).map((k) => {
        const aktivKarte = weg === k.wert;
        return (
          <button
            key={k.wert}
            type="button"
            role="radio"
            aria-checked={aktivKarte}
            tabIndex={aktivKarte ? 0 : -1}
            onClick={(e) => handleSetWeg(k.wert, e.currentTarget)}
            className={`vp-weiche-karte min-h-[44px] rounded-xl border-2 p-4 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
              aktivKarte
                ? "-translate-y-0.5 border-primary bg-primary/5 shadow-md"
                : "border-border/60 bg-card/60 opacity-60 hover:-translate-y-0.5 hover:opacity-90"
            }`}
          >
            <span className="flex items-center gap-2 font-bold text-foreground">
              <k.icon className={`h-5 w-5 ${aktivKarte ? "text-primary" : "text-muted-foreground"}`} />
              {k.titel}
            </span>
            {!kompakt && <span className="mt-1.5 block text-sm leading-snug text-muted-foreground">{k.satz}</span>}
          </button>
        );
      })}
    </div>
  );

  const profilWeiche = (kompakt = false) => (
    <div className={`vp-aufklapp ${!isTG ? "vp-offen" : ""}`} aria-hidden={isTG || undefined}>
      <div className="overflow-hidden">
        <div className={kompakt ? "pt-3" : "pt-4"}>
          {!kompakt && (
            <p className="mb-2 text-sm font-medium text-foreground">Bringst Du Vertriebs- oder Immobilienerfahrung mit?</p>
          )}
          <div role="radiogroup" aria-label="Bringst Du Vertriebs- oder Immobilienerfahrung mit?" className="inline-flex rounded-xl border border-border/60 bg-muted/50 p-1">
            {([
              { wert: "quereinsteiger" as PartnerProfil, label: "Ich steige quer ein" },
              { wert: "erfahren" as PartnerProfil, label: "Ich komme aus der Branche" },
            ]).map((o) => {
              const aktivOption = profil === o.wert;
              return (
                <button
                  key={o.wert}
                  type="button"
                  role="radio"
                  aria-checked={aktivOption}
                  tabIndex={isTG ? -1 : 0}
                  onClick={(e) => handleSetProfil(o.wert, e.currentTarget)}
                  className={`vp-weiche-karte min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                    aktivOption ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div data-lg="seite" className="min-h-screen bg-background">
      {/* Header mit Sticky-Profilanzeige */}
      <header data-lg="kopfscheibe" className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <Link to="/karriere" className="flex shrink-0 items-center gap-3">
            <img src={logoImg} alt="OS Immobilien" className="h-9 object-contain" />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {gewaehlt && (
              <span className="hidden min-w-0 items-center gap-2 rounded-full border border-border/60 bg-muted/50 py-1 pl-3 pr-1 text-xs text-muted-foreground sm:flex">
                <span className="truncate">Deine Auswahl: <strong className="font-semibold text-foreground">{profilName}</strong></span>
                <button
                  type="button"
                  onClick={scrollToWeiche}
                  className="rounded-full px-2 py-0.5 font-semibold text-primary hover:bg-primary/10"
                >
                  Ändern
                </button>
              </span>
            )}
            <Button onClick={scrollToForm} size="sm" className="gap-1.5">
              Jetzt bewerben <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ═══════ ABSCHNITT 1 · HERO: COLD OPEN UND WEICHE (Tageslicht) ═══════ */}
      <section ref={heroRef} className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-primary/5" />
        <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-accent/10 blur-3xl" />

        {/* G1: Partnernetz aus Lichtpunkten */}
        <LoopBuehne dekorativ className="pointer-events-none absolute inset-0 opacity-40">
          <NetzwerkSchleife />
        </LoopBuehne>

        {/* Auf Telefon und iPad steht das Video direkt hinter der Überschrift,
            nicht am Ende der Spalte. Deshalb ist der Hero unter der
            Notebook-Breite eine einzige Flex-Spalte aus drei Bausteinen
            (Kopf, Video, Rest), und erst ab lg wird daraus wieder der
            Zweispalter: Kopf und Rest links untereinander, das Video rechts
            über beide Zeilen. So gibt es das Video nur einmal im Dokument,
            es wird also auch nur einmal geladen. */}
        <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-20 pt-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
          <div className="lg:col-start-1 lg:row-start-1">
            <Badge className="mb-5 border-emerald-300 bg-emerald-500/15 font-medium text-emerald-700">
              <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Bewerbungen offen · Tippgeber & Vertriebspartner
            </Badge>

            {/* Die min-Hoehe reserviert Platz fuer die laengste Lesart, damit
                der Wechsel die Weiche darunter nicht verschiebt. Sie ist nach
                Breite abgestuft: auf dem iPad braucht dieselbe Zeile nur halb
                so viele Zeilen wie auf dem Notebook, eine feste Reserve riss
                dort eine Luecke von rund hundert Pixeln zwischen Ueberschrift
                und Video. */}
            <h1 key={lesart} className="min-h-[3.4em] text-4xl md:min-h-[2.6em] lg:min-h-[3.2em] font-bold leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-[3.4rem]">
              {lesart === "tg" && (
                <>
                  <Worte text="Empfehle weiter." />{" "}
                  <Worte
                    text="Verdiene mit."
                    offset={220}
                    className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent"
                  />
                </>
              )}
              {lesart === "vpe" && (
                <>
                  <Worte text="Du kannst verkaufen." />{" "}
                  <Worte
                    text="Jetzt fehlt das richtige System."
                    offset={260}
                    className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent"
                  />
                </>
              )}
              {lesart === "vpq" && (
                <>
                  <Worte text="Kein Vorwissen. Ein System." />{" "}
                  <Worte
                    text="Dein Einstieg in Immobilien."
                    offset={300}
                    className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent"
                  />
                </>
              )}
              {lesart === "vp" && (
                <>
                  <Worte text="Werde" />{" "}
                  <Worte
                    text="Vertriebspartner"
                    offset={120}
                    className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent"
                  />{" "}
                  <Worte text="für Immobilien." offset={240} />
                </>
              )}
            </h1>
          </div>

          {/* Hero-Kachel: das Beratungsvideo, dargestellt wie in der
              Beratungspräsentation (stumm, Schleife, Poster als Vorschau).
              HINWEIS: Sobald ein echtes Teamfoto oder ein eigenes Video
              vorliegt, in der HeroVideo-Komponente nur src und poster
              austauschen, der Container hier bleibt gleich. */}
          <Reveal className="relative lg:col-start-2 lg:row-start-1 lg:row-end-3" delay={150}>
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 blur-2xl" />
            {/* Die Kachel geht auf, statt nur hochzurutschen. Das ist die
                betonte Fassung und steht auf der Seite nur an drei Stellen. */}
            <Reveal art="auf" delay={260} className="relative aspect-[4/5] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border/40 sm:aspect-[16/10] lg:aspect-square">
              <HeroVideo />
            </Reveal>
            <p key={`g1-${isTG}`} className="vp-blende mt-3 text-center text-sm text-muted-foreground">
              {isTG ? "Dein Netzwerk ist mehr wert, als Du denkst." : "Ein Partnernetz, kein Einzelkampf."}
            </p>
          </Reveal>

          <div className="lg:col-start-1 lg:row-start-2">
            <p key={`unter-${isTG}`} className="vp-blende max-w-xl text-lg leading-relaxed text-muted-foreground">
              {isTG
                ? "Du hast ein Netzwerk? Empfehle Kontakte, die sich für Immobilien-Kapitalanlagen interessieren, und verdiene eine faire Vergütung pro Abschluss. Ohne Risiko, ohne Kosten."
                : "Vermittle geprüfte Kapitalanlage-Immobilien an Investoren. Mit einer Plattform, die Dir die Arbeit abnimmt, einer eigenen Microseite und einem Team, das Dich wachsen lässt."
              }
            </p>

            {/* Die Weiche: Selbsteinordnung in zwei Fragen */}
            <div className="mt-8">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Was passt zu Dir?</p>
              <Reveal>
                {wegWeiche()}
              </Reveal>
              {profilWeiche()}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={scrollToForm} className="gap-2 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
                Jetzt bewerben <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ ABSCHNITT 2 · WO DU HEUTE STEHST (Dämmerung) ═══════ */}
      <section className="border-b border-border/40 bg-gradient-to-b from-background via-[hsl(213_25%_92%)] to-[hsl(214_26%_88%)] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <Reveal>
              <Badge variant="outline" className="mb-3">Wo Du heute stehst</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {lesart === "tg" ? "Deine Empfehlungen sind Gold wert." : "Du kannst mehr, als Dein System Dir erlaubt."}
              </h2>
              <p key={`szene-${lesart}`} className="vp-blende mt-5 text-lg leading-relaxed text-muted-foreground">
                {statusSzene}
              </p>
            </Reveal>
            <Reveal delay={120}>
              {/* G2: der erste Auftritt der Einkommenskurve, je Lesart eine eigene Bühne */}
              <div key={`g2-${lesart}`} className="vp-blende max-h-[320px]">
                {lesart === "tg" ? (
                  <LoopBuehne dekorativ>
                    <TippWanderung />
                  </LoopBuehne>
                ) : (
                  <ZeichnenBuehne schwelle={0.3}>
                    {lesart === "vpq" ? <GehaltsTreppe /> : <KurveGedeckelt />}
                  </ZeichnenBuehne>
                )}
                <p className="mt-2 text-center text-sm font-medium text-muted-foreground">{statusBildunterschrift}</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════ ABSCHNITT 3 · WAS DICH HÄLT UND WAS ES KOSTET (Nachtstrecke) ═══════ */}
      <section className="vp-nacht relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[hsl(214_26%_88%)] to-transparent" />

        <div className="mx-auto max-w-6xl px-6 pb-28 pt-20">
          {/*
            Der Untertext steht nur noch beim Tippgeber. In der langen Fassung
            uebernimmt die Kopfzeile der Buehne diese Rolle, und sie wechselt
            sogar mit. Vorher stand "Nur fuenf Saetze. Du weisst selbst, welche
            davon sitzen." zweimal untereinander auf demselben Bildschirm, mit
            einem Loch dazwischen.
          */}
          <Reveal className={`mx-auto max-w-3xl text-center ${isTG ? "mb-16" : "mb-6"}`}>
            <Badge variant="outline" className="mb-3 border-red-400/40 text-red-300">Kennst Du das?</Badge>
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              {isTG ? "Was Du dabei verschenkst." : "Was Dich in diesem System hält."}{" "}
              <span className="text-[#30E19E]">
                {isTG ? "Und an wen." : "Und was es Dich kostet."}
              </span>
            </h2>
            {isTG && (
              <p className="mt-4 leading-relaxed text-slate-300">
                Nur ein Gedanke, bevor es weitergeht.
              </p>
            )}
          </Reveal>

          {isTG ? (
            /* TG überspringt die tiefe Brandstiftung: eine einzige dunkle Karte */
            <Reveal className="mx-auto max-w-2xl">
              <Card className="relative overflow-hidden border-white/10 bg-[hsl(220_26%_13%)] p-8 shadow-2xl">
                <span aria-hidden="true" className="absolute left-0 top-0 h-full w-1 bg-destructive/70" />
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Kennst Du das?</p>
                <p className="mt-4 text-2xl font-bold text-white md:text-3xl">
                  Jede Empfehlung, die Du verschenkst, bezahlt jemand anderem den Urlaub.
                </p>
              </Card>
            </Reveal>
          ) : (
            /*
              Aus dem Haufen wird eine Liste, und dabei dreht jede Karte ihren
              Inhalt um. Vorher standen hier fuenf gestapelte Sticky-Karten, die
              nur den Vorwurf zeigten und die Antwort schuldig blieben.
            */
            <ChaosZuOrdnung paare={kennstDuDas} />
          )}

          {/* Der Kosten-Moment: die Uhr läuft, die Pfade trennen sich */}
          <Reveal className="mx-auto mt-24 max-w-3xl text-center">
            <LoopBuehne dekorativ className="mb-8">
              <ZeitSchleife />
            </LoopBuehne>
            <p className="text-2xl font-bold text-white md:text-3xl">
              Das Schlimmste: <span className="text-red-400">Du merkst es zu spät.</span>
            </p>
            <p className="mt-4 leading-relaxed text-slate-300">
              {isTG
                ? "In einem Jahr hast Du entweder wieder Empfehlungen verschenkt, oder die erste ist abgerechnet. Der Unterschied entsteht heute."
                : "In einem Jahr fragst Du Dich entweder, warum alles beim Alten ist, oder Du hast den ersten eigenen Abschluss längst hinter Dir. Der Unterschied entsteht heute."}
            </p>
          </Reveal>

          {/* G4b: ein Jahr in zwoelf Feldern. Bewusst KEINE steigende Kurve,
              die kommt einen Abschnitt spaeter (KurveDurchbruch) und sah der
              alten Grafik hier zum Verwechseln aehnlich. */}
          <div className="mx-auto mt-16 max-w-2xl">
            <ZeichnenBuehne schwelle={0.35}>
              <JahrInFeldern tippgeber={isTG} />
            </ZeichnenBuehne>
            <p className="mt-2 text-center text-sm font-medium text-slate-400">
              {isTG ? "Nichts zu tun ist auch eine Entscheidung." : "Bleiben ist auch eine Entscheidung."}
            </p>
          </div>
        </div>
      </section>

      {/* ═══════ ABSCHNITT 4 · DER SCHNITT (Lichtschalter zurück ins Helle) ═══════ */}
      <SchnittAbschnitt lesart={lesart} />

      {/* ═══════ ABSCHNITT 5 · DAS SYSTEM: WAS WIR GEBAUT HABEN ═══════ */}
      <section className="border-b border-border/40 bg-gradient-to-b from-background via-primary/5 to-background py-20" id="system">
        <div className="mx-auto max-w-6xl px-6">
          {!isTG && (
            <>
              <Reveal className="mx-auto mb-14 max-w-2xl text-center">
                <Badge variant="outline" className="mb-3">Das System</Badge>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Das ist unser System. Es fängt bei der{" "}
                  <span className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent">Immobilie</span> an.
                </h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Wir vermitteln nicht, was gerade am Markt ist. Entweder kaufen wir ein Objekt selbst an und
                  sanieren es im eigenen Haus, oder wir beziehen den Neubau direkt vom Bauträger, mit dem wir
                  zusammenarbeiten. Beides heißt: Wir wissen, was wir Dir in die Hand geben.
                </p>
              </Reveal>
              {/* G7: Wertschöpfungskette mit Lichtlauf */}
              <LoopBuehne className="relative">
                <div aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-8 hidden h-0.5 bg-gradient-to-r from-primary/30 via-accent/40 to-primary/30 lg:block">
                  <div className="vp-linie-licht absolute inset-0" />
                </div>
                <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {wertschoepfung.map((w, i) => (
                    <Reveal key={i} delay={i * 110}>
                      <div className="flex flex-col items-center text-center">
                        <div className="vp-halo relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg ring-4 ring-background">
                          <w.icon className="h-7 w-7" />
                          <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-foreground">
                            {i + 1}
                          </span>
                        </div>
                        <h3 className="mb-1.5 text-base font-bold">{w.title}</h3>
                        <p className="max-w-[14rem] text-sm leading-relaxed text-muted-foreground">{w.desc}</p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </LoopBuehne>
            </>
          )}

          {/* G6: Arbeitsteilung, zahlenfrei statt Prozentbehauptung */}
          <Reveal className={`mx-auto max-w-3xl text-center ${isTG ? "" : "mt-24"}`}>
            <Badge variant="outline" className="mb-3">{isTG ? "So einfach ist es" : "Arbeitsteilung"}</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {isTG ? (
                <>Du gibst den Tipp. <span className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent">Alles danach machen wir.</span></>
              ) : (
                <>Du verkaufst. <span className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent">Wir räumen Dir den Tisch frei.</span></>
              )}
            </h2>
          </Reveal>
          <div className="mt-10">
            <ArbeitsteilungGrafik key={`g6-${isTG}`} variante={isTG ? "tg" : "vp"} />
          </div>

          {/* Vorteile: die vier stärksten je Lesart */}
          <Reveal className="mx-auto mb-10 mt-24 max-w-2xl text-center">
            <Badge variant="outline" className="mb-3">{isTG ? "Deine Vorteile als Tippgeber" : "Was Du dafür bekommst"}</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {isTG ? "Was Du fürs Empfehlen bekommst" : "Was wir stellen, damit Du arbeiten kannst"}
            </h2>
          </Reveal>
          <div key={`vorteile-${lesart}`} className="vp-blende grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {vorteile.map((b, i) => (
              <Reveal key={b.title} delay={(i % 4) * 90} className="h-full">
                <Card className="h-full border-border/40 bg-card/80 p-7 backdrop-blur-sm transition-all hover:shadow-lg">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md">
                    <b.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold">{b.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{b.desc}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          {/* Vergleichskarten als Abschluss des Systemkapitels, ohne Zeitbehauptungen */}
          {!isTG && (
            <>
              <Reveal className="mx-auto mb-10 mt-24 max-w-3xl text-center">
                <Badge variant="outline" className="mb-3">Vergleich</Badge>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Allein stolpern. Oder{" "}
                  <span className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent">im System ankommen.</span>
                </h2>
              </Reveal>
              <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
                <Reveal className="h-full">
                  <Card className="h-full border-destructive/20 bg-card/60 p-7">
                    <div className="mb-5 flex items-center gap-2">
                      <X className="h-6 w-6 text-destructive" />
                      <h3 className="text-lg font-bold text-destructive">Ohne System · Der lange Weg</h3>
                    </div>
                    <ul className="space-y-3">
                      {[
                        // Die Reihenfolge ist kein Zufall: Jede Zeile hier hat
                        // rechts ihre Antwort auf derselben Hoehe. Vorher
                        // standen beide Listen unsortiert nebeneinander, und
                        // "Nach dem Webinar: Funkstille" traf auf "Klartext,
                        // Realitaet, kein Hype".
                        "Allein im Markt, niemand erklärt Dir etwas",
                        "Coaches verkaufen Theorie statt Handwerk",
                        "Du bist eine Nummer in einer fremden Pipeline",
                        "Nach dem Webinar: Funkstille",
                        "Ein Produkt, das Du Freunden nicht zeigen würdest",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6 rounded-lg bg-destructive/10 p-3 text-center">
                      <span className="text-sm font-semibold text-destructive">Allein: jeder Fehler kostet Dich Monate.</span>
                    </div>
                  </Card>
                </Reveal>

                <Reveal className="h-full" delay={120}>
                  <Card className="h-full border-primary/30 bg-card/60 p-7 ring-2 ring-primary/20">
                    <div className="mb-5 flex items-center gap-2">
                      <CheckCircle className="h-6 w-6 text-primary" />
                      <h3 className="text-lg font-bold text-primary">Mit OS Immobilien · Der direkte Weg</h3>
                    </div>
                    <ul className="space-y-3">
                      {[
                        // Jede Zeile antwortet auf die Zeile links daneben.
                        "Einarbeitung eins zu eins, mit persönlichem Mentor",
                        "Skripte und Abläufe aus echten Gesprächen, kein Seminarstoff",
                        "Jeder im Team kennt Deinen Namen und Deine Vorgänge",
                        "Nach dem Start bleibt derselbe Ansprechpartner erreichbar",
                        "Ein Objekt, das Du Deinen Freunden zeigen kannst",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6 rounded-lg bg-primary/10 p-3 text-center">
                      <span className="text-sm font-semibold text-primary">Im System: jeder Fehler wurde schon einmal gemacht und gelöst.</span>
                    </div>
                  </Card>
                </Reveal>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ═══════ ABSCHNITT 6 · DEIN WEG: VON HEUTE BIS JAHR EINS ═══════ */}
      <section className="border-b border-border/40 bg-card/30 py-20" id="prozess">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <Badge variant="outline" className="mb-3">{isTG ? "So funktioniert's" : "Dein erstes Jahr"}</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {isTG ? (
                "Drei Schritte. Keine Tricks."
              ) : (
                <>
                  Vom ersten Tag bis zum{" "}
                  <span className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent">eigenen Kundenstamm</span>.
                </>
              )}
            </h2>
          </Reveal>

          {isTG ? (
            <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-3">
              {tgDreischritt.map((p, i) => (
                <Reveal key={i} delay={i * 110} className="h-full">
                  <Card className="h-full border-border/40 bg-card/60 p-6 backdrop-blur-sm transition-all hover:border-primary/30">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-lg font-bold text-primary-foreground shadow-md">
                      {p.step}
                    </div>
                    <h3 className="mb-1.5 font-bold">{p.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          ) : (
            <>
              {/* G8: die Weg-Linie zeichnet sich mit dem Leser */}
              <div key={`weg-${lesart}`} className="vp-blende mx-auto max-w-5xl">
                <WegLinie stationen={wegStationen} />
              </div>

              {/* G9: Karrieretreppe statt Paketkarten */}
              <div className="mt-24" id="pakete">
                <Reveal className="mb-12 text-center">
                  <Badge variant="outline" className="mb-3">Drei Wege</Badge>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Such Dir aus, wie eng Du mit uns arbeitest</h2>
                  <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                    Keiner der drei Wege kostet Dich etwas im Monat, und keiner bindet Dich an eine Laufzeit.
                    Sie unterscheiden sich darin, ob Du selbst berätst und woher Deine Kontakte kommen.
                    Die Zahlen dahinter besprechen wir im persönlichen Gespräch.
                  </p>
                </Reveal>
                <KarriereTreppe scrollToForm={scrollToForm} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* ═══════ ABSCHNITT 7 · DER BEWEIS: CHAT, RING, STIMMEN ═══════ */}
      <section className="border-b border-border/40 bg-gradient-to-b from-background via-primary/5 to-background py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <Reveal>
              <Badge variant="outline" className="mb-3">Echtes Team</Badge>
              <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                Du fragst.{" "}
                <span className="text-primary">Jemand antwortet.</span>
              </h2>
              <p className="mb-6 leading-relaxed text-muted-foreground">
                Kein Ticketsystem, kein Bot, keine Warteschleife. Du schreibst ins Team und bekommst
                eine Antwort von jemandem, der den Vorgang kennt. So sieht das im Alltag aus.
                {isTG && " Auch als Tippgeber bist Du nie allein mit Deiner Empfehlung."}
              </p>
              <div className="space-y-3">
                {(isTG
                  ? [
                      "Persönlicher Ansprechpartner von Tag 1",
                      "Beratung und Abwicklung übernehmen wir",
                      "Keine Funkstille, auch nicht nach Monat 6",
                    ]
                  : [
                      "Persönlicher Mentor von Tag 1",
                      "Backoffice, das Dir den Rücken freihält",
                      "Keine Funkstille, auch nicht nach Monat 6",
                    ]
                ).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <Button onClick={scrollToForm} className="mt-8 gap-2 shadow-lg">
                Jetzt bewerben <ArrowRight className="h-4 w-4" />
              </Button>
            </Reveal>
            <Reveal delay={150}>
              {/* G10: der stärkste Nähe-Beweis der Seite */}
              <ChatAnimation />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Die dunkle Beweis-Insel: bewusstes Echo der Nachtstrecke mit G11 */}
      <section className="vp-nacht py-14">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-6 md:flex-row md:justify-center md:gap-16">
          <ZufriedenheitsRing />
          <div className="max-w-sm text-center md:text-left">
            <p className="text-xl font-bold text-white">Die eine Zahl, an der wir uns messen lassen.</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              98 % Partnerzufriedenheit. Die fehlenden 2 % zeigen wir bewusst mit: der Ring bleibt offen.
            </p>
          </div>
        </div>
      </section>

      {/* Stimmen unserer Partner, sortiert nach Deiner Auswahl */}
      <section className="border-b border-border/40 bg-gradient-to-b from-background via-primary/5 to-background py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <Badge variant="outline" className="mb-3">Stimmen unserer Partner</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Was unsere Partner sagen</h2>
          </Reveal>
          <Reveal>
            <Carousel key={`stimmen-${lesart}`} opts={{ align: "start", loop: true }} className="w-full">
              <CarouselContent className="-ml-4">
                {testimonials.map((t) => (
                  <CarouselItem key={t.id} className="pl-4 md:basis-1/2 lg:basis-1/3">
                    <Card className="h-full border-border/40 bg-card/80 p-7 shadow-sm backdrop-blur-sm transition-all hover:shadow-lg">
                      <Star className="mb-4 h-6 w-6 fill-primary/20 text-primary" />
                      <blockquote className="min-h-[160px] space-y-2 text-sm leading-relaxed text-foreground">
                        <p className="text-muted-foreground">{t.vorher}</p>
                        <p className="font-medium">{t.jetzt}</p>
                      </blockquote>
                      <div className="mt-6 flex items-center gap-3">
                        <img src={t.img} alt={t.name} loading="lazy" width={48} height={48} className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/20" />
                        <div>
                          <div className="text-sm font-semibold">{t.name}</div>
                          <div className="text-xs text-muted-foreground">{t.rolle}</div>
                        </div>
                      </div>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <div className="mt-8 flex items-center justify-center gap-2">
                <CarouselPrevious className="static translate-y-0" />
                <CarouselNext className="static translate-y-0" />
              </div>
            </Carousel>
          </Reveal>
        </div>
      </section>

      {/* ═══════ ABSCHNITT 8 · DER SPIEGEL: MATCH-CHECK UND FAQ ═══════ */}
      <section className="border-b border-border/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <Badge variant="outline" className="mb-3">Match-Check</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Passen wir{" "}
              <span className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent">zusammen?</span>
            </h2>
            <p className="mt-3 text-muted-foreground">
              Wir suchen niemanden, der Druck macht, sondern Menschen mit Substanz und klarer Sprache.
            </p>
          </Reveal>

          <div key={`match-${lesart}`} className="vp-blende mx-auto grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {matchKarten.map((item, i) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.title} delay={(i % 3) * 120} className="h-full">
                  <Card className="relative h-full border-border/40 bg-card/70 p-6 transition-all hover:border-primary/30 hover:shadow-lg">
                    {/* G12: Haken, der sich zeichnet, sobald die Karte im Sichtfenster ist */}
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="absolute right-4 top-4 h-6 w-6">
                      <path
                        d="M4 12.5 9.5 18 20 6.5"
                        stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className="vp-haken-pfad"
                      />
                    </svg>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mb-1.5 font-bold">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-border/40 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal className="mb-12 text-center">
            <Badge variant="outline" className="mb-3">Häufige Fragen</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Antworten, bevor Du fragst</h2>
          </Reveal>
          <Reveal>
            <Accordion key={`faq-${isTG}`} type="single" collapsible className="space-y-3">
              {faqItems.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="rounded-xl border border-border/40 bg-card/50 px-5 backdrop-blur-sm">
                  <AccordionTrigger className="py-4 text-left font-semibold hover:no-underline">{item.q}</AccordionTrigger>
                  <AccordionContent className="pb-4 leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
          <div className="mt-10 text-center">
            <Button onClick={scrollToForm} variant="outline" className="gap-2">
              Jetzt bewerben <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════ ABSCHNITT 9 · DAS FINALE: AUFRUF UND FORMULAR (wärmstes Licht) ═══════ */}
      <section className="vp-finale relative overflow-hidden border-b border-border/40 py-20">
        {/* Stiller Rückgriff: die durchbrochene Decke als sehr helles Wasserzeichen */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 mx-auto max-w-2xl opacity-[0.06]">
          <KurveDurchbruch sofort />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <Reveal>
            <Badge variant="outline" className="mb-3">Der nächste Schritt</Badge>
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              <WortRevealBeiSicht text="Finden wir heraus," />{" "}
              <WortRevealBeiSicht
                text="ob es passt."
                offset={180}
                className="bg-gradient-to-r from-[#13704D] to-[#1CA873] bg-clip-text text-transparent"
              />
            </h2>
            <p className="mx-auto mb-4 max-w-xl leading-relaxed text-muted-foreground">
              Am Anfang steht kein Vertrag, sondern ein Gespräch. Wir schauen uns gemeinsam an, was Du
              mitbringst und was Du brauchst. Passt es für beide Seiten nicht, sagen wir das offen.
            </p>
            {schlusszeile && (
              <p key={`schluss-${lesart}`} className="vp-blende mx-auto mb-8 max-w-xl text-lg font-bold text-foreground">
                {schlusszeile}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" onClick={scrollToForm} className="gap-2 px-8 text-base shadow-xl transition-all hover:scale-[1.02] hover:shadow-2xl">
                {isTG ? "Jetzt als Tippgeber starten" : "Jetzt als Vertriebspartner bewerben"} <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Antwort meist noch am selben Tag</span>
              <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Echtes Produkt</span>
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> 1:1 Einarbeitung</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Das Bewerbungsformular */}
      <section ref={formRef} id="bewerben" className="vp-finale border-b border-border/40 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-10 text-center">
            <Badge variant="outline" className="mb-3">Jetzt bewerben</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {isTG ? "Werde Tippgeber bei OS Immobilien" : "Werde selbstständiger Vertriebspartner bei OS Immobilien"}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {isTG
                ? "Fülle das Formular aus. Wir schalten Dich schnell frei und melden uns persönlich."
                : "Fülle das Formular aus. Wir melden uns persönlich bei Dir, meist noch am selben Tag."
              }
            </p>
          </div>

          {submitted ? (
            <Card className="border-primary/20 bg-card/80 p-10 text-center shadow-xl backdrop-blur-sm">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
                <CheckCircle className="h-9 w-9 text-green-600" />
              </div>
              <h3 className="mb-2 text-2xl font-bold">Bewerbung eingegangen!</h3>
              <p className="mx-auto max-w-md text-muted-foreground">
                Vielen Dank für Dein Interesse als <strong className="text-foreground">{isTG ? "Tippgeber" : "Vertriebspartner"}</strong>.
                Wir melden uns schnell und persönlich bei Dir.
              </p>
              {/* Die Landingpage setzt kein `stelle`, deshalb geht hier auch an Tippgeber die Eingangsmail. */}
              <SpamHinweis className="mx-auto mt-5 max-w-md" />
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link to="/karriere"><Button variant="outline">Weitere Stellen ansehen</Button></Link>
              </div>
            </Card>
          ) : (
            <Card className="border-border/40 bg-card/80 p-8 shadow-xl backdrop-blur-sm md:p-10">
              {/* Weiche-Wiederholung im Formular, inklusive Sub-Weiche */}
              <div className="mb-6 flex flex-col items-center gap-1">
                <div className="w-full max-w-md">
                  {wegWeiche(true)}
                </div>
                {profilWeiche(true)}
              </div>

              <PartnerBewerbungFormular
                weg={weg}
                stelleId={stelle?.id || "karriere-landing"}
                stelleTitel={isTG ? "Tippgeber Immobilien-Kapitalanlage" : (stelle?.titel || "Vertriebspartner Immobilien-Kapitalanlage")}
                beschaeftigungsart={isTG ? "Nebenberuflich" : (stelle?.art || "Vollzeit / Teilzeit")}
                quelle="Website Karriereseite"
                erfahrungPlaceholder={erfahrungPlaceholder}
                onAbgesendet={nachAbsenden}
                absendenKlasse="vp-btn-signal"
                abbrechenKnopf={
                  <Link to="/karriere" className="sm:order-1">
                    <Button type="button" variant="outline" className="w-full sm:w-auto">Abbrechen</Button>
                  </Link>
                }
              />
            </Card>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <img src={logoImg} alt="OS Immobilien" className="h-7 object-contain opacity-60" />
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
            <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
            <CookieEinstellungenLink className="hover:text-foreground" />
            <span>© {new Date().getFullYear()} OS Immobilien Holding GmbH</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default VertriebspartnerLanding;
