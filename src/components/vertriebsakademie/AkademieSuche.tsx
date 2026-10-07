import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";
import type { AkademieKapitel } from "@/lib/vertriebsakademieContent";
import { akademieAusschnitt, sucheInAkademie } from "@/lib/vertriebsakademieSuche";

/**
 * Die Suche der Vertriebsakademie, einmal gebaut für zwei Einsatzorte.
 *
 * Auf der Übersicht bekommt sie alle Kapitel und ist damit die Gesamtsuche.
 * In einem geöffneten Kapitel bekommt sie nur dieses eine Kapitel und findet
 * dann auch nur darin. Das ist kein Zufall, sondern der Zweck: Wer mitten in
 * einem Kapitel eine Frage hat, meint dieses Kapitel und will keine Treffer
 * aus den achtzehn anderen.
 *
 * Genau deshalb liegt der Unterschied allein in `quelle`. Eine zweite
 * Komponente mit derselben Aufgabe würde nach der ersten Änderung anders
 * aussehen als die erste.
 */
export function AkademieSuche({
  quelle,
  mitKapitelNamen,
  platzhalter,
  ariaLabel,
  ohneTrefferText,
  onSprung,
}: {
  /** Worin gesucht wird. Alle Kapitel für die Gesamtsuche, eines für die Kapitelsuche. */
  quelle: AkademieKapitel[];
  /** Zeigt vor jedem Treffer, aus welchem Kapitel er stammt. In der Kapitelsuche überflüssig. */
  mitKapitelNamen: boolean;
  platzhalter: string;
  ariaLabel: string;
  ohneTrefferText: string;
  onSprung: (kapitelSlug: string, abschnittId: string) => void;
}) {
  const [frage, setFrage] = useState("");

  // Erst ab zwei Zeichen suchen. Ein einzelner Buchstabe trifft alles und
  // sagt nichts.
  const sucht = frage.trim().length >= 2;
  const treffer = useMemo(
    () => (sucht ? sucheInAkademie(frage, quelle) : []),
    [frage, quelle, sucht],
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={frage}
          onChange={(e) => setFrage(e.target.value)}
          placeholder={platzhalter}
          className="pl-9 pr-9 h-11"
          aria-label={ariaLabel}
        />
        {frage && (
          <button
            type="button"
            onClick={() => setFrage("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Suche leeren"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Leere Eingabe zeigt nichts. Eine Trefferliste mit allem darin ist keine Antwort. */}
      {sucht && (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground mb-4">
            {treffer.length === 0
              ? ohneTrefferText
              : `${treffer.length} ${treffer.length === 1 ? "Stelle" : "Stellen"} gefunden.`}
          </p>
          {treffer.length > 0 && (
            <div className="space-y-2">
              {treffer.slice(0, 12).map((t) => (
                <button
                  key={`${t.kapitel.slug}::${t.abschnitt.id}`}
                  type="button"
                  onClick={() => {
                    setFrage("");
                    onSprung(t.kapitel.slug, t.abschnitt.id);
                  }}
                  className="w-full text-left rounded-lg border border-border px-4 py-3 hover:border-primary hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {mitKapitelNamen && (
                      <Badge variant="outline" className="text-[10px]">
                        Kapitel {t.kapitel.nummer}: {t.kapitel.titel}
                      </Badge>
                    )}
                    <span className="text-sm font-semibold">{t.abschnitt.ueberschrift}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {akademieAusschnitt(t, t.getroffen[0] || "")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
