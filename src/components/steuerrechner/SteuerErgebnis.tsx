/**
 * Die Ergebnisseite des Steuerrechners.
 *
 * Drei Entscheidungen bestimmen alles Weitere, und alle drei sind
 * kaufmaennisch, nicht gestalterisch:
 *
 *   1  Oben stehen ZWEI Groessen nebeneinander, die Steuerersparnis und der
 *      Vermoegensaufbau. Das sind die beiden Dinge, die ein Kauf finanziell
 *      bringt, und sie sind verschieden: Die Ersparnis ist Geld, das nicht
 *      abfliesst, der Aufbau ist Eigentum, das entsteht. Daneben steht, was er
 *      kostet, naemlich die monatliche Zuzahlung und der Einsatz beim Kauf.
 *      Bis zum 17.09.2026 stand hier stattdessen eine Messlatte von der
 *      gesetzlichen bis zur nachgewiesenen Abschreibung. Ihr oberes Ende haengt
 *      an einer Nutzungsdauer von 25 Jahren statt der gesetzlich unterstellten
 *      50, und das gibt es nur mit Gutachten.
 *   2  Es faellt kein Immobilientyp mehr. Gerechnet wird an einem typisierten
 *      Objekt, das offen unter dem Ergebnis steht. Das Beschaeftigungs-
 *      verhaeltnis steuert es NICHT mehr, es ist nur noch ein Hinweis auf die
 *      Finanzierung. Vorher sprang die Ersparnis bei 85.000 Euro zwischen
 *      angestellt und selbststaendig von 8.218 auf 719 Euro, weil der
 *      Selbststaendige unter eine Schwelle fiel.
 *   3  Jede Zahl kommt aus dem Zehnjahresplan in `steuerRechner.ts`, keine aus
 *      einer Nebenrechnung hier. Vorher wies diese Seite an einer Stelle eine
 *      monatliche Zuzahlung aus und zwei Karten weiter eine frei verfuegbare
 *      Liquiditaet mit umgekehrtem Vorzeichen.
 *
 * Das Ergebnis am Bildschirm bleibt frei sichtbar. Die persoenliche Auswertung
 * als PDF gibt es gegen die Kontaktdaten, und sie kommt per Mail.
 *
 * Desktop: Ergebnis und Diagramme links, bearbeitbare Angaben und Anfrage
 * rechts. Mobil folgen diese Bereiche aufeinander. Ausfuehrliche Erklaerungen
 * und Modellannahmen bleiben ueber aufklappbare Bereiche erreichbar.
 */
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Briefcase,
  FileCheck2,
  Pencil,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BETRACHTUNG_JAHRE,
  berechne,
  spannenverlauf,
  type Ergebnis,
} from "@/lib/steuerRechner";
import { bundeslandById } from "@/lib/grunderwerbsteuer";
import {
  brauchtPartnereinkommen,
  partnereinkommen,
  startzeitpunktTitel,
  zuEingaben,
  type SchrittId,
  type SteuerAntworten,
} from "@/lib/steuerrechnerStrecke";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Grossflaeche,
  Kennzahl,
  Messlatte,
  Streifen,
  Zeile,
  eur,
} from "@/components/steuerrechner/bausteine";
import SteuerMusterrechnung from "@/components/steuerrechner/SteuerMusterrechnung";
import {
  BeschaeftigungFeld,
  BestandFeld,
  EinkommenFeld,
  KinderFeld,
  PartnerFeld,
  SteuerklasseFeld,
  WohnortFeld,
  ZeitpunktFeld,
} from "@/components/steuerrechner/SteuerEingabefelder";

/**
 * Alles, was sich auf der Ergebnisseite noch aendern laesst.
 *
 * Genau die Fragen der Strecke, keine mehr. Das Hebelziel ist bewusst nicht
 * dabei: Es wird in der Strecke nicht gefragt und aendert an der Spanne nichts.
 * Ein Bedienelement, das nichts bewirkt, ist schlimmer als keines.
 */
type ChipId = SchrittId;

interface Props {
  antworten: SteuerAntworten;
  aendern: (teil: Partial<SteuerAntworten>) => void;
  /** Beim ersten Erscheinen zaehlen die Zahlen hoch, danach nicht mehr. */
  erstmalig: boolean;
  /**
   * Springt zu dem Kasten ueber dem Ergebnis. Dort steht oeffentlich die
   * Bestaetigung der Eintragung und intern der Hinweis, dass an dieser Stelle
   * in der veroeffentlichten Fassung die Kontaktabfrage steht. Das Formular
   * selbst liegt seit dem 17.09.2026 VOR dem Ergebnis, siehe
   * `SteuerRechnerStrecke`.
   */
  onHandlung: () => void;
  /**
   * Beschriftung der beiden Handlungsknoepfe. Ohne Angabe bleibt der alte
   * Wortlaut. Steht die Eintragung schon hinter dem Besucher, waere ein
   * „anfordern“ eine Aufforderung zu etwas, das er gerade getan hat.
   */
  handlungText?: string;
}

/**
 * Achsenbeschriftung in Tausend. Die Null bleibt eine Null, „0 Tsd.“ ist keine.
 *
 * „T€“ stand hier vorher und ist Fachjargon aus dem Rechnungswesen. Wer ihn
 * nicht kennt, liest an einer Achse mit lauter T davor gar nichts.
 */
const tsd = (v: number) => (v === 0 ? "0 €" : `${Math.round(v / 1000)} Tsd. €`);

/** Prozentzahl in deutscher Schreibweise, ohne unnoetige Nullen. */
const prozent = (v: number, stellen = 1) =>
  v.toLocaleString("de-DE", { maximumFractionDigits: stellen });

export default function SteuerErgebnis({ antworten, aendern, erstmalig, onHandlung, handlungText }: Props) {
  const [offen, setOffen] = useState<ChipId | null>(null);

  const r: Ergebnis = useMemo(() => berechne(zuEingaben(antworten)), [antworten]);
  const s = r.spanne;
  const verlauf = useMemo(() => spannenverlauf(s), [s]);
  const land = bundeslandById(antworten.bundesland);

  const chips: Array<{ id: ChipId; text: string }> = [
    { id: "einkommen", text: `${eur(r.brutto)} brutto` },
    { id: "beschaeftigung", text: r.beschaeftigung.titel },
    { id: "steuerklasse", text: `Klasse ${antworten.steuerklasse}` },
    ...(brauchtPartnereinkommen(antworten)
      ? [{ id: "partner" as ChipId, text: `Partner ${eur(partnereinkommen(antworten))}` }]
      : []),
    {
      id: "kinder",
      text: antworten.kinder === 0 ? "Keine Kinder" : `${antworten.kinder} Kinder`,
    },
    { id: "wohnort", text: land ? land.name : "Wohnsitz offen" },
    {
      id: "bestand",
      text:
        antworten.bestehendeImmobilien === 0
          ? "Erstinvestor"
          : `${antworten.bestehendeImmobilien} Objekte`,
    },
    {
      id: "zeitpunkt",
      text: antworten.startzeitpunkt ? startzeitpunktTitel(antworten.startzeitpunkt) : "Startzeitpunkt",
    },
  ];

  const feld = (id: ChipId) => {
    const p = { antworten, aendern };
    switch (id) {
      case "einkommen": return <EinkommenFeld {...p} />;
      case "beschaeftigung": return <BeschaeftigungFeld {...p} />;
      case "steuerklasse": return <SteuerklasseFeld {...p} />;
      case "partner": return <PartnerFeld {...p} />;
      case "kinder": return <KinderFeld {...p} />;
      case "wohnort": return <WohnortFeld {...p} />;
      case "bestand": return <BestandFeld {...p} />;
      case "zeitpunkt": return <ZeitpunktFeld {...p} />;
    }
  };

  /*
   * Der Satz, der zwischen Aufwand und Ersparnis liegt.
   *
   * Er ist der Schluessel zu der Frage, an der Christian zweimal gestutzt hat:
   * „Den ganzen Erhaltungsaufwand kann ich doch im ersten Jahr abrechnen, warum
   * dann nur 14.000 Euro Ersparnis?“ Beides stimmt. Der Aufwand mindert das zu
   * versteuernde EINKOMMEN in voller Hoehe, und was davon als STEUER wegfaellt,
   * ist dieser Anteil. Wer die Zahl sieht, rechnet nicht mehr im Kopf.
   */
  const erhaltungSatz =
    s.erhaltung.bruttoAufwand > 0
      ? (s.erhaltung.ersparnisEinmalig / s.erhaltung.bruttoAufwand) * 100
      : 0;

  /*
   * Was im ersten Jahr monatlich übrig bleibt, nach Steuervorteil.
   *
   * Negativ heisst: Du zahlst zu. Das steht bewusst oben in der Ergebniskarte
   * und nicht versteckt weiter unten. Vorher wies die Seite an einer Stelle
   * eine monatliche Zuzahlung aus und zwei Karten weiter eine frei verfügbare
   * Liquidität mit umgekehrtem Vorzeichen. Es gibt nur eine Wahrheit, und sie
   * kommt jetzt aus demselben Plan wie alles andere.
   */
  const monatEigenanteil = s.plan[0].cashflowNachSteuer / 12;

  /* Dasselbe auf dem abgesicherten Weg, also ohne Gutachten. Es ist die
     unangenehmere der beiden Zahlen und steht deshalb dabei. */
  const monatEigenanteilSicher = s.planSicher[0].cashflowNachSteuer / 12;

  /* Die drei Posten. Zwei wirken jaehrlich, der dritte genau einmal, und genau
     das steht in der Unterzeile: Wer beides addiert, geht mit einer falschen
     Erwartung ins Gespraech. */
  const posten = [
    {
      titel: "Angesetzte Abschreibung, mit Gutachten",
      /* Die Marke sagt, wo dieser Posten in der Spanne oben liegt. Vorher
         musste man sich das selbst zusammenreimen: Drei Zeilen standen
         untereinander, und nichts verband sie mit den beiden Enden der
         Messlatte darueber. */
      rang: "Damit rechnet diese Seite",
      grundlage: `${prozent(s.erhoeht.satz)} Prozent vom Gebäudewert, ${eur(s.erhoeht.afaJahr)} im Jahr. Das entspricht ${s.erhoeht.restnutzungsdauer} Jahren Nutzungsdauer, also deutlich weniger als die ${s.nutzungsdauerGesetzlich} Jahre, die das Gesetz unterstellt.`,
      bedingung: "§ 7 Abs. 4 Satz 2 EStG. Nur mit Gutachten zum Objekt.",
      betrag: eur(s.erhoeht.ersparnisJahr),
      /* Die Einheit muss sagen, WAS der Betrag ist, nicht nur, wie oft er
         kommt. Stand hier nur „pro Jahr“, las sich die Zahl neben der
         Ueberschrift „Regulaere Abschreibung“ wie die Abschreibung selbst,
         obwohl sie die Ersparnis daraus ist. Genau dieser Verwechslung ist
         die Karte „Erhaltungsaufwand“ schon einmal zum Opfer gefallen. */
      zusatz: "Steuerersparnis pro Jahr",
    },
    {
      /* Nicht mehr „Erhöhte Abschreibung“: Als erhöhte Absetzungen bezeichnet
         das EStG die §§ 7b, 7h und 7i. § 7 Abs. 4 Satz 2 ist etwas anderes,
         nämlich die Abschreibung nach der tatsächlichen Nutzungsdauer. */
      titel: "Gesetzliche Abschreibung, ohne Nachweis",
      rang: "Abgesicherte Untergrenze",
      grundlage: `${prozent(s.regulaer.satz)} Prozent vom Gebäudewert, ${eur(s.regulaer.afaJahr)} im Jahr, das entspricht ${s.nutzungsdauerGesetzlich} Jahren Nutzungsdauer. ${s.regulaer.grund}. Diesen Satz bekommst du in jedem Fall, ohne Gutachten und ohne Nachweis.`,
      bedingung: `${s.regulaer.paragraf}. Gilt immer.`,
      betrag: eur(s.regulaer.ersparnisJahr),
      zusatz: "Steuerersparnis pro Jahr",
    },
    {
      /*
       * Der Aufwand gehoert in die Grundlage, nicht nur die Ersparnis.
       *
       * Bis zum 17.09.2026 stand auf dieser Karte allein die Ersparnis, also
       * etwa 13.968 Euro, unter der Ueberschrift „Erhaltungsaufwand". Das
       * liest jeder als den Aufwand selbst. Christian hielt die Zahl deshalb
       * fuer viel zu niedrig, denn bei ihren Objekten liegt der Aufwand bei
       * 40.000 Euro und mehr.
       *
       * Er hatte recht, und der Rechner auch: Bei 85.000 Euro Jahresbrutto
       * rechnet er mit 42.483 Euro Aufwand brutto und daraus knapp 14.000
       * Euro Ersparnis. Beide Zahlen stimmten, nur stand die eine unter dem
       * Namen der anderen.
       */
      titel: "Erhaltungsaufwand",
      rang: "Nicht in der Spanne",
      grundlage: `Bis zu ${eur(s.erhaltung.bruttoAufwand)} Instandsetzung nach dem Kauf, das sind 15 Prozent des Gebäudewerts netto und mit Umsatzsteuer ${prozent(s.erhaltung.anteilProzent, 2)} Prozent. Darüber gelten die Kosten als Herstellungskosten und müssen abgeschrieben werden. Von diesem Aufwand kommen ${prozent(erhaltungSatz)} Prozent als Steuer zurück, denn er mindert dein zu versteuerndes Einkommen und nicht deine Steuer.`,
      bedingung: "§ 6 Abs. 1 Nr. 1a EStG. Nur wenn solche Arbeiten anfallen.",
      betrag: `bis zu ${eur(s.erhaltung.ersparnisEinmalig)}`,
      zusatz: `Steuerersparnis, einmalig im ersten Jahr`,
    },
  ];

  /* Der Korridor der Grafik. Recharts zeichnet aus einem Wertepaar eine
     Flaeche zwischen den beiden Enden. */
  const verlaufsdaten = verlauf.map((z) => ({
    ...z,
    korridor: [z.vonKumuliert, z.bisKumuliert] as [number, number],
  }));

  return (
    <div className="steuer-result">
      <div className="steuer-result-heading"><h2>Dein Ergebnis im Überblick</h2><span>Vereinfachte Modellrechnung</span></div>
      <div className="steuer-result-grid"><div className="steuer-result-main">
      {/*
        1 Die Ergebniskarte.

        Sie zeigt jetzt ZWEI Groessen nebeneinander statt einer Spanne, und das
        hat zwei Gruende.

        Der kaufmaennische: Gefragt wird nach dem, was ein Kauf finanziell
        bringt, und das sind zwei verschiedene Dinge. Die Steuerersparnis ist
        Geld, das nicht abfliesst. Der Vermoegensaufbau ist Eigentum, das
        entsteht. Sie gehoeren nebeneinander und duerfen nicht vermischt werden.

        Der rechnerische: Vorher stand hier eine Messlatte von der gesetzlichen
        bis zur erhoehten Abschreibung, und sie war das Bild der ganzen Seite.
        Ihr oberes Ende haengt an einer Nutzungsdauer von 25 Jahren statt der
        gesetzlich unterstellten 50, und das traegt nur ein Gutachten. Eine
        Bedingung dieser Groesse gehoert nicht in die Ueberschrift. Der Weg mit
        Gutachten steht deshalb weiter unten, wo er hingehoert: als Aufschlag
        mit Bedingung, nicht als Hauptaussage.
      */}
      <div
        className={`steuer-result-hero overflow-hidden rounded-2xl bg-accent text-foreground ${
          erstmalig ? "steuer-eintritt" : ""
        }`}
      >
        <div className="px-6 py-7 md:px-9 md:py-9">
          {/*
            Beide Zeilen standen in `muted-foreground`. Gemessen am 17.09.2026
            im Dunkelmodus auf dem Untergrund des Kopfbereichs: 4,44:1, also
            knapp unter den 4,5:1, die eine normale Schrift braucht. Sie stehen
            deshalb jetzt in `foreground` und sind ueber Groesse und Fettung
            abgestuft statt ueber Helligkeit. Danach sind es 8,4:1.
          */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
              Was dir eine Wohnung bringt
            </p>
            <p className="text-xs font-medium text-foreground">
              Modellrechnung über {BETRACHTUNG_JAHRE} Jahre
            </p>
          </div>
          <div aria-hidden="true" className="mt-3 h-px w-full bg-primary/15" />

          {/*
            Die beiden Hauptzahlen, jede auf eigener getoenter Flaeche.

            Vorher standen sie als fette Zahlen auf dem gleichmaessigen
            Untergrund des Kopfbereichs. Christians Einwand am 17.09.2026:
            „Aktuell ist es ja nur entweder fett gedruckt, aber man ueberliest
            es schnell.“ Eine eigene Flaeche mit Rand und Symbol findet das
            Auge auch im Vorbeifliegen.

            Beide sind gleich gross, weil keine von beiden der anderen
            untergeordnet ist.
          */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Grossflaeche
              ton="gut"
              symbol={<TrendingUp className="h-4 w-4" />}
              bezeichnung="Deine Steuerersparnis"
              wert={s.jahr1.bis}
              einheit="im ersten Jahr"
              aktiv={erstmalig}
              gross
            >
              <p className="mt-3 border-t border-success/25 pt-3 text-sm text-foreground">
                <span className="font-semibold">{eur(s.zehnJahre.bis)}</span> über{" "}
                {BETRACHTUNG_JAHRE} Jahre
              </p>
            </Grossflaeche>

            <Grossflaeche
              ton="gut"
              symbol={<Wallet className="h-4 w-4" />}
              bezeichnung="Dein Vermögensaufbau"
              wert={s.vermoegen.aufbau}
              einheit={`in ${BETRACHTUNG_JAHRE} Jahren`}
              aktiv={erstmalig}
              gross
            >
              <p className="mt-3 border-t border-success/25 pt-3 text-sm text-foreground">
                <span className="font-semibold">{eur(s.vermoegen.tilgung)}</span> getilgt, dazu{" "}
                <span className="font-semibold">{eur(s.vermoegen.wertsteigerung)}</span> Wertzuwachs
              </p>
            </Grossflaeche>
          </div>

          {/*
            Die Bedingung gehoert an die Zahl und nicht ins Kleingedruckte.

            Sie stand hier als grauer Fliesstext unter der Steuerersparnis und
            ging genau deshalb unter. Jetzt traegt sie eine eigene Flaeche im
            Achtung-Ton, mit demselben Gewicht wie die guten Zahlen darueber.
            Wer nur die farbigen Flaechen ueberfliegt, muss trotzdem sehen,
            woran die grosse Zahl haengt.
          */}
          <div className="mt-4">
            <Streifen ton="achtung" symbol={<FileCheck2 className="h-4 w-4" />}>
              Gerechnet mit {prozent(s.erhoeht.satz)} Prozent Abschreibung.{" "}
              <span className="font-semibold">
                Das setzt ein Gutachten zur Nutzungsdauer voraus.
              </span>{" "}
              Ohne Gutachten gilt der gesetzliche Satz von {prozent(s.regulaer.satz)} Prozent, dann
              sind es <span className="font-semibold">{eur(s.jahr1.von)}</span> im ersten Jahr und{" "}
              <span className="font-semibold">{eur(s.zehnJahre.von)}</span> über{" "}
              {BETRACHTUNG_JAHRE} Jahre.
            </Streifen>
          </div>

          <div aria-hidden="true" className="mt-7 h-px w-full bg-primary/15" />

          {/* Ohne das Wort „Steuerersparnis“ stand hier eine nackte Zahl neben
              dem Wort „einmalig“, und man konnte sie fuer den Aufwand selbst
              halten oder fuer eine Auszahlung. */}
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-success/35 bg-success/10 px-4 py-2 text-sm text-foreground">
            <TrendingUp aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
            <span>
              Dazu im ersten Jahr einmalig bis zu{" "}
              <span className="font-semibold">{eur(s.erhaltung.ersparnisEinmalig)}</span>{" "}
              Steuerersparnis aus Erhaltungsaufwand
            </span>
          </p>

          {/*
            Die drei Zahlen, die das Bild ehrlich halten. Der monatliche
            Eigenanteil steht bewusst HIER oben und nicht im Kleingedruckten:
            Er ist die erste Frage jedes Kunden, und wer ihn erst nach der
            grossen Zahl findet, misstraut der grossen Zahl.
          */}
          {/*
            Drei Zahlen, zwei davon getoent.

            Die heutige Steuerlast bleibt bewusst ruhig: Sie ist Zusammenhang,
            kein Versprechen und keine Bedingung. Die monatliche Zuzahlung
            bekommt den Achtung-Ton und dieselbe Flaeche wie die guten Zahlen,
            damit sie nicht zwischen ihnen verschwindet. Das Ergebnis unter dem
            Strich bekommt den guten Ton, denn es ist die Antwort auf die Frage,
            um die es geht.

            Das Vorzeichen steht jeweils im Betrag und in der Beschriftung, die
            Farbe traegt also nichts allein.
          */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-primary/15 bg-background/40 p-4 sm:p-5">
              <Kennzahl
                bezeichnung="Heute führst du ab"
                wert={eur(r.vorher.summe)}
                einheit="Steuern im Jahr"
              />
            </div>
            {monatEigenanteil < 0 ? (
              <Grossflaeche
                ton="achtung"
                symbol={<ArrowDownRight className="h-4 w-4" />}
                bezeichnung="Du zahlst monatlich zu"
                wert={-Math.abs(monatEigenanteil)}
                einheit={`nach Steuervorteil, ohne Gutachten ${eur(
                  Math.abs(monatEigenanteilSicher),
                )}`}
                aktiv={erstmalig}
              />
            ) : (
              <Grossflaeche
                ton="gut"
                symbol={<TrendingUp className="h-4 w-4" />}
                bezeichnung="Dir bleibt monatlich"
                wert={monatEigenanteil}
                einheit={`Überschuss statt Zuzahlung, ohne Gutachten ${eur(
                  monatEigenanteilSicher,
                )}`}
                aktiv={erstmalig}
              />
            )}
            <Grossflaeche
              ton="gut"
              symbol={<Wallet className="h-4 w-4" />}
              bezeichnung={`Unter dem Strich nach ${BETRACHTUNG_JAHRE} Jahren`}
              wert={s.vermoegen.netto}
              einheit="alles verrechnet"
              aktiv={erstmalig}
            />
          </div>

          <p className="mt-5 max-w-xl text-xs leading-relaxed text-foreground">
            {monatEigenanteil < 0 ? (
              <>
                Die {eur(Math.abs(monatEigenanteil))} im Monat sind kein verlorenes Geld. Sie gehen in
                die Tilgung, also in deinen eigenen Anteil an der Wohnung. Aus{" "}
                {eur(Math.abs(s.vermoegen.liquiditaet))} Zuzahlung über {BETRACHTUNG_JAHRE} Jahre und{" "}
                {eur(s.vermoegen.eigenkapital)} Einsatz beim Kauf werden{" "}
                {eur(s.vermoegen.aufbau)} Vermögen.
              </>
            ) : (
              <>
                Die Wohnung trägt sich im Modell aus sich selbst. Dein Einsatz bleiben die{" "}
                {eur(s.vermoegen.eigenkapital)} Kaufnebenkosten.
              </>
            )}{" "}
            Alle Werte beruhen auf den Modellannahmen weiter unten.
          </p>
        </div>
      </div>

      {/*
        Der Haftungshinweis steht sichtbar hier und nicht im Kleingedruckten.
        Er ist bewusst NICHT leiser geworden, sondern lauter: Er sitzt jetzt
        direkt ueber dem Handlungsknopf, traegt die Warnfarbe des Systems und
        einen fetten ersten Satz. Wer gleich seine Daten hinterlaesst, soll
        vorher gelesen haben, was diese Zahlen sind und was nicht.
      */}
      {/*
        Der Haftungshinweis darf zwischen den neuen getoenten Flaechen nicht
        untergehen. Er traegt deshalb als einziger Kasten der Seite einen
        vollen, kraeftigeren Rand und das Warndreieck, und er steht allein
        zwischen Kopfbereich und erster Karte. Fruehere Toenung war /5 und
        /30, also leiser als die neuen Flaechen. Jetzt ist er der lauteste.
      */}
      <Alert className="border-2 border-warning/50 bg-warning/10">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertDescription className="text-xs leading-relaxed text-foreground">
          <span className="font-semibold">
            Das ist eine Modellrechnung und keine Steuerberatung.
          </span>{" "}
          Sie zeigt eine Größenordnung für deinen Fall, ersetzt aber keine individuelle Steuer- oder
          Anlageberatung.
        </AlertDescription>
      </Alert>

      {/*
        6 Was nach zehn Jahren uebrig bleibt.

        Diese Karte ist neu und ersetzt zwei Stellen, die sich widersprochen
        haben: eine monatliche Zuzahlung in der Beispielrechnung und eine „frei
        verfuegbare Liquiditaet“ mit umgekehrtem Vorzeichen zwei Karten weiter.

        Sie trennt drei Dinge, die vorher in einer Summe lagen:
          Vermoegensaufbau   Eigentum, das entsteht. Tilgung und Wertzuwachs.
          Liquiditaet        Geld, das fliesst. Hier negativ, du zahlst zu.
          Einsatz            Die Kaufnebenkosten, sofort faellig.
        Erst darunter steht die Summe. Wer nur die Summe zeigt, verbirgt, dass
        drei sehr verschiedene Dinge darin stecken.
      */}
      <div data-ui="card" className="rounded-2xl border border-border bg-card p-6 shadow-apple-xs">
        <h3 className="text-base font-semibold text-foreground">
          Was nach {BETRACHTUNG_JAHRE} Jahren übrig bleibt
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Drei Größen, bewusst getrennt: was an Eigentum entsteht, was du dafür einzahlst, und was
          du beim Kauf einsetzt.
        </p>

        <div className="mt-5">
          <Zeile
            text="Getilgte Schulden"
            wert={`+ ${eur(s.vermoegen.tilgung)}`}
            hinweis="Der Teil deiner Rate, der in dein Eigentum wandert"
          />
          <Zeile
            text="Wertzuwachs"
            wert={`+ ${eur(s.vermoegen.wertsteigerung)}`}
            hinweis="Modellannahme auf den Kaufpreis, keine Zusage"
          />
          {/* Drei getoente Zeilen, und nur drei: die Zwischensumme des Aufbaus,
              das, was dafuer aus der eigenen Tasche kommt, und die Endsumme.
              Die Einzelposten daruber bleiben ruhig, sonst waere die ganze
              Aufstellung bunt und nichts mehr hervorgehoben. */}
          <Zeile text="Dein Vermögensaufbau" wert={eur(s.vermoegen.aufbau)} ton="gut" />
          <Zeile
            text={`Deine Zuzahlung über ${BETRACHTUNG_JAHRE} Jahre`}
            wert={`${s.vermoegen.liquiditaet < 0 ? "- " : "+ "}${eur(Math.abs(s.vermoegen.liquiditaet))}`}
            hinweis={`Miete minus Zins, Tilgung und laufende Kosten. Die Steuerersparnis von ${eur(s.vermoegen.ersparnis)} ist darin schon gegengerechnet.`}
            ton={s.vermoegen.liquiditaet < 0 ? "achtung" : "gut"}
          />
          <Zeile
            text="Dein Einsatz beim Kauf"
            wert={`- ${eur(s.vermoegen.eigenkapital)}`}
            hinweis={`Kaufnebenkosten, ${prozent(r.nebenkostenProzent)} Prozent, Höchstsatz, sofort fällig`}
            ton="achtung"
          />
          <Zeile text="Unter dem Strich" wert={eur(s.vermoegen.netto)} ton="gut" />
        </div>

        <p className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-xs leading-relaxed text-foreground">
          <span className="font-medium">Die Zuzahlung ist der Preis des Vermögensaufbaus.</span> Sie
          ist kein verlorenes Geld: Der größte Teil davon ist Tilgung und steht auf der anderen
          Seite wieder als Eigentum. Nach {BETRACHTUNG_JAHRE} Jahren stehen noch{" "}
          {eur(s.vermoegen.restschuld)} Restschuld offen, und genau deshalb zählt hier auch nur der
          getilgte Teil als Vermögen.
        </p>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Der Erhaltungsaufwand ist hier bewusst nicht mitgerechnet. Er kommt im ersten Jahr mit bis
          zu {eur(s.erhaltung.ersparnisEinmalig)} zur laufenden Ersparnis hinzu, in den Jahren danach
          aber nicht mehr, und er setzt voraus, dass tatsächlich saniert wird.
        </p>
      </div>

      {/*
        6b Der Weg mit Gutachten, jetzt als Aufschlag und nicht mehr als
        Hauptaussage.

        Er stand bis zum 17.09.2026 ganz oben als oberes Ende einer Messlatte,
        und diese Messlatte war das Bild der ganzen Seite. Getragen hat sie eine
        Nutzungsdauer von 25 Jahren, also die Haelfte der 50 Jahre, die das
        Gesetz unterstellt. Das gibt es nur mit Gutachten, und eine Zahl mit
        dieser Bedingung ist kein Aufmacher.
      */}
      <div data-ui="card" className="rounded-2xl border border-border bg-card p-6 shadow-apple-xs">
        <h3 className="text-base font-semibold text-foreground">
          Was ohne Gutachten übrig bleibt
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Dasselbe Objekt, dieselbe Miete, derselbe Zins. Der Unterschied liegt allein im
          Abschreibungssatz. Links steht, was jeder ohne Nachweis bekommt, rechts der Wert, mit dem
          diese Seite oben rechnet.
        </p>

        <div className="mt-6">
          <Messlatte
            von={s.zehnJahre.von}
            bis={s.zehnJahre.bis}
            vonBezeichnung={`Abgesichert: ${prozent(s.regulaer.satz)} Prozent, gesetzlich, ohne Nachweis`}
            bisBezeichnung={`Angesetzt: ${prozent(s.erhoeht.satz)} Prozent, nur mit Gutachten`}
            aktiv={erstmalig}
            zahlKlasse="text-2xl font-semibold tracking-tight"
          />
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Der offene Teil der Latte ist der ganze Unterschied, nämlich{" "}
          {eur(s.zehnJahre.bis - s.zehnJahre.von)} über die {BETRACHTUNG_JAHRE} Jahre, das sind{" "}
          {eur(s.mehrProJahr)} im ersten Jahr. Er hängt allein am Gutachten zur Nutzungsdauer: Es
          kostet Geld, das Finanzamt entscheidet im Einzelfall, ob es ihm folgt, und ob dein Objekt
          überhaupt unter die {s.nutzungsdauerGesetzlich} Jahre des Gesetzes kommt, weiss vorher
          niemand. Der gefüllte Teil ist das, was du in jedem Fall bekommst.
        </p>
      </div>

      {/*
        7 Verlauf, jaehrliche Stuetzstellen ab Jahr 1.

        Vier Aenderungen gegenueber der ersten Fassung, jede mit einem Grund:

        1  Das Gitter ist ein durchgezogener Haarstrich statt gestrichelt. Eine
           gestrichelte Linie liest sich als Schaetzung oder Schwelle, und das
           Gitter ist weder das eine noch das andere.
        2  Gestrichelt ist jetzt die OBERE Linie, und das traegt eine Aussage:
           Sie setzt ein Gutachten voraus. Vorher war die untere gestrichelt,
           also ausgerechnet die, die sicher ist.
        3  Es sitzt nicht mehr auf jedem Jahr ein Punkt, sondern nur noch am
           Ende. Ein Punkt auf jeder Stuetzstelle ist Tinte ohne Angabe.
        4  Die beiden Endwerte stehen als Beschriftung unter der Grafik, dazu
           die Tabelle zum Aufklappen. Auf dem Handy gibt es kein Ueberfahren
           mit der Maus, ein Wert, den nur ein Tooltip zeigt, ist dort kein
           Wert.

        Die Farben sind zwei Schritte einer Blaureihe, nicht zwei Farben: Hier
        stehen nicht zwei Dinge nebeneinander, sondern ein Weniger und ein Mehr
        derselben Sache.
      */}
      <div data-ui="card" className="rounded-2xl border border-border bg-card p-6 shadow-apple-xs">
        <h3 className="text-base font-semibold text-foreground">Jahr für Jahr</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Jede Stufe ist ein Jahr, die Fläche dazwischen ist deine Spanne. Sie fällt leicht, weil der
          abziehbare Zins mit der Tilgung sinkt. Über {BETRACHTUNG_JAHRE} Jahre hinaus rechnet diese
          Grafik bewusst nicht.
        </p>
        <div className="mt-5 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={verlaufsdaten} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="jahr"
                tickFormatter={(v) => `J${v}`}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
              />
              <YAxis
                tickFormatter={tsd}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip
                formatter={(wert: number | number[], name: string) =>
                  Array.isArray(wert)
                    ? [`${eur(wert[0])} bis ${eur(wert[1])}`, name]
                    : [eur(wert), name]
                }
                labelFormatter={(v) => `Bis Jahr ${v}`}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  fontSize: 12,
                }}
              />
              <Area
                dataKey="korridor"
                name="Deine Spanne"
                stroke="none"
                fill="hsl(var(--chart-b2b))"
                fillOpacity={0.1}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="bisKumuliert"
                name="Mit Gutachten"
                stroke="hsl(var(--chart-b2b))"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="vonKumuliert"
                name="Ohne Gutachten"
                stroke="hsl(var(--chart-b2c))"
                strokeWidth={2}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legende und Endwerte in einem: Die Zuordnung haengt nicht an der
            Farbe allein, und der Wert nach zehn Jahren steht direkt daneben. */}
        <ul className="mt-4 space-y-2">
          <li className="flex items-baseline justify-between gap-4 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-foreground">
              <span
                aria-hidden="true"
                className="h-0.5 w-5 shrink-0 rounded-full bg-chart-b2c"
              />
              Reguläre Abschreibung
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {eur(s.zehnJahre.von)}
            </span>
          </li>
          <li className="flex items-baseline justify-between gap-4 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-foreground">
              <span
                aria-hidden="true"
                className="h-0.5 w-5 shrink-0 rounded-full bg-[repeating-linear-gradient(to_right,hsl(var(--chart-b2b))_0_5px,transparent_5px_9px)]"
              />
              Mit Gutachten
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {eur(s.zehnJahre.bis)}
            </span>
          </li>
        </ul>

        {/* Die Grafik zum Nachlesen. Jeder Wert der Kurve steht auch als Zahl
            da, nicht nur unter dem Mauszeiger. */}
        <Accordion type="single" collapsible className="mt-4 border-t border-border">
          <AccordionItem value="tabelle" className="border-b-0">
            <AccordionTrigger className="py-3 text-xs font-medium text-muted-foreground hover:no-underline">
              Die Zahlen dazu
            </AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Jahr
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        Ohne Gutachten
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Mit Gutachten
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {verlauf.map((z) => (
                      <tr key={z.jahr} className="border-b border-border last:border-b-0">
                        <td className="py-2 pr-3 text-muted-foreground">Bis Jahr {z.jahr}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                          {eur(z.vonKumuliert)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-foreground">
                          {eur(z.bisKumuliert)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/*
        8 Die Beispielrechnung.

        Sie steht NACH der Spanne und den Grafiken und ist sichtbar als
        Beispiel ausgezeichnet. Der Grund fuer die Reihenfolge: Oben steht das
        Ergebnis zu den eigenen Angaben, hier steht der Rechenweg dahinter.
        Umgekehrt haette man erst ein fremdes Beispiel gelesen und danach
        gefragt, was davon fuer einen selbst gilt.
      */}
      <SteuerMusterrechnung ergebnis={r} onHandlung={onHandlung} handlungText={handlungText} />

      <details className="steuer-details"><summary>Abschreibung, Erhaltungsaufwand und Finanzierung</summary><div className="space-y-6 pt-5">      {/*
        3 Die drei Posten.

        Vorher eine Tabelle: links ein Fliesstext mit Satz, Betrag, Paragraf und
        Bedingung in einem Zug, rechts eine kleine Zahl. Man las alles oder
        nichts. Jetzt traegt jede Zeile drei getrennte Ebenen, und jede tut
        genau eine Sache: die Marke sagt, wo der Posten in der Spanne liegt, die
        Grundlage sagt, woraus er sich rechnet, die Bedingung sagt, was er
        voraussetzt. Der Betrag steht gross und ist der Anker der Zeile.
      */}
      <div data-ui="card" className="overflow-hidden rounded-2xl border border-border bg-card shadow-apple-xs">
        {posten.map((p, i) => (
          <div
            key={p.titel}
            className={`px-5 py-4 ${i > 0 ? "border-t border-border" : ""}`}
          >
            {/* Zwei ausgerichtete Zeilen zuerst, danach die Erlaeuterung. Der
                Betrag steht damit auf jeder Bildschirmbreite oben und rechts,
                also dort, wo das Auge in einer Aufstellung danach sucht. Eine
                Spalte, die erst ab Tablet neben den Text rutscht, laesst ihn auf
                dem Handy unter der Erklaerung liegen, und dort findet ihn
                niemand. */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {p.rang}
              </span>
              <span className="shrink-0 text-xl font-semibold tabular-nums leading-none text-foreground">
                {p.betrag}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">{p.titel}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{p.zusatz}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{p.grundlage}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">{p.bedingung}</p>
          </div>
        ))}
      </div>

      {/* 4 Was hinter den Posten steht */}
      <Hintergrund ergebnis={r} />

</div></details>
      </div><aside className="steuer-result-sidebar">      {/* 2 Eingaben, anklickbar und live neu gerechnet */}
      <div data-ui="card" className="rounded-2xl border border-border bg-card p-5 shadow-apple-xs">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Deine Angaben
        </p>
        <div aria-hidden="true" className="mt-2.5 h-px w-full bg-border" />
        <p className="mt-3 text-xs text-muted-foreground">
          Tippe darauf, um sie zu ändern, das Ergebnis rechnet sofort neu.
        </p>
        {/* Mindestens 36 Pixel hoch: Die Chips sind auf dem Handy echte
            Bedienelemente und nicht nur eine Zusammenfassung zum Lesen. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOffen(offen === c.id ? null : c.id)}
              aria-expanded={offen === c.id}
              className={`inline-flex min-h-[3rem] items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                offen === c.id
                  ? "border-primary bg-accent text-accent-foreground shadow-apple-xs"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <Pencil className="h-3 w-3 shrink-0" aria-hidden="true" />
              {c.text}
            </button>
          ))}
        </div>
        {offen && (
          <div className="steuer-eintritt mt-5 border-t border-border pt-5">{feld(offen)}</div>
        )}
      </div>

<p className="px-5 text-sm text-muted-foreground">Deine persönliche Auswertung bekommst du als PDF per E-Mail, dein Ansprechpartner geht sie mit dir durch.</p><Handlungsknopf onClick={onHandlung} text={handlungText} /></aside></div>


      {/* 9 Das Kleingedruckte */}
      <details className="steuer-details text-sm leading-relaxed text-muted-foreground">
        <summary>Annahmen und Grenzen dieser Rechnung</summary>
        <p className="mt-2">
          Vereinfachte Modellrechnung nach § 32a EStG, Stand 2026. Angesetzt sind die Pauschbeträge
          für Werbungskosten und Sonderausgaben sowie die abziehbaren Vorsorgeaufwendungen, dazu
          typisierte Annahmen zu Sozialabgaben, Objektwert, Zins, Miete und Abschreibung. Kindergeld
          und die Günstigerprüfung dazu bleiben außen vor. Gerechnet ist mit einem zu versteuernden
          Einkommen von {eur(r.zvEHeute)} und einem Grenzsteuersatz von{" "}
          {prozent(r.grenzsteuersatz * 100)} Prozent. Die Kaufnebenkosten sind mit{" "}
          {prozent(r.nebenkostenProzent)} Prozent angesetzt, dem höchsten Satz in Deutschland aus
          Grunderwerbsteuer, Notar und Grundbuch. Je nach Bundesland, in dem die Wohnung liegt,
          weicht er nur nach unten ab. Die Kirchensteuer richtet sich dagegen nach deinem
          Wohnsitz. Ohne Angabe rechnen wir mit 9 Prozent, also dem höheren der beiden Sätze.
          {r.bereitsGenutzt > 0 && (
            <>
              {" "}
              <span className="font-medium text-foreground">
                Deine bestehenden Objekte sind darin schon berücksichtigt.
              </span>{" "}
              Aus deinem Gehalt ergibt sich ein zu versteuerndes Einkommen von {eur(r.zvE)}. Davon
              abgezogen sind {eur(r.bereitsGenutzt)}, nämlich der Verlust, den{" "}
              {antworten.bestehendeImmobilien}{" "}
              {antworten.bestehendeImmobilien === 1 ? "Objekt" : "Objekte"} dieser Größenordnung
              heute schon erzeugen. Deshalb fällt deine Ersparnis aus der nächsten Wohnung kleiner
              aus als bei jemandem, der noch keine hat.
            </>
          )}
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Das Objekt ist typisiert.</span> Angesetzt
          ist eine gebrauchte, vermietete Eigentumswohnung zu {eur(s.objekt.preis)}, das ist das
          Vierfache deines Jahresbruttos, begrenzt auf 180.000 bis 600.000 Euro. Gebäudeanteil{" "}
          {Math.round(s.objekt.gebaeudeanteil * 100)} Prozent, also {eur(s.objekt.gebaeudewert)},
          Fertigstellung {s.objekt.baujahr}, Mischzins{" "}
          {prozent(s.objekt.zins * 100, 2)} Prozent, Bruttomietrendite{" "}
          {prozent(s.objekt.mietrendite * 100)} Prozent, also {eur(s.objekt.kaltmieteSoll)} Kaltmiete
          im Jahr. Der Gebäudeanteil ist eine Annahme und hängt in Wahrheit am Bodenrichtwert
          deiner Lage. Ein konkretes Objekt ist damit nicht gemeint und wird auch nicht empfohlen.
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Was der Vermieter trägt.</span> Vom
          Mietsoll gehen {eur(s.objekt.mietausfall)} Mietausfallwagnis ab, das sind zwei Prozent
          nach § 29 II. BV. Als nicht umlagefähige Kosten sind{" "}
          {eur(s.objekt.verwaltung)} Verwaltung im Jahr angesetzt, also rund 30 Euro im Monat, dazu{" "}
          {eur(s.objekt.ruecklage)} Instandhaltungsrücklage, nämlich 0,5 Prozent des Gebäudewerts,
          zusammen {eur(s.objekt.nebenkosten)} im Jahr. Die Rücklage ist steuerlich streng genommen
          erst abziehbar, wenn sie verbaut wird. Das Modell behandelt sie vereinfachend als
          laufenden Aufwand, weil sie über die Jahre auch verbaut wird. Eine Mietanpassung kennt
          dieses Modell nicht, die Miete bleibt rechnerisch gleich.
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">
            Gerechnet wird mit {prozent(s.erhoeht.satz)} Prozent Abschreibung.
          </span>{" "}
          Das entspricht einer Nutzungsdauer von {s.erhoeht.restnutzungsdauer} Jahren und setzt
          voraus, dass du eine kürzere tatsächliche Nutzungsdauer nachweist (§ 7 Abs. 4 Satz 2
          EStG). Der gesetzliche Satz ohne jeden Nachweis sind {prozent(s.regulaer.satz)} Prozent
          nach {s.regulaer.paragraf}, und mit ihm sind es {eur(s.zehnJahre.von)} statt{" "}
          {eur(s.zehnJahre.bis)} über {BETRACHTUNG_JAHRE} Jahre. Beide Zahlen stehen oben.
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Was der Nachweis leisten müsste.</span> Die{" "}
          {prozent(s.regulaer.satz)} Prozent des Gesetzes stehen für eine Nutzungsdauer von{" "}
          {s.nutzungsdauerGesetzlich} Jahren, so nennt § 7 Abs. 4 Satz 2 EStG die Zahl selbst. Erst
          wenn die tatsächliche Nutzungsdauer darunter liegt, ist überhaupt mehr möglich. Die
          angesetzten {s.erhoeht.restnutzungsdauer} Jahre liegen deutlich darunter, und genau diesen
          Abstand muss ein Gutachten am konkreten Gebäude belegen. Eine Restnutzungsdauer, die allein aus dem Modell der ImmoWertV abgeleitet ist,
          genügt dafür nicht. Dieses Modell dient der Wertermittlung, es ersetzt keinen Befund am
          Haus. Das ist der Grund, warum das obere Ende hier nirgends als sicher dargestellt wird.
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Über {BETRACHTUNG_JAHRE} Jahre</span> ist
          nicht das Zehnfache des ersten Jahres angesetzt, sondern das{" "}
          {prozent(s.faktor10J, 2)}-fache. Diese Zahl ist nicht gesetzt, sondern das Ergebnis der
          Rechnung: Die Tilgung senkt die Restschuld von {eur(s.objekt.preis)} auf{" "}
          {eur(s.vermoegen.restschuld)}, damit sinken die abziehbaren Zinsen, damit der Verlust und
          damit die Ersparnis. Jedes der zehn Jahre ist einzeln gerechnet, die Tabelle oben zeigt
          sie alle.
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Nicht die ganze Ersparnis ist freies
          Geld.</span> Im Modell trägt sich die Wohnung nicht aus sich selbst, über{" "}
          {BETRACHTUNG_JAHRE} Jahre bleibt eine Zuzahlung von{" "}
          {eur(Math.abs(s.vermoegen.liquiditaet))}, die Steuerersparnis ist darin bereits
          gegengerechnet. Dazu kommt dein eigener Einsatz, nämlich die Kaufnebenkosten von{" "}
          {prozent(r.nebenkostenProzent)} Prozent, also Grunderwerbsteuer, Notar und Grundbuch.
          Gerechnet ist der höchste Satz in Deutschland, weil die Grunderwerbsteuer an der Lage
          der Wohnung hängt und die hier noch nicht feststeht. Je nach Bundesland, in dem du
          kaufst, weicht dieser Wert nur nach unten ab, dein Einsatz fällt dann kleiner aus. Der Kaufpreis selbst wird finanziert. Der Wertzuwachs ist eine Modellannahme
          und keine Zusage. Aussagen über {BETRACHTUNG_JAHRE} Jahre hinaus trifft der Rechner
          bewusst nicht. Deine tatsächlichen Werte können abweichen.
        </p>
      </details>
    </div>
  );
}

/**
 * Was hinter den drei Posten steht.
 *
 * Drei Dinge, die im Gespraech sonst fehlen: die Voraussetzung fuer das obere
 * Ende, die Natur des Erhaltungsaufwands und die Frage, was das
 * Beschaeftigungsverhaeltnis ueberhaupt noch bedeutet. Es bedeutet nichts mehr
 * fuer die Steuer, sondern nur noch etwas fuer die Finanzierung, und genau das
 * steht hier.
 */
function Hintergrund({ ergebnis }: { ergebnis: Ergebnis }) {
  const s = ergebnis.spanne;
  /* Der Anteil, der vom Aufwand als Steuer zurueckkommt, und der Anteil, der
     vom laufenden Verlust zurueckkommt. Beide liegen UNTER dem
     Grenzsteuersatz, und genau das ist erklaerungsbeduerftig. */
  const erhaltungSatz =
    s.erhaltung.bruttoAufwand > 0
      ? (s.erhaltung.ersparnisEinmalig / s.erhaltung.bruttoAufwand) * 100
      : 0;
  return (
    <div className="space-y-6">
      <div data-ui="card" className="rounded-2xl border border-border bg-card p-6 shadow-apple-xs">
        <div className="flex items-start gap-3">
          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              Woran die {prozent(s.erhoeht.satz)} Prozent hängen
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Der Gesetzgeber gibt den Abschreibungssatz nach der Fertigstellung vor, bei einer
              Wohnung von {s.objekt.baujahr} sind das {prozent(s.regulaer.satz)} Prozent im Jahr
              ({s.regulaer.paragraf}). Dahinter steckt eine unterstellte Nutzungsdauer von{" "}
              {s.nutzungsdauerGesetzlich} Jahren. Diesen Satz bekommst du ohne jeden Nachweis. Wer
              belegt, dass die tatsächliche Nutzungsdauer kürzer ist als diese{" "}
              {s.nutzungsdauerGesetzlich} Jahre, darf schneller abschreiben (§ 7 Abs. 4 Satz 2
              EStG), hier mit {prozent(s.erhoeht.satz, 2)} Prozent bei{" "}
              {s.erhoeht.restnutzungsdauer} Jahren. Das ist der ganze Unterschied zwischen den
              beiden Wegen, nämlich {eur(s.mehrProJahr)} im Jahr.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                Was die {s.erhoeht.restnutzungsdauer} Jahre voraussetzen.
              </span>{" "}
              Ein Gutachten zum konkreten Gebäude, das die kürzere Nutzungsdauer nachvollziehbar
              herleitet, also aus Zustand, Bauweise und wirtschaftlicher Nutzbarkeit. Eine
              Restnutzungsdauer, die allein aus dem Modell der ImmoWertV abgeleitet ist, genügt
              dafür nicht: Das Modell dient der Wertermittlung und sagt über die Steuer nichts.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                Der Nachweis ist keine Formsache.
              </span>{" "}
              Das Gutachten kostet Geld, und ob das Finanzamt ihm folgt, entscheidet es im
              Einzelfall. Ohne dieses Gutachten gilt der gesetzliche Satz, also das untere Ende.
              Rechne deshalb mit dem unteren Ende und sieh das obere als das, was erreichbar ist.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Beides gibt es nur bei einem gebrauchten Gebäude. Bei einem eben erst errichteten ist
              eine tatsächliche Nutzungsdauer unter {s.nutzungsdauerGesetzlich} Jahren nicht zu
              begründen, ein Nachweis brächte also nichts. Deshalb rechnet diese Seite mit einer
              gebrauchten Eigentumswohnung.
            </p>
          </div>
        </div>

        {/* Der Erhaltungsaufwand, deutlich abgesetzt: er wirkt EINMAL. */}
        <div data-ui="card" className="mt-6 rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              Erhaltungsaufwand, einmalig im ersten Jahr
            </h4>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              bis zu {eur(s.erhaltung.ersparnisEinmalig)}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Wird eine gebrauchte Wohnung nach dem Kauf instand gesetzt, sind diese Kosten im Jahr
            der Zahlung in voller Höhe abziehbar. Die Grenze zieht § 6 Abs. 1 Nr. 1a EStG, und sie
            gilt für einen Zeitraum von <span className="font-medium text-foreground">drei
            Jahren</span> nach dem Kauf, nicht für ein einzelnes Jahr: Bleiben alle Instandsetzungen
            dieser drei Jahre zusammen unter 15 Prozent der Anschaffungskosten des Gebäudes, sind
            sie sofort abziehbarer Erhaltungsaufwand. Darüber werden sie zwingend zu
            Herstellungskosten und wirken nur noch über die Abschreibung.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Warum hier Abstand gehalten wird.</span>{" "}
            Die Grenze kennt keine Toleranz: Ein Euro darüber macht nicht nur den überschiessenden
            Teil zu Herstellungskosten, sondern alle Aufwendungen der drei Jahre. Deshalb rechnet
            diese Seite mit 90 Prozent der Grenze und nicht mit 100, also mit{" "}
            {eur(s.erhaltung.grenzeNetto)} netto und {eur(s.erhaltung.bruttoAufwand)} mit
            Umsatzsteuer, das sind {prozent(s.erhaltung.anteilProzent, 2)} Prozent des
            Gebäudeanteils. Die Umsatzsteuer zählt mit, weil ein Vermieter ohne Option zur
            Umsatzsteuer sie nicht zurückholen kann.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Angesetzt ist hier, dass der Aufwand im ersten Jahr anfällt und dort auch abgezogen
            wird. Das ist der Normalfall, aber nicht der einzige: Nach § 82b EStDV darfst du
            größeren Erhaltungsaufwand auf zwei bis fünf Jahre verteilen. Das lohnt sich, wenn
            dein Einkommen im ersten Jahr für einen so grossen Abzug zu klein ist, denn dann
            verpufft ein Teil davon. Welche Verteilung für dich günstiger ist, rechnet dein
            Steuerberater aus.
          </p>
          {/*
            Die Stelle, an der zweimal gestutzt wurde. Der Denkfehler ist immer
            derselbe: Aufwand und Steuer werden gleichgesetzt. Deshalb steht
            hier beides nebeneinander, dazu der Satz, der sie verbindet, und
            der Grund, warum es nicht der Grenzsteuersatz ist.
          */}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              Der Aufwand ist nicht die Ersparnis.
            </span>{" "}
            Du bezahlst die {eur(s.erhaltung.bruttoAufwand)} und ziehst sie in voller Höhe ab, aber
            abgezogen wird vom zu versteuernden{" "}
            <span className="font-medium text-foreground">Einkommen</span> und nicht von der Steuer.
            Zurück kommen
            deshalb {eur(s.erhaltung.ersparnisEinmalig)}, also {prozent(erhaltungSatz)} Prozent des
            Aufwands. Den Rest hast du wirklich ausgegeben, dafür ist die Wohnung instand gesetzt.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Warum nicht dein Grenzsteuersatz von {prozent(ergebnis.grenzsteuersatz * 100)} Prozent?
            Weil der nur für den obersten Euro gilt. Ein Abzug von{" "}
            {eur(s.erhaltung.bruttoAufwand)} zieht dein Einkommen ein gutes Stück nach unten, und
            auf diesem Weg sinkt der Steuersatz mit. Die {prozent(erhaltungSatz)} Prozent sind
            deshalb der Durchschnitt über den ganzen abgezogenen Bereich, nicht der Satz an seiner
            Oberkante.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Hier steht bewusst ein Höchstwert.</span>{" "}
            Eine Spanne wäre sinnlos, ihr unteres Ende wäre null: Fallen keine solchen Arbeiten an,
            entsteht auch kein Effekt. Was es gibt, ist die gesetzliche Obergrenze, und die steht
            hier. Die Ersparnis kommt im ersten Jahr zu den jährlichen Beträgen oben hinzu, in den
            Jahren danach nicht mehr. Sie gehört also nicht mit zehn multipliziert.
          </p>
        </div>
      </div>

      <div data-ui="card" className="rounded-2xl border border-border bg-card p-6 shadow-apple-xs">
        <div className="flex items-start gap-3">
          <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              Was dein Beschäftigungsverhältnis bedeutet
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Für die Steuer nichts. Der Tarif nach § 32a EStG kennt keine Berufsgruppen, ein Euro
              zu versteuerndes Einkommen kostet den Selbstständigen genauso viel wie den Beamten.
              Deine Spanne oben ist deshalb dieselbe, egal was du angegeben hast.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Für die Finanzierung dagegen viel. {ergebnis.beschaeftigung.einschaetzung}{" "}
              {ergebnis.beschaeftigung.unterlagen} Je nach Haus kann außerdem mehr Eigenkapital
              nötig sein.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Das ist eine Annahme über die übliche Bankpraxis und kein Angebot. Was du
              tatsächlich bekommst, sagt dir erst eine konkrete Finanzierungsanfrage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Handlungsknopf({ onClick, text }: { onClick: () => void; text?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground shadow-apple-sm transition-all duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:scale-[0.995]"
    >
      {text || "Persönliche Auswertung anfordern"}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}
