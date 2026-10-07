/**
 * Beratungspräsentation neu.
 *
 * Aufbau nach der Gesprächsvorlage, achtzehn Stationen. Der Hero ist
 * unverändert aus der bestehenden allgemeinen Präsentation übernommen, alles
 * darunter ist neu.
 *
 * Zwei Dinge tragen die Dramaturgie:
 *
 * Zwischen den Abschnitten stehen kurze Überleitungen. Sie sind kein
 * Dekor, sondern die Brücke von einem Gedanken zum nächsten. Ohne sie ist
 * eine Präsentation eine Aneinanderreihung von Folien; mit ihnen wird sie ein
 * Gespräch, das den Kunden mitnimmt.
 *
 * Und die Spannung wächst bewusst: erst Sicherheit geben (heute wird nichts
 * entschieden), dann verstehen, dann den Preis des Nichtstuns spürbar machen,
 * dann den Weg zeigen. Ziel ist Station 15, die gemeinsam ausgefüllte
 * Selbstauskunft.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowRight, Banknote, Building2, Calculator, Check, CheckCircle2, ChevronDown, ClipboardList,
  Coins, FileText, KeyRound, Landmark, Mail, Menu, Phone, Receipt, Scale, ShieldCheck,
  Sparkles, Target, TrendingUp, User, Users, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { ansprechpartnerAdresse } from "@/lib/ansprechpartnerAdresse";
import { useUserSettings } from "@/hooks/useUserSettings";
import { eigeneBerufsbezeichnung } from "@/lib/beraterProfil";
import { usePersistedState } from "@/hooks/usePersistedState";
import { SPRECHSKRIPT_NACH_ID, sprechskriptFuerAnrede } from "@/lib/beratungSprechskripte";
import { anredeAusSkript, type Anrede } from "@/lib/beratungAnrede";
import { rahmenAusUeberschuss } from "@/lib/finanzierbarkeitUtils";
import { RATE_EINGANG, rateAnteile, rateRechenweg } from "@/lib/rateAnteile";
import { useCacheReady } from "@/hooks/useCacheReady";
import { onCacheChange } from "@/lib/dataCache";
import { getKontaktById } from "@/lib/kundenStore";
import { getInvestmentMetaField } from "@/lib/investmentsStore";
import { ObjektSlideshow } from "@/components/beratung/ObjektSlideshow";
import { ANLAGE_ZIELE, zielNachLabel, type AnlageKonzept } from "@/lib/anlageZiele";
import BeforeAfterSection from "@/components/landing/BeforeAfterSection";
import logo from "@/assets/moreimmo-logo.png";
import { PartnerLogo } from "@/components/presentation/PartnerLogo";
import heroBg from "@/assets/hero-beratung-bg.jpg";
import beratungSzene from "@/assets/beratung-szene.jpg";
import modellSaniert from "@/assets/lp/modell-sanierter-bestand.jpg";
import modellKfw from "@/assets/lp/modell-kfw40-neubau.jpg";
import { LanguageToggle } from "@/components/kunde/portal/LanguageToggle";
import { usePraesentationsSprache } from "@/hooks/usePraesentationsSprache";
import { useKundenSprache } from "@/lib/kundenSprache";
import { zuZahl, type PraesentationsSprache } from "@/lib/beratungspraesentationSprache";
import {
  BERATUNG_TEXTE,
  formatierer,
  inAnrede,
  type AnredeWert,
  type BeratungTexte,
} from "@/lib/beratungspraesentationTexte";
// Liquid Glass fuer die Praesentation, ueberstimmt `.beratung-apple` aus index.css.
import "@/styles/praesentation-liquid.css";

/* ══════════════════════════════════════════════════════════════
   Bausteine
   ══════════════════════════════════════════════════════════════ */

/**
 * Meldet, sobald ein Element einmal im Bild war, und merkt sich das.
 *
 * Alle Animationen dieser Seite hängen daran. Sie laufen genau einmal, beim
 * ersten Hereinscrollen. Nichts wackelt beim Zurückscrollen, denn eine
 * Präsentation, in der Dinge zweimal erscheinen, wirkt unruhig statt teuer.
 */
function useImBild<T extends Element>(schwelle = 0.2) {
  const ref = useRef<T>(null);
  const [sichtbar, setSichtbar] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Steht das Element beim Einhängen schon im Bild, sofort auslösen. Der
    // Beobachter allein reicht nicht: Bei kleinen, inline gerenderten
    // Elementen und beim schnellen Durchscrollen kann sein erster Aufruf
    // ausbleiben. Genau dadurch blieb in der Immobilienschere eine Zahl
    // dauerhaft auf null stehen, während die daneben lief.
    const kasten = el.getBoundingClientRect();
    const imBild =
      kasten.bottom > 0 &&
      kasten.top < (window.innerHeight || document.documentElement.clientHeight);
    if (imBild) {
      setSichtbar(true);
      return;
    }

    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) {
          setSichtbar(true);
          beobachter.disconnect();
        }
      },
      { threshold: schwelle },
    );
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [schwelle]);

  return [ref, sichtbar] as const;
}

/** Blendet Inhalte beim Hereinscrollen ein. Einmalig, nicht bei jedem Scrollen. */
function Reveal({
  children,
  delay = 0,
  className = "",
  richtung = "hoch",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Aus welcher Richtung der Inhalt hereinkommt. */
  richtung?: "hoch" | "links" | "rechts" | "gross";
}) {
  const [ref, sichtbar] = useImBild<HTMLDivElement>(0.12);

  const start =
    richtung === "links"
      ? "translateX(-36px)"
      : richtung === "rechts"
      ? "translateX(36px)"
      : richtung === "gross"
      ? "scale(0.94)"
      : "translateY(32px)";

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
        opacity: sichtbar ? 1 : 0,
        transform: sichtbar ? "none" : start,
        filter: sichtbar ? "none" : "blur(3px)",
      }}
      className={`transition-all duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${className}`}
    >
      {children}
    </div>
  );
}

/** Zahl, die beim Sichtbarwerden hochläuft. */
function ZahlAnimiert({
  wert,
  suffix = "",
  praefix = "",
  dauer = 1400,
  nachkomma = 0,
  euro = false,
}: {
  wert: number;
  suffix?: string;
  praefix?: string;
  dauer?: number;
  nachkomma?: number;
  /** Als Eurobetrag in der Schreibweise der gewählten Sprache: "4.000 €" oder "€4,000". */
  euro?: boolean;
}) {
  const { fmt } = useTexte();
  // Schwelle 0: Ein inline gerendertes span erreicht 40 Prozent Sichtbarkeit
  // unter Umständen nie, dann bliebe die Zahl für immer auf null stehen.
  const [ref, sichtbar] = useImBild<HTMLSpanElement>(0);
  const [stand, setStand] = useState(0);

  useEffect(() => {
    if (!sichtbar) return;
    const start = performance.now();
    let raf = 0;
    const schritt = (jetzt: number) => {
      const p = Math.min(1, (jetzt - start) / dauer);
      // Weiches Ausklingen, damit die Zahl nicht abrupt stehen bleibt.
      const geglaettet = 1 - Math.pow(1 - p, 3);
      setStand(geglaettet * wert);
      if (p < 1) raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf);
  }, [sichtbar, wert, dauer]);

  // Sicherheitsnetz: Läuft die Animation aus irgendeinem Grund nicht an,
  // steht nach kurzer Zeit trotzdem der richtige Wert da. Eine Zahl, die
  // dauerhaft null zeigt, ist schlimmer als eine ohne Animation.
  useEffect(() => {
    const zeit = setTimeout(() => setStand((v) => (v === 0 && wert !== 0 ? wert : v)), dauer + 1200);
    return () => clearTimeout(zeit);
  }, [wert, dauer]);

  return (
    <span ref={ref} className="tabular-nums">
      {praefix}
      {euro ? fmt.euro(stand, nachkomma) : fmt.zahl(stand, nachkomma)}
      {suffix}
    </span>
  );
}

/**
 * Hebt das Schlüsselwort einer Überschrift hervor, so wie im Hero.
 *
 * Bewusst sparsam eingesetzt. Wenn in jeder Überschrift etwas blau ist,
 * ist nichts mehr hervorgehoben. Markiert wird jeweils das eine Wort, das
 * der Kunde aus dem Abschnitt mitnehmen soll.
 */
function Akzent({ children }: { children: React.ReactNode }) {
  return <span className="text-primary font-semibold">{children}</span>;
}

/**
 * Text, der sich in Dauerschleife selbst schreibt und wieder löscht.
 *
 * Steht im Hero auf dem Firmennamen. Der Effekt hält den Blick genau dort,
 * wo der Name fallen soll, ohne dass sich die Seite bewegt. Für Bildschirm-
 * leser steht der vollständige Text als Beschriftung bereit, die tippende
 * Fassung ist für sie ausgeblendet.
 */
function Schreibmaschine({ text, className = "" }: { text: string; className?: string }) {
  const [stand, setStand] = useState(0);
  const [loeschen, setLoeschen] = useState(false);

  useEffect(() => {
    const fertig = stand >= text.length;
    const leer = stand <= 0;

    // Am Ende stehen lassen, am Anfang kurz Luft holen, sonst zügig tippen.
    const dauer = !loeschen && fertig ? 2600 : loeschen && leer ? 700 : loeschen ? 40 : 90;

    const zeit = setTimeout(() => {
      if (!loeschen && fertig) setLoeschen(true);
      else if (loeschen && leer) setLoeschen(false);
      else setStand((s) => s + (loeschen ? -1 : 1));
    }, dauer);

    return () => clearTimeout(zeit);
  }, [stand, loeschen, text]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">
        {text.slice(0, stand)}
        <span className="beratung-cursor">|</span>
      </span>
    </span>
  );
}

/**
 * Rahmen für ein noch leeres Pflichtfeld in Abschnitt 03.
 *
 * Orange statt rot: Es ist kein Fehler, sondern eine offene Aufgabe. Sobald
 * etwas drinsteht, verschwindet die Markierung sofort.
 */
const PFLICHT_RAHMEN = "border-amber-500";

/*
 * Eingaben wie "4.000" oder "4,000.50" liest `zuZahl` aus
 * `beratungspraesentationSprache.ts`. Es erkennt die Schreibweise an der
 * Eingabe selbst, denn getippte Werte bleiben beim Sprachwechsel stehen.
 */

/* ── Grafiken ───────────────────────────────────────────────── */

/**
 * Ring, der sich beim Sichtwerden aufbaut.
 *
 * Wird für die Frage benutzt, wer die monatliche Rate eigentlich trägt. Ein
 * Ring beantwortet das schneller als jeder Satz: Der eigene Anteil ist der
 * kleine Rest.
 */
function RingAnteile({
  segmente,
  mitte,
  unterMitte,
}: {
  segmente: Array<{ label: string; wert: number; farbe: string }>;
  mitte: string;
  unterMitte: string;
}) {
  const [ref, sichtbar] = useImBild<HTMLDivElement>(0.35);
  const radius = 68;
  const umfang = 2 * Math.PI * radius;

  // Startpunkte vorab ausrechnen, damit im Rendern nichts mutiert wird.
  let gelaufen = 0;
  const bahnen = segmente.map((s) => {
    const laenge = (s.wert / 100) * umfang;
    const versatz = gelaufen;
    gelaufen += laenge;
    return { ...s, laenge, versatz };
  });

  return (
    <div ref={ref} className="flex flex-col items-center">
      <div className="relative">
        <svg viewBox="0 0 180 180" className="w-[190px] h-[190px] md:w-[210px] md:h-[210px]">
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="20"
          />
          {bahnen.map((b, i) => (
            <circle
              key={b.label}
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke={b.farbe}
              strokeWidth="20"
              strokeDasharray={`${sichtbar ? b.laenge : 0} ${umfang}`}
              strokeDashoffset={-b.versatz}
              transform="rotate(-90 90 90)"
              style={{
                transition: "stroke-dasharray 1.3s cubic-bezier(0.16,1,0.3,1)",
                transitionDelay: `${i * 220}ms`,
              }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl md:text-4xl font-semibold tracking-tight">{mitte}</span>
          <span className="text-[11px] tracking-widest uppercase opacity-60 mt-1">{unterMitte}</span>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2">
        {segmente.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.farbe }} />
            {s.label} <span className="opacity-60 tabular-nums">{s.wert} %</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Zwei Säulen je Jahr: was Sie einzahlen und was dabei getilgt wird.
 *
 * Das ist der stärkste Beleg der ganzen Präsentation, weil die Schere mit
 * jedem Jahr sichtbar weiter aufgeht. Deshalb steht die Grafik dunkel und
 * bekommt Platz.
 */
function VermoegensChart({
  daten,
  betontesJahr,
}: {
  daten: Array<{ jahr: number; einsatz: number; tilgung: number }>;
  /** Jahr, auf das sich die große Zahl in der Überschrift bezieht. */
  betontesJahr?: number;
}) {
  // Die Legende spricht den Kunden an, also in der gewählten Anrede.
  const { t } = useAnrede();
  const [ref, sichtbar] = useImBild<HTMLDivElement>(0.25);
  const max = Math.max(...daten.map((d) => d.tilgung));
  const kurz = (n: number) => `${Math.round(n / 1000)}k`;

  return (
    <div ref={ref}>
      <div className="flex items-end gap-3 md:gap-7" style={{ height: 260 }}>
        {daten.map((d, i) => (
          <div
            key={d.jahr}
            className="flex-1 h-full flex flex-col relative rounded-xl transition-colors duration-700"
            style={
              d.jahr === betontesJahr
                ? {
                    // Das Jahr, das oben als große Zahl steht, bekommt hier
                    // seinen Platz. Sonst nennt die Überschrift zehn Jahre
                    // und das Auge landet bei zwanzig.
                    backgroundColor: sichtbar ? "rgba(0,122,255,0.10)" : "transparent",
                    outline: sichtbar ? "1px solid rgba(124,190,255,0.28)" : "none",
                  }
                : undefined
            }
          >
            <div className="flex-1 flex items-end justify-center gap-1.5 md:gap-2.5">
              <div className="w-[38%] flex flex-col justify-end items-center h-full">
                <span
                  className="text-[10px] md:text-xs tabular-nums mb-1.5 transition-opacity duration-700"
                  style={{ opacity: sichtbar ? 0.6 : 0, transitionDelay: `${i * 130 + 700}ms` }}
                >
                  {kurz(d.einsatz)}
                </span>
                <div
                  className="w-full rounded-t-lg transition-all duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{
                    height: sichtbar ? `${(d.einsatz / max) * 100}%` : "0%",
                    transitionDelay: `${i * 130}ms`,
                    backgroundColor: "rgba(255,255,255,0.20)",
                  }}
                />
              </div>
              <div className="w-[38%] flex flex-col justify-end items-center h-full">
                <span
                  className="text-[10px] md:text-xs font-semibold tabular-nums mb-1.5 transition-opacity duration-700"
                  style={{
                    opacity: sichtbar ? 1 : 0,
                    color: "#7CBEFF",
                    transitionDelay: `${i * 130 + 800}ms`,
                  }}
                >
                  {kurz(d.tilgung)}
                </span>
                <div
                  className="w-full rounded-t-lg transition-all duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{
                    height: sichtbar ? `${(d.tilgung / max) * 100}%` : "0%",
                    transitionDelay: `${i * 130 + 90}ms`,
                    background: "linear-gradient(180deg, #5CB0FF 0%, #0A6EDB 100%)",
                    boxShadow: "0 -6px 28px -6px rgba(0,122,255,0.55)",
                  }}
                />
              </div>
            </div>
            <span
              className="mt-3 mb-1.5 text-center text-[11px] md:text-xs whitespace-nowrap"
              style={
                d.jahr === betontesJahr
                  ? { color: "#7CBEFF", fontWeight: 600 }
                  : { opacity: 0.55 }
              }
            >
              Jahr {d.jahr}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 justify-center text-xs">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
          {t("Ihr eingezahlter Beitrag", "Dein eingezahlter Beitrag")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "linear-gradient(180deg,#5CB0FF,#0A6EDB)" }} />
          {t("Getilgtes Darlehen, also Ihr Vermögen", "Getilgtes Darlehen, also dein Vermögen")}
        </span>
      </div>
    </div>
  );
}

/** Waagerechter Balken, der beim Sichtwerden auf seine Breite wächst. */
function WirkungsBalken({
  posten,
}: {
  posten: Array<{ label: string; wert: number; hinweis: string; ton: "stark" | "ruhig" }>;
}) {
  const [ref, sichtbar] = useImBild<HTMLDivElement>(0.3);
  const max = Math.max(...posten.map((p) => p.wert));

  return (
    <div ref={ref} className="space-y-6">
      {posten.map((p, i) => (
        <div key={p.label}>
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <span className="text-sm font-medium">{p.label}</span>
            <span
              className="text-lg md:text-xl font-semibold tabular-nums"
              style={{ color: p.ton === "stark" ? "#0A6EDB" : undefined }}
            >
              <ZahlAnimiert wert={p.wert} euro />
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(10,110,219,0.09)" }}>
            <div
              className="h-full rounded-full transition-all duration-[1300ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: sichtbar ? `${(p.wert / max) * 100}%` : "0%",
                transitionDelay: `${i * 200}ms`,
                background:
                  p.ton === "stark"
                    ? "linear-gradient(90deg, #5CB0FF 0%, #0A6EDB 100%)"
                    : "linear-gradient(90deg, rgba(10,110,219,0.35) 0%, rgba(10,110,219,0.22) 100%)",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{p.hinweis}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Die Immobilienschere.
 *
 * Links der Einstieg, rechts drei Werte nach zehn Jahren: oben der
 * Immobilienwert, unten die Restschuld, in der Mitte die Differenz. Das ist
 * der Vermögensaufbau.
 *
 * Der Regler für die Wertsteigerung ist im Gespräch wichtiger als jede
 * einzelne Zahl. Bei null Prozent bleibt trotzdem ein Vermögen stehen, weil
 * die Tilgung unabhängig von jeder Wertentwicklung läuft. Wer den Regler
 * selbst auf null zieht und sagt, dass es auch dann aufgeht, ist
 * glaubwürdiger als jeder, der drei Prozent behauptet.
 */
function Immobilienschere({
  kaufpreis,
  getilgt10,
  wertsteigerung,
  onWertsteigerung,
  tilgungText,
}: {
  kaufpreis: number;
  getilgt10: number;
  wertsteigerung: number;
  onWertsteigerung: (v: number) => void;
  tilgungText: string;
}) {
  const [ref, sichtbar] = useImBild<HTMLDivElement>(0.2);
  const { tx, a, fmt } = useTexte();
  const jahre = 10;
  const wert = Math.round(kaufpreis * Math.pow(1 + wertsteigerung / 100, jahre));
  const restschuld = kaufpreis - getilgt10;
  const vermoegen = wert - restschuld;

  return (
    <div ref={ref}>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: "#7CBEFF" }}>
            {a(tx.schere.kicker)}
          </p>
          <p className="text-2xl md:text-4xl font-semibold tracking-tight leading-[1.12]">
            {a(tx.schere.titel)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl md:text-5xl font-semibold tracking-tight" style={{ color: "#7CBEFF" }}>
            <ZahlAnimiert wert={vermoegen} euro dauer={900} />
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(246,248,252,0.55)" }}>
            {a(tx.schere.vermoegensaufbau)}
          </p>
        </div>
      </div>

      {/* Drei Spalten: links der Einstieg, in der Mitte die Linien, rechts das
          Ergebnis. Die Linien bekommen eine eigene Spalte, sonst laufen sie
          quer durch die Beschriftungen. pathLength normalisiert die Länge auf
          100, dadurch stimmt die Zeichenanimation auch bei verzerrtem
          viewBox. */}
      <div className="grid md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] gap-6 md:gap-4 items-center">
        <div className="space-y-4">
          <div className="rounded-2xl px-5 py-4" style={{ border: "1px solid rgba(255,255,255,0.14)" }}>
            <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "#7CBEFF" }}>
              {a(tx.schere.kaufpreis)}
            </p>
            <p className="text-2xl md:text-3xl font-semibold tabular-nums mt-1">{fmt.euro(kaufpreis)}</p>
          </div>
          <div className="rounded-2xl px-5 py-4" style={{ border: "1px solid rgba(255,255,255,0.14)" }}>
            <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "rgba(246,248,252,0.5)" }}>
              {a(tx.schere.laufzeit)}
            </p>
            <p className="text-2xl md:text-3xl font-semibold tabular-nums mt-1">{a(tx.schere.jahre(jahre))}</p>
            <p className="text-xs mt-1 leading-snug" style={{ color: "rgba(246,248,252,0.5)" }}>
              {tilgungText}
            </p>
          </div>
        </div>

        <svg
          className="hidden md:block w-full"
          style={{ height: 260 }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {[
            { d: "M2,50 L98,10", farbe: "rgba(255,255,255,0.3)", verzoegerung: 0 },
            { d: "M2,50 L98,50", farbe: "#4DA3FF", verzoegerung: 220 },
            { d: "M2,50 L98,90", farbe: "rgba(255,255,255,0.3)", verzoegerung: 440 },
          ].map((l) => (
            <path
              key={l.d}
              d={l.d}
              fill="none"
              stroke={l.farbe}
              strokeWidth="1.5"
              pathLength={100}
              style={{
                strokeDasharray: 100,
                strokeDashoffset: sichtbar ? 0 : 100,
                transition: `stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1) ${l.verzoegerung}ms`,
              }}
            />
          ))}
        </svg>

        <div className="space-y-4 md:text-right">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "rgba(246,248,252,0.5)" }}>
              {a(tx.schere.immobilienwert)}
            </p>
            <p className="text-2xl md:text-3xl font-semibold tabular-nums mt-1">
              <ZahlAnimiert wert={wert} euro dauer={900} />
            </p>
          </div>
          <div
            className="rounded-2xl px-5 py-4"
            style={{
              backgroundColor: "rgba(0,122,255,0.16)",
              border: "1px solid rgba(124,190,255,0.4)",
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "#7CBEFF" }}>
              {a(tx.schere.vermoegen)}
            </p>
            <p className="text-3xl md:text-4xl font-semibold tabular-nums mt-1" style={{ color: "#7CBEFF" }}>
              <ZahlAnimiert wert={vermoegen} euro dauer={900} />
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "rgba(246,248,252,0.5)" }}>
              {a(tx.schere.restschuld)}
            </p>
            <p className="text-2xl md:text-3xl font-semibold tabular-nums mt-1">{fmt.euro(restschuld)}</p>
            <p className="text-xs mt-1" style={{ color: "rgba(246,248,252,0.5)" }}>
              {a(tx.schere.getilgt(getilgt10))}
            </p>
          </div>
        </div>
      </div>

      {/* Regler */}
      <div className="mt-10 rounded-2xl p-6" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <label htmlFor="wertsteigerung" className="text-sm font-medium">
            {a(tx.schere.regler)}
          </label>
          <span className="text-2xl font-semibold tabular-nums" style={{ color: "#7CBEFF" }}>
            {fmt.prozent(wertsteigerung, 1)}
          </span>
        </div>
        <input
          id="wertsteigerung"
          type="range"
          min={0}
          max={4}
          step={0.5}
          value={wertsteigerung}
          onChange={(e) => onWertsteigerung(parseFloat(e.target.value))}
          className="w-full accent-[#4DA3FF] cursor-pointer"
        />
        <div className="flex justify-between text-[11px] mt-2" style={{ color: "rgba(246,248,252,0.45)" }}>
          <span>{fmt.prozent(0, 0)}</span>
          <span>{fmt.prozent(2, 0)}</span>
          <span>{fmt.prozent(4, 0)}</span>
        </div>
        <p className="text-xs mt-5 leading-relaxed" style={{ color: "rgba(246,248,252,0.6)" }}>
          {a(tx.schere.reglerNull)} {a(tx.schere.selbstDann)}{" "}
          <span className="font-semibold" style={{ color: "#7CBEFF" }}>
            {fmt.euro(kaufpreis - restschuld)}
          </span>{" "}
          {a(tx.schere.selbstDannRest)}
        </p>
      </div>

      <p className="mt-6 text-xs leading-relaxed max-w-3xl" style={{ color: "rgba(246,248,252,0.5)" }}>
        {a(tx.schere.haftung)}
      </p>
    </div>
  );
}

/**
 * Welche effektive Jahresrendite ein Sparplan braeuchte, um mit demselben
 * Einsatz dasselbe Endvermoegen wie die Immobilie zu erreichen.
 *
 * Einmalanlage plus monatliche Sparrate ueber 120 Monate. Die Loesung wird
 * per Intervallschachtelung gesucht, weil sich der Zinssatz nicht direkt
 * aufloesen laesst. Rueckgabe ist der effektive Jahreszins in Prozent.
 */
function renditePaProzent(ekEinmal: number, sparrateMonat: number, endvermoegen: number): number {
  let lo = 0, hi = 0.05;
  for (let i = 0; i < 100; i++) {
    const r = (lo + hi) / 2;
    const f = Math.pow(1 + r, 120);
    const fv = ekEinmal * f + (r > 0 ? sparrateMonat * ((f - 1) / r) : sparrateMonat * 120);
    if (fv < endvermoegen) lo = r; else hi = r;
  }
  const rMon = (lo + hi) / 2;
  return (Math.pow(1 + rMon, 12) - 1) * 100;
}

/**
 * Das Rendite-Modul.
 *
 * Es uebersetzt die Immobilie in eine einzige, leicht verstaendliche Zahl:
 * die effektive Jahresrendite, die ein Sparplan mit demselben Eigenkapital
 * und demselben monatlichen Cashflow braeuchte, um nach zehn Jahren dasselbe
 * Vermoegen aufzubauen. Es haengt am selben Wertsteigerungs-Regler wie die
 * Immobilienschere und rechnet dadurch live mit.
 */
function RenditeModul({
  ekEinmal,
  sparrate,
  kaufpreis,
  getilgt10,
  wertsteigerung,
}: {
  ekEinmal: number;
  sparrate: number;
  kaufpreis: number;
  getilgt10: number;
  wertsteigerung: number;
}) {
  const { tx, a, fmt } = useTexte();
  const jahre = 10;
  // Identische Formel wie in der Immobilienschere: getilgtes Darlehen plus
  // der Wertzuwachs ueber zehn Jahre.
  const endvermoegen = Math.round(getilgt10 + kaufpreis * (Math.pow(1 + wertsteigerung / 100, jahre) - 1));
  const rendite = renditePaProzent(ekEinmal, sparrate, endvermoegen);

  return (
    <div className="grid lg:grid-cols-5 gap-8 items-stretch">
      {/* Der nachvollziehbare Rechenweg: Einmalanlage, Sparrate mal 120,
          Endvermoegen. */}
      <Reveal className="lg:col-span-3" richtung="links">
        <div className="rounded-2xl border border-border bg-card p-7 h-full">
          <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold mb-6">
            {a(tx.rendite.weg)}
          </p>
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-3">
              <span className="text-sm">{a(tx.rendite.ek)}</span>
              <span className="text-lg font-semibold tabular-nums">{fmt.euro(ekEinmal)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-3">
              <span className="text-sm">{a(tx.rendite.cashflow)}</span>
              <span className="text-lg font-semibold tabular-nums">{fmt.euro(sparrate)} × 120</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 pt-1">
              <span className="text-sm font-medium">
                {a(tx.rendite.vermoegen10)}
              </span>
              <span className="text-2xl font-semibold tabular-nums text-primary">
                <ZahlAnimiert wert={endvermoegen} euro dauer={900} />
              </span>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground leading-relaxed">
            {/* Zwischen den beiden Saetzen fehlte bisher das Leerzeichen. */}
            {a(tx.rendite.endText(getilgt10, wertsteigerung))} {a(tx.rendite.live)}
          </p>
        </div>
      </Reveal>

      {/* Das Ergebnis, gross und hervorgehoben. */}
      <Reveal delay={160} className="lg:col-span-2" richtung="rechts">
        <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-8 h-full flex flex-col justify-center">
          <p className="text-sm uppercase tracking-widest text-primary font-semibold mb-3">
            {a(tx.rendite.noetig)}
          </p>
          <p className="text-5xl md:text-6xl font-semibold tracking-tight text-primary tabular-nums leading-none">
            {fmt.prozent(rendite, 1)}
          </p>
          <p className="mt-3 text-lg font-semibold">{a(tx.rendite.netto)}</p>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            {a(tx.rendite.soViel)}
          </p>
        </div>
      </Reveal>

      {/* Ein Satz, der es in den Zahlen dieses Konzepts auf den Punkt bringt. */}
      <Reveal delay={260} className="lg:col-span-5">
        <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-7 md:p-8">
          <p className="text-base md:text-lg leading-relaxed">
            <span className="font-semibold text-primary">{a(tx.rendite.bedeutet)}</span>{" "}
            {a(tx.rendite.bedeutetText(ekEinmal, sparrate, rendite))}
          </p>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            {a(tx.rendite.steuerfrei)} {a(tx.rendite.versteuern)}
          </p>
        </div>
      </Reveal>
    </div>
  );
}

/* ── Mockups für den Prozessweg ─────────────────────────────── */

type MockupArt = "gespraech" | "formular" | "strategie" | "objekt" | "vertrag" | "portfolio";

/**
 * Die Zahlen aus Abschnitt 03, wie sie in den Mockups von Abschnitt 04
 * erscheinen.
 *
 * Der Kunde beantwortet in Abschnitt 03 vier Felder, und einen Bildschirm
 * weiter steht in den kleinen Vorschaubildern immer noch der Beispielkunde mit
 * seinen 4.000 Euro. Das ist genau der Moment, in dem eine Praesentation
 * generisch wirkt. Jetzt tragen die Kacheln seine eigenen Zahlen.
 *
 * Solange ein Feld leer ist, bleibt der Beispielwert stehen: eine leere Kachel
 * im Termin waere schlechter als eine mit Platzhalter.
 */
export interface UebernommeneZahlen {
  nettoeinkommen?: string;
  ausgaben?: string;
  /** Der liquide verfuegbare Teil, denn nur damit wird gekauft. */
  eigenkapital?: string;
  rahmen?: string;
}

/** Beschriftete Zeile in einem Mockup: links das Wort, rechts der Wert. */
function Posten({
  label,
  wert,
  betont = false,
  className = "",
  style,
}: {
  label: string;
  wert: string;
  betont?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-1.5 ${className}`} style={style}>
      <span className="text-[8px] truncate" style={{ color: "rgba(246,248,252,0.45)" }}>
        {label}
      </span>
      <span
        className="text-[9px] font-semibold tabular-nums whitespace-nowrap"
        style={{ color: betont ? "#7CBEFF" : "rgba(246,248,252,0.9)" }}
      >
        {wert}
      </span>
    </div>
  );
}

/**
 * Kleine, angedeutete Oberfläche unter jedem Prozessschritt.
 *
 * Sie zeigt kein echtes Produkt, macht den Schritt aber greifbar. Wichtig ist,
 * dass in jeder Kachel steht, worum es in diesem Schritt tatsächlich geht:
 * eine Frage aus dem Erstgespräch, echte Beträge in der Selbstauskunft, der
 * Finanzierungsrahmen in der Strategie. Platzhalterbalken sähen zwar
 * aufgeräumter aus, sagen dem Kunden aber nichts.
 *
 * Die Zahlen sind dieselben wie in der Beispielrechnung in Abschnitt 12 und
 * 14. Der Kunde soll sie später wiedererkennen.
 */
function Mockup({ art, zahlen }: { art: MockupArt; zahlen?: UebernommeneZahlen }) {
  const { tx, a, fmt } = useTexte();
  const inhalt = () => {
    switch (art) {
      // Erstgespräch: die erste Frage und die Antwort, um die es wirklich geht.
      case "gespraech":
        return (
          <div className="space-y-1.5">
            <div className="flex items-start gap-1.5 mockup-blase-links">
              <div
                className="h-4 w-4 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              />
              <div
                className="rounded-lg rounded-tl-sm px-2 py-1.5 text-[9px] leading-snug"
                style={{ backgroundColor: "rgba(255,255,255,0.09)", color: "rgba(246,248,252,0.88)" }}
              >
                {a(tx.mockup.frage)}
              </div>
            </div>
            <div className="flex justify-end mockup-blase-rechts">
              <div
                className="rounded-lg rounded-tr-sm px-2 py-1.5 text-[9px] leading-snug"
                style={{ backgroundColor: "rgba(0,122,255,0.42)", color: "#FFFFFF" }}
              >
                {a(tx.mockup.antwort)}
              </div>
            </div>
            <div className="flex items-center gap-1 pl-6 mockup-tippen">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1 w-1 rounded-full inline-block"
                  style={{ backgroundColor: "rgba(124,190,255,0.85)" }}
                />
              ))}
            </div>
          </div>
        );

      // Selbstauskunft: Einnahmen, Ausgaben und Eigenkapital füllen sich
      // nacheinander, mit den Zahlen des Beispielkunden.
      case "formular":
        return (
          <div className="space-y-2">
            {[
              { label: a(tx.mockup.nettoeinkommen), wert: zahlen?.nettoeinkommen || fmt.euro(4000) },
              { label: a(tx.mockup.ausgaben), wert: zahlen?.ausgaben || fmt.euro(1850) },
              { label: a(tx.mockup.eigenkapital), wert: zahlen?.eigenkapital || fmt.euro(25000) },
            ].map((f, i) => (
              <div
                key={f.label}
                className="rounded px-1.5 py-1 mockup-feld"
                style={{
                  backgroundColor: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  animationDelay: `${i * 0.7}s`,
                }}
              >
                <Posten label={f.label} wert={f.wert} />
              </div>
            ))}
          </div>
        );

      // Strategie: die Konzepte im Vergleich, darunter der Rahmen, der
      // daraus folgt.
      case "strategie":
        return (
          <div className="h-full flex flex-col">
            <p className="text-[7.5px] uppercase tracking-[0.14em]" style={{ color: "rgba(246,248,252,0.42)" }}>
              {a(tx.mockup.konzepteVergleich)}
            </p>
            <div className="flex-1 flex items-end gap-1.5 mt-1.5">
              {[
                { name: a(tx.mockup.balken[0]), hoehe: 42 },
                { name: a(tx.mockup.balken[1]), hoehe: 68 },
                { name: a(tx.mockup.balken[2]), hoehe: 100 },
              ].map((k, i) => (
                <div key={k.name} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
                  <div
                    className="w-full rounded-t mockup-balken"
                    style={{
                      height: `${k.hoehe}%`,
                      animationDelay: `${i * 0.22}s`,
                      background:
                        i === 2
                          ? "linear-gradient(180deg,#5CB0FF,#0A6EDB)"
                          : "rgba(255,255,255,0.14)",
                    }}
                  />
                  <span
                    className="text-[6.5px] whitespace-nowrap"
                    style={{ color: i === 2 ? "#7CBEFF" : "rgba(246,248,252,0.4)" }}
                  >
                    {k.name}
                  </span>
                </div>
              ))}
            </div>
            <Posten label={a(tx.mockup.rahmen)} wert={zahlen?.rahmen || fmt.euro(350000)} betont className="mt-2" />
          </div>
        );

      // Objektvorschlag: das Bild lädt, dann springt der Preis ins Auge,
      // darunter die Eckdaten der Wohnung.
      case "objekt":
        return (
          <div className="space-y-1.5">
            <div
              className="h-9 rounded-md flex items-end justify-end p-1 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 100%)" }}
            >
              <div
                className="absolute inset-0 mockup-bildlicht"
                style={{
                  background:
                    "linear-gradient(100deg, transparent 38%, rgba(255,255,255,0.18) 50%, transparent 62%)",
                  backgroundSize: "220% 100%",
                }}
              />
              {/* Derselbe Betrag wie der Finanzierungsrahmen: Der Kunde soll
                  sehen, dass der Objektvorschlag aus seiner eigenen Rechnung
                  folgt und nicht aus einer Preisliste. */}
              <span
                className="relative text-[8px] font-semibold px-1.5 py-0.5 rounded mockup-preis"
                style={{ backgroundColor: "rgba(0,122,255,0.85)", color: "#FFFFFF" }}
              >
                {zahlen?.rahmen || fmt.euro(350000)}
              </span>
            </div>
            <p className="text-[9px] font-semibold" style={{ color: "rgba(246,248,252,0.9)" }}>
              {a(tx.mockup.zimmer)}
            </p>
            <Posten label={a(tx.mockup.ort)} wert={a(tx.mockup.miete(1400))} />
          </div>
        );

      // Finanzierung: der Vertrag füllt sich Zeile für Zeile, dann bestätigt
      // die Bank.
      case "vertrag":
        return (
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1.5">
              {[
                { label: a(tx.mockup.darlehen), wert: zahlen?.rahmen || fmt.euro(350000) },
                { label: a(tx.mockup.zins), wert: fmt.prozent(4, 0) },
                { label: a(tx.mockup.tilgung), wert: fmt.prozent(1.5, 1) },
                { label: a(tx.mockup.notartermin), wert: a(tx.mockup.notarDatum) },
              ].map((z, i) => (
                <Posten
                  key={z.label}
                  label={z.label}
                  wert={z.wert}
                  className="mockup-zeile"
                  style={{ animationDelay: `${i * 0.25}s` }}
                />
              ))}
            </div>
            <div
              className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center mockup-stempel"
              style={{ border: "1.5px solid rgba(124,190,255,0.6)" }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#7CBEFF" }} />
            </div>
          </div>
        );

      // Portfolio: die Miete läuft, die Kurve zeichnet sich nach oben.
      case "portfolio":
        return (
          <div className="h-full flex flex-col justify-between">
            <Posten label={a(tx.mockup.mieteinnahme)} wert={a(tx.mockup.proMonat(1400))} betont />
            <svg viewBox="0 0 120 40" className="w-full h-[40px]" preserveAspectRatio="none">
              <defs>
                <linearGradient id="mockupVerlauf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5CB0FF" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#5CB0FF" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                className="mockup-kurve-flaeche"
                d="M0 34 L24 28 L48 30 L72 18 L96 12 L120 4 L120 40 L0 40 Z"
                fill="url(#mockupVerlauf)"
              />
              {/* Blasse Dauerlinie darunter, damit die Kachel im Moment des
                  Neuzeichnens nie leer wirkt. */}
              <polyline
                points="0,34 24,28 48,30 72,18 96,12 120,4"
                fill="none"
                stroke="rgba(124,190,255,0.3)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                className="mockup-kurve"
                points="0,34 24,28 48,30 72,18 96,12 120,4"
                fill="none"
                stroke="#7CBEFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex items-center gap-1.5">
              <KeyRound className="h-3 w-3 shrink-0" style={{ color: "#7CBEFF" }} />
              <span className="text-[8px]" style={{ color: "rgba(246,248,252,0.5)" }}>
                {a(tx.mockup.vermietet)}
              </span>
            </div>
          </div>
        );
    }
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.11)", backgroundColor: "rgba(255,255,255,0.035)" }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.03)" }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: i === 0 ? "rgba(124,190,255,0.55)" : "rgba(255,255,255,0.18)" }}
          />
        ))}
      </div>
      <div className="p-2.5 h-[120px]">{inhalt()}</div>
    </div>
  );
}

/**
 * Trainer-Modus: Wird die Präsentation aus der Vertriebsakademie mit
 * ?trainer=1 geöffnet, erscheint unter jedem Stationskopf das Sprechskript
 * aus dem gemeinsamen Skript-Modul. Aus dem Kundenprofil heraus gibt es den
 * Parameter nicht, vor dem Kunden kann der Streifen also nur auftauchen,
 * wenn jemand bewusst die Trainer-Adresse benutzt. Zusätzlich lässt er sich
 * über den schwebenden Knopf jederzeit ausblenden.
 */
/**
 * Kleiner Hinweis unter einem Feld, dessen Wert aus dem Erstgespräch stammt.
 *
 * Im Termin ist wichtig zu wissen, ob eine Zahl vom Kunden selbst genannt
 * wurde oder ob sie jemand geschätzt hat. Sobald der Berater den Wert ändert,
 * verschwindet der Hinweis.
 */
function UebernahmeHinweis({ sichtbar }: { sichtbar: boolean }) {
  const { tx, a } = useTexte();
  if (!sichtbar) return null;
  return (
    <p className="mt-1.5 text-[11px] text-primary/80 flex items-center gap-1">
      <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-primary/60" />
      {a(tx.arbeitsweise.uebernommen)}
    </p>
  );
}

const TrainerContext = createContext(false);

/**
 * Kundenanrede der gesamten Präsentation.
 *
 * Die Wahl zwischen Du und Sie trifft der Setter im Erstgesprächsskript,
 * gespeichert in meta.setterSkript.anrede. Die Präsentation übernimmt sie
 * automatisch; ohne Kundenkontext oder gespeicherte Wahl gilt die Du-Form.
 */
const AnredeContext = createContext<Anrede>("du");

/** Kurzform für Texte in beiden Anreden. */
type AnredeText = (sie: string, du: string) => string;

/**
 * Liefert die aktive Anrede und den Übersetzer t(sieText, duText).
 *
 * Damit steht an jeder Textstelle genau ein Aufruf statt eines eigenen
 * Ternaries, und die Sie-Fassung bleibt als erste Angabe immer sichtbar.
 */
function useAnrede(): { anrede: Anrede; t: AnredeText } {
  const anrede = useContext(AnredeContext);
  return { anrede, t: (sie, du) => (anrede === "du" ? du : sie) };
}

/**
 * Sprache der gesamten Präsentation, Deutsch oder Englisch.
 *
 * Gewählt über den Schalter oben rechts, je Nutzer gemerkt. Die Anrede bleibt
 * davon unberührt: Auf Deutsch gilt weiter Du oder Sie aus dem Erstgespräch,
 * auf Englisch gibt es nur "you".
 */
const SpracheContext = createContext<PraesentationsSprache>("de");

/**
 * Texte, Anrede und Zahlenformat der aktiven Sprache.
 *
 * `a(wert)` löst einen Eintrag aus `beratungspraesentationTexte.ts` in der
 * aktiven Anrede auf, `fmt` formatiert Beträge und Prozent in der Schreibweise
 * der Sprache.
 */
function useTexte(): {
  sprache: PraesentationsSprache;
  anrede: Anrede;
  tx: BeratungTexte;
  a: (wert: AnredeWert) => string;
  fmt: ReturnType<typeof formatierer>;
} {
  const sprache = useContext(SpracheContext);
  const anrede = useContext(AnredeContext);
  return {
    sprache,
    anrede,
    tx: BERATUNG_TEXTE[sprache],
    a: (wert) => inAnrede(wert, anrede),
    fmt: formatierer(sprache),
  };
}

/**
 * Setzt ein mit [[...]] markiertes Wort als Akzent. So bleibt die blaue
 * Hervorhebung in beiden Sprachen am richtigen Wort, auch wenn die
 * Wortstellung eine andere ist.
 */
function mitAkzent(text: string): React.ReactNode {
  const teile = text.split(/\[\[(.+?)\]\]/);
  if (teile.length === 1) return text;
  return teile.map((teil, i) => (i % 2 === 1 ? <Akzent key={i}>{teil}</Akzent> : teil));
}

function TrainerSkriptKarte({ id, dunkel }: { id: string; dunkel?: boolean }) {
  const an = useContext(TrainerContext);
  const { anrede } = useAnrede();
  const roh = SPRECHSKRIPT_NACH_ID[id];
  if (!an || !roh) return null;
  // Das Sprechskript folgt der Anrede des Kunden: Wer per Du berät, sieht
  // hier auch die Du-Fassung der wörtlichen Kundensätze.
  const s = sprechskriptFuerAnrede(roh, anrede);
  return (
    // data-pdf-exclude: Diese Karte enthaelt das interne Sprechskript und darf
    // niemals im PDF landen, das anschliessend beim Kunden liegt. Der Export
    // blendet alles mit diesem Attribut vor dem Rendern aus.
    <div
      data-pdf-exclude
      className={`mt-6 rounded-2xl border-2 border-dashed p-5 text-sm leading-relaxed ${
        dunkel
          ? "border-amber-300/40 bg-amber-300/10"
          : "border-amber-400/60 bg-amber-50 dark:bg-amber-950/20"
      }`}
    >
      <p
        className={`text-[10px] uppercase tracking-[0.22em] font-semibold mb-2 ${
          dunkel ? "text-amber-200" : "text-amber-700 dark:text-amber-300"
        }`}
      >
        Sprechskript · nur für dich sichtbar
      </p>
      {s.ueberleitung && (
        <p className={`italic mb-2 ${dunkel ? "text-amber-100/80" : "text-amber-900/80 dark:text-amber-200/80"}`}>
          Überleitung: „{s.ueberleitung}"
        </p>
      )}
      <p className={dunkel ? "text-amber-50" : "text-amber-950 dark:text-amber-100"}>„{s.skript}"</p>
      <p className={`mt-2 text-xs ${dunkel ? "text-amber-100/70" : "text-amber-800/70 dark:text-amber-200/70"}`}>
        Warum: {s.warum}
      </p>
    </div>
  );
}

/**
 * Abschnitt mit Nummer, Überschrift und optionalem Vorspann.
 *
 * Drei Tonlagen: normal, hell und dunkel. Die dunklen Abschnitte sind die
 * Höhepunkte des Gesprächs. Der Wechsel zwischen hell und dunkel ist der
 * eigentliche Spannungsbogen, nicht die Animation.
 */
function Station({
  nummer,
  id,
  titel,
  vorspann,
  children,
  hell = false,
  dunkel = false,
  weit = false,
}: {
  /** Zahl für eine der achtzehn Stationen, oder ein Wort für Einschübe
   *  wie die Referenzen, die die Nummerierung nicht verschieben sollen. */
  nummer: number | string;
  id: string;
  /** Text oder JSX, damit einzelne Wörter blau hervorgehoben werden können. */
  titel: React.ReactNode;
  vorspann?: string;
  children: React.ReactNode;
  hell?: boolean;
  dunkel?: boolean;
  /** Breiterer Satzspiegel, etwa für den Prozessweg mit sechs Spalten. */
  weit?: boolean;
}) {
  return (
    <section
      id={id}
      className={`px-6 scroll-mt-20 relative overflow-hidden ${
        dunkel ? "beratung-dark py-24 md:py-36" : "py-20 md:py-28"
      } ${hell && !dunkel ? "bg-muted/30" : ""}`}
      style={dunkel ? { backgroundColor: "#080A0F" } : undefined}
    >
      {dunkel && (
        <>
          {/* Bühnenlicht von oben und ein feines Raster, damit die Fläche
              nicht wie ein schwarzer Kasten wirkt. */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(0,122,255,0.28) 0%, transparent 62%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 0%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 0%, transparent 75%)",
            }}
          />
        </>
      )}
      <div className={`${weit ? "max-w-7xl" : "max-w-6xl"} mx-auto relative`}>
        <Reveal>
          <div className="flex items-baseline gap-4 mb-3">
            <span
              className="text-sm font-semibold tabular-nums tracking-[0.3em] uppercase"
              style={{ color: dunkel ? "#7CBEFF" : undefined }}
            >
              <span className={dunkel ? "" : "text-primary"}>
                {typeof nummer === "number" ? String(nummer).padStart(2, "0") : nummer}
              </span>
            </span>
            {/* Der Strich neben der Nummer.
                
                Er war in einzelnen Abschnitten nicht zu sehen. Ein leeres
                Kaestchen in einer Zeile mit items-baseline hat keine eigene
                Grundlinie, die Browser leiten sie sich unterschiedlich her,
                und bei einer Hoehe von einem Pixel entscheidet das darueber,
                ob der Strich sichtbar wird oder nicht. Dazu kam, dass der
                Verlauf auf hellem Grund fast sofort in Transparenz lief.
                
                Und der Verlauf selbst war das eigentliche Problem: Ein
                Farbverlauf auf einem Kaestchen von einem Pixel Hoehe wird von
                Safari bei krummen Bildschirmskalierungen gar nicht gezeichnet,
                und die Schreibweise hsl(var(--border) / 0.35) macht in
                aelteren Fassungen die ganze Angabe ungueltig. Dann fehlt der
                Hintergrund vollstaendig, und der Strich ist unsichtbar.

                Deshalb jetzt: kein Verlauf, sondern eine echte Linie ueber
                borderTop. Die zeichnet jeder Browser, immer mindestens einen
                Geraetepixel breit. */}
            <div
              style={{
                flex: "1 1 auto",
                alignSelf: "center",
                minWidth: "48px",
                height: 0,
                // Farbe aus der Lovable-Fassung, Zeichenweise aus dieser hier.
                //
                // Der Kontrast war tatsaechlich ein Teil des Problems: die
                // Rahmenfarbe ging auf den hellen Stationen unter. Deshalb jetzt
                // --muted-foreground. Die Deckkraft steht aber als eigene Angabe
                // daneben statt als hsl(... / 0.55), denn diese Schreibweise
                // macht in aelteren Browsern die ganze Farbangabe ungueltig, und
                // dann fehlt der Strich vollstaendig.
                opacity: dunkel ? 0.85 : 0.5,
                borderTop: dunkel
                  ? "1px solid rgb(124,190,255)"
                  : "1px solid hsl(var(--muted-foreground))",
              }}
            />
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.08]">{titel}</h2>
          {vorspann && (
            <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-3xl leading-relaxed">
              {vorspann}
            </p>
          )}
        </Reveal>
        <TrainerSkriptKarte id={id} dunkel={dunkel} />
        <div className="mt-12 md:mt-16">{children}</div>
      </div>
    </section>
  );
}

/**
 * Überleitung zwischen zwei Stationen.
 *
 * Der Satz steht groß und allein. Genau diese Pause macht aus einer Folie
 * einen Übergang, den der Kunde mitgeht.
 */
function Ueberleitung({ text, betont }: { text: string; betont?: string }) {
  return (
    <div className="px-6 py-14 md:py-20">
      <Reveal className="max-w-4xl mx-auto text-center">
        <p className="text-xl md:text-3xl font-light leading-snug tracking-tight text-foreground/80">
          {text}{" "}
          {betont && <span className="font-semibold text-foreground">{betont}</span>}
        </p>
      </Reveal>
    </div>
  );
}

/** Karte mit Zahl und Beschriftung. */
function Kennzahl({
  wert,
  label,
  hinweis,
  ton = "neutral",
}: {
  wert: React.ReactNode;
  label: string;
  hinweis?: string;
  ton?: "neutral" | "gut" | "warn";
}) {
  const farbe =
    ton === "gut" ? "text-emerald-600" : ton === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className={`text-3xl md:text-4xl font-semibold tracking-tight ${farbe}`}>{wert}</p>
      <p className="text-sm font-medium text-foreground mt-2">{label}</p>
      {hinweis && <p className="text-xs text-muted-foreground mt-1 leading-snug">{hinweis}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Inhalte
   ══════════════════════════════════════════════════════════════ */

/**
 * Sprungmarken oben in der Kopfleiste, in dieser Reihenfolge. Die
 * Beschriftungen kommen aus `beratungspraesentationTexte.ts`.
 */
const NAV_IDS = ["heute", "funktion", "konzepte", "referenzen", "rechnung", "schritt"] as const;



/**
 * Die sechs Fragen vor jedem Objektvorschlag.
 *
 * Sie standen hier als reine Aufzählung. Jetzt sind es Felder, die im
 * Gespräch ausgefüllt werden. Das ist der wichtigste Eingriff der ganzen
 * Präsentation: Was der Kunde selbst beantwortet, verteidigt er später. Was
 * man ihm vorsetzt, prüft er. Die Antworten kommen im Einschub davor noch
 * einmal gebündelt zurück, kurz bevor es um die Selbstauskunft geht.
 */
/**
 * Die Fragen vor jedem Objektvorschlag, jetzt als ausfüllbarer Block.
 *
 * Gegenüber der reinen Aufzählung von früher hat sich die Rolle geändert: Was
 * der Kunde selbst beantwortet, verteidigt er später. Was man ihm vorsetzt,
 * prüft er. Die Antworten kommen vor Abschnitt 15 gebündelt zurück.
 *
 * Zwei Fragen sind bewusst keine Freitextfelder mehr. Das Ziel wird aus der
 * Liste in Abschnitt 03 gewählt, und das passende Konzept wird daraus
 * abgeleitet statt gewählt. Der Kunde soll nicht raten, welches Konzept zu
 * ihm passt, das ist unsere Aufgabe. Die Steuerfrage ist ganz entfallen, die
 * beantwortet später der Steuerrechner mit echten Zahlen.
 */
/** Höchstens drei Ziele. Sie wandern so auch in die Selbstauskunft. */
const ZIELE_MAX = 3;

const FREITEXT_FRAGEN: Array<{ schluessel: string; frage: string; platzhalter: string }> = [
  { schluessel: "wunsch", frage: "Gibt es sonst etwas, das uns wichtig sein sollte?", platzhalter: "z.B. Lage in der Nähe, kein Sanierungsstress" },
];

/**
 * Der Preis des Nichtstuns.
 *
 * Rein rechnerisch, ohne Drama. 50.000 Euro auf dem Tagesgeldkonto, zwei
 * Prozent Zinsen, zweieinhalb Prozent Geldentwertung. Nach zehn Jahren steht
 * nominal mehr auf dem Konto und real weniger im Einkaufskorb. Diese Lücke
 * ist der einzige ehrliche Grund, warum man das Thema nicht noch zwei Jahre
 * schiebt.
 */
const SPARKONTO = {
  start: 50000,
  zins: 0.02,
  inflation: 0.025,
  jahre: 10,
  nominal: 60950,
  kaufkraft: 47615,
};

/**
 * Die Vorschaubilder unter den sechs Prozessschritten, in der Reihenfolge der
 * Schritte in `prozess.schritte` der Texte.
 */
const PROZESS_MOCKUPS: MockupArt[] = ["gespraech", "formular", "strategie", "objekt", "vertrag", "portfolio"];

/**
 * Kumulierte Werte über zwanzig Jahre bei 350.000 Euro Darlehen,
 * 3,5 Prozent Zins und 1,5 Prozent anfänglicher Tilgung.
 *
 * Der eingezahlte Beitrag wächst linear, die Tilgung wächst exponentiell,
 * weil der Tilgungsanteil der Rate mit jedem Jahr steigt. Genau diese Schere
 * ist die Aussage der Grafik.
 */
const VERMOEGEN = [
  { jahr: 1, einsatz: 2500, tilgung: 5250 },
  { jahr: 5, einsatz: 12500, tilgung: 28200 },
  { jahr: 10, einsatz: 25000, tilgung: 61600 },
  { jahr: 15, einsatz: 37500, tilgung: 101300 },
  { jahr: 20, einsatz: 50000, tilgung: 148500 },
];

/** Steuerwirkung im Beispiel, gerechnet mit einem Grenzsteuersatz von 42 Prozent. */
const STEUERWIRKUNG: Array<{
  label: string;
  wert: number;
  hinweis: string;
  ton: "stark" | "ruhig";
}> = [
  {
    label: "Steuerentlastung im ersten Jahr",
    wert: 10800,
    hinweis:
      "Enthält den einmaligen Erhaltungsaufwand von 20.000 Euro. Dieser Effekt tritt genau einmal auf.",
    ton: "stark",
  },
  {
    label: "Steuerentlastung ab dem zweiten Jahr",
    wert: 2400,
    hinweis:
      "Jährlich wiederkehrend aus Abschreibung, Zinsen und laufenden Kosten. Das sind rund 200 Euro im Monat.",
    ton: "ruhig",
  },
];

/** Symbole der vier Bausteine, in der Reihenfolge von `funktion.bausteine` der Texte. */
const BAUSTEIN_ICONS = [Users, Receipt, Coins, TrendingUp];


type KonzeptId = "bestand" | "wg" | "kfw";

/**
 * Konzeptbild fuer WG und Co-Living. Anders als bei den uebrigen Konzepten
 * zeigt hier bewusst ein Innenbild der WG-Wohnung und keine Fassade, weil sich
 * das Konzept erst im Inneren erklaert.
 */
const WG_KONZEPTBILD = "/beispielrechnungen/wg/wg-02.png";

/** Ein Konzept mit den Texten der aktiven Sprache und Anrede. */
interface Konzept {
  id: KonzeptId;
  nummer: number;
  name: string;
  kurz: string;
  bild: string;
  fokus: string;
  einleitung: string;
  vorteile: string[];
  geeignet: string[];
  /** Zusatzblock, etwa die zwei Standorte beim WG-Konzept. */
  bloecke?: Array<{ titel: string; punkte: string[] }>;
  detailRoute?: string;
  detailLabel?: string;
}

/** Was an einem Konzept keine Übersetzung braucht. */
const KONZEPT_DATEN: Array<Pick<Konzept, "id" | "nummer" | "bild" | "detailRoute" | "detailLabel">> = [
  { id: "bestand", nummer: 8, bild: modellSaniert },
  {
    id: "wg",
    nummer: 8,
    bild: WG_KONZEPTBILD,
    detailRoute: "/beratungspraesentation-wg",
    detailLabel: "Detailpräsentation WG und Co-Living",
  },
  {
    id: "kfw",
    nummer: 8,
    bild: modellKfw,
    detailRoute: "/beratungspraesentation",
    detailLabel: "Detailpräsentation Neubau",
  },
];

/** Form der Konzepttexte in `beratungspraesentationTexte.ts`. */
interface KonzeptText {
  name: AnredeWert;
  kurz: AnredeWert;
  fokus: AnredeWert;
  einleitung: AnredeWert;
  vorteile: readonly AnredeWert[];
  geeignet: readonly AnredeWert[];
  bloecke?: ReadonlyArray<{ titel: AnredeWert; punkte: readonly AnredeWert[] }>;
}

/** Die drei Konzepte in der aktiven Sprache und Anrede. */
function konzepteIn(tx: BeratungTexte, a: (wert: AnredeWert) => string): Konzept[] {
  return KONZEPT_DATEN.map((k) => {
    const text: KonzeptText = tx.konzepte.liste[k.id];
    return {
      ...k,
      name: a(text.name),
      kurz: a(text.kurz),
      fokus: a(text.fokus),
      einleitung: a(text.einleitung),
      vorteile: text.vorteile.map((v) => a(v)),
      geeignet: text.geeignet.map((g) => a(g)),
      bloecke: text.bloecke?.map((b) => ({ titel: a(b.titel), punkte: b.punkte.map((p) => a(p)) })),
    };
  });
}

/* ══════════════════════════════════════════════════════════════
   Musterberechnungen
   ══════════════════════════════════════════════════════════════ */

/**
 * Drei durchgerechnete Objekte, zwischen denen im Gespräch umgeschaltet wird.
 *
 * Es sind echte Objekte mit Adresse und Bildern aus den Objektunterlagen. Ein
 * Kunde, der die Wohnung sieht, über die geredet wird, folgt der Rechnung
 * daneben anders als bei einem Fall, der niemandem gehört. Was aus den
 * Unterlagen stammt und was hergeleitet ist, steht bei jedem Objekt in
 * `herkunft` und wird im Gespräch auch gesagt.
 *
 * Der sanierte Bestand ist selbst gerechnet: 2 Prozent Gebäude-AfA nach
 * § 7 Abs. 4 EStG, weil ein Altbau zwischen 1925 und 2022 fertiggestellt
 * wurde. Die früher hier stehenden 3 Prozent gelten erst für Neubauten ab
 * 2023 und waren schlicht falsch. Kaufnebenkosten erhöhen anteilig die
 * Abschreibungsbasis, sie sind keine Sofortkosten.
 *
 * Der Neubau folgt rechnerisch der vorliegenden Immobilienberechnung
 * Wohnung 1 Augsburg. Das gezeigte Objekt selbst ist aber Park-Living in
 * Ansbach: Adresse, Bilder, Grundrisse und Übersichtsplan gehören zu diesem
 * Projekt, und die Herkunftsangabe nennt es ebenfalls. Im Objektsteckbrief
 * stand trotzdem Augsburg, also der Ort der Rechenvorlage. Das ist
 * korrigiert, damit Adressfeld und Tabelle dasselbe sagen.
 * Gezeigt wird das erste volle Jahr, also 2028. Das ist bewusst so gewählt:
 * Im Anschaffungsjahr selbst weist die Vorlage Grunderwerbsteuer und Notar
 * als sofort abziehbare Werbungskosten aus. Nach § 255 HGB und der
 * BFH-Rechtsprechung gehören beide zu den Anschaffungsnebenkosten, nur die
 * Notarkosten der Grundschuldbestellung sind Finanzierungskosten und damit
 * sofort abziehbar. Das erste volle Jahr ist von dieser offenen Frage nicht
 * berührt und deshalb die belastbarere Zahl.
 *
 * Das WG-Konzept hat jetzt eine eigene Rechnung. Es wie den Bestand zu
 * behandeln, nur mit höherer Miete, wurde ihm nicht gerecht: vier einzeln
 * vermietete Zimmer bedeuten auch vier Mietverhältnisse, Möblierung, die
 * ersetzt werden muss, eine Verwaltung, die das können muss, und ein anderes
 * Ausfallrisiko. Genau diese Posten stehen jetzt in der Rechnung.
 */
type RechnungId = "bestand" | "neubau" | "wg";

/** Eine Musterrechnung mit den Texten der aktiven Sprache und Anrede. */
interface Musterrechnung {
  id: RechnungId;
  name: string;
  /** Kurzer Ort unter dem Reiter. */
  ort: string;
  kurz: string;
  bild: string;
  /** Anschrift des Objekts, steht in der Bildergalerie. */
  adresse: string;
  /** Bilder aus den Objektunterlagen, manuell durchklickbar. */
  bilder: Array<{ pfad: string; titel: string }>;
  /** Merkmale, wie sie in den Unterlagen stehen. */
  merkmale: string[];
  /** Was aus den Unterlagen stammt und was hergeleitet ist. */
  herkunft: string;
  kunde: Array<[string, string]>;
  objekt: Array<[string, string]>;
  /** Monatliche Rechnung, Zeile für Zeile. */
  zeilen: Array<{ pos: string; betrag: string; ton: "gut" | "neutral" }>;
  beitragVorSteuer: string;
  /** Wie sich die Abschreibung zusammensetzt. */
  afa: Array<{ titel: string; text: string; betrag: string }>;
  /** Steuerliches Ergebnis, Position für Position. */
  steuerZeilen: Array<[string, string]>;
  steuerErgebnis: string;
  entlastungJahr: number;
  entlastungMonat: number;
  entlastungLabel: string;
  /** Wie es später aussieht, wenn ein Effekt ausläuft. */
  spaeter: { titel: string; entlastungMonat: string; beitragMonat: string; text: string };
  hinweis: string;
  /** Grundlage der Immobilienschere. */
  schere: { kaufpreis: number; darlehen: number; getilgt10: number; tilgungText: string };
  /** Eigenkapital fuer das Rendite-Modul, entspricht den Kaufnebenkosten. */
  renditeEk: number;
  /** Monatlicher Cashflow nach Steuer ab dem zweiten regulaeren Jahr. */
  renditeSparrate: number;
}

/**
 * Was an einer Musterrechnung keine Übersetzung braucht: Bilder und die
 * Zahlen, mit denen Grafiken und Rendite-Modul rechnen. Alle Texte der
 * Rechnung, auch die Beträge in den Tabellenzeilen, stehen je Sprache in
 * `beratungspraesentationTexte.ts` unter `rechnungen`.
 */
interface RechnungDaten {
  id: RechnungId;
  bild: string;
  /** Bildpfade, die Titel dazu stehen in den Texten unter `bildTitel`. */
  bildPfade: string[];
  /** Bemessungsgrundlage der AfA. Steht derzeit auf keiner Folie. */
  afaGrundlage: string;
  entlastungJahr: number;
  entlastungMonat: number;
  schere: { kaufpreis: number; darlehen: number; getilgt10: number };
  renditeEk: number;
  renditeSparrate: number;
}

const RECHNUNG_DATEN: Record<RechnungId, RechnungDaten> = {
  bestand: {
    id: "bestand",
    bild: modellSaniert,
    bildPfade: [
      "/beispielrechnungen/bestand/bestand-02.jpg",
      "/beispielrechnungen/bestand/bestand-03.jpg",
      "/beispielrechnungen/bestand/bestand-04.jpg",
      "/beispielrechnungen/bestand/bestand-05.jpg",
      "/beispielrechnungen/bestand/bestand-06.jpg",
      "/beispielrechnungen/bestand/bestand-07.jpg",
      "/beispielrechnungen/bestand/bestand-08.jpg",
      "/beispielrechnungen/bestand/bestand-09.jpg",
    ],
    afaGrundlage: "295.400 €",
    entlastungJahr: 9907,
    entlastungMonat: 826,
    schere: { kaufpreis: 350000, darlehen: 350000, getilgt10: 63032 },
    renditeEk: 19250,
    renditeSparrate: 228,
  },
  neubau: {
    id: "neubau",
    bild: modellKfw,
    bildPfade: [
      "/beispielrechnungen/neubau/neubau-01.jpg",
      "/beispielrechnungen/neubau/neubau-02.jpg",
      "/beispielrechnungen/neubau/neubau-08.jpg",
      "/beispielrechnungen/neubau/neubau-06.jpg",
      "/beispielrechnungen/neubau/neubau-07.jpg",
      "/beispielrechnungen/neubau/neubau-05.jpg",
    ],
    afaGrundlage: "151.500 €",
    entlastungJahr: 6546,
    entlastungMonat: 545,
    schere: { kaufpreis: 310000, darlehen: 310000, getilgt10: 49344 },
    // Eingaben fuer das Rendite-Modul, aus den Neubau-Daten abgeleitet:
    // Erwerbsnebenkosten aus Eigenkapital und der Cashflow nach Steuer ab
    // dem fuenften Jahr (spaeter.beitragMonat).
    renditeEk: 17050,
    renditeSparrate: 260,
  },
  wg: {
    id: "wg",
    bild: modellSaniert,
    // Feste Reihenfolge, wie vorgegeben: Zimmer mit Bett, Flur, Zimmer mit
    // Schreibtisch, Bad, Gebaeude von vorn, Gebaeude schraeg.
    // wg-04 faellt bewusst raus, es zeigt dasselbe Zimmer wie wg-05.
    bildPfade: [
      "/beispielrechnungen/wg/wg-02.png",
      "/beispielrechnungen/wg/wg-03.png",
      "/beispielrechnungen/wg/wg-05.png",
      "/beispielrechnungen/wg/wg-06.png",
      "/beispielrechnungen/wg/wg-01.png",
    ],
    afaGrundlage: "348.994 €",
    entlastungJahr: 14952,
    entlastungMonat: 1246,
    schere: { kaufpreis: 413500, darlehen: 413500, getilgt10: 74468 },
    renditeEk: 22743,
    renditeSparrate: 200,
  },
};

/** Form der Rechnungstexte in `beratungspraesentationTexte.ts`. */
type TextPaar = readonly [AnredeWert, AnredeWert];
interface RechnungText {
  name: AnredeWert;
  ort: AnredeWert;
  kurz: AnredeWert;
  adresse: AnredeWert;
  merkmale: readonly AnredeWert[];
  herkunft: AnredeWert;
  bildTitel: readonly AnredeWert[];
  kunde: readonly TextPaar[];
  objekt: readonly TextPaar[];
  zeilen: ReadonlyArray<{ pos: AnredeWert; betrag: AnredeWert }>;
  beitragVorSteuer: AnredeWert;
  afa: ReadonlyArray<{ titel: AnredeWert; text: AnredeWert; betrag: AnredeWert }>;
  steuerZeilen: readonly TextPaar[];
  steuerErgebnis: AnredeWert;
  entlastungLabel: AnredeWert;
  spaeter: { titel: AnredeWert; entlastungMonat: AnredeWert; beitragMonat: AnredeWert; text: AnredeWert };
  hinweis: AnredeWert;
  tilgungText: AnredeWert;
}

/** In jeder Musterrechnung kommt die Miete herein, Rate und Kosten gehen ab. */
const ZEILEN_TON: Array<"gut" | "neutral"> = ["gut", "neutral", "neutral"];

/** Eine Musterrechnung in der aktiven Sprache und Anrede. */
function rechnungIn(id: RechnungId, tx: BeratungTexte, a: (wert: AnredeWert) => string): Musterrechnung {
  const d = RECHNUNG_DATEN[id];
  const t: RechnungText = tx.rechnungen[id];
  const paar = ([links, rechts]: TextPaar): [string, string] => [a(links), a(rechts)];
  return {
    id,
    bild: d.bild,
    name: a(t.name),
    ort: a(t.ort),
    kurz: a(t.kurz),
    adresse: a(t.adresse),
    bilder: d.bildPfade.map((pfad, i) => ({ pfad, titel: a(t.bildTitel[i] ?? "") })),
    merkmale: t.merkmale.map((m) => a(m)),
    herkunft: a(t.herkunft),
    kunde: t.kunde.map(paar),
    objekt: t.objekt.map(paar),
    zeilen: t.zeilen.map((z, i) => ({ pos: a(z.pos), betrag: a(z.betrag), ton: ZEILEN_TON[i] ?? "neutral" })),
    beitragVorSteuer: a(t.beitragVorSteuer),
    afa: t.afa.map((x) => ({ titel: a(x.titel), text: a(x.text), betrag: a(x.betrag) })),
    steuerZeilen: t.steuerZeilen.map(paar),
    steuerErgebnis: a(t.steuerErgebnis),
    entlastungJahr: d.entlastungJahr,
    entlastungMonat: d.entlastungMonat,
    entlastungLabel: a(t.entlastungLabel),
    spaeter: {
      titel: a(t.spaeter.titel),
      entlastungMonat: a(t.spaeter.entlastungMonat),
      beitragMonat: a(t.spaeter.beitragMonat),
      text: a(t.spaeter.text),
    },
    hinweis: a(t.hinweis),
    schere: { ...d.schere, tilgungText: a(t.tilgungText) },
    renditeEk: d.renditeEk,
    renditeSparrate: d.renditeSparrate,
  };
}

/**
 * Die Anteile für den Einschub in Station 05: Wer trägt eigentlich die Rate?
 *
 * Sie werden nicht getippt, sondern aus der Musterrechnung `bestand` oben
 * gerechnet, die zwei Stationen später Zeile für Zeile zu sehen ist. Der
 * Rechenweg steht in `src/lib/rateAnteile.ts`, die Ausgangswerte dort sind
 * dieselben wie hier: 1.400 Euro Kaltmiete, 1.604 Euro Zins und Tilgung, 150
 * Euro nicht umlagefähige Kosten sowie 126 Euro Entlastung und 228 Euro
 * eigener Beitrag ab dem zweiten Jahr. Daraus werden 78, 8 und 14 Prozent.
 *
 * Bezug ist bewusst der sanierte Bestand und nicht die gerade gewählte
 * Musterrechnung: Der Einschub steht vor der Konzeptauswahl, und die
 * Vertriebsakademie schult genau diesen Fall.
 */
const RATE_BESTAND = RATE_EINGANG.bestand;
const RATE_ANTEILE_BESTAND = rateAnteile(RATE_BESTAND);

/**
 * Das echte Bild eines Konzepts fuer die Konzept-Uebersicht und das
 * Konzept-Detail, anstelle der generischen Modellbilder. Bei Bestand und
 * Neubau ist es die Aussenansicht, also das erste Bild der zugehoerigen
 * Musterrechnung. Bei WG und Co-Living zeigt stattdessen ein Innenbild der
 * Wohnung, weil die Fassade ueber dieses Konzept nichts aussagt.
 */
function aussenbildFuerKonzept(id: KonzeptId): string {
  if (id === "wg") return WG_KONZEPTBILD;
  return RECHNUNG_DATEN[konzeptZuRechnung(id)].bildPfade[0];
}




/** Jedes Konzept hat inzwischen seine eigene Rechnung. */
function konzeptZuRechnung(id: KonzeptId): RechnungId {
  if (id === "kfw") return "neubau";
  if (id === "wg") return "wg";
  return "bestand";
}

/**
 * Reihenfolge der Musterrechnungen in Abschnitt 11. Sie folgt der Reihenfolge
 * der Konzepte aus Abschnitt 08 bis 10, damit beide Abschnitte gleich aufgebaut sind.
 */
const RECHNUNG_REIHENFOLGE: RechnungId[] = KONZEPT_DATEN.map((k) => konzeptZuRechnung(k.id));

/* ══════════════════════════════════════════════════════════════
   Station 04: der Weg als Bahn
   ══════════════════════════════════════════════════════════════ */

/**
 * Der Prozessweg als durchgehende Bahn.
 *
 * Sechs nummerierte Kreise hängen an einer Linie, die sich beim Hereinscrollen
 * von links nach rechts zieht. Darunter steht je eine angedeutete Oberfläche.
 * Schritt eins pulsiert, weil genau dort das Gespräch gerade steht. Das
 * beantwortet die stille Frage jedes Kunden, ohne dass jemand sie stellen muss:
 * Worauf lasse ich mich hier eigentlich ein und wie weit bin ich schon?
 */
function ProzessBahn({ zahlen }: { zahlen?: UebernommeneZahlen }) {
  const [bahnRef, bahnSichtbar] = useImBild<HTMLDivElement>(0.12);
  const { tx, a } = useTexte();
  const prozess = tx.prozess.schritte.map((s, i) => ({
    titel: a(s.titel),
    text: a(s.text),
    marke: a(s.marke),
    mockup: PROZESS_MOCKUPS[i],
  }));

  return (
    <Station
      nummer={4}
      id="prozess"
      titel={mitAkzent(a(tx.prozess.titel))}
      vorspann={a(tx.prozess.vorspann)}
      dunkel
      weit
    >
      <div ref={bahnRef} className="relative">
        {/* Die Linie, an der alles hängt. Sie zieht sich erst, wenn der
            Abschnitt im Bild ist, sonst verpufft der Effekt oberhalb. */}
        <div
          className="hidden lg:block absolute left-[8.333%] right-[8.333%] top-[31px] h-[2px] rounded-full beratung-linie"
          data-sichtbar={bahnSichtbar}
          style={{
            background:
              "linear-gradient(90deg, rgba(124,190,255,0.25) 0%, #4DA3FF 18%, #4DA3FF 82%, rgba(124,190,255,0.25) 100%)",
            boxShadow: "0 0 24px rgba(0,122,255,0.55)",
          }}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-5">
          {prozess.map((s, i) => {
            // Nur Schritt 1 leuchtet: Das Erstgespraech ist dieser Termin.
            // Die Selbstauskunft (Schritt 2) ist "Naechster Schritt" und
            // bleibt bewusst unhervorgehoben, denn ob der Partner sie gleich
            // im Anschluss mit dem Kunden ausfuellt oder dafuer einen
            // eigenen Termin vereinbart, entscheidet er selbst.
            const jetztDran = i === 0;
            return (
              <div
                key={s.titel}
                // h-full und mt-auto weiter unten sorgen dafür, dass alle
                // Mockups auf einer Linie stehen, auch wenn die Beschreibungen
                // unterschiedlich viele Zeilen brauchen.
                //
                // Die Schritte fliegen nacheinander von links auf die Linie,
                // in dieselbe Richtung, in die sich die Linie zieht. Dadurch
                // liest sich der Abschnitt wie ein Weg, der gerade entsteht,
                // und nicht wie sechs Kacheln, die auftauchen.
                className="relative h-full flex flex-col transition-all duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  transitionDelay: `${300 + i * 170}ms`,
                  opacity: bahnSichtbar ? 1 : 0,
                  transform: bahnSichtbar ? "none" : "translate3d(-56px, 26px, 0) scale(0.9)",
                }}
              >
                <div className="flex justify-center">
                  <span
                    className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold tabular-nums ${
                      jetztDran ? "beratung-puls" : ""
                    }`}
                    style={
                      jetztDran
                        ? {
                            background: "linear-gradient(180deg, #5CB0FF 0%, #0A6EDB 100%)",
                            color: "#FFFFFF",
                          }
                        : {
                            backgroundColor: "#0E131C",
                            color: "#7CBEFF",
                            border: "1px solid rgba(124,190,255,0.32)",
                          }
                    }
                  >
                    {i + 1}
                  </span>
                </div>

                <p
                  className="mt-5 text-center text-[10px] tracking-[0.18em] uppercase font-semibold"
                  style={{ color: jetztDran ? "#7CBEFF" : "rgba(246,248,252,0.4)" }}
                >
                  {s.marke}
                </p>
                <p className="mt-1.5 text-center text-sm font-semibold">{s.titel}</p>
                <p
                  className="mt-2 text-center text-xs leading-relaxed"
                  style={{ color: "rgba(246,248,252,0.55)" }}
                >
                  {s.text}
                </p>

                <div className="mt-5 pt-1 lg:mt-auto">
                  <Mockup art={s.mockup} zahlen={zahlen} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Reveal delay={200}>
        <div
          className="mt-14 rounded-3xl p-8 md:p-12 text-center relative overflow-hidden beratung-schimmer"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,122,255,0.22) 0%, rgba(255,255,255,0.05) 60%, rgba(0,122,255,0.1) 100%)",
            border: "1px solid rgba(124,190,255,0.28)",
          }}
        >
          <p className="text-xl md:text-3xl font-light leading-snug tracking-tight">
            {a(tx.prozess.fazit)}{" "}
            <span className="font-semibold" style={{ color: "#7CBEFF" }}>
              {a(tx.prozess.fazitBetont)}
            </span>
          </p>
          <p className="mt-4 text-sm md:text-base" style={{ color: "rgba(246,248,252,0.6)" }}>
            {a(tx.prozess.grundlage)}
          </p>
        </div>
      </Reveal>
    </Station>
  );
}

/* ══════════════════════════════════════════════════════════════
   Seite
   ══════════════════════════════════════════════════════════════ */

export default function BeratungspraesentationHV() {
  const [navOffen, setNavOffen] = useState(false);
  // Bewusst ohne Vorauswahl: Frueher startete die Seite mit "bestand", und die
  // Kachel Sanierter Bestand war beim Oeffnen blau eingerahmt, als waere sie
  // schon gewaehlt. Alle drei Konzepte sollen neutral nebeneinander stehen,
  // bis der Berater eines anklickt.
  const [konzept, setKonzept] = useState<KonzeptId | null>(null);
  const [fortschritt, setFortschritt] = useState(0);
  const [suchParameter] = useSearchParams();
  const navigate = useNavigate();
  // Der Berater, der die Präsentation gerade zeigt.
  const { user, authUser } = useUser();

  const kundenName = suchParameter.get("kunde")?.trim() || "";
  // Trainer-Modus: nur wenn die Präsentation bewusst mit ?trainer=1 geöffnet
  // wurde, etwa aus der Vertriebsakademie. Vor Kunden bleibt er unsichtbar.
  const trainerVerfuegbar = suchParameter.get("trainer") === "1";
  const [trainerAn, setTrainerAn] = useState(trainerVerfuegbar);
  const kundeId = suchParameter.get("kundeId")?.trim() || "";
  const investmentId = suchParameter.get("investmentId")?.trim() || "";
  const hatKundenKontext = !!(kundeId && investmentId);

  // Anrede aus dem Erstgesprächsskript übernehmen: Wurde dort Du gewählt,
  // spricht die gesamte Präsentation den Kunden per Du an. Gleiche Quelle
  // und gleicher Rückfall wie bei der Übernahme der Antworten weiter unten,
  // zuerst das Skript am Investment, dann das ältere am Kontakt. Ohne
  // Kundenkontext oder gespeicherte Wahl gilt die Du-Form.
  const anrede: Anrede = (() => {
    if (!kundeId) return "du";
    const kontakt = getKontaktById(kundeId);
    const ausInvestment = investmentId
      ? getInvestmentMetaField<Record<string, unknown> | null>(investmentId, "setterSkript", null)
      : null;
    return anredeAusSkript(ausInvestment ?? kontakt?.setterSkript);
  })();

  // Sprache der Präsentation, je Nutzer gemerkt. Kennung ist die Anmeldung,
  // ersatzweise die MORE-ID aus dem Profil.
  // Mit Kunden startet sie in dessen Sprache aus dem Profil (Plan Kundensprache, K10).
  const { sprache: profilSprache } = useKundenSprache(kundeId || null);
  const [sprache, setSprache] = usePraesentationsSprache(authUser?.id || user.moreId, kundeId ? profilSprache : null);
  const tx = BERATUNG_TEXTE[sprache];
  const a = (wert: AnredeWert) => inAnrede(wert, anrede);
  const fmt = formatierer(sprache);

  // Die im Gespräch mitgeschriebenen Antworten. Sie hängen am Kunden, damit
  // beim zweiten Termin noch dasteht, was beim ersten gesagt wurde.
  const [antworten, setAntworten] = usePersistedState<Record<string, string>>(
    `beratung-antworten-${kundeId || "ohne-kunde"}`,
    {},
  );
  /**
   * Felder, die aus dem Erstgespräch übernommen wurden.
   *
   * Sie tragen unter dem Eingabefeld einen Hinweis, damit im Termin sofort
   * klar ist, woher ein Wert stammt und dass er nicht geraten ist. Sobald der
   * Berater den Wert ändert, verschwindet der Hinweis: Dann ist es seine
   * Zahl, nicht mehr die aus dem Erstgespräch.
   */
  const [uebernommeneFelder, setUebernommeneFelder] = useState<Set<string>>(new Set());
  /** Aktueller Antwortenstand fuer Logik, die nicht bei jedem Tastendruck neu laufen soll. */
  const antwortenRef = useRef<Record<string, string>>({});
  antwortenRef.current = antworten;

  const setzeAntwort = (schluessel: string, wert: string) => {
    setAntworten((v) => ({ ...v, [schluessel]: wert }));
    setUebernommeneFelder((v) => {
      if (!v.has(schluessel)) return v;
      const neu = new Set(v);
      neu.delete(schluessel);
      return neu;
    });
  };

  // Zahlen und Antworten aus dem Erstgespräch übernehmen.
  //
  // Bisher hat der Berater Einkommen, Eigenkapital und Monatsbeitrag vor dem
  // Kunden neu eingetippt, obwohl sie im Erstgespräch längst erfasst wurden.
  // Das kostet Zeit im Termin und wirkt unvorbereitet.
  //
  // Gefüllt werden nur LEERE Felder. Was im Termin eingetippt wurde, gewinnt
  // immer, denn dort sitzt der Kunde daneben und korrigiert.
  const datenBereit = useCacheReady(["kontakte", "investments"]);
  const uebernahmeGelaufen = useRef(false);
  /** Zaehlt hoch, sobald sich der Zwischenspeicher meldet, und stoesst einen neuen Versuch an. */
  const [cacheTakt, setCacheTakt] = useState(0);
  useEffect(() => {
    if (uebernahmeGelaufen.current) return;
    // Der Zwischenspeicher meldet "geladen", bevor zwingend jede Zeile im
    // Speicher liegt. Deshalb wird bei jeder Meldung erneut nachgesehen,
    // statt es bei einem einzigen Versuch zu belassen.
    const abmelden = onCacheChange(() => setCacheTakt((n) => n + 1));
    return abmelden;
  }, []);

  /**
   * Sammelt alles, was aus dem Erstgespräch übernommen werden kann.
   *
   * Getrennt vom Schreiben, damit derselbe Bestand sowohl beim Öffnen als auch
   * beim bewussten Nachholen über den Knopf benutzt werden kann.
   */
  const holeAusErstgespraech = (): Record<string, string> | null => {
    if (!kundeId) return null;
    const kontakt = getKontaktById(kundeId) as Record<string, any> | undefined;
    if (!kontakt) return null;

    // Das Skript hängt normalerweise am Investment. Ältere Kunden haben es
    // noch am Kontakt, deshalb der Rückfall: Sonst sieht das CRM die Daten
    // und die Präsentation nicht.
    const ausInvestment = investmentId
      ? getInvestmentMetaField<Record<string, any> | null>(investmentId, "setterSkript", null)
      : null;
    const skript = ausInvestment ?? (kontakt.setterSkript as Record<string, any> | undefined) ?? null;
    const skriptAntworten: Record<string, string> = skript?.antworten || {};

    const uebernahme: Record<string, string> = {};
    const setze = (schluessel: string, wert?: string) => {
      // Angehängte Währungszeichen entfernen, das Feld führt sein eigenes.
      const sauber = (wert || "").replace(/€/g, "").trim();
      if (sauber) uebernahme[schluessel] = sauber;
    };

    // Schritt 12 des Erstgesprächs, synchron mit der Qualifizierungsfrage
    setze("einnahmen", kontakt.qualEinkommen);
    // Schritt 7. Bewusst nur das Gesamt-Eigenkapital: Das Erstgespräch fragt,
    // was nachweisbar ist, nicht was liquide verfügbar ist. Den liquiden Teil
    // trägt der Berater im Termin ein, er steuert den Finanzierungsrahmen.
    setze("eigenkapitalGesamt", kontakt.qualEigenkapital);
    // Schritt 8
    setze("beitrag", skriptAntworten.investitionMonat);
    // Schritt 6
    setze("erfahrung", skriptAntworten.erfahrung);

    // Schritt 14. Die Ziele heißen im Erstgespräch anders als hier, deshalb
    // eine ausdrückliche Zuordnung.
    const zielZuordnung: Record<string, string> = {
      "Altersvorsorge": "Sorgenfrei im Alter durch eine Immobilienrente",
      "Steuern sparen": "Steuervorteile sichern",
      "Vermögensaufbau": "Vermögensaufbau und Werte schaffen",
      "Passives Einkommen": "Finanzielle Freiheit durch passives Einkommen",
      "Inflationsschutz": "Geldanlage und Inflationsschutz",
      "Familie absichern": "Sichere finanzielle Zukunft für die Kinder",
      "Eigenkapitalaufbau": "Kapitalaufbau für das spätere Eigenheim",
      "Frühe Rente": "Sorgenfrei im Alter durch eine Immobilienrente",
      "Unabhängigkeit": "Finanzielle Freiheit durch passives Einkommen",
    };
    const zieleAusSkript: string[] = Array.isArray(skript?.ziele) ? skript!.ziele : [];
    const zugeordnet = [...new Set(zieleAusSkript.map((z) => zielZuordnung[z]).filter(Boolean))].slice(0, 3);
    if (zugeordnet.length) setze("ziel", zugeordnet.join("; "));

    return Object.keys(uebernahme).length ? uebernahme : null;
  };

  /**
   * Schreibt die Übernahme in die Antworten.
   *
   * `ueberschreiben` steuert, ob bereits belegte Felder ersetzt werden. Beim
   * automatischen Lauf bleiben sie stehen, denn dort könnte eine Eingabe aus
   * dem Termin drinstehen. Über den Knopf holt der Berater den Stand bewusst
   * nach und darf dann überschreiben.
   *
   * Welche Schlüssel wirklich gefüllt wurden, wird VOR dem Zustandswechsel
   * bestimmt. Es innerhalb der Aktualisierungsfunktion zu sammeln war ein
   * Fehler: Läuft parallel eine andere Zustandsänderung, ist die Liste beim
   * Auswerten noch leer und der Hinweis erscheint nicht.
   */
  const schreibeUebernahme = (uebernahme: Record<string, string>, ueberschreiben: boolean): string[] => {
    const bestand = antwortenRef.current;
    const gefuellt = Object.keys(uebernahme).filter(
      (k) => ueberschreiben || !(bestand[k] || "").trim(),
    );
    if (!gefuellt.length) return [];
    setAntworten((vorher) => {
      const neu = { ...vorher };
      for (const k of gefuellt) neu[k] = uebernahme[k];
      return neu;
    });
    setUebernommeneFelder((v) => new Set([...v, ...gefuellt]));
    return gefuellt;
  };

  useEffect(() => {
    if (!kundeId || uebernahmeGelaufen.current) return;
    const uebernahme = holeAusErstgespraech();
    // Ohne Kontaktzeile oder ohne Daten nicht als erledigt merken, sonst
    // bleibt es fuer den Rest der Sitzung dabei.
    if (!uebernahme) return;
    uebernahmeGelaufen.current = true;
    schreibeUebernahme(uebernahme, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datenBereit, cacheTakt, kundeId, investmentId]);

  // Welche Musterberechnung Abschnitt 11 bis 13 zeigt. Vorbelegt aus dem Ziel
  // in Abschnitt 03, umschaltbar bleibt es trotzdem.
  const [rechnungManuell, setRechnungManuell] = useState<RechnungId | null>(null);

  // Wertsteigerung für die Immobilienschere. Der Regler ist im Gespräch
  // wichtiger als der Wert: Wer ihn selbst auf null zieht und zeigt, dass es
  // auch dann funktioniert, wirkt glaubwürdiger als jede Prozentangabe.
  const [wertsteigerung, setWertsteigerung] = useState(3);


  // Aus Einnahmen minus Ausgaben wird der Finanzierungsrahmen, mit derselben
  // Formel wie die Karte im Kundenprofil. Läge hier eine andere Zahl als
  // später im Profil, wäre das Gespräch beschädigt.
  const einnahmen = zuZahl(antworten.einnahmen);
  const ausgaben = zuZahl(antworten.ausgaben);
  const eigenkapital = zuZahl(antworten.eigenkapital);
  const hatHaushalt = einnahmen > 0 && ausgaben > 0;
  const rahmen = hatHaushalt
    ? rahmenAusUeberschuss(einnahmen - ausgaben, eigenkapital)
    : null;

  /**
   * Dieselben Zahlen, aufbereitet fuer die Vorschaubilder in Abschnitt 04.
   *
   * Beim Eigenkapital steht bewusst der liquide verfuegbare Teil und nicht das
   * Gesamtvermoegen: Gekauft wird mit dem, was greifbar ist, und genau mit
   * diesem Wert rechnet auch der Finanzierungsrahmen daneben.
   *
   * Ein leeres Feld ergibt undefined, dann bleibt im Mockup der Beispielwert
   * stehen. Eine leere Kachel mitten im Termin waere schlechter als eine mit
   * Platzhalter.
   */
  const alsEuro = (wert: number) => fmt.euro(wert);
  const uebernommeneZahlen: UebernommeneZahlen = {
    nettoeinkommen: einnahmen > 0 ? alsEuro(einnahmen) : undefined,
    ausgaben: ausgaben > 0 ? alsEuro(ausgaben) : undefined,
    eigenkapital: eigenkapital > 0 ? alsEuro(eigenkapital) : undefined,
    rahmen: rahmen ? alsEuro(rahmen.empfRahmen) : undefined,
  };

  // Die Ziele bestimmen das Konzept. Der Kunde wählt nicht das Konzept, er
  // wählt seine Ziele, und wir sagen ihm, was daraus folgt.
  //
  // Bis zu drei Ziele, weil sie so auch in die Selbstauskunft wandern und weil
  // jemand, der sich für alles entscheidet, sich für nichts entschieden hat.
  // Gespeichert werden die Beschriftungen, durch Semikolon getrennt; das alte
  // Feld mit einem einzelnen Ziel bleibt damit lesbar.
  const gewaehlteZiele = (antworten.ziel || "")
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((label) => zielNachLabel(label))
    .filter(Boolean)
    .slice(0, ZIELE_MAX) as NonNullable<ReturnType<typeof zielNachLabel>>[];

  /** Das zuerst gewählte Ziel führt: es bestimmt Konzept und Rechnung. */
  const gewaehltesZiel = gewaehlteZiele[0];

  const toggleZiel = (label: string) => {
    const bestand = (antworten.ziel || "").split(";").map((t) => t.trim()).filter(Boolean);
    const drin = bestand.includes(label);
    const neu = drin
      ? bestand.filter((t) => t !== label)
      : bestand.length >= ZIELE_MAX
      ? bestand
      : [...bestand, label];
    setzeAntwort("ziel", neu.join("; "));
  };

  const konzepte = konzepteIn(tx, a);
  const empfohlenesKonzept = gewaehltesZiel
    ? konzepte.find((k) => k.id === (gewaehltesZiel.konzept as string))
    : undefined;

  // Pflichtfelder in Abschnitt 03. Solange eines leer ist, bleibt es orange
  // umrandet. Das ist kein Schulmeistern, sondern eine Erinnerung für den
  // Berater: Ohne diese vier Angaben rechnet die Präsentation weiter mit dem
  // Musterkunden statt mit dem, der gerade gegenübersitzt.
  const offeneFelder = [
    gewaehlteZiele.length === 0 && "Ziel",
    !(antworten.beitrag || "").trim() && "Monatsbeitrag",
    !hatHaushalt && "Haushaltsrechnung",
  ].filter(Boolean) as string[];

  const rechnungId: RechnungId =
    rechnungManuell ??
    (empfohlenesKonzept ? konzeptZuRechnung(empfohlenesKonzept.id) : "bestand");
  const rechnung = rechnungIn(rechnungId, tx, a);
  const setRechnungId = (id: RechnungId) => setRechnungManuell(id);

  // Die Auswahl in Abschnitt 08 bis 10 steuert zugleich die Musterrechnung in
  // Abschnitt 11, damit beide Abschnitte dasselbe Konzept zeigen.
  const waehleKonzept = (id: KonzeptId) => {
    setKonzept(id);
    setRechnungManuell(konzeptZuRechnung(id));
  };

  // Alles, was in der Rückspiegelung vor Abschnitt 15 auftaucht.
  const beantwortet: Array<{ frage: string; wert: string }> = [
    gewaehlteZiele.length > 0
      ? {
          frage: gewaehlteZiele.length > 1 ? a(tx.rueckblick.ziele) : a(tx.rueckblick.ziel),
          wert: gewaehlteZiele.map((z) => a(tx.zielLabel(z.id))).join(", "),
        }
      : null,
    hatHaushalt && rahmen
      ? {
          frage: a(tx.rueckblick.rahmen),
          wert: a(tx.rueckblick.rund(rahmen.empfRahmen)),
        }
      : null,
    antworten.beitrag
      ? { frage: a(tx.rueckblick.beitrag), wert: antworten.beitrag }
      : null,
    // Das Konzept steht hier bewusst nicht mehr.
    //
    // Es ist keine Angabe des Kunden, sondern unsere Folgerung daraus. In
    // einer Rueckspiegelung, die "Was Sie heute gesagt haben" heisst, hat es
    // deshalb nichts verloren: Der Kunde soll hier seine eigenen Worte
    // wiederfinden, nicht unseren Vorschlag. Gezeigt wird das Konzept
    // weiterhin an seiner eigenen Stelle weiter oben.
    (antworten.erfahrung || "").trim()
      ? { frage: a(tx.rueckblick.erfahrung), wert: antworten.erfahrung }
      : null,
    (antworten.ueberzeugungen || "").trim()
      ? { frage: a(tx.rueckblick.wichtig), wert: antworten.ueberzeugungen }
      : null,
  ].filter(Boolean) as Array<{ frage: string; wert: string }>;

  // Die Erwartungshaltung aus Frage 1 steht bewusst nicht mit im Raster,
  // sondern bekommt in der Rueckspiegelung eine eigene Karte mit
  // Erfuellungs-Check: Der Berater gleicht sie dort aktiv mit dem Kunden ab.
  const erwartungNotiert = (antworten.erwartung || "").trim();

  const { settings } = useUserSettings();
  const beraterEinstellungen = settings as {
    profil?: { telefon?: string; position?: string };
    email?: { signatur?: { email?: string } };
  } | null;
  const beraterProfil = beraterEinstellungen?.profil;
  // Der Kunde sitzt daneben: Hier gehoert die Berufsbezeichnung hin, nicht
  // die technische Rolle, die frueher im Positionsfeld stand.
  const beraterBezeichnung = eigeneBerufsbezeichnung(beraterProfil?.position);
  /**
   * Die Adresse, die der Kunde sehen soll.
   *
   * authUser.email ist die Anmeldeadresse und oft eine private oder alte
   * Adresse. Gezeigt wird deshalb zuerst die Adresse aus den Einstellungen
   * (Profil), dann die der E-Mail-Signatur. Auf die Anmeldeadresse fällt es
   * nur zurück, wenn beides leer ist.
   */
  const beraterEmail = ansprechpartnerAdresse({
    einstellungen: user.email,
    signatur: beraterEinstellungen?.email?.signatur?.email,
    anmeldung: authUser?.email,
  });

  // Dünner Balken oben, der zeigt, wie weit das Gespräch ist.
  useEffect(() => {
    const beiScroll = () => {
      const hoehe = document.documentElement.scrollHeight - window.innerHeight;
      setFortschritt(hoehe > 0 ? Math.min(100, (window.scrollY / hoehe) * 100) : 0);
    };
    beiScroll();
    window.addEventListener("scroll", beiScroll, { passive: true });
    return () => window.removeEventListener("scroll", beiScroll);
  }, []);

  const springeZu = (id: string) => {
    setNavOffen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /**
   * Sprung in die Selbstauskunft.
   *
   * Das im Gespräch gewählte Ziel wandert als Parameter mit und ist dort
   * bereits als eines der drei angehakt. Der Kunde hat es gerade genannt, er
   * soll es nicht zwei Minuten später noch einmal suchen müssen.
   */
  const oeffneSelbstauskunft = () => {
    const p = new URLSearchParams();
    if (hatKundenKontext) {
      p.set("kundeId", kundeId);
      p.set("investmentId", investmentId);
    }
    if (gewaehltesZiel) p.set("ziel", gewaehltesZiel.id);
    const suffix = p.toString() ? `?${p.toString()}` : "";
    navigate(`/selbstauskunft${suffix}`);
  };

  const aktivesKonzept = konzept ? (konzepte.find((k) => k.id === konzept) ?? null) : null;

  return (
    <SpracheContext.Provider value={sprache}>
    <AnredeContext.Provider value={anrede}>
    <TrainerContext.Provider value={trainerVerfuegbar && trainerAn}>
    <div className="min-h-screen bg-background text-foreground font-sans" data-lg="seite" data-praesentation="beratung" lang={sprache}>
      {/* Umschalter für den Trainer-Modus, nur bei ?trainer=1 sichtbar */}
      {trainerVerfuegbar && (
        <button
          type="button"
          data-pdf-exclude
          onClick={() => setTrainerAn((v) => !v)}
          className="fixed bottom-6 left-6 z-[70] inline-flex items-center gap-2 rounded-full border-2 border-dashed border-amber-500/70 bg-amber-50 dark:bg-amber-950/60 px-4 h-11 text-sm font-semibold text-amber-800 dark:text-amber-200 shadow-lg hover:scale-[1.03] transition-transform"
        >
          {trainerAn ? a(tx.kopf.trainerAus) : a(tx.kopf.trainerEin)}
        </button>
      )}
      {/* Fortschritt des Gesprächs */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-[60] bg-transparent">
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${fortschritt}%` }}
        />
      </div>

      {/* ─── Navigation ─── */}
      <header data-lg="kopfscheibe" className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/beratungspraesentation-moreimmo" className="flex items-center gap-3">
            <img src={logo} alt="MOREImmo" className="h-8 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            {NAV_IDS.map((id) => (
              <button
                key={id}
                onClick={() => springeZu(id)}
                className="text-sm text-muted-foreground hover:text-foreground transition"
              >
                {a(tx.kopf.nav[id])}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-1 md:gap-2">
            {/* Sprachwechsel rechts oben. Er sitzt in der mitlaufenden
                Kopfleiste und bleibt so beim Durchblaettern und im
                Vollbild erreichbar. Im Druck und im PDF erscheint er nicht. */}
            <div data-pdf-exclude className="print:hidden">
              <LanguageToggle
                value={sprache}
                onChange={setSprache}
                label={a(tx.sprache.label)}
                className="rounded-full hover:text-primary"
              />
            </div>
            <Button onClick={() => springeZu("schritt")} className="hidden md:inline-flex rounded-full px-5">
              {a(tx.kopf.selbstauskunft)}
            </Button>
            <button className="md:hidden p-2" onClick={() => setNavOffen((v) => !v)} aria-label={a(tx.kopf.menue)}>
              {navOffen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {navOffen && (
          <div className="md:hidden border-t border-border bg-background">
            <div className="px-6 py-4 flex flex-col gap-3">
              {NAV_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => springeZu(id)}
                  className="text-sm text-left text-muted-foreground hover:text-foreground"
                >
                  {a(tx.kopf.nav[id])}
                </button>
              ))}
              <Button onClick={() => springeZu("schritt")} className="mt-2 rounded-full">
                {a(tx.kopf.selbstauskunft)}
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* ─────────────────────────────────────────────
          HERO — unverändert aus der bestehenden Präsentation
         ───────────────────────────────────────────── */}
      <section id="hero" className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-foreground/30" />

        <div className="relative max-w-5xl mx-auto px-6 py-20 md:py-28">
          <div className="rounded-3xl bg-card border border-border shadow-2xl p-6 md:p-12">
            <div className="grid grid-cols-2 gap-3 md:gap-5 mb-10">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted flex items-center justify-center p-8 md:p-12">
                <img src={logo} alt="MOREImmo" className="max-h-full max-w-full object-contain" />
              </div>
              {/* Video statt Standbild. Es laeuft stumm und in Schleife, damit
                  es im Gespraech nebenher laufen kann, ohne zu stoeren. Die
                  Tonspur ist bereits in der Datei entfernt, `muted` ist
                  zusaetzlich noetig, weil Browser sonst nicht automatisch
                  starten. `playsInline` verhindert, dass iOS in den
                  Vollbildmodus wechselt. Das Standbild dient als Vorschau,
                  solange das Video laedt. */}
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
                <video
                  src="/video/beratung-hero.mp4"
                  poster={beratungSzene}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={a(tx.hero.videoLabel)}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-semibold mb-5">
                {a(tx.hero.kicker)}
              </div>
              {kundenName && (
                <div className="mb-6 text-2xl md:text-3xl font-medium text-foreground">
                  {a(tx.hero.willkommen)} <span className="text-primary font-bold">{kundenName}</span>
                </div>
              )}
              <h1 className="text-4xl md:text-6xl font-light leading-[1.1] tracking-tight">
                {a(tx.hero.titel)}
                <br />
                {/* Der Firmenname schreibt sich in Dauerschleife selbst.
                    Die Zeile behält ihre Höhe, weil der Cursor immer steht. */}
                <Schreibmaschine text={a(tx.hero.schreibmaschine)} className="italic font-bold text-primary" />
              </h1>
              <p className="mt-7 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                {a(tx.hero.claim)}
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={() => springeZu("heute")} className="rounded-full px-7 h-12">
                  {a(tx.hero.start)}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => springeZu("konzepte")}
                  className="rounded-full px-7 h-12"
                >
                  {a(tx.hero.konzepte)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Ab hier neu ═══ */}
      <div className="beratung-apple">

        {/* ── 01 Was machen wir heute ──
            Der Druck muss zuerst raus. Wer glaubt, er müsse heute
            unterschreiben, hört nicht zu. */}
        <Station
          nummer={1}
          id="heute"
          titel={mitAkzent(a(tx.heute.titel))}
          vorspann={a(tx.heute.vorspann)}
        >
          <div className="grid md:grid-cols-5 gap-4">
            {tx.heute.agenda.map((w) => a(w)).map((punkt, i) => (
              <Reveal key={punkt} delay={i * 90}>
                {/* Die Nummer sitzt als blasse Ghostzahl in der oberen rechten
                    Ecke und läuft leicht über den Rand hinaus. Sie ordnet die
                    Kacheln, ohne mit dem Text um Aufmerksamkeit zu
                    konkurrieren. Rund fünfzehn Prozent grösser als zuvor. */}
                <div className="relative h-full rounded-2xl border border-border bg-card p-6 pt-11 flex flex-col overflow-hidden">
                  <span
                    aria-hidden="true"
                    className="absolute top-3 right-4 text-[1.925rem] leading-none font-semibold tabular-nums select-none pointer-events-none text-primary/25"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="relative text-sm font-medium leading-snug">{punkt}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={500}>
            <div className="mt-8 rounded-2xl border-2 border-primary/25 bg-primary/5 p-6 md:p-8">
              <p className="text-base md:text-lg leading-relaxed">
                <span className="font-semibold">{a(tx.heute.zielFett)}</span> {a(tx.heute.zielRest)}
              </p>
            </div>
          </Reveal>
        </Station>

        <Ueberleitung
          text={a(tx.ueberleitungen.nichtstun.text)}
          betont={a(tx.ueberleitungen.nichtstun.betont)}
        />

        {/* ── Der Preis des Nichtstuns ──
            Der emotionale Motor der Präsentation, bewusst rein rechnerisch
            gehalten. Ohne diesen Abschnitt gibt es keinen Grund, warum jetzt
            und nicht in zwei Jahren. Die Aussage muss der Kunde selbst
            ziehen, deshalb steht am Ende eine Frage und keine Behauptung. */}
        <Station
          nummer={a(tx.nichtstun.nummer)}
          id="nichtstun"
          titel={mitAkzent(a(tx.nichtstun.titel))}
          vorspann={a(tx.nichtstun.vorspann)}
          dunkel
        >
          <div className="grid lg:grid-cols-3 gap-6">
            <Reveal richtung="links">
              <div className="rounded-2xl border border-border bg-card p-7 h-full">
                <Wallet className="h-6 w-6 mb-4" style={{ color: "rgba(246,248,252,0.55)" }} />
                <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                  {a(tx.nichtstun.heute)}
                </p>
                <p className="text-3xl md:text-4xl font-semibold tracking-tight">
                  <ZahlAnimiert wert={SPARKONTO.start} euro />
                </p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {a(tx.nichtstun.heuteText)}
                </p>
              </div>
            </Reveal>

            <Reveal delay={140}>
              <div className="rounded-2xl border border-border bg-card p-7 h-full">
                <TrendingUp className="h-6 w-6 mb-4" style={{ color: "#7CBEFF" }} />
                <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                  {a(tx.nichtstun.papier)}
                </p>
                <p className="text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: "#7CBEFF" }}>
                  <ZahlAnimiert wert={SPARKONTO.nominal} euro />
                </p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {a(tx.nichtstun.papierText)}
                </p>
              </div>
            </Reveal>

            <Reveal delay={280} richtung="rechts">
              <div
                className="rounded-2xl p-7 h-full"
                style={{
                  backgroundColor: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(248,113,113,0.4)",
                }}
              >
                <ShieldCheck className="h-6 w-6 mb-4" style={{ color: "#FCA5A5" }} />
                <p className="text-sm uppercase tracking-widest font-semibold mb-3" style={{ color: "rgba(252,165,165,0.85)" }}>
                  {a(tx.nichtstun.korb)}
                </p>
                <p className="text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: "#FCA5A5" }}>
                  <ZahlAnimiert wert={SPARKONTO.kaufkraft} euro />
                </p>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "rgba(246,248,252,0.72)" }}>
                  {a(tx.nichtstun.korbText)}
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div
              className="mt-12 rounded-3xl p-8 md:p-12 text-center relative overflow-hidden beratung-schimmer"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,122,255,0.2) 0%, rgba(255,255,255,0.05) 60%, rgba(0,122,255,0.1) 100%)",
                border: "1px solid rgba(124,190,255,0.28)",
              }}
            >
              <p className="text-xl md:text-3xl font-light leading-snug tracking-tight max-w-3xl mx-auto">
                {a(tx.nichtstun.fazit)}{" "}
                <span className="font-semibold" style={{ color: "#7CBEFF" }}>
                  {a(tx.nichtstun.fazitFrage)}
                </span>
              </p>
              <p className="mt-5 text-sm md:text-base max-w-2xl mx-auto" style={{ color: "rgba(246,248,252,0.6)" }}>
                {a(tx.nichtstun.fazitText)}
              </p>
            </div>
          </Reveal>
        </Station>

        <Ueberleitung
          text={a(tx.ueberleitungen.ueberUns.text)}
          betont={a(tx.ueberleitungen.ueberUns.betont)}
        />

        {/* ── 02 Kurzvorstellung ── */}
        <Station
          nummer={2}
          id="ueberuns"
          titel={a(tx.ueberUns.titel)}
          vorspann={a(tx.ueberUns.vorspann)}
          hell
        >
          <div className="grid md:grid-cols-3 gap-4">
            {tx.ueberUns.leistungen.map((l, i) => (
              <Reveal key={i} delay={i * 70}>
                <div className="h-full flex flex-col rounded-2xl border border-border bg-card p-6">
                  <CheckCircle2 className="h-5 w-5 text-primary mb-3" />
                  <p className="font-semibold">{a(l.titel)}</p>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{a(l.text)}</p>
                  {"partner" in l && (
                    <PartnerLogo marke={a(l.partner.marke)} rolle={a(l.partner.rolle)} satz={a(l.partner.satz)} />
                  )}
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={400}>
            <p className="mt-8 text-lg md:text-xl font-light text-center text-foreground/80">
              {a(tx.ueberUns.anspruch)}
            </p>
          </Reveal>

          {/* Der Berater als Person.
              Bis hierhin war von einer Firma die Rede. Ein Kunde vertraut aber
              keiner Firma, sondern dem Menschen, der ihm gegenübersitzt. Die
              Karte zeigt den angemeldeten Nutzer, also den, der die
              Präsentation gerade hält. */}
          <Reveal delay={200} richtung="gross">
            <div className="mt-10 rounded-3xl border-2 border-primary/25 bg-primary/5 p-7 md:p-9">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-24 h-24 rounded-full object-cover shrink-0 ring-2 ring-primary/20"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-primary/20">
                    <User className="w-10 h-10 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-primary font-semibold mb-2">
                    {a(tx.ueberUns.ansprechpartner)}
                  </p>
                  <p className="text-2xl md:text-3xl font-semibold tracking-tight">{user.name}</p>
                  {beraterBezeichnung && (
                    <p className="text-sm text-muted-foreground mt-1">{beraterBezeichnung}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-4 leading-relaxed max-w-xl">
                    {a(tx.ueberUns.fest)} {a(tx.ueberUns.bisNotar)}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center sm:justify-start gap-2.5">
                    {beraterProfil?.telefon && (
                      <a
                        href={`tel:${beraterProfil.telefon}`}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 h-10 text-sm font-medium hover:border-primary/50 transition-colors"
                      >
                        <Phone className="h-4 w-4 text-primary" />
                        {beraterProfil.telefon}
                      </a>
                    )}
                    {beraterEmail && (
                      <a
                        href={`mailto:${beraterEmail}`}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 h-10 text-sm font-medium hover:border-primary/50 transition-colors"
                      >
                        <Mail className="h-4 w-4 text-primary" />
                        {beraterEmail}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </Station>

        <Ueberleitung
          text={a(tx.ueberleitungen.motto.text)}
          betont={a(tx.ueberleitungen.motto.betont)}
        />

        {/* ── 03 Arbeitsweise ── */}
        <Station
          nummer={3}
          id="arbeitsweise"
          titel={mitAkzent(a(tx.arbeitsweise.titel))}
          vorspann={a(tx.arbeitsweise.vorspann)}
        >
          {/* 1. Die Erwartungshaltung. Steht ganz vorn, denn sie betrifft das
                 Gespräch selbst: Wer sagt, was er sich vom heutigen Termin
                 erhofft, gibt den Maßstab vor, an dem er das Gespräch am Ende
                 misst. Genau dieser Abgleich passiert in der Rückspiegelung. */}
          <Reveal>
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
                {a(tx.arbeitsweise.frage(1))}
              </p>
              <label htmlFor="frage-erwartung" className="text-base font-medium block">
                {a(tx.arbeitsweise.erwartungFrage)}
              </label>
              <textarea
                id="frage-erwartung"
                value={antworten.erwartung || ""}
                onChange={(e) => setzeAntwort("erwartung", e.target.value)}
                rows={2}
                placeholder={a(tx.arbeitsweise.erwartungPlatzhalter)}
                className="mt-3 w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/60 resize-none"
              />
            </div>
          </Reveal>

          {/* 2. Die Erfahrung. Steht bewusst weit vorn: Wer schon eine
                 Immobilie hat, braucht ein anderes Gespräch als jemand, der
                 zum ersten Mal darüber nachdenkt. */}
          <Reveal>
            <div className="mt-5 rounded-2xl border-2 border-border bg-card p-6">
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
                {a(tx.arbeitsweise.frage(2))}
              </p>
              <label htmlFor="frage-erfahrung" className="text-base font-medium block">
                {a(tx.arbeitsweise.erfahrungFrage)}
              </label>
              <textarea
                id="frage-erfahrung"
                value={antworten.erfahrung || ""}
                onChange={(e) => setzeAntwort("erfahrung", e.target.value)}
                rows={2}
                placeholder={a(tx.arbeitsweise.erfahrungPlatzhalter)}
                className="mt-3 w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/60 resize-none"
              />
              <UebernahmeHinweis sichtbar={uebernommeneFelder.has("erfahrung")} />
            </div>
          </Reveal>

          <div className="mt-5 grid lg:grid-cols-2 gap-5">
            {/* 3. Die Ziele. Mehrfachauswahl, höchstens drei. Genau diese Liste
                   bestimmt das Konzept und wandert in die
                   Selbstauskunft. Mehr als drei Ziele sind kein Ziel mehr. */}
            <Reveal>
              <div
                className={`h-full rounded-2xl border-2 bg-card p-6 transition-colors ${
                  gewaehlteZiele.length > 0 ? "border-primary/40" : PFLICHT_RAHMEN
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <p className="text-xs uppercase tracking-widest text-primary font-semibold">
                    {a(tx.arbeitsweise.frage(3))}
                  </p>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {a(tx.arbeitsweise.zieleGewaehlt(gewaehlteZiele.length, ZIELE_MAX))}
                  </span>
                </div>
                <p className="text-base font-medium">
                  {a(tx.arbeitsweise.zieleFrage)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {a(tx.arbeitsweise.zieleHinweis(ZIELE_MAX))}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {ANLAGE_ZIELE.map((z) => {
                    const aktiv = gewaehlteZiele.some((g) => g.id === z.id);
                    const voll = !aktiv && gewaehlteZiele.length >= ZIELE_MAX;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => toggleZiel(z.label)}
                        disabled={voll}
                        className={`rounded-full border px-3.5 py-2 text-xs font-medium transition-colors text-left ${
                          aktiv
                            ? "border-primary bg-primary text-primary-foreground"
                            : voll
                            ? "border-border bg-muted/40 text-muted-foreground/50 cursor-not-allowed"
                            : "border-border bg-background hover:border-primary/50"
                        }`}
                      >
                        {aktiv && gewaehlteZiele[0]?.id === z.id && (
                          <span className="mr-1.5 rounded-full bg-primary-foreground/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
                            {a(tx.arbeitsweise.hauptziel)}
                          </span>
                        )}
                        {/* Gespeichert wird weiter die deutsche Beschriftung, sie wandert
                            so in die Selbstauskunft. Übersetzt wird nur die Anzeige. */}
                        {a(tx.zielLabel(z.id))}
                      </button>
                    );
                  })}
                </div>
                <UebernahmeHinweis sichtbar={uebernommeneFelder.has("ziel")} />
              </div>
            </Reveal>

            {/* 4. Der Monatsbeitrag. */}
            <Reveal delay={80}>
              <div
                className={`h-full rounded-2xl border-2 bg-card p-6 transition-colors ${
                  (antworten.beitrag || "").trim() ? "border-primary/40" : PFLICHT_RAHMEN
                }`}
              >
                <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
                  {a(tx.arbeitsweise.frage(4))}
                </p>
                <label htmlFor="frage-beitrag" className="text-base font-medium block">
                  {a(tx.arbeitsweise.beitragFrage)}
                </label>
                <div className="relative mt-3">
                  <input
                    id="frage-beitrag"
                    value={antworten.beitrag || ""}
                    onChange={(e) => setzeAntwort("beitrag", e.target.value)}
                    placeholder={a(tx.arbeitsweise.beitragPlatzhalter)}
                    className={`w-full rounded-xl border-2 bg-background pl-3 pr-9 h-11 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/60 ${
                      (antworten.beitrag || "").trim() ? "border-border" : PFLICHT_RAHMEN
                    }`}
                  />
                  {/* Festes Euro-Zeichen rechts, damit der Kunde nur den Betrag eingibt. */}
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    €
                  </span>
                </div>
                <UebernahmeHinweis sichtbar={uebernommeneFelder.has("beitrag")} />
              </div>
            </Reveal>
          </div>

          {/* 5. Der Finanzierungsrahmen, gerechnet statt geschätzt.
                 Dieselbe Formel wie die Karte im Kundenprofil, damit im
                 Gespräch keine andere Zahl steht als später im System. */}
          <Reveal delay={160}>
            <div
              className={`mt-5 rounded-2xl border-2 bg-card p-6 md:p-8 transition-colors ${
                hatHaushalt ? "border-primary/40" : PFLICHT_RAHMEN
              }`}
            >
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
                {a(tx.arbeitsweise.frage(5))}
              </p>
              <p className="text-base font-medium">{a(tx.arbeitsweise.finanzierungFrage)}</p>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {a(tx.arbeitsweise.finanzierungText)}
              </p>

              {/* Eigenkapital in zwei Werten: Wer 80.000 Euro hat, davon aber
                  nur 25.000 greifbar, kann eben nur mit 25.000 kaufen. Ein
                  einziges Feld hat diesen Unterschied verschluckt. */}
              <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { schluessel: "einnahmen", label: a(tx.arbeitsweise.feldEinnahmen), platzhalter: fmt.euro(4000) },
                  { schluessel: "ausgaben", label: a(tx.arbeitsweise.feldAusgaben), platzhalter: fmt.euro(2400) },
                  {
                    schluessel: "eigenkapitalGesamt",
                    label: a(tx.arbeitsweise.feldEigenkapitalGesamt),
                    platzhalter: fmt.euro(80000),
                  },
                  { schluessel: "eigenkapital", label: a(tx.arbeitsweise.feldEigenkapital), platzhalter: fmt.euro(25000) },
                ].map((f) => (
                  <div key={f.schluessel}>
                    <label
                      htmlFor={`frage-${f.schluessel}`}
                      className="text-xs uppercase tracking-wide text-muted-foreground font-semibold"
                    >
                      {f.label}
                    </label>
                    <input
                      id={`frage-${f.schluessel}`}
                      inputMode="decimal"
                      value={antworten[f.schluessel] || ""}
                      onChange={(e) => setzeAntwort(f.schluessel, e.target.value)}
                      placeholder={f.platzhalter}
                      className={`mt-2 w-full rounded-xl border-2 bg-background px-3 h-11 text-base tabular-nums outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50 ${
                        (antworten[f.schluessel] || "").trim() ? "border-border" : PFLICHT_RAHMEN
                      }`}
                    />
                    <UebernahmeHinweis sichtbar={uebernommeneFelder.has(f.schluessel)} />
                  </div>
                ))}
              </div>

              {rahmen && (
                <div className="mt-6 rounded-2xl border-2 border-primary/25 bg-primary/5 p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="grid sm:grid-cols-3 gap-5 text-center sm:text-left">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                        {a(tx.arbeitsweise.ueberschuss)}
                      </p>
                      <p className="text-2xl font-semibold tabular-nums mt-1.5">
                        {fmt.euro(rahmen.ueberschuss)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                        {a(tx.arbeitsweise.tragbar)}
                      </p>
                      <p className="text-2xl font-semibold tabular-nums mt-1.5">
                        {fmt.euro(rahmen.tragbareRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-primary font-semibold">
                        {a(tx.arbeitsweise.rahmen)}
                      </p>
                      <p className="text-3xl font-semibold tabular-nums mt-1.5 text-primary">
                        {fmt.euro(rahmen.empfRahmen)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-5 leading-relaxed">
                    {a(tx.arbeitsweise.rahmenErklaerung)} {a(tx.arbeitsweise.orientierung)}
                  </p>
                </div>
              )}
            </div>
          </Reveal>

          {/* 6. Was zaehlt. Wer sagt, worauf es ihm ankommt, nennt damit den
                 Massstab, an dem er jedes spaetere Angebot misst. Danach muss
                 niemand mehr raten, was ueberzeugt: Sicherheit, Rendite,
                 Aufwand oder Lage. */}
          <Reveal delay={240}>
            <div className="mt-5 rounded-2xl border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
                {a(tx.arbeitsweise.frage(6))}
              </p>
              <label htmlFor="frage-ueberzeugungen" className="text-base font-medium block">
                {a(tx.arbeitsweise.wichtigFrage)}
              </label>
              <textarea
                id="frage-ueberzeugungen"
                value={antworten.ueberzeugungen || ""}
                onChange={(e) => setzeAntwort("ueberzeugungen", e.target.value)}
                rows={2}
                placeholder={a(tx.arbeitsweise.wichtigPlatzhalter)}
                className="mt-3 w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/60 resize-none"
              />
            </div>
          </Reveal>

        </Station>

        {/* ── 04 Prozess ──
            Der erste dunkle Abschnitt. Hier wird aus einer Aufzählung ein
            sichtbarer Weg: Die Linie zieht sich, die Schritte kommen nach-
            einander, und unter jedem Schritt zeigt eine angedeutete Oberfläche,
            was dort tatsächlich passiert. */}
        <ProzessBahn zahlen={uebernommeneZahlen} />

        <Ueberleitung
          text={a(tx.ueberleitungen.funktion.text)}
          betont={a(tx.ueberleitungen.funktion.betont)}
        />

        {/* ── 05 Funktionsweise ── */}
        <Station
          nummer={5}
          id="funktion"
          titel={mitAkzent(a(tx.funktion.titel))}
          vorspann={a(tx.funktion.vorspann)}
        >
          <div className="grid md:grid-cols-2 gap-5">
            {tx.funktion.bausteine.map((b, i) => {
              const Icon = BAUSTEIN_ICONS[i];
              return (
              <Reveal key={i} delay={i * 110}>
                <div className="h-full rounded-2xl border border-border bg-card p-7">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-xl font-semibold">{a(b.titel)}</p>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{a(b.text)}</p>
                </div>
              </Reveal>
              );
            })}
          </div>

          {/* Wer trägt die Rate: der eigentliche Aha-Moment.
              Dunkel eingesetzt, damit dieser eine Gedanke aus dem hellen
              Abschnitt heraussticht. */}
          <Reveal delay={400} richtung="gross">
            <div
              className="beratung-dark mt-12 rounded-3xl p-8 md:p-12 relative overflow-hidden"
              style={{ backgroundColor: "#080A0F" }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 55% 70% at 78% 20%, rgba(0,122,255,0.3) 0%, transparent 65%)",
                }}
              />
              {/* Die Aufteilung ist hier die Botschaft, deshalb steht die
                  Frage oben und die drei Anteile stehen gross darunter. Aus
                  einigen Metern Entfernung sollen zuerst die Prozentzahlen
                  gelesen werden, nicht der Fliesstext. */}
              <div className="relative">
                <div className="max-w-3xl">
                  <p
                    className="text-[11px] uppercase tracking-[0.28em] font-semibold mb-4"
                    style={{ color: "#7CBEFF" }}
                  >
                    {a(tx.funktion.kicker)}
                  </p>
                  <p className="text-2xl md:text-4xl font-semibold tracking-tight leading-[1.12]">
                    {a(tx.funktion.frage)}
                  </p>
                  <p
                    className="mt-5 text-sm md:text-base leading-relaxed"
                    style={{ color: "rgba(246,248,252,0.68)" }}
                  >
                    {a(tx.funktion.text)} {a(tx.funktion.textZusatz)}
                  </p>
                </div>

                <div className="mt-10 md:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
                  {[
                    {
                      label: a(tx.funktion.mieter),
                      wert: fmt.prozent(RATE_ANTEILE_BESTAND.mieter, 0),
                      text: a(tx.funktion.mieterText),
                      hg: "linear-gradient(160deg, rgba(0,122,255,0.34), rgba(0,122,255,0.10))",
                      rand: "rgba(124,190,255,0.38)",
                      wertFarbe: "#fff",
                      labelFarbe: "#7CBEFF",
                    },
                    {
                      label: a(tx.funktion.finanzamt),
                      wert: fmt.prozent(RATE_ANTEILE_BESTAND.finanzamt, 0),
                      text: a(tx.funktion.finanzamtText),
                      hg: "rgba(0,122,255,0.14)",
                      rand: "rgba(255,255,255,0.14)",
                      wertFarbe: "#DCEBFF",
                      labelFarbe: "#7CBEFF",
                    },
                    {
                      label: a(tx.funktion.selbst),
                      wert: fmt.prozent(RATE_ANTEILE_BESTAND.kunde, 0),
                      text: a(tx.funktion.selbstText),
                      hg: "rgba(255,255,255,0.06)",
                      rand: "rgba(255,255,255,0.14)",
                      wertFarbe: "rgba(246,248,252,0.9)",
                      labelFarbe: "rgba(246,248,252,0.6)",
                    },
                  ].map((a) => (
                    <div
                      key={a.label}
                      className="rounded-2xl p-6 md:p-8"
                      style={{ background: a.hg, border: `1px solid ${a.rand}` }}
                    >
                      <p
                        className="text-[11px] uppercase tracking-[0.24em] font-semibold"
                        style={{ color: a.labelFarbe }}
                      >
                        {a.label}
                      </p>
                      <p
                        className="mt-3 text-6xl md:text-7xl font-semibold tracking-tight tabular-nums leading-none"
                        style={{ color: a.wertFarbe }}
                      >
                        {a.wert}
                      </p>
                      <p
                        className="mt-4 text-sm leading-relaxed"
                        style={{ color: "rgba(246,248,252,0.62)" }}
                      >
                        {a.text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Derselbe Sachverhalt noch einmal als ein Balken, damit das
                    Groessenverhaeltnis auf einen Blick sichtbar wird. */}
                <div
                  className="mt-5 h-3 rounded-full overflow-hidden flex"
                  style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  {[
                    {
                      label: "Mieter",
                      breite: `${RATE_ANTEILE_BESTAND.mieter}%`,
                      hg: "linear-gradient(180deg,#5CB0FF,#0A6EDB)",
                    },
                    {
                      label: "Finanzamt",
                      breite: `${RATE_ANTEILE_BESTAND.finanzamt}%`,
                      hg: "rgba(0,122,255,0.32)",
                    },
                    {
                      label: "Kunde",
                      breite: `${RATE_ANTEILE_BESTAND.kunde}%`,
                      hg: "rgba(255,255,255,0.09)",
                    },
                  ].map((t) => (
                    <div key={t.label} className="h-full" style={{ width: t.breite, background: t.hg }} />
                  ))}
                </div>

                {/* Der Rechenweg gehört auf die Folie, nicht in eine Fussnote.
                    Wer die drei Zahlen begründen kann, hält jeder Nachfrage
                    stand, und der Kunde rechnet in Station 10 ohnehin mit. */}
                <p
                  className="mt-5 text-xs md:text-sm leading-relaxed"
                  style={{ color: "rgba(246,248,252,0.55)" }}
                >
                  {a(
                    tx.funktion.rechenweg(
                      RATE_BESTAND.kaltmiete,
                      RATE_BESTAND.nichtUmlagefaehig,
                      RATE_BESTAND.rate,
                      RATE_BESTAND.entlastungAbJahrZwei,
                      RATE_BESTAND.eigenbeitragAbJahrZwei,
                    ),
                  )}{" "}
                  {a(tx.funktion.dauerzustand)}
                </p>
              </div>
            </div>
          </Reveal>
        </Station>

        <Ueberleitung
          text={a(tx.ueberleitungen.vergleich.text)}
          betont={a(tx.ueberleitungen.vergleich.betont)}
        />

        {/* ── 06 Vergleich ── */}
        <Station
          nummer={6}
          id="vergleich"
          titel={mitAkzent(a(tx.vergleich.titel))}
          vorspann={a(tx.vergleich.vorspann)}
          hell
        >
          <Reveal>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {/* Die Immobilienspalte ist durchgehend hervorgehoben, damit
                        der Blick weiß, wohin er gehört. Die anderen Spalten
                        bleiben dabei voll lesbar, sonst wäre der Vergleich
                        nicht mehr ehrlich. */}
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left font-semibold p-4">{a(tx.vergleich.kopf[0])}</th>
                      <th
                        className="text-left font-semibold p-4"
                        style={{ color: "#0A6EDB", backgroundColor: "rgba(10,110,219,0.09)" }}
                      >
                        {a(tx.vergleich.kopf[1])}
                      </th>
                      <th className="text-left font-semibold p-4">{a(tx.vergleich.kopf[2])}</th>
                      <th className="text-left font-semibold p-4">{a(tx.vergleich.kopf[3])}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.vergleich.zeilen.map((zeile) => zeile.map((w) => a(w))).map(([eigenschaft, immo, aktien, tagesgeld], i) => (
                      <tr key={i} className={i % 2 ? "bg-muted/20" : ""}>
                        <td className="p-4 font-medium">{eigenschaft}</td>
                        <td
                          className="p-4 font-semibold"
                          style={{ color: "#0A6EDB", backgroundColor: "rgba(10,110,219,0.05)" }}
                        >
                          {immo}
                        </td>
                        <td className="p-4 text-muted-foreground">{aktien}</td>
                        <td className="p-4 text-muted-foreground">{tagesgeld}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <div className="mt-8 grid md:grid-cols-2 gap-5">
              <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-7">
                <Scale className="h-5 w-5 text-primary mb-3" />
                <p className="font-semibold text-lg">{a(tx.vergleich.unterschied)}</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {a(tx.vergleich.unterschiedText)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-7">
                <ShieldCheck className="h-5 w-5 text-muted-foreground mb-3" />
                <p className="font-semibold text-lg">{a(tx.vergleich.einschraenkung)}</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {a(tx.vergleich.einschraenkungText)}
                </p>
              </div>
            </div>
          </Reveal>
        </Station>

        <Ueberleitung
          text={a(tx.ueberleitungen.konzepte.text)}
          betont={a(tx.ueberleitungen.konzepte.betont)}
        />

        {/* ── 07 Konzepte Überblick ── */}
        <Station
          nummer={7}
          id="konzepte"
          titel={a(tx.konzepte.titel)}
          vorspann={a(tx.konzepte.vorspann)}
        >
          <div className="grid md:grid-cols-3 gap-5">
            {konzepte.map((k, i) => (
              <Reveal key={k.id} delay={i * 120}>
                <button
                  onClick={() => {
                    waehleKonzept(k.id);
                    document.getElementById("konzept-detail")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                  className={`w-full text-left rounded-2xl overflow-hidden border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                    konzept === k.id ? "border-primary shadow-lg" : "border-border"
                  }`}
                >
                  <div className="aspect-[16/10] overflow-hidden bg-muted">
                    <img
                      src={aussenbildFuerKonzept(k.id)}
                      alt={k.name}
                      className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                  </div>
                  <div className="p-6 bg-card">
                    <p className="text-xl font-semibold">{k.name}</p>
                    <p className="text-sm text-muted-foreground mt-1.5">{k.kurz}</p>
                    <p className="text-xs text-primary font-medium mt-4 flex items-center gap-1">
                      {a(tx.konzepte.ansehen)} <ArrowRight className="h-3 w-3" />
                    </p>
                  </div>
                </button>
              </Reveal>
            ))}
          </div>
        </Station>

        {/* ── 08 bis 10 Konzepte im Detail, als Reiter ── */}
        {aktivesKonzept && (
        <section id="konzept-detail" className="py-20 md:py-28 px-6 scroll-mt-20 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="flex items-baseline gap-4 mb-3">
                <span className="text-sm font-semibold tabular-nums text-primary tracking-widest">
                  {String(aktivesKonzept.nummer).padStart(2, "0")}
                </span>
                <div style={{ flex: "1 1 auto", alignSelf: "center", minWidth: "48px", height: 0, borderTop: "1px solid hsl(var(--border))" }} />
              </div>
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.08]">
                {a(tx.konzepte.konzeptTitel(aktivesKonzept.name))}
              </h2>
            </Reveal>

            {/* Reiter */}
            <Reveal delay={100}>
              <div className="mt-8 inline-flex rounded-full border border-border bg-card p-1 gap-1 flex-wrap">
                {konzepte.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => waehleKonzept(k.id)}
                    className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                      konzept === k.id
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            </Reveal>

            {/* Inhalt des gewählten Konzepts. Der Schlüssel sorgt dafür, dass
                die Einblendung bei jedem Wechsel neu läuft. */}
            <div key={aktivesKonzept.id} className="mt-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="grid lg:grid-cols-5 gap-8">
                <div className="lg:col-span-2">
                  <div className="rounded-2xl overflow-hidden aspect-[4/3] bg-muted">
                    <img
                      src={aussenbildFuerKonzept(aktivesKonzept.id)}
                      alt={aktivesKonzept.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="mt-5 text-base leading-relaxed">{aktivesKonzept.einleitung}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{aktivesKonzept.fokus}</p>
                </div>

                <div className="lg:col-span-3 space-y-6">
                  <div className="rounded-2xl border border-border bg-card p-7">
                    <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold mb-4">
                      {a(tx.konzepte.vorteile)}
                    </p>
                    <ul className="space-y-2.5">
                      {aktivesKonzept.vorteile.map((v) => (
                        <li key={v} className="flex items-start gap-3 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{v}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {aktivesKonzept.bloecke && (
                    <div className="grid sm:grid-cols-2 gap-5">
                      {aktivesKonzept.bloecke.map((b) => (
                        <div key={b.titel} className="rounded-2xl border border-border bg-card p-6">
                          <p className="font-semibold text-lg">{b.titel}</p>
                          <ul className="mt-3 space-y-2">
                            {b.punkte.map((p) => (
                              <li key={p} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className="text-primary mt-1">·</span>
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-7">
                    <p className="text-sm uppercase tracking-widest text-primary font-semibold mb-4">
                      {a(tx.konzepte.geeignetFuer)}
                    </p>
                    <ul className="space-y-2.5">
                      {aktivesKonzept.geeignet.map((g) => (
                        <li key={g} className="flex items-start gap-3 text-sm">
                          <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        <Ueberleitung
          text={a(tx.ueberleitungen.beispiel.text)}
          betont={a(tx.ueberleitungen.beispiel.betont)}
        />

        {/* ── 11 bis 13: die Musterberechnung ──
            Alle drei Stationen zeigen dasselbe Konzept. Umgeschaltet wird
            oben in Abschnitt 11, die Wahl gilt dann durchgehend. Vorbelegt
            ist das Konzept, das sich aus dem Ziel in Abschnitt 03 ergibt:
            Der Kunde bekommt die Rechnung, die zu seiner eigenen Antwort
            passt, ohne dass jemand umschalten muss. */}
        <Station
          nummer={9}
          id="beispielkunde"
          titel={mitAkzent(a(tx.beispiel.titel))}
          vorspann={a(tx.beispiel.vorspann)}
          hell
        >
          <Reveal>
            <div className="inline-flex rounded-full border border-border bg-card p-1 gap-1 flex-wrap">
              {RECHNUNG_REIHENFOLGE.map((id) => rechnungIn(id, tx, a)).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRechnungId(r.id)}
                  className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                    rechnungId === r.id
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="block">{r.name}</span>
                  <span className="block text-[10px] font-normal opacity-70">{r.ort}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {rechnung.kurz}
              {empfohlenesKonzept && rechnungId === konzeptZuRechnung(empfohlenesKonzept.id)
                ? a(tx.beispiel.passtZuZiel)
                : ""}
            </p>
          </Reveal>

          {/* Die Wohnung, über die geredet wird. Bilder und Adresse aus den
              Objektunterlagen, manuell durchgeklickt, damit der Berater die
              Erzählung führt und nicht die Galerie. */}
          <div key={`bilder-${rechnungId}`} className="mt-8 animate-in fade-in duration-500">
            <ObjektSlideshow
              bilder={rechnung.bilder}
              adresse={rechnung.adresse}
              name={rechnung.name}
              beschriftung={{ zurueck: a(tx.galerie.zurueck), weiter: a(tx.galerie.weiter) }}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {rechnung.merkmale.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  {m}
                </span>
              ))}
            </div>
          </div>

          <div key={rechnungId} className="mt-10 grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="rounded-2xl border border-border bg-card p-7 h-full">
              <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold mb-5">
                {a(tx.beispiel.situation)}
              </p>
              <div className="space-y-3">
                {rechnung.kunde.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2.5">
                    <span className="text-sm text-muted-foreground">{k}</span>
                    <span className="text-sm font-medium text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-7 h-full">
              <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold mb-5">
                {a(tx.beispiel.wohnung)}
              </p>
              <div className="space-y-3">
                {rechnung.objekt.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2.5">
                    <span className="text-sm text-muted-foreground">{k}</span>
                    <span className="text-sm font-medium text-right tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Reveal delay={200}>
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 max-w-3xl">
              <p className="text-xs font-semibold text-foreground mb-1.5">{a(tx.beispiel.herkunftTitel)}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{rechnung.herkunft}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                {a(tx.beispiel.mechanik)}
              </p>
            </div>
          </Reveal>
        </Station>

        {/* ── 12 Die Rechnung ── */}
        <Station
          nummer={10}
          id="rechnung"
          titel={mitAkzent(a(tx.rechnung.titel))}
          vorspann={a(tx.rechnung.vorspann(rechnung.name, rechnung.schere.tilgungText))}
          dunkel
        >
          <div key={rechnungId} className="grid lg:grid-cols-5 gap-8 animate-in fade-in duration-500">
            <Reveal className="lg:col-span-3" richtung="links">
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {rechnung.zeilen.map((z) => (
                  <div key={z.pos} className="flex items-center justify-between gap-4 px-6 py-5 border-b border-border">
                    <span className="text-sm md:text-base">{z.pos}</span>
                    <span
                      className="text-base md:text-lg font-semibold tabular-nums"
                      style={{ color: z.ton === "gut" ? "#4ADE80" : undefined }}
                    >
                      {z.betrag}
                    </span>
                  </div>
                ))}
                <div
                  className="flex items-center justify-between gap-4 px-6 py-6"
                  style={{ backgroundColor: "rgba(0,122,255,0.16)" }}
                >
                  <span className="text-base md:text-lg font-semibold">
                    {a(tx.rechnung.beitragVorSteuer)}
                  </span>
                  <span
                    className="text-2xl md:text-3xl font-semibold tabular-nums"
                    style={{ color: "#7CBEFF" }}
                  >
                    {rechnung.beitragVorSteuer}
                  </span>
                </div>
              </div>
            </Reveal>

            <Reveal delay={200} className="lg:col-span-2" richtung="rechts">
              <div className="space-y-5 h-full">
                <Kennzahl
                  wert={<ZahlAnimiert wert={rechnung.entlastungMonat} euro />}
                  label={a(tx.rechnung.entlastungProMonat)}
                  hinweis={rechnung.entlastungLabel}
                  ton="gut"
                />
                <Kennzahl
                  wert={<ZahlAnimiert wert={Math.round(rechnung.schere.getilgt10 / 10 / 12)} euro />}
                  label={a(tx.rechnung.tilgungProMonat)}
                  hinweis={a(tx.rechnung.tilgungHinweis)}
                />
                <div
                  className="rounded-2xl p-6"
                  style={{
                    backgroundColor: "rgba(0,122,255,0.14)",
                    border: "1px solid rgba(124,190,255,0.34)",
                  }}
                >
                  <p className="text-sm leading-relaxed">
                    <span className="font-semibold" style={{ color: "#7CBEFF" }}>
                      {rechnung.spaeter.titel}:
                    </span>{" "}
                    {rechnung.spaeter.text}
                  </p>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Die Immobilienschere. */}
          <Reveal delay={260}>
            <div
              className="mt-14 rounded-3xl p-7 md:p-12"
              style={{
                backgroundColor: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Immobilienschere
                kaufpreis={rechnung.schere.kaufpreis}
                getilgt10={rechnung.schere.getilgt10}
                wertsteigerung={wertsteigerung}
                onWertsteigerung={setWertsteigerung}
                tilgungText={rechnung.schere.tilgungText}
              />
            </div>
          </Reveal>
        </Station>

        {/* ── 11 Rendite-Vergleich ──
            Direkt hinter der Immobilienschere: Dieselbe Vermoegenszahl,
            uebersetzt in die Sparplan-Rendite, die dasselbe leisten muesste.
            Reagiert live auf denselben Wertsteigerungs-Regler wie die Schere. */}
        <Station
          nummer={11}
          id="rendite"
          titel={mitAkzent(a(tx.rendite.titel))}
          vorspann={a(tx.rendite.vorspann)}
        >
          <div key={rechnungId} className="animate-in fade-in duration-500">
            <RenditeModul
              ekEinmal={rechnung.renditeEk}
              sparrate={rechnung.renditeSparrate}
              kaufpreis={rechnung.schere.kaufpreis}
              getilgt10={rechnung.schere.getilgt10}
              wertsteigerung={wertsteigerung}
            />
          </div>
        </Station>

        <Ueberleitung
          text={a(tx.ueberleitungen.steuer.text)}
          betont={a(tx.ueberleitungen.steuer.betont)}
        />

        {/* ── 12 Steuerwirkung ── */}
        <Station
          nummer={12}
          id="steuer"
          titel={mitAkzent(a(tx.steuer.titel))}
          vorspann={a(tx.steuer.vorspann)}
          hell
        >
          <div key={rechnungId} className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-500">
            {rechnung.afa.map((a, i) => (
              <Reveal key={a.titel} delay={i * 90}>
                <div className="h-full rounded-2xl border border-border bg-card p-6">
                  <Landmark className="h-5 w-5 text-primary mb-3" />
                  <p className="font-semibold leading-snug">{a.titel}</p>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{a.text}</p>
                  <p className="text-sm font-semibold mt-3 tabular-nums text-primary">{a.betrag}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={380}>
            {/* Zwei gleich hohe Spalten nebeneinander, der ehrliche Hinweis
                darunter über die volle Breite. Auf schmalen Bildschirmen
                bricht alles untereinander um. */}
            <div className="mt-10 grid lg:grid-cols-5 gap-8 items-stretch">
              <div className="lg:col-span-3 h-full flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
                <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold px-7 pt-7">
                  {a(tx.steuer.vuv)}
                </p>
                <div className="mt-5">
                  {rechnung.steuerZeilen.map(([pos, betrag]) => (
                    <div
                      key={pos}
                      className="flex items-center justify-between gap-4 px-7 py-4 border-b border-border/60"
                    >
                      <span className="text-sm">{pos}</span>
                      <span className="text-sm font-semibold tabular-nums">{betrag}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 px-7 py-5 bg-primary/5">
                    <span className="text-base font-semibold">{a(tx.steuer.ergebnis)}</span>
                    <span className="text-xl font-semibold tabular-nums text-primary">
                      {rechnung.steuerErgebnis}
                    </span>
                  </div>
                </div>
                <div className="mt-auto px-7 py-6 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    {a(tx.steuer.beiGrenzsteuersatz)}
                  </p>
                  <p className="text-3xl md:text-4xl font-semibold tracking-tight text-primary mt-1.5">
                    <ZahlAnimiert wert={rechnung.entlastungJahr} euro /> {a(tx.steuer.proJahr)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {a(tx.steuer.alsoRund(rechnung.entlastungMonat, rechnung.entlastungLabel))}
                  </p>
                </div>
              </div>

              <div
                className="beratung-dark lg:col-span-2 h-full rounded-2xl p-7 md:p-9 relative overflow-hidden"
                style={{ backgroundColor: "#080A0F" }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(ellipse 70% 70% at 80% 0%, rgba(0,122,255,0.32) 0%, transparent 65%)",
                  }}
                />
                <div className="relative h-full flex flex-col">
                  <Banknote className="h-6 w-6 mb-4" style={{ color: "#7CBEFF" }} />
                  <p className="text-xl md:text-2xl font-semibold tracking-tight">
                    {rechnung.spaeter.titel}
                  </p>

                  {/* Die beiden Kernwerte gross, damit sie neben der hellen
                      Tabelle bestehen und aus der Entfernung lesbar sind. */}
                  <div className="mt-8 space-y-6">
                    <div>
                      <p
                        className="text-[11px] uppercase tracking-[0.24em] font-semibold"
                        style={{ color: "rgba(246,248,252,0.55)" }}
                      >
                        {a(tx.steuer.entlastung)}
                      </p>
                      <p className="mt-2 text-4xl md:text-5xl font-semibold tracking-tight tabular-nums leading-none">
                        {rechnung.spaeter.entlastungMonat}
                      </p>
                      <p className="mt-2 text-sm" style={{ color: "rgba(246,248,252,0.55)" }}>
                        {a(tx.steuer.proMonat)}
                      </p>
                    </div>
                    <div className="h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
                    <div>
                      <p
                        className="text-[11px] uppercase tracking-[0.24em] font-semibold"
                        style={{ color: "rgba(246,248,252,0.55)" }}
                      >
                        {a(tx.steuer.beitrag)}
                      </p>
                      <p
                        className="mt-2 text-4xl md:text-5xl font-semibold tracking-tight tabular-nums leading-none"
                        style={{ color: "#7CBEFF" }}
                      >
                        {rechnung.spaeter.beitragMonat}
                      </p>
                      <p className="mt-2 text-sm" style={{ color: "rgba(246,248,252,0.55)" }}>
                        {a(tx.steuer.proMonat)}
                      </p>
                    </div>
                  </div>

                  <p
                    className="text-sm mt-auto pt-8 leading-relaxed"
                    style={{ color: "rgba(246,248,252,0.72)" }}
                  >
                    {rechnung.spaeter.text}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-7 md:p-8">
              <p className="text-lg font-semibold">{a(tx.steuer.ehrlich)}</p>
              <p className="text-sm mt-2.5 leading-relaxed text-muted-foreground">
                {rechnung.hinweis}
              </p>
              <p className="text-sm mt-3 leading-relaxed text-muted-foreground">
                {a(tx.steuer.haftung)}
              </p>
            </div>
          </Reveal>
        </Station>

        {/* ── Ausgewählte Referenzen ──
            Dieselbe Komponente wie in der allgemeinen Präsentation, damit
            beide Präsentationen dieselben Projekte zeigen und eine Änderung
            an den Bildern nur an einer Stelle passieren muss.

            Sie steht hinter der Steuerwirkung: Der Kunde hat die Rechnung
            komplett gesehen, Zahl für Zahl, und fragt sich an genau dieser
            Stelle, wie das in der Wirklichkeit aussieht. Der Abschnitt trägt
            keine Nummer, damit die Stationsnummern und der Verweis auf
            Schritt 17 stimmig bleiben. */}
        <section id="referenzen" className="bg-muted/30 scroll-mt-20">
          {/* Kein automatischer Bildwechsel: Im Gespraech bestimmt der Berater
              das Tempo und blaettert selbst weiter. */}
          <BeforeAfterSection autoWechsel={false} sprache={sprache} />
        </section>

        <Ueberleitung
          text={a(tx.ueberleitungen.referenzen.text)}
          betont={a(tx.ueberleitungen.referenzen.betont)}
        />

        {/* ── 13 Prüfkatalog ── */}
        <Station
          nummer={13}
          id="pruefung"
          titel={mitAkzent(a(tx.pruefung.titel))}
          vorspann={a(tx.pruefung.vorspann)}
        >
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
            {tx.pruefung.katalog.map((w) => a(w)).map((p, i) => (
              <Reveal key={i} delay={i * 55}>
                <div className="h-full rounded-xl border border-border bg-card p-5">
                  <span className="text-xs font-semibold text-primary tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm mt-2 leading-snug">{p}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Station>

        <Ueberleitung
          text={a(tx.ueberleitungen.rueckblick.text)}
          betont={a(tx.ueberleitungen.rueckblick.betont)}
        />

        {/* ── Rückspiegelung ──
            Die Antworten aus Abschnitt 03 kommen hier gebündelt zurück. Wenn
            ein Mensch seine eigenen Worte hört, ist die Schlussfolgerung
            seine und nicht die des Verkäufers. Der Abschnitt erscheint nur,
            wenn tatsächlich etwas mitgeschrieben wurde. Eine leere
            Zusammenfassung wäre peinlich. */}
        {(beantwortet.length > 0 || erwartungNotiert) && (
          <Station
            nummer={a(tx.rueckblick.nummer)}
            id="rueckblick"
            titel={mitAkzent(a(tx.rueckblick.titel))}
            vorspann={a(tx.rueckblick.vorspann)}
          >
            <div className="grid md:grid-cols-2 gap-4">
              {beantwortet.map((f, i) => (
                <Reveal key={f.frage} delay={i * 80}>
                  <div className="h-full rounded-2xl border border-border bg-card p-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                      {f.frage}
                    </p>
                    <p className="text-lg font-semibold mt-2.5 leading-snug">{f.wert}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Erfuellungs-Check zur Erwartung aus Frage 1. Erst die eigenen
                Worte des Kunden, dann die offene Frage danach: Sagt er hier
                Ja, hat er das Gespraech selbst fuer gelungen erklaert. */}
            {erwartungNotiert && (
              <Reveal delay={240}>
                <div className="mt-4 rounded-2xl border border-border bg-card p-6">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                    {a(tx.rueckblick.erwartung)}
                  </p>
                  <p className="text-lg font-semibold mt-2.5 leading-snug">{erwartungNotiert}</p>
                  <div className="mt-4 pt-4 border-t border-border flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                    <p className="text-base font-medium text-primary leading-snug">
                      {a(tx.rueckblick.erfuellt)}
                    </p>
                  </div>
                </div>
              </Reveal>
            )}

            <Reveal delay={320}>
              <div className="mt-10 rounded-2xl border-2 border-primary/25 bg-primary/5 p-7 md:p-9">
                <p className="text-base md:text-lg leading-relaxed">
                  {a(tx.rueckblick.zahlen1)}{" "}
                  <span className="font-semibold">{a(tx.rueckblick.zahlen2)}</span>{" "}
                  {a(tx.rueckblick.zahlen3)}
                </p>
              </div>
            </Reveal>
          </Station>
        )}

        {/* ── 14 Der nächste Schritt: JETZT die Selbstauskunft ──
            Das ist das Ziel des gesamten Gesprächs. Deshalb steht dieser
            Abschnitt optisch anders da als alles davor. */}
        <section
          id="schritt"
          className="beratung-dark py-24 md:py-36 px-6 scroll-mt-20 relative overflow-hidden"
          style={{ backgroundColor: "#080A0F" }}
        >
          {/* Lichtschein und Raster im Hintergrund, damit der Abschnitt wie
              eine Bühne wirkt und sich vom Rest der Seite absetzt. Dieser
              Abschnitt ist das Ziel des ganzen Gesprächs. */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(0,122,255,0.34) 0%, transparent 62%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.4]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(ellipse 70% 60% at 50% 35%, #000 0%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 35%, #000 0%, transparent 75%)",
            }}
          />
          <div className="max-w-5xl mx-auto relative">
            <Reveal>
              <div className="flex items-baseline gap-4 mb-3">
                <span
                  className="text-sm font-semibold tabular-nums tracking-[0.3em]"
                  style={{ color: "#7CBEFF" }}
                >
                  14
                </span>
                <div
                  style={{
                    flex: "1 1 auto",
                    alignSelf: "center",
                    minWidth: "48px",
                    height: 0,
                    borderTop: "1px solid rgba(124,190,255,0.45)",
                  }}
                />
              </div>
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.08]">
                {mitAkzent(a(tx.schritt.titel))}
              </h2>
              <p
                className="mt-6 text-lg md:text-xl max-w-3xl leading-relaxed"
                style={{ color: "rgba(246,248,252,0.78)" }}
              >
                {a(tx.schritt.text)}
              </p>
              <TrainerSkriptKarte id="schritt" dunkel />
            </Reveal>

            <Reveal delay={160}>
              <div className="mt-10 grid md:grid-cols-2 gap-8 items-start">
                <div>
                  <p className="text-sm uppercase tracking-widest font-semibold mb-4" style={{ color: "rgba(246,248,252,0.5)" }}>
                    {a(tx.schritt.erfassen)}
                  </p>
                  <ul className="space-y-2.5">
                    {tx.schritt.inhalt.map((w) => a(w)).map((s, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm md:text-base">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-1" style={{ color: "#7CBEFF" }} />
                        <span style={{ color: "rgba(246,248,252,0.88)" }}>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  className="rounded-2xl p-7 backdrop-blur"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  <ClipboardList className="h-6 w-6 mb-4" style={{ color: "#7CBEFF" }} />
                  <p className="text-lg font-semibold" style={{ color: "#F6F8FC" }}>{a(tx.schritt.warum)}</p>
                  <p className="text-sm mt-2.5 leading-relaxed" style={{ color: "rgba(246,248,252,0.75)" }}>
                    {a(tx.schritt.warumText)}
                  </p>
                  <button
                    onClick={oeffneSelbstauskunft}
                    className="mt-6 w-full rounded-full h-12 text-base font-semibold inline-flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
                    style={{ backgroundColor: "#087AC7", color: "#FFFFFF" }}
                  >
                    <ClipboardList className="h-5 w-5" />
                    {a(tx.schritt.knopf)}
                  </button>
                  {!hatKundenKontext && (
                    <p className="text-xs mt-3 leading-snug" style={{ color: "rgba(246,248,252,0.5)" }}>
                      {a(tx.schritt.kontextHinweis)}
                    </p>
                  )}
                </div>
              </div>
            </Reveal>

            <Reveal delay={320}>
              <div
                className="mt-10 rounded-2xl p-6 md:p-7 flex items-start gap-4"
                style={{
                  backgroundColor: "rgba(0,122,255,0.14)",
                  border: "1px solid rgba(77,163,255,0.45)",
                }}
              >
                <Calculator className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#7CBEFF" }} />
                <p className="text-sm md:text-base leading-relaxed" style={{ color: "rgba(246,248,252,0.92)" }}>
                  {a(tx.schritt.grundlage)}
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 15 Nächster Termin ── */}
        <Station
          nummer={15}
          id="termin"
          titel={mitAkzent(a(tx.termin.titel))}
          vorspann={a(tx.termin.vorspann)}
        >
          <div className="grid md:grid-cols-3 gap-4">
            {tx.termin.punkte.map((w) => a(w)).map((t, i) => (
              <Reveal key={i} delay={i * 90}>
                <div className="h-full rounded-2xl border border-border bg-card p-6">
                  <span className="w-9 h-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center tabular-nums text-sm mb-4">
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium leading-snug">{t}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Zwischentext vor der Schlusskarte: Der naechste Termin wird als
              vorbereitetes Ergebnis angekuendigt, nicht als Katalogtermin.
              Das baut Vorfreude auf, ohne etwas zu versprechen, was die
              Selbstauskunft nicht tragen kann. */}
          <Reveal delay={540}>
            <p className="mt-10 text-base md:text-lg text-muted-foreground max-w-3xl leading-relaxed">
              {a(tx.termin.katalog)}
            </p>
          </Reveal>

          <Reveal delay={560}>
            <div className="mt-12 rounded-3xl bg-card border border-border p-8 md:p-12 text-center">
              <Building2 className="h-8 w-8 text-primary mx-auto mb-5" />
              <p className="text-2xl md:text-3xl font-light leading-snug tracking-tight max-w-3xl mx-auto">
                {a(tx.termin.entscheiden)}{" "}
                <span className="font-semibold">{a(tx.termin.weiter)}</span>
              </p>
              <p className="mt-5 text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                {a(tx.termin.beides)}
              </p>
              <Button
                size="lg"
                onClick={oeffneSelbstauskunft}
                className="mt-8 rounded-full px-8 h-12"
              >
                {a(tx.termin.knopf)}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Reveal>
        </Station>

        {/* Fuß */}
        <footer className="px-6 py-14 border-t border-border">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5">
            <img src={logo} alt="MOREImmo" className="h-7 w-auto opacity-70" />
            <p className="text-xs text-muted-foreground text-center md:text-right max-w-2xl leading-relaxed">
              {a(tx.fuss.haftung)}
            </p>
          </div>
        </footer>
      </div>

      {/* Sprungknopf zum Ziel des Gesprächs, immer erreichbar */}
      <button
        onClick={() => springeZu("schritt")}
        className="fixed bottom-6 right-6 z-40 rounded-full bg-primary text-primary-foreground shadow-2xl px-5 h-12 flex items-center gap-2 text-sm font-medium hover:scale-105 transition-transform"
      >
        <ChevronDown className="h-4 w-4" />
        {a(tx.kopf.sprung)}
      </button>
    </div>
    </TrainerContext.Provider>
    </AnredeContext.Provider>
    </SpracheContext.Provider>
  );
}
