import { useMemo, useState } from "react";
import { ChevronDown, TrendingUp, TrendingDown, Wallet, Landmark, PiggyBank, Sparkles, Info } from "lucide-react";
import { findSaDataForInvestment, calculateFinanzierbarkeitFromSaData } from "@/lib/finanzierbarkeitUtils";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCountUp } from "@/hooks/use-count-up";
import { einlage } from "@/components/kunde/portal/einlage";
import { useTranslation } from "react-i18next";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText } from "@/lib/sprachFormat";

interface Props {
  /**
   * Das Investment, um das es geht. Ohne Angabe zeigt die Karte bewusst keine
   * Zahlen: Ein Finanzierungsrahmen entsteht aus der Selbstauskunft genau
   * eines Investments, und die eines anderen Kaufs wäre geraten (Regel in
   * saQuelle.ts).
   */
  investmentId?: string | null;
  /** Wird die Selbstauskunft schon als "vom Kunden unterschrieben" gewertet? */
  saSigned?: boolean;
  /** Steht über der Karte, wenn der Kunde mehrere Investments hat. */
  investmentLabel?: string;
  className?: string;
}

function AnimatedEuro({ value, className }: { value: number; className?: string }) {
  // Betrag in der Anzeigesprache: „1.234 €“ oder „€1,234“.
  const { ref, display } = useCountUp({
    end: Math.max(0, Math.round(value || 0)),
    duration: 1400,
    format: (wert) => euroText(wert, portalSprache()),
  });
  return <span ref={ref} className={className}>{display}</span>;
}

/**
 * Concierge-Card „Deine Finanzierbarkeit" für das Kundenportal.
 * Zeigt animierte Grafik im OS Immobilien-Portal-CI (portal-akzent) und
 * eine transparente Aufschlüsselung der Berechnung.
 */
export default function KundeFinanzierbarkeitCard({ investmentId, saSigned = true, investmentLabel, className = "" }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // An den Datencache gekoppelt: Beim ersten Render ist der Cache oft noch
  // leer, die Karte blieb dann dauerhaft im Platzhalter-Zustand hängen.
  // Sobald die Investments (und damit die SA) geladen sind, rechnet sie neu.
  const investmentsVersion = useLiveVersion(["investments"]);
  const calc = useMemo(() => {
    // Ausschliesslich die Selbstauskunft dieses Investments. Vorher suchte die
    // Karte kontaktweit die neueste ueber alle Investments, ein zweiter Kauf
    // zeigte damit die Zahlen des ersten.
    const sa = findSaDataForInvestment(investmentId);
    if (!sa) return null;
    return calculateFinanzierbarkeitFromSaData(sa);
    // investmentsVersion ist bewusst Teil der Abhängigkeiten: Der Wert kommt
    // nicht aus Props, sondern zeigt an, dass der Cache neue Daten hat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investmentId, investmentsVersion]);

  // Ruhiger Platzhalter im gleichen CI, wenn es (noch) nichts zu rechnen gibt.
  if (!saSigned || !calc) {
    return (
      <div className={`portal-card p-6 relative overflow-hidden ${className}`}>
        <ConciergeBackdrop />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--portal-akzent-deep))] font-semibold">
            <Sparkles className="h-3.5 w-3.5" /> {t("portal.cards.finanzierbarkeit.eyebrow")}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-foreground">
            {t("portal.cards.finanzierbarkeit.title")}{investmentLabel ? ` · ${investmentLabel}` : ""}
          </h3>
          <p className="mt-2 text-sm text-foreground/70 leading-relaxed max-w-2xl">
            {investmentId
              ? t("portal.cards.finanzierbarkeit.placeholder_investment")
              : t("portal.cards.finanzierbarkeit.placeholder_none")}
          </p>
        </div>
      </div>
    );
  }

  const { sumEink = 0, sumAusg = 0, ueberschuss = 0, minRahmen = 0, empfRahmen = 0, maxRahmen = 0, eigenkapital = 0, maxDarlehen = 0 } = calc;
  const ratio = sumEink > 0 ? Math.min(1, sumAusg / sumEink) : 0;
  const uePct = Math.max(0, 1 - ratio); // Anteil Überschuss

  // Donut-Geometrie
  const R = 52;
  const C = 2 * Math.PI * R;
  const ausgDash = ratio * C;
  const ueDash = uePct * C;

  return (
    <div className={`portal-card p-6 sm:p-7 relative overflow-hidden ${className}`}>
      <ConciergeBackdrop />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--portal-akzent-deep))] font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> {t("portal.cards.finanzierbarkeit.eyebrow")}
            </div>
            <h3 className="mt-1.5 text-xl font-semibold text-foreground">
              {t("portal.cards.finanzierbarkeit.title")}{investmentLabel ? ` · ${investmentLabel}` : ""}
            </h3>
            <p className="mt-1.5 text-sm text-foreground/70 leading-relaxed max-w-2xl">
              {t("portal.cards.finanzierbarkeit.intro")}
            </p>
          </div>
        </div>

        {/* Hauptbereich: Donut + Rahmen */}
        <div className="grid md:grid-cols-[auto,1fr] gap-6 md:gap-8 items-center">
          {/* Animierter Donut */}
          <div className="relative w-[140px] h-[140px] mx-auto md:mx-0">
            <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
              <defs>
                <linearGradient id="fbAkzentGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--portal-akzent-deep))" />
                  <stop offset="100%" stopColor="hsl(var(--portal-akzent))" />
                </linearGradient>
              </defs>
              {/* Track */}
              <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--portal-akzent-soft))" strokeWidth="14" />
              {/* Ausgaben (dezenter Ring) */}
              <circle
                cx="70" cy="70" r={R} fill="none"
                stroke="hsl(var(--portal-akzent) / 0.35)" strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${ausgDash} ${C}`}
                style={{ transition: "stroke-dasharray 1400ms cubic-bezier(0.22,1,0.36,1)" }}
              />
              {/* Überschuss (Akzentbogen) startet nach Ausgaben */}
              <circle
                cx="70" cy="70" r={R} fill="none"
                stroke="url(#fbAkzentGrad)" strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${ueDash} ${C}`}
                strokeDashoffset={-ausgDash}
                style={{ transition: "stroke-dasharray 1600ms cubic-bezier(0.22,1,0.36,1), stroke-dashoffset 1600ms" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("portal.cards.finanzierbarkeit.surplus")}</span>
              <AnimatedEuro value={ueberschuss} className="text-lg font-semibold text-[hsl(var(--portal-akzent-deep))]" />
              <span className="text-xs text-muted-foreground">{t("portal.cards.finanzierbarkeit.per_month")}</span>
            </div>
          </div>

          {/* Rahmen + Bar */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Landmark className="h-3.5 w-3.5" /> {t("portal.cards.finanzierbarkeit.range")}
              </div>
              {/* Minimal, empfohlen und maximal, genau die Werte, die das
                  Kundenprofil im CRM zu diesem Investment zeigt
                  (calculateFinanzierbarkeitFromSaData). Keine eigene Rechnung. */}
              <FinanzierungsrahmenSpanne min={minRahmen} empfohlen={empfRahmen} max={maxRahmen} />
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><PiggyBank className="h-3.5 w-3.5" /> {t("portal.cards.finanzierbarkeit.equity")} <strong className="text-foreground ml-1"><AnimatedEuro value={eigenkapital} /></strong></span>
                <span>{t("portal.cards.finanzierbarkeit.max_loan")} <strong className="text-foreground"><AnimatedEuro value={maxDarlehen} /></strong></span>
              </div>
            </div>

            {/* Mini-Kacheln Einnahmen/Ausgaben */}
            <div className="grid grid-cols-2 gap-2">
              <MiniTile
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label={t("portal.cards.finanzierbarkeit.income_month")}
                value={sumEink}
                accent="akzent"
              />
              <MiniTile
                icon={<TrendingDown className="h-3.5 w-3.5" />}
                label={t("portal.cards.finanzierbarkeit.expenses_month")}
                value={sumAusg}
              />
            </div>
          </div>
        </div>

        {/* Aufschlüsselung */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-[hsl(var(--portal-akzent-deep))] hover:text-foreground transition-colors"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? t("portal.cards.finanzierbarkeit.hide_breakdown") : t("portal.cards.finanzierbarkeit.show_breakdown")}
        </button>

        {expanded && (
          <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm animate-fade-in">
            <FormelZeile label={t("portal.cards.finanzierbarkeit.income")} value={sumEink} />
            <FormelZeile label={t("portal.cards.finanzierbarkeit.expenses")} value={sumAusg} minus />
            <FormelZeile label={t("portal.cards.finanzierbarkeit.monthly_surplus")} value={ueberschuss} strong />
            <FormelZeile label={t("portal.cards.finanzierbarkeit.formula")} value={maxDarlehen} sub={t("portal.cards.finanzierbarkeit.formula_sub")} />
            <FormelZeile label={t("portal.cards.finanzierbarkeit.equity")} value={eigenkapital} />
            <FormelZeile label={t("portal.cards.finanzierbarkeit.recommended_range")} value={empfRahmen} strong highlight />
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-5 flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>{t("portal.cards.finanzierbarkeit.disclaimer")}</p>
        </div>
      </div>

    </div>
  );
}

/**
 * Minimaler, empfohlener und maximaler Finanzierungsrahmen nebeneinander,
 * der empfohlene in der Mitte hervorgehoben. Gleiche Reihenfolge wie im
 * Kundenprofil (Min., Empfehlung, Max.).
 */
export function FinanzierungsrahmenSpanne({ min, empfohlen, max }: { min: number; empfohlen: number; max: number }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 grid grid-cols-3 items-end gap-2" data-testid="finanzierungsrahmen-spanne">
      <div {...einlage("px-2.5 py-2 text-center")}>
        <div className="text-xs text-muted-foreground">{t("portal.cards.finanzierbarkeit.min")}</div>
        <div className="mt-0.5 text-sm sm:text-base font-semibold text-foreground"><AnimatedEuro value={min} /></div>
      </div>
      <div className="rounded-xl border-2 border-[hsl(var(--portal-akzent-deep)/0.45)] bg-[hsl(var(--portal-akzent-soft))] px-2.5 py-3 text-center shadow-sm">
        <div className="text-xs font-semibold text-[hsl(var(--portal-akzent-deep))]">{t("portal.cards.finanzierbarkeit.recommended")}</div>
        <div className="mt-0.5 text-lg sm:text-2xl font-semibold text-foreground"><AnimatedEuro value={empfohlen} /></div>
      </div>
      <div {...einlage("px-2.5 py-2 text-center")}>
        <div className="text-xs text-muted-foreground">{t("portal.cards.finanzierbarkeit.max")}</div>
        <div className="mt-0.5 text-sm sm:text-base font-semibold text-foreground"><AnimatedEuro value={max} /></div>
      </div>
    </div>
  );
}

function MiniTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: "akzent" }) {
  const istAkzent = accent === "akzent";
  const flaeche = istAkzent
    ? { className: "rounded-xl px-3 py-2.5 border bg-[hsl(var(--portal-akzent-soft))] border-[hsl(var(--portal-akzent-deep)/0.25)]" }
    : einlage("px-3 py-2.5");
  return (
    <div {...flaeche}>
      <div className={`flex items-center gap-1.5 text-xs uppercase tracking-wider ${istAkzent ? "text-[hsl(var(--portal-akzent-deep))]" : "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className="mt-1 text-base font-semibold text-foreground">
        <AnimatedEuro value={value} />
      </div>
    </div>
  );
}

function FormelZeile({ label, value, sub, minus, strong, highlight }: { label: string; value: number; sub?: string; minus?: boolean; strong?: boolean; highlight?: boolean }) {
  return (
    <div {...(highlight
      ? { className: "flex items-baseline justify-between gap-3 rounded-xl px-3 py-2 border bg-[hsl(var(--portal-akzent-soft))] border-[hsl(var(--portal-akzent-deep)/0.3)]" }
      : einlage("flex items-baseline justify-between gap-3 px-3 py-2"))}>
      <div>
        <div className={`${strong ? "font-medium text-foreground" : "text-foreground/70"}`}>{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className={`${strong ? "font-semibold" : ""} ${highlight ? "text-[hsl(var(--portal-akzent-deep))]" : "text-foreground"}`}>
        {minus ? "− " : ""}
        <AnimatedEuro value={value} />
      </div>
    </div>
  );
}

/** Dezenter, animierter Concierge-Hintergrund im Portal-CI */
function ConciergeBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--portal-akzent-soft)) 0%, transparent 70%)",
          animation: "fbFloat 9s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--portal-warm-to) / 0.35) 0%, transparent 70%)",
          animation: "fbFloat 11s ease-in-out infinite reverse",
        }}
      />
      <style>{`
        @keyframes fbFloat {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          50%     { transform: translate3d(0,-8px,0) scale(1.04); }
        }
      `}</style>
    </>
  );
}