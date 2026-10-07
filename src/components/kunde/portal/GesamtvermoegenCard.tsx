import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Landmark, PiggyBank, Wallet, AlertCircle } from "lucide-react";
import { Kennzahl } from "@/components/ui/kennzahl";
import { einlage } from "@/components/kunde/portal/einlage";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as ReTooltip, CartesianGrid } from "recharts";
import {
  berechneVermoegen,
  vermoegensVerlauf,
  type PortfolioPosition,
} from "@/lib/portalPortfolio";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText } from "@/lib/sprachFormat";

/**
 * "Mein Gesamtvermoegen" auf der Investments-Einstiegsseite: Immobilienwert
 * (letzter Marktwert je Objekt, sonst Kaufpreis) minus bekannte Restschulden.
 * Fehlende Restschuld-Angaben werden ausgewiesen statt still als 0 gerechnet.
 */
export function GesamtvermoegenCard({ positionen }: { positionen: PortfolioPosition[] }) {
  const { t } = useTranslation();
  const fmt = (v: number) => euroText(v, portalSprache());

  const vermoegen = useMemo(() => berechneVermoegen(positionen), [positionen]);
  const verlauf = useMemo(() => vermoegensVerlauf(positionen), [positionen]);

  if (positionen.length === 0) return null;

  const tiles = [
    { label: t("portal.vermoegen.immobilienwert"), value: fmt(vermoegen.immobilienwert), icon: Wallet },
    { label: t("portal.vermoegen.restschuld"), value: `− ${fmt(vermoegen.restschuldGesamt)}`, icon: Landmark },
    { label: t("portal.vermoegen.netto"), value: fmt(vermoegen.nettoVermoegen), icon: PiggyBank, accent: true },
  ];

  return (
    <div className="portal-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-6 bg-primary rounded" />
        <h2 className="font-bold text-base">{t("portal.vermoegen.title")}</h2>
        <span className="text-xs text-muted-foreground ml-auto">{t("portal.vermoegen.sub")}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {vermoegen.mitMarktwert > 0
          ? t("portal.vermoegen.fussnote_marktwert", { mit: vermoegen.mitMarktwert, gesamt: positionen.length })
          : t("portal.vermoegen.fussnote_kaufpreis")}
      </p>

      {/* Drei nebeneinander erst ab lg: Die Zahl der Kennzahl ist gross und
          passte auf schmalen Bildschirmen nicht in ein Drittel. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {tiles.map((tile) => (
          // Einlage wie alle Innenkacheln; das Nettovermoegen getoent in Blau.
          <div
            key={tile.label}
            {...(tile.accent
              ? { "data-ui": "card", className: "rounded-xl border border-primary/30 bg-primary/5 p-4" }
              : einlage("p-4"))}
          >
            <tile.icon className="h-4 w-4 text-muted-foreground mb-2" />
            <Kennzahl label={tile.label} wert={tile.value} />
          </div>
        ))}
      </div>

      {vermoegen.restschuldFehlt > 0 && (
        <div className="mt-3 flex items-start gap-2 text-xs text-[hsl(var(--warning))]">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {vermoegen.restschuldFehlt === 1
              ? t("portal.vermoegen.restschuld_fehlt_one")
              : t("portal.vermoegen.restschuld_fehlt_other", { count: vermoegen.restschuldFehlt })}
          </span>
        </div>
      )}

      {verlauf.length > 1 && (
        <div className="mt-4">
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <AreaChart data={verlauf} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="vermoegenFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                <XAxis dataKey="datum" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(0, 7)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={42} />
                <ReTooltip formatter={(v: any) => fmt(Number(v))} labelFormatter={(l: any) => String(l)} />
                <Area
                  type="monotone"
                  dataKey="wert"
                  name={t("portal.vermoegen.chart_serie")}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#vermoegenFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t("portal.vermoegen.chart_hinweis")}</p>
        </div>
      )}
    </div>
  );
}
