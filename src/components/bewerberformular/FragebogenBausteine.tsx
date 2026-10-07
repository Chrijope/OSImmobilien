import { useId, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

/**
 * Was diese Bausteine von einer Frage wirklich brauchen.
 *
 * Bewusst als eigener, schmaler Typ und nicht als `FormularFrage`: Seit dem
 * neuen Bewerberprozess gibt es zwei Bogenfassungen. Der Vorabbogen
 * (`bewerberFormular.ts`) und das Kennenlernen (`bewerberKennenlernen.ts`)
 * beschreiben ihre Fragen verschieden, brauchen aber dieselben Kacheln,
 * Felder und Knöpfe. Beide Typen erfüllen diesen hier, ohne dass einer den
 * anderen kennen muss.
 */
export type BausteinOption = { value: string; label: string; emoji?: string };

export type BausteinFrage = {
  key: string;
  optionen?: BausteinOption[];
  placeholder?: string;
  maxLaenge?: number;
  /** Nur für den Fortschrittsbalken: bedingte Zusatzfragen erscheinen blasser. */
  nurWenn?: unknown;
};

/**
 * Bausteine des Bewerber-Fragebogens im Stil des öffentlichen Auftritts.
 *
 * Vorbild ist der Lead-Funnel der Landingpage: Segmentbalken, Kacheln mit
 * kräftigem Rand, dunkler Weiter-Knopf, Zurück als Textlink. Farben sind die
 * Hausfarben #0F1621 und #0A6EDB, mobil zuerst. Alle Bausteine sind mit der
 * Tastatur bedienbar: Kacheln sind Knöpfe mit Radio- oder Checkbox-Rolle.
 */

export const FARBE_DUNKEL = "#0F1621";
export const FARBE_BLAU = "#0A6EDB";
const FARBE_ZUSATZ = "#8FC3F5";
const FARBE_OFFEN = "#E4E6EB";

/** Ein Segment je sichtbarer Frage. Bedingte Zusatzfragen erscheinen hellblau, bis sie dran sind. */
export function Fortschritt({
  fragen,
  index,
  fertig = false,
}: {
  fragen: BausteinFrage[];
  index: number;
  fertig?: boolean;
}) {
  return (
    <div
      className="flex gap-1"
      role="progressbar"
      aria-label="Fortschritt im Fragebogen"
      aria-valuemin={0}
      aria-valuemax={fragen.length}
      aria-valuenow={fertig ? fragen.length : Math.max(0, index)}
    >
      {fragen.map((f, i) => {
        const erledigt = fertig || i < index;
        const aktuell = !fertig && i === index;
        const zusatz = !erledigt && !aktuell && !!f.nurWenn;
        return (
          <span
            key={f.key}
            data-testid={`segment-${f.key}`}
            data-zustand={erledigt ? "erledigt" : aktuell ? "aktuell" : zusatz ? "zusatz" : "offen"}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{
              background: erledigt || aktuell ? FARBE_BLAU : zusatz ? FARBE_ZUSATZ : FARBE_OFFEN,
              boxShadow: aktuell ? "0 0 0 3px rgba(10,110,219,.18)" : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/** Der blaue Eyebrow mit Punkt davor, wie auf der Landingpage. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em]" style={{ color: FARBE_BLAU }}>
      <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: FARBE_BLAU }} />
      {children}
    </span>
  );
}

const KACHEL_BASIS =
  "flex items-center gap-3 w-full text-left rounded-2xl border-2 px-4 py-3 min-h-[56px] text-[15px] font-medium leading-snug transition-all duration-200 " +
  "focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0A6EDB]/20";
const KACHEL_AN = "border-[#0A6EDB] bg-[#F0F7FF] shadow-[0_6px_16px_-8px_rgba(10,110,219,.45)]";
const KACHEL_AUS = "border-[#E4E6EB] bg-white hover:border-[#0A6EDB]/40 hover:bg-[#F5F5F7]";

/** Zwei Spalten, wenn alle Beschriftungen kurz sind. Lange Sätze bleiben einspaltig. */
function zweiSpaltig(optionen: BausteinOption[]): boolean {
  return optionen.every((o) => o.label.length <= 24);
}

/** Einzelauswahl als Kacheln. Ein Tipp wählt und meldet die Wahl sofort. */
export function KachelEinzel({
  frage,
  wert,
  onWaehle,
  labelId,
}: {
  frage: BausteinFrage;
  wert: string | undefined;
  onWaehle: (value: string) => void;
  labelId: string;
}) {
  const optionen = frage.optionen ?? [];
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={`grid gap-2.5 mt-5 ${zweiSpaltig(optionen) ? "grid-cols-2" : "grid-cols-1"}`}
    >
      {optionen.map((o) => {
        const aktiv = wert === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={aktiv}
            onClick={() => onWaehle(o.value)}
            className={`${KACHEL_BASIS} ${aktiv ? KACHEL_AN : KACHEL_AUS}`}
            style={{ color: "#1D1D1F" }}
          >
            {o.emoji && (
              <span aria-hidden className="text-[22px] leading-none w-7 text-center shrink-0">{o.emoji}</span>
            )}
            <span className="flex-1">{o.label}</span>
            {aktiv && (
              <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0" style={{ background: FARBE_BLAU }}>
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} aria-hidden />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Mehrfachauswahl als Kacheln mit Kontrollkästchen. */
export function KachelMehrfach({
  frage,
  werte,
  onToggle,
  labelId,
}: {
  frage: BausteinFrage;
  werte: string[];
  onToggle: (value: string) => void;
  labelId: string;
}) {
  const optionen = frage.optionen ?? [];
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={`grid gap-2.5 mt-5 ${zweiSpaltig(optionen) ? "grid-cols-2" : "grid-cols-1"}`}
    >
      {optionen.map((o) => {
        const aktiv = werte.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={aktiv}
            onClick={() => onToggle(o.value)}
            className={`${KACHEL_BASIS} ${aktiv ? KACHEL_AN : KACHEL_AUS}`}
            style={{ color: "#1D1D1F" }}
          >
            <Kaestchen aktiv={aktiv} />
            <span className="flex-1">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Das Kontrollkästchen, rein optisch. Der Zustand hängt am umgebenden Knopf. */
export function Kaestchen({ aktiv }: { aktiv: boolean }) {
  return (
    <span
      aria-hidden
      className="w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center shrink-0 transition-colors"
      style={{
        borderColor: aktiv ? FARBE_BLAU : "#C9CED6",
        background: aktiv ? FARBE_BLAU : "transparent",
      }}
    >
      {aktiv && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
    </span>
  );
}

/**
 * Der Schieberegler für das Einkommensziel (Punkt P3).
 *
 * Vorher standen hier vier Kacheln in einer Reihe, die nur wie eine Skala
 * aussahen. Jetzt ist es ein echter Regler: ein `input type="range"` mit vier
 * Rastpunkten. Das ist bewusst kein Nachbau mit `div` und Mausereignissen,
 * denn der Browser bringt alles mit, was so ein Nachbau mühsam nachbilden
 * müsste: Ziehen mit Maus und Finger, die Pfeiltasten, Pos1 und Ende, und die
 * richtige Rolle für den Bildschirmleser.
 *
 * Zwei Dinge kommen dazu:
 *
 *   - **Der gewählte Wert steht groß darüber.** Auf dem Regler selbst ist kein
 *     Platz für „5.000 bis 10.000 Euro", und die vier Beschriftungen darunter
 *     sind auf dem Handy zwangsläufig klein.
 *   - **„Weiß ich noch nicht" ist ein eigener Knopf darunter.** Es ist keine
 *     Stufe der Skala: Es liegt weder über noch unter „bis 2.000 Euro", es
 *     liegt daneben. Als fünfter Rastpunkt wäre es eine Aussage über die Höhe,
 *     und das ist es nicht.
 *
 * Solange nichts gewählt ist, steht der Griff links und bleibt grau. Erst die
 * erste Bedienung macht daraus eine Antwort, deshalb sind auch die
 * Beschriftungen darunter anklickbar: Wer „Bis 2.000 Euro" will, müsste den
 * Griff sonst erst wegziehen und wieder zurück.
 */
export function Skala({
  frage,
  wert,
  onWaehle,
  labelId,
}: {
  frage: BausteinFrage;
  wert: string | undefined;
  onWaehle: (value: string) => void;
  labelId: string;
}) {
  const alle = frage.optionen ?? [];
  const stufen = alle.filter((o) => o.value !== "unklar");
  const extra = alle.find((o) => o.value === "unklar");
  const gewaehlt = stufen.findIndex((o) => o.value === wert);
  const n = Math.max(1, stufen.length);
  const position = gewaehlt >= 0 ? gewaehlt + 1 : 1;
  const gesetzt = gewaehlt >= 0;
  // Der gefüllte Teil endet unter dem Griff. Bei einer Stufe ist er ein Punkt.
  const anteil = n > 1 ? ((position - 1) / (n - 1)) * 100 : 0;

  return (
    <div className="mt-6">
      <p className="text-center">
        <span
          className="block text-[22px] sm:text-[26px] font-semibold leading-tight transition-colors"
          style={{ color: gesetzt ? FARBE_DUNKEL : "#9AA0A8" }}
        >
          {gesetzt ? stufen[gewaehlt].label : extra ? "Zieh den Regler" : ""}
        </span>
        <span className="mt-0.5 block text-[12.5px]" style={{ color: "#8A8F98" }}>
          {gesetzt ? "im Monat, wenn es läuft" : "oder wähle die Antwort darunter"}
        </span>
      </p>

      <input
        type="range"
        min={1}
        max={n}
        step={1}
        value={position}
        aria-labelledby={labelId}
        aria-valuetext={gesetzt ? stufen[gewaehlt].label : "noch nichts gewählt"}
        onChange={(e) => {
          const i = Number(e.target.value) - 1;
          if (stufen[i]) onWaehle(stufen[i].value);
        }}
        className="fb-regler mt-5 w-full"
        style={{
          background: gesetzt
            ? `linear-gradient(90deg, #5CB0FF 0%, ${FARBE_BLAU} ${anteil}%, ${FARBE_OFFEN} ${anteil}%, ${FARBE_OFFEN} 100%)`
            : FARBE_OFFEN,
        }}
        data-gesetzt={gesetzt ? "ja" : "nein"}
      />

      <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {stufen.map((o, i) => {
          const aktiv = i === gewaehlt;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onWaehle(o.value)}
              className="rounded-lg px-0.5 py-1 text-center text-[12px] sm:text-[13px] leading-tight transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0A6EDB]/20"
              style={{ color: aktiv ? FARBE_BLAU : "#8A8F98", fontWeight: aktiv ? 600 : 500 }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {extra && (
        <button
          type="button"
          aria-pressed={wert === extra.value}
          onClick={() => onWaehle(extra.value)}
          className={`mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-[1.5px] text-sm font-medium transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0A6EDB]/20 ${
            wert === extra.value ? "border-[#0A6EDB] bg-[#F0F7FF]" : "border-dashed border-[#C9CED6] hover:bg-[#F5F5F7]"
          }`}
          style={{ color: wert === extra.value ? FARBE_DUNKEL : "#6E6E73" }}
        >
          <Kaestchen aktiv={wert === extra.value} />
          {extra.label}
        </button>
      )}

      {/*
        Der Griff lässt sich nur über die Pseudoelemente der beiden
        Browserfamilien gestalten, und die kann kein `style`-Attribut treffen.
        Deshalb steht er hier und nicht in `index.css`: Er gilt allein für
        diesen Regler, und wer ihn sucht, sucht ihn an dieser Stelle.
      */}
      <style>{`
.fb-regler { -webkit-appearance: none; appearance: none; height: 8px; border-radius: 999px; outline: none; cursor: pointer; }
.fb-regler::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 28px; height: 28px; border-radius: 999px; background: #fff; border: 4px solid ${FARBE_BLAU}; box-shadow: 0 2px 10px -2px rgba(10,110,219,.55); cursor: grab; transition: transform .15s ease; }
.fb-regler::-moz-range-thumb { width: 28px; height: 28px; border-radius: 999px; background: #fff; border: 4px solid ${FARBE_BLAU}; box-shadow: 0 2px 10px -2px rgba(10,110,219,.55); cursor: grab; }
.fb-regler[data-gesetzt="nein"]::-webkit-slider-thumb { border-color: #C9CED6; box-shadow: none; }
.fb-regler[data-gesetzt="nein"]::-moz-range-thumb { border-color: #C9CED6; box-shadow: none; }
.fb-regler:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 6px rgba(10,110,219,.22); }
.fb-regler:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 6px rgba(10,110,219,.22); }
.fb-regler:active::-webkit-slider-thumb { transform: scale(1.08); }
@media (prefers-reduced-motion: reduce) { .fb-regler::-webkit-slider-thumb { transition: none; } }
      `}</style>
    </div>
  );
}

const FELD_BASIS =
  "w-full rounded-2xl border-2 border-[#E4E6EB] bg-white px-4 py-3.5 text-base leading-normal transition-all " +
  "placeholder:text-[#9AA0A8] focus:outline-none focus:border-[#0A6EDB] focus:shadow-[0_0_0_4px_rgba(10,110,219,.12)]";

/** Einzeiliges Feld. Enter geht weiter, wenn etwas drinsteht. Schrift 16px, damit das Handy nicht zoomt. */
export function Kurztext({
  frage,
  wert,
  onAendere,
  onEnter,
  labelId,
}: {
  frage: BausteinFrage;
  wert: string;
  onAendere: (wert: string) => void;
  onEnter: () => void;
  labelId: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && wert.trim() !== "") {
      e.preventDefault();
      onEnter();
    }
  };
  return (
    <input
      type="text"
      aria-labelledby={labelId}
      value={wert}
      onChange={(e) => onAendere(e.target.value)}
      onKeyDown={onKey}
      placeholder={frage.placeholder}
      maxLength={frage.maxLaenge}
      autoComplete="off"
      className={`${FELD_BASIS} mt-5`}
      style={{ color: "#1D1D1F" }}
    />
  );
}

/** Mehrzeiliges Feld mit Zeichenzähler. */
export function Freitext({
  frage,
  wert,
  onAendere,
  labelId,
}: {
  frage: BausteinFrage;
  wert: string;
  onAendere: (wert: string) => void;
  labelId: string;
}) {
  const zaehlerId = useId();
  return (
    <div className="mt-5">
      <textarea
        aria-labelledby={labelId}
        aria-describedby={zaehlerId}
        value={wert}
        onChange={(e) => onAendere(e.target.value)}
        placeholder={frage.placeholder}
        maxLength={frage.maxLaenge}
        rows={5}
        className={`${FELD_BASIS} resize-y min-h-[150px]`}
        style={{ color: "#1D1D1F" }}
      />
      {frage.maxLaenge && (
        <p id={zaehlerId} className="text-right text-[12.5px] mt-1.5" style={{ color: "#8A8F98" }}>
          {wert.length} / {frage.maxLaenge}
        </p>
      )}
    </div>
  );
}

const KNOPF_BASIS =
  "inline-flex items-center justify-center gap-2 rounded-[14px] text-white " +
  "transition-all duration-200 disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0A6EDB]/30";

/**
 * Der Hauptknopf, volle Breite auf dem Handy.
 *
 * Zwei Farben, und der Unterschied ist eine Aussage: Dunkel ist der Knopf, der
 * eine Ansicht weiterführt, blau der eine Knopf, um den es geht. Im ganzen
 * Kennenlernen ist das genau einer, nämlich „Angaben absenden und Termin
 * aussuchen" (Punkt P6). Wäre jeder Weiter-Knopf blau, hätte der wichtigste
 * keine Farbe mehr übrig.
 */
export function Hauptknopf({
  children,
  onClick,
  disabled,
  type = "button",
  ohnePfeil = false,
  breit = false,
  farbe = "dunkel",
  gross = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  ohnePfeil?: boolean;
  /** Volle Breite auf allen Geräten, sonst nur auf dem Handy. */
  breit?: boolean;
  farbe?: "dunkel" | "blau";
  /** Größere Schrift und mehr Höhe, für den einen Knopf, der zählt. */
  gross?: boolean;
}) {
  const blau = farbe === "blau";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={
        `${KNOPF_BASIS} ${gross ? "px-8 py-[19px] text-[17px] font-semibold" : "px-7 py-[15px] text-base font-medium"} ` +
        `${breit ? "w-full" : "w-full sm:w-auto"} ` +
        (blau ? "hover:brightness-[1.06] hover:-translate-y-px" : "")
      }
      style={{
        background: blau ? `linear-gradient(180deg, #2E8AE8 0%, ${FARBE_BLAU} 100%)` : FARBE_DUNKEL,
        boxShadow: blau ? "0 14px 30px -14px rgba(10,110,219,.75)" : undefined,
      }}
    >
      {children}
      {!ohnePfeil && <ArrowRight className={gross ? "w-[20px] h-[20px]" : "w-[18px] h-[18px]"} aria-hidden />}
    </button>
  );
}

/**
 * Ein Kasten, der einfährt, statt von Anfang an dazustehen.
 *
 * Gebraucht an drei Stellen: für die Rückmeldung nach einer Antwort, für die
 * Erklärung nach einer falsch verstandenen Verständnisfrage und für die
 * Auskunft zu den Leads. Der Unterschied zwischen „blau" und „bernstein" ist
 * inhaltlich und nicht dekorativ: Bernstein sagt, dass etwas anders ist als
 * angenommen, und ist ausdrücklich kein Fehler; deshalb auch kein Rot.
 */
export function EinfahrKasten({
  ton = "blau",
  titel,
  children,
}: {
  ton?: "blau" | "bernstein";
  titel?: string;
  children: ReactNode;
}) {
  const farben = ton === "bernstein"
    ? { hintergrund: "#FDF6E7", text: "#8A5B08", titel: "#6B4405" }
    : { hintergrund: "#EEF5FD", text: "#0A5BB5", titel: "#08498F" };
  return (
    <div
      role="status"
      data-ton={ton}
      className="fb-einfahrt mt-5 rounded-2xl px-4 py-3.5 text-[14.5px] leading-relaxed"
      style={{ background: farben.hintergrund, color: farben.text }}
    >
      {titel && (
        <p className="font-semibold mb-0.5" style={{ color: farben.titel }}>{titel}</p>
      )}
      <div>{children}</div>
      <style>{`
@keyframes fb-einfahrt { from { opacity: 0; transform: translateY(-6px); max-height: 0; } to { opacity: 1; transform: none; max-height: 40rem; } }
.fb-einfahrt { animation: fb-einfahrt .38s cubic-bezier(.2,.8,.3,1) both; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .fb-einfahrt { animation: none; } }
      `}</style>
    </div>
  );
}

/**
 * Der Fuß eines Schritts: Zurück links, Weiter rechts, dazwischen bei
 * freiwilligen Fragen "Überspringen". Auf dem Handy steht der Weiter-Knopf
 * zuoberst und in voller Breite, damit der Daumen ihn erreicht.
 */
export function SchrittFuss({
  onZurueck,
  onWeiter,
  weiterText = "Weiter",
  weiterErlaubt,
  onUeberspringen,
  ueberspringenText = "Überspringen",
  sendet = false,
}: {
  onZurueck: () => void;
  onWeiter: () => void;
  weiterText?: string;
  weiterErlaubt: boolean;
  onUeberspringen?: () => void;
  ueberspringenText?: string;
  sendet?: boolean;
}) {
  return (
    <div className="mt-7 pt-5 border-t border-[#EEF0F3] flex flex-col-reverse gap-3.5 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onZurueck}
        className="inline-flex items-center justify-center gap-1.5 text-[15px] font-medium rounded-lg py-1 transition-colors hover:text-[#0F1621] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0A6EDB]/20"
        style={{ color: "#6E6E73" }}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden /> Zurück
      </button>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:gap-4">
        {onUeberspringen && (
          <button
            type="button"
            onClick={onUeberspringen}
            className="text-sm underline underline-offset-[3px] text-center rounded-lg py-1 transition-colors hover:text-[#0F1621] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0A6EDB]/20"
            style={{ color: "#6E6E73" }}
          >
            {ueberspringenText}
          </button>
        )}
        <Hauptknopf onClick={onWeiter} disabled={!weiterErlaubt || sendet} ohnePfeil={sendet}>
          {sendet ? "Wird gesendet …" : weiterText}
        </Hauptknopf>
      </div>
    </div>
  );
}

/** Die leise Zeile unter dem Fuß, etwa "Zwischenstand auf diesem Gerät gespeichert". */
export function Fussnote({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <p className="mt-4 flex items-start justify-center gap-1.5 text-[12.5px] leading-snug text-center" style={{ color: "#8A8F98" }}>
      {icon ?? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#1E9E5A" }} strokeWidth={2.4} aria-hidden />}
      <span>{children}</span>
    </p>
  );
}
