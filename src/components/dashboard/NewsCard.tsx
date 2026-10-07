import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";

interface NewsItem {
  emoji: string;
  text: string;
  isNew: boolean;
}

const demoNewsItems: NewsItem[] = [
  { emoji: "📢", text: "Neue Inserats-Funktion für Eigentümer live", isNew: true },
  { emoji: "→", text: "Imondu Partner Weekend – 15./16.03. in München", isNew: false },
  { emoji: "→", text: "Neue B2B Mitgliedschafts-Pakete verfügbar", isNew: false },
  { emoji: "→", text: "Provisionsauszahlung Februar abgeschlossen", isNew: false },
];

export function NewsCard() {
  const navigate = useNavigate();
  const { user } = useUser();
  const isTest = user.role === "testaccount";
  const [newsItems, setNewsItems] = useState<NewsItem[]>(isTest ? demoNewsItems : []);

  useEffect(() => {
    if (isTest) return;

    const load = async () => {
      const { data } = await supabase
        .from("news")
        .select("titel, kategorie, veroeffentlicht_am")
        .neq("kategorie", "system")
        .order("veroeffentlicht_am", { ascending: false })
        .limit(6);

      if (data && data.length > 0) {
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        setNewsItems(
          data.map((n, i) => {
            const d = new Date(n.veroeffentlicht_am);
            const isNew = d >= threeDaysAgo;
            return {
              emoji: i === 0 && isNew ? "📢" : "→",
              text: n.titel,
              isNew,
            };
          })
        );
      }
    };
    load();
  }, [isTest]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">          <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">News</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {newsItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Keine News vorhanden.</p>
        ) : (
          <div className="space-y-3">
            {newsItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-sm shrink-0">{item.emoji}</span>
                <p className={`text-sm flex-1 ${item.isNew ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {item.text}
                </p>
                {item.isNew && (
                  <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0 h-4 flex-shrink-0">
                    NEU
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => navigate("/news")}
          className="mt-auto pt-4 text-xs font-medium text-chart-b2b hover:underline text-left"
        >
          Alle News ansehen →
        </button>
      </CardContent>
    </Card>
  );
}
