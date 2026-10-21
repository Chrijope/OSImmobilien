/**
 * Bausteine der Beratungspräsentation: Abschnitt (Folie), Überschrift mit
 * Goldakzent, Karte, Kopfzeile, große Zahl, Fußnote und die Farben.
 * Gemeinsam genutzt von `src/pages/BeratungspraesentationHV.tsx` und den
 * Konzeptfolien (`KonzeptFolien.tsx`).
 */
import { useSichtbar } from "./Bewegung";

/** Hell liegt auf dem Grund der Glasschicht, Grün und Tief sind dunkelgrüne Abschnitte. */
export type Ton = "hell" | "gruen" | "tief";

/*
 * Farben aus den Tokens des CRM (index.css, design-liquid.css). Die beiden
 * Grüntöne haben den Farbton von --primary, nur dunkel. Gold bleibt als
 * Akzent, wie im Logo; auf hellem Grund das dunklere Gold (--bos-akzent).
 */
export const FARBE = {
  /** Tannengrün und der dunkle Bildschirmgrund der Markenrichtlinie (18.10.2026). */
  gruen: "#12362A",
  tief: "#0C1F18",
  gold: "#CCAC05",
  goldDunkel: "var(--bos-akzent)",
  /** Grün als Schrift, auf Glas die dunklere Stufe der Glasschicht. */
  gruenText: "hsl(var(--lg-schrift-blau, var(--primary)))",
  primaer: "hsl(var(--primary))",
  tinte: "hsl(var(--foreground))",
  grau: "hsl(var(--muted-foreground))",
  linie: "hsl(var(--border))",
  hellText: "#F3F7F5",
  // 0,8 statt 0,68: kleine Schrift auf Dunkelgrün braucht 4,5:1 (gerechnet etwa 9:1).
  hellGedaempft: "rgba(243,247,245,0.8)",
  salbei: "#6F9A7E",
  /**
   * Akzent auf dunklem Grund (seit 21.10.2026, wie in der PDF): Mint statt
   * Gold, 8,3:1 auf Tannengrün. Gold bleibt für Zahlen, Kicker und Knöpfe.
   */
  mint: "#A7D7C5",
  /** Schrift auf Gold. */
  aufGold: "#14231B",
};

/** Text mit [[Akzent]]: die Teile in doppelten eckigen Klammern in der Akzentfarbe. */
export function mitAkzent(text: string, farbe: string) {
  return text.split(/\[\[|\]\]/).map((t, i) =>
    i % 2 ? (
      <span key={i} style={{ color: farbe }}>
        {t}
      </span>
    ) : (
      t
    ),
  );
}

/** Überschrift mit [[Akzent]]: auf hellem Grund dunkles Gold, auf Grün Mint. */
export function Titel({ text, ton, className = "" }: { text: string; ton: Ton; className?: string }) {
  return (
    <h2 className={`font-semibold leading-[1.12] tracking-[-0.022em] text-[2rem] sm:text-[2.6rem] md:text-[3.1rem] ${className}`}>
      {mitAkzent(text, ton === "hell" ? FARBE.goldDunkel : FARBE.mint)}
    </h2>
  );
}

/** Ein Abschnitt: hell auf dem Grund der Glasschicht oder dunkelgrün hinterlegt. */
export function Folie({
  id,
  ton,
  kicker,
  titel,
  children,
  oben,
  ohneStrich,
}: {
  id: string;
  ton: Ton;
  kicker?: string;
  titel?: string;
  children?: React.ReactNode;
  /** Steht über dem Kicker, etwa der Konzeptschalter. */
  oben?: React.ReactNode;
  ohneStrich?: boolean;
}) {
  const dunkel = ton !== "hell";
  // Der Inhalt blendet beim ersten Erscheinen sanft ein (Bewegung.tsx, beratung-os.css).
  const [ref, sichtbar] = useSichtbar<HTMLDivElement>(0.04);
  return (
    <section
      id={id}
      data-ton={ton}
      className={`relative scroll-mt-16 px-4 sm:px-8 md:px-12 py-14 md:py-20 ${dunkel ? "bos-dunkel" : ""}`}
      style={dunkel ? { background: ton === "gruen" ? FARBE.gruen : FARBE.tief, color: FARBE.hellText } : undefined}
    >
      {/* Eigenes Merkmal statt data-sichtbar: Sonst starteten alle Grafiken der Folie schon mit ihrem oberen Rand. */}
      <div ref={ref} className="max-w-6xl mx-auto bos-ein" data-ein={sichtbar ? "ja" : "nein"}>
        {oben && <div className="mb-8">{oben}</div>}
        {kicker && (
          <p className="bos-kicker mb-3" style={{ color: dunkel ? FARBE.gold : FARBE.gruenText }}>
            {kicker}
          </p>
        )}
        {titel && <Titel text={titel} ton={ton} />}
        {titel && !ohneStrich && <div className="mt-5 h-[3px] w-14 rounded-full" style={{ background: dunkel ? FARBE.gold : FARBE.primaer }} />}
        {children}
      </div>
    </section>
  );
}

/**
 * Karte. Hell: eine Karte der Glasschicht (`data-ui="card"` mit `bg-card`,
 * design-liquid.css macht sie zu Glas). Dunkel: die dunkle Scheibe
 * `.bos-glas-dunkel` aus beratung-os.css.
 */
export function Karte({
  dunkel,
  children,
  className = "",
  rand,
  randOben,
}: {
  dunkel?: boolean;
  children: React.ReactNode;
  className?: string;
  rand?: string;
  /** Farbige Oberkante wie die Kennzahl-Kästen der Vertriebs-PDFs. */
  randOben?: string;
}) {
  return (
    <div
      data-ui={dunkel ? undefined : "card"}
      className={`rounded-2xl border p-5 md:p-6 min-w-0 ${randOben ? "border-t-4" : ""} ${dunkel ? "bos-glas-dunkel" : "bg-card text-card-foreground"} ${className}`}
      style={rand || randOben ? { borderColor: rand, borderTopColor: randOben } : undefined}
    >
      {children}
    </div>
  );
}

/** Kleine Kopfzeile in Karten. */
export function Kopf({ children, dunkel }: { children: React.ReactNode; dunkel?: boolean }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.06em]" style={{ color: dunkel ? FARBE.hellGedaempft : FARBE.grau }}>
      {children}
    </p>
  );
}

/** Große Zahl. */
export function Wert({ children, farbe, klein }: { children: React.ReactNode; farbe?: string; klein?: boolean }) {
  return (
    <p
      className={`font-semibold tracking-[-0.02em] tabular-nums mt-2 leading-none break-words ${klein ? "text-[1.7rem]" : "text-[2rem] md:text-[2.4rem]"}`}
      style={{ color: farbe }}
    >
      {children}
    </p>
  );
}

export function Fussnote({ children, dunkel }: { children: React.ReactNode; dunkel?: boolean }) {
  return (
    <p className="mt-4 text-xs leading-relaxed" style={{ color: dunkel ? "rgba(243,247,245,0.72)" : FARBE.grau }}>
      {children}
    </p>
  );
}

/**
 * „Frage an Sie“: der helle Fragekasten der PDF-Präsentation mit goldener
 * Kante. Auf dunklem Grund als goldene Scheibe.
 */
export function FrageAnDich({ children, dunkel, className = "" }: { children: React.ReactNode; dunkel?: boolean; className?: string }) {
  return (
    <div
      data-testid="frage-an-dich"
      className={`rounded-2xl border-l-4 p-5 min-w-0 ${className}`}
      style={dunkel ? { background: "rgba(204,172,5,0.14)", borderColor: FARBE.gold, color: FARBE.hellText } : { background: "#FBF5D6", borderColor: FARBE.gold, color: "#14231B" }}
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em]" style={{ color: dunkel ? FARBE.gold : "#8A7404" }}>
        Frage an Sie
      </p>
      <p className="mt-2 text-base md:text-lg font-medium leading-snug">{children}</p>
    </div>
  );
}
