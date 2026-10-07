import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FileSignature, Banknote, BookCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalSprache } from "@/i18n/portalSprache";
import { datumText } from "@/lib/sprachFormat";

interface Props {
  invMeta: Record<string, any>;
}

/** Datum in der Anzeigesprache; Unlesbares bleibt so stehen, wie es gespeichert ist. */
function fmtDatum(iso: string | undefined): string {
  if (!iso) return "";
  return datumText(iso, portalSprache()) || iso;
}

/**
 * B3/B4: Abwicklungs-Status nach Notartermin im Kundenportal.
 * Zeigt synchron zum Fälligkeits-Kästchen im VP-Profil:
 *  1) Kaufpreis fällig (Datum)
 *  2) Kaufpreis gezahlt (Häkchen + Datum)
 *  3) Grundbucheintrag (Datum)
 *
 * Sichtbarkeit: erst nach bestätigtem Notartermin (notarTerminBestaetigt
 * oder notarData.datum gesetzt).
 */
export function AbwicklungStatusCard({ invMeta }: Props) {
  const { t } = useTranslation();
  const notarBestaetigt = invMeta?.notarTerminBestaetigt?.datum
    || invMeta?.notarData?.datum
    || invMeta?.notarTermin;
  if (!notarBestaetigt) return null;

  const kaufpreisFaelligDatum: string = invMeta?.kaufpreisfaelligkeitDatum || "";
  const kaufpreisGezahlt: boolean = !!invMeta?.kaufpreisEingegangen;
  const kaufpreisGezahltDatum: string = invMeta?.kaufpreisEingegangenDatum || "";
  const grundbuchDatum: string = invMeta?.grundbuchDatum || "";
  const grundbuchEingetragen: boolean = !!invMeta?.grundbuchEingetragen;

  const steps = [
    {
      key: "faellig",
      icon: Banknote,
      label: t("portal.cards.abwicklung.step_due"),
      date: kaufpreisFaelligDatum,
      // Nur grün, wenn der Kaufpreis tatsächlich eingegangen ist – ein bloßes
      // Erreichen des Fälligkeitsdatums bedeutet nicht, dass die Zahlung erfolgt ist.
      done: kaufpreisGezahlt,
      hint: kaufpreisFaelligDatum
        ? t("portal.cards.abwicklung.due_on", { date: fmtDatum(kaufpreisFaelligDatum) })
        : t("portal.cards.abwicklung.due_pending"),
    },
    {
      key: "gezahlt",
      icon: CheckCircle2,
      label: t("portal.cards.abwicklung.step_paid"),
      date: kaufpreisGezahltDatum,
      done: kaufpreisGezahlt,
      hint: kaufpreisGezahlt
        ? t("portal.cards.abwicklung.paid_on", { date: fmtDatum(kaufpreisGezahltDatum) })
        : t("portal.cards.abwicklung.paid_pending"),
    },
    {
      key: "grundbuch",
      icon: BookCheck,
      label: t("portal.cards.abwicklung.step_landreg"),
      date: grundbuchDatum,
      // Nur grün, wenn der VP den Grundbucheintrag explizit als erledigt
      // bestätigt hat – nicht automatisch durch ein in der Vergangenheit liegendes
      // (geplantes) Datum.
      done: grundbuchEingetragen,
      hint: grundbuchDatum
        ? t("portal.cards.abwicklung.landreg_on", { date: fmtDatum(grundbuchDatum) })
        : t("portal.cards.abwicklung.landreg_pending"),
    },
  ];

  const erledigt = steps.filter(s => s.done).length;
  const gesamt = steps.length;
  const allDone = erledigt === gesamt;

  return (
    <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileSignature className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-sm">{t("portal.cards.abwicklung.title")}</h3>
            <Badge
              className={
                allDone
                  ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] text-xs border-0"
                  : "bg-primary/10 text-primary text-xs border-0"
              }
            >
              {t("portal.cards.abwicklung.done_count", { done: erledigt, total: gesamt })}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{t("portal.cards.abwicklung.subtitle")}</p>
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className={
                "flex items-center gap-3 p-3 rounded-lg border transition-colors " +
                (s.done
                  ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5"
                  : "border-border/60 bg-card")
              }
            >
              <div
                className={
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 " +
                  (s.done
                    ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                    : "bg-muted text-muted-foreground")
                }
              >
                {s.done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{s.label}</p>
                <p className="text-xs text-muted-foreground truncate">{s.hint}</p>
              </div>
              {!s.done && (
                <div className="text-muted-foreground shrink-0">
                  <Clock className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">{t("portal.cards.abwicklung.footer")}</p>
    </Card>
  );
}
