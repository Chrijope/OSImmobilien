import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Filter as FilterIcon,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Die Leiste über der Liste "Alle Kontakte".
 *
 * ## Warum sie eine eigene Datei ist
 *
 * `AlleKontakte.tsx` ist über tausend Zeilen lang und hatte die Leiste als
 * eine einzige sofort aufgerufene Funktion mitten im JSX. Hier steht nur noch
 * die Anzeige. Was ein Filter bedeutet und welcher Kontakt übrig bleibt,
 * entscheidet weiterhin die Seite. Nebenbei wird die Leiste dadurch prüfbar,
 * ohne die ganze Seite samt Zwischenspeicher aufzubauen.
 *
 * ## Was oben steht und was hinter dem Knopf liegt
 *
 * Immer sichtbar bleibt, was man beim Arbeiten dauernd anfasst: die
 * Kontaktsuche, die Auswahl des Vertriebspartners und der Haken für verlorene
 * und archivierte Kontakte. Hinter dem Knopf "Filter" liegen die vier
 * Einschränkungen Ansicht, Rolle, Stufe und Typ sowie die drei Haken
 * "Nur meine", "Ohne Follow-Up" und "Ohne Termin".
 *
 * Der Haken für verlorene und archivierte Kontakte bleibt bewusst oben. Er
 * schränkt die Liste nicht ein, sondern tauscht sie aus: Ohne Haken steht dort
 * die Arbeitsliste, mit Haken ausschließlich das Abgelegte. Außerdem hängt an
 * ihm, ob die Stufe "Verloren" überhaupt zur Auswahl steht. Ein Schalter, der
 * die Bedeutung der ganzen Liste umdreht, gehört nicht in ein Fach, das man
 * erst öffnen muss.
 *
 * ## Warum ein Aufklappbereich und kein Popover
 *
 * Die vier Einschränkungen sind selbst wieder Auswahlfelder mit eigenem
 * Popover, die Stufenauswahl ist ein Raster mit bis zu einem Dutzend Einträgen.
 * Popover in Popover ist auf dem Handy kaum bedienbar und schließt gern das
 * falsche Fenster. Der Aufklappbereich legt sich statt dessen unter die Leiste,
 * hat volle Breite und ist dasselbe Muster wie bei den Bewerbern
 * (`BewerberFilterLeiste.tsx`). Anders als dort gibt es den Knopf hier auf
 * allen Breiten, so hat Christian es bestellt.
 *
 * ## Die Falle beim Einklappen, und was dagegen steht
 *
 * Die Filter dieser Seite werden je Nutzer gemerkt
 * (`alle_kontakte_filter` in den Nutzereinstellungen, siehe `AlleKontakte.tsx`).
 * Sie überleben Seitenwechsel, Neuladen und den nächsten Tag. Ein zugeklappter
 * Kasten könnte deshalb verbergen, warum die Liste so kurz ist. Drei Dinge
 * verhindern das, und alle drei stehen **außerhalb** des Aufklappbereichs:
 *
 *   1. Der Knopf trägt die Zahl der gesetzten Filter als farbiges Abzeichen,
 *      für die Vorlesehilfe ausgeschrieben ("Filter, 2 gesetzt").
 *   2. Darunter steht "x von y Kontakten" samt Chips, die jeden gesetzten
 *      Filter beim Namen nennen und einzeln aufheben.
 *   3. "Alle Filter zurücksetzen" bleibt erreichbar, ohne aufzuklappen.
 */

/** Die Auswahl "Ansicht", also die Voreinstellungen der Arbeitsliste. */
export const PRESET_OPTIONEN = [
  { key: "alle", label: "Alle", kurz: "Alle" },
  { key: "neu", label: "🆕 Neu / kein Kontakt", kurz: "🆕 Neu" },
  { key: "wartezeit", label: "📵 Nicht erreicht (Wartezeit)", kurz: "📵 Nicht erreicht" },
  { key: "anrufbar", label: "⏰ Jetzt anrufbar", kurz: "⏰ Anrufbar" },
  { key: "termin", label: "📅 Termin geplant", kurz: "📅 Termin" },
] as const;

/** Beschriftungen des Typ-Filters, an einer Stelle statt in zwei Listen. */
export const TYP_LABELS = {
  "-": "Alle Typen",
  eigen: "Eigenkontakte",
  lead: "Leads der Gesellschaft",
} as const;

/** Die Kategorien der Auswahl "Rolle". */
export const KATEGORIEN = ["alle", "Kontakt", "Neukunde", "Abwicklung", "Bestandskunde"] as const;

/** Alles, was die Leiste anzeigt. Die Seite hält die Werte. */
export interface KontakteFilterWerte {
  /** Schlüssel aus PRESET_OPTIONEN. */
  preset: string;
  /** Schlüssel aus KATEGORIEN. */
  kategorie: string;
  stufen: string[];
  /** Schlüssel aus TYP_LABELS. */
  typ: string;
  nurMeine: boolean;
  ohneFollowUp: boolean;
  ohneTermin: boolean;
  suche: string;
  /** "-" für alle, "__none__" für ohne Partner, sonst der Name. */
  berater: string;
  /** Verlorene und archivierte Kontakte statt der Arbeitsliste. */
  abgelegte: boolean;
}

/** Der Standardstand, auf den "Alle Filter zurücksetzen" zurückgeht. */
export const KONTAKTE_FILTER_STANDARD: KontakteFilterWerte = {
  preset: "alle",
  kategorie: "alle",
  stufen: [],
  typ: "-",
  nurMeine: false,
  ohneFollowUp: false,
  ohneTermin: false,
  suche: "",
  berater: "-",
  abgelegte: false,
};

/** Ein Chip: der Name des Filters und der Weg, genau ihn aufzuheben. */
export interface FilterChip {
  id: string;
  text: string;
  aufheben: () => void;
}

/**
 * Wie viele der versteckten Filter gesetzt sind.
 *
 * Gezählt wird nur, was hinter dem Knopf liegt. Suche, Partner und der Haken
 * für Abgelegtes stehen sichtbar oben, sie brauchen keine Zahl, die auf sie
 * hinweist. Mehrere Stufen zählen als ein Filter, sonst stünde am Knopf eine
 * Zahl, die niemand einer Bedienung zuordnen kann.
 */
export function zaehleGesetzteFilter(werte: KontakteFilterWerte): number {
  return (
    (werte.preset !== "alle" ? 1 : 0) +
    (werte.kategorie !== "alle" ? 1 : 0) +
    (werte.stufen.length > 0 ? 1 : 0) +
    (werte.typ !== "-" ? 1 : 0) +
    (werte.nurMeine ? 1 : 0) +
    (werte.ohneFollowUp ? 1 : 0) +
    (werte.ohneTermin ? 1 : 0)
  );
}

/** Ist überhaupt irgendetwas eingeschränkt, auch sichtbar oben? */
export function istIrgendeinFilterGesetzt(werte: KontakteFilterWerte): boolean {
  return (
    zaehleGesetzteFilter(werte) > 0 ||
    werte.suche.trim() !== "" ||
    werte.berater !== "-" ||
    werte.abgelegte
  );
}

export interface KontakteFilterLeisteProps {
  werte: KontakteFilterWerte;
  /** Eine einzelne Änderung. Die Seite führt sie auf ihren Zustand zurück. */
  onChange: (teil: Partial<KontakteFilterWerte>) => void;
  /** Alles auf einmal zurück auf den Standard. */
  onZuruecksetzen: () => void;
  /** Die Stufen, die zur Auswahl stehen, samt Beschriftung. */
  stufenOptionen: readonly { key: string; label: string }[];
  /** Wie viele Kontakte je Stufe, für die Zahl neben dem Namen. */
  stufenCounts: Record<string, number>;
  /** Wie viele Kontakte je Kategorie. */
  kategorieCounts: Record<string, number>;
  /** Die Namen der Vertriebspartner für das zusammengeführte Feld. */
  beraterListe: readonly string[];
  /** Ob der Partnerfilter überhaupt erscheinen darf (Rollenfrage). */
  zeigeBeraterFilter: boolean;
  /** Wie viele Kontakte die Liste gerade zeigt. */
  gezeigt: number;
  /** Wie viele es ohne jeden Filter wären. */
  gesamt: number;
}

export function KontakteFilterLeiste({
  werte,
  onChange,
  onZuruecksetzen,
  stufenOptionen,
  stufenCounts,
  kategorieCounts,
  beraterListe,
  zeigeBeraterFilter,
  gezeigt,
  gesamt,
}: KontakteFilterLeisteProps) {
  /*
   * Beim Öffnen der Seite immer zugeklappt, auch wenn gestern etwas offen war.
   * Bewusst nicht gemerkt: Gemerkt sind die Filter selbst, ein gemerkter
   * Aufklappzustand wäre eine zweite Erinnerung daneben, die niemand pflegt.
   */
  const [aufgeklappt, setAufgeklappt] = useState(false);
  const [partnerOffen, setPartnerOffen] = useState(false);

  const anzahlGesetzt = zaehleGesetzteFilter(werte);
  const etwasGesetzt = istIrgendeinFilterGesetzt(werte);

  const aktivesPreset = PRESET_OPTIONEN.find((p) => p.key === werte.preset) || PRESET_OPTIONEN[0];
  const stufenLabel =
    werte.stufen.length === 0
      ? "Alle Stufen"
      : werte.stufen.length === 1
        ? stufenOptionen.find((s) => s.key === werte.stufen[0])?.label || "1 Stufe"
        : `${werte.stufen.length} Stufen`;

  const toggleStufe = (key: string) => {
    onChange({
      stufen: werte.stufen.includes(key)
        ? werte.stufen.filter((k) => k !== key)
        : [...werte.stufen, key],
    });
  };

  const beraterLabel =
    werte.berater === "-"
      ? "Alle Vertriebspartner"
      : werte.berater === "__none__"
        ? "Ohne Vertriebspartner"
        : werte.berater;

  const waehleBerater = (wert: string) => {
    onChange({ berater: wert });
    setPartnerOffen(false);
  };

  /*
   * Die Chips nennen jeden versteckten Filter beim Namen. Sie stehen außerhalb
   * des Aufklappbereichs, damit eine kurze Liste sich auch dann erklärt, wenn
   * niemand den Knopf angefasst hat.
   */
  const chips: FilterChip[] = [];
  if (werte.preset !== "alle") {
    chips.push({
      id: "preset",
      text: aktivesPreset.kurz,
      aufheben: () => onChange({ preset: "alle" }),
    });
  }
  if (werte.kategorie !== "alle") {
    chips.push({
      id: "kategorie",
      text: werte.kategorie,
      aufheben: () => onChange({ kategorie: "alle" }),
    });
  }
  for (const key of werte.stufen) {
    const stufe = stufenOptionen.find((s) => s.key === key);
    if (!stufe) continue;
    chips.push({ id: `stufe-${key}`, text: stufe.label, aufheben: () => toggleStufe(key) });
  }
  if (werte.typ !== "-") {
    chips.push({
      id: "typ",
      text: TYP_LABELS[werte.typ as keyof typeof TYP_LABELS] || werte.typ,
      aufheben: () => onChange({ typ: "-" }),
    });
  }
  if (werte.nurMeine) {
    chips.push({ id: "nurMeine", text: "Nur meine", aufheben: () => onChange({ nurMeine: false }) });
  }
  if (werte.ohneFollowUp) {
    chips.push({
      id: "ohneFollowUp",
      text: "Ohne Follow-Up",
      aufheben: () => onChange({ ohneFollowUp: false }),
    });
  }
  if (werte.ohneTermin) {
    chips.push({
      id: "ohneTermin",
      text: "Ohne Termin",
      aufheben: () => onChange({ ohneTermin: false }),
    });
  }

  const haken = [
    { key: "nurMeine", label: "Nur meine", wert: werte.nurMeine },
    { key: "ohneFollowUp", label: "Ohne Follow-Up", wert: werte.ohneFollowUp },
    { key: "ohneTermin", label: "Ohne Termin", wert: werte.ohneTermin },
  ] as const;

  return (
    <div data-ui="card"
      className="rounded-2xl border border-border/60 bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-2"
      data-testid="kontakte-filterleiste"
    >
      <Collapsible open={aufgeklappt} onOpenChange={setAufgeklappt}>
        {/* Die immer sichtbare Zeile: Knopf, Suche, Partner, Abgelegtes. */}
        <div className="flex flex-wrap items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              data-testid="kontakte-filter-aufklapp"
              aria-label={anzahlGesetzt > 0 ? `Filter, ${anzahlGesetzt} gesetzt` : "Filter"}
            >
              <FilterIcon className="h-3.5 w-3.5" aria-hidden />
              <span className="text-xs">Filter</span>
              {/* Farbig und nicht grau wie die Chips darunter: Das Abzeichen
                  soll auffallen, sonst übersieht man am zugeklappten Kasten,
                  dass die Liste beschnitten ist. */}
              {anzahlGesetzt > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                  {anzahlGesetzt}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 opacity-60 transition-transform ${aufgeklappt ? "rotate-180" : ""}`}
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>

          <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="h-9 pl-9"
              placeholder="Kontakte suchen..."
              aria-label="Kontakte suchen"
              value={werte.suche}
              onChange={(e) => onChange({ suche: e.target.value })}
            />
          </div>

          {/*
            Auswahl und Suche sind ein einziges Feld: Der Knopf zeigt den
            gewählten Partner, im Fach darunter tippt man und wählt in einem.
            Vorher standen hier zwei Felder nebeneinander, eines zum Auswählen
            und eines zum Suchen, und man musste raten, welches führt.
          */}
          {zeigeBeraterFilter && (
            <Popover open={partnerOffen} onOpenChange={setPartnerOffen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  role="combobox"
                  aria-expanded={partnerOffen}
                  aria-label={`Vertriebspartner: ${beraterLabel}`}
                  className="h-9 w-56 justify-between gap-1.5"
                  data-testid="kontakte-partner-auswahl"
                >
                  <span className="truncate text-xs">{beraterLabel}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 overflow-hidden p-0">
                <Command>
                  {/*
                    Der Fokusrahmen des Suchfelds wurde oben vom Rand der
                    Klappe abgeschnitten und sah aus wie ein Fehler. Das Feld
                    sitzt ohnehin ganz oben in einer eigenen Klappe, es ist
                    also auch ohne Rahmen klar, wo die Eingabe landet. Statt
                    des Rahmens traegt die Trennlinie darunter die Betonung,
                    und der Tastaturfokus bleibt an der Schreibmarke sichtbar.
                  */}
                  <CommandInput
                    placeholder="Partner suchen..."
                    className="h-9 text-xs focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                  />
                  <CommandList>
                    <CommandEmpty>Kein Partner gefunden</CommandEmpty>
                    <CommandGroup>
                      {[
                        { wert: "-", text: "Alle Vertriebspartner" },
                        { wert: "__none__", text: "Ohne Vertriebspartner" },
                        ...beraterListe.map((name) => ({ wert: name, text: name })),
                      ].map((eintrag) => (
                        <CommandItem
                          key={eintrag.wert}
                          value={eintrag.text}
                          onSelect={() => waehleBerater(eintrag.wert)}
                        >
                          <Check
                            className={`mr-2 h-3.5 w-3.5 ${werte.berater === eintrag.wert ? "opacity-100" : "opacity-0"}`}
                            aria-hidden
                          />
                          <span className="truncate">{eintrag.text}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="kontakte-abgelegte"
              checked={werte.abgelegte}
              onCheckedChange={(v) => onChange({ abgelegte: !!v })}
            />
            <label htmlFor="kontakte-abgelegte" className="text-xs">
              Verlorene &amp; Archivierte
            </label>
          </div>

          {etwasGesetzt && (
            <button
              type="button"
              onClick={onZuruecksetzen}
              className="ml-auto text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Alle Filter zurücksetzen
            </button>
          )}
        </div>

        {/* Hinter dem Knopf: Ansicht, Rolle, Stufe, Typ und die drei Haken. */}
        <CollapsibleContent className="pt-2">
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
            {/* Ansicht */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <span className="text-xs text-muted-foreground">Ansicht:</span>
                  <span className="text-xs font-medium">{aktivesPreset.kurz}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                {PRESET_OPTIONEN.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => onChange({ preset: p.key })}
                    className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                      werte.preset === p.key ? "bg-primary/10 font-medium text-primary" : "hover:bg-accent"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Rolle */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <span className="text-xs text-muted-foreground">Rolle:</span>
                  <span className="text-xs font-medium">
                    {werte.kategorie === "alle" ? "Alle" : werte.kategorie}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({kategorieCounts[werte.kategorie] ?? 0})
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-1">
                {KATEGORIEN.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onChange({ kategorie: cat })}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                      werte.kategorie === cat ? "bg-primary/10 font-medium text-primary" : "hover:bg-accent"
                    }`}
                  >
                    <span>{cat === "alle" ? "Alle" : cat}</span>
                    <span className="text-[10px] text-muted-foreground">{kategorieCounts[cat] ?? 0}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Stufe, mehrfach wählbar */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <span className="text-xs text-muted-foreground">Stufe:</span>
                  <span className="text-xs font-medium">{stufenLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Pipeline-Stufe
                  </span>
                  {werte.stufen.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange({ stufen: [] })}
                      className="text-[11px] text-muted-foreground underline hover:text-foreground"
                    >
                      Leeren
                    </button>
                  )}
                </div>
                <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto">
                  {stufenOptionen.map((s) => {
                    const aktiv = werte.stufen.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleStufe(s.key)}
                        className={`flex items-center justify-between rounded-md border px-2 py-1 text-[11px] transition-colors ${
                          aktiv
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-transparent bg-transparent hover:bg-accent"
                        }`}
                      >
                        <span className="truncate">{s.label}</span>
                        <span className={`ml-1 text-[10px] ${aktiv ? "opacity-80" : "opacity-60"}`}>
                          {stufenCounts[s.key] || 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* Typ */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <span className="text-xs text-muted-foreground">Typ:</span>
                  <span className="text-xs font-medium">
                    {TYP_LABELS[werte.typ as keyof typeof TYP_LABELS] ?? "Alle"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-1">
                {(Object.keys(TYP_LABELS) as Array<keyof typeof TYP_LABELS>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onChange({ typ: key })}
                    className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                      werte.typ === key ? "bg-primary/10 font-medium text-primary" : "hover:bg-accent"
                    }`}
                  >
                    {TYP_LABELS[key]}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {haken.map((h) => (
              <label
                key={h.key}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent"
              >
                <Checkbox
                  checked={h.wert}
                  onCheckedChange={(v) => onChange({ [h.key]: !!v } as Partial<KontakteFilterWerte>)}
                />
                <span className="text-xs">{h.label}</span>
              </label>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Bleibt stehen, auch wenn der Filterbereich zu ist. */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
        <span className="text-xs font-medium" data-testid="kontakte-filter-zaehler">
          {gezeigt} von {gesamt} Kontakten
        </span>
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={chip.aufheben}
            aria-label={`Filter aufheben: ${chip.text}`}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/15"
          >
            {chip.text}
            <X className="h-3 w-3" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
