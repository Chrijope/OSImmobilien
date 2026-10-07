/**
 * EXPATS Calculator, Oberflaeche.
 *
 * Vier Schritte, dann die Ergebnisseite: drei Fragen zur Person, danach die
 * Kontaktdaten. Zugeschnitten auf den Weg aus einer Meta-Anzeige: wenig Text,
 * grosse Flaechen, alles auf dem Handy bedienbar. Der ausfuehrliche Rechner
 * unter `/steuerrechner` bleibt unangetastet, er stellt acht Fragen und
 * rechnet genauer.
 *
 * WARUM DIESE SEITE ENGLISCH IST: Die Zielgruppe sind Expats in Deutschland,
 * die kein Deutsch sprechen. Nur diese eine Seite ist englisch, der Rest des
 * CRM bleibt deutsch, und die Kommentare hier ebenfalls. Der Lead, der am Ende
 * entsteht, wird im CRM auf Deutsch beschrieben, denn den liest der Partner.
 *
 * Gerechnet wird ausschliesslich in `expatsRechner.ts`, der Lead geht ueber
 * `expatsRechnerLead.ts` an `submit-lead`. Diese Datei fuehrt nur Regie.
 *
 * WARUM DIE KONTAKTDATEN VOR DEM ERGEBNIS STEHEN: Das ist der Zweck dieser
 * Fassung, sie ist eine Anzeigenstrecke. Der ausfuehrliche Rechner macht es
 * umgekehrt und zeigt das Ergebnis sofort, weil er aus dem persoenlichen Link
 * eines Partners heraus aufgerufen wird.
 *
 * Aufbau, Schrittfolge und Rechenweg folgen der Vorlage `go.expats-invest.de`.
 * Wortlaut und Gestaltung sind eigene, sie werden nicht uebernommen. Die
 * Huelle drumherum (Kopfzeile, Ueberschrift, Vertrauens- und Fusszeile) steht
 * in `@/components/expats/ExpatsHuelle`, dort stehen auch die beiden
 * Platzhalter fuer Zahlen, die noch belegt werden muessen.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  ExpatsFusszeile,
  ExpatsKopfbereich,
  ExpatsVertrauenszeile,
} from "@/components/expats/ExpatsHuelle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LEAD_EINWILLIGUNG_FEHLT_EN,
  LEAD_EINWILLIGUNG_TEXT_EN,
  LEAD_WERBUNG_TEXT_EN,
} from "@/lib/leadEinwilligung";
import { berechneExpats, EXPATS_ANNAHMEN, type ExpatsEingabe } from "@/lib/expatsRechner";
import { sendeExpatsLead } from "@/lib/expatsRechnerLead";
import { oeffentlicherTitel, useSeitentitel } from "@/lib/seitentitel";
import { mitSeitenSprache } from "@/lib/seitenSprache";

/* ── Anzeigehilfen ──────────────────────────────────────────────────────── */

/* Englische Zahlenschreibweise, weil die ganze Seite englisch ist. Ein
   deutscher Punkt als Tausendertrennung liest sich fuer diese Zielgruppe wie
   ein Dezimalkomma. */
const eur = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

/** Betrag mit Vorzeichen, fuer den Zahlungsstrom je Monat. */
const eurSigniert = (n: number) => `${n < 0 ? "−" : "+"}${eur(Math.abs(n))}`;

/** Prozentwerte aus den Annahmen, damit keine Zahl zweimal im Code steht. */
const proz = (anteil: number, stellen = 0) =>
  `${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(anteil * 100)}%`;

const nurZiffern = (text: string) => Number(text.replace(/[^\d]/g, "")) || 0;
const tausender = (n: number) => (n > 0 ? new Intl.NumberFormat("en-GB").format(n) : "");

const KAPITAL_VORSCHLAEGE = [10000, 25000, 50000, 100000];
const EINKOMMEN_VORSCHLAEGE = [80000, 100000, 150000, 200000];

const SCHRITT_TITEL = ["Capital", "Income", "Tax status", "Contact"];

/* ── Kleine Bausteine, nur hier gebraucht ───────────────────────────────── */

/**
 * Der vierteilige Balken oben in der Karte.
 *
 * Er sitzt bewusst INNERHALB der Karte und nicht darueber: So gehoert der
 * Fortschritt sichtbar zu der Frage, die gerade offen ist, und die Karte bleibt
 * das einzige Element, auf das der Blick faellt.
 */
function Fortschritt({ schritt }: { schritt: number }) {
  const gesamt = SCHRITT_TITEL.length;
  const aktuell = Math.min(schritt, gesamt);
  return (
    <div>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuenow={aktuell}
        aria-valuemin={1}
        aria-valuemax={gesamt}
      >
        {/*
          Die offene Spur war `bg-muted` und der erledigte Teil teilweise
          `bg-primary/45`. Beides sind helle Toene, auf einem 6 Pixel hohen
          Balken war der Unterschied kaum zu sehen. Jetzt: der erledigte Teil
          voll im Primaerblau, die offene Spur als spuerbar dunkleres Grau aus
          `foreground`. `foreground` statt eines festen Graus, weil es sich im
          Dunkelmodus mitdreht und die Spur dort hell auf dunkel bleibt.
        */}
        {SCHRITT_TITEL.map((titel, i) => (
          <div
            key={titel}
            className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/15 lg:h-2.5"
          >
            <div
              className={`h-full rounded-full bg-primary transition-all duration-500 ease-out ${
                i < aktuell ? "w-full" : "w-0"
              }`}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground lg:mt-3 lg:text-xs">
        <span className="font-medium text-foreground">
          Step {aktuell} of {gesamt}
        </span>
        <span aria-hidden="true">·</span>
        <span>{SCHRITT_TITEL[aktuell - 1]}</span>
      </p>
    </div>
  );
}

/**
 * Die Karte, in der jede Frage steht. Eine Frage je Ansicht, nie zwei.
 *
 * Der Fortschrittsbalken ist Teil der Karte, deshalb nimmt sie den Schritt
 * entgegen und zeichnet ihn selbst.
 */
function Frage({
  schritt,
  titel,
  hinweis,
  children,
}: {
  schritt: number;
  titel: string;
  hinweis: string;
  children: React.ReactNode;
}) {
  return (
    /*
      Die Innenabstaende sind auf dem Handy bewusst knapper als vorher
      (`p-4` statt `p-5`). Zusammen mit dem kuerzeren Kopfbereich ist das der
      Platz, den der Weiter-Knopf braucht, um ueber der Falzlinie zu bleiben.
      Ab der kleinen Breite gibt es den Platz wieder her, am Schreibtisch
      (`lg:`) grosszuegig: Dort war die Karte flach und die untere Haelfte des
      Bildschirms leer.
    */
    <div className="relative rounded-3xl border border-border bg-card p-4 shadow-apple-lg sm:p-7 lg:p-10">
      <Fortschritt schritt={schritt} />
      <h2 className="mt-4 text-base font-semibold leading-snug text-foreground sm:mt-5 sm:text-xl lg:mt-7 lg:text-2xl">
        {titel}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:mt-2 lg:mt-3 lg:text-base">
        {hinweis}
      </p>
      <div className="mt-4 sm:mt-5 lg:mt-7">{children}</div>
    </div>
  );
}

/**
 * Schnellwahl und freie Eingabe fuer einen Betrag.
 *
 * Die Flaechen sind 44 Pixel hoch. Das ist die von Apple und der WCAG
 * genannte Untergrenze fuer eine Flaeche, die man mit dem Daumen trifft.
 * Vorher waren es 48, die vier Pixel je Reihe sind bewusst hergegeben, damit
 * der Weiter-Knopf auf dem Handy ueber der Falzlinie bleibt. Der Weiter-Knopf
 * selbst behaelt seine 48.
 *
 * WARUM DIE KNOEPFE SO AUSSEHEN: Vorher waren es blasse Flaechen mit einem
 * Haarstrich als Rahmen, sie sahen aus wie abgeschaltete Felder. Jetzt tragen
 * sie einen zwei Pixel starken Rahmen und einen kleinen Schatten, also die
 * uebliche Sprache eines Knopfes. Ausgewaehlt heisst: gefuellte Flaeche
 * (`accent`), Rahmen im Primaerblau und dunklere, fettere Schrift, damit die
 * Wahl auch ohne Farbe erkennbar bleibt.
 */
function Betragsfeld({
  feldId,
  wert,
  setzeWert,
  vorschlaege,
  bezeichnung,
  weiter,
}: {
  feldId: string;
  wert: number;
  setzeWert: (n: number) => void;
  vorschlaege: number[];
  bezeichnung: string;
  weiter: () => void;
}) {
  return (
    <div className="space-y-3 lg:space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
        {vorschlaege.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setzeWert(v)}
            aria-pressed={wert === v}
            /* Am Schreibtisch hoeher und groesser beschriftet. Auf dem Handy
               bleiben es 44 Pixel, das ist dort die Daumengrenze und zugleich
               der Platz, den der Weiter-Knopf ueber der Falzlinie braucht. */
            className={`min-h-[2.75rem] rounded-xl border-2 px-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card lg:min-h-[3.75rem] lg:rounded-2xl lg:text-base ${
              wert === v
                ? "border-primary bg-accent font-semibold text-accent-foreground"
                : "border-foreground/30 bg-card font-medium text-foreground shadow-apple-xs hover:border-primary/60"
            }`}
          >
            {eur(v)}
          </button>
        ))}
      </div>
      {/* Das Feld fuer den eigenen Betrag bleibt sichtbar. Die vier
          Vorschlaege decken nicht jeden Fall ab, und wer seinen Betrag kennt,
          soll ihn nicht auf den naechsten Vorschlag runden muessen. */}
      <div>
        <Label htmlFor={feldId} className="text-xs text-muted-foreground lg:text-sm">
          {bezeichnung}
        </Label>
        <div className="relative mt-1 lg:mt-2">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground lg:left-4 lg:text-lg"
          >
            €
          </span>
          <Input
            id={feldId}
            inputMode="numeric"
            autoComplete="off"
            value={tausender(wert)}
            onChange={(e) => setzeWert(nurZiffern(e.target.value))}
            onKeyDown={(e) => {
              // Auf dem Handy steht auf der Tastatur ein Haken statt eines
              // Knopfes. Enter muss deshalb weiterfuehren.
              if (e.key === "Enter") {
                e.preventDefault();
                weiter();
              }
            }}
            placeholder="Your own amount"
            className="h-11 border-2 pl-8 text-base lg:h-14 lg:rounded-2xl lg:pl-10 lg:text-lg"
          />
        </div>
      </div>
    </div>
  );
}

/** Eine Zahl mit Bezeichnung. Bezeichnung oben, Haarstrich, Zahl darunter. */
function Kennzahl({
  bezeichnung,
  wert,
  zusatz,
}: {
  bezeichnung: string;
  wert: string;
  zusatz?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-apple-xs sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {bezeichnung}
      </p>
      <div aria-hidden="true" className="mt-2 h-px w-full bg-border" />
      <p className="mt-3 text-lg font-semibold tabular-nums text-foreground sm:text-xl">{wert}</p>
      {zusatz && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{zusatz}</p>}
    </div>
  );
}

/** Eine Zeile im Zahlungsstrom: Bezeichnung links, Betrag rechts. */
function Stromzeile({
  bezeichnung,
  wert,
  betont,
}: {
  bezeichnung: string;
  wert: string;
  betont?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2.5 ${
        betont ? "border-t border-border pt-3 font-semibold text-foreground" : ""
      }`}
    >
      <span className={`text-sm ${betont ? "" : "text-muted-foreground"}`}>{bezeichnung}</span>
      <span className="shrink-0 tabular-nums">{wert}</span>
    </div>
  );
}

/* ── Die Seite ──────────────────────────────────────────────────────────── */

export default function ExpatsRechner() {
  /* Im Browsertab stand bisher "OS Immobilien CRM" aus der `index.html`. Das ist
     der Name des internen Werkzeugs, deutsch, und auf einer oeffentlichen
     englischen Anzeigenseite falsch. Derselbe Helfer wie bei den anderen
     oeffentlichen Seiten, siehe `seitentitel.ts`. */
  useSeitentitel(oeffentlicherTitel("EXPATS Calculator"));

  const [schritt, setSchritt] = useState(1);
  const [kapital, setKapital] = useState(0);
  const [einkommen, setEinkommen] = useState(0);
  const [verheiratet, setVerheiratet] = useState<boolean | null>(null);

  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [einwilligung, setEinwilligung] = useState(false);
  const [werbung, setWerbung] = useState(false);
  /* Der Honigtopf gegen Bots. Das Feld steht ausserhalb des Bildschirms und
     ist fuer Menschen unsichtbar, es bleibt deshalb immer leer. Ist es
     gefuellt, nimmt `submit-lead` den Lead freundlich an und schreibt nichts.
     Die Seite ist die Zielseite bezahlter Anzeigen und damit das lohnendste
     Ziel unter den offenen Formularen. */
  const [honigtopf, setHonigtopf] = useState("");

  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);

  const eingabe: ExpatsEingabe = useMemo(
    () => ({ eigenkapital: kapital, jahresbrutto: einkommen, verheiratet: !!verheiratet }),
    [kapital, einkommen, verheiratet],
  );
  // Gerechnet wird bei jeder Aenderung neu. Der Aufwand ist winzig, dafuer
  // gibt es keinen Zustand, der dem Ergebnis hinterherhinken koennte.
  const ergebnis = useMemo(() => berechneExpats(eingabe), [eingabe]);

  const zurueck = () => {
    setFehler(null);
    setSchritt((s) => Math.max(1, s - 1));
  };

  const weiterVonKapital = () => {
    if (kapital <= 0) {
      setFehler("Please enter the capital you could invest.");
      return;
    }
    setFehler(null);
    setSchritt(2);
  };

  const weiterVonEinkommen = () => {
    if (einkommen <= 0) {
      setFehler("Please enter your annual gross income.");
      return;
    }
    setFehler(null);
    setSchritt(3);
  };

  const absenden = async () => {
    if (!vorname.trim() || !nachname.trim()) {
      setFehler("Please enter your first and last name.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFehler("Please enter a valid email address.");
      return;
    }
    /* Mindestens sechs Zeichen, genau wie im oeffentlichen Steuerrechner
       (`SteuerFormular.tsx`). Die Seite ist seit der Oeffnung ohne Anmeldung
       erreichbar, und eine einzelne Ziffer im Telefonfeld war bis dahin
       gueltig. Ein Lead ohne erreichbare Nummer kostet nur Arbeit. */
    if (telefon.trim().length < 6) {
      setFehler("Please enter a phone number so we can reach you.");
      return;
    }
    if (!einwilligung) {
      setFehler(LEAD_EINWILLIGUNG_FEHLT_EN);
      return;
    }
    setFehler(null);
    setSendet(true);
    const antwort = await sendeExpatsLead(
      { vorname, nachname, email, telefon, einwilligung, werbeeinwilligung: werbung, honigtopf },
      eingabe,
      ergebnis,
    );
    setSendet(false);
    if (!antwort.ok) {
      setFehler(antwort.fehler || "That did not work just now. Please try again.");
      return;
    }
    toast.success("Thank you, your result is ready.");
    setFertig(true);
    setSchritt(5);
  };

  const neuRechnen = () => {
    setFertig(false);
    setFehler(null);
    setSchritt(1);
  };

  /* ── Ergebnis ─────────────────────────────────────────────────────────── */

  const groessterVorteil = Math.max(...ergebnis.jahre.map((j) => j.steuervorteil), 1);

  /**
   * Der dunkle Kopf der Ergebnisseite, ueber die volle Breite.
   *
   * Er steht bewusst AUSSERHALB der mittigen Spalte, damit die Marineflaeche
   * wie beim Einstieg von Rand zu Rand laeuft. Darin nur die eine Sache, um
   * die es geht: die Steuerersparnis, im ersten Jahr und ueber zehn Jahre.
   * Beide gross, beide gleich wichtig. Die Karte darunter ragt in die Flaeche
   * hinein, genau wie die Fragenkarte am Anfang.
   */
  const ergebnisKopf = (
    <div className="bg-expats-marine">
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-1 sm:px-6 sm:pb-20 lg:max-w-4xl lg:px-8 lg:pb-28 lg:pt-2">
        <p className="flex items-center gap-2 text-xs text-info lg:text-sm">
          <Check className="h-4 w-4" aria-hidden="true" />
          We have your details. Here are your numbers.
        </p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-info sm:text-xs lg:mt-8 lg:text-sm">
          Estimated tax refund
        </p>
        <div className="mt-3 grid gap-5 sm:grid-cols-2 sm:gap-8 lg:mt-5 lg:gap-12">
          <div>
            <p className="text-[40px] font-semibold leading-none tabular-nums tracking-tight text-white sm:text-[56px] lg:text-[68px]">
              {eur(ergebnis.steuervorteilJahr1)}
            </p>
            <p className="mt-2 text-sm text-info/80 lg:mt-3 lg:text-base">
              In year one. Most of it is the one off renovation deduction.
            </p>
          </div>
          {/* Auf dem Handy trennt ein Haarstrich die beiden Zahlen, nebeneinander
              braucht es ihn nicht mehr. */}
          <div className="border-t border-white/15 pt-5 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0 lg:pl-12">
            <p className="text-[40px] font-semibold leading-none tabular-nums tracking-tight text-white sm:text-[56px] lg:text-[68px]">
              {eur(ergebnis.steuervorteilZehnJahre)}
            </p>
            <p className="mt-2 text-sm text-info/80 lg:mt-3 lg:text-base">
              Over {ergebnis.betrachtungsjahre} years. The sum of every year in the table below.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const ergebnisAnsicht = (
    <div className="space-y-5 lg:space-y-7">
      {/*
        DIE ZWEITE GROSSE GROESSE: der Vermoegensaufbau, sauber getrennt von
        der Liquiditaet. Die Karte schwebt ueber dem Marinekopf, dieselbe
        Wirkung wie bei der Fragenkarte am Anfang.

        WICHTIG UND BEWUSST: Hier steht ausschliesslich die TILGUNG, also der
        Teil des Darlehens, der in zehn Jahren zurueckgezahlt wird. Keine
        Wertsteigerung. Eine unterstellte Preissteigerung waere die einfachste
        Art, diese Zahl gross aussehen zu lassen, und zugleich die
        unehrlichste: Sie ist nicht belegbar und sie ist nicht verdient.
      */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-apple-lg sm:p-7 lg:p-10">
        <h2 className="text-base font-semibold text-foreground sm:text-lg lg:text-xl">
          And this is what you build
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3 sm:gap-5 lg:mt-6 lg:gap-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:min-h-[3em]">
              Loan repaid in {ergebnis.betrachtungsjahre} years
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-primary sm:text-3xl">
              {eur(ergebnis.tilgungZehnJahre)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Debt that becomes your own equity. No price growth assumed.
            </p>
          </div>
          <div className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:min-h-[3em]">
              Property you could hold
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
              {eur(ergebnis.objektvolumen)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              With {eur(ergebnis.eigenkapital)} of your own capital.
            </p>
          </div>
          <div className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:min-h-[3em]">
              Loan left after {ergebnis.betrachtungsjahre} years
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
              {eur(ergebnis.restschuld)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Down from {eur(ergebnis.darlehen)} at the start.
            </p>
          </div>
        </div>
        {/* Die Herleitung aus den drei Antworten. Sie bleibt sichtbar und
            wandert nicht ins Kleingedruckte: Wer nicht nachvollziehen kann,
            woher eine Zahl kommt, glaubt sie zu Recht nicht. */}
        <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
          Calculated from your answers: {eur(ergebnis.eigenkapital)} capital,{" "}
          {eur(ergebnis.jahresbrutto)} gross income per year,{" "}
          {ergebnis.verheiratet ? "married, joint assessment" : "single"}. The figures are an
          estimate for the {ergebnis.steuerjahr} tax year. What a real property does for you
          depends on the property itself.
        </p>
      </div>

      {/* Der Pflichthinweis. Er steht oben bei den Zahlen und nicht im
          Kleingedruckten: Steuerberatung darf nur leisten, wer dazu befugt ist
          (Steuerberatungsgesetz). */}
      <Alert>
        <Info className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>This is an estimate, not tax advice.</AlertTitle>
        <AlertDescription>
          The numbers show an order of magnitude based on standard assumptions. In Germany only a
          licensed tax adviser may advise you on your own situation, and we are not one. Please
          have your case confirmed by a Steuerberater before you decide anything.
        </AlertDescription>
      </Alert>

      {/* Zahlungsstrom je Monat. Die Reihenfolge ist Absicht: erst die echten
          Zahlungen, dann die Luecke, dann der Steuereffekt, und ganz zum
          Schluss der Dauerzustand ab dem zweiten Jahr. */}
      <div data-ui="card" className="rounded-2xl border border-border bg-card p-5 shadow-apple-xs">
        <h3 className="text-base font-semibold text-foreground">What it costs you each month</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A standard example, not a specific property.
        </p>
        <div className="mt-3">
          <Stromzeile
            bezeichnung={`Rent received (${proz(EXPATS_ANNAHMEN.mietrendite, 1)} gross yield)`}
            wert={`+${eur(ergebnis.mieteMonat)}`}
          />
          {/* Diese Zeile ist neu. Sie macht das Bild schlechter und gehoert
              genau deshalb hierher, siehe `bewirtschaftungskosten` im
              Rechenkern. */}
          <Stromzeile
            bezeichnung="Costs you cannot pass on (management, reserve, vacancy)"
            wert={`−${eur(ergebnis.bewirtschaftungMonat)}`}
          />
          <Stromzeile
            bezeichnung={`Loan payment (${proz(EXPATS_ANNAHMEN.zins, 1)} interest plus ${proz(
              EXPATS_ANNAHMEN.tilgung,
              1,
            )} repayment)`}
            wert={`−${eur(ergebnis.rateMonat)}`}
          />
          <Stromzeile
            bezeichnung="Out of your own pocket, before tax"
            wert={eurSigniert(ergebnis.zahlungsstromVorSteuerMonat)}
            betont
          />
          <Stromzeile
            bezeichnung={`Tax refund (${ergebnis.betrachtungsjahre} year average)`}
            wert={`+${eur(ergebnis.steuervorteilMonat)}`}
          />
          <Stromzeile
            bezeichnung={`After the tax refund (${ergebnis.betrachtungsjahre} year average)`}
            wert={eurSigniert(ergebnis.zahlungsstromNachSteuerMonat)}
            betont
          />
        </div>

        {/*
          DER EHRLICHE DAUERZUSTAND. Der Zehnjahresschnitt enthaelt den
          einmaligen Sanierungsabzug aus Jahr 1 und faellt deshalb freundlicher
          aus als jedes einzelne spaetere Jahr. Diese Zahl steht hier abgesetzt
          und nicht kleingedruckt, damit niemand mit dem Schnitt rechnet und
          dann ab Jahr 2 ueberrascht wird.
        */}
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-foreground">
              From year two, without the one off deduction
            </span>
            <span className="shrink-0 text-lg font-semibold tabular-nums text-foreground">
              {eurSigniert(ergebnis.zahlungsstromNachSteuerMonatAbJahr2)}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Year one carries the renovation deduction and no other year does, so the{" "}
            {ergebnis.betrachtungsjahre} year average above flatters the steady state. This is the
            figure to plan with.
          </p>
        </div>

        {/*
          Der Zusammenhang, den Christian ausdruecklich sehen will: Wer
          zuzahlt, kauft damit Vermoegen. Kein Schoenreden, sondern die
          Einordnung einer Zahl, die ehrlich negativ dasteht.
        */}
        <div className="mt-3 rounded-xl border border-primary/30 bg-accent p-4">
          <p className="text-sm font-medium text-accent-foreground">
            Paying in is not the same as spending.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-accent-foreground/85">
            {eur(ergebnis.jahre[0].tilgung / 12)} of that monthly loan payment is repayment in the
            first year, not interest, and that share grows every year. Averaged over{" "}
            {ergebnis.betrachtungsjahre} years it is {eur(ergebnis.tilgungMonat)} a month moving
            from the bank to you. Interest, the costs above and any shortfall are real expenses.
            Repayment is not.
          </p>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Rent is assumed constant and no price growth is assumed, in either direction. Purchase
          costs such as land transfer tax, notary and land registry are not in these figures, and
          neither is the renovation amount itself.
        </p>
      </div>

      {/* Balken je Jahr. Reine CSS-Hoehen, kein Diagrammpaket: fuer zehn Werte
          waere eine Bibliothek mehr Ladezeit als Nutzen. */}
      <div data-ui="card" className="rounded-2xl border border-border bg-card p-5 shadow-apple-xs">
        <h3 className="text-base font-semibold text-foreground">Tax refund by year</h3>
        <div className="mt-4 flex h-32 items-end gap-1.5" aria-hidden="true">
          {ergebnis.jahre.map((j) => (
            <div
              key={j.nummer}
              className={`flex-1 rounded-t ${j.nummer === 1 ? "bg-primary" : "bg-primary/40"}`}
              style={{ height: `${Math.max(3, (j.steuervorteil / groessterVorteil) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>Year 1</span>
          <span>Year {ergebnis.betrachtungsjahre}</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Year one carries the one off renovation deduction. Years two to{" "}
          {ergebnis.betrachtungsjahre} are the steady depreciation alone.
        </p>

        <div className="mt-4 -mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <caption className="sr-only">Estimated tax refund per year</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Year</th>
                <th className="py-2 pr-3 text-right font-medium">Depreciation</th>
                <th className="py-2 pr-3 text-right font-medium">Renovation</th>
                <th className="py-2 pr-3 text-right font-medium">Tax refund</th>
                <th className="py-2 text-right font-medium">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {ergebnis.jahre.map((j) => (
                <tr key={j.nummer} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">{j.nummer}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{eur(j.afa)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {j.sanierung > 0 ? eur(j.sanierung) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">
                    {eur(j.steuervorteil)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {eur(j.kumuliert)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kennzahl
          bezeichnung="Property volume"
          wert={eur(ergebnis.objektvolumen)}
          zusatz={`Your capital times ${EXPATS_ANNAHMEN.hebel}.`}
        />
        <Kennzahl
          bezeichnung="Loan"
          wert={eur(ergebnis.darlehen)}
          zusatz={`${proz(ergebnis.fremdkapitalAnteil)} of the purchase price financed by the bank.`}
        />
        <Kennzahl
          bezeichnung="Building value"
          wert={eur(ergebnis.gebaeudewert)}
          zusatz={`${proz(
            EXPATS_ANNAHMEN.gebaeudeanteil,
          )} of the property. Only the building is depreciated, the land is not.`}
        />
        <Kennzahl
          bezeichnung="Your marginal tax rate"
          wert={proz(ergebnis.grenzsteuersatz, 1)}
          zusatz="What the next euro of income costs you in tax."
        />
        <Kennzahl
          bezeichnung="Tax on your income today"
          wert={eur(ergebnis.steuerOhneImmobilie)}
          zusatz="Income tax per year without the property."
        />
        <Kennzahl
          bezeichnung="Share of deductions returned"
          wert={proz(ergebnis.rueckflussquote, 1)}
          zusatz="How much of every deducted euro comes back as tax."
        />
      </div>

      {/* Aufwand und Ersparnis, ausdruecklich getrennt. Genau diese
          Verwechslung hat im Projekt schon einmal fuer Verwirrung gesorgt. */}
      <div data-ui="card" className="rounded-2xl border border-border bg-card p-5 shadow-apple-xs">
        <h3 className="text-base font-semibold text-foreground">
          The renovation cost and the tax you save are two different numbers
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Renovation you pay for
            </p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">
              {eur(ergebnis.sanierungsaufwand)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Tax you save on it
            </p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">
              {eur(ergebnis.sanierungErsparnis)}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          The money leaves your account, and only the tax on it comes back. The{" "}
          {proz(EXPATS_ANNAHMEN.sanierungsanteil)} is the limit set by § 6 Abs. 1 Nr. 1a EStG:
          spend more than 15 percent of the building value on repairs in the first three years
          after buying, and the whole amount counts as acquisition related production cost. Then it
          is no longer deductible at once, only through depreciation, spread over decades.
        </p>
      </div>

      {/* Die drei fachlichen Warnungen. Sie stehen sichtbar auf der Seite und
          nicht nur im Kleingedruckten. */}
      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <h3 className="text-base font-semibold text-foreground">Read this before you believe the numbers</h3>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">
              {proz(EXPATS_ANNAHMEN.afaSatz, 1)} depreciation is not the standard rate.
            </span>{" "}
            The standard rate for a second hand flat is 2 percent per year, or 2.5 percent if it
            was completed before 1925. You only reach {proz(EXPATS_ANNAHMEN.afaSatz, 1)} with a
            surveyor's report on the remaining useful life, or through the declining balance
            depreciation for new builds. Without that, the refund is markedly smaller.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Capital times {EXPATS_ANNAHMEN.hebel} means about {proz(ergebnis.fremdkapitalAnteil)}{" "}
              of the price comes from the bank.
            </span>{" "}
            Not every buyer gets that. It depends on your income, your record, the property and
            what the bank makes of all three. Purchase costs such as land transfer tax, notary and
            land registry are not included here either.
          </li>
          <li>
            <span className="font-medium text-foreground">A calculator may calculate, it may not advise.</span>{" "}
            Tax advice in Germany is reserved for licensed advisers by the Steuerberatungsgesetz.
            This page gives you a rough figure to take into that conversation, nothing more.
          </li>
        </ul>
      </div>

      <details data-ui="card" className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground shadow-apple-xs">
        <summary className="cursor-pointer font-medium text-foreground">
          Assumptions and limits of this calculation
        </summary>
        <p className="mt-3">
          <span className="font-medium text-foreground">The property is a standard example.</span>{" "}
          Capital times {EXPATS_ANNAHMEN.hebel}, of which {proz(EXPATS_ANNAHMEN.gebaeudeanteil)} is
          building, a gross rental yield of {proz(EXPATS_ANNAHMEN.mietrendite, 1)}, interest of{" "}
          {proz(EXPATS_ANNAHMEN.zins, 1)} and {proz(EXPATS_ANNAHMEN.tilgung, 1)} initial repayment. No
          particular property is meant by this, and none is being recommended.
        </p>
        <p className="mt-3">
          <span className="font-medium text-foreground">
            The costs you cannot pass on to the tenant.
          </span>{" "}
          Management fees, a maintenance reserve and a vacancy allowance are charged at{" "}
          {proz(EXPATS_ANNAHMEN.bewirtschaftungskosten, 1)} of the purchase price per year, which is{" "}
          {eur(ergebnis.bewirtschaftungJahr)} here. That is the lower end of a realistic range of
          roughly {proz(0.0045, 2)} to {proz(0.007, 1)}, so your own figure is more likely to be
          higher than lower. These costs would also be deductible in a real tax return, which is
          one more reason the refund shown here is a cautious figure.
        </p>
        <p className="mt-3">
          <span className="font-medium text-foreground">
            How the repayment figure is calculated.
          </span>{" "}
          Year by year from the actual annuity, not as initial repayment times{" "}
          {ergebnis.betrachtungsjahre} years. With an annuity loan the repayment share grows as the
          debt falls, so the simple multiplication would understate what you build. Over{" "}
          {ergebnis.betrachtungsjahre} years it comes to{" "}
          {proz(ergebnis.darlehen > 0 ? ergebnis.tilgungZehnJahre / ergebnis.darlehen : 0, 1)} of
          the loan. No price growth is assumed anywhere on this page.
        </p>
        <p className="mt-3">
          <span className="font-medium text-foreground">How the refund is calculated.</span> As the
          difference between two tax amounts: tax on your income minus tax on your income after the
          deduction, under § 32a EStG for {ergebnis.steuerjahr}
          {EXPATS_ANNAHMEN.soli ? ", including solidarity surcharge" : ", without solidarity surcharge"}.
          That is what makes progression show up correctly, instead of multiplying your marginal
          rate by the deduction, which would overstate the result.
        </p>
        <p className="mt-3">
          <span className="font-medium text-foreground">What is deducted, and what is not.</span>{" "}
          Only depreciation and the renovation amount are deducted. Rent received and loan interest
          are left out of the tax side of this calculation. At these rates they largely cancel each
          other out, but in a real case they do not, and they belong in a proper rental result.
        </p>
        <p className="mt-3">
          <span className="font-medium text-foreground">Your income is used as a simplification.</span>{" "}
          The calculation treats your gross income as the taxable base. Your real taxable income is
          lower, after work related expenses, insurance contributions, children and church tax,
          none of which are asked for here. If a deduction is larger than your income, the
          remainder is simply dropped here, while in reality it would be carried forward to later
          years. Church tax and a sale of the property are not modelled at all. Your own figures
          will differ.
        </p>
      </details>

      <Button variant="outline" onClick={neuRechnen} className="min-h-[3rem] w-full sm:w-auto">
        Start again
      </Button>
    </div>
  );

  /* ── Die vier Fragen ──────────────────────────────────────────────────── */
  const fehlerzeile = fehler ? (
    <Alert variant="destructive" className="mt-4">
      <AlertDescription>{fehler}</AlertDescription>
    </Alert>
  ) : null;

  const zurueckKnopf = (
    <Button variant="outline" className="min-h-[3rem] lg:min-h-[3.75rem] lg:rounded-2xl lg:px-6" onClick={zurueck} disabled={sendet}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only sm:ml-1.5">Back</span>
    </Button>
  );

  const frageAnsicht = () => {
    if (schritt === 1) {
      return (
        <Frage
          schritt={1}
          titel="How much capital could you invest?"
          /* Gekuerzt von drei Zeilen auf zwei. Der Satz erklaert weiterhin,
             was gemeint ist, das war die Bedingung. Was wegfaellt, ist der
             Nachsatz zur Objektgroesse, und der steht ohnehin im Ergebnis. */
          hinweis="The money you would put in yourself. The bank brings the rest."
        >
          <Betragsfeld
            feldId="kapital"
            wert={kapital}
            setzeWert={setKapital}
            vorschlaege={KAPITAL_VORSCHLAEGE}
            bezeichnung="Or your own amount"
            weiter={weiterVonKapital}
          />
          {fehlerzeile}
          <div className="mt-4 sm:mt-5 lg:mt-7">
            <Button className="min-h-[3rem] w-full lg:min-h-[3.75rem] lg:rounded-2xl lg:text-base" onClick={weiterVonKapital}>
              Continue
            </Button>
          </div>
        </Frage>
      );
    }
    if (schritt === 2) {
      return (
        <Frage
          schritt={2}
          titel="What is your annual gross income?"
          hinweis="Your salary before any deductions. Paid monthly? Take the monthly gross times twelve. Married and assessed jointly? Use your household income."
        >
          <Betragsfeld
            feldId="einkommen"
            wert={einkommen}
            setzeWert={setEinkommen}
            vorschlaege={EINKOMMEN_VORSCHLAEGE}
            bezeichnung="Or your own amount"
            weiter={weiterVonEinkommen}
          />
          {fehlerzeile}
          <div className="mt-5 flex gap-2 lg:mt-7 lg:gap-3">
            {zurueckKnopf}
            <Button className="min-h-[3rem] flex-1 lg:min-h-[3.75rem] lg:rounded-2xl lg:text-base" onClick={weiterVonEinkommen}>
              Continue
            </Button>
          </div>
        </Frage>
      );
    }
    if (schritt === 3) {
      return (
        <Frage
          schritt={3}
          titel="How are you taxed?"
          hinweis="Married couples in Germany can be assessed jointly, which splits the income between both of you. That changes the tax, and with it the refund."
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:gap-3">
            {[
              { wert: false, titel: "Single", text: "Taxed on your own income" },
              { wert: true, titel: "Married", text: "Joint assessment, income splitting" },
            ].map((o) => (
              <button
                key={o.titel}
                type="button"
                onClick={() => {
                  setVerheiratet(o.wert);
                  setFehler(null);
                  setSchritt(4);
                }}
                aria-pressed={verheiratet === o.wert}
                /* Dieselbe Knopfsprache wie bei den Betraegen: zwei Pixel
                   Rahmen, Schatten, und ausgewaehlt gefuellt plus fett. */
                className={`min-h-[3.25rem] rounded-xl border-2 p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card lg:min-h-[4.5rem] lg:rounded-2xl lg:p-5 ${
                  verheiratet === o.wert
                    ? "border-primary bg-accent"
                    : "border-foreground/30 bg-card shadow-apple-xs hover:border-primary/60"
                }`}
              >
                <span
                  className={`block text-sm ${
                    verheiratet === o.wert
                      ? "font-semibold text-accent-foreground"
                      : "font-medium text-foreground"
                  }`}
                >
                  {o.titel}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{o.text}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex gap-2 lg:mt-7">{zurueckKnopf}</div>
        </Frage>
      );
    }
    return (
      <Frage
        schritt={4}
        titel="Where should we send your result?"
        hinweis="You will see your numbers on the next screen. We will also get in touch and walk through them with you."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="vorname">First name</Label>
              <Input
                id="vorname"
                autoComplete="given-name"
                value={vorname}
                onChange={(e) => setVorname(e.target.value)}
                className="mt-1.5 h-12 text-base"
              />
            </div>
            <div>
              <Label htmlFor="nachname">Last name</Label>
              <Input
                id="nachname"
                autoComplete="family-name"
                value={nachname}
                onChange={(e) => setNachname(e.target.value)}
                className="mt-1.5 h-12 text-base"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 h-12 text-base"
            />
          </div>
          <div>
            <Label htmlFor="telefon">Phone number</Label>
            <Input
              id="telefon"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+49 …"
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              className="mt-1.5 h-12 text-base"
            />
          </div>

          {/* Honigtopf, vor Bots versteckt und fuer Menschen unsichtbar. Wer
              ihn ausfuellt, ist kein Mensch: Der Lead wird angenommen und
              stillschweigend verworfen. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
            <Label htmlFor="company-website">Company website</Label>
            <Input
              id="company-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honigtopf}
              onChange={(e) => setHonigtopf(e.target.value)}
            />
          </div>

          {/* Der Pflichthaken ist bewusst nicht vorausgewaehlt: Eine
              vorausgewaehlte Einwilligung ist nach der DSGVO keine. */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
            <Checkbox
              id="einwilligung"
              checked={einwilligung}
              onCheckedChange={(v) => setEinwilligung(v === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="einwilligung"
              className="text-xs font-normal leading-relaxed text-muted-foreground"
            >
              {LEAD_EINWILLIGUNG_TEXT_EN}{" "}
              <a
                href={mitSeitenSprache("/datenschutz", "en")}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                Privacy policy (German)
              </a>
            </Label>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-3.5">
            <Checkbox
              id="werbung"
              checked={werbung}
              onCheckedChange={(v) => setWerbung(v === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="werbung"
              className="text-xs font-normal leading-relaxed text-muted-foreground"
            >
              {LEAD_WERBUNG_TEXT_EN}
            </Label>
          </div>

          {fehlerzeile}

          <div className="flex gap-2">
            {zurueckKnopf}
            <Button className="min-h-[3rem] flex-1 lg:min-h-[3.75rem] lg:rounded-2xl lg:text-base" onClick={absenden} disabled={sendet}>
              {sendet ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span className="ml-1.5">Sending</span>
                </>
              ) : (
                "Show my result"
              )}
            </Button>
          </div>
          {/* Die Zusagen "kostenlos, unverbindlich, keine Steuerberatung"
              stehen jetzt einmal in der Fusszeile und nicht mehr zusaetzlich
              hier, sonst steht dasselbe zweimal untereinander. */}
        </div>
      </Frage>
    );
  };

  /*
    Die Strecke ist schmaler als die Ergebnisseite. Eine Frage soll wie eine
    Karte in der Mitte stehen, das Ergebnis dagegen braucht Platz fuer Tabelle
    und Kennzahlen.
  */
  return (
    /*
      Der Kopfbereich geht ueber die volle Breite, alles darunter steht in
      einer mittigen Spalte mit seitlichem Rand. Der seitliche Rand ist neu:
      Vorher lag der Inhalt auf dem Handy bis an den Bildschirmrand, und die
      Bewertung rechts in der Kopfzeile wurde dort abgeschnitten.
    */
    <div className="w-full pb-10 lg:pb-16">
      <ExpatsKopfbereich mitHero={!fertig} breit={fertig} />
      {/* Der Ergebniskopf steht ausserhalb der mittigen Spalte, damit die
          Marineflaeche wie beim Einstieg von Rand zu Rand laeuft. Er schliesst
          nahtlos an die schmale Kopfzeile darueber an. */}
      {fertig && schritt === 5 && ergebnisKopf}

      {/* Der Warnkasten "Admin only, and the form creates a real lead" stand
          hier, solange die Seite nur fuer Admins erreichbar war. Sie ist jetzt
          oeffentlich und die Zielseite bezahlter Anzeigen. Ein Hinweis, der
          dem Besucher erklaert, dass er gerade einen echten Lead auslöst,
          gehoert dort nicht hin. Was rechtlich noetig ist, steht weiterhin auf
          der Seite: der Pflichthaken zur Einwilligung mit dem Verweis auf die
          Datenschutzerklaerung und der Hinweis, dass dies keine
          Steuerberatung ist. */}

      <div
        className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${
          fertig ? "max-w-3xl lg:max-w-4xl" : "max-w-2xl lg:max-w-3xl"
        }`}
      >
        {fertig && schritt === 5 ? (
          /* Dieselbe Ueberlappung wie beim Einstieg: Die erste Karte ragt in
             den Marinekopf hinein. Der Kopf bringt dafuer `pb-16` mit, das
             negative `mt` bleibt kleiner. */
          <div className="-mt-12 sm:-mt-16 lg:-mt-20">{ergebnisAnsicht}</div>
        ) : (
          <>
            {/*
              DAS HERZSTUECK DER GESTALTUNG: Die weisse Karte wird nach oben
              gezogen und ragt mit ihrem oberen Rand in die Marineflaeche
              hinein. Dadurch liest sich die Karte als das Naechste, was zu
              tun ist, und nicht als eine weitere Sektion untereinander. Der
              Kopfbereich bringt den passenden Unterrand dafuer mit (`pb-12`
              beziehungsweise `pb-16`), das negative `mt` hier ist stets
              kleiner als dieser Unterrand, sonst wuerde die Karte den
              Untertitel verdecken.
            */}
            <div className="-mt-9 sm:-mt-12 lg:-mt-20">{frageAnsicht()}</div>
            <ExpatsVertrauenszeile />
          </>
        )}

        {/* Die Fusszeile traegt Impressum und Datenschutz und steht deshalb auf
            JEDER Ansicht, nicht nur vor dem Absenden. Eine oeffentlich
            erreichbare Seite muss beides von ueberall her erreichbar machen
            (§ 5 DDG, Art. 13 DSGVO). Vorher stand sie nur im Fragen-Zweig und
            verschwand auf der Ergebnisseite. */}
        <ExpatsFusszeile />
      </div>
    </div>
  );
}
