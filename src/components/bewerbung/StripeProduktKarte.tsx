import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Copy, ExternalLink, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { StripeProdukt } from "@/lib/stripeProdukte";

interface Props {
  produkt: StripeProdukt;
}

/**
 * Reine Anzeigekarte für ein Stripe-Produkt, z. B. ein Leadpaket im
 * Onboarding-Termin. Der Zahlungslink kommt aus src/lib/stripeProdukte.ts.
 * Ist er dort noch leer, erscheint ein Hinweis statt der Knöpfe.
 */
export function StripeProduktKarte({ produkt }: Props) {
  const hatLink = produkt.zahlungslink.trim() !== "";

  const handleKopieren = () => {
    navigator.clipboard.writeText(produkt.zahlungslink).then(
      () =>
        toast({
          title: "Link kopiert",
          description: "Der Stripe-Zahlungslink liegt in der Zwischenablage.",
        }),
      () =>
        toast({
          title: "Kopieren fehlgeschlagen",
          description: "Bitte den Link manuell aus src/lib/stripeProdukte.ts kopieren.",
          variant: "destructive",
        }),
    );
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-9 w-9 rounded-full flex items-center justify-center bg-blue-100 text-blue-700">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold">{produkt.name}</h3>
          <p className="text-xs text-muted-foreground">
            {produkt.betragLabel}, {produkt.abrechnungLabel.toLowerCase()}.
          </p>
        </div>
      </div>

      <div className="space-y-3 mt-3">
        {hatLink ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleKopieren}>
              <Copy className="h-4 w-4 mr-2" />
              Link kopieren
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={produkt.zahlungslink} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Zahlungsseite öffnen
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Zahlungslink noch nicht hinterlegt
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          Über den Zahlungslink richtet der Partner die monatliche Abbuchung in Stripe selbst ein.
        </p>
      </div>
    </Card>
  );
}
