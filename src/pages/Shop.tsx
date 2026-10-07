import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import img20 from "@/assets/shop/starter-20.jpg.asset.json";
import img40 from "@/assets/shop/starter-40.jpg.asset.json";
import img60 from "@/assets/shop/starter-60.jpg.asset.json";

type Produkt = {
  id: string;
  titel: string;
  untertitel: string;
  beschreibung: string;
  image: string;
  cta: string;
  ctaLabel: string;
  highlight?: string;
};

const produkte: Produkt[] = [
  {
    id: "starter-20",
    titel: "20× Starter Paket",
    untertitel: "Inkl. 2.000 € Marketing-Budget",
    beschreibung: "20 vorqualifizierte Kontakte inkl. automatischer CRM-Zuweisung und 2.000 € Marketing-Budget für den perfekten Start.",
    image: img20.url,
    cta: "https://copecart.com/products/8d3c3d03/checkout",
    ctaLabel: "Jetzt sichern",
  },
  {
    id: "starter-40",
    titel: "40× Starter Paket",
    untertitel: "Inkl. 4.000 € Marketing-Budget",
    beschreibung: "40 vorqualifizierte Kontakte inkl. automatischer CRM-Zuweisung und 4.000 € Marketing-Budget – für konstanten Lead-Flow.",
    image: img40.url,
    cta: "https://copecart.com/products/47bce593/checkout",
    ctaLabel: "Jetzt sichern",
    highlight: "Beliebt",
  },
  {
    id: "starter-60",
    titel: "60× Starter Paket",
    untertitel: "Inkl. 6.000 € Marketing-Budget",
    beschreibung: "60 vorqualifizierte Kontakte inkl. automatischer CRM-Zuweisung und 6.000 € Marketing-Budget – maximaler Umsatz-Hebel.",
    image: img60.url,
    cta: "https://copecart.com/products/92915ad4/checkout",
    ctaLabel: "Jetzt sichern",
    highlight: "Bestes Preis-Leistung",
  },
];

export default function Shop() {
  return (
    <DashboardLayout>
      <PageHeader
        title="Shop"
        subtitle="MOREImmo Lead-Pakete – vorqualifizierte Kontakte inkl. Marketing-Budget & CRM-Zuweisung"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {produkte.map((p) => (
          <Card key={p.id} className="flex flex-col overflow-hidden hover:shadow-lg transition-shadow">
            <div className="relative aspect-video bg-muted overflow-hidden">
              <img src={p.image} alt={p.titel} className="w-full h-full object-cover" />
              {p.highlight && (
                <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
                  {p.highlight}
                </Badge>
              )}
            </div>
            <CardContent className="flex-1 flex flex-col pt-6 gap-3">
              <div>
                <h3 className="text-lg font-semibold">{p.titel}</h3>
                <p className="text-sm text-muted-foreground">{p.untertitel}</p>
              </div>
              <p className="text-sm text-muted-foreground flex-1">{p.beschreibung}</p>
              <Button asChild className="w-full mt-2">
                <a href={p.cta} target="_blank" rel="noopener noreferrer">
                  {p.ctaLabel}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}