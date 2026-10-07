import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, KeyRound } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

/**
 * Hinweiskarte für Rental-One – externer Verwaltungs-Service für selbst-
 * verwaltete Immobilien. Wird im Kundenportal sowohl bei den Investments
 * über MOREImmo (Hinweis) als auch bei den eigenen Investments angezeigt.
 */
export function RentalOneHinweisCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{t("portal.cards.rental_one.title")}</h3>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wide">
                {t("portal.cards.rental_one.badge")}
              </span>
            </div>
            {!compact && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                <Trans i18nKey="portal.cards.rental_one.text" components={{ strong: <span className="font-medium text-foreground" /> }} />
              </p>
            )}
          </div>
        </div>
        <Button
          asChild
          size="sm"
          className="shrink-0"
        >
          <a
            href="https://www.rental-one.de/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("portal.cards.rental_one.cta")}
            <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </a>
        </Button>
      </div>
    </Card>
  );
}

export default RentalOneHinweisCard;