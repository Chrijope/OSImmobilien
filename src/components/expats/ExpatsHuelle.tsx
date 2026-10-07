/**
 * Die Huelle des EXPATS Calculator: alles ausser der eigentlichen Frage.
 *
 * Der dunkle Kopfbereich (Logo, Bewertung, Zielgruppenzeile, Ueberschrift,
 * Untertitel), die Vertrauenszeile und die Fusszeile. Sie stehen hier und
 * nicht in `ExpatsRechner.tsx`, damit die Seite selbst nur noch Regie fuehrt
 * und die Schrittfolge zeigt.
 *
 * Aufbau und Reihenfolge folgen der Vorlage `go.expats-invest.de`. Wortlaut,
 * Farben und Gestaltung sind eigene, aus den Tokens in `src/index.css`.
 *
 * WARUM ENGLISCH: Die Zielgruppe sind Expats in Deutschland, die kein Deutsch
 * sprechen. Sichtbare Texte englisch, Kommentare deutsch wie im ganzen Projekt.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ACHTUNG, WERBERECHT: Die Vorlage wirbt an zwei Stellen mit Zahlen ("1,000+
 * investors", fuenf Sterne, "1,000+ expats already use this with us"). Solche
 * Angaben duerfen wir nur zeigen, wenn sie fuer MORE Immo stimmen und belegbar
 * sind. Eine erfundene Bewertung oder Nutzerzahl ist irrefuehrende Werbung und
 * nach dem UWG angreifbar, dazu kaeme der Bildrechtsaerger bei fremden
 * Gesichtern. Deshalb stehen hier zwei Konstanten, die absichtlich `null` sind.
 * Solange sie `null` sind, zeigt die Seite an der Stelle einen sichtbar
 * gekennzeichneten Platzhalter statt einer Zahl. Wer eine belegbare Zahl hat,
 * traegt sie hier ein, und zwar nur hier.
 *
 * STAND 17.09.2026: Christian hat ausdruecklich entschieden, die Angaben der
 * Vorlage zu uebernehmen. Die Warnung oben bleibt deshalb wortwoertlich
 * stehen, denn sie gilt weiter: Die beiden Angaben muessen fuer MORE Immo
 * belegbar sein. Wer den Beleg nicht fuehren kann, setzt die betreffende
 * Konstante wieder auf `null`, dann steht dort der Platzhalter statt einer
 * Zahl, und sonst aendert sich nichts.
 * ────────────────────────────────────────────────────────────────────────────
 */
import logoImg from "@/assets/moreimmo-logo.png";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

/**
 * Bewertung in der Kopfzeile, rechts.
 *
 * `sterne` faerbt die fuenf Zeichen, `text` steht daneben. Bewusst freier
 * Text und keine Zahl plus Quelle: Die Vorlage schreibt dort "1,000+
 * investors", also eine Zahl von Anlegern und keine Zahl von Bewertungen. Ein
 * erzwungenes Feld `quelle` haette daraus einen Satz gemacht, den die Seite so
 * gar nicht sagen soll.
 *
 * Auf `null` setzen, wenn die Angabe nicht belegbar ist. Dann erscheint an der
 * Stelle wieder der gestrichelte Platzhalter.
 */
export const BEWERTUNG: { sterne: number; text: string } | null = {
  sterne: 5,
  text: "1,000+ investors",
};

/**
 * Sozialer Nachweis unter der Karte, direkt unter dem Weiter-Knopf.
 *
 * Bewusst als Text, damit niemand eine Zahl hart in das JSX schreibt. Auf
 * `null` setzen, wenn die Angabe nicht belegbar ist.
 */
export const SOZIALER_NACHWEIS: string | null = "1,000+ expats already use this with us";

/**
 * Die vier kurzen Zusagen in der Fusszeile, im Wortlaut der Vorlage.
 * Jede davon ist einlösbar.
 */
const ZUSAGEN = [
  "Free",
  "No obligation",
  "Your numbers stay yours",
  "An estimate, not tax advice",
];

/**
 * Ein sichtbar gekennzeichneter Platzhalter.
 *
 * Absichtlich gestrichelt und in Kleinschrift: Er soll auffallen und niemals
 * mit einer echten Angabe verwechselt werden. Verschwindet, sobald die
 * zugehoerige Konstante oben gefuellt ist.
 *
 * `aufDunkel` ist noetig, seit der Kopfbereich auf dem Marineton steht: Die
 * gedaempften Graustufen des hellen Hintergrunds waeren darauf nicht mehr zu
 * lesen.
 */
function Platzhalter({ text, aufDunkel }: { text: string; aufDunkel?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-dashed px-2.5 py-1 text-[11px] leading-none ${
        aufDunkel ? "border-white/50 text-white/80" : "border-muted-foreground/50 text-muted-foreground"
      }`}
    >
      {text}
    </span>
  );
}

/**
 * Fuenf Sterne als Umriss, rein dekorativ.
 *
 * Gefuellt im hellen Blau `--info` statt im Primaerblau: Das Primaerblau
 * (#087AC7) liegt auf dem Marineton fast auf der Flaeche und verschwindet.
 */
function Sterne({ sterne }: { sterne: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 lg:h-4 lg:w-4 ${
            i <= Math.round(sterne) ? "fill-info" : "fill-white/25"
          }`}
        >
          <path d="M10 1.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L10 14.9l-5.25 2.75 1-5.85L1.5 7.65l5.9-.85L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

/**
 * Der dunkle Kopfbereich: Marineflaeche mit Logo, Bewertung, Zielgruppenzeile,
 * Ueberschrift und Untertitel.
 *
 * WARUM DUNKEL: Die Seite ist die Zielseite bezahlter Anzeigen. Der Kopf
 * traegt die Marke, die weisse Fragenkarte darunter traegt die Aufgabe. Zwei
 * verschiedene Flaechen trennen beides auf einen Blick, und die Karte ragt
 * bewusst in den Kopf hinein (das `-mt-` steht in `ExpatsRechner.tsx`), damit
 * sie als das Naechste gelesen wird und nicht als eine weitere Sektion.
 *
 * WARUM DAS LOGO UMGEFAERBT WIRD: `moreimmo-logo.png` traegt schwarze Schrift
 * und waere auf dem Marineton unlesbar. Eine helle Fassung liegt nicht im
 * Projekt (`moreimmo-logo-dark.png` existiert nur als Lovable-Asset-Verweis,
 * nicht als Datei). `brightness-0 invert` faerbt das ganze Bild weiss und ist
 * im Projekt der eingefuehrte Weg fuer dunkle Flaechen, siehe
 * `landing/HeroSection.tsx`, `videoraum/Buehne.tsx` und die
 * Closing-Praesentation. Das hellblaue Haus wird dabei ebenfalls weiss, das
 * ist der bekannte und ueberall gleiche Kompromiss.
 *
 * `mitHero` schaltet Ueberschrift und Untertitel ab. Auf der Ergebnisseite
 * bleibt nur die schmale Zeile mit Logo und Bewertung stehen, dort ist die
 * Werbebotschaft erledigt und der Platz gehoert den Zahlen.
 *
 * `breit` richtet die Zeile an der breiteren Spalte der Ergebnisseite aus.
 * Ohne das staende das Logo auf der Ergebnisseite einen Daumen weiter innen
 * als die Karten darunter, und das faellt sofort auf.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM HIER SO VIELE `lg:`-KLASSEN STEHEN
 *
 * Am Schreibtisch klebte die Seite oben: Bei 1719 mal 1057 Pixeln endete die
 * Fusszeile bei 652, darunter waren 405 Pixel leer. Der Kopf bekommt deshalb
 * ab 1024 Pixeln deutlich mehr Luft, eine groessere Ueberschrift und den
 * laengeren Untertitel.
 *
 * AUSSCHLIESSLICH `lg:` UND NIEMALS `sm:`: Der Weiter-Knopf steht auf dem
 * Handy bei 521 Pixeln und damit ohne Scrollen sichtbar. Das ist der teuerste
 * Wert der ganzen Seite, denn fast alle Besucher kommen aus Instagram Stories.
 * `sm:` beginnt bei 640 Pixeln und waere fuer das Handy zwar auch folgenlos,
 * `lg:` bei 1024 laesst aber zusaetzlich Tablets in Ruhe, und genau dort
 * wuerde die grosse Ueberschrift kippen. Wer hier etwas aendert, prueft danach
 * wieder bei 375 und 390 Pixeln nach.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function ExpatsKopfbereich({
  mitHero = true,
  breit = false,
}: {
  mitHero?: boolean;
  breit?: boolean;
}) {
  return (
    <div className="bg-expats-marine">
      <div
        className={`mx-auto w-full px-4 pt-3 sm:px-6 lg:px-8 lg:pt-7 ${
          breit ? "max-w-3xl lg:max-w-4xl" : "max-w-2xl lg:max-w-3xl"
        } ${mitHero ? "pb-12 sm:pb-16 lg:pb-28" : "pb-4 lg:pb-7"}`}
      >
        <header className="flex items-center justify-between gap-3">
          <img
            src={logoImg}
            alt="MORE Immo"
            className="h-6 w-auto object-contain brightness-0 invert sm:h-7 lg:h-9"
          />
          {BEWERTUNG ? (
            <div className="flex items-center gap-1.5 text-[11px] text-white/80 sm:text-xs lg:text-sm">
              <Sterne sterne={BEWERTUNG.sterne} />
              <span className="tabular-nums">{BEWERTUNG.text}</span>
            </div>
          ) : (
            <Platzhalter text="Rating placeholder" aufDunkel />
          )}
        </header>

        {mitHero && (
          <div className="mt-5 text-center sm:mt-8 lg:mt-14">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-info sm:text-xs lg:text-sm">
              <span aria-hidden="true">🇩🇪</span> For expats paying income tax in Germany
            </p>
            {/*
              Die Ueberschrift ist kurz und laeuft auf dem Handy ueber zwei
              Zeilen. Die frueheren drei Zeilen plus fuenf Zeilen Untertitel
              haben den Weiter-Knopf unter die Falzlinie gedrueckt, und jeder
              noetige Scroll kostet bezahlte Besucher. Der enge Zeilenabstand
              ist derselbe Hebel und spart noch einmal gut zehn Pixel.

              Am Schreibtisch ist der Platz da, deshalb 56 statt 40 Pixel und
              ein etwas offenerer Zeilenabstand. `max-w-[18ch]` sorgt dafuer,
              dass die Zeile dort ueber drei Zeilen laeuft und nicht als ein
              langer Balken quer ueber den Bildschirm.
            */}
            <h1 className="mx-auto mt-2.5 max-w-[18ch] text-[27px] font-semibold leading-[1.08] tracking-tight text-white sm:text-[40px] lg:mt-6 lg:text-[56px] lg:leading-[1.1]">
              Turn your German tax into <span className="text-info">property of your own</span>.
            </h1>
            {/*
              ZWEI FASSUNGEN DESSELBEN UNTERTITELS, nicht zwei Aussagen.

              Auf dem Handy die kurze Zeile: Dort zaehlt jeder Pixel ueber der
              Falzlinie, und die fuenf Zeilen der langen Fassung hatten den
              Weiter-Knopf nach unten gedrueckt. Am Schreibtisch die lange
              Fassung: Dort ist der Platz ohnehin da, und sie beantwortet die
              Frage "was bekomme ich dafuer" schon vor der ersten Eingabe.

              Umgesetzt als zwei Absaetze mit `lg:hidden` und `hidden lg:block`
              statt als ein Absatz mit zwei Spans: So hat jede Fassung ihre
              eigene Breite, und ein Vorleseprogramm liest immer nur die eine,
              die gerade sichtbar ist.
            */}
            <p className="mx-auto mt-3 text-sm text-info/75 sm:text-base lg:hidden">
              Three questions. One minute. No sign-up.
            </p>
            <p className="mx-auto mt-3 hidden max-w-[54ch] text-sm leading-relaxed text-info/75 sm:text-base lg:mt-7 lg:block lg:text-lg">
              Three short questions, then your contact details. You get an estimate of your tax
              refund in year one and over ten years, and the size of property your capital could
              carry. It takes about a minute, and there is no sign-up.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Vertrauenszeile direkt unter der Karte. */
export function ExpatsVertrauenszeile() {
  return (
    <div className="flex justify-center pt-4 lg:pt-7">
      {SOZIALER_NACHWEIS ? (
        <p className="text-center text-xs text-muted-foreground lg:text-sm">{SOZIALER_NACHWEIS}</p>
      ) : (
        <Platzhalter text="Social proof placeholder" />
      )}
    </div>
  );
}

/** Fusszeile mit den vier Zusagen. */
export function ExpatsFusszeile() {
  return (
    <footer className="pt-4 lg:pt-8">
      <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-muted-foreground sm:text-xs lg:gap-x-3 lg:text-sm">
        {ZUSAGEN.map((z, i) => (
          <li key={z} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-muted-foreground/50">
                ·
              </span>
            )}
            <span>{z}</span>
          </li>
        ))}
      </ul>
      {/*
        Impressum und Datenschutz, so wie der oeffentliche Steuerrechner es
        loest (siehe `Fusszeile` in `components/steuerrechner/SteuerHilfe.tsx`).
        Seit die Seite oeffentlich ist, sind beide Pflicht: die
        Anbieterkennzeichnung nach § 5 DDG und die Informationen nach Art. 13
        DSGVO. Beide oeffnen in einem neuen Tab, damit der begonnene Rechner
        nicht verloren geht.

        Die Beschriftungen tragen den Zusatz "(German)": Die Seite ist
        englisch, beide Rechtstexte liegen nur auf Deutsch vor. Das ist ein
        offener Punkt und keine Loesung, siehe Bericht.

        Seit Etappe 6 (Plan Kundensprache) tragen beide Verweise `?lang=en`,
        damit die Rechtstexte englisch oeffnen, sobald es sie auf Englisch
        gibt. Die Seite selbst bleibt fest englisch.
      */}
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-muted-foreground lg:mt-4 lg:text-xs">
        <span>© {new Date().getFullYear()} MOREImmo</span>
        <a
          href={mitSeitenSprache("/impressum", "en")}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Legal notice (German)
        </a>
        <a
          href={mitSeitenSprache("/datenschutz", "en")}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy policy (German)
        </a>
        <CookieEinstellungenLink sprache="en" className="underline underline-offset-2 hover:text-foreground" />
      </p>
    </footer>
  );
}
