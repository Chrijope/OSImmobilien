/**
 * Die Strecke des Steuerrechners: eine Seite, mehrere Ansichten.
 *
 * Kein Seitenwechsel, nur ein Umschalten. Oben der Fortschrittsbalken mit
 * gleich breiten Segmenten, darueber die Vertrauenszeile. Eine Frage je
 * Ansicht.
 *
 * OEFFENTLICH ENDET DIE STRECKE MIT DER KONTAKTABFRAGE. Das Ergebnis erscheint
 * dort GAR NICHT MEHR auf dem Bildschirm, es kommt als PDF per Mail.
 *
 * Der Weg dahin in zwei Stufen: Erst stand das Ergebnis sofort da und das
 * Formular darunter. Dann wanderte das Formular davor. Seit dem 17.09.2026
 * faellt die Anzeige des Ergebnisses oeffentlich ganz weg. Christian: „Er soll
 * diese dann nicht am Desktop sehen. Das soll ihn naemlich dazu animieren,
 * seine richtige E-Mail bei den Kontakten einzutragen und seine richtige
 * Telefonnummer.“ Eine Wegwerfadresse bringt dann eben keine Auswertung.
 *
 * DAS IST KEIN ZUGRIFFSSCHUTZ. Gerechnet wird im Browser des Besuchers, die
 * Zahlen liegen dort also ohnehin, und wer sie sehen will, findet sie. Das ist
 * in Ordnung: Es geht um die Qualitaet der Kontaktdaten und nicht um
 * Geheimhaltung. Wer hier eine Sicherheitsgrenze vermutet und Daten dahinter
 * legt, die niemand sehen soll, irrt sich.
 *
 * WEIL DAS ERGEBNIS NICHT MEHR ERSCHEINT, MUESSEN DIE ZUSAGEN MITWANDERN.
 * „Ergebnis direkt im Anschluss“ ist oeffentlich falsch geworden. Betroffen
 * sind die Pillen im Kopfbereich (`SteuerrechnerPublic`), die Vertrauenszeile
 * (`bausteine`), die Seitenleiste hier, die Texte im Formular und die haeufigen
 * Fragen (`SteuerHilfe`). Wer hier etwas aendert, geht diese Liste durch.
 *
 * INTERN WIRD DER SCHRITT UEBERSPRUNGEN. Im CRM probiert der Vertriebspartner
 * seinen eigenen Rechner aus, er soll sich nicht selbst als Lead eintragen.
 * Statt des Formulars steht dort ein Hinweis, dass an dieser Stelle in der
 * veroeffentlichten Fassung die Kontaktabfrage steht.
 *
 * Gerechnet wird ausschliesslich in `steuerRechner.ts`, uebersetzt in
 * `steuerrechnerStrecke.ts`. Diese Datei fuehrt nur Regie.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Info } from "lucide-react";
import { berechne } from "@/lib/steuerRechner";
import {
  schritte as alleSchritte,
  schrittBeantwortet,
  standardAntworten,
  zuEingaben,
  type SchrittId,
  type SteuerAntworten,
} from "@/lib/steuerrechnerStrecke";
import { protokolliereSteuerEreignis } from "@/lib/steuerrechnerEreignisse";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { STEUERRECHNER_TEXTE } from "@/components/steuerrechner/steuerrechnerTexte";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import AnsprechpartnerEinblender from "@/components/steuerrechner/AnsprechpartnerEinblender";
import SteuerErgebnis from "@/components/steuerrechner/SteuerErgebnis";
import SteuerFormular from "@/components/steuerrechner/SteuerFormular";
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
import { Fortschritt, Frage, Vertrauenszeile, Weiter } from "@/components/steuerrechner/bausteine";
import { Fusszeile, HaeufigeFragen, SoGehtEs } from "@/components/steuerrechner/SteuerHilfe";
// Die Strecke laeuft im CRM (dort rollt der Inhaltskasten) und auf der
// oeffentlichen Seite (dort rollt das Fenster). Die Helfer tragen beides.
import { halteNachDemZeichnenImBlick, rolleSeiteNachOben } from "@/lib/rollen";
import type { BeraterInfo } from "@/pages/AnalysePublic";

/**
 * Welche Fassung laeuft hier?
 *
 *   "oeffentlich"  Die Seite unter /steuer. Nach der letzten Frage kommt die
 *                  Kontaktabfrage, und dort endet die Strecke. Die Auswertung
 *                  geht als PDF per Mail, das Ergebnis erscheint nicht.
 *   "intern"       Die Seite unter /steuerrechner im CRM. Die Kontaktabfrage
 *                  wird uebersprungen, an ihrer Stelle steht ein Hinweis.
 *
 * Der Standard ist bewusst "oeffentlich": Wer die Angabe irgendwo vergisst,
 * bekommt die Kontaktabfrage, nicht den internen Durchgang.
 */
export type SteuerVariante = "oeffentlich" | "intern";

interface Props {
  berater?: BeraterInfo;
  variante?: SteuerVariante;
  /**
   * Nur intern: Hat die angemeldete Rolle einen eigenen Link? Das Backoffice
   * etwa probiert den Rechner aus, hat aber keinen, dann darf der Hinweis
   * nicht von "Deinem Link" sprechen.
   */
  eigenerLink?: boolean;
}

/*
 * Ueberschrift, Erklaerung und Knopfbeschriftung je Ansicht stehen seit
 * Etappe 6 in `steuerrechnerTexte.ts` unter `strecke.schritte`, in Deutsch und
 * Englisch. Du-Form, ruhig, ohne Werbesprache.
 *
 * `kurz` steht neben der Schrittzaehlung ueber der Karte. Eine Position allein
 * („Schritt 3 von 7“) sagt nur, wie weit es noch ist. Mit dem Stichwort daneben
 * sagt sie auch, worum es gerade geht, und der Balken traegt damit eine
 * Aussage statt nur einen Fortschritt.
 *
 * Zwei Saetze dort sind bewusst so gefasst: Die Beschaeftigung sagt NICHT mehr,
 * dass die Antwort das vorgeschlagene Objekt bestimmt (die Ergebnisseite legt
 * sich auf keinen Immobilientyp fest), und der Wohnsitz nennt NUR noch die
 * Kirchensteuer (die Grunderwerbsteuer haengt an der Lage der Wohnung, siehe
 * `WohnortFeld` und `zuEingaben`).
 *
 * Saetze, die es nur in der internen Fassung gibt, bleiben hier deutsch: Intern
 * gibt es keinen Sprach-Provider.
 */

type Ansicht = "fragen" | "kontakt" | "ergebnis";

export default function SteuerRechnerStrecke({ berater, variante = "oeffentlich", eigenerLink = true }: Props) {
  const intern = variante === "intern";
  const st = useSeitenTexte(STEUERRECHNER_TEXTE).strecke;
  const TEXTE = st.schritte;
  const [antworten, setAntworten] = useState<SteuerAntworten>(standardAntworten);
  const [index, setIndex] = useState(0);
  const [ansicht, setAnsicht] = useState<Ansicht>("fragen");
  /** Oeffentlich: Sind die Kontaktdaten abgeschickt? Dann endet die Strecke. */
  const [eingetragen, setEingetragen] = useState(false);
  /** Der Einblender mit dem Ansprechpartner, hinter „Wie es jetzt weitergeht“. */
  const [zeigeAnsprechpartner, setZeigeAnsprechpartner] = useState(false);
  /** Nur beim ersten Erscheinen zaehlen die Zahlen hoch. */
  const [erstmalig, setErstmalig] = useState(true);
  /**
   * Was der Bildschirmleser beim Schrittwechsel hoert.
   *
   * Leer beim ersten Aufbau, sonst laese er die Zaehlung schon beim Laden der
   * Seite vor. Gefuellt wird sie im selben Effekt, der den Fokus setzt.
   */
  const [ansage, setAnsage] = useState("");
  const formularRef = useRef<HTMLDivElement>(null);
  const fokusRef = useRef<HTMLDivElement>(null);
  /** Die Ueberschrift der laufenden Frage, Ziel des Fokus beim Wechsel. */
  const frageTitelRef = useRef<HTMLHeadingElement>(null);
  /** Der Fragenkasten samt Schrittzaehlung, Ziel der Notbremse beim Rollen. */
  const spalteRef = useRef<HTMLDivElement>(null);
  const ersteAnsicht = useRef(true);

  const schritte = useMemo(() => alleSchritte(antworten), [antworten]);
  const aktuell = schritte[Math.min(index, schritte.length - 1)];
  const ergebnis = useMemo(() => berechne(zuEingaben(antworten)), [antworten]);

  useEffect(() => {
    protokolliereSteuerEreignis("steuer_gestartet", berater?.userId);
  }, [berater?.userId]);

  const aendern = useCallback((teil: Partial<SteuerAntworten>) => {
    setAntworten((alt) => ({ ...alt, ...teil }));
    // Wer auf der Ergebnisseite etwas aendert, will die neue Zahl sehen und
    // nicht noch einmal zusehen, wie sie hochzaehlt.
    setErstmalig(false);
  }, []);

  const rechnenFertig = useCallback(() => {
    setAnsicht("ergebnis");
    setErstmalig(true);
    protokolliereSteuerEreignis("steuer_beendet", berater?.userId);
    rolleSeiteNachOben("auto");
  }, [berater?.userId]);

  /**
   * Der Schrittwechsel rollt NICHT mehr an den Seitenanfang.
   *
   * Christian am 17.09.2026: „wenn ich mich durchklicke, springt es sonst immer
   * nach oben und das nervt.“ Genau das tat `rolleSeiteNachOben` hier. Es war
   * einmal richtig gedacht, denn der Sprung zeigte, dass sich etwas geaendert
   * hat. Seit der Fragenkasten eine feste Mindesthoehe hat, steht der
   * Weiter-Knopf auf jedem Schritt an derselben Stelle: Wer einmal richtig
   * steht, muesste gar nicht mehr bewegt werden.
   *
   * An die Stelle des Sprungs treten drei Dinge:
   *   1  Der Fokus wandert auf die Ueberschrift der neuen Frage, siehe den
   *      Effekt weiter unten. Das ersetzt die Absicht des Sprungs fuer
   *      Tastatur und Vorleseprogramm.
   *   2  Eine stille Ansage nennt die neue Schrittnummer.
   *   3  `halteNachDemZeichnenImBlick` ist die Notbremse fuer den einen Fall,
   *      in dem Stehenbleiben falsch waere: Ist der naechste Schritt deutlich
   *      kuerzer, kann der Kasten aus dem Bild rutschen. Nur dann wird er
   *      sanft hereingeholt.
   */
  const bleibImBlick = () => halteNachDemZeichnenImBlick(() => spalteRef.current);

  const weiter = () => {
    if (index + 1 < schritte.length) {
      setIndex(index + 1);
      bleibImBlick();
      return;
    }
    // Nach der letzten Frage: oeffentlich die Kontaktabfrage, intern direkt
    // das Ergebnis.
    if (intern) {
      rechnenFertig();
      return;
    }
    setAnsicht("kontakt");
    protokolliereSteuerEreignis("eintragung_gesehen", berater?.userId);
    rolleSeiteNachOben("auto");
  };

  const zurueck = () => {
    if (index === 0) return;
    setIndex(index - 1);
    bleibImBlick();
  };

  /**
   * Zurueck aus der Kontaktabfrage in die letzte Frage.
   *
   * Wer bis hierher gekommen ist, hat acht Angaben gemacht. Sie bleiben alle
   * erhalten, sie liegen in `antworten` und werden nicht angefasst. Verloren
   * gehen nur die bereits getippten Kontaktdaten, und das ist gewollt: Sie
   * wurden nirgends gespeichert, es ging kein Lead und keine Einwilligung
   * hinaus.
   */
  const zurueckAusKontakt = () => {
    setAnsicht("fragen");
    setIndex(schritte.length - 1);
    bleibImBlick();
  };

  /**
   * Fokus und Ansage beim Wechsel.
   *
   * In der Fragenansicht sitzt der Fokus auf der Ueberschrift der neuen Frage.
   * Das ist die Stelle, an der der Inhalt sich geaendert hat, und ein
   * Vorleseprogramm liest sie damit vor. Auf den beiden anderen Ansichten
   * wechselt die ganze Seite, dort bleibt es beim Kasten darum herum.
   *
   * `preventScroll` ist Absicht: Der Fokus darf die Seite nicht verschieben,
   * sonst kaeme der Sprung durch die Hintertuer zurueck.
   *
   * Die Ansage nennt nur die Position. Was gefragt wird, sagt schon die
   * Ueberschrift, auf der der Fokus liegt.
   */
  useEffect(() => {
    if (ersteAnsicht.current) { ersteAnsicht.current = false; return; }
    if (ansicht === "fragen") {
      frageTitelRef.current?.focus({ preventScroll: true });
      const gesamt = schritte.length + (intern ? 0 : 1);
      setAnsage(st.ansage(index + 1, gesamt, TEXTE[schritte[index]]?.kurz ?? ""));
      return;
    }
    /* Kontakt und Ergebnis wechseln die ganze Seite und beginnen oben. Dort
       traegt der Fokus auf den Kasten selbst die Ansage, eine zusaetzliche
       Live-Region wuerde beim Ansichtswechsel ohnehin neu eingefuegt und
       gerade dann von den Vorleseprogrammen oft verschluckt. */
    fokusRef.current?.focus({ preventScroll: true });
    setAnsage("");
    // Die Texte haengen bewusst nicht mit dran: Ein Sprachwechsel ist kein
    // Schrittwechsel und soll weder den Fokus verschieben noch etwas ansagen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, ansicht, intern, schritte]);

  /**
   * „Wie es jetzt weitergeht“.
   *
   * Der Knopf rollte frueher nur zum Kasten ueber dem Ergebnis. Seit dem
   * 17.09.2026 oeffnet er einen Einblender, der sagt, wer sich meldet, und der
   * die Kontaktdaten dieses Ansprechpartners zeigt. Christian: „dass sich der
   * jeweilige Partner, eben angepasst an diesen Link, bei ihm melden wird“.
   */
  const zumAnsprechpartner = () => setZeigeAnsprechpartner(true);

  /* ── Die Kontaktabfrage, oeffentlich und nur dort ───────────────────────── */

  if (ansicht === "kontakt") {
    return (
      <div ref={fokusRef} tabIndex={-1} className="steuer-focus-region">
        <div className="steuer-schrittkasten">
          <Fortschritt schritt={schritte.length + 1} gesamt={schritte.length + 1} label={st.kontakt} />
        </div>
        <SteuerFormular
          antworten={antworten}
          ergebnis={ergebnis}
          berater={berater}
          vorErgebnis
          onAbgesendet={() => protokolliereSteuerEreignis("eintragung_abgesendet", berater?.userId)}
          /* KEIN `onWeiter` mehr. Oeffentlich endet die Strecke hier, das
             Ergebnis erscheint nicht mehr auf dem Bildschirm, es kommt als PDF
             per Mail. Ohne diese Angabe zeigt das Formular auch keinen Knopf
             „Ergebnis ansehen“ mehr. Siehe der Kopf dieser Datei. */
          onFertig={() => {
            setEingetragen(true);
            protokolliereSteuerEreignis("steuer_beendet", berater?.userId);
          }}
          onAnsprechpartner={zumAnsprechpartner}
        />
        <AnsprechpartnerEinblender
          offen={zeigeAnsprechpartner}
          onSchliessen={() => setZeigeAnsprechpartner(false)}
          berater={berater}
        />
        {/* Nach der Eintragung gibt es keinen Rueckweg mehr: Die Angaben sind
            abgeschickt, ein Klick auf „Eine Frage zurück“ wuerde nur ein
            zweites Mal durch dieselbe Strecke fuehren. */}
        {!eingetragen && (
          <button
            type="button"
            onClick={zurueckAusKontakt}
            className="mt-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {st.zurueck}
          </button>
        )}
        <div className="mt-8 space-y-6">
          <HaeufigeFragen beraterName={berater?.name} intern={intern} />
          <Fusszeile />
        </div>
      </div>
    );
  }

  /* ── Das Ergebnis ───────────────────────────────────────────────────────── */

  if (ansicht === "ergebnis") {
    return (
      <div ref={fokusRef} tabIndex={-1} className="steuer-focus-region">
        {/* Genau die Stelle, an der oeffentlich die Kontaktabfrage stand. */}
        <div ref={formularRef} className="scroll-mt-6">
          {intern ? (
            <Alert className="mb-6">
              <Info className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Hier steht in der veröffentlichten Fassung die Kontaktabfrage</AlertTitle>
              {eigenerLink ? (
                <AlertDescription>
                  Auf Deinem öffentlichen Link trägt der Interessent nach der letzten Frage Name,
                  E-Mail und Telefon ein und sieht erst danach das Ergebnis. Wer sich über Deinen
                  Link einträgt, erscheint bei Dir unter Alle Kontakte. Für Dich im CRM ist dieser
                  Schritt übersprungen, damit Du Dich beim Ausprobieren nicht selbst als Lead
                  anlegst.
                </AlertDescription>
              ) : (
                <AlertDescription>
                  Auf dem öffentlichen Link eines Vertriebspartners trägt der Interessent nach der
                  letzten Frage Name, E-Mail und Telefon ein und sieht erst danach das Ergebnis.
                  Für Dich im CRM ist dieser Schritt übersprungen, damit beim Ausprobieren kein
                  Lead entsteht.
                </AlertDescription>
              )}
            </Alert>
          ) : null}
        </div>
        <SteuerErgebnis
          antworten={antworten}
          aendern={aendern}
          erstmalig={erstmalig}
          onHandlung={zumAnsprechpartner}
          /* Auf dieser Seite ist nichts mehr anzufordern: Die Eintragung liegt
             schon dahinter, intern gibt es sie gar nicht. Der Knopf oeffnet
             deshalb den Einblender mit dem Ansprechpartner. Intern sieht der
             Vertriebspartner damit genau das, was sein Interessent sieht. */
          handlungText="Wie es jetzt weitergeht"
        />
        <AnsprechpartnerEinblender
          offen={zeigeAnsprechpartner}
          onSchliessen={() => setZeigeAnsprechpartner(false)}
          berater={berater}
        />
        {/* Auf der Ergebnisseite bleiben die Fragen und die Fusszeile stehen,
            "So einfach geht's" nicht: Schritt eins ist an dieser Stelle schon
            getan. */}
        <div className="mt-6 space-y-6">
          <HaeufigeFragen beraterName={berater?.name} intern={intern} />
          <Fusszeile />
        </div>
      </div>
    );
  }

  const text = TEXTE[aktuell];
  const feld = { antworten, aendern };
  const letzteFrage = index === schritte.length - 1;

  return (
    <>
      {/* `data-ui="card"` und `bg-card` machen den Arbeitsbereich im Liquid
          Glass zur Glaskarte. Die Flaeche selbst setzt weiter
          `steuerrechner.css`; `bg-card` ist derselbe Wert und nur das
          Erkennungszeichen fuer die Glasregel. */}
      <div data-ui="card" className="steuer-workspace bg-card">
        <aside className="steuer-navigation" aria-label={st.angabenTitel}>
          <h2>{st.angabenTitel}</h2>
          <ol>{schritte.map((id, i) => (
            <li key={id} aria-current={i === index ? "step" : undefined}>
              <span className="steuer-step-number">{i + 1}</span>{TEXTE[id].kurz}
            </li>
          ))}
          {/* Oeffentlich gehoert die Kontaktabfrage in die Liste. Sie ist ein
              Schritt der Strecke und keine Ueberraschung am Ende. */}
          {!intern && (
            <li>
              <span className="steuer-step-number">{schritte.length + 1}</span>{st.kontakt}
            </li>
          )}</ol>
          <p className="steuer-navigation-note">
            {intern ? "Ergebnis sofort" : st.navHinweisTitel}
          </p>
          <p>
            {intern ? "Deine Antworten kannst du im Ergebnis direkt ändern." : st.navHinweisText}
          </p>
        </aside>
        <div className="steuer-question-column" ref={spalteRef}>
          {/* Die stille Ansage des Schrittwechsels. Sie steht INNERHALB der
              Fragenansicht und bleibt dadurch von Schritt zu Schritt dasselbe
              Element. Eine Live-Region, die mit jedem Wechsel neu eingefuegt
              wird, sagen viele Vorleseprogramme gar nicht erst an. */}
          <p role="status" aria-live="polite" className="sr-only">
            {ansage}
          </p>
          {/* Die Schrittzaehlung steht in einem eigenen Kasten UEBER dem
              Fragenkasten. Vorher lag beides im selben Feld, und der Balken
              sah aus wie eine Zeile der Frage. Jetzt ist die Reihenfolge
              sichtbar: oben, wo man steht, darunter die Frage, danach das
              Ergebnis. */}
          <div className="steuer-schrittkasten">
            <Fortschritt
              schritt={index + 1}
              gesamt={schritte.length + (intern ? 0 : 1)}
              label={text.kurz}
            />
          </div>

      {/*
        Der Schluessel ist die Schritt-Kennung, nicht die Position.
        Das ist der ganze Trick am Uebergang: React wirft die alte Karte weg und
        setzt eine neue, und weil die neue frisch entsteht, laeuft ihre
        Eintritts-Animation. Stuende hier kein Schluessel, wuerde React dieselbe
        Karte weiterverwenden, nur mit neuem Text darin, und der Wechsel waere
        wieder ein Sprung. Wer reduzierte Bewegung eingestellt hat, sieht die
        neue Frage sofort und ohne Bewegung, den Rest erledigt die Regel in
        `index.css`.
      */}
      <Frage
        key={aktuell}
        titel={text.titel}
        titelRef={frageTitelRef}
        fuss={
          <Weiter disabled={!schrittBeantwortet(aktuell, antworten)} onClick={weiter}>
            {/* Auf der letzten Frage sagt der Knopf, was wirklich als
                Naechstes kommt: oeffentlich die Kontaktabfrage, intern sofort
                das Ergebnis. */}
            {letzteFrage && !intern ? st.weiterLetzter : text.knopf}
          </Weiter>
        }
      >
        <details className="steuer-mobile-help"><summary>{st.warumFragen}</summary><p>{text.hinweis}</p></details>
        {aktuell === "einkommen" && <EinkommenFeld {...feld} />}
        {aktuell === "beschaeftigung" && <BeschaeftigungFeld {...feld} />}
        {aktuell === "steuerklasse" && <SteuerklasseFeld {...feld} />}
        {aktuell === "partner" && <PartnerFeld {...feld} />}
        {aktuell === "kinder" && <KinderFeld {...feld} />}
        {aktuell === "wohnort" && <WohnortFeld {...feld} />}
        {aktuell === "bestand" && <BestandFeld {...feld} />}
        {aktuell === "zeitpunkt" && <ZeitpunktFeld {...feld} />}
      </Frage>

      {index > 0 && (
        // Mindestens 44 Pixel hoch, sonst ist der Rueckweg auf dem Handy mit
        // dem Daumen kaum zu treffen.
        <button
          type="button"
          onClick={zurueck}
          className="mt-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {st.zurueck}
        </button>
      )}

        </div>
        <aside className="steuer-context">
          <h2>{st.wozuTitel}</h2>
          <p>{text.hinweis}</p>
          <hr />
          <h2>{st.weiterTitel}</h2>
          <p>
            {intern
              ? "Angaben ergänzen und Ergebnis ansehen. Die Kontaktabfrage der veröffentlichten Fassung wird hier übersprungen."
              : st.weiterText}
          </p>
          <details><summary>{st.rechnungTitel}</summary><p>{st.rechnungText}</p></details>
        </aside>
      </div>
      <div className="mt-6"><Vertrauenszeile intern={intern} /></div>
      {/* Bleibt auf jedem Schritt stehen: Wer noch zoegert, findet die Antwort
          hier, ohne die begonnene Strecke verlassen zu muessen. */}
      <div className="mt-8 space-y-6">
        <SoGehtEs beraterName={berater?.name} intern={intern} />
        <HaeufigeFragen beraterName={berater?.name} intern={intern} />
        <Fusszeile />
      </div>
    </>
  );
}
