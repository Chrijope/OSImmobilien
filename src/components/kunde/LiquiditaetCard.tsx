import { Card } from "@/components/ui/card";
import { Wallet, TrendingDown, TrendingUp, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { monatsrateAusAngebot } from "@/lib/finanzierungStore";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText } from "@/lib/sprachFormat";

interface Props {
  invMeta: Record<string, any>;
  finanzierung?: any;
}

/**
 * Liquiditätskarte: Mtl. Cashflow auf Basis echter Daten.
 * Sichtbar nur wenn Miete + Hausgeld + akzeptiertes Finanzierungsangebot vorhanden.
 */
export function LiquiditaetCard({ invMeta, finanzierung }: Props) {
  const { t } = useTranslation();
  const fmt = (v: number) => euroText(v, portalSprache());
  // Negative Werte bringen ihr Minuszeichen aus euroText mit.
  const fmtSigned = (v: number) => (v >= 0 ? "+" : "") + fmt(v);
  const objMeta = (invMeta?.objektSnapshot || {}) as Record<string, any>;
  const mieteJahr = Number(invMeta.jahresnettomiete || objMeta.jahresnettomiete || 0);
  const hausgeldMonat = Number(invMeta.hausgeldMonat || objMeta.hausgeldMonat || 0);
  const angebote: any[] = finanzierung?.angebote || [];
  const explicitAkz = angebote.find((a: any) => a.id === finanzierung?.akzeptiertes_angebot_id);
  const isFreigegeben = (a: any, name: string) =>
    (a?.dokumente || []).some((d: any) => d.name === name && d.status === "signed");
  const implicitAkz = explicitAkz
    ? null
    : angebote.find((a: any) => isFreigegeben(a, "Finanzierungsangebot") && isFreigegeben(a, "Darlehensvertrag"));
  const akz = explicitAkz || implicitAkz;

  // Stille Karte wenn Daten fehlen
  if (!mieteJahr || !akz) return null;

  const mieteMonat = mieteJahr / 12;
  // Aus Summe, Zins und Tilgung gerechnet. Das frueher gelesene Feld
  // `rateMonatlich` gibt es am Angebot nicht, die Rate war deshalb immer 0.
  const rateMonat = Number(akz.rateMonatlich) || monatsrateAusAngebot(akz);
  // Planungs-Karte: Kalkulatorische Puffer sind hier erlaubt, werden aber in
  // der Zeile ausdruecklich als Annahme mit Wert beschriftet (keine stillen
  // Pauschalen). In der Steuerrechnung tauchen sie nicht auf.
  const verwaltungIstPauschale = !(Number(invMeta.verwaltungMonat) > 0);
  const verwaltungMonat = Number(invMeta.verwaltungMonat || 25); // kalkulatorische Pauschale 25 €
  const ruecklageMonat = Math.round((mieteMonat * 0.05) * 100) / 100; // kalkulatorischer Mietausfallpuffer 5 %

  const ausgabenMonat = rateMonat + hausgeldMonat + verwaltungMonat + ruecklageMonat;
  const cashflowMonat = mieteMonat - ausgabenMonat;
  const positiv = cashflowMonat >= 0;

  return (
    <Card className="p-5 border-border/50 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-bold text-sm">{t("portal.cards.liquiditaet.title")}</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/60 ml-auto cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {t("portal.cards.liquiditaet.info")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="space-y-1.5 text-sm">
        <Row label={t("portal.cards.liquiditaet.rent")} value={fmt(mieteMonat)} positive />
        <Row label={t("portal.cards.liquiditaet.loan_rate")} value={`−${fmt(rateMonat)}`} />
        <Row label={t("portal.cards.liquiditaet.hausgeld")} value={`−${fmt(hausgeldMonat)}`} />
        <Row
          label={verwaltungIstPauschale
            ? `${t("portal.cards.liquiditaet.admin")} ${t("portal.cards.liquiditaet.admin_pauschale", "(kalkulatorische Annahme, pauschal 25 €)")}`
            : t("portal.cards.liquiditaet.admin")}
          value={`−${fmt(verwaltungMonat)}`}
        />
        <Row
          label={`${t("portal.cards.liquiditaet.reserve")} ${t("portal.cards.liquiditaet.reserve_puffer", "(kalkulatorische Annahme, 5 % der Miete)")}`}
          value={`−${fmt(ruecklageMonat)}`}
        />
        <div className="h-px bg-border/60 my-2" />
        <div className={`flex justify-between items-center font-bold rounded-lg px-3 py-2.5 ${
          positiv ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" : "bg-destructive/10 text-destructive"
        }`}>
          <span className="flex items-center gap-2">
            {positiv ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {t("portal.cards.liquiditaet.cashflow")}
          </span>
          <span>{fmtSigned(cashflowMonat)} {t("portal.cards.liquiditaet.per_month")}</span>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex justify-between text-xs md:text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={positive ? "text-foreground font-medium" : "text-foreground"}>{value}</span>
    </div>
  );
}
