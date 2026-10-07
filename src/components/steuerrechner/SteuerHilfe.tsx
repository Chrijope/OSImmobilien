/**
 * Der Block unter dem Fragenkasten: Ablauf, haeufige Fragen, Fusszeile.
 *
 * Zwei Regeln, die sich durch alle Texte ziehen:
 *
 *   1. Es meldet sich der VERTRIEBSPARTNER, dessen Link geoeffnet wurde, kein
 *      anonymer Experte. Sein Name steht deshalb ueberall dort, wo er bekannt
 *      ist. Ist er es nicht, wird neutral formuliert, nie erfunden.
 *   2. Versprochen wird nur, was auch passiert. Der Anruf kommt nicht von
 *      allein, sondern erst, wenn sich jemand fuer die Auswertung eintraegt.
 *      Genau so steht es hier.
 *
 * Die erste Frage ist die wichtigste und muss zum Haftungshinweis auf der
 * Ergebnisseite passen. Beide sagen dasselbe: unverbindliche Modellrechnung,
 * keine Steuerberatung.
 */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { STEUERRECHNER_TEXTE, type SteuerrechnerTexte } from "@/components/steuerrechner/steuerrechnerTexte";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

/*
 * Die oeffentlichen Saetze stehen in `steuerrechnerTexte.ts` unter `hilfe`.
 * Die Saetze der internen Fassung bleiben hier deutsch: Intern gibt es keinen
 * Sprach-Provider, sie erscheinen also nie auf Englisch.
 */

interface Props {
  /** Name des Vertriebspartners, falls bekannt. */
  beraterName?: string;
  /**
   * Die interne Fassung unter `/steuerrechner`.
   *
   * Dort gibt es weder Kontaktabfrage noch Mail, das Ergebnis steht sofort da.
   * Saetze wie „danach bekommst du die Auswertung per Mail“ waeren dort
   * schlicht falsch, deshalb tragen sie beide Faelle.
   */
  intern?: boolean;
}

/**
 * „dein Ansprechpartner“, solange kein Name aufgeloest werden konnte.
 *
 * Es gibt zwei Formen, weil der Rueckfall gebeugt werden muss: „gehen deine
 * Angaben an DEINEN Ansprechpartner“, aber „gehen deine Angaben an Christian
 * Peetz“. Mit nur einer Form stand dort ein Grammatikfehler.
 */
function ansprechpartner(t: SteuerrechnerTexte["hilfe"], name?: string): { wer: string; wen: string } {
  const sauber = (name || "").trim();
  if (sauber) return { wer: sauber, wen: sauber };
  return { wer: t.ansprechpartnerWer, wen: t.ansprechpartnerWen };
}

/* ── So einfach geht's ──────────────────────────────────────────────────── */

export function SoGehtEs({ beraterName, intern = false }: Props) {
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).hilfe;
  const { wer, wen } = ansprechpartner(t, beraterName);

  const punkte = [
    {
      titel: t.ausfuellenTitel,
      text: intern
        ? "Wenige Fragen, in unter einer Minute beantwortet. Am Ende trägst du deine Kontaktdaten ein, danach siehst du dein vollständiges Ergebnis auf dem Bildschirm."
        : t.ausfuellenText,
    },
    {
      titel: intern ? `${wer} meldet sich` : t.mailTitel,
      text: intern
        ? `Mit deiner Eintragung gehen deine Angaben an ${wen}, und du bekommst zusätzlich die Auswertung als PDF per Mail.`
        : t.mailText(wen),
    },
    {
      titel: t.gespraechTitel,
      text: t.gespraechText,
    },
  ];

  return (
    /* Die Kennung ist der Sprungpunkt des zweiten Verweises im Kopfbereich
       der oeffentlichen Seite. */
    <section data-ui="card" id="so-geht-es" className="scroll-mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold text-foreground">{t.soGehtEsTitel}</h2>
      <ol className="mt-4 space-y-4">
        {punkte.map((p, i) => (
          <li key={p.titel} className="flex gap-3.5">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{p.titel}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{p.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── Haeufige Fragen ────────────────────────────────────────────────────── */

export function HaeufigeFragen({ beraterName, intern = false }: Props) {
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).hilfe;
  const { wer } = ansprechpartner(t, beraterName);

  const fragen = [
    { frage: t.steuerberatungFrage, antwort: t.steuerberatungAntwort },
    { frage: t.kostenFrage, antwort: t.kostenAntwort },
    { frage: t.telefonFrage, antwort: t.telefonAntwort(wer) },
    {
      frage: t.weiterFrage,
      antwort: intern
        ? `Nach der letzten Frage trägst du deine Kontaktdaten ein. Danach siehst du dein Ergebnis vollständig auf dem Bildschirm und bekommst die Auswertung als PDF per Mail. Anschließend meldet sich ${wer} bei dir. Ob daraus ein Gespräch wird und ob du danach etwas tust, entscheidest allein du.`
        : t.weiterAntwort(wer),
    },
  ];

  return (
    <section data-ui="card" className="rounded-2xl border border-border bg-card px-6 py-2">
      <h2 className="pt-4 text-base font-semibold text-foreground">{t.fragenTitel}</h2>
      <Accordion type="single" collapsible className="mt-1">
        {fragen.map((f) => (
          <AccordionItem key={f.frage} value={f.frage} className="last:border-b-0">
            <AccordionTrigger className="text-left text-sm font-medium text-foreground hover:no-underline">
              {f.frage}
            </AccordionTrigger>
            <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
              {f.antwort}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

/* ── Fusszeile ──────────────────────────────────────────────────────────── */

/**
 * Impressum und Datenschutz liegen im Projekt unter `/impressum` und
 * `/datenschutz` (siehe die Routen in `App.tsx`). Beide oeffnen in einem neuen
 * Tab, damit der begonnene Rechner nicht verloren geht. Auf Englisch tragen
 * die Verweise `?lang=en`, damit das Ziel in derselben Sprache oeffnet.
 */
export function Fusszeile() {
  const sprache = useSeitenSprache();
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).hilfe;
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pb-2 text-xs text-muted-foreground">
      <span>© {new Date().getFullYear()} MOREImmo</span>
      <a
        href={mitSeitenSprache("/impressum", sprache)}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {t.impressum}
      </a>
      <a
        href={mitSeitenSprache("/datenschutz", sprache)}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {t.datenschutz}
      </a>
      <CookieEinstellungenLink sprache={sprache} className="underline underline-offset-2 hover:text-foreground" />
    </footer>
  );
}
