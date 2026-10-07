import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Star, MessageSquareHeart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  kundeId: string;
}

interface Bewertung {
  id: string;
  bewertung_gesamt: number;
  bewertung_berater: number | null;
  bewertung_prozess: number | null;
  bewertung_objekt: number | null;
  kommentar: string | null;
  weiterempfehlung: boolean;
  erstellt_am: string;
}

/**
 * D1 (Admin/VP-Sicht): Zeigt vorhandene Kundenbewertungen im Kundenprofil.
 * Stille Karte wenn keine Bewertung vorhanden.
 */
export function BewertungenAnzeige({ kundeId }: Props) {
  const [bewertungen, setBewertungen] = useState<Bewertung[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kundeId) return;
    supabase
      .from("kunden_bewertungen")
      .select("*")
      .eq("kunde_id", kundeId)
      .order("erstellt_am", { ascending: false })
      .then(({ data }) => {
        setBewertungen((data || []) as Bewertung[]);
        setLoading(false);
      });
  }, [kundeId]);

  if (loading || bewertungen.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquareHeart className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm">Kundenbewertungen ({bewertungen.length})</h3>
      </div>
      <div className="space-y-3">
        {bewertungen.map((b) => (
          <div key={b.id} className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`h-4 w-4 ${n <= b.bewertung_gesamt ? "fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" : "text-muted-foreground/30"}`} />
                ))}
                <span className="text-xs text-muted-foreground ml-2">{b.bewertung_gesamt}/5</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(b.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
              {b.bewertung_berater !== null && <Detail label="Vertriebspartner" value={b.bewertung_berater} />}
              {b.bewertung_prozess !== null && <Detail label="Prozess" value={b.bewertung_prozess} />}
              {b.bewertung_objekt !== null && <Detail label="Objekt" value={b.bewertung_objekt} />}
            </div>
            {b.kommentar && (
              <p className="text-xs text-muted-foreground italic mt-2 border-l-2 border-primary/30 pl-2">"{b.kommentar}"</p>
            )}
            {b.weiterempfehlung && (
              <p className="text-[10px] text-[hsl(var(--success))] font-semibold mt-2">✓ Würde uns weiterempfehlen</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}/5</span>
    </div>
  );
}
