/**
 * Die Bausteine des Steuerrechners: Fortschritt, Frage, Kachel, Kennzahl,
 * hochzaehlende Zahl und die Messlatte.
 *
 * Sie liegen zusammen in einer Datei, weil sie nur hier gebraucht werden und
 * jede fuer sich zu klein fuer eine eigene waere.
 *
 * Die Gestaltung folgt einer Ordnung, die man aus einem Steuerbescheid kennt:
 * links die Bezeichnung, rechts ihre Einheit, ein Haarstrich darunter, darunter
 * die Zahl. Das eine Bild, an das man sich erinnert, ist die MESSLATTE. Sie
 * loest die alte Schreibweise „1.353 Euro bis 3.239 Euro“ ab, bei der zwei
 * Betraege mit einem Woertchen dazwischen standen und nichts daran zeigte, dass
 * das eine Ende sicher ist und das andere eine Voraussetzung hat. Als gemessene
 * Strecke sieht man beides auf einen Blick.
 */
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { STEUERRECHNER_TEXTE } from "@/components/steuerrechner/steuerrechnerTexte";

/** Achtet der Nutzer auf reduzierte Bewegung? */
export function moechteWenigBewegung(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

/* ── Fortschritt ────────────────────────────────────────────────────────── */

/**
 * Der Weg durch die Fragen.
 *
 * Drei Aenderungen gegenueber der ersten Fassung, jede mit einem Grund:
 * Der Balken ist hoeher, weil er vorher wie ein Haarriss aussah. Der laufende
 * Abschnitt ist eigens getoent, weil man vorher nur sah, wie weit man gekommen
 * ist, aber nicht, wo man gerade steht. Und neben der Zaehlung steht, worum es
 * im aktuellen Schritt geht, weil eine Position ohne Inhalt nichts sagt.
 */
export function Fortschritt({
  schritt,
  gesamt,
  label,
}: {
  schritt: number;
  gesamt: number;
  label?: string;
}) {
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).bausteine;
  return (
    <div className="mb-5">
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuenow={schritt}
        aria-valuemin={1}
        aria-valuemax={gesamt}
      >
        {Array.from({ length: gesamt }, (_, i) => {
          const erledigt = i < schritt - 1;
          const laeuft = i === schritt - 1;
          return (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  erledigt ? "w-full bg-primary" : laeuft ? "w-full bg-primary/45" : "w-0 bg-primary"
                }`}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t.fortschritt(schritt, gesamt)}</span>
        {label && (
          <>
            <span aria-hidden="true">·</span>
            <span>{label}</span>
          </>
        )}
      </p>
    </div>
  );
}

/* ── Vertrauenszeile ueber dem Balken ───────────────────────────────────── */

/**
 * Die drei Zusagen ueber dem Balken.
 *
 * Der dritte Punkt haengt an der Fassung, und das ist keine Feinheit, sondern
 * eine Frage der Wahrheit: Oeffentlich erscheint das Ergebnis seit dem
 * 17.09.2026 gar nicht mehr auf dem Bildschirm, es kommt als PDF per Mail.
 * „Ergebnis direkt im Anschluss“ waere dort eine Zusage, die die Seite nicht
 * mehr einloest. Intern stimmt sie weiter, dort gibt es weder Kontaktabfrage
 * noch Mail.
 */
export function Vertrauenszeile({ intern = false }: { intern?: boolean }) {
  const [kostenlos, schnell, perMail] = useSeitenTexte(STEUERRECHNER_TEXTE).bausteine.vertrauen;
  /* Intern gibt es keinen Sprach-Provider, der Satz dort ist also immer
     deutsch und steht deshalb nicht in der Textdatei. */
  const punkte = [kostenlos, schnell, intern ? "Ergebnis direkt im Anschluss" : perMail];
  return (
    <ul className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      {punkte.map((p) => (
        <li key={p} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
          {p}
        </li>
      ))}
    </ul>
  );
}

/* ── Karte mit einer Frage ──────────────────────────────────────────────── */

/**
 * Die Fragenkarte.
 *
 * Sie traegt jetzt sichtbar mehr Gewicht als alles andere auf der Seite: ein
 * kraeftigerer Schatten, ein feiner blauer Streifen an der Oberkante. Vorher
 * war sie eine von neun gleich aussehenden Kacheln, und das Auge fand nicht,
 * wo es hinsehen sollte.
 */
export function Frage({
  titel,
  hinweis,
  fuss,
  titelRef,
  children,
}: {
  titel: string;
  hinweis?: string;
  /**
   * Zeiger auf die Ueberschrift.
   *
   * Beim Schrittwechsel wandert der Fokus hierher. Das ersetzt den frueheren
   * Sprung an den Seitenanfang: Der war fuer Auge und Vorleseprogramm das
   * Zeichen, dass sich etwas geaendert hat, und ohne Ersatz waere der Wechsel
   * fuer Tastatur und Bildschirmleser stumm. Die Karte traegt den Schluessel
   * der Schritt-Kennung, die Ueberschrift ist bei jedem Schritt also ein neues
   * Element, und erst dadurch loest der Fokus ueberhaupt eine Ansage aus.
   */
  titelRef?: React.Ref<HTMLHeadingElement>;
  /**
   * Der Abschluss der Karte, in aller Regel der Weiter-Knopf.
   *
   * Er steht bewusst in einem eigenen Fach und nicht mitten im Inhalt: Die
   * Karte ist eine Spalte, das Fach haengt sich mit `mt-auto` an ihre
   * Unterkante, und der Zwischenraum darueber dehnt sich. Zusammen mit der
   * festen Mindesthoehe aus `steuerrechner.css` sitzt der Knopf damit auf
   * jedem Schritt an derselben Stelle, obwohl die Fragen verschieden viel
   * Text und verschieden viele Felder haben.
   */
  fuss?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="steuer-eintritt steuer-frage flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-apple-lg">
      <div aria-hidden="true" className="h-0.5 w-full bg-primary/70" />
      <div className="flex flex-1 flex-col p-6 md:p-8">
        <h2
          ref={titelRef}
          /* Nur fuer den programmatischen Fokus. Mit -1 bleibt die Ueberschrift
             aus der Tabulatorreihenfolge heraus, niemand muss also beim
             Durchtabben ueber sie hinweg. */
          tabIndex={titelRef ? -1 : undefined}
          className="text-xl font-semibold leading-snug tracking-tight text-foreground outline-none md:text-2xl"
        >
          {titel}
        </h2>
        {hinweis && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{hinweis}</p>}
        <div className="mt-6">{children}</div>
        {fuss && <div className="steuer-frage-fuss mt-auto">{fuss}</div>}
      </div>
    </div>
  );
}

/* ── Antwortkachel ueber die volle Breite ───────────────────────────────── */

/**
 * Eine Antwort.
 *
 * Das Gewaehlte trug vorher nur einen blauen Rahmen und eine Tuenche von fuenf
 * Prozent. Auf einem hellen Handybildschirm in der Sonne sah man das nicht.
 * Jetzt steht ein Haken daneben, die Auswahl ist also nicht mehr allein an der
 * Farbe zu erkennen. Die Mindesthoehe von 56 Pixeln ist die Daumenregel fuer
 * Beruehrungsziele.
 */
export function Kachel({
  titel,
  unterzeile,
  gewaehlt,
  onClick,
}: {
  titel: string;
  unterzeile?: string;
  gewaehlt: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={gewaehlt}
      className={`flex w-full min-h-[3.5rem] items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        gewaehlt
          ? "border-primary bg-accent shadow-apple-xs"
          : "border-border bg-background hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-semibold ${
            gewaehlt ? "text-accent-foreground" : "text-foreground"
          }`}
        >
          {titel}
        </span>
        {unterzeile && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {unterzeile}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          gewaehlt ? "border-primary bg-primary" : "border-input bg-transparent"
        }`}
      >
        {gewaehlt && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
      </span>
    </button>
  );
}

/* ── Knopf ueber die volle Breite ───────────────────────────────────────── */

export function Weiter({
  children,
  disabled,
  onClick,
  typ = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  typ?: "button" | "submit";
}) {
  return (
    <button
      type={typ}
      onClick={onClick}
      disabled={disabled}
      className="btn-brand mt-6 min-h-[3rem] w-full rounded-full px-6 py-3.5 text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

/* ── Kennzahl: Bezeichnung, Wert, Einheit ───────────────────────────────── */

/**
 * Eine Zahl mit ihrer Bezeichnung, in der Ordnung eines Bescheids.
 *
 * Steht auf hellem wie auf dunklem Grund. Sie ersetzt Stellen, an denen vorher
 * eine Zahl mitten in einem Fliesstext stand: „Ueber 10 Jahre sind das 11.501
 * Euro bis 27.532 Euro. Sie fuehren heute 17.726 Euro ab.“ Zwei wichtige
 * Groessen, versteckt in einem Satz.
 */
export function Kennzahl({
  bezeichnung,
  wert,
  einheit,
  dunkel = false,
}: {
  bezeichnung: string;
  wert: React.ReactNode;
  einheit?: string;
  dunkel?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-[11px] font-medium uppercase tracking-[0.1em] ${
          dunkel ? "text-background/55" : "text-muted-foreground"
        }`}
      >
        {bezeichnung}
      </div>
      <div
        className={`mt-1 text-[15px] font-semibold tabular-nums ${
          dunkel ? "text-background" : "text-foreground"
        }`}
      >
        {wert}
      </div>
      {einheit && (
        <div className={`text-xs ${dunkel ? "text-background/55" : "text-muted-foreground"}`}>
          {einheit}
        </div>
      )}
    </div>
  );
}

/* ── Die zwei Toene der Ergebnisseite ───────────────────────────────────── */

/**
 * Zwei Toene, mehr nicht.
 *
 *   gut      Was ein Kauf einbringt: Steuerersparnis und Vermoegensaufbau.
 *   achtung  Was er kostet oder voraussetzt: die monatliche Zuzahlung, der
 *            eigene Einsatz, die Bedingung des Gutachtens.
 *
 * Drei Regeln, die diese Stelle zusammenhalten:
 *
 *   1  Beide Toene bekommen dieselbe gestalterische Sorgfalt. Eine Seite, die
 *      das Gute farbig traegt und das Unangenehme grau im Fliesstext laesst,
 *      ist nicht gestaltet, sondern gefaerbt.
 *   2  Die Farbe traegt NIE allein eine Aussage. Jede Flaeche hat zusaetzlich
 *      ein Symbol, eine Beschriftung und, wo es um einen Betrag geht, ein
 *      Vorzeichen. Rund jeder zwoelfte Mann unterscheidet Rot und Gruen nicht.
 *   3  Auf getoenten Flaechen steht der Text in `foreground`, nie in
 *      `muted-foreground`. Gemessen am 17.09.2026: Im Dunkelmodus faellt
 *      `muted-foreground` auf einer getoenten Flaeche im Kopfbereich auf
 *      2,98:1 und ist damit unlesbar, `foreground` haelt dort 6,96:1.
 *      Abgestuft wird ueber Groesse und Fettung, nicht ueber Helligkeit.
 */
export type Ton = "gut" | "achtung";

export const TON: Record<Ton, { flaeche: string; rand: string; symbol: string }> = {
  gut: {
    flaeche: "bg-success/10",
    rand: "border-success/35",
    symbol: "text-success",
  },
  achtung: {
    flaeche: "bg-warning/10",
    rand: "border-warning/35",
    symbol: "text-warning",
  },
};

/**
 * Eine getoente Flaeche mit einer grossen Zahl.
 *
 * Sie loest den Fettdruck ab, an dem Christian haengen geblieben ist: „Man
 * ueberliest es schnell.“ Eine eigene Flaeche mit Rand und Symbol findet das
 * Auge auch dann, wenn es nur ueber die Seite fliegt.
 */
export function Grossflaeche({
  ton,
  symbol,
  bezeichnung,
  wert,
  einheit,
  aktiv,
  gross = false,
  children,
}: {
  ton: Ton;
  symbol: React.ReactNode;
  bezeichnung: string;
  wert: number;
  einheit?: string;
  aktiv: boolean;
  /** Die zwei Hauptzahlen stehen groesser als die Kennzahlen darunter. */
  gross?: boolean;
  children?: React.ReactNode;
}) {
  const t = TON[ton];
  return (
    <div className={`rounded-2xl border ${t.rand} ${t.flaeche} p-4 sm:p-5`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`shrink-0 ${t.symbol}`}>
          {symbol}
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">
          {bezeichnung}
        </p>
      </div>
      <div
        className={`mt-2 font-semibold tracking-tight text-foreground ${
          gross ? "text-[26px] sm:text-4xl md:text-[2.75rem]" : "text-2xl"
        }`}
      >
        <Zahl wert={wert} aktiv={aktiv} />
      </div>
      {einheit && <p className="mt-1 text-xs font-medium text-foreground">{einheit}</p>}
      {children}
    </div>
  );
}

/**
 * Ein getoenter Streifen fuer einen Satz, der gefunden werden muss.
 *
 * Gedacht fuer die Bedingung hinter einer grossen Zahl. Sie stand vorher als
 * grauer Fliesstext unter der Zahl und ging genau deshalb unter.
 */
export function Streifen({
  ton,
  symbol,
  children,
}: {
  ton: Ton;
  symbol: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = TON[ton];
  /* Auf dem Handy steht das Symbol ueber dem Text, nicht daneben: Die
     oeffentliche Seite zentriert dort ihren Text, und ein Symbol allein am
     linken Rand haengt daneben, statt zum Satz zu gehoeren. */
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-xl border ${t.rand} ${t.flaeche} px-4 py-3 sm:flex-row sm:items-start sm:gap-2.5`}
    >
      <span aria-hidden="true" className={`shrink-0 sm:mt-0.5 ${t.symbol}`}>
        {symbol}
      </span>
      <p className="text-xs leading-relaxed text-foreground">{children}</p>
    </div>
  );
}

/* ── Eine Zeile einer Aufstellung ───────────────────────────────────────── */

/**
 * Bezeichnung links, Betrag rechts, darunter bei Bedarf die Herleitung.
 *
 * Sie lag vorher nur in `SteuerMusterrechnung.tsx`. Seit die Ergebnisseite den
 * Vermoegensaufbau als eigene Aufstellung zeigt, brauchen beide dieselbe Zeile,
 * und zwei Fassungen davon waeren zwei Gestaltungen fuer dieselbe Sache.
 */
export function Zeile({
  text,
  wert,
  hinweis,
  betont = false,
  summe = false,
  ton,
}: {
  text: string;
  wert: string;
  hinweis?: string;
  betont?: boolean;
  summe?: boolean;
  /**
   * Toent die Zeile ein. Nur fuer Zwischen- und Endsummen gedacht, nicht fuer
   * jede Zeile: Waere alles getoent, waere nichts hervorgehoben, und genau das
   * war die Klage ueber den Fettdruck.
   */
  ton?: Ton;
}) {
  const t = ton ? TON[ton] : null;
  return (
    <div
      className={
        t
          ? `mt-2 flex items-baseline justify-between gap-4 rounded-xl border ${t.rand} ${t.flaeche} px-3.5 py-3`
          : `flex items-baseline justify-between gap-4 py-2.5 ${
              summe
                ? "mt-1 border-t-2 border-border pt-3"
                : "border-t border-border first:border-t-0"
            }`
      }
    >
      <span className="min-w-0">
        <span
          className={`block text-sm ${
            t || betont || summe ? "font-semibold text-foreground" : "text-muted-foreground"
          }`}
        >
          {text}
        </span>
        {hinweis && (
          <span
            className={`mt-0.5 block text-xs leading-relaxed ${
              t ? "font-normal text-foreground" : "text-muted-foreground"
            }`}
          >
            {hinweis}
          </span>
        )}
      </span>
      <span
        className={`shrink-0 tabular-nums text-foreground ${
          summe || t ? "text-xl font-semibold" : betont ? "text-base font-semibold" : "text-sm"
        }`}
      >
        {wert}
      </span>
    </div>
  );
}

/* ── Hochzaehlende Zahl ─────────────────────────────────────────────────── */

/**
 * Zaehlt in etwa 900 Millisekunden von null auf den Zielwert.
 *
 * Zwei Regeln, beide wichtig: Bei reduzierter Bewegung steht die Zahl sofort
 * da, und wer nicht animiert (`aktiv` ist falsch), sieht ebenfalls sofort den
 * echten Wert. Eine Zahl, die aus irgendeinem Grund bei null haengen bleibt,
 * waere schlimmer als gar keine Animation.
 *
 * Zurueck kommt ausserdem, OB gerade gezaehlt wird. Das braucht die Anzeige:
 * Waehrend des Zaehlens muessen alle Ziffern gleich breit sein, sonst zappelt
 * die Zahl bei jedem Bildaufbau seitwaerts. Steht sie still, sind die
 * natuerlichen Ziffernbreiten schoener, weil eine grosse Zahl mit lauter
 * Nullbreiten locker und auseinandergezogen wirkt.
 */
export function useHochzaehlen(
  ziel: number,
  aktiv: boolean,
  dauer = 900,
): { wert: number; laeuft: boolean } {
  const [wert, setWert] = useState(ziel);
  const [laeuft, setLaeuft] = useState(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!aktiv || moechteWenigBewegung() || typeof requestAnimationFrame === "undefined") {
      setWert(ziel);
      setLaeuft(false);
      return;
    }
    /*
     * Die Null wird erst im ERSTEN Bild gesetzt, nicht schon hier.
     *
     * Der Grund ist ein Fehler, der am 17.09.2026 auffiel: In einem Tab im
     * Hintergrund feuert `requestAnimationFrame` gar nicht. Wurde die Null
     * vorher gesetzt, blieb sie stehen, und die Seite zeigte als grösste Zahl
     * „0 €“. Wer sie in diesem Zustand sah, sah ein falsches Ergebnis, nicht
     * bloss eine fehlende Animation.
     *
     * So herum ist der schlimmste Fall, dass gar nicht gezählt wird und sofort
     * der richtige Betrag dasteht. Genau das soll es sein.
     */
    let start = 0;
    setWert(ziel);
    setLaeuft(true);
    const schritt = (jetzt: number) => {
      if (start === 0) {
        start = jetzt;
        setWert(0);
        rafRef.current = requestAnimationFrame(schritt);
        return;
      }
      const anteil = Math.min((jetzt - start) / dauer, 1);
      const geglaettet = 1 - Math.pow(1 - anteil, 3);
      setWert(ziel * geglaettet);
      if (anteil < 1) rafRef.current = requestAnimationFrame(schritt);
      else {
        setWert(ziel);
        setLaeuft(false);
      }
    };
    rafRef.current = requestAnimationFrame(schritt);
    return () => {
      cancelAnimationFrame(rafRef.current);
      /* Wer weggeht, waehrend gezaehlt wird, darf keinen halben Betrag
         hinterlassen. */
      setWert(ziel);
      setLaeuft(false);
    };
  }, [ziel, aktiv, dauer]);

  return { wert, laeuft };
}

export function Zahl({ wert, aktiv, klasse }: { wert: number; aktiv: boolean; klasse?: string }) {
  const { wert: gezeigt, laeuft } = useHochzaehlen(wert, aktiv);
  return (
    <span className={`${laeuft ? "tabular-nums" : "proportional-nums"} ${klasse ?? ""}`}>
      {eur(gezeigt)}
    </span>
  );
}

/* ── Die Messlatte ──────────────────────────────────────────────────────── */

/**
 * Die Spanne als gemessene Strecke.
 *
 * Der gefuellte Teil ist das, was jeder bekommt. Der offene Teil daneben ist
 * das, was ein Gutachten zur Restnutzungsdauer zusaetzlich moeglich macht. Beide
 * Enden sind beschriftet, links unten die Bezeichnung, darueber der Betrag.
 *
 * Zur Farbe: Die beiden Stufen sind zwei Schritte EINER Blaureihe, keine zwei
 * verschiedenen Farben. Das ist richtig so, denn hier stehen keine zwei Dinge
 * nebeneinander, sondern ein Weniger und ein Mehr derselben Sache. Auf hellem
 * Grund sind das Blau 700 und Blau 500, auf dunklem Blau 300 und Blau 500,
 * beide Paare auf Kontrast gegen ihren Untergrund geprueft.
 *
 * Zwischen den beiden Abschnitten liegt eine Luecke in der Farbe des
 * Untergrunds statt eines Strichs darum herum. Ein Strich waere Tinte, die
 * keine Angabe traegt.
 */
export function Messlatte({
  von,
  bis,
  vonBezeichnung,
  bisBezeichnung,
  aktiv,
  dunkel = false,
  zahlKlasse,
}: {
  von: number;
  bis: number;
  vonBezeichnung: string;
  bisBezeichnung: string;
  aktiv: boolean;
  dunkel?: boolean;
  zahlKlasse?: string;
}) {
  /* Null und identische Werte behalten ihre echten Proportionen. */
  const anteil = bis > 0 ? Math.min(1, Math.max(0, von / bis)) : 0;

  /* Der offene Teil ist derselbe Farbton, nur leiser. Zuerst stand dort die
     naechste Stufe der Reihe in voller Deckung, und das kippte die Aussage:
     Das kraeftigere Stueck rechts sah wichtiger aus als das sichere Stueck
     links, obwohl der Text daneben genau umgekehrt raet. Ein leiser Ton sagt
     „noch nicht, aber erreichbar“, ein kraeftiger sagt „hier entlang“. */
  const gefuellt = dunkel ? "bg-chart-provision" : "bg-chart-b2c";
  const offen = dunkel
    ? "bg-[hsl(var(--chart-provision)/0.3)]"
    : "bg-[hsl(var(--chart-b2c)/0.22)]";
  const gedaempft = dunkel ? "text-background/60" : "text-muted-foreground";
  const kraeftig = dunkel ? "text-background" : "text-foreground";

  return (
    <div>
      <div className="steuer-range-top flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className={`steuer-range-value ${zahlKlasse ?? "text-2xl font-semibold"} ${kraeftig}`}>
            <Zahl wert={von} aktiv={aktiv} />
          </div><span className="steuer-range-mobile-label hidden">{vonBezeichnung}</span>
        </div>
        <div className="min-w-0 text-right">
          <div className={`steuer-range-value ${zahlKlasse ?? "text-2xl font-semibold"} ${kraeftig}`}>
            <Zahl wert={bis} aktiv={aktiv} />
          </div><span className="steuer-range-mobile-label hidden">{bisBezeichnung}</span>
        </div>
      </div>

      {/* Die Latte selbst. Der gefuellte Teil misst sich von links aus. */}
      <div aria-hidden="true" className={`steuer-range-bar mt-3 flex h-2.5 w-full items-stretch gap-[2px] ${bis <= 0 ? "opacity-0" : ""}`}>
        <div
          className="overflow-hidden rounded-l-full rounded-r-[3px]"
          style={{ width: `${anteil * 100}%` }}
        >
          <div className={`h-full w-full ${gefuellt} ${aktiv ? "steuer-messen" : ""}`} />
        </div>
        <div className={`flex-1 rounded-l-[3px] rounded-r-full ${offen}`} />
      </div>

      <div className="steuer-range-labels mt-2 flex items-start justify-between gap-4 text-xs leading-snug">
        <span className={`min-w-0 flex-1 ${gedaempft}`}>{vonBezeichnung}</span>
        <span className={`min-w-0 flex-1 text-right ${gedaempft}`}>{bisBezeichnung}</span>
      </div>
    </div>
  );
}
