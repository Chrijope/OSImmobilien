import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Building2, ExternalLink, Info } from "lucide-react";
import {
  OBJEKTDATEN_BEREICHE,
  objektdatenJeObjekt,
  objektdatenSammelbefunde,
  type BefundRoh,
  type ObjektdatenBereich,
} from "../../../supabase/functions/_shared/nachtpruefung-objektdaten.ts";

/**
 * Die Unstimmigkeiten in den Objektdaten aus einer Nacht, je Objekt.
 *
 * Die Nachtprüfung schreibt je Regel eine Zeile mit allen betroffenen
 * Objekten. Wer etwas korrigieren will, denkt aber vom Objekt her: Was stimmt
 * an diesem Haus nicht? Deshalb hier je Objekt alle Punkte aus allen drei
 * Bereichen, mit Link auf die Objektseite. Die Aufbereitung teilt sich die
 * Seite mit der Morgenmail (`nachtpruefung-objektdaten.ts`), damit beide
 * dasselbe sagen.
 *
 * Neu heißt: Das Objekt stand beim letzten Lauf derselben Regel noch nicht
 * auf der Liste.
 */

type Filter = "alle" | ObjektdatenBereich;

const BEREICH_NAME: Record<ObjektdatenBereich, string> = Object.fromEntries(
  OBJEKTDATEN_BEREICHE.map((b) => [b.bereich, `${b.abteilung} (${b.persona})`]),
) as Record<ObjektdatenBereich, string>;

export function ObjektdatenKarte({ befunde }: { befunde: BefundRoh[] }) {
  const [filter, setFilter] = useState<Filter>("alle");

  const objekte = useMemo(() => objektdatenJeObjekt(befunde), [befunde]);
  const sammel = useMemo(() => objektdatenSammelbefunde(befunde), [befunde]);

  const zaehler = useMemo(
    () =>
      OBJEKTDATEN_BEREICHE.map(({ bereich }) => {
        const mit = objekte.filter((o) => o.punkte.some((p) => p.bereich === bereich));
        return {
          bereich,
          objekte: mit.length,
          neu: mit.reduce((n, o) => n + o.punkte.filter((p) => p.bereich === bereich && p.neu).length, 0),
        };
      }),
    [objekte],
  );

  const sichtbar = useMemo(
    () =>
      filter === "alle"
        ? objekte
        : objekte
            .map((o) => ({ ...o, punkte: o.punkte.filter((p) => p.bereich === filter) }))
            .filter((o) => o.punkte.length > 0),
    [objekte, filter],
  );

  const sammelSichtbar = filter === "alle" ? sammel : sammel.filter((s) => s.bereich === filter);

  // Ohne Objektbefunde (etwa solange die Migration nicht gelaufen ist) bleibt
  // die Karte weg, statt eine leere Überschrift zu zeigen.
  if (objekte.length === 0 && sammel.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" />
          Objektdaten, letzte Nacht
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Unstimmigkeiten je Objekt, zugeordnet zu Objektmanagement, Finanzierung und Aftersales.
          Bei Objekten aus Investagon wird dort korrigiert, sonst überschreibt der nächste Abgleich
          die Änderung.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={filter === "alle" ? "default" : "outline"} onClick={() => setFilter("alle")}>
            Alle ({objekte.length})
          </Button>
          {zaehler.map((z) => (
            <Button
              key={z.bereich}
              size="sm"
              variant={filter === z.bereich ? "default" : "outline"}
              onClick={() => setFilter(z.bereich)}
              title={BEREICH_NAME[z.bereich]}
            >
              {z.bereich}: {z.objekte} {z.objekte === 1 ? "Objekt" : "Objekte"}
              {z.neu > 0 ? `, ${z.neu} neu` : ""}
            </Button>
          ))}
        </div>

        {sammelSichtbar.length > 0 && (
          <ul className="space-y-1">
            {sammelSichtbar.map((s) => (
              <li key={`${s.bereich}-${s.regel}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <Badge variant="outline" className="mr-2">{s.bereich}</Badge>
                  {s.meldung}
                </span>
              </li>
            ))}
          </ul>
        )}

        {sichtbar.length === 0 ? (
          <p className="text-sm text-muted-foreground">In diesem Bereich hat die Prüfung kein Objekt einzeln benannt.</p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {sichtbar.map((o) => {
              const neu = o.punkte.filter((p) => p.neu).length;
              return (
                <AccordionItem key={o.objektId} value={o.objektId}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 flex-wrap items-center gap-2 text-left pr-3">
                      <span className="text-sm font-medium">{o.titel}</span>
                      <Badge variant="outline">
                        {o.punkte.length} {o.punkte.length === 1 ? "Punkt" : "Punkte"}
                      </Badge>
                      {neu > 0 && (
                        <Badge variant="outline" className="border-warning text-warning">
                          {neu} neu
                        </Badge>
                      )}
                      {o.quelle === "investagon" && <Badge variant="secondary">Investagon</Badge>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-3 pl-1">
                      {o.punkte.map((p, i) => (
                        <li key={`${p.pruefung}-${i}`} className="text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" title={BEREICH_NAME[p.bereich]}>{p.bereich}</Badge>
                            <span className="font-medium">{p.regel}</span>
                            {p.neu && (
                              <Badge variant="outline" className="border-warning text-warning">neu</Badge>
                            )}
                          </div>
                          {p.text && <div className="text-muted-foreground mt-0.5">{p.text}</div>}
                          {p.aktion && <div className="text-xs text-muted-foreground mt-0.5">{p.aktion}</div>}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={`/objekte/${encodeURIComponent(o.objektId)}`}
                      className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Zur Objektseite <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
