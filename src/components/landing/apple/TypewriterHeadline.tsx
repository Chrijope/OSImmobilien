import { useEffect, useRef, useState } from "react";

interface Props {
  /** Die Varianten, die nacheinander geschrieben und wieder gelöscht werden. */
  varianten: string[];
  className?: string;
  style?: React.CSSProperties;
  /** Ausrichtung innerhalb der reservierten Breite. Zentrierte Headlines: "center". */
  ausrichtung?: "links" | "center";
  /** Startet die Schleife erst, wenn das Element im Sichtfeld war. */
  erstBeimScrollen?: boolean;
  /**
   * Hält die Variante ab Tablet-Breite in einer Zeile.
   *
   * Am 16.09.2026 gewünscht: Auf dem Rechner brach „eine klare Strategie"
   * mitten im Satz um, weil die reservierte Breite in zwei Zeilen passte.
   * Auf dem Telefon bleibt der Umbruch erlaubt, sonst ragt die Zeile heraus.
   */
  einzeilig?: boolean;
}

const TIPP_MS = 55; // Tempo beim Schreiben
const LOESCH_MS = 28; // Löschen ist immer schneller als Schreiben
const PAUSE_VOLL_MS = 2200; // Standzeit, wenn ein Satz fertig ist
const PAUSE_LEER_MS = 350; // kurze Atempause vor der nächsten Variante

/**
 * Schreibmaschinen-Effekt für die Hero-Headline.
 *
 * Wichtig für ein ruhiges Ergebnis:
 *  - Der längste Text reserviert die Breite (unsichtbarer Platzhalter), damit
 *    beim Tippen nichts umbricht und die Zeile nicht springt.
 *  - Bei „prefers-reduced-motion" wird nur die erste Variante statisch gezeigt.
 *  - Der Cursor blinkt nur in Pausen, nicht während des Tippens — so wirkt es
 *    wie geschrieben und nicht wie eine Textbox.
 */
export function TypewriterHeadline({ varianten, className, style, ausrichtung = "links", erstBeimScrollen = false, einzeilig = false }: Props) {
  const [text, setText] = useState(varianten[0] ?? "");
  const [aktiv, setAktiv] = useState(false);
  const [pausiert, setPausiert] = useState(true);
  const timer = useRef<number>();
  const wurzel = useRef<HTMLSpanElement>(null);

  /*
   * Die Schleife hängt am Inhalt der Liste, nicht an ihrer Identität. Aufrufer
   * reichen die Liste oft als neues Array je Darstellung; ohne Schlüssel liefe
   * die Schleife bei jedem Neuzeichnen von vorn. Wechselt die Seitensprache,
   * ändert sich der Inhalt, und die erste Variante der neuen Sprache steht
   * sofort da, auch bei reduzierter Bewegung, wo keine Schleife läuft.
   */
  const schluessel = varianten.join("\u0000");
  const aktuelleVarianten = useRef(varianten);
  aktuelleVarianten.current = varianten;
  useEffect(() => {
    setText(aktuelleVarianten.current[0] ?? "");
    setPausiert(true);
  }, [schluessel]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (varianten.length < 2) return;

    if (!erstBeimScrollen || typeof IntersectionObserver === "undefined") {
      setAktiv(true);
      return;
    }
    const el = wurzel.current;
    if (!el) {
      setAktiv(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          setAktiv(true);
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    // Sicherheitsnetz: spaetestens nach 4 s laeuft die Schleife ohnehin.
    const fallback = window.setTimeout(() => {
      observer.disconnect();
      setAktiv(true);
    }, 4000);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [varianten.length, erstBeimScrollen]);

  useEffect(() => {
    if (!aktiv) return;
    const varianten = aktuelleVarianten.current;
    if (varianten.length < 2) return;

    let index = 0;
    let position = varianten[0].length;
    let loeschen = true;
    let abgebrochen = false;

    const schritt = () => {
      if (abgebrochen) return;

      if (loeschen) {
        position -= 1;
        setPausiert(false);
        setText(varianten[index].slice(0, position));
        if (position <= 0) {
          loeschen = false;
          index = (index + 1) % varianten.length;
          setPausiert(true);
          timer.current = window.setTimeout(schritt, PAUSE_LEER_MS);
          return;
        }
        timer.current = window.setTimeout(schritt, LOESCH_MS);
        return;
      }

      position += 1;
      setPausiert(false);
      setText(varianten[index].slice(0, position));
      if (position >= varianten[index].length) {
        loeschen = true;
        setPausiert(true);
        timer.current = window.setTimeout(schritt, PAUSE_VOLL_MS);
        return;
      }
      timer.current = window.setTimeout(schritt, TIPP_MS);
    };

    timer.current = window.setTimeout(schritt, PAUSE_VOLL_MS);

    return () => {
      abgebrochen = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [aktiv, schluessel]);

  return (
    <span
      ref={wurzel}
      className={`relative inline-block align-top ${einzeilig ? "whitespace-normal md:whitespace-nowrap" : ""}`}
    >
      {/* Reserviert Breite und Höhe der breitesten Variante, verhindert Umbruch-Springen.
          Alle Varianten liegen übereinander in derselben Rasterzelle: Die meisten
          Buchstaben heißen nicht die größte Breite („one clear concept“ ist breiter
          als „one clear strategy“), und nur so misst der Browser selbst. Der Rand
          rechts hält Platz für den Cursor frei, sonst bricht die breiteste Variante
          samt Cursor doch um. */}
      <span aria-hidden className="invisible grid" style={{ ...style, paddingRight: "0.15em" }}>
        {varianten.map((v, i) => (
          // Dieselbe Klasse wie die sichtbare Zeile: Stilregeln daran ändern etwa den Buchstabenabstand.
          <span key={i} className={className} style={{ gridArea: "1 / 1" }}>
            {v}
          </span>
        ))}
      </span>
      <span className={`absolute inset-0 block ${ausrichtung === "center" ? "text-center" : "text-left"}`}>
        <span className={className} style={style}>
          {text}
        </span>
        <span
          aria-hidden
          className="inline-block align-baseline"
          style={{
            width: "0.055em",
            height: "0.82em",
            marginLeft: "0.06em",
            transform: "translateY(0.06em)",
            background: "hsl(212 100% 52%)",
            borderRadius: "1px",
            animation: pausiert ? "tw-blink 1.05s steps(1,end) infinite" : "none",
            opacity: aktiv ? 1 : 0,
          }}
        />
      </span>
      <style>{`
        @keyframes tw-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
      `}</style>
    </span>
  );
}

export default TypewriterHeadline;
