import { useState } from "react";
import { ChevronDown, X, Filter as FilterIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  BOGEN_LABELS,
  FILTER_STANDARD,
  MAIL_LABELS,
  OHNE_ANGABE,
  SCORE_LABELS,
  ZEITRAUM_LABELS,
  filterChips,
  istFilterGesetzt,
  ohneFeld,
  type BewerberFilter,
  type FilterZaehlung,
} from "@/lib/bewerberFilter";

/**
 * Die Filterleiste über der Bewerberliste, im Eingang und in der Gesamtsicht.
 *
 * ## Warum sie eine eigene Datei ist
 *
 * `BewerberArbeitsplatz.tsx` ist knapp dreitausend Zeilen lang. Jede weitere
 * Leiste im selben JSX macht die Seite unlesbarer, ohne dass irgendetwas
 * dadurch zusammengehörte. Hier steht nur die Anzeige: Was ein Filter
 * bedeutet, steht in `src/lib/bewerberFilter.ts`, und welcher Bewerber
 * angezeigt wird, entscheidet die Seite.
 *
 * ## Warum Zahlen neben jeder Auswahl stehen
 *
 * Ein Filter ohne Vorschau ist ein Ratespiel: Man wählt „Bogen ausgefüllt",
 * die Liste ist leer, und man weiß nicht, ob der Filter falsch war oder es
 * wirklich niemanden gibt. Die Zahl in Klammern beantwortet das vorher. Sie
 * rechnet die übrigen Filter mit, sagt also voraus, was dieser eine Klick
 * ergäbe.
 *
 * ## Warum sie auf dem Handy eingeklappt beginnt
 *
 * Sechs Auswahlfelder untereinander sind auf einem Telefon eine halbe
 * Bildschirmhöhe, bevor der erste Bewerber sichtbar wird. Deshalb steht dort
 * nur ein Knopf „Filter", und die Felder kommen auf Tipp. Die Grenze ist
 * `useIsMobile`, also unter 768 Pixel: die einzige Stelle im Projekt, an der
 * in JavaScript steht, was ein Handy ist. Ein iPad im Hochformat ist genau
 * 768 Pixel breit und behält deshalb die bisherige Ansicht, der Schreibtisch
 * ohnehin.
 *
 * ## Die Falle beim Einklappen, und was dagegen steht
 *
 * Der Filter wird je Nutzer gemerkt (`bewerberFilter_…` in den
 * Nutzereinstellungen, siehe `BewerberArbeitsplatz.tsx`). Er überlebt also
 * Seitenwechsel und den nächsten Tag. Ein eingeklappter Kasten könnte damit
 * verbergen, warum die Liste kurz ist. Drei Dinge verhindern das, und alle
 * drei stehen ausdrücklich **außerhalb** des Aufklappbereichs:
 *
 *   1. Der Knopf trägt die Zahl der gesetzten Filter als Abzeichen, und für
 *      die Vorlesehilfe steht sie ausgeschrieben daneben („Filter, 2
 *      gesetzt").
 *   2. Darunter bleibt „x von y Bewerbern" stehen, samt der Chips, die jeden
 *      gesetzten Filter beim Namen nennen und einzeln aufheben.
 *   3. „Filter zurücksetzen" bleibt erreichbar, ohne erst aufzuklappen.
 */

/** Eine Auswahl mit Beschriftung, Werten und Zahl in Klammern. */
function Auswahl({
  label,
  wert,
  werte,
  zaehlung,
  beschriftung,
  onChange,
  breite = "w-[11.5rem]",
}: {
  label: string;
  wert: string;
  werte: readonly string[];
  zaehlung: Record<string, number>;
  beschriftung: (wert: string) => string;
  onChange: (wert: string) => void;
  breite?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={wert} onValueChange={onChange}>
        <SelectTrigger className={`h-8 text-xs ${breite}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {werte.map((w) => (
            <SelectItem key={w} value={w} className="text-xs">
              {beschriftung(w)}
              {zaehlung[w] !== undefined && (
                <span className="ml-1 text-muted-foreground">({zaehlung[w]})</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function BewerberFilterLeiste({
  filter,
  onChange,
  zaehlung,
  quellen,
  stellen,
}: {
  filter: BewerberFilter;
  onChange: (filter: BewerberFilter) => void;
  zaehlung: FilterZaehlung;
  /** Die Quellen, die in dieser Liste wirklich vorkommen. */
  quellen: readonly string[];
  /** Die Stellen, auf die sich diese Bewerber beworben haben. */
  stellen: readonly string[];
}) {
  const istHandy = useIsMobile();
  /*
   * Beim Öffnen der Seite immer eingeklappt, auch wenn gestern etwas offen
   * war. Bewusst nicht gemerkt: Gemerkt ist der Filter selbst, und ein
   * gemerkter Aufklappzustand würde nur eine zweite Erinnerung daneben legen,
   * die niemand pflegt.
   */
  const [aufgeklappt, setAufgeklappt] = useState(false);
  // Am Schreibtisch und auf dem iPad gibt es nichts zum Klappen, dort ist
  // immer offen. Nur das Handy hört auf den Knopf.
  const offen = !istHandy || aufgeklappt;
  const gesetzt = istFilterGesetzt(filter);
  const chips = filterChips(filter);
  const setze = (teil: Partial<BewerberFilter>) => onChange({ ...filter, ...teil });

  return (
    <div data-ui="card" className="rounded-lg border bg-card p-3" data-testid="bewerber-filterleiste">
      <Collapsible open={offen} onOpenChange={setAufgeklappt}>
        {istHandy && (
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              className="mb-1 w-full justify-between"
              data-testid="bewerber-filter-aufklapp"
              aria-label={gesetzt ? `Filter, ${chips.length} gesetzt` : "Filter"}
            >
              <span className="inline-flex items-center gap-1.5">
                <FilterIcon className="h-4 w-4" aria-hidden />
                Filter
                {/* Farbig und nicht grau wie die Chips darunter: Das Abzeichen
                    soll auffallen, sonst übersieht man am eingeklappten Kasten,
                    dass die Liste beschnitten ist. */}
                {gesetzt && (
                  <Badge className="px-1.5 text-[10px] font-semibold">{chips.length}</Badge>
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${offen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent className={istHandy ? "pt-2" : undefined}>
          <div className="flex flex-wrap items-end gap-2">
            <span className="mb-1.5 hidden items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:inline-flex">
              <FilterIcon className="h-3.5 w-3.5" aria-hidden />
              Filter
            </span>

            <Auswahl
              label="Kennenlernbogen"
              wert={filter.bogen}
              werte={["alle", "ausgefuellt", "offen"]}
              zaehlung={zaehlung.bogen}
              beschriftung={(w) => BOGEN_LABELS[w as keyof typeof BOGEN_LABELS]}
              onChange={(w) => setze({ bogen: w as BewerberFilter["bogen"] })}
            />

            <Auswahl
              label="Vorabscore"
              wert={filter.score}
              werte={["alle", "A", "B", "C", "ohne"]}
              zaehlung={zaehlung.score}
              beschriftung={(w) => SCORE_LABELS[w as keyof typeof SCORE_LABELS]}
              onChange={(w) => setze({ score: w as BewerberFilter["score"] })}
              breite="w-[9.5rem]"
            />

            <Auswahl
              label="Eingegangen am"
              wert={filter.zeitraum}
              werte={["alle", "heute", "7tage", "30tage", "eigen"]}
              zaehlung={zaehlung.zeitraum}
              beschriftung={(w) => ZEITRAUM_LABELS[w as keyof typeof ZEITRAUM_LABELS]}
              onChange={(w) => {
                const zeitraum = w as BewerberFilter["zeitraum"];
                // Wer von der eigenen Spanne weggeht, soll ihre Daten nicht
                // unsichtbar behalten. Sonst wirken sie beim nächsten Mal weiter.
                setze(zeitraum === "eigen" ? { zeitraum } : { zeitraum, von: "", bis: "" });
              }}
            />

            <Auswahl
              label="Eingangsmail"
              wert={filter.mail}
              werte={["alle", "verschickt", "fehlt"]}
              zaehlung={zaehlung.mail}
              beschriftung={(w) => MAIL_LABELS[w as keyof typeof MAIL_LABELS]}
              onChange={(w) => setze({ mail: w as BewerberFilter["mail"] })}
            />

            {/* Quelle und Stelle nur, wenn es überhaupt etwas zu unterscheiden
                gibt. Eine Auswahl mit einem einzigen Eintrag ist keine Auswahl. */}
            {quellen.length > 1 && (
              <Auswahl
                label="Quelle"
                wert={filter.quelle}
                werte={["alle", ...quellen]}
                zaehlung={zaehlung.quelle}
                beschriftung={(w) => (w === "alle" ? "alle Quellen" : w === OHNE_ANGABE ? "ohne Angabe" : w)}
                onChange={(w) => setze({ quelle: w })}
              />
            )}

            {stellen.length > 1 && (
              <Auswahl
                label="Stelle"
                wert={filter.stelle}
                werte={["alle", ...stellen]}
                zaehlung={zaehlung.stelle}
                beschriftung={(w) => (w === "alle" ? "alle Stellen" : w === OHNE_ANGABE ? "ohne Angabe" : w)}
                onChange={(w) => setze({ stelle: w })}
                breite="w-[13rem]"
              />
            )}
          </div>

          {filter.zeitraum === "eigen" && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Von</span>
                <DateInput ariaLabel="Eingegangen ab" value={filter.von} onChange={(v) => setze({ von: v })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bis</span>
                <DateInput ariaLabel="Eingegangen bis" value={filter.bis} onChange={(v) => setze({ bis: v })} />
              </label>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2.5">
        <span className="text-xs font-medium" data-testid="bewerber-filter-zaehler">
          {zaehlung.gezeigt} von {zaehlung.gesamt} Bewerbern
        </span>
        {chips.map((chip) => (
          <Badge key={chip.feld} variant="secondary" className="gap-1 text-[10px] font-normal">
            {chip.text}
            <button
              type="button"
              aria-label={`Filter aufheben: ${chip.text}`}
              className="rounded-sm hover:text-foreground"
              onClick={() => onChange(ohneFeld(filter, chip.feld))}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </Badge>
        ))}
        {gesetzt && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs"
            onClick={() => onChange({ ...FILTER_STANDARD })}
          >
            Filter zurücksetzen
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Die Zeile, wenn der Filter alles weggenommen hat.
 *
 * Eine leere Liste allein sieht aus wie ein Fehler. Sie soll sagen, was los
 * ist, und den Weg zurück gleich mitgeben.
 */
export function BewerberFilterLeer({ onZuruecksetzen }: { onZuruecksetzen: () => void }) {
  return (
    <div data-ui="card"
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card px-4 py-10 text-center"
      data-testid="bewerber-filter-leer"
    >
      <p className="text-sm font-medium">Zu diesem Filter passt gerade kein Bewerber.</p>
      <p className="text-xs text-muted-foreground">
        Nimm eine Einschränkung zurück oder setze alle Filter zurück.
      </p>
      <Button size="sm" variant="outline" className="mt-1" onClick={onZuruecksetzen}>
        Filter zurücksetzen
      </Button>
    </div>
  );
}
