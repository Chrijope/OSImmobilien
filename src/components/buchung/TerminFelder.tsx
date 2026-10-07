import { useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { de, enGB } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FLAECHE_FELD } from "@/components/videoraum/Buehne";
import { heuteBerlinIso } from "@/lib/datumsformate";
import { STANDARD_SPRACHE, texteFuer, type Sprache } from "@/lib/seitenSprache";
import { BUCHUNG_BAUSTEIN_TEXTE } from "./buchungTexte";

/**
 * Datum und Uhrzeit von Hand, im Stil der dunklen Buchungsseiten.
 *
 * Christian am 29.09.2026: Die nativen Felder (`type="date"`, `type="time"`)
 * öffneten ein weißes Kalenderfenster und eine weiße Stundenliste des
 * Browsers, die sich nicht gestalten lassen. Diese beiden Felder öffnen
 * stattdessen eine eigene Auswahl auf dunklem Grund.
 *
 * Werte wie bei den nativen Feldern: Datum als JJJJ-MM-TT, Uhrzeit als HH:MM.
 * Die Seite, die sie benutzt, ändert an ihrer Logik also nichts.
 */

const FELD =
  `mt-2 flex h-[48px] w-full items-center justify-between gap-3 rounded-xl border border-white/15 ${FLAECHE_FELD} ` +
  "px-4 text-left text-[15px] text-white outline-none transition-colors " +
  "focus-visible:border-[#30E19E] focus-visible:ring-2 focus-visible:ring-[#30E19E]/40 data-[state=open]:border-[#30E19E]";

const FENSTER =
  "w-auto rounded-2xl border border-white/12 bg-[#151E2B] p-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)]";

const zwei = (n: number) => String(n).padStart(2, "0");

function isoZuDatum(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

function datumZuIso(d: Date): string {
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** „2030-04-02“ wird „02.04.2030“. */
function datumAnzeige(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

export function DatumFeld({
  id,
  wert,
  aufWahl,
  sprache = STANDARD_SPRACHE,
}: {
  id: string;
  /** JJJJ-MM-TT oder leer. */
  wert: string;
  aufWahl: (iso: string) => void;
  sprache?: Sprache;
}) {
  const t = texteFuer(BUCHUNG_BAUSTEIN_TEXTE, sprache);
  const [offen, setOffen] = useState(false);
  const gewaehlt = isoZuDatum(wert);
  // Heute in Berlin, wie die Datenbank rechnet. Die Datenbank lehnt mehr als ein Jahr voraus ab.
  const heute = isoZuDatum(heuteBerlinIso()) ?? new Date();
  const spaetestens = new Date(heute.getFullYear() + 1, heute.getMonth(), heute.getDate() - 1);

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={FELD}>
          <span className={gewaehlt ? "" : "text-white/35"}>
            {gewaehlt ? datumAnzeige(wert) : t.datumPlatzhalter}
          </span>
          <CalendarDays className="h-4 w-4 shrink-0 text-[#30E19E]" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={FENSTER}>
        <Calendar
          mode="single"
          selected={gewaehlt}
          onSelect={(d) => {
            if (d) aufWahl(datumZuIso(d));
            setOffen(false);
          }}
          defaultMonth={gewaehlt ?? heute}
          today={heute}
          fromDate={heute}
          toDate={spaetestens}
          disabled={[{ before: heute }, { after: spaetestens }]}
          locale={sprache === "en" ? enGB : de}
          weekStartsOn={1}
          showOutsideDays={false}
          initialFocus
          labels={{ labelPrevious: () => t.monatZurueck, labelNext: () => t.monatVor }}
          className="p-2"
          classNames={{
            caption_label: "text-[14px] font-semibold text-white",
            nav_button:
              "inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors " +
              "hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30E19E]",
            head_cell: "w-10 text-[11px] font-medium uppercase tracking-wide text-white/40",
            row: "mt-1 flex w-full",
            cell: "relative h-10 w-10 p-0 text-center text-[14px]",
            day:
              "h-10 w-10 rounded-xl p-0 font-normal text-white/85 transition-colors hover:bg-white/10 " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30E19E]",
            day_today: "border border-[#30E19E]/60 font-semibold text-[#30E19E]",
            day_selected: "!bg-[#15724F] font-semibold !text-white hover:!bg-[#15724F]",
            day_disabled: "cursor-not-allowed !text-white/20 hover:!bg-transparent",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

const STUNDEN = Array.from({ length: 24 }, (_, i) => zwei(i));
const MINUTEN = Array.from({ length: 12 }, (_, i) => zwei(i * 5));

/**
 * Pfeiltasten innerhalb einer Spalte, links und rechts in die andere.
 * Enter und Leertaste sind die des Knopfs selbst.
 */
function tastenInSpalte(e: KeyboardEvent<HTMLDivElement>) {
  const knoepfe = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
  const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
  const ziel =
    e.key === "ArrowDown" ? knoepfe[Math.min(i + 1, knoepfe.length - 1)]
    : e.key === "ArrowUp" ? knoepfe[Math.max(i - 1, 0)]
    : e.key === "Home" ? knoepfe[0]
    : e.key === "End" ? knoepfe[knoepfe.length - 1]
    : undefined;
  if (ziel) {
    e.preventDefault();
    ziel.focus();
    ziel.scrollIntoView?.({ block: "nearest" });
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const spalten = Array.from(
      e.currentTarget.closest("[data-uhrzeit-auswahl]")?.querySelectorAll("[role='group']") ?? [],
    );
    const nachbar = spalten[spalten.indexOf(e.currentTarget) + (e.key === "ArrowRight" ? 1 : -1)];
    const knopf = nachbar?.querySelector<HTMLButtonElement>("button[aria-pressed='true']")
      ?? nachbar?.querySelector<HTMLButtonElement>("button");
    if (knopf) {
      e.preventDefault();
      knopf.focus();
    }
  }
}

function Spalte({
  beschriftung,
  werte,
  gewaehlt,
  aufWahl,
}: {
  beschriftung: string;
  werte: string[];
  gewaehlt: string;
  aufWahl: (w: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={beschriftung}
      onKeyDown={tastenInSpalte}
      className="flex max-h-[248px] w-[72px] flex-col gap-1 overflow-y-auto overscroll-contain p-1"
    >
      {werte.map((w) => (
        <button
          key={w}
          type="button"
          aria-pressed={w === gewaehlt}
          data-wert={w}
          onClick={() => aufWahl(w)}
          className={`h-10 shrink-0 rounded-xl text-[15px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30E19E] ${
            w === gewaehlt ? "bg-[#15724F] font-semibold text-white" : "text-white/80 hover:bg-white/10"
          }`}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

export function UhrzeitFeld({
  id,
  wert,
  aufWahl,
  sprache = STANDARD_SPRACHE,
}: {
  id: string;
  /** HH:MM oder leer. */
  wert: string;
  aufWahl: (hhmm: string) => void;
  sprache?: Sprache;
}) {
  const t = texteFuer(BUCHUNG_BAUSTEIN_TEXTE, sprache);
  const [offen, setOffen] = useState(false);
  const inhalt = useRef<HTMLDivElement>(null);
  const [stunde = "", minute = ""] = /^\d{2}:\d{2}$/.test(wert) ? wert.split(":") : [];
  // Eine Minute ohne Stunde merkt sich das Feld, bis die Stunde dazukommt.
  const [minuteVorab, setMinuteVorab] = useState("");

  const waehleStunde = (s: string) => {
    aufWahl(`${s}:${minute || minuteVorab || "00"}`);
    setMinuteVorab("");
  };
  const waehleMinute = (m: string) => {
    if (!stunde) {
      setMinuteVorab(m);
      return;
    }
    aufWahl(`${stunde}:${m}`);
    setOffen(false);
  };

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={FELD}>
          <span className={wert ? "tabular-nums" : "text-white/35"}>{wert || t.uhrzeitPlatzhalter}</span>
          <Clock className="h-4 w-4 shrink-0 text-[#30E19E]" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={inhalt}
        align="start"
        className={FENSTER}
        onOpenAutoFocus={(e) => {
          // Die gewählte Stunde (sonst 09) in den Blick und in den Fokus, nicht die erste Zeile 00.
          e.preventDefault();
          const knopf = inhalt.current?.querySelector<HTMLButtonElement>(`button[data-wert='${stunde || "09"}']`);
          knopf?.focus();
          knopf?.scrollIntoView?.({ block: "center" });
        }}
      >
        <div data-uhrzeit-auswahl className="flex gap-1">
          <div>
            <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-white/40">{t.stunde}</p>
            <Spalte beschriftung={t.stunde} werte={STUNDEN} gewaehlt={stunde} aufWahl={waehleStunde} />
          </div>
          <div className="border-l border-white/10 pl-1">
            <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-white/40">{t.minute}</p>
            <Spalte beschriftung={t.minute} werte={MINUTEN} gewaehlt={minute || minuteVorab} aufWahl={waehleMinute} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
