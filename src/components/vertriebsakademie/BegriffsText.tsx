// Begriffserklärung im Lehrtext der Vertriebsakademie.
//
// Ein erkannter Begriff wird gepunktet unterstrichen und öffnet auf Klick ein
// Popover mit einem Satz Klartext. Bewusst ein Popover und kein Tooltip: Der
// Radix-Tooltip und die HoverCard steigen bei `pointerType === "touch"` aus,
// beide öffnen auf einem Berührungsbildschirm gar nicht. Vertriebspartner
// lernen unterwegs, deshalb trägt der Klick. Am Rechner öffnet zusätzlich das
// Überfahren mit der Maus.
//
// Die Markierung ist ein Inline-Element (`span`), kein Knopf und kein
// zusätzliches Symbol im Satz. Ein `button` wäre `inline-block` und würde das
// Markieren mit der Maus über die Stelle hinweg zerreißen.

import { Fragment, useMemo, useRef, useState } from "react";
import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AKADEMIE_BEGRIFFE, type AkademieBegriff } from "@/lib/akademieBegriffe";
import { neuerMarkierer, type BegriffsSegment } from "@/lib/akademieBegriffeErkennung";

/** Textblöcke eines Abschnitts in Lesereihenfolge. */
export interface AbschnittsTexte {
  absaetze?: string[];
  bullets?: string[];
  profiTipp?: string;
  quereinsteigerHinweis?: string;
}

/** Fertig zerlegte Textblöcke, in derselben Ordnung wie die Eingabe. */
export interface AbschnittsBegriffe {
  absaetze: BegriffsSegment[][];
  bullets: BegriffsSegment[][];
  profiTipp: BegriffsSegment[] | null;
  quereinsteigerHinweis: BegriffsSegment[] | null;
}

/**
 * Zerlegt alle Textblöcke eines Abschnitts in einem Rutsch.
 *
 * Der Markierer wird bewusst innerhalb des `useMemo` erzeugt und nicht über
 * Renderdurchläufe hinweg aufgehoben. Sonst wäre seine Merkliste beim zweiten
 * Rendern schon voll und der Text verlöre alle Markierungen. Die Reihenfolge
 * hier entspricht der Reihenfolge auf dem Bildschirm, damit „erste Nennung"
 * auch die erste sichtbare ist.
 */
export function useAbschnittsBegriffe(texte: AbschnittsTexte): AbschnittsBegriffe {
  const { absaetze, bullets, profiTipp, quereinsteigerHinweis } = texte;
  return useMemo(() => {
    const markierer = neuerMarkierer(AKADEMIE_BEGRIFFE);
    return {
      absaetze: (absaetze ?? []).map((t) => markierer.markiere(t)),
      bullets: (bullets ?? []).map((t) => markierer.markiere(t)),
      profiTipp: profiTipp ? markierer.markiere(profiTipp) : null,
      quereinsteigerHinweis: quereinsteigerHinweis ? markierer.markiere(quereinsteigerHinweis) : null,
    };
  }, [absaetze, bullets, profiTipp, quereinsteigerHinweis]);
}

/** Rendert zerlegten Text. Ohne Treffer bleibt schlichter Text übrig. */
export function BegriffsText({ segmente }: { segmente: BegriffsSegment[] | null | undefined }) {
  if (!segmente) return null;
  return (
    <>
      {segmente.map((s, i) =>
        s.typ === "text" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : (
          <BegriffMarkierung key={i} text={s.text} begriff={s.begriff} />
        ),
      )}
    </>
  );
}

function BegriffMarkierung({ text, begriff }: { text: string; begriff: AkademieBegriff }) {
  const [offen, setOffen] = useState(false);
  // Wurde per Maus geöffnet? Dann darf der Fokus nicht hineinspringen und das
  // Verlassen schließt wieder.
  const perMaus = useRef(false);
  const schliessUhr = useRef<number | null>(null);

  const kannUeberfahren = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const uhrStoppen = () => {
    if (schliessUhr.current !== null) {
      window.clearTimeout(schliessUhr.current);
      schliessUhr.current = null;
    }
  };

  // Kleine Verzögerung, damit der Weg von der Markierung in den Kasten hinein
  // nicht schon schließt.
  const spaeterSchliessen = () => {
    if (!perMaus.current) return;
    uhrStoppen();
    schliessUhr.current = window.setTimeout(() => {
      perMaus.current = false;
      setOffen(false);
    }, 160);
  };

  return (
    <Popover
      open={offen}
      onOpenChange={(v) => {
        uhrStoppen();
        if (!v) perMaus.current = false;
        setOffen(v);
      }}
    >
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={`Begriff erklären: ${begriff.begriff}`}
          onPointerDown={() => { perMaus.current = false; }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              perMaus.current = false;
              setOffen((v) => !v);
            }
          }}
          onMouseEnter={() => {
            uhrStoppen();
            if (!offen && kannUeberfahren()) {
              perMaus.current = true;
              setOffen(true);
            }
          }}
          onMouseLeave={spaeterSchliessen}
          className="cursor-help rounded-sm underline decoration-dotted decoration-primary/50 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          {text}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-3"
        onOpenAutoFocus={(e) => { if (perMaus.current) e.preventDefault(); }}
        onMouseEnter={uhrStoppen}
        onMouseLeave={spaeterSchliessen}
      >
        <div className="space-y-2">
          <div className="text-sm font-semibold">{begriff.begriff}</div>
          <p className="text-xs leading-relaxed text-foreground/90">{begriff.erklaerung}</p>
          {begriff.imVerkauf && (
            <p className="border-t pt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/80">Im Verkauf: </span>
              {begriff.imVerkauf}
            </p>
          )}
          {begriff.mehr && <MehrLink ziel={begriff.mehr} onGefolgt={() => setOffen(false)} />}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MehrLink({ ziel, onGefolgt }: { ziel: string; onGefolgt: () => void }) {
  const intern = ziel.startsWith("/");
  const klasse =
    "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline";
  if (!intern) {
    return (
      <a href={ziel} target="_blank" rel="noreferrer" className={klasse} onClick={onGefolgt}>
        Ausführlich nachlesen <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return (
    <Link to={ziel} className={klasse} onClick={onGefolgt}>
      Ausführlich nachlesen <ArrowRight className="h-3 w-3" />
    </Link>
  );
}
