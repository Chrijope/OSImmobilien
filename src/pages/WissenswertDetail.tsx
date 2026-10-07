import { useParams, useNavigate, Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Clock, Calendar, ExternalLink, BookOpen } from "lucide-react";
import { getArtikelBySlug, getNeighbourArtikel } from "@/lib/wissenswertArtikel";

export default function WissenswertDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  if (!slug) return <Navigate to="/praesentation" replace />;
  const artikel = getArtikelBySlug(slug);
  if (!artikel) return <Navigate to="/praesentation" replace />;

  const { prev, next } = getNeighbourArtikel(slug);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Zurück */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/praesentation")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Zurück zur Übersicht
        </Button>

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{artikel.kategorie}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {artikel.lesedauer} Min. Lesezeit
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {new Date(artikel.veroeffentlicht).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>
          <h1 className="text-3xl font-bold leading-tight">{artikel.titel}</h1>
          <p className="text-base text-muted-foreground leading-relaxed">{artikel.zusammenfassung}</p>
        </div>

        {/* Inhalt */}
        <Card className="p-6 md:p-8">
          <ArtikelInhalt markdown={artikel.inhalt} />
        </Card>

        {/* Quellen */}
        <Card className="p-5 bg-muted/30">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" /> Quellen & weiterführende Informationen
          </h3>
          <ul className="space-y-2">
            {artikel.quellen.map((q, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-muted-foreground">[{i + 1}]</span>
                <a
                  href={q.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 flex-1"
                >
                  {q.titel} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {/* Prev / Next Navigation */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t">
          <div>
            {prev ? (
              <Card
                className="p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group h-full"
                onClick={() => navigate(`/wissenswert/${prev.slug}`)}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Vorheriger Artikel
                </div>
                <div className="text-sm font-semibold group-hover:text-primary leading-tight">
                  {prev.titel}
                </div>
              </Card>
            ) : (
              <div />
            )}
          </div>
          <div>
            {next ? (
              <Card
                className="p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group h-full text-right"
                onClick={() => navigate(`/wissenswert/${next.slug}`)}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1 justify-end">
                  Nächster Artikel <ArrowRight className="h-3 w-3" />
                </div>
                <div className="text-sm font-semibold group-hover:text-primary leading-tight">
                  {next.titel}
                </div>
              </Card>
            ) : (
              <div />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/** Mini-Markdown-Renderer: ##, |Tabellen|, **bold**, Absätze */
function ArtikelInhalt({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n\n+/);

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const trimmed = block.trim();

        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} className="text-xl font-bold mt-6 mb-2 text-primary">
              {trimmed.replace(/^## /, "")}
            </h2>
          );
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="text-base font-semibold mt-4 mb-1">
              {trimmed.replace(/^### /, "")}
            </h3>
          );
        }

        // Tabelle erkennen (mind. 2 Zeilen mit |)
        if (trimmed.includes("|") && trimmed.split("\n").every((l) => l.includes("|"))) {
          const rows = trimmed.split("\n").map((l) =>
            l.split("|").map((c) => c.trim()).filter((c) => c.length > 0),
          );
          // Zweite Zeile ist Trenner (---|---|...)
          const headerRow = rows[0];
          const bodyRows = rows.slice(1).filter((r) => !r.every((c) => /^-+$/.test(c)));
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-primary/30">
                    {headerRow.map((h, j) => (
                      <th key={j} className="text-left py-2 px-3 font-semibold text-primary">
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} className="border-b border-border/50">
                      {row.map((c, ci) => (
                        <td key={ci} className="py-2 px-3">{renderInline(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Liste
        if (/^(\d+\.|-) /.test(trimmed)) {
          const isOrdered = /^\d+\./.test(trimmed);
          const items = trimmed.split("\n").map((l) => l.replace(/^(\d+\.|-) /, ""));
          const ListTag = isOrdered ? "ol" : "ul";
          return (
            <ListTag
              key={i}
              className={`space-y-1.5 ${isOrdered ? "list-decimal" : "list-disc"} pl-5 text-sm leading-relaxed`}
            >
              {items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ListTag>
          );
        }

        // Standard-Absatz
        return (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): JSX.Element {
  // **bold** verarbeiten
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
