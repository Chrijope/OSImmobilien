import { Check, X, Minus } from "lucide-react";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "./mikroseiteAbschlussTexte";

type Cell = "yes" | "no" | "partial";

/**
 * Die Bewertung je Zeile: klassischer Makler, Banking-Berater, OS Immobilien.
 * Die Beschriftungen stehen in `mikroseiteAbschlussTexte.ts` (`vergleich.zeilen`),
 * Zeile für Zeile in derselben Reihenfolge.
 */
const VERGLEICH_WERTE: [Cell, Cell, Cell][] = [
  ["partial", "no", "yes"],
  ["no", "no", "yes"],
  ["no", "partial", "yes"],
  ["no", "yes", "yes"],
  ["no", "no", "yes"],
  ["partial", "no", "yes"],
  ["no", "partial", "yes"],
  ["yes", "no", "yes"],
];

const Icon = ({ v }: { v: Cell }) => {
  if (v === "yes")
    return (
      <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 border border-primary/30">
        <Check className="w-4 h-4 text-primary" strokeWidth={2.5} />
      </div>
    );
  if (v === "partial")
    return (
      <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(220,15%,94%)] border border-[hsl(220,15%,85%)]">
        <Minus className="w-4 h-4 text-[hsl(220,10%,45%)]" strokeWidth={2.5} />
      </div>
    );
  return (
    <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(220,15%,96%)] border border-[hsl(220,15%,88%)]">
      <X className="w-4 h-4 text-[hsl(220,10%,60%)]" strokeWidth={2.5} />
    </div>
  );
};

const ComparisonSection = () => {
  const t = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE).vergleich;
  const columns = t.spalten;
  const rows = VERGLEICH_WERTE.map((values, i) => ({ label: t.zeilen[i], values }));

  return (
    <section className="py-20 md:py-32 lp-section-light relative overflow-hidden">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl relative">
        <div className="text-center mb-14 md:mb-20 max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-4 h-1 rounded-full bg-primary/40" />
          </div>
          <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">
            {t.oberzeile}
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-6 tracking-tight">
            {t.titel}
            <span className="lp-text-gradient">{t.titelAkzent}</span>
          </h2>
          <p className="text-base md:text-lg text-[hsl(220,15%,30%)] leading-relaxed">
            {t.einleitung}
          </p>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-[hsl(220,15%,88%)] bg-white shadow-[0_4px_24px_-12px_hsla(220,30%,20%,0.08)] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] md:grid-cols-[1.6fr_1fr_1fr_1fr] border-b border-[hsl(220,15%,90%)] bg-[hsl(220,20%,98%)]">
            <div className="p-4 md:p-5 text-xs uppercase tracking-[0.2em] text-[hsl(220,10%,46%)]">
              {t.leistung}
            </div>
            {columns.map((c, i) => (
              <div
                key={i}
                className={`p-4 md:p-5 text-center text-xs md:text-sm font-semibold ${
                  i === 2 ? "text-primary bg-primary/[0.08]" : "text-[hsl(220,25%,15%)]"
                }`}
              >
                {c}
                {i === 2 && (
                  <div className="mt-1 text-[10px] font-normal uppercase tracking-[0.18em] text-primary/70">
                    {t.empfohlen}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row, ri) => (
            <div
              key={ri}
              className={`grid grid-cols-[1.4fr_1fr_1fr_1fr] md:grid-cols-[1.6fr_1fr_1fr_1fr] items-center transition-colors ${
                ri % 2 === 0 ? "bg-transparent" : "bg-[hsl(220,20%,98%)]"
              } hover:bg-[hsl(220,20%,96%)]`}
            >
              <div className="px-4 md:px-5 py-4 md:py-5 text-sm md:text-[15px] text-[hsl(220,25%,15%)] border-t border-[hsl(220,15%,92%)]">
                {row.label}
              </div>
              {row.values.map((v, ci) => (
                <div
                  key={ci}
                  className={`px-2 py-4 md:py-5 flex items-center justify-center border-t border-[hsl(220,15%,92%)] ${
                    ci === 2 ? "bg-primary/[0.06]" : ""
                  }`}
                >
                  <Icon v={v} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6 text-xs text-[hsl(220,10%,46%)]">
          <span className="flex items-center gap-2"><Icon v="yes" /> {t.vollstaendig}</span>
          <span className="flex items-center gap-2"><Icon v="partial" /> {t.teilweise}</span>
          <span className="flex items-center gap-2"><Icon v="no" /> {t.nichtEnthalten}</span>
        </div>
      </div>
    </section>
  );
};

export default ComparisonSection;