import { Loader2 } from "lucide-react";
import { Buehne, Balken, Kennung, FLAECHE_FELD, FLAECHE_FELD_KNOPF } from "@/components/videoraum/Buehne";
import { gliedereBeschreibung } from "@/lib/buchungAuswahl";
import { STANDARD_SPRACHE, texteFuer, type Sprache } from "@/lib/seitenSprache";
import { BUCHUNG_BAUSTEIN_TEXTE } from "./buchungTexte";

/**
 * Kleinteile, die sich die Buchungsseite und die Verwaltung eines Termins
 * teilen. Das Aussehen ist bewusst dasselbe wie im Videoraum, denn beides
 * bekommt derselbe Kunde per Link.
 *
 * Sprache (Kundensprache, Etappe 3): Bausteine mit eigenem Text nehmen
 * `sprache` an, Vorgabe Deutsch. Texte in `buchungTexte.ts`.
 */

/** Der Ladezustand, solange der Token noch aufgelöst wird. */
export function BuchungLaedt({ sprache = STANDARD_SPRACHE }: { sprache?: Sprache } = {}) {
  return (
    <Buehne>
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" aria-label={texteFuer(BUCHUNG_BAUSTEIN_TEXTE, sprache).laedt} />
      </div>
    </Buehne>
  );
}

/** Eine ganze Seite mit einer einzigen Aussage, etwa für einen toten Link. */
export function BuchungMeldung({
  kennung,
  titel,
  text,
  children,
}: {
  kennung?: string;
  titel: string;
  text: string;
  /** Optional ein Knopf unter dem Text, etwa der Weg zur Anmeldung. */
  children?: React.ReactNode;
}) {
  return (
    <Buehne>
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-24 text-center">
        {kennung && <Kennung>{kennung}</Kennung>}
        <h1 className="mt-3 max-w-2xl text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-[36px]">
          {titel}
        </h1>
        <Balken className="mt-6" />
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60">{text}</p>
        {children && <div className="mt-7 w-full max-w-[280px]">{children}</div>}
      </div>
    </Buehne>
  );
}

/** Beschriftetes Eingabefeld. Die Beschriftung steht immer da, nicht nur als Platzhalter. */
export function Feld({
  id,
  beschriftung,
  wert,
  aufWert,
  art = "text",
  platzhalter,
  pflicht = false,
  autoVervollstaendigen,
  maxLaenge,
  fehler,
  mehrzeilig = false,
  sprache = STANDARD_SPRACHE,
}: {
  id: string;
  beschriftung: string;
  wert: string;
  aufWert: (wert: string) => void;
  art?: "text" | "email" | "tel";
  platzhalter?: string;
  pflicht?: boolean;
  autoVervollstaendigen?: string;
  maxLaenge?: number;
  fehler?: string | null;
  mehrzeilig?: boolean;
  sprache?: Sprache;
}) {
  const gemeinsam = {
    id,
    value: wert,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => aufWert(e.target.value),
    placeholder: platzhalter,
    maxLength: maxLaenge,
    "aria-required": pflicht || undefined,
    "aria-invalid": fehler ? true : undefined,
    "aria-describedby": fehler ? `${id}-fehler` : undefined,
    className: `mt-2 w-full rounded-xl border ${FLAECHE_FELD} px-4 text-[15px] text-white outline-none placeholder:text-white/25 focus:border-[#88CFFF] ${
      fehler ? "border-[#E5372B]" : "border-white/15"
    } ${mehrzeilig ? "min-h-[92px] py-3" : "h-[48px]"}`,
  };

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-white/60">
        {beschriftung}
        {!pflicht && <span className="ml-1.5 font-normal text-white/30">{texteFuer(BUCHUNG_BAUSTEIN_TEXTE, sprache).optional}</span>}
      </label>
      {mehrzeilig ? (
        <textarea {...gemeinsam} autoComplete={autoVervollstaendigen} />
      ) : (
        <input {...gemeinsam} type={art} autoComplete={autoVervollstaendigen} />
      )}
      {fehler && (
        <p id={`${id}-fehler`} className="mt-1.5 text-[12px] text-[#FFB4AE]">
          {fehler}
        </p>
      )}
    </div>
  );
}

/**
 * Die Beschreibung einer Terminart, gegliedert in Absätze und Aufzählungen.
 *
 * In der Auswahl steht sie nur gekürzt. Beschreibungen sind im Alltag mehrere
 * Absätze lang, und wer noch wählt, will die Anliegen nebeneinander vergleichen
 * und nicht seitenweise scrollen. Der ganze Text erscheint, sobald das Anliegen
 * gewählt ist, denn dann ist er die Antwort auf genau eine Frage.
 *
 * Gekürzt wird nach Bausteinen und nicht nach Zeichen: So endet der Text nie
 * mitten im Wort. Gezählt werden dabei nur die Absätze. Eine Aufzählung, die zu
 * einem gezeigten Absatz gehört, bleibt vollständig stehen, sonst endete die
 * Vorschau regelmäßig hinter einem Doppelpunkt und sagte nichts. Damit eine
 * sehr lange Aufzählung die Liste trotzdem nicht sprengt, ist die Zahl der
 * Bausteine zusätzlich gedeckelt.
 */
export function Beschreibungstext({
  text,
  maxAbsaetze,
}: {
  text: string | null | undefined;
  maxAbsaetze?: number;
}) {
  const bloecke = gliedereBeschreibung(text);
  if (bloecke.length === 0) return null;

  const gezeigt: typeof bloecke = [];
  if (maxAbsaetze) {
    let absaetze = 0;
    for (const block of bloecke) {
      if (block.art === "absatz") {
        if (absaetze >= maxAbsaetze) break;
        absaetze += 1;
      }
      if (gezeigt.length >= maxAbsaetze + 2) break;
      gezeigt.push(block);
    }
  } else {
    gezeigt.push(...bloecke);
  }
  const gekuerzt = gezeigt.length < bloecke.length;

  return (
    <div className="mt-1.5 flex flex-col gap-2 text-[13px] leading-snug text-white/50">
      {gezeigt.map((block, i) =>
        block.art === "liste" ? (
          <ul key={i} className="flex flex-col gap-1">
            {block.punkte.map((punkt, j) => (
              <li key={j} className="flex gap-2">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/40" />
                <span className="min-w-0 break-words">{punkt}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line break-words">
            {block.zeilen.join("\n")}
          </p>
        ),
      )}
      {gekuerzt && <p aria-hidden className="text-white/30">…</p>}
    </div>
  );
}

/** Der blaue Knopf, mit dem es weitergeht. */
export function Hauptknopf({
  children,
  aufKlick,
  gesperrt = false,
  laedt = false,
  art = "button",
  sprache = STANDARD_SPRACHE,
}: {
  children: React.ReactNode;
  aufKlick?: () => void;
  gesperrt?: boolean;
  laedt?: boolean;
  art?: "button" | "submit";
  sprache?: Sprache;
}) {
  return (
    <button
      type={art === "submit" ? "submit" : "button"}
      onClick={aufKlick}
      disabled={gesperrt || laedt}
      className="flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#087AC7] text-[14.5px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(8,122,199,.7)] transition-opacity hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88CFFF] disabled:opacity-40"
    >
      {laedt ? <Loader2 className="h-4 w-4 animate-spin" aria-label={texteFuer(BUCHUNG_BAUSTEIN_TEXTE, sprache).bitteWarten} /> : children}
    </button>
  );
}

/** Der ruhige Knopf daneben. */
export function Nebenknopf({
  children,
  aufKlick,
  gesperrt = false,
}: {
  children: React.ReactNode;
  aufKlick: () => void;
  gesperrt?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={aufKlick}
      disabled={gesperrt}
      className={`flex h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 ${FLAECHE_FELD_KNOPF} text-[14.5px] font-semibold text-white/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88CFFF] disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

/** Fehlerhinweis über einem Knopf. Wird vorgelesen, sobald er erscheint. */
export function Fehlerzeile({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl border border-[#E5372B]/30 bg-[#E5372B]/10 px-4 py-3 text-[13px] leading-relaxed text-[#FFB4AE]">
      {text}
    </p>
  );
}

/** Die drei Schritte am Kopf der Buchungsseite. */
export function Schrittleiste({
  schritte,
  aktiv,
  sprache = STANDARD_SPRACHE,
}: {
  schritte: string[];
  aktiv: number;
  sprache?: Sprache;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label={texteFuer(BUCHUNG_BAUSTEIN_TEXTE, sprache).schritteBeschriftung}>
      {schritte.map((schritt, i) => {
        const istAktiv = i === aktiv;
        const erledigt = i < aktiv;
        return (
          <li key={schritt} className="flex items-center gap-2">
            <span
              aria-hidden
              className={`flex h-[22px] w-[22px] items-center justify-center rounded-lg text-[11px] font-bold ${
                istAktiv
                  ? "bg-[#087AC7] text-white"
                  : erledigt
                    ? "bg-[#88CFFF]/[0.18] text-[#88CFFF]"
                    : "bg-white/10 text-white/40"
              }`}
            >
              {i + 1}
            </span>
            <span
              aria-current={istAktiv ? "step" : undefined}
              className={`text-[12.5px] ${istAktiv ? "font-semibold text-white" : "text-white/40"}`}
            >
              {schritt}
            </span>
            {i < schritte.length - 1 && <span aria-hidden className="ml-1 h-px w-5 bg-white/15" />}
          </li>
        );
      })}
    </ol>
  );
}
