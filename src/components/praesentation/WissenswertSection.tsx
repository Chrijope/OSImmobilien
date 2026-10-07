import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WISSENS_ARTIKEL } from "@/lib/wissenswertArtikel";

export function WissenswertSection() {
  const navigate = useNavigate();

  return (
    <ul className="divide-y divide-border rounded-md border bg-card">
      {WISSENS_ARTIKEL.map((a) => (
        <li key={a.slug}>
          <button
            onClick={() => navigate(`/wissenswert/${a.slug}`)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left group"
          >
            <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                  {a.titel}
                </h4>
                <Badge variant="secondary" className="text-[10px]">{a.kategorie}</Badge>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> {a.lesedauer} Min.
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                {a.zusammenfassung}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}
