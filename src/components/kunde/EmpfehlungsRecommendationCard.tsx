import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { calculateFinanzierbarkeitFromSaData } from "@/lib/finanzierbarkeitUtils";

interface Props {
  invMeta: Record<string, any>;
  kontaktMeta: Record<string, any>;
  saData: any;
}

/**
 * Hinweis auf ein weiteres Investment, nur bei unterschriebener
 * Selbstauskunft mit positivem Finanzierungsrahmen.
 *
 * Früher stand hier ein „Spielraum“, geschätzt über eine eigene Faustformel
 * (Brutto mal 0,65 mal 110 Monatsnetto, minus Kaufpreis). Die Zahl passte zu
 * keiner anderen Stelle: Das Portal zeigte etwa 368.000 € empfohlenen Rahmen
 * und direkt darunter 2.140.000 € Spielraum. Seit dem 24.09.2026 gibt es im
 * Portal keine eigene Rahmenrechnung mehr. Die Zahlen stehen ausschließlich in
 * der Karte „Deine Finanzierbarkeit“ und kommen aus derselben Berechnung wie
 * im Kundenprofil. Mit der Faustformel ist auch die Liste „passender“ freier
 * Wohnungen entfallen, die daran hing und auf CRM-Seiten verlinkte, die ein
 * Kunde gar nicht öffnen kann.
 */
export function EmpfehlungsRecommendationCard({ invMeta, kontaktMeta, saData }: Props) {
  const { t } = useTranslation();

  const saComplete = !!(invMeta?.saSigned || kontaktMeta?.saSigned);
  if (!saComplete) return null;

  const calc = calculateFinanzierbarkeitFromSaData(saData);
  if (!calc || calc.empfRahmen <= 0) return null;

  return (
    <Card className="p-5 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm mb-1">{t("portal.cards.empfehlung.ready_title")}</h3>
          <p className="text-sm text-muted-foreground mb-3">{t("portal.cards.empfehlung.ready_text")}</p>
          <Button size="sm" variant="outline" asChild>
            <Link to="/kunde/empfehlungen">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> {t("portal.cards.empfehlung.view_program")}
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
