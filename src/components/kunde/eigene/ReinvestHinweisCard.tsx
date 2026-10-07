import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ReinvestHinweisCard({ monateSeitKauf }: { monateSeitKauf: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-base mb-1">{t("portal.cards.reinvest.title")}</h3>
          <p className="text-sm text-muted-foreground mb-3">{t("portal.cards.reinvest.text", { months: monateSeitKauf })}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate("/kunde/chat")} className="gap-1.5">
              <MessageSquare className="h-4 w-4" />{t("portal.cards.reinvest.cta")}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}